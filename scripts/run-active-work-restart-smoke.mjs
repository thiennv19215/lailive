import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-active-work-restart-'));

async function waitForCdp(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) return;
    } catch {
      // Electron is still starting or the crashed process is releasing the port.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error(`Active-work restart CDP endpoint ${port} did not start.`);
}

async function terminateProcessTree(pid) {
  if (!pid) throw new Error('Active-work Electron PID is unavailable.');
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
  if (!page) throw new Error(`Active-work renderer ${port} was not found.`);
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Electron Security Warning')) return;
    if (['error', 'warning'].includes(message.type())) output += `\nrenderer ${message.type()}: ${message.text()}`;
  });
  page.on('pageerror', (error) => { output += `\nrenderer pageerror: ${error.message}`; });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.projects));
  return { child, browser, page, getOutput: () => output };
}

async function crash(instance) {
  const exitPromise = once(instance.child, 'exit');
  await terminateProcessTree(instance.child.pid);
  await Promise.race([exitPromise, new Promise((resolve) => globalThis.setTimeout(resolve, 7_000))]);
  await instance.browser.close().catch(() => undefined);
  if (instance.child.exitCode === null && instance.child.signalCode === null) throw new Error('Active-work crash process did not exit.');
}

async function gracefulQuit(instance) {
  const exitPromise = once(instance.child, 'exit');
  await instance.page.evaluate(() => globalThis.window.desktopApi.app.respondToClose({ action: 'quit', remember: false })).catch(() => undefined);
  await Promise.race([exitPromise, new Promise((resolve) => globalThis.setTimeout(resolve, 7_000))]);
  await instance.browser.close().catch(() => undefined);
  if (instance.child.exitCode === null && instance.child.signalCode === null) await terminateProcessTree(instance.child.pid);
}

let active;
try {
  active = await launch(9271);
  const baseline = await active.page.evaluate(async () => {
    const api = globalThis.window.desktopApi;
    const project = (await api.projects.list())[0];
    if (!project) throw new Error('ACTIVE_WORK_PROJECT_MISSING');
    const scene = {
      ...project.scene,
      canvasPreset: 'portrait-1080p',
      width: 1080,
      height: 1920,
      textStyle: { ...project.scene.textStyle, content: 'Committed before active-work crash' },
    };
    await api.projects.saveScene(project.id, scene);
    await api.settings.set('smoke.active-work-baseline', { projectId: project.id, canvasPreset: scene.canvasPreset });
    await api.tts.setConfig({ kind: 'mock', endpoint: '', voices: ['Ngoc Lam'] });
    return { projectId: project.id };
  });

  await active.page.evaluate((projectId) => { globalThis.location.hash = `/projects/${projectId}`; }, baseline.projectId);
  await active.page.locator('.studio-page').waitFor({ state: 'visible' });
  const settingsButton = active.page.locator('button.studio-action.live').filter({ hasText: 'Cài đặt livestream' });
  if (await settingsButton.count() !== 1) throw new Error('Livestream settings action was not unique.');
  await settingsButton.click();
  const dialog = active.page.locator('.live-settings-dialog');
  await dialog.waitFor({ state: 'visible' });
  const previewInput = dialog.locator('.tts-preview-row input');
  const previewButton = dialog.locator('.tts-preview-row button');
  await previewInput.fill('Phiên TTS đang phát phải bị dừng sạch khi tiến trình Electron bị kết thúc đột ngột, không được khôi phục một job mồ côi sau lần mở kế tiếp. '.repeat(3));
  await previewButton.click();
  await dialog.locator('footer .save-button').click();
  const queuePanel = active.page.locator('.queue-panel');
  await queuePanel.locator('header b.talking').waitFor({ state: 'visible', timeout: 5_000 });
  await queuePanel.locator('.queue-panel-body > span strong').filter({ hasText: 'playing' }).waitFor({ state: 'visible', timeout: 5_000 });
  await active.page.waitForTimeout(450);

  const preset = active.page.locator('select[aria-label="Khung hình scene"]');
  await preset.selectOption('landscape-1080p');
  const preCrash = await active.page.evaluate(() => ({
    queueState: globalThis.document.querySelector('.queue-panel .queue-panel-body > span strong')?.textContent ?? null,
    autosave: globalThis.document.querySelector('.studio-status span')?.textContent ?? null,
    preset: globalThis.document.querySelector('select[aria-label="Khung hình scene"]')?.value ?? null,
  }));
  if (preCrash.queueState !== 'playing' || preCrash.preset !== 'landscape-1080p') throw new Error(`Active-work precondition failed: ${JSON.stringify(preCrash)}`);
  await crash(active);
  active = null;

  active = await launch(9272);
  const restored = await active.page.evaluate(async (projectId) => {
    const api = globalThis.window.desktopApi;
    const project = await api.projects.get(projectId);
    const marker = await api.settings.get('smoke.active-work-baseline');
    const diagnostics = await api.diagnostics.getSnapshot();
    return { project, marker, diagnostics };
  }, baseline.projectId);
  if (!restored.project) throw new Error('Project was unavailable after active-work restart.');
  if (!['portrait-1080p', 'landscape-1080p'].includes(restored.project.scene.canvasPreset)) throw new Error('Restart restored an invalid canvas preset.');
  if (restored.project.scene.textStyle.content !== 'Committed before active-work crash') throw new Error('Restart lost the last committed scene baseline.');
  if (restored.marker?.value?.projectId !== baseline.projectId) throw new Error('Restart lost the committed active-work marker.');
  if (!restored.diagnostics.recoveryNotices.some((notice) => notice.kind === 'stale-lock-recovered')) throw new Error('Restart did not expose stale-lock recovery notice data.');
  if (restored.diagnostics.health.length !== 7 || restored.diagnostics.health.some((item) => item.status === 'error')) throw new Error('Restart health snapshot is invalid.');

  await active.page.evaluate((projectId) => { globalThis.location.hash = `/projects/${projectId}`; }, baseline.projectId);
  await active.page.locator('.studio-page').waitFor({ state: 'visible' });
  const restoredQueue = active.page.locator('.queue-panel');
  await restoredQueue.locator('header b').filter({ hasText: 'idle' }).waitFor({ state: 'visible', timeout: 5_000 });
  const queueState = await active.page.evaluate(() => ({
    jobs: globalThis.document.querySelectorAll('.queue-panel ol li').length,
    active: globalThis.document.querySelector('.queue-panel .queue-panel-body > span strong')?.textContent ?? null,
    avatar: globalThis.document.querySelector('.queue-panel header b')?.textContent ?? null,
  }));
  if (queueState.jobs !== 0 || queueState.active !== 'Đang rảnh' || queueState.avatar !== 'idle') throw new Error(`Queue did not restart cleanly: ${JSON.stringify(queueState)}`);
  if (/renderer (?:error|warning):|renderer pageerror:/i.test(active.getOutput())) throw new Error(`Restart renderer output was not clean:${active.getOutput()}`);

  await gracefulQuit(active);
  active = null;
  if (fs.existsSync(path.join(profileDirectory, 'runtime.lock.json'))) throw new Error('Runtime lock remained after active-work restart smoke.');
  console.log(`ACTIVE_WORK_RESTART_SMOKE_OK autosave=${preCrash.autosave ?? 'unknown'} restoredPreset=${restored.project.scene.canvasPreset} queue=idle recovery=stale-lock`);
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
      if (attempt === 11) console.warn(`Temporary active-work profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
