import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const debuggingPort = 9224;
const smokeDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-close-smoke-'));
const child = spawn(electronPath, ['.', '--close-confirmation-smoke', `--remote-debugging-port=${debuggingPort}`], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AI_LIVESTREAM_SMOKE_DATA_DIR: smokeDataDirectory,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
}

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      if (response.ok) return;
    } catch {
      // The Electron debugger endpoint is still starting.
    }
    await delay(150);
  }
  throw new Error('Close-confirmation CDP endpoint did not start.');
}

let browser;
try {
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
  const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().startsWith(devServerUrl));
  if (!page) throw new Error('Close-confirmation renderer page was not found.');

  const dialog = page.getByRole('dialog', { name: 'Bạn có chắc muốn thoát không?', exact: true });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 5_000 });

  await page.evaluate(() => globalThis.window.desktopApi.app.requestClose());
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });
  await dialog.getByLabel('Ghi nhớ lựa chọn của tôi', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Thoát', exact: true }).click();

  const exitCode = await Promise.race([
    new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1))),
    delay(10_000).then(() => { throw new Error('Close-confirmation app did not exit.'); }),
  ]);
  if (exitCode !== 0 || !output.includes('CLOSE_CONFIRMATION_REQUESTED') || !output.includes('CLOSE_CONFIRMATION_CANCELLED')) {
    throw new Error('Close-confirmation smoke markers were incomplete.');
  }
  console.log('CLOSE_CONFIRMATION_SMOKE_OK');
} catch (error) {
  console.error(error);
  child.kill();
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit'), delay(3_000)]);
  }
  fs.rmSync(smokeDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
