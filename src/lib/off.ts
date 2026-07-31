/* Open Food Facts search + barcode lookup — the app's network features
   (optional, online-only). Products come back with per-100g nutriments,
   so picks are saved as unit:'g100' foods. */
import { num, round } from './engine';

export type OffFood = {
  name: string; brand: string | null;
  protein: number; carbs: number; fat: number; // per 100 g
  fiber: number; sugars: number;               // per 100 g
  verified: boolean; code: string;
  nova?: number;                                // 1 (unprocessed) … 4 (ultra-processed)
  groups: string[];                             // OFF food_groups/categories tags
};

const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,complete,nova_group,food_groups_tags,categories_tags';

/** Normalize one OFF product; null when it's unusable (no name or no nutrition
 *  data at all). All-zero macros are VALID — water is real food data, not a
 *  missing record. English product name preferred. */
const DATA_KEYS = ['proteins_100g', 'carbohydrates_100g', 'fat_100g', 'energy-kcal_100g', 'energy_100g', 'sugars_100g', 'fiber_100g'];
export function mapOffProduct(p: any): OffFood | null {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.product_name_en || p.product_name || '').trim();
  const n = p.nutriments || {};
  const hasData = DATA_KEYS.some((k) => n[k] !== undefined && n[k] !== '');
  if (!name || !hasData) return null;
  const protein = num(n.proteins_100g), carbs = num(n.carbohydrates_100g), fat = num(n.fat_100g);
  const brand = String(p.brands || '').split(',')[0].trim();
  const groups = ([] as string[]).concat(
    Array.isArray(p.food_groups_tags) ? p.food_groups_tags : [],
    Array.isArray(p.categories_tags) ? p.categories_tags.slice(0, 6) : [],
  ).map(String);
  return {
    name, brand: brand || null,
    protein: round(protein), carbs: round(carbs), fat: round(fat),
    fiber: round(num(n.fiber_100g)), sugars: round(num(n.sugars_100g)),
    verified: num(p.complete) === 1,
    code: String(p.code || ''),
    nova: num(p.nova_group) || undefined,
    groups,
  };
}

/* ---- query forgiveness ---- */
/** Strip the classic trailing-e misspelling ("tomatoe" → "tomato") — only when
 *  the e follows a vowel, so "apple"/"cheese" stay intact. Lowercased + trimmed. */
export function normalizeSearchTerm(q: string): string {
  let t = String(q || '').trim().toLowerCase();
  if (t.length > 4 && t.endsWith('e') && 'aeiou'.includes(t[t.length - 2])) t = t.slice(0, -1);
  return t;
}

/** Variants used for matching the local library: as typed, de-pluralized, de-'e'd. */
export function queryVariants(q: string): string[] {
  const raw = String(q || '').trim().toLowerCase();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  if (raw.endsWith('es') && raw.length > 4) out.add(raw.slice(0, -2));
  if (raw.endsWith('s') && raw.length > 3) out.add(raw.slice(0, -1));
  out.add(normalizeSearchTerm(raw));
  return [...out].filter(Boolean);
}

/** Whole-name matches float; processed lookalikes (ketchup for "tomato") sink.
 *  Stable within each band, so OFF's own relevance is preserved. */
export function rankResults(term: string, results: OffFood[]): OffFood[] {
  const t = normalizeSearchTerm(term);
  if (!t) return results;
  const band = (r: OffFood) => {
    const name = r.name.toLowerCase();
    if (name === t || name === `${t}s` || name === `${t}es`) return 0; // exact
    if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) return 1; // name contains the word
    return 2; // brand/ingredient match only (ketchup, marinara…)
  };
  return results.map((r, i) => ({ r, i, b: band(r) }))
    .sort((a, x) => a.b - x.b || a.i - x.i)
    .map((x) => x.r);
}

export function searchUrl(query: string): string {
  // world host is the only OFF subdomain with CORS enabled, so filter it to
  // US products in English — unfiltered results come back in any language
  return 'https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&search_simple=1&page_size=20&lc=en'
    + '&tagtype_0=countries&tag_contains_0=contains&tag_0=united-states'
    + `&fields=${OFF_FIELDS}`
    + `&search_terms=${encodeURIComponent(query)}`;
}

export function barcodeUrl(code: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
}

/** OFF's endpoints 503 in waves, and their rate-limit block page comes back as
 *  200 text/html (so json() throws). Both are transient — retry with backoff. */
async function offFetch(url: string, signal?: AbortSignal, retries = 2): Promise<any> {
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok && res.status !== 404) throw new Error(`Open Food Facts returned ${res.status}`);
    return await res.json(); // throws on the HTML block page → retried below
  } catch (e: any) {
    if (retries > 0 && e?.name !== 'AbortError' && !(signal && signal.aborted)) {
      await new Promise((r) => setTimeout(r, retries === 2 ? 800 : 1800));
      return offFetch(url, signal, retries - 1);
    }
    throw e;
  }
}

export async function searchOff(query: string, signal?: AbortSignal): Promise<OffFood[]> {
  const term = normalizeSearchTerm(query);
  const data = await offFetch(searchUrl(term), signal);
  const seen = new Set<string>();
  const results = (Array.isArray(data.products) ? data.products : [])
    .map(mapOffProduct)
    .filter((x: OffFood | null): x is OffFood => !!x)
    .filter((x: OffFood) => {
      const k = `${x.name}|${x.brand || ''}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  return rankResults(term, results);
}

/** Look up a single product by barcode. Resolves null when OFF has no usable
 *  data for it — the caller treats that as an unknown food. */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<OffFood | null> {
  const cleaned = String(code).replace(/\D/g, '');
  if (!cleaned) return null;
  const data = await offFetch(barcodeUrl(cleaned), signal);
  if (!data || data.status === 0 || !data.product) return null;
  return mapOffProduct(data.product);
}
