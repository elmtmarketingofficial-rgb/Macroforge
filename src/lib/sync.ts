/* Device sync without accounts: a private sync code is the identity, and a
   three-way merge (base = last-synced snapshot) reconciles devices so
   additions survive, deletions don't resurrect, and same-record conflicts
   resolve to the device you're holding. */

export const SYNC_STORES = [
  'foods', 'recipes', 'log', 'plan', 'groceries', 'pantry', 'water',
  'workouts', 'routines', 'weights',
] as const;

export type SyncPayload = {
  settings?: any;
  [store: string]: any;
};

/* ---- sync codes: 80 bits, Crockford-ish base32, XXXX-XXXX-XXXX-XXXX ---- */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789'; // no I/L/O/U — unambiguous

export function makeSyncCode(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

/** Normalize user input: case, separators, common misreads. Null if invalid. */
export function normSyncCode(input: string): string | null {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  if (raw.length !== 16 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/* ---- three-way merge ---- */
const eq = (a: any, b: any): boolean => JSON.stringify(a) === JSON.stringify(b);

const byId = (arr: any[]): Map<string, any> => {
  const m = new Map<string, any>();
  (Array.isArray(arr) ? arr : []).forEach((r, i) => m.set(String(r && r.id != null ? r.id : `#${i}`), r));
  return m;
};

/** Merge one record-array store. Per id:
 *  changed on one side → that side wins (including deletion);
 *  changed on both → an edit beats a deletion, local beats remote. */
export function mergeRecords(base: any[], local: any[], remote: any[]): any[] {
  const b = byId(base), l = byId(local), r = byId(remote);
  const ids = new Set<string>([...l.keys(), ...r.keys(), ...b.keys()]);
  const out: any[] = [];
  for (const id of ids) {
    const bv = b.get(id), lv = l.get(id), rv = r.get(id);
    const localChanged = !eq(lv, bv);
    const remoteChanged = !eq(rv, bv);
    let keep: any;
    if (!localChanged && !remoteChanged) keep = bv;
    else if (localChanged && !remoteChanged) keep = lv;
    else if (!localChanged && remoteChanged) keep = rv;
    else keep = lv !== undefined ? lv : rv; // both changed: edit beats delete, local beats remote
    if (keep !== undefined) out.push(keep);
  }
  // stable, cosmetic ordering: local order first, then remote-only additions
  const pos = new Map(local.map((x: any, i: number) => [String(x?.id), i]));
  return out.sort((a, x) => {
    const pa = pos.has(String(a?.id)) ? (pos.get(String(a?.id)) as number) : local.length;
    const px = pos.has(String(x?.id)) ? (pos.get(String(x?.id)) as number) : local.length;
    return pa - px;
  });
}

/** Full-payload merge. `base` is the snapshot both sides last agreed on
 *  (empty object for a first-time join → pure union). */
export function threeWayMerge(base: SyncPayload, local: SyncPayload, remote: SyncPayload): SyncPayload {
  const out: SyncPayload = {};
  // settings is a single record: one-side change wins, both-changed → local
  const bs = base?.settings, ls = local?.settings, rs = remote?.settings;
  out.settings = !eq(ls, bs) ? ls : !eq(rs, bs) ? rs : ls ?? rs ?? bs;
  for (const store of SYNC_STORES) {
    out[store] = mergeRecords(base?.[store] || [], local?.[store] || [], remote?.[store] || []);
  }
  return out;
}

export const payloadsEqual = (a: SyncPayload | null, b: SyncPayload | null): boolean => eq(a, b);
