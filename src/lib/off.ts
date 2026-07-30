/* Open Food Facts search — the app's only network feature (optional, online-only).
   Products come back with per-100g nutriments, so picks are saved as unit:'g100' foods. */
import { num, round } from './engine';

export type OffFood = {
  name: string; brand: string | null;
  protein: number; carbs: number; fat: number; // per 100 g
  verified: boolean; code: string;
};

/** Normalize one OFF product; null when it's unusable (no name or no macro data). */
export function mapOffProduct(p: any): OffFood | null {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.product_name || '').trim();
  const n = p.nutriments || {};
  const protein = num(n.proteins_100g), carbs = num(n.carbohydrates_100g), fat = num(n.fat_100g);
  if (!name || (protein === 0 && carbs === 0 && fat === 0)) return null;
  const brand = String(p.brands || '').split(',')[0].trim();
  return {
    name, brand: brand || null,
    protein: round(protein), carbs: round(carbs), fat: round(fat),
    verified: num(p.complete) === 1,
    code: String(p.code || ''),
  };
}

export function searchUrl(query: string): string {
  return 'https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&search_simple=1&page_size=20'
    + '&fields=code,product_name,brands,nutriments,complete'
    + `&search_terms=${encodeURIComponent(query)}`;
}

export async function searchOff(query: string, signal?: AbortSignal): Promise<OffFood[]> {
  const res = await fetch(searchUrl(query), { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  const data = await res.json();
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
