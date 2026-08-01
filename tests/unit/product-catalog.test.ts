import { describe, expect, it } from 'vitest';
import { createProduct, deleteProduct, exportProductCatalog, importProductCatalog, upsertProduct } from '../../src/modules/products/catalog';
import { matchProduct, normalizeProductText, scoreProduct } from '../../src/modules/products/matcher';
import { DEFAULT_PRODUCT_MATCH_THRESHOLD, EXACT_PRODUCT_NAME_SCORE } from '../../src/shared/contracts/products';

const now = new Date('2026-07-29T12:00:00.000Z');

describe('product catalog', () => {
  it('creates, updates, deletes, exports, and imports validated products', () => {
    const serum = createProduct({ id: 'serum-m5', name: 'Serum M5', price: '299.000đ', sellingPoints: ['Dịu nhẹ'], enabled: true }, now);
    expect(serum.createdAt).toBe(now.toISOString());
    const updated = { ...serum, description: 'Thông tin đã lưu', updatedAt: '2026-07-29T12:01:00.000Z' };
    expect(upsertProduct([serum], updated)[0]?.description).toBe('Thông tin đã lưu');
    const exported = exportProductCatalog([updated], now);
    expect(importProductCatalog(JSON.stringify(exported))).toEqual([updated]);
    expect(deleteProduct([updated], updated.id)).toEqual([]);
  });

  it('rejects duplicate ids and invalid imported envelopes', () => {
    const product = createProduct({ id: 'duplicate', name: 'Sản phẩm' }, now);
    expect(() => upsertProduct([product, product], product)).toThrow();
    expect(() => importProductCatalog('{"format":"wrong"}')).toThrow();
  });
});

describe('deterministic product matcher', () => {
  const products = [
    createProduct({ id: 'serum-m5', name: 'Serum dưỡng ẩm M5', price: '299.000đ', description: 'Stored serum facts' }, now),
    createProduct({ id: 'serum-m8', name: 'Serum dưỡng ẩm M8', price: '399.000đ', description: 'Stored M8 facts' }, now),
    createProduct({ id: 'dam-do', name: 'Đầm dự tiệc đỏ đô', price: '590.000đ' }, now),
    createProduct({ id: 'disabled', name: 'Kem chống nắng Solar', enabled: false }, now),
  ];

  it('scores exact product-name inclusion at 1000 after accent folding', () => {
    const candidate = scoreProduct('Shop ơi SERUM DUONG AM M5 còn hàng không?', products[0]!);
    expect(candidate).toMatchObject({ score: EXACT_PRODUCT_NAME_SCORE, exactName: true });
    expect(candidate.product.price).toBe('299.000đ');
  });

  it('matches accent-free Vietnamese phrases and exposes the top five debug candidates', () => {
    const result = matchProduct('dam du tiec do do size M', products);
    expect(result.normalizedComment).toBe(normalizeProductText('đầm dự tiệc đỏ đô size M'));
    expect(result.match?.product.id).toBe('dam-do');
    expect(result.candidates.length).toBeLessThanOrEqual(5);
    expect(result.candidates.every((candidate) => candidate.product.id !== 'disabled')).toBe(true);
  });

  it('uses the threshold to reject weak and ambiguous one-token matches', () => {
    const result = matchProduct('Mình muốn loại dưỡng', products, DEFAULT_PRODUCT_MATCH_THRESHOLD);
    expect(result.match).toBeNull();
    expect(result.candidates[0]?.score).toBeLessThan(DEFAULT_PRODUCT_MATCH_THRESHOLD);
  });

  it('ranks the intended variant deterministically without changing stored facts', () => {
    const result = matchProduct('serum dưỡng ẩm m8 dùng sao', products);
    expect(result.match?.product.id).toBe('serum-m8');
    expect(result.match?.score).toBe(EXACT_PRODUCT_NAME_SCORE);
    expect(result.match?.product.description).toBe('Stored M8 facts');
    expect(result.match?.product.price).toBe('399.000đ');
  });
});
