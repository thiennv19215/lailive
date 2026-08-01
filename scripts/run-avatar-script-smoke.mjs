import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-avatar-script-'));
let requestStartedResolve;
let requestClosedResolve;
let pendingResponse;
const requestStarted = new Promise((resolve) => { requestStartedResolve = resolve; });
const requestClosed = new Promise((resolve) => { requestClosedResolve = resolve; });
const providerServer = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/chat/completions') {
    pendingResponse = response;
    response.on('close', () => {
      if (!response.writableEnded) requestClosedResolve();
    });
    request.resume();
    request.once('end', () => requestStartedResolve());
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ data: [{ id: 'avatar-script-smoke' }] }));
});
await new Promise((resolve, reject) => {
  providerServer.once('error', reject);
  providerServer.listen(0, '127.0.0.1', resolve);
});
const providerAddress = providerServer.address();
if (!providerAddress || typeof providerAddress === 'string') throw new Error('Avatar-script provider fixture did not bind to loopback.');
const providerBaseUrl = `http://127.0.0.1:${providerAddress.port}`;

async function waitForCdp(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) return;
    } catch {
      // The isolated Electron process is still starting.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error(`Avatar-script CDP endpoint ${port} did not start.`);
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

async function launch(port) {
  const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
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
  await waitForCdp(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  const deadline = Date.now() + 20_000;
  while (!page && Date.now() < deadline) {
    page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
    if (!page) await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  if (!page) throw new Error(`Avatar-script renderer ${port} was not found.`);
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Electron Security Warning')) return;
    if (['error', 'warning'].includes(message.type())) output += `\nrenderer ${message.type()}: ${message.text()}`;
  });
  page.on('pageerror', (error) => { output += `\nrenderer pageerror: ${error.message}`; });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.projects));
  return { child, browser, page, getOutput: () => output };
}

async function gracefulQuit(instance) {
  const exitPromise = once(instance.child, 'exit');
  await instance.page.evaluate(() => globalThis.window.desktopApi.app.respondToClose({ action: 'quit', remember: false })).catch(() => undefined);
  await Promise.race([exitPromise, new Promise((resolve) => globalThis.setTimeout(resolve, 7_000))]);
  await instance.browser.close().catch(() => undefined);
  if (instance.child.exitCode === null && instance.child.signalCode === null) await terminateProcessTree(instance.child.pid);
}

async function openScriptDialog(page, projectId) {
  await page.evaluate((id) => { globalThis.location.hash = `/projects/${id}`; }, projectId);
  await page.locator('.studio-page').waitFor({ state: 'visible' });
  await page.locator('.source-panel li').filter({ hasText: 'Chinese Beauty Sale 3' }).click();
  await page.locator('.avatar-script-panel button').click();
  const dialog = page.locator('.script-editor-dialog');
  await dialog.waitFor({ state: 'visible' });
  return dialog;
}

