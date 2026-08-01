import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const durationMinutes = readNumber('AI_LIVESTREAM_SOAK_MINUTES', 480, 0.05, 1440);
const intervalMs = readNumber('AI_LIVESTREAM_SOAK_INTERVAL_MS', 5_000, 250, 60_000);
const faultEvery = Math.round(readNumber('AI_LIVESTREAM_SOAK_FAULT_EVERY', 12, 1, 10_000));
const cdpPort = Math.round(readNumber('AI_LIVESTREAM_SOAK_CDP_PORT', 9270, 1024, 65_535));
const maximumHeapGrowthBytes = readNumber('AI_LIVESTREAM_SOAK_MAX_HEAP_GROWTH_MB', 192, 16, 2048) * 1024 * 1024;
const maximumNodeGrowth = Math.round(readNumber('AI_LIVESTREAM_SOAK_MAX_NODE_GROWTH', 10_000, 100, 1_000_000));
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-long-session-soak-'));
const deadline = Date.now() + durationMinutes * 60_000;

function readNumber(name, fallback, minimum, maximum) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

async function readPageResources(session) {
  const response = await session.send('Performance.getMetrics');
  const metrics = Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]));
  return {
    documents: metrics.Documents ?? 0,
    heapBytes: metrics.JSHeapUsedSize ?? 0,
    nodes: metrics.Nodes ?? 0,
  };
}

function assertResourceGrowth(label, baseline, current) {
  if (current.heapBytes - baseline.heapBytes > maximumHeapGrowthBytes) {
    throw new Error(`${label} heap growth exceeded the configured bound: ${JSON.stringify({ baseline, current })}`);
  }
  if (current.nodes - baseline.nodes > maximumNodeGrowth) {
    throw new Error(`${label} DOM node growth exceeded the configured bound: ${JSON.stringify({ baseline, current })}`);
  }
}

async function waitForCdp() {
  const startupDeadline = Date.now() + 20_000;
  while (Date.now() < startupDeadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).ok) return;
    } catch {
      // Electron is still starting.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error(`Long-session soak CDP endpoint ${cdpPort} did not start.`);
}

async function terminateProcessTree(pid) {
  if (!pid) return;
  if (process.platform !== 'win32') {
    process.kill(pid, 'SIGKILL');
    return;
  }
  await new Promise((resolve, reject) => {
    const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    killer.once('error', reject);
    killer.once('exit', (code) => code === 0 || code === 128 ? resolve() : reject(new Error(`taskkill exited with code ${code ?? 'unknown'}`)));
  });
}

const child = spawn(electronPath, ['.', '--ui-capture', '--scene-runtime-smoke', `--remote-debugging-port=${cdpPort}`], {
  cwd: process.cwd(),
  env: { ...process.env, AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory, VITE_DEV_SERVER_URL: devServerUrl },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk.toString(); });

let browser;
let page;
let runtimePage;
let rendererSession;
let runtimeSession;
let graceful = false;
let iterations = 0;
let faultCycles = 0;
let peakLogs = 0;
let rendererBaseline;
let runtimeBaseline;
let rendererPeakHeapBytes = 0;
let runtimePeakHeapBytes = 0;
let rendererPeakNodes = 0;
let runtimePeakNodes = 0;

