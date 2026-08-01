import { createHash, randomUUID } from 'node:crypto';
import type { SettingsDatabase } from './database';
import { OBS_CONFIG_KEY, OBS_OWNED_OUTPUT_KEY, type ObsConfig, type ObsConfigInput, type ObsConnectionResult, type ObsOutputResult, type ObsStatus } from '../../src/shared/contracts/obs';
import { obsConfigInputSchema, obsConfigSchema } from '../../src/shared/validation/obs';

type ObsResponse = { requestStatus?: { result?: boolean; code?: number; comment?: string }; responseData?: Record<string, unknown> };

export interface ObsAdapter {
  connect(config: ObsConfigInput): Promise<string>;
  disconnect(): Promise<void>;
  ensureOutput(input: { sceneName: string; sourceName: string; runtimeUrl: string; width: number; height: number; fps: number; allowExisting: boolean }): Promise<{ createdScene: boolean; createdSource: boolean }>;
  getCurrentProgramScene(): Promise<string>;
  setCurrentProgramScene(sceneName: string): Promise<void>;
  getVirtualCameraActive(): Promise<boolean>;
  startVirtualCamera(): Promise<void>;
  stopVirtualCamera(): Promise<void>;
}

function sha256Base64(value: string): string {
  return createHash('sha256').update(value).digest('base64');
}

class ObsWebSocketClient {
  private socket: WebSocket | null = null;
  private readonly messages: Array<Record<string, unknown>> = [];
  private readonly waiters = new Set<{ predicate: (message: Record<string, unknown>) => boolean; resolve: (message: Record<string, unknown>) => void }>();

  async connect(config: ObsConfigInput): Promise<string> {
    await this.close();
    const socket = new WebSocket(`ws://${config.host}:${config.port}`);
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        const waiter = [...this.waiters].find((candidate) => candidate.predicate(message));
        if (waiter) {
          this.waiters.delete(waiter);
          waiter.resolve(message);
        } else this.messages.push(message);
      } catch {
        // Invalid OBS frames are ignored and the handshake/request timeout remains authoritative.
      }
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OBS_CONNECT_TIMEOUT')), 5_000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('OBS_CONNECT_FAILED')); }, { once: true });
    });
    const hello = await this.waitFor((message) => message.op === 0);
    const helloData = hello.d as { authentication?: { challenge?: string; salt?: string }; obsWebSocketVersion?: string } | undefined;
    let authentication: string | undefined;
    if (helloData?.authentication) {
      if (!config.password) throw new Error('OBS_PASSWORD_REQUIRED');
      const secret = sha256Base64(`${config.password}${helloData.authentication.salt ?? ''}`);
      authentication = sha256Base64(`${secret}${helloData.authentication.challenge ?? ''}`);
    }
    socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, ...(authentication ? { authentication } : {}) } }));
    await this.waitFor((message) => message.op === 2);
    return helloData?.obsWebSocketVersion ?? 'obs-websocket-v5';
  }

  async request(requestType: string, requestData?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('OBS_NOT_CONNECTED');
    const requestId = randomUUID();
    socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }));
    const message = await this.waitFor((candidate) => candidate.op === 7 && (candidate.d as { requestId?: unknown } | undefined)?.requestId === requestId);
    const response = message.d as ObsResponse | undefined;
    if (!response?.requestStatus?.result) throw new Error(response?.requestStatus?.comment || `OBS_REQUEST_${response?.requestStatus?.code ?? 'FAILED'}:${requestType}`);
    return response.responseData ?? {};
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.messages.length = 0;
    this.waiters.clear();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }

  private waitFor(predicate: (message: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
    const existingIndex = this.messages.findIndex(predicate);
    if (existingIndex >= 0) return Promise.resolve(this.messages.splice(existingIndex, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve: (message: Record<string, unknown>) => { clearTimeout(timer); resolve(message); } };
      const timer = setTimeout(() => { this.waiters.delete(waiter); reject(new Error('OBS_RESPONSE_TIMEOUT')); }, 5_000);
      this.waiters.add(waiter);
    });
  }
}

