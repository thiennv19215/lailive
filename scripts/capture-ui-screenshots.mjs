import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { URL } from 'node:url';

import electronPath from 'electron';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const outputArgument = process.argv.slice(2).find((argument) => argument !== '--');
const outputDirectory = path.resolve(outputArgument ?? 'artifacts/rebuild');
const artifactsDirectory = `${path.resolve('artifacts')}${path.sep}`;
const debuggingPort = 9227;
const defaultCaptures = [
  ['login', '/login'],
  ['projects', '/'],
  ['templates', '/templates'],
  ['project-editor', '/projects/perfume'],
];
const captureViewport = process.env.AI_LIVESTREAM_CAPTURE_VIEWPORT ?? '1240x669';
const viewportMatch = captureViewport.match(/^(\d{3,4})x(\d{3,4})$/);
if (!viewportMatch) throw new Error('AI_LIVESTREAM_CAPTURE_VIEWPORT must look like 1240x669.');
const requestedViewport = { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) };
const captureRoutes = process.env.AI_LIVESTREAM_CAPTURE_ROUTES;
const captures = captureRoutes
  ? captureRoutes.split(',').map((entry) => {
      const separator = entry.indexOf(':');
      if (separator <= 0 || !entry.slice(separator + 1).startsWith('/')) {
        throw new Error('AI_LIVESTREAM_CAPTURE_ROUTES entries must look like settings:/settings.');
      }
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    })
  : defaultCaptures;

if (!`${outputDirectory}${path.sep}`.startsWith(artifactsDirectory)) {
  throw new Error('UI captures must stay inside the gitignored artifacts directory.');
}

try {
  const response = await fetch(devServerUrl);
  if (!response.ok) throw new Error(`Dev server returned HTTP ${response.status}`);
} catch (error) {
  console.error(`Start the local dev server before capture: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const smokeDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-ui-capture-'));
const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${debuggingPort}`], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AI_LIVESTREAM_SMOKE_DATA_DIR: smokeDataDirectory,
    AI_LIVESTREAM_CAPTURE_VIEWPORT: captureViewport,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let childOutput = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => { childOutput += chunk.toString(); });
}

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      if (response.ok) return;
    } catch {
      // Electron is still starting.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error('UI capture CDP endpoint did not start.');
}

let browser;
try {
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
  const page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
  if (!page) throw new Error('UI capture renderer was not found.');
  const viewport = await page.evaluate(() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  // Windows DPI rounding can add up to two logical pixels to odd auxiliary sizes.
  if (Math.abs(viewport.width - requestedViewport.width) > 2 || Math.abs(viewport.height - requestedViewport.height) > 2) {
    throw new Error(`UI capture viewport mismatch: ${viewport.width}x${viewport.height}.`);
  }
  const devicePixelRatio = await page.evaluate(() => globalThis.devicePixelRatio);
  const expectedScreenshot = {
    width: Math.round(viewport.width * devicePixelRatio),
    height: Math.round(viewport.height * devicePixelRatio),
  };

  for (const [name, route] of captures) {
    const target = new URL(devServerUrl);
    target.hash = route;
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
    if (name === 'projects') await page.locator('.project-card-wrap').first().waitFor({ state: 'visible' });
    const outputPath = path.join(outputDirectory, `${name}.png`);
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    const png = PNG.sync.read(screenshot);
    if (png.width !== expectedScreenshot.width || png.height !== expectedScreenshot.height) {
      throw new Error(`${name} capture size mismatch: ${png.width}x${png.height}.`);
    }
    fs.writeFileSync(outputPath, screenshot);
    console.log(`Captured ${name}: ${outputPath}`);
  }

  console.log('UI_CAPTURE_OK');
} catch (error) {
  console.error(error);
  if (childOutput) console.error(childOutput);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit'), new Promise((resolve) => globalThis.setTimeout(resolve, 3_000))]);
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(smokeDataDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 9) {
        console.warn(`Temporary capture profile cleanup is still pending: ${error instanceof Error ? error.message : error}`);
      } else {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
      }
    }
  }
}
