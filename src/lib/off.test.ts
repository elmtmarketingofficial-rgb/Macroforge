import { describe, it, expect } from 'vitest';
import { mapOffProduct, searchUrl, barcodeUrl, normalizeSearchTerm, queryVariants, rankResults } from './off';

describe('search forgiveness', () => {
  it('strips the classic trailing-e typo after a vowel', () => {
    expect(normalizeSearchTerm('tomatoe')).toBe('tomato');
    expect(normalizeSearchTerm('Potatoe')).toBe('potato');
    expect(normalizeSearchTerm('apple')).toBe('apple');   // consonant + e stays
    expect(normalizeSearchTerm('cheese')).toBe('cheese');
  });
  it('queryVariants covers plurals and the typo', () => {
    expect(queryVariants('tomatoes')).toContain('tomato');
    expect(queryVariants('tomatoe')).toContain('tomato');
    expect(queryVariants('eggs')).toContain('egg');
    expect(queryVariants('')).toEqual([]);
  });
  it('rankResults floats whole-name matches above processed lookalikes', () => {
    const mk = (name) => ({ name, brand: null, protein: 1, carbs: 5, fat: 0, fiber: 0, sugars: 0, verified: false, code: name, groups: [] });
    const ranked = rankResults('tomatoe', [mk('Ketchup'), mk('Marinara Sauce'), mk('Diced Tomatoes'), mk('Tomato')]);
    expect(ranked[0].name).toBe('Tomato');
    expect(ranked[1].name).toBe('Diced Tomatoes');
    expect(ranked[3].name).toBe('Marinara Sauce');
  });
});

describe('mapOffProduct', () => {
  const chicken = {
    code: '123', product_name: 'Chicken Breast Fillets', brands: 'FreeBird, Other Brand',
    complete: 1, nova_group: 1, food_groups_tags: ['en:meat'],
    nutriments: { proteins_100g: 22.5, carbohydrates_100g: 0.3, fat_100g: 2.1, fiber_100g: 0, sugars_100g: 0.2 },
  };
  it('maps per-100g nutriments and first brand', () => {
    const r = mapOffProduct(chicken)!;
    expect(r).toMatchObject({ name: 'Chicken Breast Fillets', brand: 'FreeBird', verified: true, code: '123' });
    expect(r.protein).toBe(22.5);
    expect(r.carbs).toBe(0.3);
    expect(r.fat).toBe(2.1);
  });
  it('carries nova, food groups, fiber and sugars', () => {
    const r = mapOffProduct(chicken)!;
    expect(r.nova).toBe(1);
    expect(r.groups).toContain('en:meat');
    expect(r.sugars).toBe(0.2);
    expect(r.fiber).toBe(0);
  });
  it('barcodeUrl targets the v2 product endpoint', () => {
    expect(barcodeUrl('3017620422003')).toContain('/api/v2/product/3017620422003.json');
  });
  it('unverified when complete !== 1', () => {
    expect(mapOffProduct({ ...chicken, complete: 0 })!.verified).toBe(false);
    expect(mapOffProduct({ ...chicken, complete: undefined })!.verified).toBe(false);
  });
  it('rejects products without a name or without any nutrition data', () => {
    expect(mapOffProduct({ ...chicken, product_name: '' })).toBeNull();
    expect(mapOffProduct({ ...chicken, nutriments: {} })).toBeNull();
    expect(mapOffProduct(null)).toBeNull();
    expect(mapOffProduct('junk')).toBeNull();
  });
  it('accepts all-zero macros when nutrition data exists — water is real data', () => {
    const water = {
      code: '071142213011', product_name: 'Ozarka Spring Water',
      nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
      food_groups_tags: ['en:waters'],
    };
    const r = mapOffProduct(water)!;
    expect(r).not.toBeNull();
    expect(r.name).toBe('Ozarka Spring Water');
    expect(r.protein).toBe(0);
  });
  it('tolerates missing brand and rounds macros', () => {
    const r = mapOffProduct({ product_name: 'Oats', nutriments: { proteins_100g: 13.155, carbohydrates_100g: 67, fat_100g: 6.5 } })!;
    expect(r.brand).toBeNull();
    expect(r.protein).toBe(13.2);
  });
  it('prefers the English product name when present', () => {
    const r = mapOffProduct({ product_name: 'Chocolat en poudre', product_name_en: 'Chocolate powder', nutriments: { proteins_100g: 11, carbohydrates_100g: 11, fat_100g: 3 } })!;
    expect(r.name).toBe('Chocolate powder');
  });
});

describe('searchUrl', () => {
  it('searches the CORS-enabled world host filtered to US products in English', () => {
    const u = searchUrl('greek yogurt 2%');
    expect(u).toContain('world.openfoodfacts.org'); // only OFF host with CORS
    expect(u).toContain('tag_0=united-states');
    expect(u).toContain('lc=en');
    expect(u).toContain('product_name_en');
    expect(u).toContain('search_terms=greek%20yogurt%202%25');
    expect(u).toContain('json=1');
  });
});
