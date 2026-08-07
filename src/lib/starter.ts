/* The whole-foods starter pack: a curated library offered on first run so the
   grocery predictions, plan generator, and recipes have real food to work with
   from minute one. Values are standard per-100g reference macros (per-serving
   where an item is naturally discrete — eggs, tortillas, scoops). */

type StarterFood = {
  name: string; category: string;
  protein: number; carbs: number; fat: number;
  fiber?: number; sugar?: number;
  unit?: 'serving' | 'g100';
};

export const STARTER_FOODS: StarterFood[] = [
  /* Protein — the foundation */
  { name: 'Chicken breast', category: 'Protein', protein: 31, carbs: 0, fat: 3.6, unit: 'g100' },
  { name: 'Chicken thigh', category: 'Protein', protein: 26, carbs: 0, fat: 9, unit: 'g100' },
  { name: 'Ground beef 90/10', category: 'Protein', protein: 26, carbs: 0, fat: 10, unit: 'g100' },
  { name: 'Ground beef 80/20', category: 'Protein', protein: 25, carbs: 0, fat: 17, unit: 'g100' },
  { name: 'Sirloin steak', category: 'Protein', protein: 27, carbs: 0, fat: 8, unit: 'g100' },
  { name: 'Ground turkey', category: 'Protein', protein: 27, carbs: 0, fat: 8, unit: 'g100' },
  { name: 'Pork chop', category: 'Protein', protein: 27, carbs: 0, fat: 7, unit: 'g100' },
  { name: 'Salmon', category: 'Protein', protein: 25, carbs: 0, fat: 13, unit: 'g100' },
  { name: 'Tilapia', category: 'Protein', protein: 26, carbs: 0, fat: 2.7, unit: 'g100' },
  { name: 'Shrimp', category: 'Protein', protein: 24, carbs: 0.2, fat: 0.3, unit: 'g100' },
  { name: 'Canned tuna', category: 'Protein', protein: 26, carbs: 0, fat: 1, unit: 'g100' },
  { name: 'Bacon', category: 'Protein', protein: 37, carbs: 1.4, fat: 42, unit: 'g100' },
  /* Dairy & Eggs */
  { name: 'Egg', category: 'Dairy & Eggs', protein: 6, carbs: 0.6, fat: 5, unit: 'serving' },
  { name: 'Egg white', category: 'Dairy & Eggs', protein: 3.6, carbs: 0.2, fat: 0, unit: 'serving' },
  { name: 'Greek yogurt (nonfat)', category: 'Dairy & Eggs', protein: 10, carbs: 3.6, fat: 0.4, sugar: 3.2, unit: 'g100' },
  { name: 'Cottage cheese', category: 'Dairy & Eggs', protein: 11, carbs: 3.4, fat: 4.3, sugar: 2.7, unit: 'g100' },
  { name: 'Cheddar cheese', category: 'Dairy & Eggs', protein: 25, carbs: 1.3, fat: 33, unit: 'g100' },
  { name: 'Mozzarella', category: 'Dairy & Eggs', protein: 22, carbs: 2.2, fat: 22, unit: 'g100' },
  { name: 'Whole milk', category: 'Dairy & Eggs', protein: 3.2, carbs: 4.8, fat: 3.3, sugar: 5, unit: 'g100' },
  { name: 'Butter', category: 'Dairy & Eggs', protein: 0.9, carbs: 0.1, fat: 81, unit: 'g100' },
  /* Produce */
  { name: 'Broccoli', category: 'Produce', protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6, unit: 'g100' },
  { name: 'Spinach', category: 'Produce', protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, unit: 'g100' },
  { name: 'Asparagus', category: 'Produce', protein: 2.2, carbs: 3.9, fat: 0.1, fiber: 2.1, unit: 'g100' },
  { name: 'Green beans', category: 'Produce', protein: 1.8, carbs: 7, fat: 0.2, fiber: 2.7, unit: 'g100' },
  { name: 'Bell pepper', category: 'Produce', protein: 1, carbs: 6, fat: 0.3, fiber: 2.1, sugar: 4.2, unit: 'g100' },
  { name: 'Onion', category: 'Produce', protein: 1.1, carbs: 9, fat: 0.1, fiber: 1.7, sugar: 4.2, unit: 'g100' },
  { name: 'Carrots', category: 'Produce', protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8, sugar: 4.7, unit: 'g100' },
  { name: 'Sweet potato', category: 'Produce', protein: 1.6, carbs: 20, fat: 0.1, fiber: 3, sugar: 4.2, unit: 'g100' },
  { name: 'White potato', category: 'Produce', protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, unit: 'g100' },
  { name: 'Avocado', category: 'Produce', protein: 2, carbs: 9, fat: 15, fiber: 7, unit: 'g100' },
  { name: 'Banana', category: 'Produce', protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sugar: 12, unit: 'g100' },
  { name: 'Apple', category: 'Produce', protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sugar: 10, unit: 'g100' },
  { name: 'Blueberries', category: 'Produce', protein: 0.7, carbs: 14, fat: 0.3, fiber: 2.4, sugar: 10, unit: 'g100' },
  { name: 'Strawberries', category: 'Produce', protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2, sugar: 4.9, unit: 'g100' },
  { name: 'Tomato', category: 'Produce', protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, sugar: 2.6, unit: 'g100' },
  { name: 'Cucumber', category: 'Produce', protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5, sugar: 1.7, unit: 'g100' },
  { name: 'Romaine lettuce', category: 'Produce', protein: 1.2, carbs: 3.3, fat: 0.3, fiber: 2.1, unit: 'g100' },
  { name: 'Mushrooms', category: 'Produce', protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1, unit: 'g100' },
  { name: 'Zucchini', category: 'Produce', protein: 1.2, carbs: 3.1, fat: 0.3, fiber: 1, sugar: 2.5, unit: 'g100' },
  { name: 'Cauliflower', category: 'Produce', protein: 1.9, carbs: 5, fat: 0.3, fiber: 2, sugar: 1.9, unit: 'g100' },
  { name: 'Kale', category: 'Produce', protein: 4.3, carbs: 8.8, fat: 0.9, fiber: 3.6, unit: 'g100' },
  { name: 'Corn', category: 'Produce', protein: 3.3, carbs: 19, fat: 1.5, fiber: 2.7, sugar: 3.2, unit: 'g100' },
  { name: 'Orange', category: 'Produce', protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, sugar: 9, unit: 'g100' },
  { name: 'Grapes', category: 'Produce', protein: 0.7, carbs: 18, fat: 0.2, fiber: 0.9, sugar: 16, unit: 'g100' },
  { name: 'Watermelon', category: 'Produce', protein: 0.6, carbs: 7.6, fat: 0.2, fiber: 0.4, sugar: 6.2, unit: 'g100' },
  { name: 'Pineapple', category: 'Produce', protein: 0.5, carbs: 13, fat: 0.1, fiber: 1.4, sugar: 10, unit: 'g100' },
  /* Grains */
  { name: 'White rice (cooked)', category: 'Grains', protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, unit: 'g100' },
  { name: 'Brown rice (cooked)', category: 'Grains', protein: 2.6, carbs: 23, fat: 0.9, fiber: 1.8, unit: 'g100' },
  { name: 'Quinoa (cooked)', category: 'Grains', protein: 4.4, carbs: 21, fat: 1.9, fiber: 2.8, unit: 'g100' },
  { name: 'Pasta (cooked)', category: 'Grains', protein: 5.8, carbs: 31, fat: 0.9, fiber: 1.8, unit: 'g100' },
  { name: 'Oats (dry)', category: 'Grains', protein: 13.2, carbs: 67, fat: 6.5, fiber: 10.6, sugar: 1, unit: 'g100' },
  { name: 'Bread slice', category: 'Grains', protein: 4, carbs: 13, fat: 1, fiber: 1, unit: 'serving' },
  { name: 'Flour tortilla', category: 'Grains', protein: 4, carbs: 24, fat: 3.5, fiber: 1.5, unit: 'serving' },
  /* Pantry */
  { name: 'Olive oil', category: 'Pantry', protein: 0, carbs: 0, fat: 100, unit: 'g100' },
  { name: 'Peanut butter', category: 'Pantry', protein: 25, carbs: 20, fat: 50, fiber: 6, sugar: 9, unit: 'g100' },
  { name: 'Almonds', category: 'Pantry', protein: 21, carbs: 22, fat: 50, fiber: 12.5, sugar: 4.4, unit: 'g100' },
  { name: 'Black beans (cooked)', category: 'Pantry', protein: 8.9, carbs: 23.7, fat: 0.5, fiber: 8.7, unit: 'g100' },
  { name: 'Chickpeas (cooked)', category: 'Pantry', protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6, unit: 'g100' },
  { name: 'Lentils (cooked)', category: 'Pantry', protein: 9, carbs: 20, fat: 0.4, fiber: 7.9, unit: 'g100' },
  { name: 'Honey', category: 'Pantry', protein: 0.3, carbs: 82, fat: 0, sugar: 82, unit: 'g100' },
  { name: 'Whey protein (scoop)', category: 'Pantry', protein: 24, carbs: 3, fat: 1.5, unit: 'serving' },
  /* Frozen */
  { name: 'Frozen mixed vegetables', category: 'Frozen', protein: 2, carbs: 8, fat: 0.5, fiber: 3, unit: 'g100' },
  { name: 'Frozen berries', category: 'Frozen', protein: 0.8, carbs: 12, fat: 0.4, fiber: 3, sugar: 7, unit: 'g100' },
];

