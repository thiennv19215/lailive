import { z } from 'zod';
import { LIVE_FIXTURE_FORMAT, LIVE_FIXTURE_VERSION, MAX_LIVE_FEED_EVENTS } from '../contracts/live';
import { projectIdSchema } from './projects';

export const liveConnectorModeSchema = z.enum(['mock', 'real']);
export const liveInteractionTypeSchema = z.enum(['chat', 'gift', 'like', 'follow', 'share']);
export const liveEventTypeSchema = z.enum(['chat', 'gift', 'like', 'follow', 'share', 'stream-end', 'error']);
export const liveUsernameSchema = z.string().trim().min(2).max(64).transform((value) => value.replace(/^@/, ''))
  .refine((value) => /^[a-z0-9._]+$/i.test(value), 'TikTok username contains unsupported characters.');
export const liveUserSchema = z.object({
  id: z.string().max(120),
  uniqueId: z.string().max(120),
  nickname: z.string().max(120),
  avatarUrl: z.url().optional(),
});
export const normalizedLiveEventSchema = z.object({
  id: z.string().min(1).max(160),
  type: liveEventTypeSchema,
  timestamp: z.iso.datetime(),
  source: liveConnectorModeSchema,
  user: liveUserSchema.optional(),
  text: z.string().max(1000).optional(),
  count: z.number().int().min(0).max(1_000_000_000).optional(),
  gift: z.object({
    id: z.string().max(120),
    name: z.string().max(160),
    diamondCount: z.number().int().min(0).max(1_000_000),
    repeatCount: z.number().int().min(1).max(1_000_000),
    repeatEnd: z.boolean(),
  }).optional(),
  errorCode: z.string().max(120).optional(),
});
export const liveConnectSchema = z.object({
  projectId: projectIdSchema,
  username: liveUsernameSchema,
  mode: liveConnectorModeSchema,
});
export const liveProbeSchema = z.object({
  username: liveUsernameSchema,
  mode: liveConnectorModeSchema,
});
export const liveFixtureEnvelopeSchema = z.object({
  format: z.literal(LIVE_FIXTURE_FORMAT),
  version: z.literal(LIVE_FIXTURE_VERSION),
  recordedAt: z.iso.datetime(),
  events: z.array(normalizedLiveEventSchema).max(MAX_LIVE_FEED_EVENTS),
});
