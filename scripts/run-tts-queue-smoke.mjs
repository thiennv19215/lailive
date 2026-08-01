import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-tts-queue-'));
const artifactDirectory = path.resolve('artifacts/rebuild/tts-queue');
fs.mkdirSync(artifactDirectory, { recursive: true });
const port = 9252;

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) return;
    } catch {
      // The isolated Electron process is still starting.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error('TTS queue smoke CDP endpoint did not start.');
}

async function waitForJobState(queuePanel, text, state, timeout = 8_000) {
  const row = queuePanel.locator('ol li').filter({ hasText: text }).first();
  await row.locator('b').filter({ hasText: state }).waitFor({ state: 'visible', timeout });
  return row;
}

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
let browser;

try {
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
  if (!page) throw new Error('TTS queue smoke renderer was not found.');
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Electron Security Warning')) return;
    if (['error', 'warning'].includes(message.type())) output += `\nrenderer ${message.type()}: ${message.text()}`;
  });
  page.on('pageerror', (error) => { output += `\nrenderer pageerror: ${error.message}`; });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  const provider = await page.evaluate(async () => {
    const saved = await globalThis.window.desktopApi.tts.setConfig({
      kind: 'mock', endpoint: '', voices: ['Mỹ Dung', 'Ngọc Lam'], apiKey: 'session-only-secret',
    });
    const publicConfig = await globalThis.window.desktopApi.tts.getConfig();
    const connection = await globalThis.window.desktopApi.tts.testConnection({
      kind: 'mock', endpoint: '', voices: ['Mỹ Dung', 'Ngọc Lam'],
    });
    const input = { requestId: 'direct-cache-1', text: 'Kiểm tra cache TTS', voice: 'Mỹ Dung', speed: 1, volume: 1, timeoutMs: 120_000 };
    const first = await globalThis.window.desktopApi.tts.synthesize(input);
    const second = await globalThis.window.desktopApi.tts.synthesize({ ...input, requestId: 'direct-cache-2' });
    return { saved, publicConfig, connection, first, second };
  });
  if ('apiKey' in provider.saved || 'apiKey' in provider.publicConfig || !provider.publicConfig.hasApiKey) {
    throw new Error('Public TTS config exposed the API key or lost its session-only presence flag.');
  }
  if (!provider.connection.ok || provider.connection.voices.length !== 2) throw new Error('Mock TTS connection test failed.');
  if (provider.first.cached || !provider.second.cached || provider.first.cacheKey !== provider.second.cacheKey) {
    throw new Error('Repeated TTS synthesis did not use the deterministic cache.');
  }

  await page.evaluate(() => { globalThis.location.hash = '/projects/perfume'; });
  await page.locator('.studio-page').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Cặp avatar idle / talking' }).click();
  const idleLayerId = await page.locator('.source-panel li').filter({ hasText: 'Avatar idle' }).getAttribute('data-layer-id');
  const talkingLayerId = await page.locator('.source-panel li').filter({ hasText: 'Avatar talking' }).getAttribute('data-layer-id');
  if (!idleLayerId || !talkingLayerId) throw new Error('Paired avatar authoring did not create both source rows.');
  const idleAvatar = page.locator(`[data-runtime-layer-id="${idleLayerId}"]`);
  const talkingAvatar = page.locator(`[data-runtime-layer-id="${talkingLayerId}"]`);
  if (await idleAvatar.count() !== 1 || await talkingAvatar.count() !== 1) throw new Error('Paired avatar media did not mount exactly once.');
  await page.evaluate(({ idleId, talkingId }) => {
    globalThis.__avatarNodes = {
      idle: globalThis.document.querySelector(`[data-runtime-layer-id="${idleId}"]`),
      talking: globalThis.document.querySelector(`[data-runtime-layer-id="${talkingId}"]`),
    };
  }, { idleId: idleLayerId, talkingId: talkingLayerId });
  const idleOpacity = await idleAvatar.evaluate((element) => globalThis.getComputedStyle(element).opacity);
  const talkingOpacity = await talkingAvatar.evaluate((element) => globalThis.getComputedStyle(element).opacity);
  if (idleOpacity !== '1' || talkingOpacity !== '0') throw new Error(`Initial avatar visibility was invalid: idle=${idleOpacity}, talking=${talkingOpacity}`);
  const queuePanel = page.locator('.queue-panel');
  await queuePanel.waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
  const liveDialog = page.locator('.live-settings-dialog');
  const ttsBlock = liveDialog.locator('.tts-config-block');
  await ttsBlock.getByRole('button', { name: 'Kiểm tra kết nối' }).click();
  await ttsBlock.getByRole('status').filter({ hasText: 'sẵn sàng' }).waitFor({ state: 'visible' });

  const previewInput = ttsBlock.getByPlaceholder('Nội dung nghe thử');
  const previewButton = ttsBlock.getByRole('button', { name: 'Nghe thử trong queue' });
  const longPreview = 'Bản nghe thử dài để xác minh trạng thái đang phát, avatar đang nói và thao tác bỏ qua hiện tại hoạt động ổn định.';
  await previewInput.fill(longPreview);
  await previewButton.click();
  await liveDialog.locator('footer .save-button').click();
  await queuePanel.locator('header b.talking').waitFor({ state: 'visible', timeout: 5_000 });
  await queuePanel.locator('.queue-panel-body > span strong').filter({ hasText: 'playing' }).waitFor({ state: 'visible' });
  await page.waitForFunction(({ idleId, talkingId }) => {
    const idle = globalThis.document.querySelector(`[data-runtime-layer-id="${idleId}"]`);
    const talking = globalThis.document.querySelector(`[data-runtime-layer-id="${talkingId}"]`);
    return idle && talking && Number(globalThis.getComputedStyle(idle).opacity) < 0.01 && Number(globalThis.getComputedStyle(talking).opacity) > 0.99;
  }, { idleId: idleLayerId, talkingId: talkingLayerId });
  const talkingVisibility = await page.evaluate(({ idleId, talkingId }) => {
    const idle = globalThis.document.querySelector(`[data-runtime-layer-id="${idleId}"]`);
    const talking = globalThis.document.querySelector(`[data-runtime-layer-id="${talkingId}"]`);
    return {
      stable: idle === globalThis.__avatarNodes?.idle && talking === globalThis.__avatarNodes?.talking,
      idleOpacity: idle ? globalThis.getComputedStyle(idle).opacity : null,
      talkingOpacity: talking ? globalThis.getComputedStyle(talking).opacity : null,
    };
  }, { idleId: idleLayerId, talkingId: talkingLayerId });
  if (!talkingVisibility.stable || talkingVisibility.idleOpacity !== '0' || talkingVisibility.talkingOpacity !== '1') {
    throw new Error(`Talking avatar switch recreated media or used invalid opacity: ${JSON.stringify(talkingVisibility)}`);
  }
  await page.screenshot({ path: path.join(artifactDirectory, 'desktop-talking-queue.png'), type: 'png' });
  await queuePanel.getByRole('button', { name: 'Bỏ qua hiện tại' }).click();
  const cancelledRow = await waitForJobState(queuePanel, 'TTS preview', 'cancelled');
  await cancelledRow.getByRole('button', { name: 'Thử lại' }).click();
  const retriedRow = await waitForJobState(queuePanel, 'TTS preview', 'done');
  if (!(await retriedRow.locator('b').innerText()).includes('cache')) throw new Error('Retry did not reuse cached synthesis.');

  const firstText = 'Một hai ba bốn năm sáu bảy tám chín mười, hàng đợi thứ nhất.';
  const secondText = 'Hàng đợi thứ hai chỉ được phát sau khi mục thứ nhất kết thúc.';
  await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
  await previewInput.fill(firstText);
  await previewButton.click();
  await previewInput.fill(secondText);
  await previewButton.click();
  await liveDialog.locator('footer .save-button').click();
  await queuePanel.locator('.queue-panel-body > span small').filter({ hasText: firstText }).waitFor({ state: 'visible' });
  const queuedSecond = queuePanel.locator('ol li').filter({ hasText: 'TTS preview' }).filter({ hasText: 'queued' });
  if (await queuedSecond.count() < 1) throw new Error('Second preview was not held in the queue while the first played.');
  await queuePanel.locator('.queue-panel-body > span small').filter({ hasText: secondText }).waitFor({ state: 'visible', timeout: 8_000 });
  await queuePanel.locator('header b').filter({ hasText: 'idle' }).waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForFunction(({ idleId, talkingId }) => {
    const idle = globalThis.document.querySelector(`[data-runtime-layer-id="${idleId}"]`);
    const talking = globalThis.document.querySelector(`[data-runtime-layer-id="${talkingId}"]`);
    return idle && talking && Number(globalThis.getComputedStyle(idle).opacity) > 0.99 && Number(globalThis.getComputedStyle(talking).opacity) < 0.01;
  }, { idleId: idleLayerId, talkingId: talkingLayerId });
  const restoredVisibility = await page.evaluate(({ idleId, talkingId }) => {
    const idle = globalThis.document.querySelector(`[data-runtime-layer-id="${idleId}"]`);
    const talking = globalThis.document.querySelector(`[data-runtime-layer-id="${talkingId}"]`);
    return {
      stable: idle === globalThis.__avatarNodes?.idle && talking === globalThis.__avatarNodes?.talking,
      idleOpacity: idle ? globalThis.getComputedStyle(idle).opacity : null,
      talkingOpacity: talking ? globalThis.getComputedStyle(talking).opacity : null,
    };
  }, { idleId: idleLayerId, talkingId: talkingLayerId });
  if (!restoredVisibility.stable || restoredVisibility.idleOpacity !== '1' || restoredVisibility.talkingOpacity !== '0') {
    throw new Error(`Idle avatar restore recreated media or used invalid opacity: ${JSON.stringify(restoredVisibility)}`);
  }

  const clearActiveText = 'Mục đang phát phải bị hủy khi xóa toàn bộ hàng đợi, kể cả khi còn nhiều nội dung phía sau.';
  await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
  await previewInput.fill(clearActiveText);
  await previewButton.click();
  await previewInput.fill('Mục đang chờ cũng phải bị hủy ngay lập tức.');
  await previewButton.click();
  await liveDialog.locator('footer .save-button').click();
  await queuePanel.locator('header b.talking').waitFor({ state: 'visible' });
  await queuePanel.getByRole('button', { name: 'Xóa hàng đợi' }).click();
  await queuePanel.locator('header b').filter({ hasText: 'idle' }).waitFor({ state: 'visible' });
  const activeStates = await queuePanel.locator('ol li b').allTextContents();
  if (activeStates.some((state) => /queued|processing|playing/.test(state))) throw new Error(`Queue clear left active jobs: ${activeStates.join(', ')}`);

  await page.getByRole('button', { name: 'Xóa Avatar talking' }).click();
  await page.locator('.interaction-panel').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Bắt đầu livestream', exact: true }).click();
  await page.locator('.compact-dialog').filter({ hasText: 'Chọn nguồn tương tác' }).getByRole('button', { name: 'Chạy mô phỏng' }).click();
  try {
    await page.waitForFunction(() => globalThis.document.querySelectorAll('.live-event-list li').length === 5, undefined, { timeout: 8_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      status: globalThis.document.querySelector('.live-status-pill')?.textContent,
      dialog: globalThis.document.querySelector('.compact-dialog')?.textContent,
      notice: globalThis.document.querySelector('.studio-notice')?.textContent,
      events: globalThis.document.querySelectorAll('.live-event-list li').length,
    }));
    throw new Error(`Mock live fixture did not populate the feed: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
  const liveQueueResult = page.locator('.live-event-list .queue-state-result').first();
  try {
    await liveQueueResult.waitFor({ state: 'visible', timeout: 8_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      moderation: [...globalThis.document.querySelectorAll('.live-event-list .moderation-decision')].map((node) => node.textContent),
      feed: globalThis.document.querySelector('.live-event-list')?.textContent,
      queue: globalThis.document.querySelector('.queue-panel')?.textContent,
    }));
    throw new Error(`Live events did not enter the TTS queue: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
  await page.waitForFunction(() => [...globalThis.document.querySelectorAll('.live-event-list .queue-state-result')].some((node) => /playing|done/.test(node.textContent ?? '')), undefined, { timeout: 8_000 });
  await page.screenshot({ path: path.join(artifactDirectory, 'live-event-through-tts.png'), type: 'png' });
  await page.getByRole('button', { name: 'Xóa bảng tương tác' }).click();
  await queuePanel.locator('header b').filter({ hasText: 'idle' }).waitFor({ state: 'visible' });

  if (/renderer (?:error|warning):|renderer pageerror:/i.test(output)) throw new Error(`Renderer diagnostics were not clean:${output}`);
  console.log('TTS_QUEUE_SMOKE_OK');
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
      if (attempt === 9) console.warn(`Temporary TTS profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