/* `meals` tags the slots a dish belongs in, so a generated plan doesn't put
   chicken and rice at 8am. Omit the field to let a recipe land anywhere. */
type StarterRecipe = { name: string; emoji: string; portions: number; meals?: string[]; items: [string, number][] };

export const STARTER_RECIPES: StarterRecipe[] = [
  { name: 'Chicken & Rice Bowl', emoji: '🍗', portions: 1, meals: ['lunch', 'dinner'], items: [['Chicken breast', 200], ['White rice (cooked)', 250], ['Broccoli', 150], ['Olive oil', 10]] },
  { name: 'Greek Yogurt Parfait', emoji: '🫐', portions: 1, meals: ['breakfast', 'snack'], items: [['Greek yogurt (nonfat)', 250], ['Blueberries', 100], ['Oats (dry)', 30], ['Honey', 15]] },
  { name: 'Veggie Omelet', emoji: '🍳', portions: 1, meals: ['breakfast'], items: [['Egg', 3], ['Spinach', 50], ['Cheddar cheese', 30], ['Butter', 10]] },
  { name: 'Overnight Oats', emoji: '🥣', portions: 1, meals: ['breakfast'], items: [['Oats (dry)', 60], ['Whole milk', 200], ['Peanut butter', 20], ['Banana', 100]] },
  { name: 'Salmon Plate', emoji: '🐟', portions: 1, meals: ['lunch', 'dinner'], items: [['Salmon', 180], ['Sweet potato', 200], ['Asparagus', 100], ['Olive oil', 8]] },
  { name: 'Beef Burrito Bowl', emoji: '🌯', portions: 1, meals: ['lunch', 'dinner'], items: [['Ground beef 90/10', 150], ['Brown rice (cooked)', 200], ['Black beans (cooked)', 100], ['Avocado', 50]] },
  { name: 'Chicken Fajita Skillet', emoji: '🫑', portions: 2, meals: ['lunch', 'dinner'], items: [['Chicken thigh', 400], ['Bell pepper', 200], ['Onion', 100], ['Flour tortilla', 4], ['Olive oil', 15]] },
  { name: 'Steak & Potatoes', emoji: '🥩', portions: 1, meals: ['dinner'], items: [['Sirloin steak', 200], ['White potato', 300], ['Green beans', 150], ['Butter', 10]] },
  { name: 'Tuna Salad Plate', emoji: '🥗', portions: 1, meals: ['lunch'], items: [['Canned tuna', 150], ['Romaine lettuce', 100], ['Tomato', 100], ['Cucumber', 80], ['Olive oil', 10]] },
  { name: 'Protein Shake', emoji: '🥤', portions: 1, meals: ['snack', 'breakfast'], items: [['Whey protein (scoop)', 1], ['Whole milk', 300], ['Banana', 100], ['Peanut butter', 15]] },
  { name: 'Cottage Cheese & Fruit', emoji: '🍓', portions: 1, meals: ['snack', 'breakfast'], items: [['Cottage cheese', 200], ['Strawberries', 100], ['Almonds', 20]] },
  { name: 'Turkey Taco Night', emoji: '🌮', portions: 2, meals: ['dinner'], items: [['Ground turkey', 300], ['Flour tortilla', 4], ['Cheddar cheese', 60], ['Bell pepper', 100], ['Onion', 50]] },
];

