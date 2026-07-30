import { describe, it, expect } from 'vitest';
import { num, calsFrom, e1rm, addDays, daysBetween, parseISO, entryMacros, weightTrend, computeTDEE, mifflin, suggestMacros, dayScore, foodPortion, isPer100g } from './engine';
import { aggregatePlan } from './grocery';
import { normalizeImport } from './importer';

describe('basics', () => {
  it('num handles junk', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num('')).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('abc')).toBe(0);
  });
  it('calsFrom uses 4/4/9', () => {
    expect(calsFrom(10, 10, 10)).toBe(170);
    expect(calsFrom('25', '0', '0')).toBe(100);
  });
  it('e1rm Epley', () => {
    expect(e1rm(100, 1)).toBeCloseTo(103.33, 1);
    expect(e1rm(185, 8)).toBeCloseTo(234.33, 1);
    expect(e1rm(0, 5)).toBe(0);
    expect(e1rm(100, 0)).toBe(0);
  });
  it('entryMacros multiplies by servings', () => {
    const t = entryMacros([{ date: 'x', servings: 2, protein: 10, carbs: 5, fat: 1 }]);
    expect(t).toEqual({ protein: 20, carbs: 10, fat: 2 });
  });
});

describe('dates are timezone-safe', () => {
  it('parseISO is local, not UTC', () => {
    const d = parseISO('2026-07-30');
    expect(d.getDate()).toBe(30);
    expect(d.getMonth()).toBe(6);
  });
  it('addDays crosses months', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-07-01', '2026-07-29')).toBe(28);
  });
});

describe('weightTrend', () => {
  it('smooths with alpha .25 and sorts by date', () => {
    const t = weightTrend([
      { date: '2026-07-03', weight: 204 },
      { date: '2026-07-01', weight: 200 },
      { date: '2026-07-02', weight: 208 },
    ]);
    expect(t.map((x) => x.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(t[0].trend).toBe(200);
    expect(t[1].trend).toBe(202); // 200 + .25*8
    expect(t[2].trend).toBe(202.5); // 202 + .25*2
  });
  it('skips zero/invalid weights', () => {
    expect(weightTrend([{ date: '2026-07-01', weight: 0 }, { date: '2026-07-02', weight: '' }])).toHaveLength(0);
  });
});

describe('computeTDEE', () => {
  const today = '2026-07-28';
  const mkLog = (kcalPerDay: number, days: number) =>
    Array.from({ length: days }, (_, i) => ({ date: addDays(today, -i), servings: 1, protein: kcalPerDay / 4, carbs: 0, fat: 0 }));
  it('needs 14 logged days', () => {
    const r = computeTDEE({ log: mkLog(2500, 10), weights: [{ date: addDays(today, -20), weight: 205 }, { date: today, weight: 203 }], unit: 'lb', today });
    expect(r.ok).toBe(false);
  });
  it('maintenance: stable weight → TDEE = avg intake', () => {
    const weights = Array.from({ length: 21 }, (_, i) => ({ date: addDays(today, -i), weight: 205 }));
    const r = computeTDEE({ log: mkLog(2500, 21), weights, unit: 'lb', today });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tdee).toBe(2500);
  });
  it('cutting: losing 2lb over 20 days at 2500 intake → TDEE ≈ 2850', () => {
    // trend change approximates raw change with steady decline; use linear weights
    const weights = Array.from({ length: 21 }, (_, i) => ({ date: addDays(today, -(20 - i)), weight: 207 - (i * 2) / 20 }));
    const r = computeTDEE({ log: mkLog(2500, 21), weights, unit: 'lb', today });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tdee).toBeGreaterThan(2650); // smoothing lags the raw 2lb drop
      expect(r.tdee).toBeLessThan(2900);
    }
  });
});

