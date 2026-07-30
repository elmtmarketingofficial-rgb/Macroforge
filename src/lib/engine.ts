/* Pure calculation engines — unit-tested in engine.test.ts */

export type Macros = { protein: number; carbs: number; fat: number };
export type LogEntry = { date: string; servings: number | string; protein: number; carbs: number; fat: number; [k: string]: any };
export type WeighIn = { date: string; weight: number | string };
export type Unit = 'lb' | 'kg';

export const num = (v: any): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const round = (n: number): number => Math.round(n * 10) / 10;
export const calsFrom = (p: any, c: any, f: any): number => num(p) * 4 + num(c) * 4 + num(f) * 9;
/** Epley estimated one-rep max */
export const e1rm = (w: any, r: any): number => { const W = num(w), R = num(r); return W > 0 && R >= 1 ? W * (1 + R / 30) : 0; };

/* ---- timezone-safe local dates (never UTC parsing) ---- */
export const localDate = (dt: Date): string => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
export const todayISO = (): string => localDate(new Date());
export const parseISO = (iso: string): Date => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso: string, n: number): string => { const dt = parseISO(iso); dt.setDate(dt.getDate() + n); return localDate(dt); };
export const daysBetween = (a: string, b: string): number => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
export const fmtDate = (iso: string, opts?: Intl.DateTimeFormatOptions): string => { try { return parseISO(iso).toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return iso; } };

export const entryMacros = (list: LogEntry[]): Macros => list.reduce((a, e) => {
  const q = num(e.servings) || 0;
  a.protein += num(e.protein) * q; a.carbs += num(e.carbs) * q; a.fat += num(e.fat) * q; return a;
}, { protein: 0, carbs: 0, fat: 0 });

/* ---- per-100g foods ---- */
export const isPer100g = (food: any): boolean => !!food && food.unit === 'g100';

export type Portion = Macros & { qty: number; unitLabel: 'g' | null; step: number };
/** How one "unit" of a food is logged. Per-100g foods snapshot per-GRAM macros
 *  with a 100 g default quantity, so entry math (macros × servings) stays uniform
 *  whether servings counts servings or grams. */
export function foodPortion(food: { protein: any; carbs: any; fat: any; unit?: string }): Portion {
  if (isPer100g(food)) {
    return { protein: num(food.protein) / 100, carbs: num(food.carbs) / 100, fat: num(food.fat) / 100, qty: 100, unitLabel: 'g', step: 10 };
  }
  return { protein: num(food.protein), carbs: num(food.carbs), fat: num(food.fat), qty: 1, unitLabel: null, step: 1 };
}

export const KG = 2.20462;
export const kcalPerUnit = (unit: Unit): number => (unit === 'kg' ? 7700 : 3500);

/** Exponentially-smoothed weight trend (alpha 0.25). Water-weight noise damper. */
export function weightTrend(weights: WeighIn[]): { date: string; weight: number; trend: number }[] {
  const sorted = [...weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  let t: number | null = null; const out: { date: string; weight: number; trend: number }[] = [];
  for (const w of sorted) {
    const v = num(w.weight); if (!(v > 0)) continue;
    t = t == null ? v : t + 0.25 * (v - t);
    out.push({ date: w.date, weight: v, trend: round(t * 10) / 10 });
  }
  return out;
}

export type TdeeResult =
  | { ok: true; tdee: number; avgIntake: number; delta: number; span: number; loggedDays: number; weighIns: number }
  | { ok: false; loggedDays: number; weighIns: number };

/** Adaptive TDEE: avg intake minus energy stored/released implied by trend-weight change.
 *  Requires ≥14 logged food days and weigh-ins spanning ≥14 days in the window. */
export function computeTDEE({ log, weights, unit, windowDays = 28, today }: { log: LogEntry[]; weights: WeighIn[]; unit: Unit; windowDays?: number; today?: string }): TdeeResult {
  const end = today || todayISO(); const start = addDays(end, -(windowDays - 1));
  const trend = weightTrend(weights).filter((w) => w.date >= start && w.date <= end);
  const byDay: Record<string, number> = {};
  log.forEach((e) => { if (e.date >= start && e.date <= end) { const q = num(e.servings) || 0; byDay[e.date] = (byDay[e.date] || 0) + calsFrom(e.protein, e.carbs, e.fat) * q; } });
  const loggedDays = Object.keys(byDay).length;
  if (loggedDays < 14 || trend.length < 2) return { ok: false, loggedDays, weighIns: trend.length };
  const span = Math.max(1, daysBetween(trend[0].date, trend[trend.length - 1].date));
  if (span < 14) return { ok: false, loggedDays, weighIns: trend.length };
  const avgIntake = Object.values(byDay).reduce((a, b) => a + b, 0) / loggedDays;
  const delta = trend[trend.length - 1].trend - trend[0].trend;
  const tdee = avgIntake - (delta * kcalPerUnit(unit)) / span;
  return { ok: true, tdee: Math.round(tdee), avgIntake: Math.round(avgIntake), delta: round(delta), span, loggedDays, weighIns: trend.length };
}

/** Mifflin-St Jeor BMR × activity — the cold-start seed before real data exists. */
export function mifflin({ sex, age, heightCm, weight, unit, activity }: { sex?: string; age?: any; heightCm?: any; weight?: any; unit: Unit; activity?: any }): number {
  const kg = unit === 'kg' ? num(weight) : num(weight) / KG;
  if (!(kg > 0) || !(num(age) > 0) || !(num(heightCm) > 0)) return 0;
  const bmr = 10 * kg + 6.25 * num(heightCm) - 5 * num(age) + (sex === 'female' ? -161 : 5);
  return Math.round(bmr * (num(activity) || 1.375));
}

/** Target kcal from TDEE + goal rate; protein 1g/lb (2.2g/kg), fat 25% kcal, carbs remainder. */
export function suggestMacros({ tdee, goalType, rate, trendWeight, unit }: { tdee: number; goalType: string; rate: any; trendWeight: any; unit: Unit }) {
  const sign = goalType === 'cut' ? -1 : goalType === 'gain' ? 1 : 0;
  const kcal = Math.max(1200, Math.round(tdee + (sign * num(rate) * kcalPerUnit(unit)) / 7));
  const protein = Math.round(unit === 'kg' ? num(trendWeight) * 2.2 : num(trendWeight) * 1);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs };
}

/** Adherence score for a day: fraction of the 4 targets hit (null = no goals set). */
export function dayScore(totals: Macros, goals: { protein: any; carbs: any; fat: any }): number | null {
  const gc = calsFrom(goals.protein, goals.carbs, goals.fat);
  if (!(gc > 0)) return null;
  const cals = calsFrom(totals.protein, totals.carbs, totals.fat);
  if (cals === 0) return 0;
  let hit = 0;
  if (totals.protein >= num(goals.protein) * 0.9) hit++;
  if (Math.abs(totals.carbs - num(goals.carbs)) <= num(goals.carbs) * 0.2) hit++;
  if (Math.abs(totals.fat - num(goals.fat)) <= num(goals.fat) * 0.2) hit++;
  if (Math.abs(cals - gc) <= gc * 0.1) hit++;
  return hit / 4;
}
