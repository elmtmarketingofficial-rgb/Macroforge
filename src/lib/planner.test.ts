import { describe, it, expect } from 'vitest';
import { generatePlan, consumePantry, takeFromPantry, returnToPantry, scaleTaken, reconcileTaken, recipeConsumption, recipeMacrosPerPortion } from './planner';
import { entryMacros, calsFrom } from './engine';
import { makeStarterLibrary } from './starter';

const goals = { protein: 150, carbs: 180, fat: 60 };

const pantryStaples = [
  { name: 'Chicken breast', refId: 'f1', protein: 31, carbs: 0, fat: 4, qty: 14, unitLabel: null },
  { name: 'Rice', refId: 'f2', protein: 4, carbs: 45, fat: 0, qty: 14, unitLabel: null },
  { name: 'Olive oil', refId: 'f3', protein: 0, carbs: 0, fat: 14, qty: 20, unitLabel: null },
  { name: 'Greek yogurt', refId: 'f4', protein: 0.1, carbs: 0.04, fat: 0.004, qty: 1400, unitLabel: 'g' as const },
];

describe('generatePlan — ingredient allocation', () => {
  it('builds entries across the requested days and meal slots', () => {
    const r = generatePlan({ items: pantryStaples, goals, startDate: '2026-08-03', days: 7, mealsPerDay: 3 });
    expect(r.entries.length).toBeGreaterThan(0);
    const dates = new Set(r.entries.map((e) => e.date));
    expect(dates.size).toBeGreaterThanOrEqual(5);
    expect(r.entries.every((e) => ['breakfast', 'lunch', 'dinner', 'snack'].includes(e.meal))).toBe(true);
  });
  it('never allocates more than the inventory holds', () => {
    const r = generatePlan({ items: pantryStaples, goals, startDate: '2026-08-03', days: 7, mealsPerDay: 3 });
    const usedChicken = r.entries.filter((e) => e.name === 'Chicken breast').reduce((s, e) => s + e.servings, 0);
    const usedYogurt = r.entries.filter((e) => e.name === 'Greek yogurt').reduce((s, e) => s + e.servings, 0);
    expect(usedChicken).toBeLessThanOrEqual(14);
    expect(usedYogurt).toBeLessThanOrEqual(1400);
  });
  it('planned totals reconcile with the entries', () => {
    const r = generatePlan({ items: pantryStaples, goals, startDate: '2026-08-03', days: 3, mealsPerDay: 3 });
    const sum = entryMacros(r.entries);
    expect(sum.protein).toBeCloseTo(r.planned.protein, 1);
    expect(sum.carbs).toBeCloseTo(r.planned.carbs, 1);
  });
  it('reports shortfall when the list cannot cover the week', () => {
    const tiny = [{ name: 'Chicken breast', refId: 'f1', protein: 31, carbs: 0, fat: 4, qty: 2, unitLabel: null }];
    const r = generatePlan({ items: tiny, goals, startDate: '2026-08-03', days: 7, mealsPerDay: 3 });
    expect(r.shortfall.protein).toBeGreaterThan(900);
    expect(r.shortfall.carbs).toBe(7 * 180);
    expect(r.daysCovered).toBeLessThanOrEqual(1);
  });
  it('respects mealsPerDay when slotting', () => {
    const r = generatePlan({ items: pantryStaples, goals, startDate: '2026-08-03', days: 2, mealsPerDay: 5 });
    expect(r.entries.some((e) => e.meal === 'snack')).toBe(true);
  });
  it('handles an empty grocery list without exploding', () => {
    const r = generatePlan({ items: [], goals, startDate: '2026-08-03', days: 7, mealsPerDay: 3 });
    expect(r.entries).toHaveLength(0);
    expect(r.shortfall.protein).toBe(7 * 150);
  });
  it('with no targets set: nothing is planned and coverage is honestly zero', () => {
    const r = generatePlan({ items: pantryStaples, goals: { protein: '', carbs: '', fat: '' }, startDate: '2026-08-03', days: 7, mealsPerDay: 3 });
    expect(r.entries).toHaveLength(0);
    expect(r.daysCovered).toBe(0); // must not claim "covers 7/7 days"
  });
});

