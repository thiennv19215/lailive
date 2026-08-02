export const TTS_PROVIDER_CONFIG_KEY = 'app.tts-provider-config';
export const DEFAULT_TTS_TIMEOUT_MS = 120_000;

export type TtsProviderKind = 'mock' | 'http';
export type TtsTransport = 'audio';

export interface TtsProviderConfig {
  kind: TtsProviderKind;
  endpoint: string;
  voices: string[];
  hasApiKey: boolean;
}

export interface TtsProviderConfigInput {
  kind: TtsProviderKind;
  endpoint: string;
  voices: string[];
  apiKey?: string;
}

export interface TtsProjectSettings {
  voice: string;
  speed: number;
  volume: number;
  timeoutMs: number;
}

export interface TtsSynthesizeInput {
  requestId: string;
  text: string;
  voice: string;
  speed: number;
  volume: number;
  timeoutMs: number;
}

export interface TtsSynthesisResult {
  requestId: string;
  provider: TtsProviderKind;
  transport: TtsTransport;
  text: string;
  voice: string;
  durationMs: number;
  mimeType: string | null;
  // Audio is always playable by an isolated browser renderer.
  audioBase64: string;
  audioUrl: string | null;
  cacheKey: string;
  cached: boolean;
}

export interface TtsConnectionResult {
  ok: boolean;
  voices: string[];
  message: string;
}

export function createDefaultTtsProjectSettings(): TtsProjectSettings {
  return { voice: 'Mỹ Dung', speed: 1, volume: 1, timeoutMs: DEFAULT_TTS_TIMEOUT_MS };
}
