import { z } from 'zod';
import { GLOBAL_SETTINGS_SCHEMA_VERSION } from '../contracts/global-settings';

export const settingKeySchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9._-]+$/i);

export const settingWriteSchema = z.object({
  key: settingKeySchema,
  value: z.unknown(),
});

export const safeProviderAccountSchema = z.object({
  id: z.string().regex(/^account-[a-f0-9-]{36}$/i),
  label: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
}).strict();

export const globalSettingsSchema = z.object({
  schemaVersion: z.literal(GLOBAL_SETTINGS_SCHEMA_VERSION),
  activeProvider: z.enum(['grok', 'veo']),
  grokAccounts: z.array(safeProviderAccountSchema).max(50).refine(
    (accounts) => new Set(accounts.map((account) => account.id)).size === accounts.length,
    'Provider account IDs must be unique.',
  ),
  veoDemo: z.object({ visible: z.boolean(), enabled: z.boolean() }),
}).strict();
