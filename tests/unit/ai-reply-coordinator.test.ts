import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAiReply } from '../../src/modules/ai/reply-coordinator';
import { createDefaultAiReplySettings } from '../../src/modules/ai/reply-engine';
import { createProduct } from '../../src/modules/products/catalog';
import { matchProduct } from '../../src/modules/products/matcher';
import type { NormalizedLiveEvent } from '../../src/shared/contracts/live';

const event: NormalizedLiveEvent = {
  id: 'event-ai-1', type: 'chat', source: 'mock', timestamp: '2026-07-29T00:00:00.000Z',
  user: { id: 'u1', uniqueId: 'lan', nickname: 'Lan' }, text: 'serum m5 giá bao nhiêu',
};
const product = createProduct({ id: 'serum-m5', name: 'Serum M5', price: '299.000đ' });
const baseInput = {
  requestId: 'request-ai-1', event, settings: createDefaultAiReplySettings(),
  productMatch: matchProduct(event.text ?? '', [product]), bannedOutputTerms: [],
};

function installAiApi(generate: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('window', { desktopApi: { ai: {
    generate,
    getConfig: vi.fn().mockResolvedValue({ kind: 'mock', baseUrl: 'http://127.0.0.1:11434', model: 'mock-livestream-v1', hasApiKey: false }),
  } } });
}

afterEach(() => vi.unstubAllGlobals());

describe('AI reply coordinator', () => {
  it('returns a cleaned provider reply with prompt diagnostics', async () => {
    installAiApi(vi.fn().mockResolvedValue({ text: '**Serum M5 có giá 299k.**', provider: 'mock', model: 'mock-livestream-v1', attempts: 1 }));
    const result = await generateAiReply(baseInput);
    expect(result).toMatchObject({ eventId: event.id, status: 'success', text: 'Serum M5 có giá 299k.', attempts: 1 });
    expect(result.prompt.productScore).toBe(1000);
  });

  it('replaces unsupported claims with a fact-safe fallback', async () => {
    installAiApi(vi.fn().mockResolvedValue({ text: 'Serum M5 chỉ 99k và freeship.', provider: 'mock', model: 'mock-livestream-v1', attempts: 1 }));
    const result = await generateAiReply(baseInput);
    expect(result.status).toBe('fallback');
    expect(result.reason).toBe('unsupported-price');
    expect(result.text).toContain('Serum M5');
    expect(result.text).not.toContain('99k');
  });

  it('does not let one provider failure block a later interaction', async () => {
    const generate = vi.fn()
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce({ text: 'Serum M5 có giá 299k.', provider: 'mock', model: 'mock-livestream-v1', attempts: 1 });
    installAiApi(generate);
    expect((await generateAiReply(baseInput)).status).toBe('fallback');
    expect((await generateAiReply({ ...baseInput, requestId: 'request-ai-2' })).status).toBe('success');
  });

  it('reports cancellation without speaking a fallback', async () => {
    installAiApi(vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(generateAiReply(baseInput)).resolves.toMatchObject({ status: 'cancelled', text: '', reason: 'cancelled' });
  });
});