describe('mifflin + suggestMacros', () => {
  it('mifflin male 28y 180cm 205lb moderate', () => {
    const t = mifflin({ sex: 'male', age: 28, heightCm: 180, weight: 205, unit: 'lb', activity: 1.55 });
    // BMR = 10*92.99 + 6.25*180 - 5*28 + 5 = 929.9+1125-140+5 = 1919.9 → ×1.55 ≈ 2976
    expect(t).toBeGreaterThan(2950); expect(t).toBeLessThan(3000);
  });
  it('returns 0 when profile incomplete', () => {
    expect(mifflin({ unit: 'lb' })).toBe(0);
  });
  it('suggestMacros cut 1lb/wk from 2850', () => {
    const s = suggestMacros({ tdee: 2850, goalType: 'cut', rate: 1, trendWeight: 205, unit: 'lb' });
    expect(s.kcal).toBe(2350);
    expect(s.protein).toBe(205); // 1g/lb
    expect(s.fat).toBe(Math.round((2350 * 0.25) / 9));
    expect(s.protein * 4 + s.carbs * 4 + s.fat * 9).toBeLessThanOrEqual(2350 + 4);
  });
  it('kcal floor at 1200', () => {
    const s = suggestMacros({ tdee: 1400, goalType: 'cut', rate: 2, trendWeight: 120, unit: 'lb' });
    expect(s.kcal).toBe(1200);
  });
});

describe('dayScore', () => {
  const goals = { protein: 200, carbs: 250, fat: 70 };
  it('null without goals, 0 when unlogged', () => {
    expect(dayScore({ protein: 0, carbs: 0, fat: 0 }, { protein: '', carbs: '', fat: '' })).toBeNull();
    expect(dayScore({ protein: 0, carbs: 0, fat: 0 }, goals)).toBe(0);
  });
  it('perfect day = 1', () => {
    expect(dayScore({ protein: 200, carbs: 250, fat: 70 }, goals)).toBe(1);
  });
  it('half-hit day', () => {
    // protein hit, carbs way over, fat hit, cals off
    const s = dayScore({ protein: 200, carbs: 400, fat: 70 }, goals);
    expect(s).toBe(0.5);
  });
});

describe('foodPortion (per-100g foods)', () => {
  const chicken100 = { name: 'Chicken breast', protein: 31, carbs: 0, fat: 3.6, unit: 'g100' };
  it('per-serving foods pass through with qty 1', () => {
    const p = foodPortion({ protein: 6, carbs: 0, fat: 5 });
    expect(p).toMatchObject({ protein: 6, carbs: 0, fat: 5, qty: 1, unitLabel: null });
  });
  it('per-100g foods snapshot per-GRAM macros with 100 g default', () => {
    const p = foodPortion(chicken100);
    expect(p.protein).toBeCloseTo(0.31);
    expect(p.fat).toBeCloseTo(0.036);
    expect(p.qty).toBe(100);
    expect(p.unitLabel).toBe('g');
  });
  it('entry math stays uniform: 150 g of chicken = 46.5g protein', () => {
    const p = foodPortion(chicken100);
    const t = entryMacros([{ date: 'x', servings: 150, protein: p.protein, carbs: p.carbs, fat: p.fat }]);
    expect(t.protein).toBeCloseTo(46.5);
  });
  it('isPer100g guards junk', () => {
    expect(isPer100g(null)).toBe(false);
    expect(isPer100g({ unit: 'serving' })).toBe(false);
    expect(isPer100g({ unit: 'g100' })).toBe(true);
  });
});

