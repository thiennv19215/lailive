import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-diagnostics-'));
const diagnosticsPath = path.join(profileDirectory, 'diagnostics.json');
const port = 9256;
const injectedSecret = 'sk-diagnostics-secret-12345678';
const injectedPrompt = 'private customer prompt';

fs.writeFileSync(diagnosticsPath, JSON.stringify([{
  id: 'seed-log',
  timestamp: new Date().toISOString(),
  level: 'warn',
  source: 'smoke',
  message: `Seed Bearer ${injectedSecret}`,
  details: {
    authorization: `Bearer ${injectedSecret}`,
    prompt: injectedPrompt,
    safe: 'visible diagnostic detail',
  },
}]), 'utf8');

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
  throw new Error('Diagnostics IPC smoke CDP endpoint did not start.');
}

async function launch() {
  const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { output += chunk.toString(); });
  }
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  const rendererDeadline = Date.now() + 15_000;
  while (!page && Date.now() < rendererDeadline) {
    page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
    if (!page) await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  if (!page) throw new Error(`Diagnostics IPC smoke renderer was not found.${output}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.diagnostics));
  return { child, browser, page, getOutput: () => output };
}

async function quit(instance) {
  await instance.page.evaluate(() => globalThis.window.desktopApi.app.respondToClose({ action: 'quit', remember: false })).catch(() => undefined);
  await Promise.race([
    once(instance.child, 'exit'),
    new Promise((resolve) => globalThis.setTimeout(resolve, 5_000)),
  ]);
  await instance.browser.close().catch(() => undefined);
  if (instance.child.exitCode === null) instance.child.kill();
}

function assertRedacted(serialized, label) {
  if (serialized.includes(injectedSecret) || serialized.includes(injectedPrompt)) {
    throw new Error(`${label} exposed injected private data.`);
  }
  if (!serialized.includes('[REDACTED_SECRET]') || !serialized.includes('[REDACTED_PRIVATE_TEXT]')) {
    throw new Error(`${label} did not contain expected redaction markers.`);
  }
}

let first;
let second;
try {
  first = await launch();
  const firstResult = await first.page.evaluate(async () => {
    const diagnostics = globalThis.window.desktopApi.diagnostics;
    await globalThis.window.desktopApi.live.disconnect();
    await globalThis.window.desktopApi.obs.startVirtualCamera().catch(() => undefined);
    await globalThis.window.desktopApi.shop.startSchedule().catch(() => undefined);
    const queueWrites = await Promise.all([
      globalThis.window.desktopApi.diagnostics.recordQueueEvent({ kind: 'job-error', stage: 'ai', count: 1 }),
      globalThis.window.desktopApi.diagnostics.recordQueueEvent({ kind: 'job-error', stage: 'ai', count: 2 }),
      globalThis.window.desktopApi.diagnostics.recordQueueEvent({ kind: 'job-error', stage: 'ai', count: 3 }),
    ]);
    return {
      snapshot: await diagnostics.getSnapshot(),
      logs: await diagnostics.listLogs({ limit: 2000 }),
      exported: await diagnostics.exportLogs({ limit: 2000 }),
      queueWrites,
    };
  });
  const components = new Set(firstResult.snapshot.health.map((item) => item.component));
  if (components.size !== 7 || !['database', 'tiktok', 'ai', 'tts', 'scene', 'obs', 'shop'].every((item) => components.has(item))) {
    throw new Error(`Diagnostics health did not include all seven services: ${JSON.stringify(firstResult.snapshot.health)}`);
  }
  if (!firstResult.logs.some((entry) => entry.source === 'app' && entry.message === 'Application services initialized.')) {
    throw new Error(`Diagnostics startup log is missing: ${JSON.stringify(firstResult.logs)}`);
  }
  if (!firstResult.logs.some((entry) => entry.source === 'tiktok' && entry.message === 'TikTok Live disconnect completed.')) {
    throw new Error(`TikTok lifecycle log is missing: ${JSON.stringify(firstResult.logs)}`);
  }
  if (!firstResult.logs.some((entry) => entry.source === 'obs' && entry.level === 'error' && entry.details?.code)) {
    throw new Error(`OBS failure lifecycle log is missing: ${JSON.stringify(firstResult.logs)}`);
  }
  if (!firstResult.logs.some((entry) => entry.source === 'shop' && entry.level === 'error' && entry.details?.code === 'SHOP_NOT_READY')) {
    throw new Error(`Shop failure lifecycle log is missing: ${JSON.stringify(firstResult.logs)}`);
  }
  if (JSON.stringify(firstResult.queueWrites) !== JSON.stringify([true, false, false])) {
    throw new Error(`Queue lifecycle throttling failed: ${JSON.stringify(firstResult.queueWrites)}`);
  }
  if (firstResult.logs.filter((entry) => entry.source === 'queue' && entry.message === 'Interaction queue job failed.').length !== 1) {
    throw new Error(`Queue lifecycle log was not safely throttled: ${JSON.stringify(firstResult.logs)}`);
  }
  assertRedacted(JSON.stringify(firstResult.logs), 'Diagnostics IPC list');
  assertRedacted(firstResult.exported, 'Diagnostics IPC export');
  if (/renderer (?:error|warning):|renderer pageerror:/i.test(first.getOutput())) {
    throw new Error(`Diagnostics IPC renderer output was not clean:${first.getOutput()}`);
  }
  await quit(first);
  first = null;

  assertRedacted(fs.readFileSync(diagnosticsPath, 'utf8'), 'Persisted diagnostics file');

  second = await launch();
  const restored = await second.page.evaluate(async () => {
    const diagnostics = globalThis.window.desktopApi.diagnostics;
    const beforeClear = await diagnostics.listLogs({ limit: 2000 });
    const cleared = await diagnostics.clearLogs();
    const afterClear = await diagnostics.listLogs({ limit: 2000 });
    return { beforeClear, cleared, afterClear };
  });
  assertRedacted(JSON.stringify(restored.beforeClear), 'Restored diagnostics logs');
  if (restored.cleared < 3 || restored.afterClear.length !== 0) {
    throw new Error(`Diagnostics clear did not remove the persisted log set: ${JSON.stringify(restored)}`);
  }
  console.log(`DIAGNOSTICS_IPC_SMOKE_OK health=7 redaction=pass restart=pass clear=${restored.cleared}`);
} catch (error) {
  if (first?.getOutput()) console.error(first.getOutput());
  if (second?.getOutput()) console.error(second.getOutput());
  throw error;
} finally {
  if (first) await quit(first);
  if (second) await quit(second);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 9) console.warn(`Temporary Diagnostics IPC profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