/** Bring an early install up to the current pack: add staples it never got
 *  (the produce aisle arrived late) and backfill meal tags on starter recipes
 *  so planning stops putting dinners at breakfast. Purely additive — nothing
 *  the user edited or created is touched. */
export function upgradeStarterLibrary(
  foods: any[], recipes: any[], idFn: () => string,
): { foods: any[]; recipes: any[]; addedFoods: number; taggedRecipes: number } {
  const key = (n: any) => String(n || '').trim().toLowerCase();
  const have = new Set(foods.map((f) => key(f.name)));
  const missing = STARTER_FOODS.filter((f) => !have.has(key(f.name)))
    .map((f) => ({ id: idFn(), favorite: false, fiber: 0, sugar: 0, ...f }));

  const tagByName = new Map(STARTER_RECIPES.map((r) => [key(r.name), r.meals || []]));
  let taggedRecipes = 0;
  const nextRecipes = recipes.map((r) => {
    if (Array.isArray(r.meals) && r.meals.length) return r;
    const tags = tagByName.get(key(r.name));
    if (!tags || !tags.length) return r;
    taggedRecipes++;
    return { ...r, meals: tags };
  });

  return {
    foods: missing.length ? [...missing, ...foods] : foods,
    recipes: nextRecipes,
    addedFoods: missing.length,
    taggedRecipes,
  };
}

