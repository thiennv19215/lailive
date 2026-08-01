import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-shop-ipc-'));
const port = 9255;

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
  throw new Error('Shop IPC smoke CDP endpoint did not start.');
}

async function launch() {
  const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: { ...process.env, AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory, VITE_DEV_SERVER_URL: devServerUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk.toString(); });
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
  if (!page) throw new Error('Shop IPC smoke renderer was not found.');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.shop));
  await page.evaluate(() => globalThis.window.desktopApi.app.getInfo());
  await page.waitForTimeout(750);
  return { child, browser, page, getOutput: () => output };
}

async function quit(instance) {
  await instance.page.evaluate(() => globalThis.window.desktopApi.app.respondToClose({ action: 'quit', remember: false })).catch(() => undefined);
  await Promise.race([once(instance.child, 'exit'), new Promise((resolve) => globalThis.setTimeout(resolve, 5_000))]);
  await instance.browser.close().catch(() => undefined);
  if (instance.child.exitCode === null) instance.child.kill();
}

let first;
let second;
try {
  first = await launch();
  const started = await first.page.evaluate(async () => {
    const shop = globalThis.window.desktopApi.shop;
    await shop.setConfig({ kind: 'mock', executablePath: '', dashboardUrl: 'https://seller-vn.tiktok.com/compass/live/product' });
    await shop.open();
    await shop.setMappings([{ remoteProductId: 'mock-serum-m5', localProductId: 'local-serum' }]);
    await shop.setSchedule([
      { id: 'slot-serum', remoteProductId: 'mock-serum-m5', localProductId: 'local-serum', title: 'Serum dưỡng ẩm M5', durationSeconds: 30, retryCount: 1 },
      { id: 'slot-cica', remoteProductId: 'mock-kem-cica', localProductId: null, title: 'Kem phục hồi Cica', durationSeconds: 30, retryCount: 1 },
    ]);
    await shop.startSchedule();
    return shop.getSnapshot();
  });
  if (started.scheduleState !== 'running' || started.currentScheduleItemId !== 'slot-serum') throw new Error(`Shop schedule did not start: ${JSON.stringify(started)}`);

  await first.page.reload({ waitUntil: 'domcontentloaded' });
  await first.page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.shop));
  const afterRefresh = await first.page.evaluate(() => globalThis.window.desktopApi.shop.getSnapshot());
  if (afterRefresh.scheduleState !== 'running' || afterRefresh.currentScheduleItemId !== 'slot-serum' || afterRefresh.schedule.length !== 2) {
    throw new Error(`Renderer refresh lost Shop schedule state: ${JSON.stringify(afterRefresh)}`);
  }
  const controls = await first.page.evaluate(async () => {
    const shop = globalThis.window.desktopApi.shop;
    await shop.pauseSchedule();
    const paused = await shop.getSnapshot();
    await shop.resumeSchedule();
    await shop.skipScheduleItem();
    const skipped = await shop.getSnapshot();
    await shop.stopSchedule();
    return { paused, skipped, stopped: await shop.getSnapshot() };
  });
  if (controls.paused.scheduleState !== 'paused' || controls.skipped.currentScheduleItemId !== 'slot-cica' || controls.stopped.scheduleState !== 'idle') {
    throw new Error(`Shop IPC controls failed: ${JSON.stringify(controls)}`);
  }
  if (/renderer (?:error|warning):|renderer pageerror:/i.test(first.getOutput())) throw new Error(`Shop IPC renderer diagnostics were not clean:${first.getOutput()}`);
  await quit(first);
  first = null;

  second = await launch();
  const afterRestart = await second.page.evaluate(() => globalThis.window.desktopApi.shop.getSnapshot());
  if (afterRestart.scheduleState !== 'idle' || afterRestart.schedule.length !== 2 || afterRestart.mappings.length !== 1) {
    throw new Error(`Shop persisted schedule document was not restored safely: ${JSON.stringify(afterRestart)}`);
  }
  console.log('SHOP_IPC_SMOKE_OK refresh=running restart=idle controls=pass');
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
      if (attempt === 9) console.warn(`Temporary Shop IPC profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
