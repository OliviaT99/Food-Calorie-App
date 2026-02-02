import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../config/db.js';
import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Python FastAPI ML service URL
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Analyze food image using ML model
 * POST /api/analysis
 * Expects: multipart form-data with 'image' file and 'userId' field
 */
export const analyzeFood = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const imageFile = req.file;
    if (!imageFile) {
      return res.status(400).json({ error: 'image file is required' });
    }

    // Save image URL for DB
    const imageUrl = path.join('/uploads/images', imageFile.filename);

    // 1. Call Python ML service
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imageFile.path), {
      filename: imageFile.filename,
      contentType: imageFile.mimetype,
    });

    const mlResponse = await fetch(`${ML_SERVICE_URL}/predict?top_k=10`, {  
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });

    if (!mlResponse.ok) {
      const errorText = await mlResponse.text();
      console.error('ML service error:', errorText);
      return res.status(500).json({ 
        error: 'ML analysis failed',
        details: errorText 
      });
    }

    const mlResult = await mlResponse.json();
    
    // mlResult structure:
    // {
    //   "plate_type": "flat",
    //   "total_grams": 742.3,
    //   "items": [
    //     { "name": "pasta", "grams": 520.1 },
    //     { "name": "cheese", "grams": 222.2 }
    //   ]
    // }

    // 2. Store analysis in database
    const analysis = await prisma.analysis.create({
      data: {
        userId,
        imageUrl,
        plateType: mlResult.plate_type,
        totalGrams: mlResult.total_grams,
        detectedItems: {
          create: mlResult.items.map(item => ({
            name: item.name,
            grams: item.grams,
          })),
        },
      },
      include: {
        detectedItems: true,
      },
    });

    // 3. Return results
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
    console.error('analyzeFood error:', err);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: err.message 
    });
  }
};

/**
 * Get analysis by ID
 * GET /api/analysis/:id
 */
export const getAnalysis = async (req, res) => {
  try {
    const { id } = req.params;

    const analysis = await prisma.analysis.findUnique({
      where: { id },
      include: {
        detectedItems: true,
      },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        analysisId: analysis.id,
        userId: analysis.userId,
        plateType: analysis.plateType,
        totalGrams: analysis.totalGrams,
        imageUrl: analysis.imageUrl,
        detectedItems: analysis.detectedItems,
        createdAt: analysis.createdAt,
      },
    });

  } catch (err) {
    console.error('getAnalysis error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get all analyses for a user
 * GET /api/analysis/user/:userId
 */
export const getUserAnalyses = async (req, res) => {
  try {
    const { userId } = req.params;

    const analyses = await prisma.analysis.findMany({
      where: { userId },
      include: {
        detectedItems: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({
      status: 'success',
      data: {
        count: analyses.length,
        analyses: analyses.map(a => ({
          analysisId: a.id,
          plateType: a.plateType,
          totalGrams: a.totalGrams,
          imageUrl: a.imageUrl,
          detectedItems: a.detectedItems,
          createdAt: a.createdAt,
        })),
      },
    });

  } catch (err) {
    console.error('getUserAnalyses error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};