/* ---- recipe-first planning ---- */
const foods = [
  { id: 'f-oats', name: 'Oats', protein: 13.2, carbs: 67, fat: 6.5, unit: 'g100' },
  { id: 'f-milk', name: 'Milk', protein: 3.2, carbs: 4.8, fat: 3.3, unit: 'g100' },
  { id: 'f-chicken', name: 'Chicken', protein: 31, carbs: 0, fat: 3.6, unit: 'g100' },
  { id: 'f-rice', name: 'Rice', protein: 2.7, carbs: 28, fat: 0.3, unit: 'g100' },
];
const recipes = [
  { id: 'r-oats', name: 'Overnight Oats', portions: 1, meals: ['breakfast'], items: [{ foodId: 'f-oats', servings: 60 }, { foodId: 'f-milk', servings: 200 }] },
  { id: 'r-bowl', name: 'Chicken & Rice Bowl', portions: 1, meals: ['lunch', 'dinner'], items: [{ foodId: 'f-chicken', servings: 200 }, { foodId: 'f-rice', servings: 250 }] },
];
const stocked = [
  { name: 'Oats', refId: 'f-oats', protein: 0.132, carbs: 0.67, fat: 0.065, qty: 600, unitLabel: 'g' as const },
  { name: 'Milk', refId: 'f-milk', protein: 0.032, carbs: 0.048, fat: 0.033, qty: 3000, unitLabel: 'g' as const },
  { name: 'Chicken', refId: 'f-chicken', protein: 0.31, carbs: 0, fat: 0.036, qty: 2000, unitLabel: 'g' as const },
  { name: 'Rice', refId: 'f-rice', protein: 0.027, carbs: 0.28, fat: 0.003, qty: 3000, unitLabel: 'g' as const },
];

describe('generatePlan — recipes first', () => {
  it('places dishes rather than piles of raw ingredients', () => {
    const r = generatePlan({ items: stocked, goals, startDate: '2026-08-03', days: 2, mealsPerDay: 3, recipes, foods });
    const recipeEntries = r.entries.filter((e) => e.refType === 'recipe');
    expect(recipeEntries.length).toBeGreaterThan(0);
  });
  it('a dish only lands in a slot it belongs to — no chicken & rice at breakfast', () => {
    const r = generatePlan({ items: stocked, goals, startDate: '2026-08-03', days: 3, mealsPerDay: 3, recipes, foods });
    for (const e of r.entries.filter((x) => x.refType === 'recipe')) {
      const rec = recipes.find((x) => x.id === e.refId)!;
      expect(rec.meals).toContain(e.meal);
    }
    const breakfastRecipes = r.entries.filter((e) => e.meal === 'breakfast' && e.refType === 'recipe');
    expect(breakfastRecipes.every((e) => e.name === 'Overnight Oats')).toBe(true);
    expect(r.entries.some((e) => e.meal === 'dinner' && e.name === 'Chicken & Rice Bowl')).toBe(true);
  });
  it('cooking draws its ingredients down — stock is never oversold', () => {
    const thin = stocked.map((s) => (s.name === 'Oats' ? { ...s, qty: 60 } : s)); // exactly one portion of oats
    const r = generatePlan({ items: thin, goals, startDate: '2026-08-03', days: 5, mealsPerDay: 3, recipes, foods });
    const oatsMeals = r.entries.filter((e) => e.name === 'Overnight Oats').length;
    expect(oatsMeals).toBe(1); // only one portion was ever in stock
  });
  it('falls back to ingredients when a recipe is out of stock', () => {
    const noOats = stocked.filter((s) => s.name !== 'Oats');
    const r = generatePlan({ items: noOats, goals, startDate: '2026-08-03', days: 2, mealsPerDay: 3, recipes, foods });
    expect(r.entries.some((e) => e.name === 'Overnight Oats')).toBe(false);
    expect(r.entries.some((e) => e.refType !== 'recipe')).toBe(true);
  });
  it('recipe entries carry per-portion macros', () => {
    const r = generatePlan({ items: stocked, goals, startDate: '2026-08-03', days: 1, mealsPerDay: 3, recipes, foods });
    const bowl = r.entries.find((e) => e.name === 'Chicken & Rice Bowl');
    expect(bowl).toBeTruthy();
    expect(bowl!.protein).toBeCloseTo(31 * 2 + 2.7 * 2.5, 1); // 200g chicken + 250g rice
    expect(bowl!.servings).toBe(1);
  });
  it('the real starter pack produces meal-appropriate days', () => {
    let i = 0;
    const lib = makeStarterLibrary(() => `s${i++}`);
    const inventory = lib.foods.map((f) => ({
      name: f.name, refId: f.id,
      protein: f.unit === 'g100' ? f.protein / 100 : f.protein,
      carbs: f.unit === 'g100' ? f.carbs / 100 : f.carbs,
      fat: f.unit === 'g100' ? f.fat / 100 : f.fat,
      qty: f.unit === 'g100' ? 2000 : 30,
      unitLabel: f.unit === 'g100' ? ('g' as const) : null,
    }));
    const r = generatePlan({ items: inventory, goals, startDate: '2026-08-03', days: 7, mealsPerDay: 3, recipes: lib.recipes, foods: lib.foods });
    const dishes = r.entries.filter((e) => e.refType === 'recipe');
    expect(dishes.length).toBeGreaterThanOrEqual(14); // most slots are real meals
    for (const e of dishes) {
      const rec = lib.recipes.find((x) => x.id === e.refId)!;
      if (rec.meals && rec.meals.length) expect(rec.meals).toContain(e.meal);
    }
    expect(r.daysCovered).toBeGreaterThanOrEqual(6);
  });
});

