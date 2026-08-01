import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-recovery-'));
const databasePath = path.join(profileDirectory, 'ai-livestream.db');
const temporaryDatabasePath = `${databasePath}.tmp`;
const port = 9257;
const marker = `recovery-${Date.now()}`;

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
  throw new Error('Interrupted recovery smoke CDP endpoint did not start.');
}

async function launch() {
  const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk.toString(); });
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  const rendererDeadline = Date.now() + 15_000;
  while (!page && Date.now() < rendererDeadline) {
    page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
    if (!page) await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  if (!page) throw new Error(`Interrupted recovery smoke renderer was not found.${output}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(globalThis.window.desktopApi?.diagnostics));
  return { child, browser, page, getOutput: () => output };
}

async function quit(instance) {
  await instance.page.evaluate(() => globalThis.window.desktopApi.app.respondToClose({ action: 'quit', remember: false })).catch(() => undefined);
  await Promise.race([
    once(instance.child, 'exit'),
    new Promise((resolve) => globalThis.setTimeout(resolve, 5_000)),
  ]);
  await instance.browser.close().catch(() => undefined);
  if (instance.child.exitCode === null) instance.child.kill();
}

let first;
let second;
try {
  first = await launch();
  await first.page.evaluate(async (value) => {
    await globalThis.window.desktopApi.settings.set('smoke.interrupted-recovery', value);
  }, marker);
  await quit(first);
  first = null;

  fs.copyFileSync(databasePath, temporaryDatabasePath);
  fs.writeFileSync(databasePath, 'interrupted-invalid-primary', 'utf8');
  const now = Date.now() / 1000;
  fs.utimesSync(databasePath, now - 2, now - 2);
  fs.utimesSync(temporaryDatabasePath, now, now);

  second = await launch();
  const result = await second.page.evaluate(async () => ({
    marker: await globalThis.window.desktopApi.settings.get('smoke.interrupted-recovery'),
    snapshot: await globalThis.window.desktopApi.diagnostics.getSnapshot(),
    logs: await globalThis.window.desktopApi.diagnostics.listLogs({ sources: ['database'], limit: 100 }),
  }));
  if (result.marker?.value !== marker) throw new Error(`Recovered marker did not match: ${JSON.stringify(result.marker)}`);
  const recoveryLog = result.logs.find((entry) => entry.message === 'Local database recovery completed.');
  if (!recoveryLog || recoveryLog.details?.source !== 'temporary' || recoveryLog.details?.recovered !== true) {
    throw new Error(`Database recovery diagnostic was missing: ${JSON.stringify(result.logs)}`);
  }
  if (!result.snapshot.recoveryNotices.some((notice) => notice.kind === 'database-recovered' && notice.detail?.source === 'temporary')) {
    throw new Error(`Database recovery notice was missing: ${JSON.stringify(result.snapshot.recoveryNotices)}`);
  }
  if (!fs.readdirSync(profileDirectory).some((entry) => entry.startsWith('ai-livestream.db.invalid-'))) {
    throw new Error('Corrupt primary database was not quarantined.');
  }
  if (/renderer (?:error|warning):|renderer pageerror:/i.test(second.getOutput())) {
    throw new Error(`Interrupted recovery renderer output was not clean:${second.getOutput()}`);
  }
  console.log('INTERRUPTED_RECOVERY_SMOKE_OK marker=restored source=temporary quarantine=pass diagnostics=pass');
} catch (error) {
  if (first?.getOutput()) console.error(first.getOutput());
  if (second?.getOutput()) console.error(second.getOutput());
  throw error;
} finally {
  if (first) await quit(first);
  if (second) await quit(second);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 9) console.warn(`Temporary recovery profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
