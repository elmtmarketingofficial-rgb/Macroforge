/* Ingredients-first meal planning: the plan is generated FROM what's on the
   grocery list (and in the pantry) against the user's macro targets. */
import { num, round, calsFrom, addDays, type Macros } from './engine';

export type InventoryItem = {
  name: string; category?: string;
  protein: any; carbs: any; fat: any;      // per unit (per serving, or per gram when unitLabel 'g')
  qty: any;                                 // servings, or grams
  unitLabel?: 'g' | null;
  refId?: string | null;
};

export type PlanDraft = {
  date: string; meal: string; refType: 'food' | 'custom'; refId: string | null;
  name: string; servings: number; unitLabel: 'g' | null;
  protein: number; carbs: number; fat: number;
};

export type PlanResult = {
  entries: PlanDraft[];
  planned: Macros;         // total macros the generated plan provides
  target: Macros;          // days × daily goals
  shortfall: Macros;       // target − planned, clamped ≥ 0 per macro
  daysCovered: number;
};

const SLOT_IDS = ['breakfast', 'lunch', 'dinner'];
const slotFor = (mealIndex: number): string => SLOT_IDS[mealIndex] || 'snack';

const MKEYS: (keyof Macros)[] = ['protein', 'carbs', 'fat'];

/** Greedy allocation: walk each day's meal slots, repeatedly adding a portion of
 *  whichever inventory item best fills that meal's remaining macro gap, until the
 *  meal is ~full or the groceries run out. Deterministic. */
export function generatePlan({ items, goals, startDate, days = 7, mealsPerDay = 3 }: {
  items: InventoryItem[]; goals: { protein: any; carbs: any; fat: any };
  startDate: string; days?: number; mealsPerDay?: number;
}): PlanResult {
  const daily: Macros = { protein: num(goals.protein), carbs: num(goals.carbs), fat: num(goals.fat) };
  const dailyCals = calsFrom(daily.protein, daily.carbs, daily.fat);
  const meals = Math.max(1, Math.min(8, Math.round(mealsPerDay) || 3));
  const perMeal: Macros = { protein: daily.protein / meals, carbs: daily.carbs / meals, fat: daily.fat / meals };
  const perMealCals = dailyCals / meals;

  // working inventory: qty remaining, portion step (1 serving / 50 g)
  const inv = items
    .filter((it) => (num(it.qty) || 0) > 0 && calsFrom(it.protein, it.carbs, it.fat) > 0)
    .map((it) => ({
      ...it,
      left: num(it.qty),
      step: it.unitLabel === 'g' ? 50 : 1,
    }));

  const entries: PlanDraft[] = [];
  const planned: Macros = { protein: 0, carbs: 0, fat: 0 };

  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    for (let m = 0; m < meals; m++) {
      const got: Macros = { protein: 0, carbs: 0, fat: 0 };
      const mealEntries: Record<string, PlanDraft> = {};
      let guard = 0;
      while (guard++ < 40) {
        const gotCals = calsFrom(got.protein, got.carbs, got.fat);
        if (perMealCals > 0 && gotCals >= perMealCals * 0.95) break;
        // remaining gap for this meal, clamped positive
        const gap = MKEYS.map((k) => Math.max(0, perMeal[k] - got[k]));
        const gapTotal = gap.reduce((a, b) => a + b, 0);
        if (gapTotal <= 0) break;
        // best item: most gap-filling grams per portion, don't blow past the meal's kcal
        let best: { it: (typeof inv)[number]; fill: number } | null = null;
        for (const it of inv) {
          if (it.left < it.step * 0.999) continue;
          const step = Math.min(it.step, it.left);
          const stepCals = calsFrom(it.protein, it.carbs, it.fat) * step;
          if (perMealCals > 0 && gotCals + stepCals > perMealCals * 1.25) continue;
          const fill = MKEYS.reduce((s, k, i) => s + Math.min(num(it[k]) * step, gap[i]), 0);
          if (fill > 0 && (!best || fill > best.fill)) best = { it, fill };
        }
        if (!best) break;
        const it = best.it;
        const step = Math.min(it.step, it.left);
        it.left = round(it.left - step);
        MKEYS.forEach((k) => { got[k] += num(it[k]) * step; planned[k] += num(it[k]) * step; });
        const key = it.name.toLowerCase();
        if (mealEntries[key]) mealEntries[key].servings = round(mealEntries[key].servings + step);
        else mealEntries[key] = {
          date, meal: slotFor(m), refType: it.refId ? 'food' : 'custom', refId: it.refId || null,
          name: it.name, servings: step, unitLabel: it.unitLabel === 'g' ? 'g' : null,
          protein: num(it.protein), carbs: num(it.carbs), fat: num(it.fat),
        };
      }
      entries.push(...Object.values(mealEntries));
    }
  }

  const target: Macros = { protein: daily.protein * days, carbs: daily.carbs * days, fat: daily.fat * days };
  const shortfall: Macros = {
    protein: Math.max(0, round(target.protein - planned.protein)),
    carbs: Math.max(0, round(target.carbs - planned.carbs)),
    fat: Math.max(0, round(target.fat - planned.fat)),
  };
  const plannedCals = calsFrom(planned.protein, planned.carbs, planned.fat);
  const daysCovered = dailyCals > 0 ? Math.min(days, round(plannedCals / dailyCals)) : days;
  return { entries, planned, target, shortfall, daysCovered };
}