describe('recipe helpers', () => {
  const batch = { id: 'r-batch', name: 'Batch Chili', portions: 4, items: [{ foodId: 'f-chicken', servings: 800 }] };
  it('a batch recipe costs one portion per meal', () => {
    const need = recipeConsumption(batch, foods);
    expect(need).toEqual([{ name: 'Chicken', qty: 200 }]);
  });
  it('per-portion macros divide by portions', () => {
    const m = recipeMacrosPerPortion(batch, foods);
    expect(m.protein).toBeCloseTo(31 * 2, 1); // 800g/4 = 200g chicken
  });
  it('missing foods are skipped, not crashed on', () => {
    const broken = { id: 'x', name: 'Broken', portions: 1, items: [{ foodId: 'gone', servings: 100 }] };
    expect(recipeConsumption(broken, foods)).toEqual([]);
    expect(calsFrom(...Object.values(recipeMacrosPerPortion(broken, foods)) as [number, number, number])).toBe(0);
  });
});

describe('consumePantry', () => {
  const pantry = [
    { id: 'p1', name: 'Chicken breast', qty: 1000 },
    { id: 'p2', name: 'Rice', qty: 5 },
  ];
  it('subtracts what was eaten', () => {
    const out = consumePantry(pantry, [{ name: 'Chicken breast', qty: 250 }]);
    expect(out.find((p) => p.id === 'p1')!.qty).toBe(750);
    expect(out.find((p) => p.id === 'p2')!.qty).toBe(5);
  });
  it('drops rows that run out and never goes negative', () => {
    const out = consumePantry(pantry, [{ name: 'Rice', qty: 9 }]);
    expect(out.find((p) => p.id === 'p2')).toBeUndefined();
    expect(out.every((p) => p.qty > 0)).toBe(true);
  });
  it('matches case-insensitively and ignores food you never stocked', () => {
    const out = consumePantry(pantry, [{ name: 'chicken BREAST', qty: 100 }, { name: 'Caviar', qty: 3 }]);
    expect(out.find((p) => p.id === 'p1')!.qty).toBe(900);
    expect(out).toHaveLength(2);
  });
  it('merges repeated items and no-ops on an empty list', () => {
    const out = consumePantry(pantry, [{ name: 'Rice', qty: 2 }, { name: 'Rice', qty: 1 }]);
    expect(out.find((p) => p.id === 'p2')!.qty).toBe(2);
    expect(consumePantry(pantry, [])).toBe(pantry);
  });
});

