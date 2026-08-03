import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';
import { WebSocket } from 'ws';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-obs-'));
const artifactDirectory = path.resolve('artifacts/rebuild/obs');
fs.mkdirSync(artifactDirectory, { recursive: true });
const port = 9254;
const obsKind = process.env.AI_LIVESTREAM_OBS_KIND ?? 'mock';
const obsHost = process.env.AI_LIVESTREAM_OBS_HOST ?? '127.0.0.1';
const obsPort = Number(process.env.AI_LIVESTREAM_OBS_PORT ?? '4455');
const obsPassword = process.env.AI_LIVESTREAM_OBS_PASSWORD ?? 'session-secret';
const cameraCycles = Number(process.env.AI_LIVESTREAM_OBS_CAMERA_CYCLES ?? '6');
const sceneName = process.env.AI_LIVESTREAM_OBS_SCENE ?? 'AI Livestream Smoke';
const sourceName = process.env.AI_LIVESTREAM_OBS_SOURCE ?? 'AI Livestream Browser Smoke';

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
  throw new Error('OBS smoke CDP endpoint did not start.');
}

async function captureRealObsSource() {
  const socket = new WebSocket(`ws://${obsHost.includes(':') ? `[${obsHost}]` : obsHost}:${obsPort}`);
  const messages = [];
  const waiters = new Set();
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    const waiter = [...waiters].find((candidate) => candidate.predicate(message));
    if (waiter) {
      waiters.delete(waiter);
      waiter.resolve(message);
    } else messages.push(message);
  });
  const waitFor = (predicate) => {
    const existingIndex = messages.findIndex(predicate);
    if (existingIndex >= 0) return Promise.resolve(messages.splice(existingIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve: (message) => { globalThis.clearTimeout(timer); resolve(message); } };
      const timer = globalThis.setTimeout(() => { waiters.delete(waiter); reject(new Error('OBS screenshot response timed out.')); }, 10_000);
      waiters.add(waiter);
    });
  };
  try {
    await once(socket, 'open');
    const hello = await waitFor((message) => message.op === 0);
    const authenticationInfo = hello.d?.authentication;
    let authentication;
    if (authenticationInfo) {
      const secret = createHash('sha256').update(`${obsPassword}${authenticationInfo.salt ?? ''}`).digest('base64');
      authentication = createHash('sha256').update(`${secret}${authenticationInfo.challenge ?? ''}`).digest('base64');
    }
    socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, ...(authentication ? { authentication } : {}) } }));
    await waitFor((message) => message.op === 2);
    const request = async (requestType, requestData, requestId) => {
      socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }));
      const response = await waitFor((message) => message.op === 7 && message.d?.requestId === requestId);
      if (!response.d?.requestStatus?.result) throw new Error(response.d?.requestStatus?.comment ?? `${requestType} failed.`);
      return response.d?.responseData ?? {};
    };
    const current = await request('GetCurrentProgramScene', undefined, 'current-scene');
    const previousScene = current.currentProgramSceneName;
    try {
      if (previousScene !== sceneName) await request('SetCurrentProgramScene', { sceneName }, 'show-scene');
      await new Promise((resolve) => globalThis.setTimeout(resolve, 8_000));
      const screenshot = await request('GetSourceScreenshot', { sourceName: sceneName, imageFormat: 'png', imageWidth: 360 }, 'source-screenshot');
      const imageData = screenshot.imageData;
      if (typeof imageData !== 'string' || !imageData.startsWith('data:image/png;base64,')) throw new Error('OBS source screenshot was not PNG data.');
      fs.writeFileSync(path.join(artifactDirectory, 'real-browser-source.png'), Buffer.from(imageData.slice('data:image/png;base64,'.length), 'base64'));
    } finally {
      if (typeof previousScene === 'string' && previousScene !== sceneName) await request('SetCurrentProgramScene', { sceneName: previousScene }, 'restore-scene').catch(() => undefined);
    }
  } finally {
    socket.close();
  }
}

const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
  cwd: process.cwd(),
  env: { ...process.env, AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory, AI_LIVESTREAM_CAPTURE_VIEWPORT: '1240x669', VITE_DEV_SERVER_URL: devServerUrl },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk.toString(); });
let browser;