let active;
let projectId = '';
let generatedScript = '';
try {
  active = await launch(9273);
  projectId = await active.page.evaluate(async () => {
    const project = (await globalThis.window.desktopApi.projects.list())[0];
    if (!project) throw new Error('AVATAR_SCRIPT_PROJECT_MISSING');
    return project.id;
  });

  let dialog = await openScriptDialog(active.page, projectId);
  await dialog.getByRole('button', { name: 'Tạo kịch bản AI' }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Hãy nhập tên hoặc thông tin của ít nhất một sản phẩm.' }).waitFor({ state: 'visible' });
  await dialog.locator('.script-product-card input').fill('Serum M5');
  await dialog.locator('.script-product-card textarea').fill('Dịu nhẹ cho da');
  await dialog.getByRole('button', { name: 'Kiểm tra tự điền từ link' }).click();
  await dialog.locator('.script-generation-message').filter({ hasText: 'chưa khả dụng' }).waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: 'Tạo kịch bản AI' }).click();
  await dialog.locator('.script-generation-message').filter({ hasText: 'Nhấn Lưu' }).waitFor({ state: 'visible' });
  generatedScript = await dialog.locator('.avatar-script-row textarea').first().inputValue();
  if (!generatedScript.includes('Serum M5')) throw new Error(`Generated script did not use the configured provider boundary: ${generatedScript}`);

  await dialog.getByRole('button', { name: 'Hủy' }).click();
  dialog = await openScriptDialog(active.page, projectId);
  if ((await dialog.locator('.avatar-script-row textarea').first().inputValue()).includes('Serum M5')) {
    throw new Error('Cancelled generated draft leaked into project state.');
  }

  await dialog.locator('.script-product-card input').fill('Serum M5');
  await dialog.locator('.script-product-card textarea').fill('Dịu nhẹ cho da');
  await dialog.getByRole('button', { name: 'Tạo kịch bản AI' }).click();
  await dialog.locator('.script-generation-message').filter({ hasText: 'Nhấn Lưu' }).waitFor({ state: 'visible' });
  generatedScript = await dialog.locator('.avatar-script-row textarea').first().inputValue();
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await active.page.waitForTimeout(900);

  const saved = await active.page.evaluate(async (id) => globalThis.window.desktopApi.projects.get(id), projectId);
  if (saved?.scene.avatarSettings.scripts[0] !== generatedScript) {
    throw new Error(`Generated script was not persisted through the dialog Save/autosave path: ${JSON.stringify({ expected: generatedScript, actual: saved?.scene.avatarSettings.scripts })}`);
  }

  dialog = await openScriptDialog(active.page, projectId);
  await active.page.evaluate(async (baseUrl) => globalThis.window.desktopApi.ai.setConfig({
    kind: 'openai-compatible', baseUrl, model: 'avatar-script-smoke', apiKey: 'session-only-smoke-key',
  }), providerBaseUrl);
  await dialog.getByRole('button', { name: 'Tạo kịch bản AI' }).click();
  await Promise.race([requestStarted, new Promise((_, reject) => globalThis.setTimeout(() => reject(new Error('Delayed AI provider request did not start.')), 5_000))]);
  await dialog.getByRole('button', { name: 'Đóng' }).click();
  await Promise.race([requestClosed, new Promise((_, reject) => globalThis.setTimeout(() => reject(new Error('Closing the dialog did not abort the active provider request.')), 5_000))]);
  pendingResponse?.end(JSON.stringify({ choices: [{ message: { content: 'Kết quả cũ không được phép ghi đè.' } }] }));
  dialog = await openScriptDialog(active.page, projectId);
  if (await dialog.locator('.avatar-script-row textarea').first().inputValue() !== generatedScript) {
    throw new Error('A stale late AI response overwrote the saved script.');
  }
  await dialog.getByRole('button', { name: 'Hủy' }).click();

  await gracefulQuit(active);
  active = null;

  active = await launch(9274);
  dialog = await openScriptDialog(active.page, projectId);
  if (await dialog.locator('.avatar-script-row textarea').first().inputValue() !== generatedScript) {
    throw new Error('Generated avatar script did not survive Electron restart.');
  }
  await dialog.getByRole('button', { name: 'Hủy' }).click();
  const lockPath = path.join(profileDirectory, 'runtime.lock');
  await gracefulQuit(active);
  active = null;
  if (fs.existsSync(lockPath)) throw new Error('Avatar-script smoke left a runtime lock after graceful shutdown.');
  console.log(`AVATAR_SCRIPT_SMOKE_OK provider=mock cancel=exact persisted=${generatedScript.length} restart=pass`);
} catch (error) {
  if (active?.getOutput()) console.error(active.getOutput());
  throw error;
} finally {
  if (active) await gracefulQuit(active).catch(() => terminateProcessTree(active.child.pid));
  await new Promise((resolve) => providerServer.close(resolve));
  fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
