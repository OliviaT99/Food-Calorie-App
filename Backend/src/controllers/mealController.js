import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create a Meal and attach uploaded files (image + audio).
 * Expects multipart form-data with optional files 'image' and 'audio',
 * and fields: userId, eatenAt (ISO string), totalCalories, items (JSON array).
 */
export const createMeal = async (req, res) => {
  try {
    const { userId, eatenAt, totalCalories, items } = req.body ?? {};

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // build file URLs/paths
    const imageFile = req.files?.image?.[0];
    const audioFile = req.files?.audio?.[0];

    const imageUrl = imageFile ? path.join('/uploads/images', imageFile.filename) : null;
    const audioUrl = audioFile ? path.join('/uploads/audio', audioFile.filename) : null;

    const eatenAtDate = eatenAt ? new Date(eatenAt) : new Date();

    // prepare items if provided (expect JSON string or array)
    let itemsData = undefined;
    if (items) {
      let parsed = null;
      if (typeof items === 'string') {
        try { parsed = JSON.parse(items); } catch (e) { parsed = null; }
      } else {
        parsed = items;
      }

      if (Array.isArray(parsed) && parsed.length) {
        itemsData = parsed.map((it) => ({
          name: it.name,
          calories: it.calories != null ? Number(it.calories) : null,
          protein: it.protein != null ? Number(it.protein) : null,
          carbs: it.carbs != null ? Number(it.carbs) : null,
          fat: it.fat != null ? Number(it.fat) : null,
        }));
      }
    }

    const meal = await prisma.meal.create({
      data: {
        userId,
        eatenAt: eatenAtDate,
        totalCalories: totalCalories != null ? Number(totalCalories) : null,
        imageUrl,
        audioUrl,
        transcript: null,
        items: itemsData ? { create: itemsData } : undefined,
      },
      select: { id: true }
    });

    return res.status(201).json({ status: 'success', data: { mealId: meal.id } });
  } catch (err) {
    console.error('createMeal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
