import { z } from 'zod';
import { DEFAULT_TTS_TIMEOUT_MS } from '../contracts/tts';

export const ttsProviderKindSchema = z.enum(['mock', 'http', 'windows-speech']);
export const ttsProviderConfigInputSchema = z.object({
  kind: ttsProviderKindSchema,
  endpoint: z.union([
    z.literal(''),
    z.url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'TTS endpoint must use HTTP or HTTPS.'),
  ]),
  voices: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  apiKey: z.string().trim().max(4096).optional(),
});
export const ttsProviderConfigSchema = ttsProviderConfigInputSchema.omit({ apiKey: true }).extend({ hasApiKey: z.boolean() });
export const ttsProjectSettingsSchema = z.object({
  voice: z.string().trim().min(1).max(120),
  speed: z.number().min(0.5).max(2),
  volume: z.number().min(0).max(1),
  timeoutMs: z.number().int().min(1_000).max(DEFAULT_TTS_TIMEOUT_MS),
});
export const ttsSynthesizeInputSchema = z.object({
  requestId: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(2_000),
  voice: z.string().trim().min(1).max(120),
  speed: z.number().min(0.5).max(2),
  volume: z.number().min(0).max(1),
  timeoutMs: z.number().int().min(1_000).max(DEFAULT_TTS_TIMEOUT_MS),
});