export class RealObsAdapter implements ObsAdapter {
  private readonly client = new ObsWebSocketClient();
  connect(config: ObsConfigInput): Promise<string> { return this.client.connect(config); }
  disconnect(): Promise<void> { return this.client.close(); }
  async ensureOutput(input: { sceneName: string; sourceName: string; runtimeUrl: string; width: number; height: number; fps: number; allowExisting: boolean }): Promise<{ createdScene: boolean; createdSource: boolean }> {
    const scenes = await this.client.request('GetSceneList') as { scenes?: Array<{ sceneName?: string }> };
    const sceneExists = scenes.scenes?.some((scene) => scene.sceneName === input.sceneName) ?? false;
    const inputs = await this.client.request('GetInputList') as { inputs?: Array<{ inputName?: string }> };
    const sourceExists = inputs.inputs?.some((source) => source.inputName === input.sourceName) ?? false;
    if (sceneExists && !input.allowExisting) throw new Error('OBS_SCENE_NAME_CONFLICT');
    if (sourceExists && !input.allowExisting) throw new Error('OBS_SOURCE_NAME_CONFLICT');
    if (!sceneExists) await this.client.request('CreateScene', { sceneName: input.sceneName });
    const settings = { url: input.runtimeUrl, width: input.width, height: input.height, fps_custom: true, fps: input.fps, shutdown: true };
    if (!sourceExists) {
      await this.client.request('CreateInput', { sceneName: input.sceneName, inputName: input.sourceName, inputKind: 'browser_source', inputSettings: settings, sceneItemEnabled: true });
    } else {
      await this.client.request('SetInputSettings', { inputName: input.sourceName, inputSettings: settings, overlay: true });
      try {
        await this.client.request('GetSceneItemId', { sceneName: input.sceneName, sourceName: input.sourceName });
      } catch {
        await this.client.request('CreateSceneItem', { sceneName: input.sceneName, sourceName: input.sourceName, sceneItemEnabled: true });
      }
    }
    return { createdScene: !sceneExists, createdSource: !sourceExists };
  }
  async getVirtualCameraActive(): Promise<boolean> {
    const result = await this.client.request('GetVirtualCamStatus');
    return result.outputActive === true;
  }
  async getCurrentProgramScene(): Promise<string> {
    const result = await this.client.request('GetCurrentProgramScene');
    if (typeof result.currentProgramSceneName !== 'string') throw new Error('OBS_CURRENT_SCENE_UNAVAILABLE');
    return result.currentProgramSceneName;
  }
  async setCurrentProgramScene(sceneName: string): Promise<void> { await this.client.request('SetCurrentProgramScene', { sceneName }); }
  async startVirtualCamera(): Promise<void> { await this.client.request('StartVirtualCam'); }
  async stopVirtualCamera(): Promise<void> { await this.client.request('StopVirtualCam'); }
}

export class MockObsAdapter implements ObsAdapter {
  connected = false;
  virtualCameraActive = false;
  currentProgramScene = 'Existing User Scene';
  readonly scenes = new Set<string>();
  readonly sources = new Set<string>();
  async connect(): Promise<string> { this.connected = true; return 'mock-obs-30.2.3'; }
  async disconnect(): Promise<void> { this.connected = false; }
  async ensureOutput(input: { sceneName: string; sourceName: string; allowExisting: boolean }): Promise<{ createdScene: boolean; createdSource: boolean }> {
    if (!this.connected) throw new Error('OBS_NOT_CONNECTED');
    const createdScene = !this.scenes.has(input.sceneName);
    const createdSource = !this.sources.has(input.sourceName);
    if (!createdScene && !input.allowExisting) throw new Error('OBS_SCENE_NAME_CONFLICT');
    if (!createdSource && !input.allowExisting) throw new Error('OBS_SOURCE_NAME_CONFLICT');
    this.scenes.add(input.sceneName);
    this.sources.add(input.sourceName);
    return { createdScene, createdSource };
  }
  async getVirtualCameraActive(): Promise<boolean> { if (!this.connected) throw new Error('OBS_NOT_CONNECTED'); return this.virtualCameraActive; }
  async getCurrentProgramScene(): Promise<string> { if (!this.connected) throw new Error('OBS_NOT_CONNECTED'); return this.currentProgramScene; }
  async setCurrentProgramScene(sceneName: string): Promise<void> { if (!this.connected) throw new Error('OBS_NOT_CONNECTED'); this.currentProgramScene = sceneName; }
  async startVirtualCamera(): Promise<void> { if (!this.connected) throw new Error('OBS_NOT_CONNECTED'); this.virtualCameraActive = true; }
  async stopVirtualCamera(): Promise<void> { if (!this.connected) throw new Error('OBS_NOT_CONNECTED'); this.virtualCameraActive = false; }
}

