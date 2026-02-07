/**
 * Scales nutrition values from per-100g to actual grams
 * @param {Object} per100g - { calories, protein, carbs, fat }
 * @param {number} grams
 * @returns {Object} scaled nutrition
 */
export const scaleNutrition = (per100g, grams) => {
  if (!per100g || grams == null) {
    return {
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
    };
  }

  const factor = grams / 100;

  return {
    calories: per100g.calories != null ? per100g.calories * factor : null,
    protein: per100g.protein != null ? per100g.protein * factor : null,
    carbs: per100g.carbs != null ? per100g.carbs * factor : null,
    fat: per100g.fat != null ? per100g.fat * factor : null,
  };
};
