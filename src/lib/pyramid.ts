/* Whole-foods scoring engine. The category hierarchy follows the app's
   inverted food pyramid: protein-dense whole foods form the foundation,
   vegetables and fruit next, then dairy, nuts, grains, with refined and
   ultra-processed items at the narrow tip. */
import { num, round, calsFrom, type Macros } from './engine';

export type Verdict = 'great' | 'decent' | 'poor' | 'unknown';

/* app grocery categories → pyramid weight (1 = foundation, 0 = tip) */
export const CATEGORY_WEIGHT: Record<string, number> = {
  'Protein': 1.0,
  'Produce': 0.9,
  'Dairy & Eggs': 0.8,
  'Frozen': 0.6,
  'Grains': 0.5,
  'Pantry': 0.5,
  'Other': 0.5,
  'Beverages': 0.3,
  'Snacks': 0.15,
};

/* Open Food Facts food_groups / categories tags → pyramid weight */
const OFF_GROUP_WEIGHT: [RegExp, number][] = [
  [/(spring-water|mineral-water|\bwaters\b|:water\b)/, 0.95], // plain water — before the beverage rule
  [/\b(meat|poultry|fish|seafood|egg)/, 1.0],
  [/(vegetable|fruit|produce|legume|bean|lentil)/, 0.9],
  [/(milk|dairy|dairies|cheese|yogurt|fromage)/, 0.8],
  [/(nut|seed)/, 0.7],
  [/(cereal|grain|bread|pasta|potato|rice)/, 0.5],
  [/(beverage|juice|soda|drink)/, 0.3],
  [/(snack|sweet|candy|candies|chocolate|biscuit|cookie|cake|confection|dessert|pastr)/, 0.12],
];

export type QualityInput = { category?: string; offGroups?: string[]; nova?: number; sugarPer100?: number };

/** Pyramid quality weight 0..1. `known` is false when we have no signal at all. */
export function qualityWeight({ category, offGroups, nova, sugarPer100 }: QualityInput): { weight: number; known: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let w: number | null = null;
  if (offGroups && offGroups.length) {
    for (const tag of offGroups) {
      const t = String(tag).toLowerCase();
      for (const [re, weight] of OFF_GROUP_WEIGHT) {
        if (re.test(t)) { w = w == null ? weight : Math.max(w, weight); break; }
      }
    }
  }
  if (w == null && category && CATEGORY_WEIGHT[category] != null) w = CATEGORY_WEIGHT[category];
  const known = w != null;
  if (w == null) w = 0.5;
  if (w >= 0.9) reasons.push('foundation of the pyramid — whole food');
  else if (w <= 0.2) reasons.push('tip of the pyramid');
  const n = num(nova);
  if (n === 4) { w = Math.min(w, 0.25); reasons.push('ultra-processed (NOVA 4)'); }
  else if (n === 1 && w < 1) { w = Math.min(1, w + 0.1); reasons.push('unprocessed (NOVA 1)'); }
  const sugar = num(sugarPer100);
  if (sugar > 30) { w = Math.max(0, w - 0.35); reasons.push(`very high sugar (${round(sugar)}g/100g)`); }
  else if (sugar > 15) { w = Math.max(0, w - 0.2); reasons.push(`high sugar (${round(sugar)}g/100g)`); }
  return { weight: Math.max(0, Math.min(1, w)), known, reasons };
}

/* ---- weekly need & gap ---- */
export const weeklyNeed = (goals: { protein: any; carbs: any; fat: any }, days = 7): Macros => ({
  protein: num(goals.protein) * days, carbs: num(goals.carbs) * days, fat: num(goals.fat) * days,
});

/** Totals across grocery/pantry rows (qty × per-unit macros). */
export const listTotals = (items: { qty: any; protein: any; carbs: any; fat: any }[]): Macros =>
  items.reduce((a, it) => {
    const q = num(it.qty) || 0;
    a.protein += num(it.protein) * q; a.carbs += num(it.carbs) * q; a.fat += num(it.fat) * q;
    return a;
  }, { protein: 0, carbs: 0, fat: 0 });

/** What the week still needs after what the list/pantry already covers. Can go negative (surplus). */
export const remainingGap = (goals: { protein: any; carbs: any; fat: any }, items: { qty: any; protein: any; carbs: any; fat: any }[], days = 7): Macros => {
  const need = weeklyNeed(goals, days); const have = listTotals(items);
  return { protein: need.protein - have.protein, carbs: need.carbs - have.carbs, fat: need.fat - have.fat };
};

