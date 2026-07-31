import { describe, it, expect } from 'vitest';
import { makeSyncCode, normSyncCode, mergeRecords, threeWayMerge } from './sync';

describe('sync codes', () => {
  it('generates XXXX-XXXX-XXXX-XXXX with unambiguous characters', () => {
    for (let i = 0; i < 20; i++) {
      const c = makeSyncCode();
      expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(c).not.toMatch(/[ILOU]/);
    }
  });
  it('codes are unique across generations', () => {
    const seen = new Set(Array.from({ length: 50 }, makeSyncCode));
    expect(seen.size).toBe(50);
  });
  it('normalizes case, separators, and misread characters', () => {
    expect(normSyncCode('abcd efgh jkmn pqrs')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(normSyncCode('ABCD-EFGH-JKMN-PQRS')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(normSyncCode('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS');
    // O→0, I/L→1, U→V
    expect(normSyncCode('ABCO-EFGH-JKMN-PQRS')).toBe('ABC0-EFGH-JKMN-PQRS');
    expect(normSyncCode('too-short')).toBeNull();
    expect(normSyncCode('')).toBeNull();
  });
});

describe('mergeRecords', () => {
  const a = { id: 'a', name: 'Chicken', protein: 31 };
  const b = { id: 'b', name: 'Rice', carbs: 45 };
  const c = { id: 'c', name: 'Oil', fat: 14 };
  it('unions additions from both sides', () => {
    const out = mergeRecords([a], [a, b], [a, c]);
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });
  it('deletions do not resurrect', () => {
    // local deleted a; remote unchanged → a stays gone
    const out = mergeRecords([a, b], [b], [a, b]);
    expect(out.map((x) => x.id)).toEqual(['b']);
  });
  it('remote deletion also sticks', () => {
    const out = mergeRecords([a, b], [a, b], [b]);
    expect(out.map((x) => x.id)).toEqual(['b']);
  });
  it('an edit beats a deletion', () => {
    const edited = { ...a, protein: 32 };
    const out = mergeRecords([a], [edited], []);
    expect(out).toEqual([edited]);
    const out2 = mergeRecords([a], [], [edited]);
    expect(out2).toEqual([edited]);
  });
  it('both edited the same record → local wins', () => {
    const localEdit = { ...a, protein: 33 };
    const remoteEdit = { ...a, protein: 40 };
    const out = mergeRecords([a], [localEdit], [remoteEdit]);
    expect(out).toEqual([localEdit]);
  });
  it('one-side edits pass through', () => {
    const remoteEdit = { ...b, carbs: 50 };
    const out = mergeRecords([a, b], [a, b], [a, remoteEdit]);
    expect(out.find((x) => x.id === 'b').carbs).toBe(50);
  });
});

describe('threeWayMerge', () => {
  const mk = (over = {}) => ({
    settings: { unit: 'lb', goals: { protein: '150' } },
    foods: [], recipes: [], log: [], plan: [], groceries: [], pantry: [],
    water: [], workouts: [], routines: [], weights: [], ...over,
  });
  it('first-time join (empty base) unions both devices', () => {
    const local = mk({ log: [{ id: 'l1', date: '2026-07-30', name: 'Eggs' }] });
    const remote = mk({ log: [{ id: 'r1', date: '2026-07-29', name: 'Rice' }] });
    const out = threeWayMerge({}, local, remote);
    expect(out.log.map((x: any) => x.id).sort()).toEqual(['l1', 'r1']);
  });
  it('settings: only-remote change adopts remote; both-changed keeps local', () => {
    const base = mk();
    const remote = mk({ settings: { unit: 'kg', goals: { protein: '150' } } });
    expect(threeWayMerge(base, mk(), remote).settings.unit).toBe('kg');
    const local = mk({ settings: { unit: 'lb', goals: { protein: '200' } } });
    expect(threeWayMerge(base, local, remote).settings.goals.protein).toBe('200');
  });
  it('cross-store: phone logs food while desktop logs workout — both survive', () => {
    const base = mk();
    const phone = mk({ log: [{ id: 'p1', name: 'Yogurt' }] });
    const desktop = mk({ workouts: [{ id: 'd1', title: 'Push day' }] });
    const out = threeWayMerge(base, phone, desktop);
    expect(out.log).toHaveLength(1);
    expect(out.workouts).toHaveLength(1);
  });
});
