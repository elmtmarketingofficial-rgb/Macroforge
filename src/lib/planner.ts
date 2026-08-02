/* Ingredients-first meal planning: the plan is generated FROM what's on the
   grocery list (and in the pantry) against the user's macro targets.
   Recipes come first — a generated day should read like food a person eats
   (Overnight Oats, Salmon Plate), not a pile of raw ingredients — with
   ingredient allocation filling whatever the recipes leave short. */
import { num, round, calsFrom, addDays, foodPortion, type Macros } from './engine';

export type InventoryItem = {
  name: string; category?: string;
  protein: any; carbs: any; fat: any;      // per unit (per serving, or per gram when unitLabel 'g')
  qty: any;                                 // servings, or grams
  unitLabel?: 'g' | null;
  refId?: string | null;
};

export type PlannerFood = { id: string; name: string; protein: any; carbs: any; fat: any; unit?: string };
export type PlannerRecipe = {
  id: string; name: string; emoji?: string; portions?: any;
  items: { foodId: string; servings: any }[];
  meals?: string[];                         // slot ids this suits; absent = any slot
};

export type PlanDraft = {
  date: string; meal: string; refType: 'food' | 'custom' | 'recipe'; refId: string | null;
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
const key = (name: any) => String(name || '').trim().toLowerCase();

const MKEYS: (keyof Macros)[] = ['protein', 'carbs', 'fat'];

/* ---- pantry bookkeeping ---- */
export type Consumption = { name: string; qty: number };

/** What one portion of a recipe takes out of stock. */
export function recipeConsumption(recipe: PlannerRecipe, foods: PlannerFood[]): Consumption[] {
  const portions = Math.max(1, num(recipe.portions) || 1);
  return (recipe.items || []).map((it) => {
    const fd = foods.find((f) => f.id === it.foodId);
    return fd ? { name: fd.name, qty: num(it.servings) / portions } : null;
  }).filter(Boolean) as Consumption[];
}

/** Per-portion macros of a recipe, mirroring the app's recipeMacros(). */
export function recipeMacrosPerPortion(recipe: PlannerRecipe, foods: PlannerFood[]): Macros {
  const portions = Math.max(1, num(recipe.portions) || 1);
  const total = (recipe.items || []).reduce((a, it) => {
    const fd = foods.find((f) => f.id === it.foodId);
    if (!fd) return a;
    const per = foodPortion(fd);
    const q = num(it.servings);
    a.protein += per.protein * q; a.carbs += per.carbs * q; a.fat += per.fat * q;
    return a;
  }, { protein: 0, carbs: 0, fat: 0 });
  return { protein: total.protein / portions, carbs: total.carbs / portions, fat: total.fat / portions };
}

/** Subtract what was eaten from the pantry. Unknown items are ignored, rows
 *  that hit zero drop out, and nothing ever goes negative. */
export function consumePantry<T extends { name: string; qty: any }>(pantry: T[], consumptions: Consumption[]): T[] {
  if (!consumptions.length) return pantry;
  const want = new Map<string, number>();
  consumptions.forEach((c) => {
    const k = key(c.name); const q = num(c.qty);
    if (!k || !(q > 0)) return;
    want.set(k, (want.get(k) || 0) + q);
  });
  if (!want.size) return pantry;
  const out: T[] = [];
  for (const row of pantry) {
    const k = key(row.name);
    const take = want.get(k);
    if (take == null) { out.push(row); continue; }
    const left = round(num(row.qty) - take);
    want.delete(k);
    if (left > 0.0001) out.push({ ...row, qty: left });
  }
  return out;
}

/* ---- generation ---- */

/** Greedy ingredient allocation into one meal, mutating `got`/`mealEntries`. */
function fillWithIngredients(
  inv: any[], got: Macros, mealEntries: Record<string, PlanDraft>,
  perMeal: Macros, perMealCals: number, date: string, slot: string, planned: Macros,
) {
  let guard = 0;
  while (guard++ < 40) {
    const gotCals = calsFrom(got.protein, got.carbs, got.fat);
    if (perMealCals > 0 && gotCals >= perMealCals * 0.95) break;
    const gap = MKEYS.map((k) => Math.max(0, perMeal[k] - got[k]));
    const gapTotal = gap.reduce((a, b) => a + b, 0);
    if (gapTotal <= 0) break;
    let best: { it: any; fill: number } | null = null;
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
    const k = key(it.name);
    if (mealEntries[k]) mealEntries[k].servings = round(mealEntries[k].servings + step);
    else mealEntries[k] = {
      date, meal: slot, refType: it.refId ? 'food' : 'custom', refId: it.refId || null,
      name: it.name, servings: step, unitLabel: it.unitLabel === 'g' ? 'g' : null,
      protein: num(it.protein), carbs: num(it.carbs), fat: num(it.fat),
    };
  }
}

/** Walk each day's meal slots: place the best in-stock recipe suited to that
 *  slot, then top the meal up with ingredients if it lands short. Deterministic. */
export function generatePlan({ items, goals, startDate, days = 7, mealsPerDay = 3, recipes = [], foods = [] }: {
  items: InventoryItem[]; goals: { protein: any; carbs: any; fat: any };
  startDate: string; days?: number; mealsPerDay?: number;
  recipes?: PlannerRecipe[]; foods?: PlannerFood[];
}): PlanResult {
  const daily: Macros = { protein: num(goals.protein), carbs: num(goals.carbs), fat: num(goals.fat) };
  const dailyCals = calsFrom(daily.protein, daily.carbs, daily.fat);
  const meals = Math.max(1, Math.min(8, Math.round(mealsPerDay) || 3));
  const perMeal: Macros = { protein: daily.protein / meals, carbs: daily.carbs / meals, fat: daily.fat / meals };
  const perMealCals = dailyCals / meals;

  // working inventory: qty remaining, portion step (1 serving / 50 g)
  const inv = items
    .filter((it) => (num(it.qty) || 0) > 0 && calsFrom(it.protein, it.carbs, it.fat) > 0)
    .map((it) => ({ ...it, left: num(it.qty), step: it.unitLabel === 'g' ? 50 : 1 }));
  const invByName = new Map(inv.map((it) => [key(it.name), it]));

  // recipes we can actually cook, with per-portion cost and macros precomputed
  const cookable = (recipes || [])
    .map((r) => ({ r, macros: recipeMacrosPerPortion(r, foods), need: recipeConsumption(r, foods) }))
    .filter((c) => c.need.length > 0 && calsFrom(c.macros.protein, c.macros.carbs, c.macros.fat) > 0);
  const timesUsed = new Map<string, number>();

  const entries: PlanDraft[] = [];
  const planned: Macros = { protein: 0, carbs: 0, fat: 0 };

  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    const usedToday = new Set<string>();
    for (let m = 0; m < meals; m++) {
      const slot = slotFor(m);
      const got: Macros = { protein: 0, carbs: 0, fat: 0 };
      const mealEntries: Record<string, PlanDraft> = {};

      // Fill the slot with dishes first: suited to this meal, unused today,
      // fully in stock, sized against what the meal still needs. A short meal
      // reaches for a second dish before it starts stacking raw ingredients.
      for (let attempt = 0; perMealCals > 0 && attempt < 2; attempt++) {
        const gotCals = calsFrom(got.protein, got.carbs, got.fat);
        const wantCals = perMealCals - gotCals;
        if (wantCals <= perMealCals * 0.3) break;
        const bestFor = (allowRepeat: boolean) => {
          let best: { c: typeof cookable[number]; delta: number } | null = null;
          for (const c of cookable) {
            if (!allowRepeat && usedToday.has(c.r.id)) continue;
            const suits = !c.r.meals || c.r.meals.length === 0 || c.r.meals.includes(slot);
            if (!suits) continue;
            const inStock = c.need.every((n) => {
              const row = invByName.get(key(n.name));
              return row && row.left >= n.qty - 0.0001;
            });
            if (!inStock) continue;
            const cals = calsFrom(c.macros.protein, c.macros.carbs, c.macros.fat);
            if (cals < wantCals * 0.45 || cals > wantCals * 1.45) continue;
            // calorie fit, penalised by how often this dish already appears —
            // enough to rotate the week without forcing a bad-fitting meal
            const delta = Math.abs(cals - wantCals) + (timesUsed.get(c.r.id) || 0) * perMealCals * 0.2;
            if (!best || delta < best.delta) best = { c, delta };
          }
          return best;
        };
        // fresh dish preferred; repeating one beats serving raw ingredients
        // (and it's what meal prep actually looks like)
        const pick = bestFor(false) || (attempt === 0 ? bestFor(true) : null);
        if (!pick) break;
        const { c } = pick;
        c.need.forEach((n) => {
          const row = invByName.get(key(n.name));
          if (row) row.left = round(row.left - n.qty);
        });
        usedToday.add(c.r.id);
        timesUsed.set(c.r.id, (timesUsed.get(c.r.id) || 0) + 1);
        MKEYS.forEach((k) => { got[k] += c.macros[k]; planned[k] += c.macros[k]; });
        mealEntries[`recipe:${c.r.id}`] = {
          date, meal: slot, refType: 'recipe', refId: c.r.id,
          name: c.r.name, servings: 1, unitLabel: null,
          protein: c.macros.protein, carbs: c.macros.carbs, fat: c.macros.fat,
        };
      }

      // top up (or fill from scratch) with ingredients when the meal is short
      const gotCals = calsFrom(got.protein, got.carbs, got.fat);
      if (perMealCals <= 0 || gotCals < perMealCals * 0.7) {
        fillWithIngredients(inv, got, mealEntries, perMeal, perMealCals, date, slot, planned);
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
  // with no targets there's nothing to cover — don't claim a full week
  const daysCovered = dailyCals > 0 ? Math.min(days, round(plannedCals / dailyCals)) : 0;
  return { entries, planned, target, shortfall, daysCovered };
}
