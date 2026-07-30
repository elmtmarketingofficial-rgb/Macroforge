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

const OFF_FIELDS = 'code,product_name,brands,nutriments,complete,nova_group,food_groups_tags,categories_tags';

/** Normalize one OFF product; null when it's unusable (no name or no macro data). */
export function mapOffProduct(p: any): OffFood | null {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.product_name || '').trim();
  const n = p.nutriments || {};
  const protein = num(n.proteins_100g), carbs = num(n.carbohydrates_100g), fat = num(n.fat_100g);
  if (!name || (protein === 0 && carbs === 0 && fat === 0)) return null;
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

export function searchUrl(query: string): string {
  return 'https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&search_simple=1&page_size=20'
    + `&fields=${OFF_FIELDS}`
    + `&search_terms=${encodeURIComponent(query)}`;
}

export function barcodeUrl(code: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
}

/** OFF's endpoints 503 intermittently — one automatic retry absorbs most of them. */
async function offFetch(url: string, signal?: AbortSignal, retries = 1): Promise<any> {
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok && res.status !== 404) throw new Error(`Open Food Facts returned ${res.status}`);
    return await res.json();
  } catch (e: any) {
    if (retries > 0 && e?.name !== 'AbortError' && !(signal && signal.aborted)) {
      await new Promise((r) => setTimeout(r, 800));
      return offFetch(url, signal, retries - 1);
    }
    throw e;
  }
}

export async function searchOff(query: string, signal?: AbortSignal): Promise<OffFood[]> {
  const data = await offFetch(searchUrl(query), signal);
  const seen = new Set<string>();
  return (Array.isArray(data.products) ? data.products : [])
    .map(mapOffProduct)
    .filter((x: OffFood | null): x is OffFood => !!x)
    .filter((x: OffFood) => {
      const k = `${x.name}|${x.brand || ''}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
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
