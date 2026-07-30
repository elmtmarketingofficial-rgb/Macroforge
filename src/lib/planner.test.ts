import { describe, it, expect } from 'vitest';
import { generatePlan } from './planner';
import { entryMacros } from './engine';

const goals = { protein: 150, carbs: 180, fat: 60 };

const pantryStaples = [
  { name: 'Chicken breast', refId: 'f1', protein: 31, carbs: 0, fat: 4, qty: 14, unitLabel: null },
  { name: 'Rice', refId: 'f2', protein: 4, carbs: 45, fat: 0, qty: 14, unitLabel: null },
  { name: 'Olive oil', refId: 'f3', protein: 0, carbs: 0, fat: 14, qty: 20, unitLabel: null },
  { name: 'Greek yogurt', refId: 'f4', protein: 0.1, carbs: 0.04, fat: 0.004, qty: 1400, unitLabel: 'g' as const },
];

describe('generatePlan', () => {
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
    expect(r.shortfall.protein).toBeGreaterThan(900); // 1050 needed, ~62 available
    expect(r.shortfall.carbs).toBe(7 * 180);
    expect(r.daysCovered).toBeLessThanOrEqual(1);
  });
  it('respects mealsPerDay when slotting', () => {
    const r = generatePlan({ items: pantryStaples, goals, startDate: '2026-08-03', days: 2, mealsPerDay: 5 });
    // 5 meals map onto breakfast/lunch/dinner + snack overflow
    expect(r.entries.some((e) => e.meal === 'snack')).toBe(true);
  });
  it('handles an empty grocery list without exploding', () => {
    const r = generatePlan({ items: [], goals, startDate: '2026-08-03', days: 7, mealsPerDay: 3 });
    expect(r.entries).toHaveLength(0);
    expect(r.shortfall.protein).toBe(7 * 150);
  });
});
