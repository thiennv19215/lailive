import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';
import initSqlJs from 'sql.js/dist/sql-asm.js';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-settings-persistence-'));
const recoveryProfileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-settings-recovery-'));
const artifactDirectory = path.resolve('artifacts/rebuild/settings-persistence');
fs.mkdirSync(artifactDirectory, { recursive: true });

async function waitForCdp(port) {
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
  throw new Error(`Settings persistence CDP ${port} did not start.`);
}

async function withRenderer(port, dataDirectory, callback) {
  const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_LIVESTREAM_SMOKE_DATA_DIR: dataDirectory,
      AI_LIVESTREAM_CAPTURE_VIEWPORT: '1240x669',
      VITE_DEV_SERVER_URL: devServerUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk.toString(); });
  let browser;
  try {
    await waitForCdp(port);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
    if (!page) throw new Error('Settings persistence renderer was not found.');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(750);
    await page.evaluate(() => { globalThis.location.hash = '/settings'; });
    await page.locator('.settings-page').waitFor({ state: 'visible' });
    const overlay = page.locator('vite-error-overlay');
    if (await overlay.count()) {
      const detail = await overlay.evaluate((element) => element.shadowRoot?.textContent ?? 'Unknown Vite overlay error');
      throw new Error(`Settings persistence Vite overlay: ${detail}`);
    }
    await callback(page);
  } catch (error) {
    if (output) console.error(output);
    throw error;
  } finally {
    await browser?.close();
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolve) => globalThis.setTimeout(resolve, 3_000))]);
    }
  }
}

async function seedInvalidGlobalSettings(dataDirectory) {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  database.run('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  database.run('CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)');
  database.run('CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, poster_preset TEXT NOT NULL, scene_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_at TEXT)');
  database.run('CREATE INDEX projects_updated_at_index ON projects(updated_at DESC)');
  const timestamp = new Date().toISOString();
  database.run('INSERT INTO schema_migrations VALUES (1, ?), (2, ?), (3, ?)', [timestamp, timestamp, timestamp]);
  database.run('INSERT INTO settings VALUES (?, ?, ?)', [
    'app.global-settings',
    JSON.stringify({ schemaVersion: 999, cookieJson: 'must-not-survive' }),
    timestamp,
  ]);
  fs.writeFileSync(path.join(dataDirectory, 'ai-livestream.db'), Buffer.from(database.export()));
  database.close();
}

try {
  await withRenderer(9241, profileDirectory, async (page) => {
    const boundaryGuarded = await page.evaluate(async () => {
      let genericRejected = false;
      let typedRejected = false;
      try { await globalThis.window.desktopApi.settings.set('app.global-settings', {}); } catch { genericRejected = true; }
      try { await globalThis.window.desktopApi.settings.setGlobal({ schemaVersion: 999 }); } catch { typedRejected = true; }
      return genericRejected && typedRejected;
    });
    if (!boundaryGuarded) throw new Error('Global settings IPC boundary accepted an invalid or generic write.');
    await page.getByRole('button', { name: /Thêm cookie Grok/ }).click();
    await page.getByLabel('Nhãn Cookie').fill('Grok smoke metadata');
    await page.getByLabel('Giá Trị Cookie').fill('{"demo":"discard-me"}');
    await page.getByRole('button', { name: 'Lưu cấu hình' }).click();
    await page.getByText('Grok smoke metadata').waitFor({ state: 'visible' });

    await page.getByRole('button', { name: /Veo3/ }).click();
    const veoRow = page.locator('.cookie-table > div').filter({ hasText: 'Veo3 local demo' });
    await veoRow.getByRole('button', { name: 'Vô Hiệu Hóa' }).click();
    await veoRow.getByText('Đã tắt').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifactDirectory, 'saved-settings.png'), type: 'png' });
  });

  await withRenderer(9242, profileDirectory, async (page) => {
    const activeTab = page.locator('.settings-tabs button.active');
    await activeTab.getByText(/Veo3/).waitFor({ state: 'visible' });
    const veoRow = page.locator('.cookie-table > div').filter({ hasText: 'Veo3 local demo' });
    if (!await veoRow.getByText('Đã tắt').isVisible()) throw new Error('Veo account state did not survive restart.');

    await page.getByRole('button', { name: /Grok/ }).click();
    await page.getByText('Grok smoke metadata').waitFor({ state: 'visible' });
    const stored = await page.evaluate(async () => globalThis.window.desktopApi.settings.getGlobal());
    const serialized = JSON.stringify(stored?.value);
    if (serialized.includes('discard-me') || serialized.toLowerCase().includes('cookiejson')) {
      throw new Error('Disposable cookie JSON leaked into persisted global settings.');
    }
    await page.screenshot({ path: path.join(artifactDirectory, 'after-restart.png'), type: 'png' });
  });

  await seedInvalidGlobalSettings(recoveryProfileDirectory);
  await withRenderer(9243, recoveryProfileDirectory, async (page) => {
    const recovery = page.getByRole('alert');
    await recovery.waitFor({ state: 'visible' });
    await recovery.getByRole('button', { name: 'Khôi phục mặc định' }).click();
    const stored = await page.evaluate(async () => globalThis.window.desktopApi.settings.getGlobal());
    if (JSON.stringify(stored?.value).includes('must-not-survive')) throw new Error('Invalid settings payload survived recovery.');
    if (stored?.value?.schemaVersion !== 1) throw new Error('Settings recovery did not restore schema version 1.');
    await page.screenshot({ path: path.join(artifactDirectory, 'recovered-defaults.png'), type: 'png' });
  });

  console.log('SETTINGS_PERSISTENCE_SMOKE_OK');
} finally {
  for (const directory of [profileDirectory, recoveryProfileDirectory]) for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 9) console.warn(`Temporary settings profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
