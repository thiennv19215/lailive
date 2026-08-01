import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-ai-smoke-'));
const artifactDirectory = path.resolve('artifacts/rebuild/ai-reply');
fs.mkdirSync(artifactDirectory, { recursive: true });
const port = 9251;

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
  throw new Error('AI reply smoke CDP endpoint did not start.');
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
  if (!page) throw new Error('AI reply smoke renderer was not found.');
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Electron Security Warning')) return;
    if (['error', 'warning'].includes(message.type())) output += `\nrenderer ${message.type()}: ${message.text()}`;
  });
  page.on('pageerror', (error) => { output += `\nrenderer pageerror: ${error.message}`; });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  const initialConfig = await page.evaluate(async () => globalThis.window.desktopApi.ai.getConfig());
  if (initialConfig.kind !== 'mock' || 'apiKey' in initialConfig) throw new Error('AI config exposed a secret or did not default to mock.');
  const connection = await page.evaluate(async () => globalThis.window.desktopApi.ai.testConnection({ kind: 'mock', baseUrl: 'http://127.0.0.1:11434', model: 'mock-livestream-v1' }));
  if (!connection.ok || connection.models[0] !== 'mock-livestream-v1') throw new Error('Mock provider connection test failed.');

  await page.evaluate(() => { globalThis.location.hash = '/projects/perfume'; });
  await page.locator('.studio-page').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
  const liveDialog = page.locator('.live-settings-dialog');
  await liveDialog.getByRole('button', { name: /Quản lý danh mục/ }).click();
  const productDialog = page.locator('.product-catalog-dialog');
  await productDialog.getByRole('button', { name: 'Thêm sản phẩm' }).click();
  const productCard = productDialog.locator('.product-editor-card').first();
  await productCard.getByLabel('Tên').fill('Serum');
  await productCard.getByLabel('Giá hiện tại').fill('299.000đ');
  await productCard.getByLabel('Mô tả').fill('Dịu nhẹ cho da');
  await productDialog.getByRole('button', { name: 'Lưu danh mục' }).click();

  await liveDialog.getByLabel(/Cách trả lời.*Bình luận/).selectOption('ai_speech');
  await liveDialog.locator('.sliders input[type="range"]').first().fill('0');
  const aiBlock = liveDialog.locator('.ai-config-block');
  await aiBlock.getByRole('button', { name: 'Kiểm tra kết nối' }).click();
  if (!(await aiBlock.getByRole('status').innerText()).includes('model')) throw new Error('AI provider status did not confirm mock connection.');
  await aiBlock.getByPlaceholder('Nhập bình luận thử').fill('serum giá bao nhiêu');
  await aiBlock.getByRole('button', { name: 'Tạo câu trả lời thử' }).click();
  await page.waitForTimeout(100);
  const previewText = await aiBlock.innerText();
  if (!previewText.includes('Score: 1000') || !previewText.includes('299.000đ')) throw new Error('Prompt preview omitted the exact product score or stored price.');
  await page.screenshot({ path: path.join(artifactDirectory, 'mock-prompt-preview.png'), type: 'png' });
  await liveDialog.locator('footer .save-button').click();

  await page.getByRole('button', { name: 'Bắt đầu livestream', exact: true }).click();
  await page.locator('.compact-dialog').filter({ hasText: 'Chọn nguồn tương tác' }).getByRole('button', { name: 'Chạy mô phỏng' }).click();
  const aiReply = page.locator('.live-event-list li.chat .ai-reply-result');
  await aiReply.waitFor({ state: 'visible', timeout: 8_000 });
  const replyText = await aiReply.innerText();
  if (!replyText.includes('AI ·') || !replyText.includes('Serum')) throw new Error(`Unexpected AI feed reply: ${replyText}`);
  if (replyText.includes('99k')) throw new Error('AI feed reply fabricated an unsupported price.');

  await page.getByRole('button', { name: 'Xóa bảng tương tác' }).click();
  await page.waitForFunction(() => globalThis.document.querySelectorAll('.live-event-list li').length === 0);
  await page.locator('.queue-panel header b').filter({ hasText: 'idle' }).waitFor({ state: 'visible' });
  const snapshot = await page.evaluate(async () => ({ cancelled: await globalThis.window.desktopApi.ai.cancelAll(), live: await globalThis.window.desktopApi.live.getSnapshot() }));
  if (snapshot.cancelled !== 0 || snapshot.live.events.length !== 0) throw new Error(`Clear did not leave AI/live state idle: ${JSON.stringify({ cancelled: snapshot.cancelled, events: snapshot.live.events.length })}`);
  if (/renderer (?:error|warning):|renderer pageerror:/i.test(output)) throw new Error(`Renderer diagnostics were not clean:${output}`);

  console.log('AI_REPLY_SMOKE_OK');
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
      if (attempt === 9) console.warn(`Temporary AI profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
