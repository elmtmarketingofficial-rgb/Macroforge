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

/* A slot is one meal in the user's day. `id` is where entries get filed;
   `kind` (breakfast/lunch/dinner/snack) is what recipe tags match against, so
   a custom "Second lunch" still attracts lunch food. */
export type Slot = { id: string; kind: string };
const DEFAULT_SLOTS: Slot[] = [
  { id: 'breakfast', kind: 'breakfast' }, { id: 'lunch', kind: 'lunch' },
  { id: 'dinner', kind: 'dinner' }, { id: 'snack', kind: 'snack' },
];
const slotsFrom = (mealsPerDay: any, slots?: Slot[]): Slot[] => {
  if (slots && slots.length) return slots.slice(0, 8);
  const n = Math.max(1, Math.min(8, Math.round(num(mealsPerDay)) || 3));
  return Array.from({ length: n }, (_, i) => DEFAULT_SLOTS[i] || DEFAULT_SLOTS[3]);
};
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

/** A record of stock actually removed — enough to put it back exactly,
 *  including rows that were emptied and dropped. */
export type Taken = {
  name: string; qty: number;
  category?: string; unitLabel?: 'g' | null;
  protein: number; carbs: number; fat: number;
};

/** Subtract what was eaten from the pantry, reporting what was genuinely
 *  taken. Food you don't stock is ignored (eating out doesn't touch the
 *  pantry), rows that hit zero drop out, nothing goes negative. */
export function takeFromPantry<T extends { name: string; qty: any }>(
  pantry: T[], consumptions: Consumption[],
): { pantry: T[]; taken: Taken[] } {
  if (!consumptions.length) return { pantry, taken: [] };
  const want = new Map<string, number>();
  consumptions.forEach((c) => {
    const k = key(c.name); const q = num(c.qty);
    if (!k || !(q > 0)) return;
    want.set(k, (want.get(k) || 0) + q);
  });
  if (!want.size) return { pantry, taken: [] };
  const out: T[] = [];
  const taken: Taken[] = [];
  for (const row of pantry) {
    const k = key(row.name);
    const ask = want.get(k);
    if (ask == null) { out.push(row); continue; }
    want.delete(k);
    const have = num(row.qty);
    const got = Math.min(have, ask);            // never take more than is there
    const r = row as any;
    if (got > 0) {
      taken.push({
        name: row.name, qty: round(got), category: r.category,
        unitLabel: r.unitLabel || null,
        protein: num(r.protein), carbs: num(r.carbs), fat: num(r.fat),
      });
    }
    const left = round(have - got);
    if (left > 0.0001) out.push({ ...row, qty: left });
  }
  return { pantry: out, taken };
}

/** Put stock back — only ever what `takeFromPantry` reported removing, so an
 *  undo can't invent food. Emptied rows are recreated from their snapshot. */
export function returnToPantry<T extends { name: string; qty: any }>(
  pantry: T[], taken: Taken[], idFn: () => string,
): T[] {
  if (!taken || !taken.length) return pantry;
  const out = pantry.map((r) => ({ ...r }));
  for (const t of taken) {
    const q = num(t.qty);
    if (!(q > 0)) continue;
    const row = out.find((r) => key(r.name) === key(t.name));
    if (row) row.qty = round(num(row.qty) + q);
    else out.push({
      id: idFn(), name: t.name, category: t.category || 'Other',
      qty: round(q), unitLabel: t.unitLabel || null,
      protein: num(t.protein), carbs: num(t.carbs), fat: num(t.fat),
    } as any);
  }
  return out as T[];
}

/** Scale a taken-record by a fraction. */
export const scaleTaken = (taken: Taken[], factor: number): Taken[] =>
  (taken || []).map((t) => ({ ...t, qty: round(num(t.qty) * factor) })).filter((t) => t.qty > 0);

/** Settle an entry whose amount changed: compare the stock it already drew
 *  against what it should draw now, and report the difference. Recomputing
 *  from the target (rather than scaling by a delta) keeps repeated nudges of
 *  a stepper from accumulating rounding drift. */
export function reconcileTaken(had: Taken[], wanted: Consumption[]): {
  take: Consumption[]; give: Taken[]; kept: Taken[];
} {
  const byName = new Map<string, { qty: number; snap: Taken }>();
  (had || []).forEach((t) => {
    const k = key(t.name); const q = num(t.qty);
    const cur = byName.get(k);
    if (cur) cur.qty += q; else byName.set(k, { qty: q, snap: { ...t } });
  });
  const want = new Map<string, number>();
  (wanted || []).forEach((c) => {
    const k = key(c.name); const q = num(c.qty);
    if (k && q > 0) want.set(k, (want.get(k) || 0) + q);
  });
  const take: Consumption[] = [];
  const give: Taken[] = [];
  const kept: Taken[] = [];
  for (const k of new Set([...byName.keys(), ...want.keys()])) {
    const have = byName.get(k);
    const hadQty = have ? have.qty : 0;
    const wantQty = want.get(k) || 0;
    const name = have ? have.snap.name : (wanted.find((c) => key(c.name) === k)?.name || k);
    if (wantQty > hadQty) take.push({ name, qty: round(wantQty - hadQty) });
    else if (wantQty < hadQty && have) give.push({ ...have.snap, qty: round(hadQty - wantQty) });
    const keep = Math.min(hadQty, wantQty);
    if (keep > 0 && have) kept.push({ ...have.snap, qty: round(keep) });
  }
  return { take, give, kept };
}

/** Back-compat helper: subtract and return just the pantry. */
export function consumePantry<T extends { name: string; qty: any }>(pantry: T[], consumptions: Consumption[]): T[] {
  return takeFromPantry(pantry, consumptions).pantry;
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
export function generatePlan({ items, goals, startDate, days = 7, mealsPerDay = 3, recipes = [], foods = [], slots }: {
  items: InventoryItem[]; goals: { protein: any; carbs: any; fat: any };
  startDate: string; days?: number; mealsPerDay?: number;
  recipes?: PlannerRecipe[]; foods?: PlannerFood[]; slots?: Slot[];
}): PlanResult {
  const daily: Macros = { protein: num(goals.protein), carbs: num(goals.carbs), fat: num(goals.fat) };
  const dailyCals = calsFrom(daily.protein, daily.carbs, daily.fat);
  const slotList = slotsFrom(mealsPerDay, slots);
  const meals = slotList.length;
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
      const slot = slotList[m].id;
      const slotKind = slotList[m].kind;
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
            const suits = !c.r.meals || c.r.meals.length === 0 || c.r.meals.includes(slotKind);
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
