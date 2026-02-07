import fetch from 'node-fetch';

// Simple in-memory cache for nutrition data (per 100g)
const nutritionCache = new Map();

/**
 * Returns nutrition values PER 100g:
 * { calories, protein, carbs, fat }
 */
export const getCachedNutrition = async (foodName) => {
  const key = foodName.toLowerCase().trim();
  if (nutritionCache.has(key)) {
    return nutritionCache.get(key);
  }

  try {
    const query = encodeURIComponent(foodName);
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&json=1&page_size=1`;
    const res = await fetch(url);
    const data = await res.json();

    const product = data.products?.[0];
    if (!product || !product.nutriments) return null;

    const nutr = {
      calories: product.nutriments['energy-kcal_100g'] ?? null,
      protein: product.nutriments['proteins_100g'] ?? null,
      carbs: product.nutriments['carbohydrates_100g'] ?? null,
      fat: product.nutriments['fat_100g'] ?? null,
    };

    nutritionCache.set(key, nutr);
    return nutr;
  } catch (err) {
    console.error('getCachedNutrition error:', err);
    return null;
  }
};