describe('take / return — undoing a log must restore stock exactly', () => {
  const pantry = [
    { id: 'p1', name: 'Chicken breast', category: 'Protein', qty: 1000, unitLabel: 'g' as const, protein: 0.31, carbs: 0, fat: 0.036 },
    { id: 'p2', name: 'Rice', category: 'Grains', qty: 5, unitLabel: null, protein: 4, carbs: 45, fat: 0 },
  ];
  let n = 0;
  const idFn = () => `new${n++}`;
  it('reports what it actually took', () => {
    const { pantry: after, taken } = takeFromPantry(pantry, [{ name: 'Chicken breast', qty: 250 }]);
    expect(after.find((p) => p.id === 'p1')!.qty).toBe(750);
    expect(taken).toEqual([{ name: 'Chicken breast', qty: 250, category: 'Protein', unitLabel: 'g', protein: 0.31, carbs: 0, fat: 0.036 }]);
  });
  it('logging then deleting leaves the pantry exactly as it started', () => {
    const { pantry: after, taken } = takeFromPantry(pantry, [{ name: 'Chicken breast', qty: 250 }]);
    const restored = returnToPantry(after, taken, idFn);
    expect(restored.find((p) => p.name === 'Chicken breast')!.qty).toBe(1000);
    expect(restored).toHaveLength(2);
  });
  it('a row emptied to zero comes back from its snapshot', () => {
    const { pantry: after, taken } = takeFromPantry(pantry, [{ name: 'Rice', qty: 5 }]);
    expect(after.find((p) => p.name === 'Rice')).toBeUndefined();
    const restored = returnToPantry(after, taken, idFn);
    const rice = restored.find((p) => p.name === 'Rice')!;
    expect(rice.qty).toBe(5);
    expect(rice.protein).toBe(4);
    expect(rice.category).toBe('Grains');
  });
  it("never takes more than is there, and never gives back what it didn't take", () => {
    const { pantry: after, taken } = takeFromPantry(pantry, [{ name: 'Rice', qty: 99 }]);
    expect(taken[0].qty).toBe(5);                       // only what existed
    expect(returnToPantry(after, taken, idFn).find((p) => p.name === 'Rice')!.qty).toBe(5);
  });
  it('food you never stocked is ignored — eating out cannot create pantry rows', () => {
    const { pantry: after, taken } = takeFromPantry(pantry, [{ name: 'Restaurant burrito', qty: 1 }]);
    expect(taken).toEqual([]);
    expect(returnToPantry(after, taken, idFn)).toHaveLength(2); // nothing invented
  });
  it('scaleTaken supports correcting an amount after the fact', () => {
    const { taken } = takeFromPantry(pantry, [{ name: 'Chicken breast', qty: 200 }]);
    expect(scaleTaken(taken, 0.5)[0].qty).toBe(100);
    expect(scaleTaken(taken, 0)).toEqual([]);
  });
});

describe('reconcileTaken — correcting an amount settles exactly', () => {
  const had = [{ name: 'Chicken', qty: 100, category: 'Protein', unitLabel: 'g' as const, protein: 0.31, carbs: 0, fat: 0.036 }];
  it('raising the amount asks only for the difference', () => {
    const { take, give, kept } = reconcileTaken(had, [{ name: 'Chicken', qty: 300 }]);
    expect(take).toEqual([{ name: 'Chicken', qty: 200 }]);
    expect(give).toEqual([]);
    expect(kept[0].qty).toBe(100);
  });
  it('lowering the amount gives back only the difference', () => {
    const { take, give, kept } = reconcileTaken(had, [{ name: 'Chicken', qty: 40 }]);
    expect(take).toEqual([]);
    expect(give[0].qty).toBe(60);
    expect(kept[0].qty).toBe(40);
  });
  it('zeroing an entry returns everything', () => {
    const { give, kept } = reconcileTaken(had, []);
    expect(give[0].qty).toBe(100);
    expect(kept).toEqual([]);
  });
  it('repeated nudges never drift — 300 down to 150 in 15 steps lands exactly', () => {
    let current = [{ ...had[0], qty: 300 }];
    let returned = 0;
    for (let q = 290; q >= 150; q -= 10) {
      const { give, kept } = reconcileTaken(current, [{ name: 'Chicken', qty: q }]);
      returned += give.reduce((s, g) => s + g.qty, 0);
      current = kept;
    }
    expect(returned).toBe(150);              // exactly the 150g no longer eaten
    expect(current[0].qty).toBe(150);
  });
  it('handles a recipe touching several ingredients at once', () => {
    const multi = [
      { name: 'Oats', qty: 60, protein: 0.132, carbs: 0.67, fat: 0.065 },
      { name: 'Milk', qty: 200, protein: 0.032, carbs: 0.048, fat: 0.033 },
    ];
    const { take, give } = reconcileTaken(multi, [{ name: 'Oats', qty: 120 }, { name: 'Milk', qty: 100 }]);
    expect(take).toEqual([{ name: 'Oats', qty: 60 }]);
    expect(give.map((g) => [g.name, g.qty])).toEqual([['Milk', 100]]);
  });
});
