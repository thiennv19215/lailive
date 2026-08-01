import { z } from 'zod';
import { createDefaultModerationSettings } from '../contracts/moderation';

export const triggerActionTypeSchema = z.enum(['ignore', 'voice_tts', 'ai_speech']);
export const triggerRuleSchema = z.object({
  event: z.enum(['chat', 'gift', 'like', 'follow', 'share']),
  enabled: z.boolean(),
  actionType: triggerActionTypeSchema,
});
export const moderationSettingsSchema = z.object({
  duplicateWindowSeconds: z.number().int().min(0).max(600),
  globalCooldownSeconds: z.number().min(0).max(60),
  userCooldownSeconds: z.number().int().min(0).max(600),
  minimumCommentLength: z.number().int().min(0).max(40),
  allowKeywords: z.array(z.string().trim().min(1).max(80)).max(100),
  blockKeywords: z.array(z.string().trim().min(1).max(80)).max(100),
  bannedOutputTerms: z.array(z.string().trim().min(1).max(80)).max(100),
  triggers: z.array(triggerRuleSchema).length(5).refine(
    (triggers) => new Set(triggers.map((trigger) => trigger.event)).size === 5,
    'Each live interaction trigger must appear exactly once.',
  ),
});

export function parseModerationSettings(input: unknown) {
  return moderationSettingsSchema.parse(input ?? createDefaultModerationSettings());
}
