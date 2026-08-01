import type {
  AiConnectionResult,
  AiProviderConfig,
  AiProviderConfigInput,
  AiProviderKind,
  AiRawGenerateRequest,
  AiRawGenerateResult,
} from '../../src/shared/contracts/ai';
import { aiProviderConfigInputSchema, aiProviderConfigSchema, aiRawGenerateRequestSchema } from '../../src/shared/validation/ai';
import { AI_PROVIDER_CONFIG_KEY } from '../../src/shared/contracts/ai';
import type { SettingsDatabase } from './database';

interface AiProviderAdapter {
  readonly kind: AiProviderKind;
  listModels(config: AiProviderConfigInput, signal: AbortSignal): Promise<string[]>;
  generate(config: AiProviderConfigInput, request: AiRawGenerateRequest, signal: AbortSignal): Promise<string>;
}

function endpoint(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${suffix}`;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
  return response.json() as Promise<unknown>;
}

function bearerHeaders(apiKey?: string): Record<string, string> {
  return { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) };
}

class MockAiAdapter implements AiProviderAdapter {
  readonly kind = 'mock' as const;
  async listModels(): Promise<string[]> { return ['mock-livestream-v1']; }
  async generate(_config: AiProviderConfigInput, request: AiRawGenerateRequest): Promise<string> {
    const product = request.userMessage.match(/Tên:\s*([^\n]+)/)?.[1];
    return product
      ? `Dạ, ${product} đang có thông tin chính xác trên live. Bạn muốn mình tư vấn thêm về công dụng hay cách dùng nhé?`
      : 'Cảm ơn bạn đã tương tác. Mình đang ở đây và sẽ hỗ trợ thật ngắn gọn, rõ ràng nhé!';
  }
}

class OpenAiCompatibleAdapter implements AiProviderAdapter {
  constructor(readonly kind: 'openai-compatible' | 'openrouter') {}
  async listModels(config: AiProviderConfigInput, signal: AbortSignal): Promise<string[]> {
    const data = await fetchJson(endpoint(config.baseUrl, '/models'), { headers: bearerHeaders(config.apiKey), signal }) as { data?: Array<{ id?: unknown }> };
    return (data.data ?? []).map((model) => typeof model.id === 'string' ? model.id : '').filter(Boolean).slice(0, 200);
  }
  async generate(config: AiProviderConfigInput, request: AiRawGenerateRequest, signal: AbortSignal): Promise<string> {
    const data = await fetchJson(endpoint(config.baseUrl, '/chat/completions'), {
      method: 'POST', headers: bearerHeaders(config.apiKey), signal,
      body: JSON.stringify({ model: config.model, stream: false, temperature: 0.4, messages: [
        { role: 'system', content: request.systemMessage },
        { role: 'user', content: request.userMessage },
      ] }),
    }) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('AI_PROVIDER_EMPTY_RESPONSE');
    return content;
  }
}

class OllamaAdapter implements AiProviderAdapter {
  readonly kind = 'ollama' as const;
  async listModels(config: AiProviderConfigInput, signal: AbortSignal): Promise<string[]> {
    const data = await fetchJson(endpoint(config.baseUrl, '/api/tags'), { signal }) as { models?: Array<{ name?: unknown }> };
    return (data.models ?? []).map((model) => typeof model.name === 'string' ? model.name : '').filter(Boolean).slice(0, 200);
  }
  async generate(config: AiProviderConfigInput, request: AiRawGenerateRequest, signal: AbortSignal): Promise<string> {
    const data = await fetchJson(endpoint(config.baseUrl, '/api/chat'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ model: config.model, stream: false, messages: [
        { role: 'system', content: request.systemMessage },
        { role: 'user', content: request.userMessage },
      ] }),
    }) as { message?: { content?: unknown } };
    const content = data.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('AI_PROVIDER_EMPTY_RESPONSE');
    return content;
  }
}

const adapters: Record<AiProviderKind, AiProviderAdapter> = {
  mock: new MockAiAdapter(),
  'openai-compatible': new OpenAiCompatibleAdapter('openai-compatible'),
  openrouter: new OpenAiCompatibleAdapter('openrouter'),
  ollama: new OllamaAdapter(),
};

export class AiProviderService {
  private config: AiProviderConfigInput = { kind: 'mock', baseUrl: 'http://127.0.0.1:11434', model: 'mock-livestream-v1' };
  private readonly active = new Map<string, AbortController>();

  constructor(private readonly database?: SettingsDatabase) {
    const stored = database?.get<unknown>(AI_PROVIDER_CONFIG_KEY)?.value;
    const parsed = aiProviderConfigSchema.safeParse(stored);
    if (parsed.success) this.config = { kind: parsed.data.kind, baseUrl: parsed.data.baseUrl, model: parsed.data.model };
  }

  getConfig(): AiProviderConfig {
    return aiProviderConfigSchema.parse({ ...this.config, hasApiKey: Boolean(this.config.apiKey) });
  }

  setConfig(input: AiProviderConfigInput): AiProviderConfig {
    const parsed = aiProviderConfigInputSchema.parse(input);
    this.config = {
      ...parsed,
      apiKey: parsed.apiKey || (parsed.kind === this.config.kind && parsed.baseUrl === this.config.baseUrl ? this.config.apiKey : undefined),
    };
    const config = this.getConfig();
    this.database?.set(AI_PROVIDER_CONFIG_KEY, { ...config, hasApiKey: false });
    return config;
  }

  async testConnection(input: AiProviderConfigInput): Promise<AiConnectionResult> {
    const parsed = aiProviderConfigInputSchema.parse(input);
    const config = {
      ...parsed,
      apiKey: parsed.apiKey || (parsed.kind === this.config.kind && parsed.baseUrl === this.config.baseUrl ? this.config.apiKey : undefined),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const models = await adapters[config.kind].listModels(config, controller.signal);
      return { ok: true, models, message: models.length ? `Đã tìm thấy ${models.length} model.` : 'Kết nối thành công nhưng chưa có model.' };
    } catch (reason) {
      return { ok: false, models: [], message: reason instanceof Error ? reason.message : 'Không thể kết nối provider.' };
    } finally {
      clearTimeout(timer);
    }
  }

  async generate(input: AiRawGenerateRequest): Promise<AiRawGenerateResult> {
    const request = aiRawGenerateRequestSchema.parse(input);
    this.cancel(request.requestId);
    const cancellation = new AbortController();
    this.active.set(request.requestId, cancellation);
    const adapter = adapters[this.config.kind];
    let attempts = 0;
    try {
      while (attempts <= request.retryCount) {
        attempts += 1;
        const attempt = new AbortController();
        const cancelAttempt = (): void => attempt.abort();
        cancellation.signal.addEventListener('abort', cancelAttempt, { once: true });
        const timer = setTimeout(() => attempt.abort(), request.timeoutMs);
        try {
          const text = await adapter.generate(this.config, request, attempt.signal);
          return { text, provider: this.config.kind, model: this.config.model, attempts };
        } catch (reason) {
          if (cancellation.signal.aborted || attempts > request.retryCount) throw reason;
        } finally {
          clearTimeout(timer);
          cancellation.signal.removeEventListener('abort', cancelAttempt);
        }
      }
      throw new Error('AI_PROVIDER_RETRY_EXHAUSTED');
    } finally {
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
}
