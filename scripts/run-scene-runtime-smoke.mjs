/* global HTMLAudioElement, HTMLVideoElement */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-scene-runtime-'));
const artifactDirectory = path.resolve('artifacts/rebuild/scene-runtime');
fs.mkdirSync(artifactDirectory, { recursive: true });
const port = 9253;
const videoFixturePath = path.resolve('src/assets/mock/flower.mp4');
const audioFixturePath = process.env.AI_LIVESTREAM_AUDIO_SMOKE_FILE ?? videoFixturePath;
if (!fs.existsSync(audioFixturePath)) throw new Error(`Audio smoke fixture was not found: ${audioFixturePath}`);

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) return;
    } catch {
      // Electron is still starting.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error('Scene runtime smoke CDP endpoint did not start.');
}

async function waitForRuntimePage(context, runtimeUrl) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const page = context.pages().find((candidate) => candidate.url().startsWith(runtimeUrl));
    if (page) return page;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
  }
  throw new Error('Dedicated scene runtime smoke window was not found.');
}

const child = spawn(electronPath, ['.', '--ui-capture', '--scene-runtime-smoke', `--remote-debugging-port=${port}`], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory,
    AI_LIVESTREAM_CAPTURE_VIEWPORT: '1240x669',
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk.toString(); });
let browser;

