import { describe, it, expect } from 'vitest';
import { defaultMealsFor, minutesOf, dueMealReminders, dueNudges, fireKey, slotForMealIndex } from './reminders';

const at = (h: number, m: number) => new Date(2026, 7, 3, h, m); // Aug 3 2026, local

describe('meal schedule', () => {
  it('defaultMealsFor(3) is the classic B/L/D', () => {
    const m = defaultMealsFor(3);
    expect(m.map((x) => x.label)).toEqual(['Breakfast', 'Lunch', 'Dinner']);
  });
  it('other counts spread across the day and clamp 1..8', () => {
    expect(defaultMealsFor(5)).toHaveLength(5);
    expect(defaultMealsFor(0)).toHaveLength(3); // 0 falls back to 3
    expect(defaultMealsFor(99)).toHaveLength(8);
    const five = defaultMealsFor(5);
    expect(minutesOf(five[0].time)).toBeLessThan(minutesOf(five[4].time));
  });
  it('minutesOf validates', () => {
    expect(minutesOf('08:30')).toBe(510);
    expect(minutesOf('25:00')).toBe(-1);
    expect(minutesOf('junk')).toBe(-1);
  });
  it('meal indexes map onto fixed log slots with snack overflow', () => {
    expect([0, 1, 2, 3, 4].map(slotForMealIndex)).toEqual(['breakfast', 'lunch', 'dinner', 'snack', 'snack']);
  });
});

describe('dueMealReminders', () => {
  const meals = defaultMealsFor(3); // 08:00, 12:30, 18:30
  it('fires inside the window, once', () => {
    const fired = new Set<string>();
    const due = dueMealReminders({ meals, now: at(12, 33), fired });
    expect(due.map((m) => m.label)).toEqual(['Lunch']);
    fired.add(fireKey(due[0].id, 'meal', at(12, 33)));
    expect(dueMealReminders({ meals, now: at(12, 35), fired })).toHaveLength(0);
  });
  it('nothing outside windows', () => {
    expect(dueMealReminders({ meals, now: at(10, 0), fired: new Set() })).toHaveLength(0);
    expect(dueMealReminders({ meals, now: at(12, 45), fired: new Set() })).toHaveLength(0);
  });
});

describe('dueNudges', () => {
  const meals = defaultMealsFor(3);
  it('nudges 90min after an unlogged meal, skips logged ones', () => {
    const now = at(14, 5); // lunch 12:30 + 90min = 14:00
    const unlogged = dueNudges({ meals, now, fired: new Set(), hasLogged: () => false });
    expect(unlogged.map((m) => m.label)).toEqual(['Lunch']);
    const logged = dueNudges({ meals, now, fired: new Set(), hasLogged: () => true });
    expect(logged).toHaveLength(0);
  });
});
