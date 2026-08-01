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

  await editorPage.getByRole('button', { name: 'Hình nền', exact: true }).click();
  await editorPage.locator('.asset-browser').getByRole('button', { name: /Beauty/ }).click();
  const backgroundId = await editorPage.locator('.source-panel li').filter({ hasText: 'Hình nền Beauty studio' }).last().getAttribute('data-layer-id');
  await editorPage.getByRole('button', { name: 'Avatar', exact: true }).click();
  await editorPage.locator('.asset-browser').getByRole('button', { name: 'Cặp avatar idle / talking' }).click();
  const idleId = await editorPage.locator('.source-panel li').filter({ hasText: 'Avatar idle' }).last().getAttribute('data-layer-id');
  const talkingId = await editorPage.locator('.source-panel li').filter({ hasText: 'Avatar talking' }).last().getAttribute('data-layer-id');
  await editorPage.getByRole('button', { name: 'Video', exact: true }).click();
  await editorPage.locator('.asset-browser').getByRole('button', { name: /Flower GIF/ }).click();
  const gifId = await editorPage.locator('.source-panel li').filter({ hasText: 'GIF hoa' }).getAttribute('data-layer-id');
  await editorPage.getByRole('button', { name: 'Văn bản', exact: true }).click();
  await editorPage.locator('.asset-browser').getByRole('button', { name: 'Thêm văn bản', exact: true }).click();
  const textId = await editorPage.locator('.source-panel li').filter({ hasText: 'Văn bản' }).last().getAttribute('data-layer-id');
  if (!backgroundId || !idleId || !talkingId || !gifId || !textId) throw new Error('Controlled scene layer IDs were not created.');

  const initialText = 'SCENE RUNTIME';
  await editorPage.getByLabel('Nội dung văn bản').fill(initialText);
  await editorPage.waitForTimeout(500);
  const runtimeStatus = await editorPage.evaluate(() => globalThis.window.desktopApi.sceneRuntime.getStatus());
  if (!runtimeStatus.running || !runtimeStatus.url || runtimeStatus.host !== '127.0.0.1') {
    throw new Error(`Runtime did not start on loopback: ${JSON.stringify(runtimeStatus)}`);
  }
  const runtimeLink = editorPage.getByRole('button', { name: 'Sao chép URL Browser Source' });
  await runtimeLink.waitFor({ state: 'visible' });
  if (await runtimeLink.getAttribute('title') !== runtimeStatus.url) throw new Error('Browser Source control did not expose the active loopback URL.');

  const runtimePage = context.pages().find((candidate) => candidate.url().startsWith(runtimeStatus.url));
  if (!runtimePage) throw new Error('Dedicated scene runtime smoke window was not found.');
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
  await editorPage.getByLabel('Nội dung văn bản').fill(changedText);
  await runtimePage.locator(`[data-layer-id="${textId}"]`).filter({ hasText: changedText }).waitFor({ state: 'visible', timeout: 2_000 });
  const propagationMs = Date.now() - startedAt;
  if (propagationMs >= 200) throw new Error(`Editor-to-runtime propagation took ${propagationMs}ms.`);

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

  const comparisonScene = {
    ...scene,
    layers: scene.layers.filter((layer) => ![gifId, textId].includes(layer.id)),
  };
  await editorPage.evaluate(async (runtimeScene) => {
    await globalThis.window.desktopApi.sceneRuntime.publish(runtimeScene, 'idle');
  }, comparisonScene);
  await runtimePage.waitForFunction(({ idleId: runtimeIdleId, talkingId: runtimeTalkingId }) => {
    const idle = globalThis.document.querySelector(`[data-layer-id="${runtimeIdleId}"]`);
    const talking = globalThis.document.querySelector(`[data-layer-id="${runtimeTalkingId}"]`);
    return idle && talking && globalThis.getComputedStyle(idle).opacity === '1' && globalThis.getComputedStyle(talking).opacity === '0';
  }, { idleId, talkingId });
  await editorPage.addStyleTag({ content: `.scene-layer-toolbar, .scene-selection, .scene-snap-guide, [data-runtime-layer-id="${gifId}"], [data-runtime-layer-id="${textId}"] { display: none !important; }` });
  await editorPage.getByRole('button', { name: 'Hiện lưới canvas' }).click().catch(() => undefined);
  const editorScenePath = path.join(artifactDirectory, 'editor-scene.png');
  const runtimeRawPath = path.join(artifactDirectory, 'browser-scene-raw.png');
  const runtimeScenePath = path.join(artifactDirectory, 'browser-scene.png');
  await editorPage.locator('.scene-poster').screenshot({ path: editorScenePath });
  await runtimePage.locator('#scene').screenshot({ path: runtimeRawPath, omitBackground: true });
  const editorCapture = PNG.sync.read(fs.readFileSync(editorScenePath));
  const runtimeCapture = PNG.sync.read(fs.readFileSync(runtimeRawPath));
  if (editorCapture.width !== runtimeCapture.width || runtimeCapture.height < editorCapture.height || runtimeCapture.height - editorCapture.height > 4) {
    throw new Error(`Editor/runtime capture geometry diverged: ${editorCapture.width}x${editorCapture.height} vs ${runtimeCapture.width}x${runtimeCapture.height}`);
  }
  const normalizedRuntime = new PNG({ width: editorCapture.width, height: editorCapture.height });
  PNG.bitblt(runtimeCapture, normalizedRuntime, 0, 0, editorCapture.width, editorCapture.height, 0, 0);
  fs.writeFileSync(runtimeScenePath, PNG.sync.write(normalizedRuntime));
  const visualDiff = new PNG({ width: editorCapture.width, height: editorCapture.height });
  const differentPixels = pixelmatch(editorCapture.data, normalizedRuntime.data, visualDiff.data, editorCapture.width, editorCapture.height, { threshold: 0.1 });
  const visualDifferenceRatio = differentPixels / (editorCapture.width * editorCapture.height);
  fs.writeFileSync(path.join(artifactDirectory, 'editor-browser-diff.png'), PNG.sync.write(visualDiff));
  if (visualDifferenceRatio >= 0.03) throw new Error(`Editor/runtime visual difference was ${(visualDifferenceRatio * 100).toFixed(2)}%.`);
  await editorPage.evaluate(async (runtimeScene) => {
    await globalThis.window.desktopApi.sceneRuntime.publish(runtimeScene, 'talking');
  }, scene);
  await runtimePage.waitForFunction(({ idleId: runtimeIdleId, talkingId: runtimeTalkingId }) => {
    const idle = globalThis.document.querySelector(`[data-layer-id="${runtimeIdleId}"]`);
    const talking = globalThis.document.querySelector(`[data-layer-id="${runtimeTalkingId}"]`);
    return idle && talking && globalThis.getComputedStyle(idle).opacity === '0' && globalThis.getComputedStyle(talking).opacity === '1';
  }, { idleId, talkingId });
  await runtimePage.reload();
  await runtimePage.locator(`[data-layer-id="${textId}"]`).filter({ hasText: changedText }).waitFor({ state: 'visible' });
  const reconnectState = await runtimePage.evaluate(({ idleId: runtimeIdleId, talkingId: runtimeTalkingId, expectedLayers }) => ({
    layerCount: globalThis.document.querySelectorAll('[data-layer-id]').length,
    idleOpacity: globalThis.getComputedStyle(globalThis.document.querySelector(`[data-layer-id="${runtimeIdleId}"]`)).opacity,
    talkingOpacity: globalThis.getComputedStyle(globalThis.document.querySelector(`[data-layer-id="${runtimeTalkingId}"]`)).opacity,
    expectedLayers,
  }), { idleId, talkingId, expectedLayers: scene.layers.filter((layer) => layer.source.type !== 'none').length });
  if (reconnectState.layerCount !== reconnectState.expectedLayers || reconnectState.idleOpacity !== '0' || reconnectState.talkingOpacity !== '1') {
    throw new Error(`Reconnect did not restore full state: ${JSON.stringify(reconnectState)}`);
  }

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