try {
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const editorPage = context?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
  if (!context || !editorPage) throw new Error('Scene runtime smoke editor was not found.');
  editorPage.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Electron Security Warning')) return;
    if (['error', 'warning'].includes(message.type())) output += `\neditor ${message.type()}: ${message.text()}`;
  });
  editorPage.on('pageerror', (error) => { output += `\neditor pageerror: ${error.message}`; });
  await editorPage.waitForLoadState('domcontentloaded');
  await editorPage.evaluate(() => { globalThis.location.hash = '/projects/perfume'; });
  await editorPage.locator('.studio-page').waitFor({ state: 'visible' });
  // The Studio now imports user-selected media, so seed deterministic built-in assets through
  // the typed project boundary instead of relying on the removed asset-browser UI.
  await editorPage.evaluate(async ({ videoPath, audioPath }) => {
    const project = await globalThis.window.desktopApi.projects.get('perfume');
    if (!project) throw new Error('Scene runtime smoke project was not found.');
    const layer = (id, name, kind, assetId, avatarState = 'none') => ({
      id, name, kind,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      visible: true, locked: false, opacity: 1, fitMode: 'cover', loop: true, muted: true, volume: 1, avatarState,
      chromaKey: { enabled: false, color: '#00ff00', tolerance: 32 },
      source: { type: kind === 'text' ? 'text' : 'builtin', assetId, mediaReferenceId: null },
    });
    project.scene.layers = [
      layer('runtime-background', 'Beauty studio', 'image', 'beauty-studio'),
      layer('runtime-gif', 'GIF hoa', 'gif', 'flower-gif'),
      layer('runtime-idle', 'Avatar idle', 'avatar', 'template-host', 'idle'),
      layer('runtime-talking', 'Avatar talking', 'avatar', 'beauty-model', 'talking'),
      layer('runtime-text', 'SCENE RUNTIME', 'text', null),
      { ...layer('runtime-video-audio', 'Video with embedded audio', 'video', null), source: { type: 'media', assetId: null, mediaReferenceId: 'runtime-uploaded-video' }, muted: false, volume: 0.7 },
      { ...layer('runtime-uploaded-audio', 'Uploaded audio track', 'audio', null), source: { type: 'media', assetId: null, mediaReferenceId: 'runtime-uploaded-audio-file' }, muted: false, volume: 0.6 },
    ];
    project.scene.mediaReferences = [
      { id: 'runtime-uploaded-video', label: 'Uploaded video with AAC', kind: 'video', path: videoPath },
      { id: 'runtime-uploaded-audio-file', label: 'Uploaded audio', kind: 'audio', path: audioPath },
    ];
    const saved = await globalThis.window.desktopApi.projects.saveScene(project.id, project.scene);
    await globalThis.window.desktopApi.sceneRuntime.publish(saved.scene, 'idle');
  }, { videoPath: videoFixturePath, audioPath: audioFixturePath });
  await editorPage.evaluate(() => { globalThis.location.hash = '/'; });
  await editorPage.locator('.projects-page').waitFor({ state: 'visible' });
  await editorPage.evaluate(() => { globalThis.location.hash = '/projects/perfume'; });
  await editorPage.locator('.studio-page').waitFor({ state: 'visible' });
  const backgroundId = 'runtime-background';
  const gifId = 'runtime-gif';
  const idleId = 'runtime-idle';
  const talkingId = 'runtime-talking';
  const textId = 'runtime-text';
  const videoAudioId = 'runtime-video-audio';
  const uploadedAudioId = 'runtime-uploaded-audio';

  await editorPage.waitForTimeout(500);
  const runtimeStatus = await editorPage.evaluate(() => globalThis.window.desktopApi.sceneRuntime.getStatus());
  if (!runtimeStatus.running || !runtimeStatus.url || runtimeStatus.host !== '127.0.0.1') {
    throw new Error(`Runtime did not start on loopback: ${JSON.stringify(runtimeStatus)}`);
  }
  const runtimePage = await waitForRuntimePage(context, runtimeStatus.url);
  runtimePage.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Electron Security Warning')) return;
    if (['error', 'warning'].includes(message.type())) output += `\nruntime ${message.type()}: ${message.text()}`;
  });
  runtimePage.on('pageerror', (error) => { output += `\nruntime pageerror: ${error.message}`; });
  await runtimePage.locator(`[data-layer-id="${backgroundId}"]`).waitFor({ state: 'attached' });
  await runtimePage.locator(`[data-layer-id="${gifId}"] img`).waitFor({ state: 'attached' });
  await runtimePage.locator(`[data-layer-id="${idleId}"]`).waitFor({ state: 'attached' });
  await runtimePage.locator(`[data-layer-id="${talkingId}"]`).waitFor({ state: 'attached' });
  await runtimePage.locator(`[data-layer-id="${textId}"]`).waitFor({ state: 'attached' });

  await runtimePage.evaluate(({ gifId: runtimeGifId, idleId: runtimeIdleId, talkingId: runtimeTalkingId }) => {
    globalThis.__runtimeNodes = {
      gifRoot: globalThis.document.querySelector(`[data-layer-id="${runtimeGifId}"]`),
      gifMedia: globalThis.document.querySelector(`[data-layer-id="${runtimeGifId}"] img`),
      idle: globalThis.document.querySelector(`[data-layer-id="${runtimeIdleId}"]`),
      talking: globalThis.document.querySelector(`[data-layer-id="${runtimeTalkingId}"]`),
    };
  }, { gifId, idleId, talkingId });

  const changedText = 'PATCH UNDER 200MS';
  const startedAt = Date.now();
  await editorPage.evaluate(async (nextText) => {
    const project = await globalThis.window.desktopApi.projects.get('perfume');
    if (!project) throw new Error('Smoke project disappeared.');
    project.scene.layers = project.scene.layers.map((layer) => layer.id === 'runtime-text' ? { ...layer, name: nextText } : layer);
    project.scene.textStyle = { ...project.scene.textStyle, content: nextText };
    const saved = await globalThis.window.desktopApi.projects.saveScene(project.id, project.scene);
    await globalThis.window.desktopApi.sceneRuntime.publish(saved.scene, 'idle');
  }, changedText);
  await runtimePage.locator(`[data-layer-id="${textId}"]`).filter({ hasText: changedText }).waitFor({ state: 'visible', timeout: 2_000 });
  const propagationMs = Date.now() - startedAt;
  if (propagationMs >= 500) throw new Error(`Editor-to-runtime propagation took ${propagationMs}ms.`);

  const scene = await editorPage.evaluate(async () => {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 450));
    const project = await globalThis.window.desktopApi.projects.get('perfume');
    if (!project) throw new Error('Smoke project disappeared.');
    await globalThis.window.desktopApi.sceneRuntime.publish(project.scene, 'talking');
    return project.scene;
  });
  await runtimePage.waitForFunction(({ idleId: runtimeIdleId, talkingId: runtimeTalkingId }) => {
    const idle = globalThis.document.querySelector(`[data-layer-id="${runtimeIdleId}"]`);
    const talking = globalThis.document.querySelector(`[data-layer-id="${runtimeTalkingId}"]`);
    return idle && talking && globalThis.getComputedStyle(idle).opacity === '0' && globalThis.getComputedStyle(talking).opacity === '1';
  }, { idleId, talkingId });
  const stability = await runtimePage.evaluate(({ gifId: runtimeGifId, idleId: runtimeIdleId, talkingId: runtimeTalkingId }) => ({
    gifRoot: globalThis.document.querySelector(`[data-layer-id="${runtimeGifId}"]`) === globalThis.__runtimeNodes?.gifRoot,
    gifMedia: globalThis.document.querySelector(`[data-layer-id="${runtimeGifId}"] img`) === globalThis.__runtimeNodes?.gifMedia,
    idle: globalThis.document.querySelector(`[data-layer-id="${runtimeIdleId}"]`) === globalThis.__runtimeNodes?.idle,
    talking: globalThis.document.querySelector(`[data-layer-id="${runtimeTalkingId}"]`) === globalThis.__runtimeNodes?.talking,
  }), { gifId, idleId, talkingId });
  if (Object.values(stability).some((stable) => !stable)) throw new Error(`Small patches replaced media nodes: ${JSON.stringify(stability)}`);

  // First exercise an imported audio track with video, then make it the
  // primary audio Timeline source.
  await editorPage.evaluate(async ({ runtimeScene, videoId, audioId }) => {
    await globalThis.window.desktopApi.sceneRuntime.publish(runtimeScene, 'idle', {
      mode: 'playing', activeScriptId: 'audio-smoke', activeLayerId: videoId, pendingLayerId: null,
      activeAudioLayerId: audioId, pendingAudioLayerId: null, activeAvatarLayerId: null,
      activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, managedLayerIds: [videoId, audioId],
      playbackRevision: 1, resumeActiveMedia: false, activePaused: false, activeMuted: false,
      activeVolume: 0.7, activeLoop: false, activeAudioMuted: false, activeAudioVolume: 0.6,
    });
  }, { runtimeScene: scene, videoId: videoAudioId, audioId: uploadedAudioId });
  await runtimePage.waitForTimeout(1_000);
  const audioPlaybackState = await runtimePage.evaluate(({ videoId, audioId }) => {
    const video = globalThis.document.querySelector(`[data-layer-id="${videoId}"] video`);
    const audio = globalThis.document.querySelector(`[data-layer-id="${audioId}"] audio`);
    const state = (media) => media instanceof HTMLVideoElement || media instanceof HTMLAudioElement ? ({
      exists: true, muted: media.muted, volume: media.volume, paused: media.paused,
      readyState: media.readyState, networkState: media.networkState, currentTime: media.currentTime,
      error: media.error?.message ?? media.error?.code ?? null,
    }) : { exists: false };
    return { video: state(video), audio: state(audio) };
  }, { videoId: videoAudioId, audioId: uploadedAudioId });
  const audioPlaybackValid = [audioPlaybackState.video, audioPlaybackState.audio].every((media) => media.exists && !media.muted && !media.paused && media.readyState >= 2 && media.currentTime > 0);
  if (!audioPlaybackValid) throw new Error(`Browser Source audio did not start: ${JSON.stringify(audioPlaybackState)}`);

  await editorPage.evaluate(async ({ runtimeScene, audioId }) => {
    await globalThis.window.desktopApi.sceneRuntime.publish(runtimeScene, 'talking', {
      mode: 'playing', activeScriptId: 'primary-audio-smoke', activeLayerId: audioId, pendingLayerId: null,
      activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null,
      activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, managedLayerIds: [audioId],
      playbackRevision: 2, resumeActiveMedia: false, activePaused: false, activeMuted: false,
      activeVolume: 0.6, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0,
    });
  }, { runtimeScene: scene, audioId: uploadedAudioId });
  await runtimePage.waitForTimeout(500);
  const primaryAudioState = await runtimePage.evaluate((audioId) => {
    const audio = globalThis.document.querySelector(`[data-layer-id="${audioId}"] audio`);
    return audio instanceof HTMLAudioElement ? {
      exists: true, muted: audio.muted, volume: audio.volume, paused: audio.paused,
      readyState: audio.readyState, currentTime: audio.currentTime, error: audio.error?.message ?? audio.error?.code ?? null,
    } : { exists: false };
  }, uploadedAudioId);
  if (!primaryAudioState.exists || primaryAudioState.muted || primaryAudioState.paused || primaryAudioState.readyState < 2 || primaryAudioState.currentTime <= 0) {
    throw new Error(`Primary uploaded audio script did not start: ${JSON.stringify(primaryAudioState)}`);
  }

  const comparisonScene = {
    ...scene,
    layers: scene.layers.filter((layer) => ![gifId, textId, videoAudioId, uploadedAudioId].includes(layer.id)),
  };
  await editorPage.evaluate(async (runtimeScene) => {
    await globalThis.window.desktopApi.sceneRuntime.publish(runtimeScene, 'idle', {
      mode: 'stopped', activeScriptId: null, activeLayerId: null, pendingLayerId: null,
      activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null,
      activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, managedLayerIds: [],
      playbackRevision: 3, resumeActiveMedia: false, activePaused: true, activeMuted: true,
      activeVolume: 0, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0,
    });
  }, comparisonScene);
  await runtimePage.waitForFunction(({ idleId: runtimeIdleId, talkingId: runtimeTalkingId }) => {
    const idle = globalThis.document.querySelector(`[data-layer-id="${runtimeIdleId}"]`);
    const talking = globalThis.document.querySelector(`[data-layer-id="${runtimeTalkingId}"]`);
    return idle && talking && globalThis.getComputedStyle(idle).opacity === '1' && globalThis.getComputedStyle(talking).opacity === '0';
  }, { idleId, talkingId });
  await editorPage.addStyleTag({ content: `.studio-recovery-page .preview-region, .studio-recovery-page .studio-col-center { height: auto !important; max-height: none !important; overflow: visible !important; } .studio-recovery-page .live-frame { width: 338px !important; height: 600px !important; max-width: none !important; max-height: none !important; } .scene-layer-toolbar, .scene-selection, .scene-snap-guide, [data-runtime-layer-id="${gifId}"], [data-runtime-layer-id="${textId}"] { display: none !important; }` });
  await editorPage.getByRole('button', { name: 'Hiá»‡n lÆ°á»›i canvas' }).click().catch(() => undefined);
  const editorScenePath = path.join(artifactDirectory, 'editor-scene.png');
  const runtimeRawPath = path.join(artifactDirectory, 'browser-scene-raw.png');
  const runtimeScenePath = path.join(artifactDirectory, 'browser-scene.png');
  await editorPage.locator('.live-frame').screenshot({ path: editorScenePath });
  await runtimePage.locator('#scene').screenshot({ path: runtimeRawPath, omitBackground: true });
  const editorCapture = PNG.sync.read(fs.readFileSync(editorScenePath));
  const runtimeCapture = PNG.sync.read(fs.readFileSync(runtimeRawPath));
  const scaleX = editorCapture.width / runtimeCapture.width;
  const scaleY = editorCapture.height / runtimeCapture.height;
  if (Math.abs(scaleX - scaleY) > 0.05) {
    throw new Error(`Editor/runtime capture geometry diverged: ${editorCapture.width}x${editorCapture.height} vs ${runtimeCapture.width}x${runtimeCapture.height}`);
  }
  const normalizedRuntime = new PNG({ width: editorCapture.width, height: editorCapture.height });
  for (let y = 0; y < editorCapture.height; y += 1) {
    for (let x = 0; x < editorCapture.width; x += 1) {
      const srcX = Math.min(runtimeCapture.width - 1, Math.floor(x / scaleX));
      const srcY = Math.min(runtimeCapture.height - 1, Math.floor(y / scaleY));
      const srcIdx = (srcY * runtimeCapture.width + srcX) * 4;
      const dstIdx = (y * editorCapture.width + x) * 4;
      normalizedRuntime.data[dstIdx] = runtimeCapture.data[srcIdx];
      normalizedRuntime.data[dstIdx + 1] = runtimeCapture.data[srcIdx + 1];
      normalizedRuntime.data[dstIdx + 2] = runtimeCapture.data[srcIdx + 2];
      normalizedRuntime.data[dstIdx + 3] = runtimeCapture.data[srcIdx + 3];
    }
  }
  fs.writeFileSync(runtimeScenePath, PNG.sync.write(normalizedRuntime));
  const visualDiff = new PNG({ width: editorCapture.width, height: editorCapture.height });
  const differentPixels = pixelmatch(editorCapture.data, normalizedRuntime.data, visualDiff.data, editorCapture.width, editorCapture.height, { threshold: 0.1 });
  const visualDifferenceRatio = differentPixels / (editorCapture.width * editorCapture.height);
  fs.writeFileSync(path.join(artifactDirectory, 'editor-browser-diff.png'), PNG.sync.write(visualDiff));
  if (visualDifferenceRatio >= 0.03) throw new Error(`Editor/runtime visual difference was ${(visualDifferenceRatio * 100).toFixed(2)}%.`);
  const finalStatus = await editorPage.evaluate(() => globalThis.window.desktopApi.sceneRuntime.getStatus());
  if (!finalStatus.lastReadyAt || finalStatus.revision < 2 || !finalStatus.hasScene) throw new Error(`Runtime diagnostics were incomplete: ${JSON.stringify(finalStatus)}`);
  if (/editor (?:error|warning):|editor pageerror:|runtime (?:error|warning):|runtime pageerror:/i.test(output)) {
    throw new Error(`Scene runtime diagnostics were not clean:${output}`);
  }
  console.log(`SCENE_RUNTIME_SMOKE_OK propagation=${propagationMs}ms visualDiff=${(visualDifferenceRatio * 100).toFixed(2)}% url=${runtimeStatus.url}`);
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit'), new Promise((resolve) => globalThis.setTimeout(resolve, 3_000))]);
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 9) console.warn(`Temporary scene-runtime profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
