import { describe, it, expect } from 'vitest';
import { STARTER_FOODS, STARTER_RECIPES, makeStarterLibrary, upgradeStarterLibrary, mergeStarterLibrary } from './starter';
import { calsFrom } from './engine';

describe('upgradeStarterLibrary', () => {
  let n = 0;
  const idFn = () => `u${n++}`;
  it('adds staples an early install never received', () => {
    const old = [{ id: 'a', name: 'Chicken breast', protein: 31, carbs: 0, fat: 3.6 }];
    const up = upgradeStarterLibrary(old, [], idFn);
    expect(up.addedFoods).toBe(STARTER_FOODS.length - 1);
    expect(up.foods.some((f) => f.name === 'Tomato')).toBe(true);
    expect(up.foods.filter((f) => f.name === 'Chicken breast')).toHaveLength(1); // no duplicate
  });
  it('backfills meal tags on untagged starter recipes', () => {
    const untagged = [{ id: 'r1', name: 'Overnight Oats', items: [] }];
    const up = upgradeStarterLibrary(STARTER_FOODS.map((f, i) => ({ id: `f${i}`, ...f })), untagged, idFn);
    expect(up.taggedRecipes).toBe(1);
    expect(up.recipes[0].meals).toEqual(['breakfast']);
    expect(up.addedFoods).toBe(0);
  });
  it("leaves the user's own recipes and existing tags alone", () => {
    const mine = [
      { id: 'r1', name: 'Grandma Chili', items: [] },
      { id: 'r2', name: 'Overnight Oats', meals: ['dinner'], items: [] },
    ];
    const up = upgradeStarterLibrary([], mine, idFn);
    expect(up.recipes[0].meals).toBeUndefined();
    expect(up.recipes[1].meals).toEqual(['dinner']); // user's choice wins
    expect(up.taggedRecipes).toBe(0);
  });
});

describe('mergeStarterLibrary — adding the pack later', () => {
  let n = 0;
  const idFn = () => `m${n++}`;
  it('fills an empty library completely, recipes wired to real foods', () => {
    const out = mergeStarterLibrary([], [], idFn);
    expect(out.addedFoods).toBe(STARTER_FOODS.length);
    expect(out.addedRecipes).toBe(STARTER_RECIPES.length);
    const ids = new Set(out.foods.map((f) => f.id));
    for (const r of out.recipes) {
      expect(r.items.length).toBeGreaterThan(0);
      for (const it of r.items) expect(ids.has(it.foodId)).toBe(true);
    }
  });
  it('running it twice changes nothing', () => {
    const first = mergeStarterLibrary([], [], idFn);
    const second = mergeStarterLibrary(first.foods, first.recipes, idFn);
    expect(second.addedFoods).toBe(0);
    expect(second.addedRecipes).toBe(0);
    expect(second.foods).toHaveLength(first.foods.length);
    expect(second.recipes).toHaveLength(first.recipes.length);
  });
  it("keeps the user's own edits and never duplicates by name", () => {
    const mine = [{ id: 'mine', name: 'Chicken breast', protein: 99, carbs: 0, fat: 0 }];
    const myRecipe = [{ id: 'r', name: 'Overnight Oats', items: [], portions: 3 }];
    const out = mergeStarterLibrary(mine, myRecipe, idFn);
    expect(out.foods.filter((f) => f.name.toLowerCase() === 'chicken breast')).toHaveLength(1);
    expect(out.foods.find((f) => f.id === 'mine').protein).toBe(99); // their numbers survive
    expect(out.recipes.filter((r) => r.name === 'Overnight Oats')).toHaveLength(1);
    expect(out.recipes.find((r) => r.id === 'r').portions).toBe(3);
  });
  it('new recipes bind to the existing food rows, not fresh copies', () => {
    const mine = [{ id: 'mine', name: 'Chicken breast', protein: 31, carbs: 0, fat: 3.6 }];
    const out = mergeStarterLibrary(mine, [], idFn);
    const bowl = out.recipes.find((r) => r.name === 'Chicken & Rice Bowl');
    expect(bowl.items.some((it) => it.foodId === 'mine')).toBe(true);
  });
});

const CATEGORIES = ['Produce', 'Protein', 'Dairy & Eggs', 'Grains', 'Pantry', 'Frozen', 'Snacks', 'Beverages', 'Other'];

describe('starter pack', () => {
  it('every food has a valid category, unit, and non-zero calories', () => {
    for (const f of STARTER_FOODS) {
      expect(CATEGORIES).toContain(f.category);
      expect(['serving', 'g100']).toContain(f.unit);
      expect(calsFrom(f.protein, f.carbs, f.fat)).toBeGreaterThan(0);
    }
  });
  it('food names are unique', () => {
    const names = STARTER_FOODS.map((f) => f.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
  it('every recipe ingredient resolves to a starter food', () => {
    const names = new Set(STARTER_FOODS.map((f) => f.name));
    for (const r of STARTER_RECIPES) for (const [name] of r.items) expect(names.has(name)).toBe(true);
  });
  it('makeStarterLibrary wires recipe items to real food ids', () => {
    let i = 0;
    const lib = makeStarterLibrary(() => `id${i++}`);
    expect(lib.foods.length).toBe(STARTER_FOODS.length);
    expect(lib.recipes.length).toBe(STARTER_RECIPES.length);
    const ids = new Set(lib.foods.map((f) => f.id));
    for (const r of lib.recipes) for (const it of r.items) expect(ids.has(it.foodId)).toBe(true);
  });
  it('the pack leans whole-foods: protein and produce dominate', () => {
    const byCat = STARTER_FOODS.reduce((m, f) => { m[f.category] = (m[f.category] || 0) + 1; return m; }, {});
    expect((byCat['Protein'] || 0) + (byCat['Produce'] || 0)).toBeGreaterThan(STARTER_FOODS.length / 2 - 1);
    expect(byCat['Snacks'] || 0).toBe(0);
  });
});
