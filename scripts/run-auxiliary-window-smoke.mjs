import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const debuggingPort = 9225;
const smokeDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-auxiliary-smoke-'));
const child = spawn(electronPath, ['.', '--auxiliary-window-smoke', `--remote-debugging-port=${debuggingPort}`], {
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
      // Electron is still starting.
    }
    await delay(150);
  }
  throw new Error('Auxiliary-window CDP endpoint did not start.');
}

let browser;
try {
  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
  const context = browser.contexts()[0];
  const mainPage = context.pages().find((candidate) => candidate.url() === devServerUrl);
  if (!mainPage) throw new Error('Main renderer page was not found.');

  const firstResult = await mainPage.evaluate(() => globalThis.window.desktopApi.app.openAuxiliaryWindow('guide'));
  if (firstResult.name !== 'guide' || firstResult.reused) throw new Error('First guide window open result was invalid.');

  const auxiliaryDeadline = Date.now() + 10_000;
  let auxiliaryPage;
  while (!auxiliaryPage && Date.now() < auxiliaryDeadline) {
    auxiliaryPage = context.pages().find((candidate) => candidate.url().includes('#/auxiliary/guide'));
    if (!auxiliaryPage) await delay(100);
  }
  if (!auxiliaryPage) throw new Error('Guide auxiliary renderer was not created.');
  await auxiliaryPage.getByText('Hướng dẫn', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await auxiliaryPage.getByRole('status').getByText('Đang tải...', { exact: true }).waitFor({ state: 'visible' });
  const guideViewport = await auxiliaryPage.evaluate(() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  if (Math.abs(guideViewport.width - 800) > 1 || Math.abs(guideViewport.height - 542) > 1) {
    throw new Error(`Guide viewport mismatch: ${guideViewport.width}x${guideViewport.height}.`);
  }

  const pageCount = context.pages().length;
  const secondResult = await mainPage.evaluate(() => globalThis.window.desktopApi.app.openAuxiliaryWindow('guide'));
  if (!secondResult.reused || context.pages().length !== pageCount) {
    throw new Error('Guide auxiliary window was not reused.');
  }

  const isolation = await auxiliaryPage.evaluate(() => ({
    processType: typeof globalThis.process,
    requireType: typeof globalThis.require,
    apiAvailable: typeof globalThis.window.desktopApi?.app.openAuxiliaryWindow === 'function',
  }));
  if (isolation.processType !== 'undefined' || isolation.requireType !== 'undefined' || !isolation.apiAvailable) {
    throw new Error('Auxiliary renderer isolation check failed.');
  }

  const measuredWindows = [
    ['feedback', 700, 600],
    ['monitor', 702, 502],
    ['payment', 502, 400],
    ['user', 700, 500],
    ['setup', 800, 542],
  ];
  for (const [name, expectedWidth, expectedHeight] of measuredWindows) {
    await mainPage.evaluate((windowName) => globalThis.window.desktopApi.app.openAuxiliaryWindow(windowName), name);
    const deadline = Date.now() + 10_000;
    let measuredPage;
    while (!measuredPage && Date.now() < deadline) {
      measuredPage = context.pages().find((candidate) => candidate.url().includes(`#/auxiliary/${name}`));
      if (!measuredPage) await delay(100);
    }
    if (!measuredPage) throw new Error(`${name} auxiliary renderer was not created.`);
    const viewport = await measuredPage.evaluate(() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
    if (Math.abs(viewport.width - expectedWidth) > 1 || Math.abs(viewport.height - expectedHeight) > 1) {
      throw new Error(`${name} viewport mismatch: ${viewport.width}x${viewport.height}.`);
    }
    if (name === 'monitor') {
      await measuredPage.getByRole('status').getByText('Đang tải...', { exact: true }).waitFor({ state: 'visible' });
      if (!(await measuredPage.getByRole('button', { name: 'Làm mới', exact: true }).isDisabled())) {
        throw new Error('Monitor refresh must remain blocked behind the confirmed clean-profile loading overlay.');
      }
    }
    if (name === 'feedback') {
      await measuredPage.locator('.aux-feedback-empty').waitFor({ state: 'visible' });
      const visibleCopy = await measuredPage.locator('.aux-content').innerText();
      if (visibleCopy.trim() !== '') {
        throw new Error(`Unexpected clean-profile Feedback content: ${visibleCopy}`);
      }
    }
    if (name === 'setup') {
      await measuredPage.locator('.aux-setup-empty').waitFor({ state: 'visible' });
      const leftPaneWidth = await measuredPage.locator('.aux-setup-empty > span').first().evaluate((element) => element.getBoundingClientRect().width);
      if (Math.abs(leftPaneWidth - 156) > 1) {
        throw new Error(`Setup clean-profile left pane mismatch: ${leftPaneWidth}.`);
      }
    }
    if (name === 'payment') {
      await measuredPage.getByText('Quét mã WeChat / Alipay', { exact: true }).waitFor({ state: 'visible' });
      await measuredPage.locator('.aux-payment-qr[aria-label="Mã thanh toán chưa khả dụng trong Phase 1"]')
        .waitFor({ state: 'visible' });
    }
    if (name === 'user') {
      await measuredPage.getByRole('button', { name: 'Quay lại', exact: true }).waitFor({ state: 'visible' });
      const userDiagnostics = await measuredPage.evaluate(() => ({
        innerWidth: globalThis.innerWidth,
        innerHeight: globalThis.innerHeight,
        scrollWidth: globalThis.document.body.scrollWidth,
        scrollHeight: globalThis.document.body.scrollHeight,
        frameworkOverlayCount: globalThis.document.querySelectorAll('vite-error-overlay, #vite-plugin-checker-error-overlay').length,
      }));
      if (userDiagnostics.scrollWidth > userDiagnostics.innerWidth || userDiagnostics.scrollHeight > userDiagnostics.innerHeight) {
        throw new Error(`User clean-profile view overflowed: ${JSON.stringify(userDiagnostics)}.`);
      }
      if (userDiagnostics.frameworkOverlayCount !== 0) {
        throw new Error('User clean-profile view exposed a framework error overlay.');
      }
      await measuredPage.getByRole('button', { name: 'Quay lại', exact: true }).click();
      await measuredPage.getByRole('alert').getByText('Tải thất bại, vui lòng kiểm tra mạng', { exact: true })
        .waitFor({ state: 'visible' });
      await measuredPage.getByRole('button', { name: 'Làm mới', exact: true }).click();
      await measuredPage.getByRole('status').getByText('Đang tải...', { exact: true }).waitFor({ state: 'visible' });
      await measuredPage.getByRole('button', { name: 'Quay lại', exact: true }).waitFor({ state: 'visible' });
    }
  }

  await mainPage.evaluate(() => globalThis.window.desktopApi.app.openAuxiliaryWindow('about'));
  const aboutDeadline = Date.now() + 10_000;
  let aboutPage;
  while (!aboutPage && Date.now() < aboutDeadline) {
    aboutPage = context.pages().find((candidate) => candidate.url().includes('#/auxiliary/about'));
    if (!aboutPage) await delay(100);
  }
  if (!aboutPage) throw new Error('About auxiliary renderer was not created.');
  await aboutPage.getByText('Giới thiệu', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await aboutPage.getByRole('button', { name: 'Nhật ký', exact: true }).click();

  const logDeadline = Date.now() + 10_000;
  let logPage;
  while (!logPage && Date.now() < logDeadline) {
    logPage = context.pages().find((candidate) => candidate.url().includes('#/auxiliary/log'));
    if (!logPage) await delay(100);
  }
  if (!logPage) throw new Error('About did not open the log auxiliary window.');
  const logViewport = await logPage.evaluate(() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  if (Math.abs(logViewport.width - 800) > 1 || Math.abs(logViewport.height - 600) > 1) {
    throw new Error(`Log viewport mismatch: ${logViewport.width}x${logViewport.height}.`);
  }
  await logPage.getByText('Không có tệp nhật ký', { exact: true }).waitFor({ state: 'visible' });
  await logPage.getByRole('button', { name: 'Mở tệp', exact: true }).click();
  await logPage.getByRole('status').getByText('Chưa có tệp nhật ký local để mở.', { exact: true })
    .waitFor({ state: 'visible' });

  console.log('AUXILIARY_WINDOW_SMOKE_OK');
} catch (error) {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit'), delay(3_000)]);
  }
  await delay(500);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(smokeDataDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 9) {
        console.warn(`Temporary smoke profile cleanup is still pending: ${error instanceof Error ? error.message : error}`);
      } else {
        await delay(250);
      }
    }
  }
}
