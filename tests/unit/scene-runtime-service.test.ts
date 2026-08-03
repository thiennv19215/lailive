import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SceneRuntimeService } from '../../electron/services/scene-runtime';
import { createEmptyScene, type ProjectLayerAssetId, type ProjectSceneDocument } from '../../src/shared/contracts/projects';

const assetFiles: Record<ProjectLayerAssetId, string> = {
  'template-host': path.resolve('src/assets/mock/template-host-v2.jpg'),
  'beauty-model': path.resolve('src/assets/mock/beauty-model.jpg'),
  'beauty-studio': path.resolve('src/assets/mock/beauty-studio.jpg'),
  'beauty-cream': path.resolve('src/assets/mock/beauty-cream.jpg'),
  'background-white-clean': path.resolve('src/assets/defaults/background-white-clean.svg'),
  'background-white-warm': path.resolve('src/assets/defaults/background-white-warm.svg'),
  'background-white-studio': path.resolve('src/assets/defaults/background-white-studio.svg'),
  'flower-video': path.resolve('src/assets/mock/flower.mp4'),
  'flower-gif': path.resolve('src/assets/mock/flower.gif'),
  'sticker-freeship': path.resolve('src/assets/defaults/sticker-freeship.svg'),
  'sticker-hot-deal': path.resolve('src/assets/defaults/sticker-hot-deal.svg'),
  'sticker-live-only': path.resolve('src/assets/defaults/sticker-live-only.svg'),
  'sticker-sale-50': path.resolve('src/assets/defaults/sticker-sale-50.svg'),
};
const temporaryDirectories: string[] = [];

function createService(): SceneRuntimeService {
  return new SceneRuntimeService({
    rendererDirectory: path.resolve('scene-runtime'),
    assets: assetFiles,
  });
}

async function readSceneEvent(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('SSE response has no readable body.');
  const decoder = new TextDecoder();
  let buffered = '';
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) throw new Error('SSE stream ended before a scene event arrived.');
      buffered += decoder.decode(result.value, { stream: true });
      for (const block of buffered.split('\n\n')) {
        const data = block.split('\n').find((line) => line.startsWith('data: '));
        if (data) return JSON.parse(data.slice(6)) as Record<string, unknown>;
      }
      buffered = buffered.slice(buffered.lastIndexOf('\n\n') + 2);
    }
  } finally {
    await reader.cancel();
  }
}

