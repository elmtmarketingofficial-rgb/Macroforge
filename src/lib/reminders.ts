/* Meal-schedule reminder math — pure and clock-injected so it's testable.
   The UI layer decides how to display; the push backend mirrors the same window logic. */
import { localDate } from './engine';

/* A meal is a slot in the user's day: where food gets filed AND when to remind.
   `id` is stable so renaming or reordering never orphans logged entries.
   `kind` drives recipe matching. A blank `time` means "slot, but no reminder". */
export type MealTime = { id: string; label: string; time: string; kind?: string; emoji?: string };

export const DEFAULT_MEALS: MealTime[] = [
  { id: 'breakfast', label: 'Breakfast', time: '08:00', kind: 'breakfast', emoji: '☀️' },
  { id: 'lunch', label: 'Lunch', time: '12:30', kind: 'lunch', emoji: '🌤️' },
  { id: 'dinner', label: 'Dinner', time: '18:30', kind: 'dinner', emoji: '🌙' },
  { id: 'snack', label: 'Snacks', time: '', kind: 'snack', emoji: '🍎' },
];

export const EMOJI_BY_KIND: Record<string, string> = {
  breakfast: '☀️', lunch: '🌤️', dinner: '🌙', snack: '🍎',
};

/** Which sort of food belongs at this hour — used when a custom meal is added
 *  so recipe tags still mean something. */
export function kindForTime(time: string): string {
  const m = minutesOf(time);
  if (m < 0) return 'snack';
  if (m < 10 * 60 + 30) return 'breakfast';
  if (m < 15 * 60) return 'lunch';
  if (m < 21 * 60) return 'dinner';
  return 'snack';
}

/** Append a meal without disturbing the ones already there. */
export function addMeal(meals: MealTime[], idFn: () => string): MealTime[] {
  if (meals.length >= 8) return meals;
  const times = meals.map((m) => minutesOf(m.time)).filter((t) => t >= 0);
  const latest = times.length ? Math.max(...times) : 12 * 60;
  const t = Math.min(22 * 60, latest + 150);
  const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const kind = kindForTime(time);
  return [...meals, { id: idFn(), label: `Meal ${meals.length + 1}`, time, kind, emoji: EMOJI_BY_KIND[kind] || '🍽️' }];
}

export const minutesOf = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return -1;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return -1;
  return h * 60 + mi;
};

export const fireKey = (mealId: string, kind: 'meal' | 'nudge' | 'shop', now: Date): string =>
  `${localDate(now)}|${mealId}|${kind}`;

/* Weekly shopping run: a day-of-week + time instead of a daily time.
   The web can't geofence, so this is the "you planned to shop today" nudge. */
export type ShoppingPlan = { enabled?: boolean; day: number; time: string }; // day: 0=Sun … 6=Sat (JS getDay)

export const DEFAULT_SHOPPING: ShoppingPlan = { enabled: false, day: 6, time: '10:00' };

/** True when the weekly shopping reminder should fire right now. */
export function dueShoppingReminder({ shopping, now, fired, windowMin = 15 }: {
  shopping: ShoppingPlan | null | undefined; now: Date; fired: Set<string>; windowMin?: number;
}): boolean {
  if (!shopping || !shopping.enabled) return false;
  if (now.getDay() !== Number(shopping.day)) return false;
  const t = minutesOf(shopping.time);
  if (t < 0) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur < t || cur >= t + windowMin) return false;
  return !fired.has(fireKey('shopping', 'shop', now));
}

/** Meal reminders due right now: within [time, time+windowMin) and not already fired today. */
export function dueMealReminders({ meals, now, fired, windowMin = 10 }: {
  meals: MealTime[]; now: Date; fired: Set<string>; windowMin?: number;
}): MealTime[] {
  const cur = now.getHours() * 60 + now.getMinutes();
  return meals.filter((m) => {
    const t = minutesOf(m.time);
    if (t < 0) return false;
    if (cur < t || cur >= t + windowMin) return false;
    return !fired.has(fireKey(m.id, 'meal', now));
  });
}

/** Nudges: `nudgeAfterMin` past a meal time with nothing logged for that slot yet. */
export function dueNudges({ meals, now, fired, hasLogged, nudgeAfterMin = 90, windowMin = 15 }: {
  meals: MealTime[]; now: Date; fired: Set<string>;
  hasLogged: (meal: MealTime) => boolean; nudgeAfterMin?: number; windowMin?: number;
}): MealTime[] {
  const cur = now.getHours() * 60 + now.getMinutes();
  return meals.filter((m) => {
    const t = minutesOf(m.time);
    if (t < 0) return false;
    const start = t + nudgeAfterMin;
    if (cur < start || cur >= start + windowMin) return false;
    if (fired.has(fireKey(m.id, 'nudge', now))) return false;
    return !hasLogged(m);
  });
}

/** Bring a stored schedule up to the current shape. Early builds keyed meals
 *  m1/m2/m3 while the log filed entries under breakfast/lunch/dinner/snack —
 *  remap onto the canonical ids so nobody's history goes unfiled, keeping the
 *  labels and times they chose. */
export function migrateMeals(meals: any): MealTime[] {
  if (!Array.isArray(meals) || !meals.length) return DEFAULT_MEALS.map((m) => ({ ...m }));
  // icon follows what the meal IS, not where it sits in the list
  const withKind = (m: any) => {
    const kind = m.kind || kindForTime(m.time);
    return { ...m, kind, emoji: m.emoji || EMOJI_BY_KIND[kind] || '🍽️' };
  };
  const isLegacy = meals.every((m: any) => /^m\d+$/.test(String(m && m.id)));
  if (!isLegacy) return meals.map(withKind);
  const canonical = ['breakfast', 'lunch', 'dinner'];
  const out = meals.map((m: any, i: number) => ({ ...withKind(m, i), id: canonical[i] || `meal${i + 1}` }));
  if (!out.some((m) => m.id === 'snack')) out.push({ ...DEFAULT_MEALS[3] });
  return out;
}

/** Planner slots derived from the user's own meals. */
export const slotsOf = (meals: MealTime[]): { id: string; kind: string }[] =>
  (meals && meals.length ? meals : DEFAULT_MEALS).map((m) => ({ id: m.id, kind: m.kind || kindForTime(m.time) }));
