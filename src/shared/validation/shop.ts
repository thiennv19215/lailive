import { z } from 'zod';

export const shopAdapterKindSchema = z.enum(['mock', 'playwright']);
export const shopConfigSchema = z.object({
  kind: shopAdapterKindSchema,
  executablePath: z.string().trim().max(1024),
  dashboardUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname));
  }, 'Dashboard must use HTTPS or a loopback HTTP fixture.'),
});

export const shopRemoteProductSchema = z.object({
  remoteId: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1).max(500),
  index: z.number().int().min(0),
  pinned: z.boolean(),
  imageUrl: z.url().nullable(),
});

export const shopProductMappingSchema = z.object({
  remoteProductId: z.string().trim().min(1).max(240),
  localProductId: z.string().trim().min(1).max(160),
});

export const shopScheduleItemSchema = z.object({
  id: z.string().trim().min(1).max(160),
  remoteProductId: z.string().trim().min(1).max(240),
  localProductId: z.string().trim().min(1).max(160).nullable(),
  title: z.string().trim().min(1).max(500),
  durationSeconds: z.number().int().min(5).max(3600),
  retryCount: z.number().int().min(0).max(10),
});

export const shopMappingsSchema = z.array(shopProductMappingSchema).max(1000).superRefine((mappings, context) => {
  const remoteIds = new Set<string>();
  for (const [index, mapping] of mappings.entries()) {
    if (remoteIds.has(mapping.remoteProductId)) context.addIssue({ code: 'custom', path: [index, 'remoteProductId'], message: 'Remote product mappings must be unique.' });
    remoteIds.add(mapping.remoteProductId);
  }
});

export const shopScheduleSchema = z.array(shopScheduleItemSchema).max(500).superRefine((items, context) => {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (ids.has(item.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Schedule item IDs must be unique.' });
    ids.add(item.id);
  }
});

export const shopRuntimeDocumentSchema = z.object({
  version: z.literal(1),
  mappings: shopMappingsSchema,
  schedule: shopScheduleSchema,
});

export const shopPinInputSchema = z.object({ remoteProductId: z.string().trim().min(1).max(240) });
export const shopSkipInputSchema = z.object({ immediate: z.boolean().default(true) });

