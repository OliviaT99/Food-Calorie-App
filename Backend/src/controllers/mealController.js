import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { prisma } from "../config/db.js";
import OpenAI from "openai";
import fetch from "node-fetch";
import { getCachedNutrition } from "../utils/nutritionCache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ IMPORTANT: Backend darf nicht crashen, wenn kein Key gesetzt ist
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/**
 * Helper: safe number
 */
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Helper: round for API output
 */
function round1(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Fetch nutrition info for a food name using OpenFoodFacts
 * Returns an object: { calories, protein, carbs, fat } per 100g
 *
 * NOTE: You already use getCachedNutrition() (recommended).
 * This function is kept for completeness but not used below.
 */
const getNutrition = async (foodName) => {
  try {
    const query = encodeURIComponent(foodName);
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&json=1&page_size=1`;
    const res = await fetch(url);
    const data = await res.json();

    const product = data.products?.[0];
    if (!product || !product.nutriments) return null;

    const nutr = product.nutriments;
    return {
      calories: nutr["energy-kcal_100g"] ?? null,
      protein: nutr["proteins_100g"] ?? null,
      carbs: nutr["carbohydrates_100g"] ?? null,
      fat: nutr["fat_100g"] ?? null,
    };
  } catch (err) {
    console.error("getNutrition error:", err);
    return null;
  }
};

/**
 * ✅ CORE: Convert grams -> macros using nutrition per 100g
 * Input:
 *  - detectedItems: [{ name: string, grams: number }, ...]
 * Output:
 *  {
 *    items: [{ name, grams, calories, protein, carbs, fat, per100g: {...} }, ...],
 *    totals: { calories, protein, carbs, fat }
 *  }
 */
export const computeMacrosFromDetectedItems = async (detectedItems) => {
  const items = [];
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const arr = Array.isArray(detectedItems) ? detectedItems : [];

  for (const it of arr) {
    const name = String(it?.name ?? "").trim();
    const grams = Number(it?.grams);

    if (!name || !Number.isFinite(grams) || grams <= 0) continue;

    // nutrition values are per 100g
    const nutr = await getCachedNutrition(name); // { calories, protein, carbs, fat } per 100g or null
    const per100 = {
      calories: toNum(nutr?.calories),
      protein: toNum(nutr?.protein),
      carbs: toNum(nutr?.carbs),
      fat: toNum(nutr?.fat),
    };

    const factor = grams / 100;

    const calories = per100.calories != null ? per100.calories * factor : null;
    const protein = per100.protein != null ? per100.protein * factor : null;
    const carbs = per100.carbs != null ? per100.carbs * factor : null;
    const fat = per100.fat != null ? per100.fat * factor : null;

    if (calories != null) totals.calories += calories;
    if (protein != null) totals.protein += protein;
    if (carbs != null) totals.carbs += carbs;
    if (fat != null) totals.fat += fat;

    items.push({
      name,
      grams: round1(grams),
      calories: calories != null ? round1(calories) : null,
      protein: protein != null ? round1(protein) : null,
      carbs: carbs != null ? round1(carbs) : null,
      fat: fat != null ? round1(fat) : null,
      per100g: per100, // optional
    });
  }

  return {
    items,
    totals: {
      calories: round1(totals.calories),
      protein: round1(totals.protein),
      carbs: round1(totals.carbs),
      fat: round1(totals.fat),
    },
  };
};

/**
 * Create a Meal with optional image + audio.
 * Auto-transcribes audio and fetches nutrition info for detected foods.
 */
export const createMeal = async (req, res) => {
  try {
    const { userId, eatenAt, totalCalories, items } = req.body ?? {};

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const imageFile = req.files?.image?.[0];
    const audioFile = req.files?.audio?.[0];

    const imageUrl = imageFile
      ? path.join("/uploads/images", imageFile.filename)
      : null;
    const audioUrl = audioFile
      ? path.join("/uploads/audio", audioFile.filename)
      : null;
    const eatenAtDate = eatenAt ? new Date(eatenAt) : new Date();

    let transcript = null;
    let autoItems = null;

    // 1) If audio is provided AND OpenAI key is available -> transcribe and extract food components
    if (audioFile && openai) {
      const audioPath = audioFile.path;

      const transcriptionResp = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
      });
      transcript = transcriptionResp.text;

      const prompt = `
Extract the food items from the following sentence.
Return them as a JSON array of strings.

Text: "${transcript}"
`;
      const llmResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });

      try {
        autoItems = JSON.parse(llmResp.choices[0].message.content);
        if (!Array.isArray(autoItems)) autoItems = [];
      } catch {
        autoItems = llmResp.choices[0].message.content
          .split(",")
          .map((s) => s.trim());
      }
    }

    // 2) Prepare items array
    let itemsData = undefined;
    let computedTotals = null;

    if (items) {
      let parsed = typeof items === "string" ? JSON.parse(items) : items;

      if (Array.isArray(parsed) && parsed.length) {
        const hasGrams = parsed.some(
          (it) => Number.isFinite(Number(it?.grams)) && Number(it?.grams) > 0
        );

        if (hasGrams) {
          const detectedItems = parsed
            .map((it) => ({ name: it?.name, grams: Number(it?.grams) }))
            .filter((x) => x.name && Number.isFinite(x.grams) && x.grams > 0);

          const enriched = await computeMacrosFromDetectedItems(detectedItems);
          computedTotals = enriched.totals;

          itemsData = enriched.items.map((it) => ({
            name: it.name,
            calories: it.calories != null ? Number(it.calories) : null,
            protein: it.protein != null ? Number(it.protein) : null,
            carbs: it.carbs != null ? Number(it.carbs) : null,
            fat: it.fat != null ? Number(it.fat) : null,
          }));
        } else {
          itemsData = parsed.map((it) => ({
            name: it.name,
            calories: it.calories != null ? Number(it.calories) : null,
            protein: it.protein != null ? Number(it.protein) : null,
            carbs: it.carbs != null ? Number(it.carbs) : null,
            fat: it.fat != null ? Number(it.fat) : null,
          }));
        }
      }
    } else if (autoItems?.length) {
      // Without grams we cannot compute real meal calories
      itemsData = [];
      for (const name of autoItems) {
        const nutr = await getCachedNutrition(name);
        itemsData.push({
          name,
          calories: nutr?.calories ?? null,
          protein: nutr?.protein ?? null,
          carbs: nutr?.carbs ?? null,
          fat: nutr?.fat ?? null,
        });
      }
    }

    const totalCaloriesFinal =
      totalCalories != null
        ? Number(totalCalories)
        : computedTotals?.calories != null
        ? Number(computedTotals.calories)
        : null;

    // 3) Create meal in DB
    const meal = await prisma.meal.create({
      data: {
        userId,
        eatenAt: eatenAtDate,
        totalCalories: totalCaloriesFinal,
        imageUrl,
        audioUrl,
        transcript,
        items: itemsData ? { create: itemsData } : undefined,
      },
      select: { id: true },
    });

    return res.status(201).json({
      status: "success",
      data: {
        mealId: meal.id,
        transcript,
        foodComponents: itemsData?.map((i) => i.name) ?? [],
        items: itemsData ?? [],
        totals: computedTotals ?? null,
        totalCalories: totalCaloriesFinal,
      },
    });
  } catch (err) {
    console.error("createMeal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};