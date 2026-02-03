// EvaluateVoiceWithCharts.js
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { fileURLToPath } from 'url';

// --- Paths & __dirname fix ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Load .env from Backend ---
dotenv.config({ path: '/Users/oliviat/Documents/Uni/WS25_26/DBSM/Project/Backend/.env' });

// --- OpenAI Client ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
console.log("OpenAI API key loaded:", !!process.env.OPENAI_API_KEY);


// --- Folders & files ---
const AUDIO_FOLDER = path.join(__dirname); // audio_xx.wav files are here
const CSV_FILE = path.join(__dirname, 'annotations.csv');
const LOG_FILE = path.join(__dirname, 'new_output.log');
const PREDICTIONS_FILE = path.join(__dirname, 'predictions.csv');
const CHART_FILE = path.join(AUDIO_FOLDER, 'metrics_chart.png');

// --- Food vocabulary ---
const FOOD_VOCAB = ['apple','banana','pasta','cheese','chicken','rice','pizza','salad','bread','vegetables'];

// --- Redirect console logs to file (safe) ---
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const origConsoleLog = console.log;
console.log = (...args) => {
  origConsoleLog(...args);
  logStream.write(args.join(' ') + '\n');
};

// --- Load annotations CSV ---
function loadAnnotations(csvPath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        const items = row.ground_truth.split(',').map(i => i.trim());
        results.push({ audio_id: row.audio_id, ground_truth: items });
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// --- Whisper + LLM extraction ---
async function transcribeAndExtract(audioPath) {
  const transcriptionResp = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
  });
  const transcript = transcriptionResp.text;

  const prompt = `
Extract the food items from the following sentence.
Return them as a JSON array of strings.

Text: "${transcript}"
`;
  const llmResp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
  });

  let items;
  try {
    items = JSON.parse(llmResp.choices[0].message.content);
    if (!Array.isArray(items)) items = [];
  } catch {
    items = llmResp.choices[0].message.content.split(',').map(s => s.trim());
  }

  return { transcript, items };
}

// --- Compute micro metrics ---
function computeMetrics(yTrue, yPred, vocab) {
  const trueMatrix = yTrue.map(arr => vocab.map(f => arr.includes(f) ? 1 : 0));
  const predMatrix = yPred.map(arr => vocab.map(f => arr.includes(f) ? 1 : 0));

  const flatten = m => m.flat();
  const yT = flatten(trueMatrix);
  const yP = flatten(predMatrix);

  let TP=0, FP=0, FN=0;
  for (let i=0; i<yT.length; i++) {
    if (yP[i]===1 && yT[i]===1) TP++;
    if (yP[i]===1 && yT[i]===0) FP++;
    if (yP[i]===0 && yT[i]===1) FN++;
  }
  const precision = TP / (TP+FP || 1);
  const recall = TP / (TP+FN || 1);
  const f1 = 2*precision*recall / (precision+recall || 1);

  return { precision, recall, f1, trueMatrix, predMatrix };
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
    table.push({ food: vocab[i], precision, recall, f1 });
  }
  return table;
}

// --- Generate chart ---
async function generateChart(metrics) {
  const width = 600, height = 400;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: 'bar',
    data: {
      labels: ['Precision', 'Recall', 'F1'],
      datasets: [{
        label: 'Voice Recognition Metrics',
        data: [metrics.precision, metrics.recall, metrics.f1],
        backgroundColor: ['skyblue','lightgreen','salmon']
      }]
    },
    options: {
      scales: { y: { min: 0, max: 1 } },
      plugins: { legend: { display: false } }
    }
  };

  const image = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync(CHART_FILE, image);
}

// --- Main ---
async function main() {
  const annotations = await loadAnnotations(CSV_FILE);
  const yTrue = [];
  const yPred = [];
  const predictions = [];

  for (const row of annotations) {
    const audioPath = path.join(AUDIO_FOLDER, `${row.audio_id}.wav`);
    if (!fs.existsSync(audioPath)) {
      console.warn(`${audioPath} missing, skipping`);
      continue;
    }

    const { transcript, items } = await transcribeAndExtract(audioPath);
    console.log(`${row.audio_id} | GT=${row.ground_truth} | Pred=${items} | Transcript="${transcript}"`);

    yTrue.push(row.ground_truth);
    yPred.push(items);
    predictions.push({ audio_id: row.audio_id, ground_truth: row.ground_truth.join(','), predicted: items.join(','), transcript });
  }

  // --- Save predictions to CSV ---
  const predCsvHeader = 'audio_id,ground_truth,predicted,transcript\n';
  const predCsvContent = predictions.map(p => 
    `${p.audio_id},"${p.ground_truth}","${p.predicted}","${p.transcript.replace(/"/g,'""')}"`
  ).join('\n');
  fs.writeFileSync(PREDICTIONS_FILE, predCsvHeader + predCsvContent);
  console.log(`Predictions saved to ${PREDICTIONS_FILE}`);

  // --- Compute metrics ---
  const metrics = computeMetrics(yTrue, yPred, FOOD_VOCAB);
  console.log('\n--- Overall Metrics ---');
  console.log(`Precision: ${metrics.precision.toFixed(2)}`);
  console.log(`Recall:    ${metrics.recall.toFixed(2)}`);
  console.log(`F1-score:  ${metrics.f1.toFixed(2)}`);

  const foodTable = perFoodTable(metrics.trueMatrix, metrics.predMatrix, FOOD_VOCAB);
  console.log('\n--- Per-Food Metrics ---');
  console.table(foodTable);

  // --- Generate chart ---
  await generateChart(metrics);
  console.log(`Bar chart saved as metrics_chart.png in ${AUDIO_FOLDER}`);
}

main().catch(console.error);

