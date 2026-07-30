import { describe, it, expect } from 'vitest';
import { mapOffProduct, searchUrl, barcodeUrl } from './off';

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
  it('rejects products without a name or without any macro data', () => {
    expect(mapOffProduct({ ...chicken, product_name: '' })).toBeNull();
    expect(mapOffProduct({ ...chicken, nutriments: {} })).toBeNull();
    expect(mapOffProduct(null)).toBeNull();
    expect(mapOffProduct('junk')).toBeNull();
  });
  it('tolerates missing brand and rounds macros', () => {
    const r = mapOffProduct({ product_name: 'Oats', nutriments: { proteins_100g: 13.155, carbohydrates_100g: 67, fat_100g: 6.5 } })!;
    expect(r.brand).toBeNull();
    expect(r.protein).toBe(13.2);
  });
});

describe('searchUrl', () => {
  it('hits the OFF search endpoint with an encoded query', () => {
    const u = searchUrl('greek yogurt 2%');
    expect(u).toContain('world.openfoodfacts.org');
    expect(u).toContain('search_terms=greek%20yogurt%202%25');
    expect(u).toContain('json=1');
  });
});