/** Add the pack to a library that already has things in it — the "I skipped
 *  this at setup and want it now" case. Matching is by name, so nothing is
 *  duplicated and nothing the user edited is overwritten; running it twice is
 *  a no-op. Recipes attach to whichever food row already carries that name. */
export function mergeStarterLibrary(
  foods: any[], recipes: any[], idFn: () => string,
): { foods: any[]; recipes: any[]; addedFoods: number; addedRecipes: number } {
  const key = (n: any) => String(n || '').trim().toLowerCase();
  const have = new Set((foods || []).map((f) => key(f.name)));
  const newFoods = STARTER_FOODS.filter((f) => !have.has(key(f.name)))
    .map((f) => ({ id: idFn(), favorite: false, fiber: 0, sugar: 0, ...f }));

  const allFoods = [...newFoods, ...(foods || [])];
  const idByName = new Map(allFoods.map((f) => [key(f.name), f.id]));

  const haveRecipes = new Set((recipes || []).map((r) => key(r.name)));
  const newRecipes = STARTER_RECIPES.filter((r) => !haveRecipes.has(key(r.name))).map((r) => ({
    id: idFn(), name: r.name, emoji: r.emoji, portions: r.portions, meals: r.meals || [],
    // an ingredient with no matching food is dropped rather than left dangling
    items: r.items
      .map(([name, servings]) => ({ foodId: idByName.get(key(name)), servings }))
      .filter((it) => it.foodId),
  }));

  return {
    foods: allFoods,
    recipes: [...newRecipes, ...(recipes || [])],
    addedFoods: newFoods.length,
    addedRecipes: newRecipes.length,
  };
}

/** Materialize the pack with real ids (idFn injected so it's testable). */
export function makeStarterLibrary(idFn: () => string): { foods: any[]; recipes: any[] } {
  const foods = STARTER_FOODS.map((f) => ({ id: idFn(), favorite: false, fiber: 0, sugar: 0, ...f }));
  const idByName = new Map(foods.map((f) => [f.name, f.id]));
  const recipes = STARTER_RECIPES.map((r) => ({
    id: idFn(), name: r.name, emoji: r.emoji, portions: r.portions, meals: r.meals || [],
    items: r.items.map(([name, servings]) => ({ foodId: idByName.get(name), servings })),
  }));
  return { foods, recipes };
}
