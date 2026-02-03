import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../config/db.js";
import FormData from "form-data";
import fs from "fs";
import fetch from "node-fetch";

// ✅ IMPORT: nutzt die Funktion, die wir im MealController hinzugefügt haben
// IMPORTANT: passe Dateiname an, falls deine Datei anders heißt
import { computeMacrosFromDetectedItems } from "./mealController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ML service URL (default auf 5002, weil 5001 euer Backend ist)
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:5002";
const ML_TIMEOUT_MS = 30_000; // 30s timeout

// Helper: safely delete uploaded temp files
const safeUnlink = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err) console.warn("⚠️ Failed to delete temp file:", err.message);
  });
};

/**
 * Analyze food image using ML model
 * POST /api/analysis/analyze
 * Expects: multipart form-data with 'image' file, optional 'audio', and 'userId'
 */
export const analyzeFood = async (req, res) => {
  const imageFile = req.files?.image?.[0];
  const audioFile = req.files?.audio?.[0]; // optional, future use
  const { userId } = req.body;

  try {
    // 1️⃣ Validate input
    if (!userId) {
      if (imageFile) safeUnlink(imageFile.path);
      if (audioFile) safeUnlink(audioFile.path);
      return res.status(400).json({ error: "userId is required" });
    }

    if (!imageFile) {
      if (audioFile) safeUnlink(audioFile.path);
      return res.status(400).json({ error: "image file is required" });
    }

    // 2️⃣ Image URL for DB (relative path)
    const imageUrl = path.join("/uploads/images", imageFile.filename);

    // 3️⃣ Build multipart request for ML service
    // FastAPI erwartet: image: UploadFile = File(...)
    const formData = new FormData();
    formData.append("image", fs.createReadStream(imageFile.path), {
      filename: imageFile.filename,
      contentType: imageFile.mimetype,
    });
    formData.append("top_k", "10");

    // 4️⃣ Call ML service with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

    let mlResponse;
    try {
      mlResponse = await fetch(`${ML_SERVICE_URL}/predict`, {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
        signal: controller.signal,
      });
    } catch (err) {
      safeUnlink(imageFile.path);
      safeUnlink(audioFile?.path);

      if (err.name === "AbortError") {
        return res.status(504).json({ error: "ML service timeout" });
      }

      return res
        .status(503)
        .json({ error: "ML service unavailable", message: err.message });
    } finally {
      clearTimeout(timeout);
    }

    // 5️⃣ Handle ML errors
    if (!mlResponse.ok) {
      const errorText = await mlResponse.text();
      safeUnlink(imageFile.path);
      safeUnlink(audioFile?.path);
      return res.status(502).json({ error: "ML service error", details: errorText });
    }

    const mlResult = await mlResponse.json();

    // 6️⃣ Persist analysis in DB
    const analysis = await prisma.analysis.create({
      data: {
        userId,
        imageUrl,
        plateType: mlResult.plate_type ?? "unknown",
        totalGrams: mlResult.total_grams_est ?? 0,
        detectedItems: {
          create: (mlResult.items ?? []).map((item) => ({
            name: item.label ?? "unknown",
            grams: item.grams_est ?? 0,
          })),
        },
      },
      include: { detectedItems: true },
    });

    // ✅ 6b️⃣ Compute macros/calories from grams using your nutrition cache
    // Build detected list from DB result
    const detected = analysis.detectedItems.map((it) => ({
      name: it.name,
      grams: it.grams,
    }));

    const macros = await computeMacrosFromDetectedItems(detected);
    // macros = { items: [{name, grams, calories, protein, carbs, fat, per100g}], totals: {...} }

    // 7️⃣ Cleanup temp files
    safeUnlink(imageFile.path);
    safeUnlink(audioFile?.path);

    // 8️⃣ Respond (NOW includes calories/macros)
    return res.status(200).json({
      status: "success",
      data: {
        analysisId: analysis.id,
        plateType: analysis.plateType,
        totalGrams: analysis.totalGrams,
        imageUrl: analysis.imageUrl,

        // enriched items with macros
        detectedItems: macros.items,

        // totals for the whole plate
        totals: macros.totals,

        createdAt: analysis.createdAt,
      },
    });
  } catch (err) {
    safeUnlink(imageFile?.path);
    safeUnlink(audioFile?.path);

    console.error("analyzeFood error:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
};

// Placeholder functions for future endpoints
export const getAnalysis = async (req, res) => {
  return res.status(501).json({ error: "Not implemented" });
};

export const getUserAnalyses = async (req, res) => {
  return res.status(501).json({ error: "Not implemented" });
};