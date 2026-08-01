import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-live-smoke-'));
const artifactDirectory = path.resolve('artifacts/rebuild/live-connector');
fs.mkdirSync(artifactDirectory, { recursive: true });
const port = 9250;

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return;
    } catch {
      // The isolated Electron process is still starting.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error('Live connector smoke CDP endpoint did not start.');
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
  if (!page) throw new Error('Live connector renderer was not found.');
  page.on('console', (message) => { output += `\nrenderer ${message.type()}: ${message.text()}`; });
  page.on('pageerror', (error) => { output += `\nrenderer pageerror: ${error.message}`; });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(750);
  await page.evaluate(() => { globalThis.location.hash = '/projects/perfume'; });
  await page.waitForTimeout(300);
  const overlay = page.locator('vite-error-overlay');
  if (await overlay.count()) {
    const detail = await overlay.evaluate((element) => element.shadowRoot?.textContent ?? 'Unknown Vite overlay error');
    throw new Error(`Live connector Vite overlay: ${detail}`);
  }
  try {
    await page.locator('.studio-page').waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    throw new Error(`Studio route did not render at ${page.url()}: ${(await page.locator('body').innerText()).slice(0, 1000)}`);
  }

  await page.getByRole('button', { name: 'Bắt đầu livestream', exact: true }).click();
  const startDialog = page.locator('.compact-dialog').filter({ hasText: 'Chọn nguồn tương tác' });
  await startDialog.getByRole('button', { name: 'Chạy mô phỏng' }).click();
  await page.locator('.live-status-pill.connected').waitFor({ state: 'visible' });
  await page.locator('.live-event-list li').nth(4).waitFor({ state: 'visible' });
  if (await page.locator('.live-event-list li').count() !== 5) throw new Error('Mock mode did not emit exactly five initial events.');
  for (const label of ['Bình luận', 'Tặng quà', 'Thích', 'Theo dõi', 'Chia sẻ']) {
    if (await page.locator('.live-event-list').getByText(label, { exact: true }).count() !== 1) throw new Error(`Missing normalized ${label} event.`);
  }
  const counters = await page.locator('.live-counter-grid b').allTextContents();
  if (counters.join(',') !== '1,1,12,1,1') throw new Error(`Unexpected live counters: ${counters.join(',')}`);
  const moderationDecisions = await page.locator('.moderation-decision').allTextContents();
  if (moderationDecisions.length !== 5) throw new Error(`Expected five moderation decisions, received ${moderationDecisions.length}.`);
  if (moderationDecisions.filter((decision) => decision.startsWith('Nhận')).length !== 2) throw new Error(`Unexpected accepted moderation count: ${moderationDecisions.join(' | ')}`);
  if (!moderationDecisions.some((decision) => decision.includes('event-disabled'))) throw new Error('Disabled like trigger did not produce a decision trace.');
  if (moderationDecisions.filter((decision) => decision.includes('global-cooldown')).length !== 2) throw new Error('Global cooldown decisions did not match the deterministic fixture timeline.');

  const recording = await page.evaluate(async () => globalThis.window.desktopApi.live.getRecording());
  if (recording.events.length !== 5 || recording.format !== 'ai-livestream-live-events') throw new Error('Live recording envelope was invalid.');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Lưu bản ghi' }).click();
  await downloadPromise;
  await page.screenshot({ path: path.join(artifactDirectory, 'mock-five-events.png'), type: 'png' });

  await page.getByRole('button', { name: 'Xóa bảng tương tác' }).click();
  await page.evaluate(async () => { await globalThis.window.desktopApi.live.reconnect(); });
  await page.locator('.live-event-list li').nth(4).waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  if (await page.locator('.live-event-list li').count() !== 5) throw new Error('Reconnect duplicated listeners or events.');

  await page.getByRole('button', { name: 'Xóa bảng tương tác' }).click();
  await page.getByRole('button', { name: 'Phát lại fixture' }).click();
  if (await page.locator('.live-event-list li').count() !== 5) throw new Error('Fixture replay did not restore all five events.');

  await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
  const liveSettingsDialog = page.locator('.live-settings-dialog');
  await liveSettingsDialog.getByLabel(/Cách trả lời.*Bình luận/).selectOption('ignore');
  await liveSettingsDialog.locator('footer .save-button').click();
  await page.getByRole('button', { name: 'Xóa bảng tương tác' }).click();
  await page.getByRole('button', { name: 'Phát lại fixture' }).click();
  const chatDecision = page.locator('.live-event-list li.chat .moderation-decision');
  if (!(await chatDecision.innerText()).includes('action-ignore')) throw new Error('Trigger action change did not apply without reconnecting.');
  const configuredSnapshot = await page.evaluate(async () => globalThis.window.desktopApi.live.getSnapshot());
  if (configuredSnapshot.status !== 'connected') throw new Error('Changing moderation settings unexpectedly reconnected the live session.');

  await page.getByRole('button', { name: 'Dừng livestream', exact: true }).click();
  await page.locator('.live-status-pill.disconnected').waitFor({ state: 'visible' });
  await page.evaluate(() => { globalThis.location.hash = '/'; });
  await page.locator('.projects-page').waitFor({ state: 'visible' });
  const finalSnapshot = await page.evaluate(async () => globalThis.window.desktopApi.live.getSnapshot());
  if (finalSnapshot.status !== 'disconnected') throw new Error('Leaving the project did not stop the live connector.');

  console.log('LIVE_CONNECTOR_SMOKE_OK');
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
      if (attempt === 9) console.warn(`Temporary live profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
