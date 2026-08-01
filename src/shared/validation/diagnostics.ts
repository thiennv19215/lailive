import { z } from 'zod';

export const diagnosticLogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export const diagnosticLogQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  levels: z.array(diagnosticLogLevelSchema).max(4).optional(),
  sources: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  limit: z.number().int().min(1).max(2000).default(500),
});

export const diagnosticRecordSchema = z.object({
  level: diagnosticLogLevelSchema,
  source: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(2000),
  details: z.unknown().optional(),
});

export const queueDiagnosticEventSchema = z.object({
  kind: z.enum(['queue-full', 'job-error', 'job-cancelled', 'retry', 'cleared']),
  stage: z.enum(['queued', 'ai', 'tts', 'playback']).nullable(),
  count: z.number().int().min(0).max(1000).nullable(),
});

export const recoveryNoticeInputSchema = z.object({
  kind: z.enum(['database-recovered', 'database-quarantined', 'stale-lock-recovered', 'invalid-lock-replaced', 'shop-orphan-terminated', 'shop-owner-mismatch']),
  severity: z.enum(['info', 'warn']),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
  detail: z.unknown(),
});
