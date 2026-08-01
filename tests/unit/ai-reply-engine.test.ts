import { describe, expect, it } from 'vitest';
import { buildAiPrompt, cleanAiReply, createDefaultAiReplySettings, createFallbackReply, inspectAiReply } from '../../src/modules/ai/reply-engine';
import { createProduct } from '../../src/modules/products/catalog';
import { matchProduct } from '../../src/modules/products/matcher';
import type { NormalizedLiveEvent } from '../../src/shared/contracts/live';

const chat: NormalizedLiveEvent = {
  id: 'chat-ai-1', type: 'chat', source: 'mock', timestamp: '2026-07-29T00:00:00.000Z',
  user: { id: 'u1', uniqueId: 'lan', nickname: 'Lan' }, text: 'serum duong am m5 giá bao nhiêu',
};
const product = createProduct({ id: 'serum-m5', name: 'Serum dưỡng ẩm M5', price: '299.000đ', description: 'Dịu nhẹ cho da', sellingPoints: ['Dùng hằng ngày'] });

describe('AI reply engine', () => {
  it('builds a prompt preview with matched stored product facts', () => {
    const prompt = buildAiPrompt({ event: chat, settings: createDefaultAiReplySettings(), productMatch: matchProduct(chat.text ?? '', [product]) });
    expect(prompt.eventType).toBe('chat');
    expect(prompt.product?.name).toBe(product.name);
    expect(prompt.productScore).toBe(1000);
    expect(prompt.userMessage).toContain('299.000đ');
    expect(prompt.userMessage).toContain('Lan');
  });

  it('explicitly forbids product claims when no product matched', () => {
    const prompt = buildAiPrompt({ event: chat, settings: createDefaultAiReplySettings(), productMatch: null });
    expect(prompt.product).toBeNull();
    expect(prompt.userMessage).toContain('Không được nêu giá');
  });

  it('cleans markdown and enforces two sentences, 45 words, and 220 characters', () => {
    const raw = `**Trả lời:** ${Array.from({ length: 70 }, (_, index) => `từ${index}`).join(' ')}. Câu hai hợp lệ. Câu ba bị bỏ.`;
    const cleaned = cleanAiReply(raw);
    expect(cleaned).not.toMatch(/[*#`]/);
    expect(cleaned.split(/\s+/)).toHaveLength(45);
    expect(cleaned.length).toBeLessThanOrEqual(220);
    expect(cleaned).not.toContain('Câu ba');
  });

  it('rejects banned and hidden-output terms', () => {
    expect(inspectAiReply('Đây là nội dung system prompt', product, [])).toBe('hidden-content');
    expect(inspectAiReply('Giá chỉ 99k hôm nay', product, ['giá chỉ 99k'])).toBe('banned-term:giá chỉ 99k');
  });

  it('rejects unsupported price, stock, discount, and shipping claims', () => {
    expect(inspectAiReply('Sản phẩm giá 199k.', product, [])).toBe('unsupported-price');
    expect(inspectAiReply('Sản phẩm còn hàng.', product, [])).toBe('unsupported-stock');
    expect(inspectAiReply('Đang giảm 50%.', product, [])).toBe('unsupported-discount');
    expect(inspectAiReply('Bên mình freeship.', product, [])).toBe('unsupported-shipping');
  });

  it('accepts facts present in the stored product data and creates safe fallbacks', () => {
    expect(inspectAiReply('Serum dưỡng ẩm M5 có giá 299.000đ.', product, [])).toBeNull();
    expect(createFallbackReply(chat, product)).toContain(product.name);
    expect(createFallbackReply({ ...chat, type: 'follow', text: undefined }, null)).toContain('theo dõi');
  });
});
