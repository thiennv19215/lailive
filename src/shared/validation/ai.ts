import { z } from 'zod';
import { AI_REPLY_MAX_CHARACTERS, AI_REPLY_MAX_WORDS } from '../contracts/ai';

export const aiProviderKindSchema = z.enum(['mock', 'openai-compatible', 'openrouter', 'ollama']);
export const aiProviderConfigInputSchema = z.object({
  kind: aiProviderKindSchema,
  baseUrl: z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Provider URL must use HTTP or HTTPS.'),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().max(4096).optional(),
});
export const aiProviderConfigSchema = aiProviderConfigInputSchema.omit({ apiKey: true }).extend({ hasApiKey: z.boolean() });

export const aiEventTemplatesSchema = z.object({
  chat: z.string().trim().min(1).max(1000),
  gift: z.string().trim().min(1).max(1000),
  like: z.string().trim().min(1).max(1000),
  follow: z.string().trim().min(1).max(1000),
  share: z.string().trim().min(1).max(1000),
});

export const aiReplySettingsSchema = z.object({
  systemPrompt: z.string().trim().min(1).max(4000),
  personaPrompt: z.string().trim().min(1).max(4000),
  eventTemplates: aiEventTemplatesSchema,
  timeoutMs: z.number().int().min(1_000).max(120_000),
  retryCount: z.number().int().min(0).max(3),
  fallbackEnabled: z.boolean(),
});

export const aiRawGenerateRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(120),
  systemMessage: z.string().trim().min(1).max(12_000),
  userMessage: z.string().trim().min(1).max(12_000),
  timeoutMs: z.number().int().min(1_000).max(120_000),
  retryCount: z.number().int().min(0).max(3),
});

export const aiReplyLimitSchema = z.object({
  characters: z.literal(AI_REPLY_MAX_CHARACTERS),
  words: z.literal(AI_REPLY_MAX_WORDS),
});