describe('SceneRuntimeService', () => {
  let service: SceneRuntimeService | null = null;

  afterEach(async () => {
    await service?.close();
    service = null;
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  it('binds to loopback on an available port and serves health and controlled assets', async () => {
    service = createService();
    const status = await service.start();
    expect(status.running).toBe(true);
    expect(status.host).toBe('127.0.0.1');
    expect(status.port).toBeGreaterThan(0);

    const health = await fetch(`${status.url}health`).then((response) => response.json());
    expect(health).toMatchObject({ running: true, host: '127.0.0.1', hasScene: false });

    const runtimeScript = await fetch(`${status.url}runtime.js`);
    expect(runtimeScript.headers.get('cache-control')).toBe('no-store');

    const mediaManagerScript = await fetch(`${status.url}media-manager.js`);
    expect(mediaManagerScript.status).toBe(200);
    expect(mediaManagerScript.headers.get('cache-control')).toBe('no-store');

    const gif = await fetch(`${status.url}assets/flower-gif`);
    expect(gif.status).toBe(200);
    expect(gif.headers.get('content-type')).toBe('image/gif');
    expect(gif.headers.get('cache-control')).toBe('no-store');
    expect((await gif.arrayBuffer()).byteLength).toBeGreaterThan(100);

    const whiteBackground = await fetch(`${status.url}assets/background-white-clean`);
    expect(whiteBackground.status).toBe(200);
    expect(whiteBackground.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(await whiteBackground.text()).toContain('fill="#ffffff"');

    expect((await fetch(`${status.url}assets/package.json`)).status).toBe(404);
    expect((await fetch(`${status.url}assets/%2e%2e%2fpackage.json`)).status).toBe(404);

    const scene = createEmptyScene();
    scene.mediaReferences = [{ id: 'media-controlled', label: 'Controlled image', kind: 'image', path: assetFiles['beauty-studio'] }];
    service.publish(scene, 'idle');
    const controlledMedia = await fetch(`${status.url}assets/media-controlled`);
    expect(controlledMedia.status).toBe(200);
    expect(controlledMedia.headers.get('content-type')).toBe('image/jpeg');
    expect(controlledMedia.headers.get('cache-control')).toBe('no-store');

    const audioDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-audio-'));
    temporaryDirectories.push(audioDirectory);
    const audioPath = path.join(audioDirectory, 'prepared-reply.mp3');
    fs.writeFileSync(audioPath, Buffer.from([0x49, 0x44, 0x33, 0x04]));
    scene.mediaReferences.push({ id: 'audio-controlled', label: 'Prepared reply', kind: 'audio', path: audioPath });
    service.publish(scene, 'idle');
    const controlledAudio = await fetch(`${status.url}assets/audio-controlled`);
    expect(controlledAudio.status).toBe(200);
    expect(controlledAudio.headers.get('content-type')).toBe('audio/mpeg');
  });

  it('emits patches and gives reconnecting clients a full current snapshot', async () => {
    service = createService();
    const { url } = await service.start();
    if (!url) throw new Error('Runtime URL was not assigned.');

    const firstStream = await fetch(`${url}events?clientId=first-client`);
    const firstEventPromise = readSceneEvent(firstStream);
    const scene = createEmptyScene();
    const published = service.publish(scene, 'idle');
    expect(published).toMatchObject({ kind: 'snapshot', revision: 1, changedKeys: ['scene', 'avatarState', 'presentation', 'tts'] });
    await expect(firstEventPromise).resolves.toMatchObject({ kind: 'snapshot', revision: 1 });

    const changed: ProjectSceneDocument = {
      ...scene,
      textStyle: { ...scene.textStyle, content: 'Runtime patch' },
    };
    const patch = service.publish(changed, 'talking');
    expect(patch.kind).toBe('patch');
    expect(patch.changedKeys).toEqual(expect.arrayContaining(['avatarState', 'scene.textStyle']));

    const reconnectStream = await fetch(`${url}events?clientId=reconnect-client`);
    await expect(readSceneEvent(reconnectStream)).resolves.toMatchObject({
      kind: 'snapshot',
      revision: 2,
      state: { avatarState: 'talking', scene: { textStyle: { content: 'Runtime patch' } } },
    });
  });

  it('tracks readiness, bounds browser logs, and strips unknown log fields', async () => {
    service = createService();
    const { url } = await service.start();
    if (!url) throw new Error('Runtime URL was not assigned.');
    const stream = await fetch(`${url}events?clientId=ready-client`);

    const ready = await fetch(`${url}ready`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'ready-client' }),
    });
    expect(ready.status).toBe(200);

    for (let index = 0; index < 102; index += 1) {
      const response = await fetch(`${url}log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'ready-client', level: 'info', message: ` message-${index} `, secret: 'discard-me' }),
      });
      expect(response.status).toBe(200);
    }

    const status = service.getStatus();
    expect(status.connectedClients).toBe(1);
    expect(status.readyClients).toBe(1);
    expect(status.recentLogs).toHaveLength(100);
    expect(status.recentLogs[0]?.message).toBe('message-2');
    expect(status.recentLogs[status.recentLogs.length - 1]).not.toHaveProperty('secret');
    await stream.body?.cancel();
  });

  it('accepts an ended callback only for the currently active timeline media', async () => {
    service = createService();
    const { url } = await service.start();
    if (!url) throw new Error('Runtime URL was not assigned.');
    const scene = createEmptyScene();
    service.publish(scene, 'idle', {
      mode: 'playing', activeScriptId: 'script-1', activeLayerId: 'video-1', activeAudioLayerId: null, pendingAudioLayerId: null,
      activeAvatarLayerId: null, activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, pendingLayerId: null,
      managedLayerIds: ['video-1'], playbackRevision: 7, resumeActiveMedia: false, activePaused: false,
      activeMuted: false, activeVolume: 1, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0,
    });
    const received: unknown[] = [];
    const unsubscribe = service.subscribePlaybackEnded((event) => received.push(event));
    const stale = await fetch(`${url}playback-ended`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scriptId: 'script-1', layerId: 'video-1', playbackRevision: 6 }) });
    expect(stale.status).toBe(202);
    const current = await fetch(`${url}playback-ended`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scriptId: 'script-1', layerId: 'video-1', playbackRevision: 7 }) });
    expect(current.status).toBe(200);
    expect(received).toEqual([{ scriptId: 'script-1', layerId: 'video-1', playbackRevision: 7 }]);
    unsubscribe();
  });

  it('rejects an ended callback while a successor video is pending', async () => {
    service = createService();
    const { url } = await service.start();
    if (!url) throw new Error('Runtime URL was not assigned.');
    service.publish(createEmptyScene(), 'idle', {
      mode: 'loading', activeScriptId: 'script-2', activeLayerId: 'video-1', pendingLayerId: 'video-2', activeAudioLayerId: null, pendingAudioLayerId: null,
      activeAvatarLayerId: null, activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null,
      managedLayerIds: ['video-1', 'video-2'], playbackRevision: 8, resumeActiveMedia: false, activePaused: true,
      activeMuted: false, activeVolume: 1, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0,
    });
    const received: unknown[] = [];
    const unsubscribe = service.subscribePlaybackEnded((event) => received.push(event));
    const response = await fetch(`${url}playback-ended`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scriptId: 'script-2', layerId: 'video-1', playbackRevision: 8 }) });
    expect(response.status).toBe(202);
    expect(received).toEqual([]);
    unsubscribe();
  });

  it('forwards media events only from a connected browser source at the current revision', async () => {
    service = createService();
    const { url } = await service.start();
    if (!url) throw new Error('Runtime URL was not assigned.');
    const stream = await fetch(`${url}events?clientId=media-client`);
    service.publish(createEmptyScene(), 'idle', {
      mode: 'loading', activeScriptId: 'script-3', activeLayerId: 'video-3', pendingLayerId: null, activeAudioLayerId: null, pendingAudioLayerId: null,
      activeAvatarLayerId: null, activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null,
      managedLayerIds: ['video-3'], playbackRevision: 12, resumeActiveMedia: false, activePaused: true,
      activeMuted: false, activeVolume: 1, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0,
      resumeAtMs: 35_500, preloadLayerId: 'video-4', preloadLayerIds: ['video-5'],
    });
    const received: unknown[] = [];
    const unsubscribe = service.subscribeMediaEvent((event) => received.push(event));
    const stale = await fetch(`${url}media-event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: 'media-client', revision: 11, kind: 'ready', signature: 'video-3' }) });
    expect(stale.status).toBe(202);
    const unknown = await fetch(`${url}media-event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: 'other-client', revision: 12, kind: 'ready', signature: 'video-3' }) });
    expect(unknown.status).toBe(202);
    const current = await fetch(`${url}media-event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: 'media-client', revision: 12, kind: 'seeked', signature: 'video-3', resumeAtMs: 35_500 }) });
    expect(current.status).toBe(200);
    expect(received).toEqual([expect.objectContaining({ clientId: 'media-client', revision: 12, kind: 'seeked', resumeAtMs: 35_500 })]);
    unsubscribe();
    await stream.body?.cancel();
  });

  it('forwards every accepted media lifecycle event without changing its revision or progress', async () => {
    service = createService();
    const { url } = await service.start();
    if (!url) throw new Error('Runtime URL was not assigned.');
    const stream = await fetch(`${url}events?clientId=lifecycle-client`);
    service.publish(createEmptyScene(), 'idle', {
      mode: 'loading', activeScriptId: 'live-state:WELCOME', activeLayerId: 'welcome-video', activeAudioLayerId: 'welcome-audio', pendingAudioLayerId: null,
      activeAvatarLayerId: null, activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, pendingLayerId: null,
      managedLayerIds: ['welcome-video', 'welcome-audio'], playbackRevision: 21, resumeActiveMedia: false, activePaused: true,
      activeMuted: false, activeVolume: 1, activeLoop: false, activeAudioMuted: false, activeAudioVolume: 1,
    });
    const received: unknown[] = [];
    const unsubscribe = service.subscribeMediaEvent((event) => received.push(event));

    const lifecycle = [
      { kind: 'ready', layerId: 'welcome-video', signature: 'welcome-video' },
      { kind: 'progress', layerId: 'welcome-video', signature: 'welcome-video', currentTime: 3.25 },
      { kind: 'ended', layerId: 'welcome-audio', signature: 'welcome-audio', currentTime: 8 },
      { kind: 'error', layerId: 'welcome-audio', signature: 'welcome-audio', currentTime: 3.25, error: 'decode failed' },
    ];
    for (const event of lifecycle) {
      const response = await fetch(`${url}media-event`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'lifecycle-client', revision: 21, ...event }),
      });
      expect(response.status).toBe(200);
    }

    expect(received).toEqual([
      expect.objectContaining({ revision: 21, kind: 'ready', layerId: 'welcome-video', signature: 'welcome-video' }),
      expect.objectContaining({ revision: 21, kind: 'progress', layerId: 'welcome-video', currentTime: 3.25 }),
      expect.objectContaining({ revision: 21, kind: 'ended', layerId: 'welcome-audio', currentTime: 8 }),
      expect.objectContaining({ revision: 21, kind: 'error', layerId: 'welcome-audio', signature: 'welcome-audio', error: 'decode failed' }),
    ]);
    unsubscribe();
    await stream.body?.cancel();
  });

  it('emits internal status transitions without retaining unsubscribed listeners', async () => {
    service = createService();
    const statuses: Array<{ running: boolean; connectedClients: number; readyClients: number; logs: number }> = [];
    const unsubscribe = service.subscribe((status) => statuses.push({ running: status.running, connectedClients: status.connectedClients, readyClients: status.readyClients, logs: status.recentLogs.length }));
    const { url } = await service.start();
    if (!url) throw new Error('Runtime URL was not assigned.');
    const stream = await fetch(`${url}events?clientId=transition-client`);
    await fetch(`${url}ready`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: 'transition-client' }) });
    await fetch(`${url}log`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: 'transition-client', level: 'warn', message: 'fixture warning' }) });
    expect(statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ running: false }),
      expect.objectContaining({ running: true }),
      expect.objectContaining({ connectedClients: 1 }),
      expect.objectContaining({ readyClients: 1 }),
      expect.objectContaining({ logs: 1 }),
    ]));
    unsubscribe();
    const count = statuses.length;
    await stream.body?.cancel();
    expect(statuses).toHaveLength(count);
  });

  it('releases its listener when closed', async () => {
    service = createService();
    const { url } = await service.start();
    if (!url) throw new Error('Runtime URL was not assigned.');
    await service.close();
    service = null;
    await expect(fetch(`${url}health`)).rejects.toThrow();
  });
});
