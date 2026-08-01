import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import App from './app/App.vue';
import { installDevBridge } from './app/install-dev-bridge';
import { router } from './app/router';
import { LAST_OPENED_PROJECT_KEY } from './shared/contracts/projects';
import './app/theme.css';

installDevBridge();

const app = createApp(App);
app.config.errorHandler = (error, instance, info) => {
  console.error('Renderer error', { error, instance, info });
};
app.use(createPinia());
app.use(router);
app.mount('#app');

async function finishRendererStartup(): Promise<void> {
  await router.isReady();
  const initialHash = globalThis.location.hash;
  if (initialHash === '' || initialHash === '#/') {
    try {
      const record = await globalThis.window.desktopApi.settings.get<unknown>(LAST_OPENED_PROJECT_KEY);
      if (typeof record?.value === 'string') {
        const project = await globalThis.window.desktopApi.projects.get(record.value);
        if (project) await router.replace(`/projects/${project.id}`);
      }
    } catch (error) {
      console.error('Failed to restore the last opened project', error);
    }
  }
  await globalThis.window.desktopApi.app.rendererReady();
}

void finishRendererStartup().catch((error: unknown) => {
  console.error('Failed to finish renderer startup', error);
});