try {
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const rendererDeadline = Date.now() + 20_000;
  while (!page && Date.now() < rendererDeadline) {
    page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
    if (!page) await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  if (!page) throw new Error('Long-session soak renderer was not found.');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.diagnostics));

  const initial = await page.evaluate(async () => {
    const api = globalThis.window.desktopApi;
    const project = (await api.projects.list())[0];
    if (!project) throw new Error('LONG_SOAK_PROJECT_MISSING');
    await api.live.connect({ projectId: project.id, mode: 'mock', username: 'long_soak_fixture' });
    await api.ai.setConfig({ kind: 'mock', baseUrl: 'http://127.0.0.1:11434', model: 'mock-livestream-v1' });
    await api.tts.setConfig({ kind: 'mock', endpoint: '', voices: ['Ngoc Lam'] });
    const sceneStatus = await api.sceneRuntime.getStatus();
    if (!sceneStatus.url) throw new Error('LONG_SOAK_SCENE_URL_MISSING');
    await api.sceneRuntime.publish(project.scene, 'idle');
    const obsConfig = { kind: 'mock', host: '127.0.0.1', port: 4455, sceneName: 'AI Livestream', sourceName: 'AI Livestream Browser', width: 1080, height: 1920, fps: 30 };
    await api.obs.setConfig(obsConfig);
    await api.obs.testConnection(obsConfig);
    await api.obs.ensureOutput(sceneStatus.url);
    await api.shop.setConfig({ kind: 'mock', executablePath: '', dashboardUrl: 'https://seller-vn.tiktok.com/compass/live/product' });
    const shop = await api.shop.open();
    if (!shop.snapshot.products[0]) throw new Error('LONG_SOAK_SHOP_PRODUCT_MISSING');
    return { project, sceneUrl: sceneStatus.url, productId: shop.snapshot.products[0].remoteId };
  });

  const runtimeDeadline = Date.now() + 15_000;
  while (!runtimePage && Date.now() < runtimeDeadline) {
    runtimePage = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(initial.sceneUrl));
    if (!runtimePage) await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  if (!runtimePage) throw new Error('Long-session scene runtime window was not found.');
  await runtimePage.waitForLoadState('domcontentloaded');
  rendererSession = await page.context().newCDPSession(page);
  runtimeSession = await runtimePage.context().newCDPSession(runtimePage);
  await rendererSession.send('Performance.enable');
  await runtimeSession.send('Performance.enable');
  rendererBaseline = await readPageResources(rendererSession);
  runtimeBaseline = await readPageResources(runtimeSession);
  rendererPeakHeapBytes = rendererBaseline.heapBytes;
  runtimePeakHeapBytes = runtimeBaseline.heapBytes;
  rendererPeakNodes = rendererBaseline.nodes;
  runtimePeakNodes = runtimeBaseline.nodes;

  while (Date.now() < deadline) {
    iterations += 1;
    const injectFault = iterations % faultEvery === 0;
    const result = await page.evaluate(async ({ project, productId, iteration, shouldInjectFault }) => {
      const api = globalThis.window.desktopApi;
      const avatarState = iteration % 2 === 0 ? 'idle' : 'talking';
      const queueCount = iteration % 101;
      await api.settings.set('smoke.long-session-iteration', iteration);
      await api.ai.generate({ requestId: `long-ai-${iteration}`, systemMessage: 'Safe local soak.', userMessage: `Iteration ${iteration}`, timeoutMs: 5_000, retryCount: 0 });
      await api.tts.synthesize({ requestId: `long-tts-${iteration}`, text: `Local soak ${iteration}`, voice: 'Ngoc Lam', speed: 1, volume: 1, timeoutMs: 5_000 });
      await api.sceneRuntime.publish(project.scene, avatarState);
      await api.diagnostics.recordQueueEvent({ kind: iteration % 5 === 0 ? 'retry' : 'job-cancelled', stage: iteration % 2 === 0 ? 'tts' : 'ai', count: queueCount });

      if (iteration % 4 === 0) await api.shop.pinProduct(productId);
      if (iteration % 6 === 0) {
        await api.obs.startVirtualCamera();
        await api.obs.stopVirtualCamera();
      }
      if (shouldInjectFault) {
        await api.live.disconnect();
        await api.live.connect({ projectId: project.id, mode: 'mock', username: `long_soak_fixture_${iteration}` });
        await api.obs.disconnect();
        const obsConfig = await api.obs.getConfig();
        await api.obs.testConnection(obsConfig);
        const sceneStatus = await api.sceneRuntime.getStatus();
        await api.obs.ensureOutput(sceneStatus.url);
        await api.shop.disconnect();
        await api.shop.open();
      }

      const diagnostics = await api.diagnostics.getSnapshot();
      const logs = await api.diagnostics.listLogs({ limit: 2_000 });
      return { health: diagnostics.health, logCount: logs.length };
    }, { project: initial.project, productId: initial.productId, iteration: iterations, shouldInjectFault: injectFault });

    if (injectFault) faultCycles += 1;
    peakLogs = Math.max(peakLogs, result.logCount);
    if (result.health.length !== 7 || result.logCount > 2_000) throw new Error(`Long-session bounds failed at iteration ${iterations}.`);
    if (result.health.some((item) => item.status === 'error')) throw new Error(`Long-session health error at iteration ${iterations}: ${JSON.stringify(result.health)}`);
    const runtimeState = await runtimePage.evaluate(() => ({ root: Boolean(globalThis.document.querySelector('#scene')), width: globalThis.document.documentElement.scrollWidth }));
    if (!runtimeState.root || runtimeState.width <= 0) throw new Error(`Scene runtime became unavailable at iteration ${iterations}.`);
    if (iterations === 1 || injectFault) {
      const rendererResources = await readPageResources(rendererSession);
      const runtimeResources = await readPageResources(runtimeSession);
      assertResourceGrowth('Renderer', rendererBaseline, rendererResources);
      assertResourceGrowth('Scene runtime', runtimeBaseline, runtimeResources);
      rendererPeakHeapBytes = Math.max(rendererPeakHeapBytes, rendererResources.heapBytes);
      runtimePeakHeapBytes = Math.max(runtimePeakHeapBytes, runtimeResources.heapBytes);
      rendererPeakNodes = Math.max(rendererPeakNodes, rendererResources.nodes);
      runtimePeakNodes = Math.max(runtimePeakNodes, runtimeResources.nodes);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) await new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(intervalMs, remainingMs)));
  }

  const final = await page.evaluate(async () => {
    const api = globalThis.window.desktopApi;
    const marker = await api.settings.get('smoke.long-session-iteration');
    const logs = await api.diagnostics.listLogs({ limit: 2_000 });
    const exported = await api.diagnostics.exportLogs({ limit: 2_000 });
    await api.live.disconnect();
    await api.ai.cancelAll();
    await api.tts.cancelAll();
    await api.obs.stopVirtualCamera().catch(() => undefined);
    await api.obs.disconnect();
    await api.shop.disconnect();
    return { marker, logs: logs.length, exported };
  });
  if (final.marker?.value !== iterations) throw new Error(`Final long-session marker is invalid: ${JSON.stringify(final.marker)}`);
  if (/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+/i.test(final.exported)) throw new Error('Long-session export contains a secret-shaped value.');
  if (/renderer (?:error|warning):|renderer pageerror:/i.test(output)) throw new Error(`Long-session renderer output was not clean:${output}`);
  const rendererFinal = await readPageResources(rendererSession);
  const runtimeFinal = await readPageResources(runtimeSession);
  assertResourceGrowth('Renderer', rendererBaseline, rendererFinal);
  assertResourceGrowth('Scene runtime', runtimeBaseline, runtimeFinal);
  rendererPeakHeapBytes = Math.max(rendererPeakHeapBytes, rendererFinal.heapBytes);
  runtimePeakHeapBytes = Math.max(runtimePeakHeapBytes, runtimeFinal.heapBytes);
  rendererPeakNodes = Math.max(rendererPeakNodes, rendererFinal.nodes);
  runtimePeakNodes = Math.max(runtimePeakNodes, runtimeFinal.nodes);

  const exitPromise = once(child, 'exit');
  await page.evaluate(() => globalThis.window.desktopApi.app.respondToClose({ action: 'quit', remember: false }));
  await Promise.race([exitPromise, new Promise((resolve) => globalThis.setTimeout(resolve, 7_000))]);
  graceful = child.exitCode !== null || child.signalCode !== null;
  if (!graceful) throw new Error('Long-session Electron process did not exit gracefully.');
  if (fs.existsSync(path.join(profileDirectory, 'runtime.lock.json'))) throw new Error('Runtime lock remained after long-session shutdown.');
  console.log(`LONG_SESSION_SOAK_OK minutes=${durationMinutes} iterations=${iterations} faults=${faultCycles} peakLogs=${peakLogs} rendererHeapMb=${(rendererPeakHeapBytes / 1024 / 1024).toFixed(1)} runtimeHeapMb=${(runtimePeakHeapBytes / 1024 / 1024).toFixed(1)} rendererNodes=${rendererPeakNodes} runtimeNodes=${runtimePeakNodes}`);
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  await rendererSession?.detach().catch(() => undefined);
  await runtimeSession?.detach().catch(() => undefined);
  await runtimePage?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (!graceful && child.exitCode === null && child.signalCode === null) await terminateProcessTree(child.pid).catch(() => undefined);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 11) console.warn(`Temporary long-session soak profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
