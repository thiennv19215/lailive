import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { describe, expect, it } from 'vitest';
import { EmbeddedLibobsAdapter, MockObsAdapter, ObsService, RealObsAdapter } from '../../electron/services/obs';
import type { SettingsDatabase } from '../../electron/services/database';
import { OBS_CONFIG_KEY, OBS_OWNED_OUTPUT_KEY } from '../../src/shared/contracts/obs';
import { obsConfigInputSchema, obsEnsureOutputSchema } from '../../src/shared/validation/obs';

function fakeDatabase(): { database: SettingsDatabase; records: Map<string, unknown> } {
  const records = new Map<string, unknown>();
  return {
    records,
    database: {
      get: (key: string) => records.has(key) ? { key, value: records.get(key), updatedAt: new Date().toISOString() } : null,
      set: (key: string, value: unknown) => { records.set(key, value); return { key, value, updatedAt: new Date().toISOString() }; },
    } as unknown as SettingsDatabase,
  };
}

const config = {
  kind: 'mock' as const,
  host: '127.0.0.1',
  port: 4455,
  sceneName: 'AI Livestream Test',
  sourceName: 'AI Livestream Browser Test',
  width: 1080,
  height: 1920,
  fps: 30,
  password: 'session-secret',
};

describe('ObsService', () => {
  it('runs the reference-shaped embedded Browser Source to virtual-camera lifecycle', async () => {
    const calls: string[] = [];
    let cameraActive = false;
    const runtime = {
      startup: async ({ width, height, fps }: { width: number; height: number; fps: number }) => { calls.push(`startup:${width}x${height}@${fps}`); },
      createBrowserOutput: async ({ url }: { url: string }) => { calls.push(`browser:${url}`); },
      getVirtualCameraActive: async () => cameraActive,
      startVirtualCamera: async () => { calls.push('camera:start'); cameraActive = true; },
      stopVirtualCamera: async () => { calls.push('camera:stop'); cameraActive = false; },
      shutdown: async () => { calls.push('shutdown'); },
    };
    const embedded = new EmbeddedLibobsAdapter(() => runtime);
    const service = new ObsService(undefined, { 'embedded-libobs': embedded });
    const embeddedConfig = { ...config, kind: 'embedded-libobs' as const };

    await expect(service.testConnection(embeddedConfig)).resolves.toMatchObject({ ok: true, version: 'embedded-libobs' });
    await expect(service.ensureOutput('http://127.0.0.1:54321/')).resolves.toMatchObject({ createdScene: true, createdSource: true, audioRouted: false });
    await expect(service.startVirtualCamera()).resolves.toMatchObject({ virtualCameraActive: true, virtualCameraOwned: true });
    await expect(service.stopVirtualCamera()).resolves.toMatchObject({ virtualCameraActive: false, virtualCameraOwned: false });
    await service.disconnect();

    expect(calls).toEqual(['startup:1080x1920@30', 'browser:http://127.0.0.1:54321/', 'camera:start', 'camera:stop', 'shutdown']);
  });

  it('persists public connection metadata without persisting or returning the password', () => {
    const { database, records } = fakeDatabase();
    const service = new ObsService(database);
    const result = service.setConfig(config);
    expect(result.hasPassword).toBe(true);
    expect(result).not.toHaveProperty('password');
    expect(records.get(OBS_CONFIG_KEY)).not.toHaveProperty('password');
    expect(records.get(OBS_CONFIG_KEY)).toMatchObject({ hasPassword: false, host: '127.0.0.1', port: 4455 });

    const restarted = new ObsService(database);
    expect(restarted.getConfig()).toMatchObject({ sceneName: config.sceneName, hasPassword: false });
  });

  it('creates an owned output and runs repeated virtual-camera cycles without leaking state', async () => {
    const { database, records } = fakeDatabase();
    const mock = new MockObsAdapter();
    const service = new ObsService(database, { mock, 'obs-websocket': new MockObsAdapter() });
    await expect(service.testConnection(config)).resolves.toMatchObject({ ok: true, version: 'mock-obs-30.2.3' });
    await expect(service.ensureOutput('http://127.0.0.1:54321/')).resolves.toMatchObject({ createdScene: true, createdSource: true, audioRouted: true });
    expect(records.get(OBS_OWNED_OUTPUT_KEY)).toEqual({ sceneName: config.sceneName, sourceName: config.sourceName });

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await expect(service.startVirtualCamera()).resolves.toMatchObject({ virtualCameraActive: true });
      expect(mock.currentProgramScene).toBe(config.sceneName);
      await expect(service.stopVirtualCamera()).resolves.toMatchObject({ virtualCameraActive: false, virtualCameraOwned: false });
      expect(mock.currentProgramScene).toBe('Existing User Scene');
    }
    await expect(service.ensureOutput('http://127.0.0.1:54321/')).resolves.toMatchObject({ createdScene: false, createdSource: false, audioRouted: true });
    await expect(service.disconnect()).resolves.toMatchObject({ connected: false, virtualCameraActive: false, browserSourceReady: false, audioRouted: false });
  });

  it('does not adopt a colliding source name without an ownership record', async () => {
    const { database } = fakeDatabase();
    const mock = new MockObsAdapter();
    mock.scenes.add(config.sceneName);
    mock.sources.add(config.sourceName);
    const service = new ObsService(database, { mock, 'obs-websocket': new MockObsAdapter() });
    await service.testConnection(config);
    await expect(service.ensureOutput('http://127.0.0.1:54321/')).rejects.toThrow('OBS_SCENE_NAME_CONFLICT');
  });

  it('never stops a virtual camera that was already active before connection', async () => {
    const mock = new MockObsAdapter();
    mock.virtualCameraActive = true;
    const service = new ObsService(undefined, { mock, 'obs-websocket': new MockObsAdapter() });
    await service.testConnection(config);
    await service.ensureOutput('http://127.0.0.1:54321/');
    await expect(service.startVirtualCamera()).rejects.toThrow('OBS_VIRTUAL_CAMERA_ALREADY_ACTIVE');
    expect(service.getStatus()).toMatchObject({ connected: true, virtualCameraActive: true, virtualCameraOwned: false });
    await service.disconnect();
    expect(mock.virtualCameraActive).toBe(true);
  });

  it('keeps Browser Source available when the OBS virtual camera driver is missing', async () => {
    class BrowserOnlyObsAdapter extends MockObsAdapter {
      override async getVirtualCameraActive(): Promise<boolean> {
        throw new Error('VirtualCam is not available.');
      }
    }
    const adapter = new BrowserOnlyObsAdapter();
    const service = new ObsService(undefined, { mock: adapter, 'obs-websocket': adapter });

    const result = await service.testConnection(config);

    expect(result).toMatchObject({ ok: true });
    expect(result.message).toContain('chưa có virtual camera');
    expect(service.getStatus()).toMatchObject({ connected: true, virtualCameraAvailable: false });
    await service.ensureOutput('http://127.0.0.1:54321/');
    await expect(service.startVirtualCamera()).rejects.toThrow('OBS_VIRTUAL_CAMERA_UNAVAILABLE');
    expect(service.getStatus()).toMatchObject({ connected: true, browserSourceReady: true, audioRouted: true });
  });

  it('waits for OBS to report virtual-camera state transitions before updating ownership', async () => {
    class DelayedVirtualCameraAdapter extends MockObsAdapter {
      private pendingState: boolean | null = null;
      override async startVirtualCamera(): Promise<void> { this.pendingState = true; }
      override async stopVirtualCamera(): Promise<void> { this.pendingState = false; }
      override async getVirtualCameraActive(): Promise<boolean> {
        if (this.pendingState !== null) {
          this.virtualCameraActive = this.pendingState;
          this.pendingState = null;
          return !this.virtualCameraActive;
        }
        return this.virtualCameraActive;
      }
    }
    const adapter = new DelayedVirtualCameraAdapter();
    const service = new ObsService(undefined, { mock: adapter, 'obs-websocket': adapter });
    await service.testConnection(config);
    await service.ensureOutput('http://127.0.0.1:54321/');

    await expect(service.startVirtualCamera()).resolves.toMatchObject({ virtualCameraActive: true, virtualCameraOwned: true });
    await expect(service.stopVirtualCamera()).resolves.toMatchObject({ virtualCameraActive: false, virtualCameraOwned: false });
  });

  it('restricts OBS and Browser Source endpoints to loopback', () => {
    expect(() => obsConfigInputSchema.parse({ ...config, host: '192.168.1.50' })).toThrow();
    expect(() => obsEnsureOutputSchema.parse({ runtimeUrl: 'http://127.0.0.1:54321/' })).not.toThrow();
    expect(() => obsEnsureOutputSchema.parse({ runtimeUrl: 'file:///C:/secret.txt' })).toThrow();
    expect(() => obsEnsureOutputSchema.parse({ runtimeUrl: 'http://example.com/' })).toThrow();
  });

  it('speaks authenticated OBS WebSocket v5 and creates only the dedicated output', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const requests: string[] = [];
    let authenticated = false;
    let virtualCameraActive = false;
    let currentProgramScene = 'User Program Scene';
    let sceneExists = false;
    let sourceExists = false;
    const browserSettings: Record<string, unknown>[] = [];
    const password = 'obs-password';
    const salt = 'salt-value';
    const challenge = 'challenge-value';
    const secret = createHash('sha256').update(`${password}${salt}`).digest('base64');
    const expectedAuthentication = createHash('sha256').update(`${secret}${challenge}`).digest('base64');

    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.2', rpcVersion: 1, authentication: { challenge, salt } } }));
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString()) as { op: number; d?: Record<string, unknown> };
        if (message.op === 1) {
          authenticated = (message.d?.authentication === expectedAuthentication);
          socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
          return;
        }
        if (message.op !== 6) return;
        const requestType = String(message.d?.requestType);
        const requestId = String(message.d?.requestId);
        requests.push(requestType);
        const responseData = requestType === 'GetSceneList' ? { scenes: sceneExists ? [{ sceneName: config.sceneName }] : [], currentProgramSceneName: currentProgramScene }
          : requestType === 'GetInputList' ? { inputs: sourceExists ? [{ inputName: config.sourceName }] : [] }
            : requestType === 'GetVirtualCamStatus' ? { outputActive: virtualCameraActive }
              : requestType === 'GetCurrentProgramScene' ? { currentProgramSceneName: currentProgramScene }
              : {};
        if (requestType === 'StartVirtualCam') virtualCameraActive = true;
        if (requestType === 'StopVirtualCam') virtualCameraActive = false;
        if (requestType === 'SetCurrentProgramScene') currentProgramScene = String((message.d?.requestData as { sceneName?: unknown } | undefined)?.sceneName);
        if (requestType === 'CreateScene') sceneExists = true;
        if (requestType === 'CreateInput') sourceExists = true;
        if (requestType === 'CreateInput' || requestType === 'SetInputSettings') browserSettings.push((message.d?.requestData as { inputSettings?: Record<string, unknown> } | undefined)?.inputSettings ?? {});
        socket.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData } }));
      });
    });

    try {
      const adapter = new RealObsAdapter();
      const port = (server.address() as AddressInfo).port;
      await expect(adapter.connect({ ...config, kind: 'obs-websocket', port, password })).resolves.toBe('5.5.2');
      expect(authenticated).toBe(true);
      const output = { sceneName: config.sceneName, sourceName: config.sourceName, runtimeUrl: 'http://127.0.0.1:54321/', width: 1080, height: 1920, fps: 30, allowExisting: false };
      await expect(adapter.ensureOutput(output)).resolves.toEqual({ createdScene: true, createdSource: true, audioRouted: true });
      await expect(adapter.ensureOutput({ ...output, allowExisting: true })).resolves.toEqual({ createdScene: false, createdSource: false, audioRouted: true });
      expect(browserSettings).toEqual([expect.objectContaining({ reroute_audio: true }), expect.objectContaining({ reroute_audio: true })]);
      await expect(adapter.getCurrentProgramScene()).resolves.toBe('User Program Scene');
      await adapter.setCurrentProgramScene(config.sceneName);
      await expect(adapter.getCurrentProgramScene()).resolves.toBe(config.sceneName);
      await adapter.startVirtualCamera();
      await expect(adapter.getVirtualCameraActive()).resolves.toBe(true);
      await adapter.stopVirtualCamera();
      await expect(adapter.getVirtualCameraActive()).resolves.toBe(false);
      expect(requests).toEqual(['GetSceneList', 'GetInputList', 'CreateScene', 'CreateInput', 'GetSceneList', 'GetInputList', 'SetInputSettings', 'GetSceneItemId', 'PressInputPropertiesButton', 'GetSceneList', 'SetCurrentProgramScene', 'GetSceneList', 'StartVirtualCam', 'GetVirtualCamStatus', 'StopVirtualCam', 'GetVirtualCamStatus']);
      await adapter.disconnect();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
