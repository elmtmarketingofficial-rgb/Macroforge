import { describe, it, expect } from 'vitest';
import { mapOffProduct, searchUrl } from './off';

describe('mapOffProduct', () => {
  const chicken = {
    code: '123', product_name: 'Chicken Breast Fillets', brands: 'FreeBird, Other Brand',
    complete: 1,
    nutriments: { proteins_100g: 22.5, carbohydrates_100g: 0.3, fat_100g: 2.1 },
  };
  it('maps per-100g nutriments and first brand', () => {
    const r = mapOffProduct(chicken)!;
    expect(r).toMatchObject({ name: 'Chicken Breast Fillets', brand: 'FreeBird', verified: true, code: '123' });
    expect(r.protein).toBe(22.5);
    expect(r.carbs).toBe(0.3);
    expect(r.fat).toBe(2.1);
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
