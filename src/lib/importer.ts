/* Normalizes any MacroForge backup (v1 artifact export, v1 raw stores, or v2/v3 export)
   into v2 store shapes. Unknown fields pass through untouched. */

export type NormalizedImport = {
  settings?: any; foods?: any[]; recipes?: any[]; log?: any[]; plan?: any[];
  groceries?: any[]; workouts?: any[]; routines?: any[]; weights?: any[];
};

export function normalizeImport(data: any): NormalizedImport {
  if (!data || typeof data !== 'object') throw new Error('Not a MacroForge backup');
  const isV1 = !data.settings; // v1 had flat goals; v2+ has settings
  if (!isV1) {
    const out: NormalizedImport = {};
    if (data.settings) out.settings = data.settings;
    for (const k of ['foods', 'recipes', 'log', 'plan', 'groceries', 'workouts', 'routines', 'weights'] as const) {
      if (Array.isArray(data[k])) out[k] = data[k];
    }
    return out;
  }
  const g = data.goals || {};
  const out: NormalizedImport = {
    settings: { unit: g.unit || 'lb', days: g.days || 7, goals: { protein: g.protein ?? '', carbs: g.carbs ?? '', fat: g.fat ?? '' }, goalMode: 'manual' },
  };
  if (Array.isArray(data.foods)) out.foods = data.foods.map((f: any) => ({ favorite: false, ...f }));
  if (Array.isArray(data.groceries)) out.groceries = data.groceries.map((x: any) => ({ source: 'manual', ...x }));
  if (Array.isArray(data.workouts)) out.workouts = data.workouts.map((w: any) => ({
    routineId: null, ...w,
    exercises: (w.exercises || []).map((ex: any) => ({ rest: 90, ...ex, sets: (ex.sets || []).map((st: any) => ({ done: true, ...st })) })),
  }));
  if (Array.isArray(data.log)) out.log = data.log.map((e: any) => ({ meal: e.meal || 'snack', refType: e.foodId ? 'food' : 'custom', refId: e.foodId || null, ...e }));
  return out;
}
