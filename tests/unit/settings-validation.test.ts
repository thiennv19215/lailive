import { describe, expect, it } from 'vitest';
import { createDefaultGlobalSettings } from '../../src/shared/contracts/global-settings';
import { globalSettingsSchema, settingKeySchema, settingWriteSchema } from '../../src/shared/validation/settings';

describe('settings IPC validation', () => {
  it('accepts namespaced setting keys', () => {
    expect(settingKeySchema.parse('project.current-id')).toBe('project.current-id');
  });

  it('rejects blank and executable-looking keys', () => {
    expect(() => settingWriteSchema.parse({ key: '', value: true })).toThrow();
    expect(() => settingWriteSchema.parse({ key: 'x; Remove-Item', value: true })).toThrow();
  });

  it('validates safe global provider metadata without cookie values', () => {
    const document = createDefaultGlobalSettings();
    document.grokAccounts.push({
      id: 'account-123e4567-e89b-12d3-a456-426614174000',
      label: 'Studio demo',
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    expect(globalSettingsSchema.parse(document).grokAccounts[0]?.label).toBe('Studio demo');
    expect(globalSettingsSchema.safeParse({ ...document, cookieJson: '{}' }).success).toBe(false);
    expect(globalSettingsSchema.safeParse({ ...document, grokAccounts: [{ ...document.grokAccounts[0], id: '../secret' }] }).success).toBe(false);
  });
});
