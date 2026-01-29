import fetch from 'node-fetch';

/**
 * Fetch nutrition info for a food name using OpenFoodFacts
 * Returns an object: { calories, protein, carbs, fat } in grams
 */
export const getNutrition = async (foodName) => {
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
