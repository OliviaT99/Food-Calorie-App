// EvaluateVoiceWithCharts.js
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { fileURLToPath } from 'url';
import axios from 'axios';

// --- Paths & __dirname fix ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Load .env ---
dotenv.config();

// --- YOUR FASTAPI URL ---
const FASTAPI_URL = process.env.FASTAPI_AUDIO_URL || 'http://127.0.0.1:5002/analyze-audio';
console.log("FastAPI Audio URL:", FASTAPI_URL);

// --- Folders & files ---
const AUDIO_FOLDER = path.join(__dirname, 'audio'); // audio_xx.wav files are here
const CSV_FILE = path.join(__dirname, 'audio', 'annotations.csv'); 
const LOG_FILE = path.join(__dirname, 'new_output.log');
const PREDICTIONS_FILE = path.join(__dirname, 'predictions.csv');
const CHART_FILE = path.join(__dirname, 'metrics_chart.png');

// --- Food vocabulary ---
const FOOD_VOCAB = ['apple','banana','pasta','cheese','chicken','rice','pizza','salad','bread','vegetables'];

// --- Redirect console logs to file (safe) ---
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const origConsoleLog = console.log;
console.log = (...args) => {
  const timestamp = new Date().toISOString();
  origConsoleLog(`[${timestamp}]`, ...args);
  logStream.write(`[${timestamp}] ${args.join(' ')}\n`);
};

