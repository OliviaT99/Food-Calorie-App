import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import FormData from "form-data";
import fetch from "node-fetch";
import { prisma } from "../config/db.js";
import { getCachedNutrition } from "../utils/nutritionCache.js";
import { scaleNutrition } from "../utils/scaleNutrition.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FASTAPI_ML_URL =
  process.env.FASTAPI_ML_URL || "http://127.0.0.1:5002";

/* ------------------ helpers ------------------ */
const round1 = (v) =>
  Number.isFinite(v) ? Math.round(v * 10) / 10 : null;

const safeUnlink = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
};

const normalize = (name) =>
  String(name).toLowerCase().trim();

/* ------------------ merge logic ------------------ */
const mergeAudioAndImageItems = (imageItems, audioItems) => {
  const map = new Map();

  // start with image items
  for (const it of imageItems ?? []) {
    if (!it?.name) continue;
    map.set(normalize(it.name), {
      name: it.name,
      grams: Number.isFinite(it.grams) ? it.grams : null,
      source: "image",
    });
  }

  // overlay audio items
  for (const it of audioItems ?? []) {
    if (!it?.name) continue;

    const key = normalize(it.name);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        name: it.name,
        grams: Number.isFinite(it.grams) ? it.grams : null,
        source: "audio",
      });
    } else {
      map.set(key, {
        name: it.name,
        grams: Number.isFinite(it.grams) ? it.grams : existing.grams,
        source: Number.isFinite(it.grams) ? "audio" : "mixed",
      });
    }
  }

  return Array.from(map.values());
};

/* ------------------ controller ------------------ */
export const createMeal = async (req, res) => {
  const imageFile = req.files?.image?.[0];
  const audioFile = req.files?.audio?.[0];

  const { userId, eatenAt, items: manualItems } = req.body ?? {};
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  let transcript = null;
  let audioItems = null;
  let imageItems = null;

  /* ---------- AUDIO ANALYSIS ---------- */
  if (audioFile) {
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(audioFile.path), {
      filename: audioFile.filename,
      contentType: audioFile.mimetype,
    });

    try {
      const resp = await fetch(`${FASTAPI_ML_URL}/analyze-audio`, {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
      });

      if (resp.ok) {
        const data = await resp.json();
        transcript = data.transcript ?? null;
        audioItems = data.items ?? null;
      }
    } catch (err) {
      console.warn("⚠️ Audio ML failed:", err.message);
    }
  }

  /* ---------- IMAGE ANALYSIS (if you already have it upstream) ---------- */
  if (manualItems) {
    const parsed =
      typeof manualItems === "string"
        ? JSON.parse(manualItems)
        : manualItems;

    imageItems = parsed
      ?.filter((it) => it?.name)
      .map((it) => ({
        name: it.name,
        grams: Number(it.grams),
      }));
  }

  /* ---------- MERGE SOURCES ---------- */
  const detectedItems = mergeAudioAndImageItems(
    imageItems,
    audioItems
  );

  /* ---------- NUTRITION COMPUTATION ---------- */
  const enrichedItems = [];
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  for (const it of detectedItems) {
    const per100g = await getCachedNutrition(it.name);
    const nutrition = it.grams
      ? scaleNutrition(per100g, it.grams)
      : null;

    if (nutrition) {
      totals.calories += nutrition.calories ?? 0;
      totals.protein += nutrition.protein ?? 0;
      totals.carbs += nutrition.carbs ?? 0;
      totals.fat += nutrition.fat ?? 0;
    }

    enrichedItems.push({
      name: it.name,
      grams: it.grams ? round1(it.grams) : null,
      calories: round1(nutrition?.calories),
      protein: round1(nutrition?.protein),
      carbs: round1(nutrition?.carbs),
      fat: round1(nutrition?.fat),
      source: it.source,
    });
  }

  /* ---------- DB PERSISTENCE ---------- */
  const imageUrl = imageFile
    ? path.join("/uploads/images", imageFile.filename)
    : null;

  const audioUrl = audioFile
    ? path.join("/uploads/audio", audioFile.filename)
    : null;

  const meal = await prisma.meal.create({
    data: {
      userId,
      eatenAt: eatenAt ? new Date(eatenAt) : new Date(),
      totalCalories: round1(totals.calories),
      imageUrl,
      audioUrl,
      transcript,
      items: enrichedItems.length
        ? {
            create: enrichedItems.map((it) => ({
              name: it.name,
              calories: it.calories,
              protein: it.protein,
              carbs: it.carbs,
              fat: it.fat,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });

  safeUnlink(imageFile?.path);
  safeUnlink(audioFile?.path);

  return res.status(201).json({
    status: "success",
    data: {
      mealId: meal.id,
      transcript,
      items: enrichedItems,
      totals: {
        calories: round1(totals.calories),
        protein: round1(totals.protein),
        carbs: round1(totals.carbs),
        fat: round1(totals.fat),
      },
    },
  });
};
