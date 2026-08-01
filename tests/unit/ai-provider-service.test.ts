import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiProviderService } from '../../electron/services/ai-provider';
import type { SettingsDatabase } from '../../electron/services/database';

const request = {
  requestId: 'request-1',
  systemMessage: 'System prompt',
  userMessage: 'User prompt',
  timeoutMs: 5_000,
  retryCount: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe('AI provider service', () => {
  it('uses the deterministic mock provider without network access', async () => {
    const service = new AiProviderService();
    expect(await service.testConnection({ kind: 'mock', baseUrl: 'http://127.0.0.1:11434', model: 'mock-livestream-v1' })).toMatchObject({ ok: true, models: ['mock-livestream-v1'] });
    const result = await service.generate({ ...request, userMessage: 'Tên: Serum M5' });
    expect(result).toMatchObject({ provider: 'mock', model: 'mock-livestream-v1', attempts: 1 });
    expect(result.text).toContain('Serum M5');
  });

  it('lists OpenAI-compatible models and retries a failed generation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('failed', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Câu trả lời hợp lệ.' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new AiProviderService();
    const config = { kind: 'openai-compatible' as const, baseUrl: 'https://provider.example/v1', model: 'model-a', apiKey: 'session-key' };
    expect(await service.testConnection(config)).toMatchObject({ ok: true, models: ['model-a'] });
    service.setConfig(config);
    await expect(service.generate(request)).resolves.toMatchObject({ text: 'Câu trả lời hợp lệ.', attempts: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('cancels an active provider request and releases it for later work', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const service = new AiProviderService();
    service.setConfig({ kind: 'openai-compatible', baseUrl: 'https://provider.example/v1', model: 'model-a', apiKey: 'session-key' });
    const pending = service.generate({ ...request, retryCount: 0 });
    await Promise.resolve();
    expect(service.cancel('request-1')).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(service.cancelAll()).toBe(0);
  });

  it('persists provider metadata but never stores or returns the API key', () => {
    const records = new Map<string, unknown>();
    const database = {
      get: (key: string) => records.has(key) ? { key, value: records.get(key), updatedAt: new Date().toISOString() } : null,
      set: (key: string, value: unknown) => { records.set(key, value); return { key, value, updatedAt: new Date().toISOString() }; },
    } as unknown as SettingsDatabase;
    const first = new AiProviderService(database);
    const publicConfig = first.setConfig({ kind: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini', apiKey: 'session-secret' });
    expect(publicConfig.hasApiKey).toBe(true);
    expect(publicConfig).not.toHaveProperty('apiKey');
    expect([...records.values()][0]).not.toHaveProperty('apiKey');
    const restarted = new AiProviderService(database);
    expect(restarted.getConfig()).toMatchObject({ kind: 'openrouter', model: 'openai/gpt-4.1-mini', hasApiKey: false });
  });
});