export class ObsService {
  private config: ObsConfigInput = { kind: 'mock', host: '127.0.0.1', port: 4455, sceneName: 'AI Livestream', sourceName: 'AI Livestream Browser', width: 1080, height: 1920, fps: 30 };
  private adapter: ObsAdapter | null = null;
  private version: string | null = null;
  private browserSourceReady = false;
  private programSceneActive = false;
  private virtualCameraAvailable = false;
  private virtualCameraActive = false;
  private virtualCameraOwned = false;
  private previousProgramScene: string | null = null;
  private lastError: string | null = null;

  constructor(private readonly database?: SettingsDatabase, private readonly adapters: { mock: ObsAdapter; 'obs-websocket': ObsAdapter } = { mock: new MockObsAdapter(), 'obs-websocket': new RealObsAdapter() }) {
    const stored = obsConfigSchema.safeParse(database?.get<unknown>(OBS_CONFIG_KEY)?.value);
    if (stored.success) this.config = { ...stored.data, password: undefined };
  }

  getConfig(): ObsConfig { return obsConfigSchema.parse({ ...this.config, hasPassword: Boolean(this.config.password) }); }
  getStatus(): ObsStatus { return { connected: this.adapter !== null, kind: this.config.kind, version: this.version, sceneName: this.config.sceneName, sourceName: this.config.sourceName, browserSourceReady: this.browserSourceReady, programSceneActive: this.programSceneActive, virtualCameraAvailable: this.virtualCameraAvailable, virtualCameraActive: this.virtualCameraActive, virtualCameraOwned: this.virtualCameraOwned, lastError: this.lastError }; }

  setConfig(input: ObsConfigInput): ObsConfig {
    const parsed = obsConfigInputSchema.parse(input);
    const sameEndpoint = parsed.kind === this.config.kind && parsed.host === this.config.host && parsed.port === this.config.port;
    this.config = { ...parsed, password: parsed.password || (sameEndpoint ? this.config.password : undefined) };
    const result = this.getConfig();
    this.database?.set(OBS_CONFIG_KEY, { ...result, hasPassword: false });
    return result;
  }

