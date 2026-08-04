import { describe, it, expect } from 'vitest';
import { DEFAULT_MEALS, addMeal, kindForTime, migrateMeals, minutesOf, dueMealReminders, dueNudges, fireKey, slotsOf } from './reminders';

const at = (h: number, m: number) => new Date(2026, 7, 3, h, m); // Aug 3 2026, local

describe('meal schedule', () => {
  it('defaults are the four familiar slots with stable ids', () => {
    expect(DEFAULT_MEALS.map((m) => m.id)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(DEFAULT_MEALS.map((m) => m.label)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
  });
  it('a blank time means the slot exists but never nags', () => {
    const snack = DEFAULT_MEALS.find((m) => m.id === 'snack')!;
    expect(snack.time).toBe('');
    expect(dueMealReminders({ meals: [snack], now: at(21, 0), fired: new Set() })).toHaveLength(0);
  });
  it('adding a meal leaves existing meals untouched', () => {
    let n = 0;
    const next = addMeal(DEFAULT_MEALS, () => `new${n++}`);
    expect(next).toHaveLength(5);
    expect(next.slice(0, 4)).toEqual(DEFAULT_MEALS); // names and times preserved
    expect(next[4].id).toBe('new0');
  });
  it('caps at eight meals', () => {
    let n = 0;
    let meals = DEFAULT_MEALS;
    for (let i = 0; i < 10; i++) meals = addMeal(meals, () => `x${n++}`);
    expect(meals).toHaveLength(8);
  });
  it('kindForTime keeps recipe matching meaningful for custom meals', () => {
    expect(kindForTime('07:30')).toBe('breakfast');
    expect(kindForTime('13:00')).toBe('lunch');
    expect(kindForTime('19:00')).toBe('dinner');
    expect(kindForTime('22:30')).toBe('snack');
    expect(kindForTime('')).toBe('snack');
  });
  it('minutesOf validates', () => {
    expect(minutesOf('08:30')).toBe(510);
    expect(minutesOf('25:00')).toBe(-1);
    expect(minutesOf('junk')).toBe(-1);
  });
  it('migrates legacy m1/m2/m3 schedules without orphaning logged history', () => {
    const legacy = [
      { id: 'm1', label: 'Brekkie', time: '07:00' },
      { id: 'm2', label: 'Lunch', time: '12:00' },
      { id: 'm3', label: 'Tea', time: '19:00' },
    ];
    const out = migrateMeals(legacy);
    expect(out.map((m) => m.id)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(out.map((m) => m.label).slice(0, 3)).toEqual(['Brekkie', 'Lunch', 'Tea']); // their names survive
    expect(out[0].time).toBe('07:00');
    expect(out[0].kind).toBe('breakfast');
  });
  it('leaves an already-current schedule alone and fills in missing kinds', () => {
    expect(migrateMeals(DEFAULT_MEALS)).toEqual(DEFAULT_MEALS);
    const noKind = [{ id: 'breakfast', label: 'Breakfast', time: '08:00', emoji: '☀️' }];
    expect(migrateMeals(noKind)[0].kind).toBe('breakfast');
  });
  it('falls back to defaults for junk', () => {
    expect(migrateMeals(null).map((m) => m.id)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(migrateMeals([]).length).toBe(4);
  });
  it('slotsOf exposes id + kind for the planner', () => {
    expect(slotsOf(DEFAULT_MEALS)).toEqual([
      { id: 'breakfast', kind: 'breakfast' }, { id: 'lunch', kind: 'lunch' },
      { id: 'dinner', kind: 'dinner' }, { id: 'snack', kind: 'snack' },
    ]);
    const custom = [{ id: 'abc', label: 'Second lunch', time: '14:00' }];
    expect(slotsOf(custom)).toEqual([{ id: 'abc', kind: 'lunch' }]); // inferred from the clock
  });
});

describe('dueMealReminders', () => {
  const meals = DEFAULT_MEALS; // 08:00, 12:30, 18:30 (+ Snacks, no time)
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
  const meals = DEFAULT_MEALS;
  it('nudges 90min after an unlogged meal, skips logged ones', () => {
    const now = at(14, 5); // lunch 12:30 + 90min = 14:00
    const unlogged = dueNudges({ meals, now, fired: new Set(), hasLogged: () => false });
    expect(unlogged.map((m) => m.label)).toEqual(['Lunch']);
    const logged = dueNudges({ meals, now, fired: new Set(), hasLogged: () => true });
    expect(logged).toHaveLength(0);
  });
});
