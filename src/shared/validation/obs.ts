import { z } from 'zod';

export const obsAdapterKindSchema = z.enum(['mock', 'obs-websocket']);
export const obsConfigInputSchema = z.object({
  kind: obsAdapterKindSchema,
  host: z.string().trim().min(1).max(253).refine((host) => ['127.0.0.1', 'localhost', '::1'].includes(host), 'OBS host must be local loopback.'),
  port: z.number().int().min(1).max(65_535),
  sceneName: z.string().trim().min(1).max(120),
  sourceName: z.string().trim().min(1).max(120),
  width: z.number().int().min(320).max(7680),
  height: z.number().int().min(320).max(7680),
  fps: z.number().int().min(1).max(120),
  password: z.string().max(4096).optional(),
});
export const obsConfigSchema = obsConfigInputSchema.omit({ password: true }).extend({ hasPassword: z.boolean() });
export const obsEnsureOutputSchema = z.object({ runtimeUrl: z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'http:' && url.hostname === '127.0.0.1';
}, 'Browser Source URL must use the local scene runtime.') });