// --- Load annotations CSV ---
function loadAnnotations(csvPath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        const items = row.ground_truth.split(',').map(i => i.trim().toLowerCase());
        results.push({ audio_id: row.audio_id, ground_truth: items });
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// --- Call YOUR FastAPI endpoint ---
async function transcribeAndExtract(audioPath) {
  console.log(`Calling FastAPI for: ${audioPath}`);
  
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('audio', fs.createReadStream(audioPath));

  try {
    const response = await axios.post(FASTAPI_URL, form, {
      headers: form.getHeaders(),
      timeout: 180000, // 3 minutes timeout
    });

    const { transcript, items } = response.data;
    
    // Normalize items to lowercase and clean
    const cleanedItems = (items || [])
      .map(item => item.name ? item.name.toLowerCase().trim() : '')
      .filter(name => name.length > 0);

    console.log(`  Transcript: "${transcript}"`);
    console.log(`  Extracted: ${cleanedItems.join(', ')}`);

    return { transcript, items: cleanedItems };
    
  } catch (error) {
    console.error(`ERROR processing ${audioPath}:`, error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    return { transcript: '', items: [] };
  }
}

// --- Compute micro metrics ---
function computeMetrics(yTrue, yPred, vocab) {
  const trueMatrix = yTrue.map(arr => vocab.map(f => arr.includes(f) ? 1 : 0));
  const predMatrix = yPred.map(arr => vocab.map(f => arr.includes(f) ? 1 : 0));

  const flatten = m => m.flat();
  const yT = flatten(trueMatrix);
  const yP = flatten(predMatrix);

  let TP=0, FP=0, FN=0, TN=0;
  for (let i=0; i<yT.length; i++) {
    if (yP[i]===1 && yT[i]===1) TP++;
    if (yP[i]===1 && yT[i]===0) FP++;
    if (yP[i]===0 && yT[i]===1) FN++;
    if (yP[i]===0 && yT[i]===0) TN++;
  }
  const precision = TP / (TP+FP || 1);
  const recall = TP / (TP+FN || 1);
  const f1 = 2*precision*recall / (precision+recall || 1);
  const accuracy = (TP+TN) / (TP+TN+FP+FN || 1);

  return { precision, recall, f1, accuracy, TP, FP, FN, TN, trueMatrix, predMatrix };
}

// --- Per-food table ---
function perFoodTable(trueMatrix, predMatrix, vocab) {
  const table = [];
  for (let i=0; i<vocab.length; i++) {
    let TP=0, FP=0, FN=0;
    for (let j=0; j<trueMatrix.length; j++) {
      if (predMatrix[j][i]===1 && trueMatrix[j][i]===1) TP++;
      if (predMatrix[j][i]===1 && trueMatrix[j][i]===0) FP++;
      if (predMatrix[j][i]===0 && trueMatrix[j][i]===1) FN++;
    }
    const precision = TP/(TP+FP||1);
    const recall = TP/(TP+FN||1);
    const f1 = 2*precision*recall/(precision+recall||1);
    table.push({ 
      food: vocab[i], 
      precision: precision.toFixed(3), 
      recall: recall.toFixed(3), 
      f1: f1.toFixed(3),
      TP, FP, FN
    });
  }
  return table;
}

// --- Generate chart ---
async function generateChart(metrics) {
  const width = 800, height = 500;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: 'bar',
    data: {
      labels: ['Precision', 'Recall', 'F1-Score', 'Accuracy'],
      datasets: [{
        label: 'Voice Recognition Metrics',
        data: [
          metrics.precision, 
          metrics.recall, 
          metrics.f1,
          metrics.accuracy
        ],
        backgroundColor: ['#3b82f6','#10b981','#f59e0b','#8b5cf6']
      }]
    },
    options: {
      scales: { y: { min: 0, max: 1 } },
      plugins: { 
        legend: { display: false },
        title: { display: true, text: 'Audio Analysis Performance Metrics' }
      }
    }
  };

  const image = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(CHART_FILE, image);
}

// --- Main ---
async function main() {
  console.log('=== Starting Audio Analysis Evaluation ===\n');
  
  const startTime = Date.now();
  
  const annotations = await loadAnnotations(CSV_FILE);
  console.log(`Loaded ${annotations.length} annotations from CSV\n`);
  
  const yTrue = [];
  const yPred = [];
  const predictions = [];

  for (let idx = 0; idx < annotations.length; idx++) {
    const row = annotations[idx];
    console.log(`\n[${idx + 1}/${annotations.length}] Processing ${row.audio_id}...`);
    
    const audioPath = path.join(AUDIO_FOLDER, `${row.audio_id}.wav`);
    if (!fs.existsSync(audioPath)) {
      console.warn(`  ⚠️  ${audioPath} missing, skipping`);
      continue;
    }

    const { transcript, items } = await transcribeAndExtract(audioPath);
    
    console.log(`  Ground Truth: ${row.ground_truth.join(', ')}`);
    console.log(`  Predicted: ${items.join(', ')}`);

    yTrue.push(row.ground_truth);
    yPred.push(items);
    predictions.push({ 
      audio_id: row.audio_id, 
      ground_truth: row.ground_truth.join(','), 
      predicted: items.join(','), 
      transcript 
    });
  }

  // --- Save predictions to CSV ---
  const predCsvHeader = 'audio_id,ground_truth,predicted,transcript\n';
  const predCsvContent = predictions.map(p => 
    `${p.audio_id},"${p.ground_truth}","${p.predicted}","${p.transcript.replace(/"/g,'""')}"`
  ).join('\n');
  fs.writeFileSync(PREDICTIONS_FILE, predCsvHeader + predCsvContent);
  console.log(`\n✅ Predictions saved to ${PREDICTIONS_FILE}`);

  // --- Compute metrics ---
  const metrics = computeMetrics(yTrue, yPred, FOOD_VOCAB);
  
  console.log('\n' + '='.repeat(50));
  console.log('--- OVERALL METRICS ---');
  console.log('='.repeat(50));
  console.log(`Precision: ${(metrics.precision * 100).toFixed(2)}%`);
  console.log(`Recall:    ${(metrics.recall * 100).toFixed(2)}%`);
  console.log(`F1-score:  ${(metrics.f1 * 100).toFixed(2)}%`);
  console.log(`Accuracy:  ${(metrics.accuracy * 100).toFixed(2)}%`);
  console.log(`\nConfusion Matrix:`);
  console.log(`  True Positives:  ${metrics.TP}`);
  console.log(`  False Positives: ${metrics.FP}`);
  console.log(`  False Negatives: ${metrics.FN}`);
  console.log(`  True Negatives:  ${metrics.TN}`);

  const foodTable = perFoodTable(metrics.trueMatrix, metrics.predMatrix, FOOD_VOCAB);
  console.log('\n' + '='.repeat(50));
  console.log('--- PER-FOOD METRICS ---');
  console.log('='.repeat(50));
  console.table(foodTable);

  // --- Generate chart ---
  await generateChart(metrics);
  console.log(`\n✅ Bar chart saved to ${CHART_FILE}`);

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
  console.log(`\n⏱️  Total evaluation time: ${duration} minutes`);
  console.log('\n=== Evaluation Complete ===');
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});