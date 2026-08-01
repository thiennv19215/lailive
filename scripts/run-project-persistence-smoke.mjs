import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-project-persistence-'));
const importProfileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-project-import-'));
const mediaDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-project-media-'));
const artifactDirectory = path.resolve('artifacts/rebuild/project-persistence');
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
  throw new Error(`Project persistence CDP ${port} did not start.`);
}

async function withRenderer(port, callback, dataDirectory = profileDirectory) {
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
    let page;
    const rendererDeadline = Date.now() + 20_000;
    while (!page && Date.now() < rendererDeadline) {
      page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
      if (!page) await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
    }
    if (!page) throw new Error('Project persistence renderer was not found.');
    const errors = [];
    page.on('console', (message) => {
      const text = message.text();
      if ((message.type() === 'error' || message.type() === 'warning') && !text.includes('Electron Security Warning')) errors.push(text);
    });
    await page.waitForTimeout(250);
    const overlay = page.locator('vite-error-overlay');
    if (await overlay.count()) {
      const detail = await overlay.evaluate((element) => element.shadowRoot?.textContent ?? 'Unknown Vite overlay error');
      throw new Error(`Project persistence Vite overlay: ${detail}`);
    }
    await callback(page);
    if (errors.length > 0) throw new Error(`Project persistence console errors: ${errors.join(' | ')}`);
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

const createdTitle = 'Studio persistence smoke';
const renamedTitle = 'Studio persistence verified';
const duplicateTitle = `${renamedTitle} (bản sao)`;
let exportedProject = '';
const presentMediaPath = path.join(mediaDirectory, 'present-avatar.mp4');
const missingMediaPath = path.join(mediaDirectory, 'missing-avatar.mp4');
fs.writeFileSync(presentMediaPath, 'media fixture');

try {
  await withRenderer(9234, async (page) => {
    await page.waitForLoadState('domcontentloaded', { timeout: 45_000 });
    await page.locator('.projects-page .create-project-card').click();
    const createDialog = page.locator('.page-dialog').last();
    await createDialog.getByPlaceholder('Ví dụ: Mỹ phẩm buổi tối').fill(createdTitle);
    await createDialog.getByRole('button', { name: 'Tạo dự án' }).click();
    const createdCard = page.locator('.project-card-wrap').filter({ hasText: createdTitle });
    await createdCard.waitFor({ state: 'visible' });
    if (await createdCard.count() !== 1) throw new Error('Created project card was not unique.');

    await createdCard.locator('.project-menu-trigger').click();
    await createdCard.getByRole('menuitem', { name: 'Đổi tên' }).click();
    const renameDialog = page.locator('.page-dialog').last();
    await renameDialog.getByLabel('Tên dự án').fill(renamedTitle);
    await renameDialog.getByRole('button', { name: 'Lưu tên' }).click();
    const renamedCard = page.locator('.project-card-wrap').filter({ hasText: renamedTitle });
    await renamedCard.waitFor({ state: 'visible' });
    if (await renamedCard.count() !== 1) throw new Error('Renamed project card was not unique.');

    const downloadPromise = page.waitForEvent('download');
    await renamedCard.locator('.project-menu-trigger').click();
    await renamedCard.getByRole('menuitem', { name: 'Xuất dự án' }).click();
    await downloadPromise;
    await renamedCard.locator('.project-menu-trigger').click();
    await renamedCard.getByRole('menuitem', { name: 'Nhân bản' }).click();
    const duplicateCard = page.locator('.project-card-wrap').filter({ hasText: duplicateTitle });
    await duplicateCard.waitFor({ state: 'visible' });
    if (await duplicateCard.count() !== 1) throw new Error('Duplicated project card was not unique.');
    await duplicateCard.locator('.project-menu-trigger').click();
    await duplicateCard.getByRole('menuitem', { name: 'Xóa' }).click();
    const deleteDialog = page.locator('.page-dialog.danger-dialog');
    await deleteDialog.getByRole('button', { name: 'Xóa dự án' }).click();
    if (await page.locator('.project-card-wrap').filter({ hasText: duplicateTitle }).count() !== 0) {
      throw new Error('Deleted duplicate remained visible.');
    }
    await renamedCard.locator('.project-button').click();
    await page.waitForURL((url) => url.hash.startsWith('#/projects/'));
    await page.evaluate(() => {
      const original = globalThis.window.desktopApi.projects.saveScene.bind(globalThis.window.desktopApi.projects);
      globalThis.window.__projectSaveErrors = [];
      globalThis.window.desktopApi.projects.saveScene = async (id, scene) => {
        try {
          return await original(id, scene);
        } catch (error) {
          globalThis.window.__projectSaveErrors.push({ message: error instanceof Error ? error.message : String(error), scene });
          throw error;
        }
      };
    });
    await page.locator('.add-source.text').click();
    await page.waitForTimeout(400);
    const projectId = new URL(page.url()).hash.split('/').at(-1);
    await page.evaluate(async (id) => {
      const project = await globalThis.window.desktopApi.projects.get(id);
      if (!project) throw new Error('Persistence smoke project was not found.');
      const textLayer = project.scene.layers.at(-1);
      if (!textLayer) throw new Error('Text source was not created.');
      const savedScene = {
        ...project.scene,
        layers: project.scene.layers.map((layer) => layer.id === textLayer.id ? { ...layer, name: 'AUTOSAVE PERSISTED' } : layer),
      };
      await globalThis.window.desktopApi.projects.saveScene(project.id, savedScene);
    }, projectId);
    const autosaveDeadline = Date.now() + 5_000;
    let persistedText = '';
    while (Date.now() < autosaveDeadline) {
      persistedText = await page.evaluate(async (id) => {
        const scene = (await globalThis.window.desktopApi.projects.get(id))?.scene;
        return scene?.layers.find((layer) => layer.name === 'AUTOSAVE PERSISTED')?.name ?? '';
      }, projectId);
      if (persistedText === 'AUTOSAVE PERSISTED') break;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
    if (persistedText !== 'AUTOSAVE PERSISTED') throw new Error('Current Studio text source was not autosaved through IPC.');

    exportedProject = await page.evaluate(async ({ id, title, presentPath, missingPath }) => {
      const project = await globalThis.window.desktopApi.projects.get(id);
      if (!project) throw new Error('Project to export was not found.');
      const saved = await globalThis.window.desktopApi.projects.saveScene(id, {
        ...project.scene,
        mediaReferences: [
          { id: 'media-present', label: 'Present avatar', kind: 'video', path: presentPath },
          { id: 'media-missing', label: 'Missing avatar', kind: 'video', path: missingPath },
        ],
      });
      if (saved.title !== title) throw new Error('Saved project title changed unexpectedly.');
      return globalThis.window.desktopApi.projects.export(id);
    }, { id: projectId, title: renamedTitle, presentPath: presentMediaPath, missingPath: missingMediaPath });
    await page.screenshot({ path: path.join(artifactDirectory, 'after-crud.png'), type: 'png' });
  });

  await withRenderer(9235, async (page) => {
    await page.waitForLoadState('domcontentloaded', { timeout: 45_000 });
    const restoredProjects = await page.evaluate(async () => globalThis.window.desktopApi.projects.list());
    if (restoredProjects.filter((project) => project.title === renamedTitle).length !== 1) throw new Error('Renamed project did not survive Electron restart.');
    if (restoredProjects.some((project) => project.title === duplicateTitle)) throw new Error('Deleted duplicate returned after Electron restart.');
    const restoredCard = page.locator('.project-card-wrap').filter({ hasText: renamedTitle });
    await restoredCard.waitFor({ state: 'visible' });
    await restoredCard.locator('.project-button').click();
    await page.waitForURL((url) => url.hash.startsWith('#/projects/'));
    const restoredProjectId = new URL(page.url()).hash.split('/').at(-1);
    const restoredScene = await page.evaluate(async (id) => (await globalThis.window.desktopApi.projects.get(id))?.scene, restoredProjectId);
    if (!restoredScene?.layers.some((layer) => layer.name === 'AUTOSAVE PERSISTED')) throw new Error('Autosaved Studio text did not survive Electron restart.');
    if (restoredScene.mediaReferences.length !== 2) throw new Error('Project media references did not survive Electron restart.');
    await page.screenshot({ path: path.join(artifactDirectory, 'after-restart-open.png'), type: 'png' });
  });

  await withRenderer(9236, async (page) => {
    await page.waitForLoadState('domcontentloaded', { timeout: 45_000 });
    await page.locator('.projects-page .create-project-card').click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'project.ailive.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportedProject),
    });
    const importedCard = page.locator('.project-card-wrap').filter({ hasText: renamedTitle });
    await importedCard.waitFor({ state: 'visible' });
    if (await importedCard.count() !== 1) throw new Error('Imported project was not unique in a clean profile.');
    await importedCard.locator('.project-button').click();
    await page.waitForURL((url) => url.hash.startsWith('#/projects/'));
    const importedProjectId = new URL(page.url()).hash.split('/').at(-1);
    const importedScene = await page.evaluate(async (id) => (await globalThis.window.desktopApi.projects.get(id))?.scene, importedProjectId);
    if (!importedScene?.layers.some((layer) => layer.name === 'AUTOSAVE PERSISTED')) throw new Error('Studio text source did not survive export/import.');
    if (importedScene.mediaReferences.length !== 2) throw new Error('Project media references did not survive export/import.');
    await page.screenshot({ path: path.join(artifactDirectory, 'clean-profile-import.png'), type: 'png' });
  }, importProfileDirectory);

  console.log('PROJECT_PERSISTENCE_SMOKE_OK');
} finally {
  for (const directory of [profileDirectory, importProfileDirectory, mediaDirectory]) for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 9) console.warn(`Temporary project profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
      else await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
  }
}