describe('aggregatePlan', () => {
  const foods = [
    { id: 'f1', name: 'Chicken breast', category: 'Protein', protein: 31, carbs: 0, fat: 4 },
    { id: 'f2', name: 'Rice', category: 'Grains', protein: 4, carbs: 45, fat: 0 },
  ];
  const recipes = [{ id: 'r1', name: 'Bowl', items: [{ foodId: 'f1', servings: 2 }, { foodId: 'f2', servings: 1.5 }] }];
  it('explodes recipes and merges duplicates across days', () => {
    const plan = [
      { date: '2026-07-27', refType: 'recipe', refId: 'r1', name: 'Bowl', servings: 1, protein: 0, carbs: 0, fat: 0 },
      { date: '2026-07-28', refType: 'recipe', refId: 'r1', name: 'Bowl', servings: 2, protein: 0, carbs: 0, fat: 0 },
      { date: '2026-07-28', refType: 'food', refId: 'f1', name: 'Chicken breast', servings: 1, protein: 31, carbs: 0, fat: 4 },
    ];
    const out = aggregatePlan({ plan, recipes, foods, from: '2026-07-27', to: '2026-07-28' });
    const chicken = out.find((x) => x.name === 'Chicken breast')!;
    const rice = out.find((x) => x.name === 'Rice')!;
    expect(chicken.qty).toBe(7); // 2*1 + 2*2 + 1
    expect(rice.qty).toBe(4.5); // 1.5*1 + 1.5*2
    expect(chicken.category).toBe('Protein');
  });
  it('respects date range and falls back for custom items', () => {
    const plan = [
      { date: '2026-07-20', refType: 'food', refId: 'f1', name: 'Chicken breast', servings: 5, protein: 31, carbs: 0, fat: 4 },
      { date: '2026-07-28', refType: 'custom', refId: null, name: 'Mystery bar', servings: 2, protein: 10, carbs: 20, fat: 5 },
    ];
    const out = aggregatePlan({ plan, recipes, foods, from: '2026-07-27', to: '2026-07-29' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Mystery bar', category: 'Other', qty: 2, protein: 10 });
  });
  it('per-100g foods aggregate in grams with per-gram macros', () => {
    const g100foods = [{ id: 'f3', name: 'Greek yogurt', category: 'Dairy & Eggs', protein: 10, carbs: 4, fat: 0.4, unit: 'g100' }];
    const g100recipes = [{ id: 'r2', name: 'Parfait', items: [{ foodId: 'f3', servings: 150 }] }];
    const plan = [
      { date: '2026-07-28', refType: 'food', refId: 'f3', name: 'Greek yogurt', servings: 200, unitLabel: 'g', protein: 0.1, carbs: 0.04, fat: 0.004 },
      { date: '2026-07-29', refType: 'recipe', refId: 'r2', name: 'Parfait', servings: 2, protein: 0, carbs: 0, fat: 0 },
    ];
    const out = aggregatePlan({ plan, recipes: g100recipes, foods: g100foods, from: '2026-07-28', to: '2026-07-29' });
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(500); // 200 g direct + 150 g × 2 servings of the recipe
    expect(out[0].unitLabel).toBe('g');
    expect(out[0].protein).toBeCloseTo(0.1); // per gram
    expect(out[0].qty * out[0].protein).toBeCloseTo(50); // list nutrition math
  });
});

describe('normalizeImport', () => {
  it('v1 export maps to v2 shapes', () => {
    const v1 = {
      app: 'MacroForge', version: 2,
      goals: { protein: '190', carbs: '230', fat: '72', days: 7, unit: 'lb' },
      foods: [{ id: 'a', name: 'Eggs', category: 'Dairy & Eggs', protein: 6, carbs: 0, fat: 5 }],
      log: [{ id: 'l1', date: '2026-07-01', foodId: 'a', name: 'Eggs', servings: 3, protein: 6, carbs: 0, fat: 5 }],
      workouts: [{ id: 'w1', date: '2026-07-01', title: 'Push', exercises: [{ id: 'e', name: 'Bench', sets: [{ id: 's', weight: '185', reps: '8' }] }] }],
      groceries: [{ id: 'g', name: 'Rice', category: 'Grains', qty: 2, protein: 4, carbs: 45, fat: 0, checked: false }],
    };
    const n = normalizeImport(v1);
    expect(n.settings.unit).toBe('lb');
    expect(n.settings.goals.protein).toBe('190');
    expect(n.foods![0].favorite).toBe(false);
    expect(n.log![0].meal).toBe('snack');
    expect(n.log![0].refType).toBe('food');
    expect(n.workouts![0].exercises[0].sets[0].done).toBe(true);
    expect(n.workouts![0].exercises[0].rest).toBe(90);
    expect(n.groceries![0].source).toBe('manual');
  });
  it('v2+ export passes through', () => {
    const n = normalizeImport({ settings: { unit: 'kg' }, weights: [{ id: 'x', date: '2026-07-01', weight: 93 }] });
    expect(n.settings.unit).toBe('kg');
    expect(n.weights).toHaveLength(1);
  });
  it('rejects garbage', () => {
    expect(() => normalizeImport(null)).toThrow();
  });
});
