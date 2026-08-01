export const OBS_CONFIG_KEY = 'app.obs-config';
export const OBS_OWNED_OUTPUT_KEY = 'app.obs-owned-output';

export type ObsAdapterKind = 'mock' | 'obs-websocket';

export interface ObsConfig {
  kind: ObsAdapterKind;
  host: string;
  port: number;
  sceneName: string;
  sourceName: string;
  width: number;
  height: number;
  fps: number;
  hasPassword: boolean;
}

export interface ObsConfigInput extends Omit<ObsConfig, 'hasPassword'> {
  password?: string;
}

export interface ObsConnectionResult {
  ok: boolean;
  version: string | null;
  message: string;
}

export interface ObsOutputResult {
  ok: boolean;
  createdScene: boolean;
  createdSource: boolean;
  sceneName: string;
  sourceName: string;
  message: string;
}

export interface ObsStatus {
  connected: boolean;
  kind: ObsAdapterKind;
  version: string | null;
  sceneName: string;
  sourceName: string;
  browserSourceReady: boolean;
  programSceneActive: boolean;
  virtualCameraAvailable: boolean;
  virtualCameraActive: boolean;
  virtualCameraOwned: boolean;
  lastError: string | null;
}
