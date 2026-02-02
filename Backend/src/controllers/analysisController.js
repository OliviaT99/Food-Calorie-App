import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../config/db.js';
import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ML service URL
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT_MS = 30_000; // 30s timeout

// Helper: safely delete uploaded temp files
const safeUnlink = (filePath) => {
  fs.unlink(filePath, (err) => {
    if (err) console.warn('⚠️ Failed to delete temp file:', err.message);
  });
};

/**
 * Analyze food image using ML model
 * POST /api/analysis/analyze
 * Expects: multipart form-data with 'image' file, optional 'audio', and 'userId'
 */
export const analyzeFood = async (req, res) => {
  const imageFile = req.files?.image?.[0];
  const audioFile = req.files?.audio?.[0]; // available for future use
  const { userId } = req.body;

  try {
    // 1️⃣ Validate input
    if (!userId) {
      if (imageFile) safeUnlink(imageFile.path);
      if (audioFile) safeUnlink(audioFile.path);
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!imageFile) {
      if (audioFile) safeUnlink(audioFile.path);
      return res.status(400).json({ error: 'image file is required' });
    }

    // 2️⃣ Image URL for DB
    const imageUrl = path.join('/uploads/images', imageFile.filename);

    // 3️⃣ Build multipart request for ML service
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imageFile.path), {
      filename: imageFile.filename,
      contentType: imageFile.mimetype,
    });
    formData.append('userId', userId);
    formData.append('top_k', '10');

    // 4️⃣ Call ML service with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

    let mlResponse;
    try {
      mlResponse = await fetch(`${ML_SERVICE_URL}/predict`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      safeUnlink(imageFile.path);
      if (audioFile) safeUnlink(audioFile.path);

      if (err.name === 'AbortError') {
        return res.status(504).json({ error: 'ML service timeout' });
      }

      return res.status(503).json({ error: 'ML service unavailable', message: err.message });
    } finally {
      clearTimeout(timeout);
    }

    // 5️⃣ Handle ML errors
    if (!mlResponse.ok) {
      const errorText = await mlResponse.text();
      safeUnlink(imageFile.path);
      if (audioFile) safeUnlink(audioFile.path);

      return res.status(502).json({ error: 'ML service error', details: errorText });
    }

    const mlResult = await mlResponse.json();
    // Expected: { userId, analysis: { plate_type, total_grams, items } }

    // 6️⃣ Persist analysis in DB
    const analysis = await prisma.analysis.create({
      data: {
        userId,
        imageUrl,
        plateType: mlResult.analysis.plate_type,
        totalGrams: mlResult.analysis.total_grams,
        detectedItems: {
          create: mlResult.analysis.items.map(item => ({
            name: item.name,
            grams: item.grams,
          })),
        },
      },
      include: { detectedItems: true },
    });

    // 7️⃣ Cleanup temp files
    safeUnlink(imageFile.path);
    if (audioFile) safeUnlink(audioFile.path);

    // 8️⃣ Respond
    return res.status(200).json({
      status: 'success',
      data: {
        analysisId: analysis.id,
        plateType: analysis.plateType,
        totalGrams: analysis.totalGrams,
        imageUrl: analysis.imageUrl,
        detectedItems: analysis.detectedItems.map(item => ({
          name: item.name,
          grams: item.grams,
        })),
        createdAt: analysis.createdAt,
      },
    });

  } catch (err) {
    if (imageFile) safeUnlink(imageFile.path);
    if (audioFile) safeUnlink(audioFile.path);

    console.error('analyzeFood error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

// Placeholder functions for future endpoints
export const getAnalysis = async (req, res) => {
  // Your existing logic for fetching a single analysis
};

export const getUserAnalyses = async (req, res) => {
  // Your existing logic for fetching all analyses for a user
};
