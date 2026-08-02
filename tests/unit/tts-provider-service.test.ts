import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtsProviderService } from '../../electron/services/tts-provider';
import type { SettingsDatabase } from '../../electron/services/database';

const synthesis = { requestId: 'tts-1', text: 'Xin chào livestream', voice: 'Mỹ Dung', speed: 1, volume: 1, timeoutMs: 5_000 };

afterEach(() => vi.unstubAllGlobals());

describe('TTS provider service', () => {
  it('synthesizes deterministic mock speech and reuses the cache', async () => {
    const service = new TtsProviderService();
    const first = await service.synthesize(synthesis);
    const second = await service.synthesize({ ...synthesis, requestId: 'tts-2' });
    expect(first).toMatchObject({ provider: 'mock', transport: 'audio', mimeType: 'audio/wav', cached: false });
    expect(first.audioBase64.length).toBeGreaterThan(100);
    expect(second).toMatchObject({ requestId: 'tts-2', cacheKey: first.cacheKey, cached: true });
    expect(service.clearCache()).toBe(1);
  });

  it('returns bounded HTTP audio and caches it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'audio/wav' } }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new TtsProviderService();
    service.setConfig({ kind: 'http', endpoint: 'https://tts.example/synthesize', voices: ['vi-VN-1'], apiKey: 'session-secret' });
    const result = await service.synthesize({ ...synthesis, voice: 'vi-VN-1' });
    expect(result).toMatchObject({ provider: 'http', transport: 'audio', mimeType: 'audio/wav', audioBase64: 'AQIDBA==', audioUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await service.synthesize({ ...synthesis, requestId: 'tts-2', voice: 'vi-VN-1' })).cached).toBe(true);
  });

  it('cancels an active HTTP request', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const service = new TtsProviderService();
    service.setConfig({ kind: 'http', endpoint: 'https://tts.example/synthesize', voices: ['vi-VN-1'] });
    const pending = service.synthesize({ ...synthesis, voice: 'vi-VN-1' });
    await Promise.resolve();
    expect(service.cancel('tts-1')).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('persists public metadata without storing or returning API keys', () => {
    const records = new Map<string, unknown>();
    const database = {
      get: (key: string) => records.has(key) ? { key, value: records.get(key), updatedAt: new Date().toISOString() } : null,
      set: (key: string, value: unknown) => { records.set(key, value); return { key, value, updatedAt: new Date().toISOString() }; },
    } as unknown as SettingsDatabase;
    const service = new TtsProviderService(database);
    const config = service.setConfig({ kind: 'http', endpoint: 'https://tts.example/synthesize', voices: ['vi-VN-1'], apiKey: 'session-secret' });
    expect(config.hasApiKey).toBe(true);
    expect(config).not.toHaveProperty('apiKey');
    expect([...records.values()][0]).not.toHaveProperty('apiKey');
    expect(new TtsProviderService(database).getConfig()).toMatchObject({ kind: 'http', voices: ['vi-VN-1'], hasApiKey: false });
  });
});