try {
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
  if (!page) throw new Error('OBS smoke renderer was not found.');
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Electron Security Warning')) return;
    if (['error', 'warning'].includes(message.type())) output += `\nrenderer ${message.type()}: ${message.text()}`;
  });
  page.on('pageerror', (error) => { output += `\nrenderer pageerror: ${error.message}`; });
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => { globalThis.location.hash = '/projects/perfume'; });
  await page.locator('.studio-page').waitFor({ state: 'visible' });

  const secretCheck = await page.evaluate(async (config) => {
    const input = { kind: config.kind, host: config.host, port: config.port, sceneName: config.sceneName, sourceName: config.sourceName, width: 1080, height: 1920, fps: 30, password: config.password };
    const saved = await globalThis.window.desktopApi.obs.setConfig(input);
    const publicConfig = await globalThis.window.desktopApi.obs.getConfig();
    return { saved, publicConfig };
  }, { kind: obsKind, host: obsHost, port: obsPort, password: obsPassword, sceneName, sourceName });
  if ('password' in secretCheck.saved || 'password' in secretCheck.publicConfig || !secretCheck.publicConfig.hasPassword) {
    throw new Error('OBS password was exposed or lost from the current session flag.');
  }

  await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
  const dialog = page.locator('.live-settings-dialog');
  const obsBlock = dialog.locator('.obs-config-block');
  await obsBlock.waitFor({ state: 'visible' });
  await obsBlock.getByLabel('Adapter').selectOption(obsKind);
  await obsBlock.getByLabel('Port').fill(String(obsPort));
  if (obsKind === 'obs-websocket') await obsBlock.getByLabel('Mật khẩu phiên này').fill(obsPassword);
  await obsBlock.getByLabel('Tên scene').fill(sceneName);
  await obsBlock.getByLabel('Tên Browser Source').fill(sourceName);
  await obsBlock.getByRole('button', { name: 'Dùng kích thước canvas' }).click();
  await obsBlock.getByRole('button', { name: 'Kiểm tra kết nối' }).click();
  try {
    await obsBlock.getByRole('status').filter({ hasText: 'Đã kết nối' }).waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    const message = await obsBlock.getByRole('status').innerText();
    const status = await page.evaluate(() => globalThis.window.desktopApi.obs.getStatus());
    throw new Error(`OBS connection UI failed: ${message}; ${JSON.stringify(status)}`);
  }
  await obsBlock.getByRole('button', { name: 'Tạo/cập nhật output' }).click();
  await obsBlock.getByRole('status').filter({ hasText: 'Browser Source' }).waitFor({ state: 'visible' });
  await dialog.locator('footer .save-button').click();

  const outputPanel = page.locator('.livestream-output');
  await outputPanel.getByText('CONNECTED').waitFor({ state: 'visible' });
  if (obsKind === 'obs-websocket') {
    await captureRealObsSource();
    const runtimeStatus = await page.evaluate(() => globalThis.window.desktopApi.sceneRuntime.getStatus());
    if (!runtimeStatus.hasScene || runtimeStatus.readyClients < 1) throw new Error(`OBS Browser Source did not report a ready scene: ${JSON.stringify(runtimeStatus)}`);
    if (runtimeStatus.recentLogs.some((entry) => ['warn', 'error'].includes(entry.level))) throw new Error(`OBS Browser Source reported errors: ${JSON.stringify(runtimeStatus.recentLogs)}`);
  }
  for (let cycle = 0; cycle < Math.max(0, cameraCycles - 1); cycle += 1) {
    await outputPanel.getByRole('button', { name: 'Bật camera' }).click();
    await outputPanel.getByText('CAM ON').waitFor({ state: 'visible' });
    await outputPanel.getByRole('button', { name: 'Dừng camera' }).click();
    await outputPanel.getByText('CONNECTED').waitFor({ state: 'visible' });
  }
  await page.screenshot({ path: path.join(artifactDirectory, `${obsKind === 'mock' ? 'mock' : 'real'}-output-ready.png`), type: 'png' });

  await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
  await obsBlock.getByRole('button', { name: 'Ngắt kết nối' }).click();
  await obsBlock.getByRole('status').filter({ hasText: 'Đã ngắt kết nối OBS' }).waitFor({ state: 'visible' });
  await obsBlock.getByRole('button', { name: 'Kiểm tra kết nối' }).click();
  await obsBlock.getByRole('button', { name: 'Tạo/cập nhật output' }).click();
  await obsBlock.getByRole('status').filter({ hasText: 'Browser Source' }).waitFor({ state: 'visible' });
  await dialog.locator('footer .save-button').click();
  if (cameraCycles > 0) {
    await outputPanel.getByRole('button', { name: 'Bật camera' }).click();
    await outputPanel.getByText('CAM ON').waitFor({ state: 'visible' });
    await outputPanel.getByRole('button', { name: 'Dừng camera' }).click();
    await outputPanel.getByText('CONNECTED').waitFor({ state: 'visible' });
  }

  const status = await page.evaluate(() => globalThis.window.desktopApi.obs.getStatus());
  if (!status.connected || !status.browserSourceReady || status.virtualCameraActive) throw new Error(`OBS recovery status was invalid: ${JSON.stringify(status)}`);
  if (/renderer (?:error|warning):|renderer pageerror:/i.test(output)) throw new Error(`OBS renderer diagnostics were not clean:${output}`);
  console.log(`OBS_SMOKE_OK kind=${obsKind} cycles=${cameraCycles} reconnect=ok`);
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
      if (attempt === 9) console.warn(`Temporary OBS profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
