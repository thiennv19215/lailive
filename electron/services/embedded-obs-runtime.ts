import { createRequire } from 'node:module';

export interface EmbeddedObsRuntime {
  startup(input: { locale: 'en-US'; width: number; height: number; fps: number }): void | Promise<void>;
  createBrowserOutput(input: { sceneName: string; sourceName: string; url: string; width: number; height: number; fps: number }): void | Promise<void>;
  getVirtualCameraActive(): boolean | Promise<boolean>;
  startVirtualCamera(): void | Promise<void>;
  stopVirtualCamera(): void | Promise<void>;
  shutdown(): void | Promise<void>;
}

// This addon must be built from public libobs sources, never supplied by the reference app.
export function loadEmbeddedObsRuntime(modulePath = process.env.AI_LIVESTREAM_EMBEDDED_OBS_MODULE): EmbeddedObsRuntime {
  if (!modulePath) throw new Error('EMBEDDED_OBS_RUNTIME_NOT_CONFIGURED');
  let loaded: unknown;
  try {
    loaded = createRequire(import.meta.url)(modulePath);
  } catch {
    throw new Error('EMBEDDED_OBS_RUNTIME_NOT_FOUND');
  }
  if (!loaded || typeof loaded !== 'object') throw new Error('EMBEDDED_OBS_RUNTIME_INVALID');
  const runtime = loaded as Partial<EmbeddedObsRuntime>;
  const required: Array<keyof EmbeddedObsRuntime> = ['startup', 'createBrowserOutput', 'getVirtualCameraActive', 'startVirtualCamera', 'stopVirtualCamera', 'shutdown'];
  if (required.some((key) => typeof runtime[key] !== 'function')) throw new Error('EMBEDDED_OBS_RUNTIME_INVALID');
  return runtime as EmbeddedObsRuntime;
}
