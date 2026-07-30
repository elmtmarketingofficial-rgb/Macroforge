/* Meal-schedule reminder math — pure and clock-injected so it's testable.
   The UI layer decides how to display; the push backend mirrors the same window logic. */
import { localDate } from './engine';

export type MealTime = { id: string; label: string; time: string }; // time 'HH:MM' local

export const DEFAULT_MEALS: MealTime[] = [
  { id: 'm1', label: 'Breakfast', time: '08:00' },
  { id: 'm2', label: 'Lunch', time: '12:30' },
  { id: 'm3', label: 'Dinner', time: '18:30' },
];

export function defaultMealsFor(count: number): MealTime[] {
  const n = Math.max(1, Math.min(8, Math.round(count) || 3));
  if (n === 3) return DEFAULT_MEALS.map((m) => ({ ...m }));
  // spread between 08:00 and 20:00
  const startM = 8 * 60, endM = 20 * 60;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 12 * 60 : startM + Math.round((i * (endM - startM)) / (n - 1));
    const hh = String(Math.floor(t / 60)).padStart(2, '0');
    const mm = String(t % 60).padStart(2, '0');
    return { id: `m${i + 1}`, label: `Meal ${i + 1}`, time: `${hh}:${mm}` };
  });
}

export const minutesOf = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return -1;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return -1;
  return h * 60 + mi;
};

export const fireKey = (mealId: string, kind: 'meal' | 'nudge', now: Date): string =>
  `${localDate(now)}|${mealId}|${kind}`;

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

/** Map the user's Nth meal onto the app's fixed log slots. */
export function slotForMealIndex(i: number): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  return (['breakfast', 'lunch', 'dinner'] as const)[i] || 'snack';
}
