import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-multiservice-soak-'));
const cycleCount = 6;

async function waitForCdp(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) return;
    } catch {
      // Electron is still starting or the previous crashed process is releasing the port.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error(`Multi-service soak CDP endpoint ${port} did not start.`);
}

async function launch(cycle) {
  const port = 9260 + cycle;
  const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: { ...process.env, AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory, VITE_DEV_SERVER_URL: devServerUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk.toString(); });
  await waitForCdp(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  const rendererDeadline = Date.now() + 15_000;
  while (!page && Date.now() < rendererDeadline) {
    page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
    if (!page) await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  if (!page) throw new Error(`Cycle ${cycle} renderer was not found.`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.diagnostics));
  return { child, browser, page, getOutput: () => output };
}

async function exercise(instance, cycle) {
  return await instance.page.evaluate(async ({ cycleIndex }) => {
    const api = globalThis.window.desktopApi;
    const projects = await api.projects.list();
    const project = projects[0];
    if (!project) throw new Error('SOAK_PROJECT_MISSING');
    await api.settings.set('smoke.multiservice-cycle', cycleIndex);
    await api.live.connect({ projectId: project.id, mode: 'mock', username: `soak_fixture_${cycleIndex}` });
    await api.ai.testConnection({ kind: 'mock', baseUrl: 'http://127.0.0.1:11434', model: 'mock-livestream-v1' });
    await api.tts.testConnection({ kind: 'mock', endpoint: '', voices: ['Ngoc Lam'] });
    const sceneStatus = await api.sceneRuntime.getStatus();
    await api.sceneRuntime.publish(project.scene, 'idle');
    await api.obs.testConnection({ kind: 'mock', host: '127.0.0.1', port: 4455, sceneName: 'AI Livestream', sourceName: 'AI Livestream Browser', width: 1080, height: 1920, fps: 30 });
    if (!sceneStatus.url) throw new Error('SOAK_SCENE_URL_MISSING');
    await api.obs.ensureOutput(sceneStatus.url);
    await api.obs.startVirtualCamera();
    await api.obs.stopVirtualCamera();
    await api.obs.disconnect();
    await api.shop.setConfig({ kind: 'mock', executablePath: '', dashboardUrl: 'https://seller-vn.tiktok.com/compass/live/product' });
    const opened = await api.shop.open();
    const product = opened.snapshot.products[0];
    if (!product) throw new Error('SOAK_SHOP_PRODUCT_MISSING');
    await api.shop.setSchedule([{ id: `soak-slot-${cycleIndex}`, remoteProductId: product.remoteId, localProductId: null, title: 'Soak fixture', durationSeconds: 5, retryCount: 0 }]);
    await api.shop.startSchedule();
    await api.shop.stopSchedule();
    await api.shop.disconnect();
    for (let index = 0; index < 20; index += 1) await api.diagnostics.recordQueueEvent({ kind: 'job-error', stage: 'tts', count: index + 1 });
    await api.live.disconnect();
    const diagnostics = await api.diagnostics.getSnapshot();
    return { health: diagnostics.health.length, recoveryKinds: diagnostics.recoveryNotices.map((notice) => notice.kind), logs: (await api.diagnostics.listLogs({ limit: 2000 })).length };
  }, { cycleIndex: cycle });
}

async function gracefulQuit(instance) {
  const exitPromise = once(instance.child, 'exit');
  await instance.page.evaluate(() => globalThis.window.desktopApi.app.respondToClose({ action: 'quit', remember: false })).catch(() => undefined);
  await Promise.race([exitPromise, new Promise((resolve) => globalThis.setTimeout(resolve, 7_000))]);
  await instance.browser.close().catch(() => undefined);
  if (instance.child.exitCode === null && instance.child.signalCode === null) await terminateProcessTree(instance.child.pid);
}

async function crash(instance) {
  const exitPromise = once(instance.child, 'exit');
  await terminateProcessTree(instance.child.pid);
  await Promise.race([exitPromise, new Promise((resolve) => globalThis.setTimeout(resolve, 7_000))]);
  await instance.browser.close().catch(() => undefined);
  if (instance.child.exitCode === null && instance.child.signalCode === null) throw new Error('Crashed Electron process did not exit.');
}

async function terminateProcessTree(pid) {
  if (!pid) throw new Error('Soak Electron PID is unavailable.');
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

let active = null;
try {
  for (let cycle = 0; cycle < cycleCount; cycle += 1) {
    active = await launch(cycle);
    const result = await exercise(active, cycle);
    if (result.health !== 7 || result.logs > 2000) throw new Error(`Cycle ${cycle} violated diagnostics bounds: ${JSON.stringify(result)}`);
    if ([1, 3, 5].includes(cycle) && !result.recoveryKinds.includes('stale-lock-recovered')) throw new Error(`Cycle ${cycle} did not expose stale-lock recovery UX data: ${JSON.stringify(result)}`);
    if (cycle < cycleCount - 1 && cycle % 2 === 0) await crash(active);
    else await gracefulQuit(active);
    active = null;
  }

  const verification = await launch(cycleCount);
  active = verification;
  const final = await verification.page.evaluate(async () => ({
    marker: await globalThis.window.desktopApi.settings.get('smoke.multiservice-cycle'),
    snapshot: await globalThis.window.desktopApi.diagnostics.getSnapshot(),
    logs: await globalThis.window.desktopApi.diagnostics.listLogs({ limit: 2000 }),
    exported: await globalThis.window.desktopApi.diagnostics.exportLogs({ limit: 2000 }),
  }));
  if (final.marker?.value !== cycleCount - 1) throw new Error(`Final persisted cycle marker is invalid: ${JSON.stringify(final.marker)}`);
  if (final.snapshot.health.length !== 7 || final.logs.length > 2000) throw new Error('Final health/log bounds failed.');
  const staleRecoveries = final.logs.filter((entry) => entry.source === 'resilience' && entry.details?.runtimeLock === 'replaced-stale').length;
  if (staleRecoveries < 3) throw new Error(`Expected at least three stale-lock recoveries, received ${staleRecoveries}.`);
  if (!final.logs.some((entry) => entry.source === 'queue') || !final.logs.some((entry) => entry.source === 'scene') || !final.logs.some((entry) => entry.source === 'shop') || !final.logs.some((entry) => entry.source === 'tiktok')) {
    throw new Error('Multi-service lifecycle logs are incomplete.');
  }
  if (/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+/i.test(final.exported)) throw new Error('Soak export contains a secret-shaped value.');
  if (/renderer (?:error|warning):|renderer pageerror:/i.test(verification.getOutput())) throw new Error(`Soak renderer output was not clean:${verification.getOutput()}`);
  await gracefulQuit(verification);
  active = null;
  if (fs.existsSync(path.join(profileDirectory, 'runtime.lock.json'))) throw new Error('Runtime lock remained after graceful final shutdown.');
  console.log(`MULTISERVICE_RESTART_SOAK_OK cycles=${cycleCount} crashes=3 staleRecoveries=${staleRecoveries} health=7 logs=${final.logs.length}`);
} catch (error) {
  if (active?.getOutput()) console.error(active.getOutput());
  throw error;
} finally {
  if (active) await gracefulQuit(active).catch(() => undefined);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 11) console.warn(`Temporary multi-service soak profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
