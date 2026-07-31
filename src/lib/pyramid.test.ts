import { describe, it, expect } from 'vitest';
import { qualityWeight, weeklyNeed, listTotals, remainingGap, scoreScan } from './pyramid';

const goals = { protein: 200, carbs: 250, fat: 70 };

describe('qualityWeight (inverted pyramid)', () => {
  it('protein whole foods sit at the foundation', () => {
    expect(qualityWeight({ category: 'Protein' }).weight).toBe(1);
    expect(qualityWeight({ offGroups: ['en:meat'] }).weight).toBe(1);
  });
  it('snacks/sweets sit at the tip', () => {
    expect(qualityWeight({ category: 'Snacks' }).weight).toBeLessThanOrEqual(0.2);
    expect(qualityWeight({ offGroups: ['en:sweet-snacks'] }).weight).toBeLessThanOrEqual(0.2);
  });
  it('NOVA 4 caps the weight regardless of category', () => {
    const q = qualityWeight({ category: 'Protein', nova: 4 });
    expect(q.weight).toBeLessThanOrEqual(0.25);
    expect(q.reasons.join(' ')).toContain('ultra-processed');
  });
  it('high sugar is penalized', () => {
    const base = qualityWeight({ category: 'Produce' }).weight;
    expect(qualityWeight({ category: 'Produce', sugarPer100: 35 }).weight).toBeLessThan(base);
  });
  it('no signal at all → known:false, neutral weight', () => {
    const q = qualityWeight({});
    expect(q.known).toBe(false);
    expect(q.weight).toBe(0.5);
  });
});

describe('weekly gap math', () => {
  it('weeklyNeed = daily × 7', () => {
    expect(weeklyNeed(goals)).toEqual({ protein: 1400, carbs: 1750, fat: 490 });
  });
  it('listTotals multiplies qty × per-unit macros', () => {
    const t = listTotals([{ qty: 5, protein: 31, carbs: 0, fat: 4 }, { qty: 200, protein: 0.1, carbs: 0.04, fat: 0 }]);
    expect(t.protein).toBeCloseTo(175);
    expect(t.carbs).toBeCloseTo(8);
  });
  it('remainingGap subtracts list coverage from the week', () => {
    const gap = remainingGap(goals, [{ qty: 10, protein: 31, carbs: 0, fat: 4 }]);
    expect(gap.protein).toBe(1400 - 310);
    expect(gap.carbs).toBe(1750);
  });
});

describe('scoreScan', () => {
  const chicken = { protein: 31, carbs: 0, fat: 3.6, category: 'Protein', nova: 1 };
  const candy = { protein: 2, carbs: 60, fat: 25, category: 'Snacks', nova: 4, sugarPer100: 55 };
  it('protein whole food scores great against a protein-hungry week', () => {
    const s = scoreScan({ item: chicken, goals, list: [] });
    expect(s.verdict).toBe('great');
    expect(s.score).toBeGreaterThanOrEqual(70);
  });
  it('ultra-processed sugar scores poor even when carbs are needed', () => {
    const s = scoreScan({ item: candy, goals, list: [] });
    expect(s.verdict).toBe('poor');
  });
  it('NOVA 4 caps the verdict at poor no matter how well macros fit', () => {
    const processedProtein = { protein: 30, carbs: 5, fat: 3, category: 'Protein', nova: 4 };
    const s = scoreScan({ item: processedProtein, goals, list: [] });
    expect(s.verdict).toBe('poor');
    expect(s.score).toBeLessThanOrEqual(44);
  });
  it('water (zero calories) scores great on quality alone', () => {
    const water = { protein: 0, carbs: 0, fat: 0, offGroups: ['en:spring-water', 'en:beverages'], nova: 1 };
    const s = scoreScan({ item: water, goals, list: [] });
    expect(s.verdict).toBe('great');
    expect(s.reasons.join(' ')).toContain('zero calories');
  });
  it('zero-calorie ultra-processed (diet soda) still scores poor', () => {
    const soda = { protein: 0, carbs: 0, fat: 0, offGroups: ['en:sodas', 'en:beverages'], nova: 4 };
    const s = scoreScan({ item: soda, goals, list: [] });
    expect(s.verdict).toBe('poor');
  });
  it('a full list flattens the fit signal and says so', () => {
    const bigList = [{ qty: 100, protein: 20, carbs: 25, fat: 7 }]; // way past weekly need
    const s = scoreScan({ item: chicken, goals, list: bigList });
    expect(s.reasons.join(' ')).toContain('already covers');
  });
  it('per-meal gap respects mealsPerDay', () => {
    const s3 = scoreScan({ item: chicken, goals, list: [], mealsPerDay: 3 });
    const s5 = scoreScan({ item: chicken, goals, list: [], mealsPerDay: 5 });
    expect(s3.perMealGap.protein).toBeCloseTo(1400 / 21);
    expect(s5.perMealGap.protein).toBeCloseTo(1400 / 35);
  });
});
