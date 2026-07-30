import { num, round, foodPortion } from './engine';

export type Food = { id: string | null; name: string; category?: string; protein: any; carbs: any; fat: any; unit?: string; [k: string]: any };
export type Recipe = { id: string; name: string; items: { foodId: string; servings: any }[]; [k: string]: any };
export type PlanEntry = { date: string; refType: string; refId?: string | null; name: string; servings: any; protein: any; carbs: any; fat: any; unitLabel?: 'g' | null; [k: string]: any };

export type GroceryDraft = { name: string; category: string; qty: number; protein: number; carbs: number; fat: number; unitLabel: 'g' | null };

/** Aggregate planned meals in [from..to] into shopping quantities.
 *  Recipes explode into their component foods; duplicates merge by food name.
 *  Per-100g foods aggregate in grams (qty = grams, macros per gram). */
export function aggregatePlan({ plan, recipes, foods, from, to }: { plan: PlanEntry[]; recipes: Recipe[]; foods: Food[]; from: string; to: string }): GroceryDraft[] {
  const range = plan.filter((e) => e.date >= from && e.date <= to);
  const agg: Record<string, GroceryDraft> = {};
  const add = (name: string, category: string, per: { protein: number; carbs: number; fat: number; unitLabel: 'g' | null }, qty: number) => {
    const key = name.toLowerCase();
    agg[key] = agg[key] || { name, category, protein: per.protein, carbs: per.carbs, fat: per.fat, unitLabel: per.unitLabel, qty: 0 };
    agg[key].qty += qty;
  };
  range.forEach((e) => {
    if (e.refType === 'recipe') {
      const r = recipes.find((x) => x.id === e.refId);
      if (r) {
        (r.items || []).forEach((it) => {
          const fd = foods.find((f) => f.id === it.foodId);
          if (fd) add(fd.name, fd.category || 'Other', foodPortion(fd), num(it.servings) * (num(e.servings) || 1));
        });
        return;
      }
    }
    const fd = foods.find((f) => f.id === e.refId);
    if (fd) add(fd.name, fd.category || 'Other', foodPortion(fd), num(e.servings) || foodPortion(fd).qty);
    else add(e.name, 'Other', { protein: num(e.protein), carbs: num(e.carbs), fat: num(e.fat), unitLabel: e.unitLabel || null }, num(e.servings) || 1);
  });
  return Object.values(agg).map((d) => ({ ...d, qty: round(d.qty) }));
}
