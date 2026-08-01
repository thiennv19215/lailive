import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5175/';
const profileDirectory = process.env.AI_LIVESTREAM_SHOP_VERIFY_DATA_DIR
  ?? path.join(process.env.LOCALAPPDATA ?? process.cwd(), 'AI-Livestream-Shop-Verification-App');
const port = Number(process.env.AI_LIVESTREAM_SHOP_VERIFY_CDP_PORT ?? '9262');

fs.mkdirSync(profileDirectory, { recursive: true });

const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
  cwd: process.cwd(),
  detached: true,
  env: {
    ...process.env,
    AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();

const deadline = Date.now() + 20_000;
while (Date.now() < deadline) {
  try {
    if ((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) break;
  } catch {
    // The isolated Electron verification shell is still starting.
  }
  await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
if (!page) throw new Error('Shop verification renderer was not found.');
await page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.shop));

const result = await page.evaluate(async () => {
  const shop = globalThis.window.desktopApi.shop;
  const candidates = await shop.detectBrowsers();
  const selected = candidates.find((candidate) => candidate.name === 'Google Chrome') ?? candidates[0];
  if (!selected) throw new Error('Chrome or Edge was not found.');
  await shop.setConfig({
    kind: 'playwright',
    executablePath: selected.executablePath,
    dashboardUrl: 'https://seller-vn.tiktok.com/compass/live/product',
  });
  const opened = await shop.open();
  return {
    browserName: selected.name,
    connectionState: opened.snapshot.connectionState,
    browserOwned: opened.snapshot.browserOwned,
    cdpPort: opened.snapshot.cdpPort,
    message: opened.message,
  };
});

console.log(`SHOP_LIVE_VERIFICATION_OPEN ${JSON.stringify({ ...result, electronPid: child.pid, profileDirectory })}`);
process.exit(0);
