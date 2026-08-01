import type { LiveInteractionType, NormalizedLiveEvent } from './live';
import type { ProductCatalogItem, ProductMatchResult } from './products';

export const AI_PROVIDER_CONFIG_KEY = 'app.ai-provider-config';
export const AI_REPLY_MAX_CHARACTERS = 220;
export const AI_REPLY_MAX_WORDS = 45;

export type AiProviderKind = 'mock' | 'openai-compatible' | 'openrouter' | 'ollama';

export interface AiProviderConfig {
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface AiProviderConfigInput {
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface AiConnectionResult {
  ok: boolean;
  models: string[];
  message: string;
}

export type AiEventTemplates = Record<LiveInteractionType, string>;

export interface AiReplySettings {
  systemPrompt: string;
  personaPrompt: string;
  eventTemplates: AiEventTemplates;
  timeoutMs: number;
  retryCount: number;
  fallbackEnabled: boolean;
}

export interface AiPromptPreview {
  systemMessage: string;
  userMessage: string;
  eventType: LiveInteractionType;
  product: ProductCatalogItem | null;
  productScore: number | null;
}

export interface AiPromptInput {
  event: NormalizedLiveEvent;
  settings: AiReplySettings;
  productMatch?: ProductMatchResult | null;
}

export interface AiGenerateInput extends AiPromptInput {
  requestId: string;
  bannedOutputTerms: string[];
}

export type AiReplyStatus = 'success' | 'fallback' | 'cancelled' | 'error';

export interface AiReplyResult {
  requestId: string;
  eventId: string;
  status: AiReplyStatus;
  text: string;
  provider: AiProviderKind;
  model: string;
  attempts: number;
  reason: string | null;
  prompt: AiPromptPreview;
}

export interface AiRawGenerateRequest {
  requestId: string;
  systemMessage: string;
  userMessage: string;
  timeoutMs: number;
  retryCount: number;
}

export interface AiRawGenerateResult {
  text: string;
  provider: AiProviderKind;
  model: string;
  attempts: number;
}

export function createDefaultAiReplySettings(): AiReplySettings {
  return {
    systemPrompt: 'Bạn là trợ lý bán hàng livestream. Trả lời tự nhiên, ngắn gọn và chỉ dùng dữ kiện được cung cấp.',
    personaPrompt: 'Giọng thân thiện, rõ ràng, không gây áp lực mua hàng.',
    eventTemplates: {
      chat: 'Trả lời bình luận của {{user}}: {{comment}}',
      gift: 'Cảm ơn {{user}} đã tặng {{gift}} x{{count}}.',
      like: 'Cảm ơn {{user}} đã thả {{count}} lượt thích.',
      follow: 'Cảm ơn {{user}} đã theo dõi kênh.',
      share: 'Cảm ơn {{user}} đã chia sẻ livestream.',
    },
    timeoutMs: 20_000,
    retryCount: 1,
    fallbackEnabled: true,
  };
}