  async testConnection(input: ObsConfigInput): Promise<ObsConnectionResult> {
    this.setConfig(input);
    try {
      await this.disconnect();
      this.adapter = this.adapters[this.config.kind];
      this.version = await this.adapter.connect(this.config);
      try {
        this.virtualCameraActive = await this.adapter.getVirtualCameraActive();
        this.virtualCameraAvailable = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!/virtualcam.*not available|virtual camera.*not available/i.test(message)) throw error;
        this.virtualCameraActive = false;
        this.virtualCameraAvailable = false;
      }
      this.virtualCameraOwned = false;
      this.programSceneActive = false;
      this.previousProgramScene = null;
      this.lastError = null;
      return { ok: true, version: this.version, message: this.virtualCameraAvailable ? `Đã kết nối ${this.version}.` : `Đã kết nối ${this.version}; máy chưa có virtual camera.` };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'OBS_CONNECT_FAILED';
      await this.disconnect(true);
      return { ok: false, version: null, message: this.lastError };
    }
  }

  async ensureOutput(runtimeUrl: string): Promise<ObsOutputResult> {
    const adapter = this.requireAdapter();
    const owned = this.database?.get(OBS_OWNED_OUTPUT_KEY)?.value as { sceneName?: string; sourceName?: string } | undefined;
    const allowExisting = owned?.sceneName === this.config.sceneName && owned.sourceName === this.config.sourceName;
    try {
      const result = await adapter.ensureOutput({ ...this.config, runtimeUrl, allowExisting });
      this.database?.set(OBS_OWNED_OUTPUT_KEY, { sceneName: this.config.sceneName, sourceName: this.config.sourceName });
      this.browserSourceReady = true;
      this.lastError = null;
      return { ok: true, ...result, sceneName: this.config.sceneName, sourceName: this.config.sourceName, message: result.createdSource ? 'Đã tạo Browser Source riêng cho AI Livestream.' : 'Đã cập nhật Browser Source do ứng dụng quản lý.' };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'OBS_OUTPUT_FAILED';
      await this.disconnect(true);
      throw error;
    }
  }

  async startVirtualCamera(): Promise<ObsStatus> {
    const adapter = this.requireAdapter();
    if (!this.browserSourceReady) throw new Error('OBS_BROWSER_SOURCE_NOT_READY');
    if (!this.virtualCameraAvailable) throw new Error('OBS_VIRTUAL_CAMERA_UNAVAILABLE');
    if (this.virtualCameraActive && !this.virtualCameraOwned) throw new Error('OBS_VIRTUAL_CAMERA_ALREADY_ACTIVE');
    try {
      if (!this.programSceneActive) await this.showOutput();
      await adapter.startVirtualCamera();
      this.virtualCameraActive = await this.waitForVirtualCameraState(true, 'OBS_VIRTUAL_CAMERA_START_TIMEOUT');
      this.virtualCameraOwned = this.virtualCameraActive;
      this.lastError = null;
      return this.getStatus();
    } catch (error) {
      this.virtualCameraOwned = false;
      this.lastError = error instanceof Error ? error.message : 'OBS_VIRTUAL_CAMERA_START_FAILED';
      await this.disconnect(true);
      throw error;
    }
  }

  async stopVirtualCamera(): Promise<ObsStatus> {
    const adapter = this.requireAdapter();
    if (!this.virtualCameraOwned) throw new Error('OBS_VIRTUAL_CAMERA_NOT_OWNED');
    try {
      await adapter.stopVirtualCamera();
      this.virtualCameraActive = await this.waitForVirtualCameraState(false, 'OBS_VIRTUAL_CAMERA_STOP_TIMEOUT');
      this.virtualCameraOwned = false;
      if (this.programSceneActive && this.previousProgramScene) await adapter.setCurrentProgramScene(this.previousProgramScene);
      this.previousProgramScene = null;
      this.programSceneActive = false;
      this.lastError = null;
      return this.getStatus();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'OBS_VIRTUAL_CAMERA_STOP_FAILED';
      await this.disconnect(true);
      throw error;
    }
  }

  async showOutput(): Promise<ObsStatus> {
    const adapter = this.requireAdapter();
    if (!this.browserSourceReady) throw new Error('OBS_BROWSER_SOURCE_NOT_READY');
    const currentScene = await adapter.getCurrentProgramScene();
    if (!this.programSceneActive) this.previousProgramScene = currentScene === this.config.sceneName ? null : currentScene;
    if (currentScene !== this.config.sceneName) await adapter.setCurrentProgramScene(this.config.sceneName);
    this.programSceneActive = true;
    this.lastError = null;
    return this.getStatus();
  }

  private async waitForVirtualCameraState(expected: boolean, timeoutCode: string): Promise<boolean> {
    const adapter = this.requireAdapter();
    const deadline = Date.now() + 5_000;
    do {
      const active = await adapter.getVirtualCameraActive();
      if (active === expected) return active;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    throw new Error(timeoutCode);
  }

  async hideOutput(): Promise<ObsStatus> {
    const adapter = this.requireAdapter();
    if (this.virtualCameraOwned) await this.stopVirtualCamera();
    if (this.programSceneActive && this.previousProgramScene) await adapter.setCurrentProgramScene(this.previousProgramScene);
    this.previousProgramScene = null;
    this.programSceneActive = false;
    this.lastError = null;
    return this.getStatus();
  }

  async disconnect(preserveError = false): Promise<ObsStatus> {
    const adapter = this.adapter;
    let cleanupFailed = false;
    if (adapter && this.virtualCameraOwned) {
      try {
        await adapter.stopVirtualCamera();
      } catch (error) {
        cleanupFailed = true;
        if (!preserveError) this.lastError = error instanceof Error ? error.message : 'OBS_CLEANUP_FAILED';
      }
    }
    if (adapter && this.programSceneActive && this.previousProgramScene) {
      try { await adapter.setCurrentProgramScene(this.previousProgramScene); }
      catch (error) {
        cleanupFailed = true;
        if (!preserveError) this.lastError = error instanceof Error ? error.message : 'OBS_SCENE_RESTORE_FAILED';
      }
    }
    await adapter?.disconnect();
    this.adapter = null;
    this.version = null;
    this.browserSourceReady = false;
    this.programSceneActive = false;
    this.virtualCameraAvailable = false;
    this.virtualCameraActive = false;
    this.virtualCameraOwned = false;
    this.previousProgramScene = null;
    if (!preserveError && !cleanupFailed) this.lastError = null;
    return this.getStatus();
  }

  private requireAdapter(): ObsAdapter {
    if (!this.adapter) throw new Error('OBS_NOT_CONNECTED');
    return this.adapter;
  }
}