export type ScanScore = {
  verdict: Verdict;
  score: number; // 0-100
  reasons: string[];
  gap: Macros;              // remaining weekly gap used for the judgement
  perMealGap: Macros;       // gap ÷ (days × mealsPerDay)
  mealsCovered: number;     // how many meal-slots' worth of the most-needed macro 100g/1 serving covers
};

const MKEYS: (keyof Macros)[] = ['protein', 'carbs', 'fat'];

/** Judge one food (per-serving or per-100g macros) against the week.
 *  With a grocery list present the gap is weekly need − list coverage;
 *  with no list it's the full weekly need. */
export function scoreScan({ item, goals, list = [], mealsPerDay = 3, days = 7 }: {
  item: { protein: any; carbs: any; fat: any; category?: string; offGroups?: string[]; nova?: number; sugarPer100?: number };
  goals: { protein: any; carbs: any; fat: any };
  list?: { qty: any; protein: any; carbs: any; fat: any }[];
  mealsPerDay?: number; days?: number;
}): ScanScore {
  const reasons: string[] = [];
  const q = qualityWeight(item);
  reasons.push(...q.reasons);
  const kc = calsFrom(item.protein, item.carbs, item.fat);
  const gap = remainingGap(goals, list, days);
  if (kc === 0) {
    // zero-calorie item (water & co.): judged on pyramid quality alone
    const slots0 = Math.max(1, days * Math.max(1, mealsPerDay));
    let score0 = Math.round(100 * (0.55 * q.weight + 0.45 * 0.5));
    if (q.weight <= 0.25) score0 = Math.min(score0, 44);
    reasons.push('zero calories — doesn’t move your macros');
    return {
      verdict: score0 >= 70 ? 'great' : score0 >= 45 ? 'decent' : 'poor',
      score: score0, reasons, gap,
      perMealGap: { protein: gap.protein / slots0, carbs: gap.carbs / slots0, fat: gap.fat / slots0 },
      mealsCovered: 0,
    };
  }
  const slots = Math.max(1, days * Math.max(1, mealsPerDay));
  const perMealGap = { protein: gap.protein / slots, carbs: gap.carbs / slots, fat: gap.fat / slots };
  const goalCals = calsFrom(goals.protein, goals.carbs, goals.fat);
  let fit = 0.5;
  if (goalCals > 0) {
    const posGap = MKEYS.map((k) => Math.max(0, gap[k]));
    const gapTotal = posGap.reduce((a, b) => a + b, 0);
    if (gapTotal <= 0) {
      fit = 0.5;
      reasons.push('your list already covers the week’s targets');
    } else {
      // how well the item's macro mix lines up with what's still missing
      const itemVec = MKEYS.map((k) => num(item[k]));
      const itemTotal = itemVec.reduce((a, b) => a + b, 0) || 1;
      fit = MKEYS.reduce((s, k, i) => s + Math.min(itemVec[i] / itemTotal, posGap[i] / gapTotal), 0);
      const behind = MKEYS.map((k, i) => ({ k, need: posGap[i] })).sort((a, b) => b.need - a.need)[0];
      if (behind.need > 0 && num(item[behind.k]) > 0) {
        reasons.push(`helps your ${behind.k} gap — the week still needs ${Math.round(behind.need)}g`);
      } else if (behind.need > 0) {
        reasons.push(`doesn’t address your biggest gap (${behind.k}, ${Math.round(behind.need)}g short)`);
      }
    }
  }
  let score = Math.round(100 * (0.55 * q.weight + 0.45 * fit));
  // whole-foods floor: tip-of-pyramid / ultra-processed items can't ride macro fit to a pass
  if (q.weight <= 0.25) score = Math.min(score, 44);
  const needK = MKEYS.map((k) => ({ k, need: Math.max(0, gap[k]) })).sort((a, b) => b.need - a.need)[0];
  const mealsCovered = needK.need > 0 && num(item[needK.k]) > 0 && perMealGap[needK.k] > 0
    ? round(num(item[needK.k]) / perMealGap[needK.k]) : 0;
  const verdict: Verdict = !q.known && kc > 0 ? (score >= 70 ? 'great' : score >= 45 ? 'decent' : 'poor')
    : score >= 70 ? 'great' : score >= 45 ? 'decent' : 'poor';
  return { verdict, score, reasons, gap, perMealGap, mealsCovered };
}
