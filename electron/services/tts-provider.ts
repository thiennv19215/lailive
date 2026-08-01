import { createHash } from 'node:crypto';
import { TTS_PROVIDER_CONFIG_KEY, type TtsConnectionResult, type TtsProviderConfig, type TtsProviderConfigInput, type TtsSynthesisResult, type TtsSynthesizeInput } from '../../src/shared/contracts/tts';
import { ttsProviderConfigInputSchema, ttsProviderConfigSchema, ttsSynthesizeInputSchema } from '../../src/shared/validation/tts';
import type { SettingsDatabase } from './database';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_CACHE_ITEMS = 100;

function cacheKey(config: TtsProviderConfigInput, input: TtsSynthesizeInput): string {
  return createHash('sha256').update(JSON.stringify({ kind: config.kind, endpoint: config.endpoint, text: input.text, voice: input.voice, speed: input.speed })).digest('hex');
}

export class TtsProviderService {
  private config: TtsProviderConfigInput = { kind: 'mock', endpoint: '', voices: ['Mỹ Dung', 'Minh Anh', 'Ngọc Lam'] };
  private readonly active = new Map<string, AbortController>();
  private readonly cache = new Map<string, TtsSynthesisResult>();

  constructor(private readonly database?: SettingsDatabase) {
    const stored = database?.get<unknown>(TTS_PROVIDER_CONFIG_KEY)?.value;
    const parsed = ttsProviderConfigSchema.safeParse(stored);
    if (parsed.success) this.config = { kind: parsed.data.kind, endpoint: parsed.data.endpoint, voices: parsed.data.voices };
  }

  getConfig(): TtsProviderConfig {
    return ttsProviderConfigSchema.parse({ ...this.config, hasApiKey: Boolean(this.config.apiKey) });
  }

  setConfig(input: TtsProviderConfigInput): TtsProviderConfig {
    const parsed = ttsProviderConfigInputSchema.parse(input);
    this.config = {
      ...parsed,
      apiKey: parsed.apiKey || (parsed.kind === this.config.kind && parsed.endpoint === this.config.endpoint ? this.config.apiKey : undefined),
    };
    const config = this.getConfig();
    this.database?.set(TTS_PROVIDER_CONFIG_KEY, { ...config, hasApiKey: false });
    return config;
  }

  async testConnection(input: TtsProviderConfigInput): Promise<TtsConnectionResult> {
    const parsed = ttsProviderConfigInputSchema.parse(input);
    if (parsed.kind === 'mock') return { ok: true, voices: parsed.voices, message: 'TTS mock local sẵn sàng.' };
    if (parsed.kind === 'windows-speech') return { ok: true, voices: parsed.voices, message: 'Windows speech sẽ dùng voice khả dụng trong renderer.' };
    const config = { ...parsed, apiKey: parsed.apiKey || (parsed.endpoint === this.config.endpoint ? this.config.apiKey : undefined) };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(config.endpoint, {
        method: 'OPTIONS', signal: controller.signal,
        headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : undefined,
      });
      return response.ok || response.status === 405
        ? { ok: true, voices: config.voices, message: 'Endpoint TTS có phản hồi.' }
        : { ok: false, voices: config.voices, message: `TTS_PROVIDER_HTTP_${response.status}` };
    } catch (reason) {
      return { ok: false, voices: config.voices, message: reason instanceof Error ? reason.message : 'Không thể kết nối TTS.' };
    } finally {
      clearTimeout(timer);
    }
  }

  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesisResult> {
    const request = ttsSynthesizeInputSchema.parse(input);
    this.cancel(request.requestId);
    const key = cacheKey(this.config, request);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return { ...cached, requestId: request.requestId, cached: true };
    }
    const controller = new AbortController();
    this.active.set(request.requestId, controller);
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      let result: TtsSynthesisResult;
      if (this.config.kind === 'mock') {
        result = {
          requestId: request.requestId, provider: 'mock', transport: 'mock', text: request.text,
          voice: request.voice, durationMs: Math.min(3_000, Math.max(180, request.text.length * 18)),
          mimeType: null, audioBase64: null, cacheKey: key, cached: false,
        };
      } else if (this.config.kind === 'windows-speech') {
        result = {
          requestId: request.requestId, provider: 'windows-speech', transport: 'speech-synthesis', text: request.text,
          voice: request.voice, durationMs: 0, mimeType: null, audioBase64: null, cacheKey: key, cached: false,
        };
      } else {
        const response = await fetch(this.config.endpoint, {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}) },
          body: JSON.stringify({ text: request.text, voice: request.voice, speed: request.speed, volume: request.volume }),
        });
        if (!response.ok) throw new Error(`TTS_PROVIDER_HTTP_${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) throw new Error('TTS_PROVIDER_INVALID_AUDIO_SIZE');
        result = {
          requestId: request.requestId, provider: 'http', transport: 'audio', text: request.text,
          voice: request.voice, durationMs: 0, mimeType: response.headers.get('content-type') || 'audio/mpeg',
          audioBase64: Buffer.from(bytes).toString('base64'), cacheKey: key, cached: false,
        };
      }
      this.remember(result);
      return result;
    } finally {
      clearTimeout(timer);
      this.active.delete(request.requestId);
    }
  }

  cancel(requestId: string): boolean {
    const controller = this.active.get(requestId);
    if (!controller) return false;
    controller.abort();
    this.active.delete(requestId);
    return true;
  }

  cancelAll(): number {
    const count = this.active.size;
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
    return count;
  }

  clearCache(): number {
    const count = this.cache.size;
    this.cache.clear();
    return count;
  }

  private remember(result: TtsSynthesisResult): void {
    this.cache.set(result.cacheKey, result);
    while (this.cache.size > MAX_CACHE_ITEMS) this.cache.delete(this.cache.keys().next().value as string);
  }
}

