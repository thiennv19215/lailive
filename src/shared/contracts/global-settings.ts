export const GLOBAL_SETTINGS_KEY = 'app.global-settings' as const;
export const GLOBAL_SETTINGS_SCHEMA_VERSION = 1 as const;

export type GlobalProviderTab = 'grok' | 'veo';

export interface SafeProviderAccount {
  id: string;
  label: string;
  enabled: boolean;
  createdAt: string;
}

export interface GlobalSettingsDocument {
  schemaVersion: typeof GLOBAL_SETTINGS_SCHEMA_VERSION;
  activeProvider: GlobalProviderTab;
  grokAccounts: SafeProviderAccount[];
  veoDemo: {
    visible: boolean;
    enabled: boolean;
  };
}

export function createDefaultGlobalSettings(): GlobalSettingsDocument {
  return {
    schemaVersion: GLOBAL_SETTINGS_SCHEMA_VERSION,
    activeProvider: 'grok',
    grokAccounts: [],
    veoDemo: { visible: true, enabled: true },
  };
}
