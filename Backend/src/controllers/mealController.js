import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { prisma } from '../config/db.js';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import { getCachedNutrition } from '../utils/nutritionCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Fetch nutrition info for a food name using OpenFoodFacts
 * Returns an object: { calories, protein, carbs, fat } per 100g
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
      calories: nutr['energy-kcal_100g'] ?? null,
      protein: nutr['proteins_100g'] ?? null,
      carbs: nutr['carbohydrates_100g'] ?? null,
      fat: nutr['fat_100g'] ?? null,
    };
  } catch (err) {
    console.error('getNutrition error:', err);
    return null;
  }
};

/**
 * Create a Meal with optional image + audio.
 * Auto-transcribes audio and fetches nutrition info for detected foods.
 */
export const createMeal = async (req, res) => {
  try {
    const { userId, eatenAt, totalCalories, items } = req.body ?? {};

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const imageFile = req.files?.image?.[0];
    const audioFile = req.files?.audio?.[0];

    const imageUrl = imageFile ? path.join('/uploads/images', imageFile.filename) : null;
    const audioUrl = audioFile ? path.join('/uploads/audio', audioFile.filename) : null;
    const eatenAtDate = eatenAt ? new Date(eatenAt) : new Date();

    let transcript = null;
    let autoItems = null;

    // 1. If audio is provided, transcribe and extract food components
    if (audioFile) {
      const audioPath = audioFile.path;

      // Whisper transcription
      const transcriptionResp = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
      });
      transcript = transcriptionResp.text;

      // LLM extraction
      const prompt = `
Extract the food items from the following sentence.
Return them as a JSON array of strings.

Text: "${transcript}"
`;
      const llmResp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });

      try {
        autoItems = JSON.parse(llmResp.choices[0].message.content);
        if (!Array.isArray(autoItems)) autoItems = [];
      } catch (e) {
        autoItems = llmResp.choices[0].message.content.split(',').map(s => s.trim());
      }
    }

    // 2. Prepare items array
    let itemsData = undefined;

    if (items) {
      // manual items take priority
      let parsed = typeof items === 'string' ? JSON.parse(items) : items;
      if (Array.isArray(parsed) && parsed.length) {
        itemsData = parsed.map((it) => ({
          name: it.name,
          calories: it.calories != null ? Number(it.calories) : null,
          protein: it.protein != null ? Number(it.protein) : null,
          carbs: it.carbs != null ? Number(it.carbs) : null,
          fat: it.fat != null ? Number(it.fat) : null,
        }));
      }
    } else if (autoItems?.length) {
      // fetch nutrition info for each auto-detected food
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

    // 3. Create meal in DB
    const meal = await prisma.meal.create({
      data: {
        userId,
        eatenAt: eatenAtDate,
        totalCalories: totalCalories != null ? Number(totalCalories) : null,
        imageUrl,
        audioUrl,
        transcript,
        items: itemsData ? { create: itemsData } : undefined,
      },
      select: { id: true }
    });

    return res.status(201).json({
      status: 'success',
      data: {
        mealId: meal.id,
        transcript,
        foodComponents: itemsData?.map(i => i.name) ?? [],
        items: itemsData ?? [],
      },
    });

  } catch (err) {
    console.error('createMeal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};