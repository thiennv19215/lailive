import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePreferencesStore = defineStore('preferences', () => {
  const workspaceName = ref('Studio đầu tiên');
  const loaded = ref(false);
  const saving = ref(false);

  async function load(): Promise<void> {
    const record = await window.desktopApi.settings.get<string>('sample.workspace-name');
    if (typeof record?.value === 'string') workspaceName.value = record.value;
    loaded.value = true;
  }

  async function saveWorkspaceName(value: string): Promise<void> {
    workspaceName.value = value;
    saving.value = true;
    try {
      await window.desktopApi.settings.set('sample.workspace-name', value);
    } finally {
      saving.value = false;
    }
  }

  return { workspaceName, loaded, saving, load, saveWorkspaceName };
});
