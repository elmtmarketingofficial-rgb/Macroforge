import { describe, it, expect } from 'vitest';
import { STARTER_FOODS, STARTER_RECIPES, makeStarterLibrary } from './starter';
import { calsFrom } from './engine';

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
