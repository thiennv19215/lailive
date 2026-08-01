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
    await page.locator('.projects-page').getByRole('button', { name: 'Tạo dự án' }).click();
    const createDialog = page.locator('.page-dialog').filter({ hasText: 'Tạo dự án mới' });
    await createDialog.getByPlaceholder('Ví dụ: Mỹ phẩm buổi tối').fill(createdTitle);
    await createDialog.getByRole('button', { name: 'Tạo dự án' }).click();
    const createdCard = page.locator('.project-card-wrap').filter({ hasText: createdTitle });
    await createdCard.waitFor({ state: 'visible' });
    if (await createdCard.count() !== 1) throw new Error('Created project card was not unique.');

    await createdCard.getByRole('button', { name: `Đổi tên ${createdTitle}` }).click();
    const renameDialog = page.locator('.page-dialog').filter({ hasText: 'Đổi tên dự án' });
    await renameDialog.getByLabel('Tên dự án').fill(renamedTitle);
    await renameDialog.getByRole('button', { name: 'Lưu tên' }).click();
    const renamedCard = page.locator('.project-card-wrap').filter({ hasText: renamedTitle });
    await renamedCard.waitFor({ state: 'visible' });
    if (await renamedCard.count() !== 1) throw new Error('Renamed project card was not unique.');

    const downloadPromise = page.waitForEvent('download');
    await renamedCard.getByRole('button', { name: `Xuất ${renamedTitle}` }).click();
    await downloadPromise;
    await renamedCard.getByRole('button', { name: `Nhân bản ${renamedTitle}` }).click();
    const duplicateCard = page.locator('.project-card-wrap').filter({ hasText: duplicateTitle });
    await duplicateCard.waitFor({ state: 'visible' });
    if (await duplicateCard.count() !== 1) throw new Error('Duplicated project card was not unique.');
    await duplicateCard.getByRole('button', { name: `Xóa ${duplicateTitle}` }).click();
    const deleteDialog = page.locator('.page-dialog').filter({ hasText: duplicateTitle });
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
    const textLayers = page.locator('.source-panel li').filter({ hasText: 'text' });
    await textLayers.nth(0).click();
    await page.getByLabel('Nội dung văn bản').fill('AUTOSAVE PERSISTED');
    await page.locator('.source-panel li').filter({ hasText: /^1$/ }).first().click();
    const imageSettings = page.locator('.source-properties-panel').filter({ hasText: /hình ảnh/ });
    await imageSettings.locator('input[type="range"]').first().fill('24');
    await imageSettings.locator('input[type="checkbox"]').check();
    await imageSettings.locator('input[type="color"]').fill('#123456');
    await imageSettings.locator('input[type="range"]').nth(1).fill('47');
    await page.getByLabel('Khung hình scene').selectOption('landscape-1080p');
    await page.getByLabel('Chế độ vừa khung').selectOption('fill');
    await page.getByLabel('Chroma key', { exact: true }).check();
    await page.getByLabel('Màu chroma key', { exact: true }).fill('#22cc44');
    await page.getByLabel('Dung sai chroma key', { exact: true }).fill('61');
    await page.getByRole('button', { name: 'Khóa 1', exact: true }).click();

    await page.locator('.studio-tools button').filter({ hasText: /^Video$/ }).click();
    await page.locator('.asset-browser .wide-primary.compact').click();
    await page.getByRole('button', { name: 'Flower GIF' }).click();
    await page.locator('.studio-tools button').filter({ hasText: /^Avatar$/ }).click();
    await page.getByRole('button', { name: 'Cặp avatar idle / talking' }).click();

    await page.locator('.source-panel li').filter({ hasText: 'Chinese Beauty Sale 3' }).click();
    await page.locator('.avatar-script-panel button').click();
    const scriptDialog = page.locator('.script-editor-dialog');
    await scriptDialog.locator('.script-product-card input').fill('Serum smoke');
    await scriptDialog.locator('.script-product-card textarea').fill('Persisted product details');
    await scriptDialog.locator('.avatar-scripts-column textarea').fill('Persisted avatar script');
    await scriptDialog.locator('footer .save-button').click();

    await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
    const livestreamDialog = page.locator('.live-settings-dialog');
    await livestreamDialog.getByPlaceholder('VD: nguyenvana').fill('studio_smoke');
    await livestreamDialog.locator('.voice-select-control > button').click();
    await livestreamDialog.locator('.voice-menu button').filter({ hasText: 'Ngọc Lam' }).click();
    await livestreamDialog.getByRole('button', { name: /Quản lý danh mục/ }).click();
    const productDialog = page.locator('.product-catalog-dialog');
    await productDialog.getByRole('button', { name: 'Thêm sản phẩm' }).click();
    const productCard = productDialog.locator('.product-editor-card').first();
    await productCard.getByLabel('Tên').fill('Serum dưỡng ẩm M5');
    await productCard.getByLabel('Giá hiện tại').fill('299.000đ');
    await productCard.getByLabel('TikTok ID').fill('tt-m5');
    await productCard.getByLabel('Vị trí TikTok').fill('12');
    await productCard.getByLabel('Mô tả').fill('Thông tin sản phẩm đã xác minh');
    await productCard.getByLabel('Điểm bán hàng').fill('Dịu nhẹ\nDùng hằng ngày');
    await productDialog.getByPlaceholder('Nhập bình luận khách hàng').fill('serum duong am m5 còn hàng không');
    if (!(await productDialog.locator('.product-match-debug > b').innerText()).includes('1000')) throw new Error('Exact product matcher score was not visible.');
    const catalogDownloadPromise = page.waitForEvent('download');
    await productDialog.getByRole('button', { name: 'Xuất JSON' }).click();
    const catalogDownload = await catalogDownloadPromise;
    const catalogStream = await catalogDownload.createReadStream();
    const catalogChunks = [];
    for await (const chunk of catalogStream) catalogChunks.push(chunk);
    const catalogBuffer = Buffer.concat(catalogChunks);
    await productDialog.locator('input[type="file"]').setInputFiles({ name: 'products.json', mimeType: 'application/json', buffer: catalogBuffer });
    await productDialog.getByRole('button', { name: 'Lưu danh mục' }).click();
    const aiBlock = livestreamDialog.locator('.ai-config-block');
    await aiBlock.locator('.ai-prompt-grid textarea').first().fill('System prompt persisted');
    await aiBlock.locator('.ai-prompt-grid textarea').last().fill('Persona persisted');
    await aiBlock.locator('.ai-event-templates summary').click();
    await aiBlock.locator('.ai-event-templates textarea').first().fill('Reply to {{user}} about {{comment}}');
    await aiBlock.locator('.ai-runtime-grid input[type="range"]').fill('17000');
    await aiBlock.locator('.ai-runtime-grid select').selectOption('2');
    const ttsBlock = livestreamDialog.locator('.tts-config-block');
    await ttsBlock.locator('.tts-runtime-grid select').selectOption('Ngọc Lam');
    await ttsBlock.locator('.tts-runtime-grid input[type="range"]').nth(0).fill('1.3');
    await ttsBlock.locator('.tts-runtime-grid input[type="range"]').nth(1).fill('0.75');
    await ttsBlock.locator('.tts-runtime-grid input[type="range"]').nth(2).fill('90000');
    await livestreamDialog.locator('.sliders input[type="range"]').nth(0).fill('3.5');
    await livestreamDialog.locator('.sliders input[type="range"]').nth(1).fill('45');
    await livestreamDialog.locator('.sliders input[type="range"]').nth(2).fill('60');
    await livestreamDialog.locator('.sliders input[type="range"]').nth(3).fill('4');
    await livestreamDialog.getByPlaceholder('Ví dụ: M5, serum').fill('M5, serum');
    await livestreamDialog.getByPlaceholder('Phân tách bằng dấu phẩy').nth(0).fill('lừa đảo, link bio');
    await livestreamDialog.getByPlaceholder('Phân tách bằng dấu phẩy').nth(1).fill('giá chỉ 99k');
    await livestreamDialog.locator('.product-pin input[type="range"]').fill('90');
    await livestreamDialog.locator('.trigger-table > div').filter({ hasText: 'Thích' }).locator('.switch').click();
    await livestreamDialog.getByLabel(/Cách trả lời.*Bình luận/).selectOption('ai_speech');
    await livestreamDialog.locator('footer .save-button').click();

    const projectId = new URL(page.url()).hash.split('/').at(-1);
    const autosaveDeadline = Date.now() + 5_000;
    let persistedText = '';
    while (Date.now() < autosaveDeadline) {
      persistedText = await page.evaluate(async (id) => (await globalThis.window.desktopApi.projects.get(id))?.scene.textStyle.content ?? '', projectId);
      if (persistedText === 'AUTOSAVE PERSISTED') break;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
    if (persistedText !== 'AUTOSAVE PERSISTED') {
      const diagnostic = await page.evaluate(async (id) => ({
        scene: (await globalThis.window.desktopApi.projects.get(id))?.scene,
        saveErrors: globalThis.window.__projectSaveErrors,
        bodyText: globalThis.document.body.innerText.slice(-500),
      }), projectId);
      throw new Error(`Editor text was not autosaved through IPC: ${JSON.stringify(diagnostic)}`);
    }
    const settingsDeadline = Date.now() + 5_000;
    let settingsPersisted = false;
    while (Date.now() < settingsDeadline) {
      settingsPersisted = await page.evaluate(async (id) => {
        const scene = (await globalThis.window.desktopApi.projects.get(id))?.scene;
        return scene?.imageSettings.radius === 24
          && scene.imageSettings.backgroundColor === '#123456'
          && scene.canvasPreset === 'landscape-1080p'
          && scene.width === 1920
          && scene.height === 1080
          && scene.layers[0]?.fitMode === 'fill'
          && scene.layers[0]?.locked === true
          && scene.layers[0]?.chromaKey.enabled === true
          && scene.layers[0]?.chromaKey.color === '#22cc44'
          && scene.layers[0]?.chromaKey.tolerance === 61
          && scene.layers.some((layer) => layer.kind === 'video' && layer.source.type === 'builtin' && layer.source.assetId === 'flower-video')
          && scene.layers.some((layer) => layer.kind === 'gif' && layer.source.type === 'builtin' && layer.source.assetId === 'flower-gif')
          && scene.layers.some((layer) => layer.kind === 'avatar' && layer.avatarState === 'idle' && layer.source.type === 'builtin' && layer.source.assetId === 'template-host')
          && scene.layers.some((layer) => layer.kind === 'avatar' && layer.avatarState === 'talking' && layer.source.type === 'builtin' && layer.source.assetId === 'beauty-model')
          && scene.avatarSettings.scripts[0] === 'Persisted avatar script'
          && scene.livestreamSettings.tiktokUsername === 'studio_smoke'
          && scene.livestreamSettings.triggers.find((trigger) => trigger.event === 'like')?.enabled === true
          && scene.livestreamSettings.triggers.find((trigger) => trigger.event === 'chat')?.actionType === 'ai_speech'
          && scene.livestreamSettings.duplicateWindow === 60
          && scene.livestreamSettings.minimumCommentLength === 4
          && scene.livestreamSettings.allowKeywords.join(',') === 'M5,serum'
          && scene.livestreamSettings.blockKeywords.join(',') === 'lừa đảo,link bio'
          && scene.livestreamSettings.bannedOutputTerms.join(',') === 'giá chỉ 99k'
          && scene.aiSettings.systemPrompt === 'System prompt persisted'
          && scene.aiSettings.personaPrompt === 'Persona persisted'
          && scene.aiSettings.eventTemplates.chat === 'Reply to {{user}} about {{comment}}'
          && scene.aiSettings.timeoutMs === 17000
          && scene.aiSettings.retryCount === 2
          && scene.ttsSettings.voice === 'Ngọc Lam'
          && scene.ttsSettings.speed === 1.3
          && scene.ttsSettings.volume === 0.75
          && scene.ttsSettings.timeoutMs === 90000
          && scene.products[0]?.name === 'Serum dưỡng ẩm M5'
          && scene.products[0]?.price === '299.000đ'
          && scene.products[0]?.tiktokIndex === 12;
      }, projectId);
      if (settingsPersisted) break;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
    if (!settingsPersisted) throw new Error('Editor settings were not autosaved through IPC.');
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
    await page.waitForURL((url) => url.hash.startsWith('#/projects/'));
    const restoredProjects = await page.evaluate(async () => globalThis.window.desktopApi.projects.list());
    if (restoredProjects.filter((project) => project.title === renamedTitle).length !== 1) throw new Error('Renamed project did not survive Electron restart.');
    if (restoredProjects.some((project) => project.title === duplicateTitle)) throw new Error('Deleted duplicate returned after Electron restart.');
    if ((await page.locator('.studio-project-name').innerText()).trim() !== renamedTitle) {
      throw new Error('Last opened project was not restored into the editor.');
    }
    const textLayers = page.locator('.source-panel li').filter({ hasText: 'text' });
    await textLayers.nth(0).click();
    if (await page.getByLabel('Nội dung văn bản').inputValue() !== 'AUTOSAVE PERSISTED') {
      throw new Error('Autosaved scene text did not survive Electron restart.');
    }
    await page.locator('.source-panel li').filter({ hasText: /^1$/ }).first().click();
    if (await page.getByLabel('Khung hình scene').inputValue() !== 'landscape-1080p') throw new Error('Landscape canvas preset did not survive restart.');
    if (await page.getByLabel('Chế độ vừa khung').inputValue() !== 'fill') throw new Error('Layer fit mode did not survive restart.');
    if (!await page.getByLabel('Chroma key', { exact: true }).isChecked()) throw new Error('Layer chroma state did not survive restart.');
    if (await page.getByLabel('Màu chroma key', { exact: true }).inputValue() !== '#22cc44') throw new Error('Layer chroma color did not survive restart.');
    if (await page.getByLabel('Dung sai chroma key', { exact: true }).inputValue() !== '61') throw new Error('Layer chroma tolerance did not survive restart.');
    if (await page.getByRole('button', { name: 'Mở khóa 1', exact: true }).count() !== 1) throw new Error('Layer lock state did not survive restart.');
    const restoredScene = await page.evaluate(async () => {
      const projectId = new URL(globalThis.location.href).hash.split('/').at(-1);
      return (await globalThis.window.desktopApi.projects.get(projectId))?.scene;
    });
    if (!restoredScene?.layers.some((layer) => layer.kind === 'video' && layer.source.type === 'builtin' && layer.source.assetId === 'flower-video')) throw new Error('Built-in video source did not survive restart.');
    if (!restoredScene?.layers.some((layer) => layer.kind === 'gif' && layer.source.type === 'builtin' && layer.source.assetId === 'flower-gif')) throw new Error('Built-in GIF source did not survive restart.');
    if (!restoredScene?.layers.some((layer) => layer.kind === 'avatar' && layer.avatarState === 'talking' && layer.source.type === 'builtin' && layer.source.assetId === 'beauty-model')) throw new Error('Talking avatar source did not survive restart.');
    const restoredImageSettings = page.locator('.source-properties-panel').filter({ hasText: /hình ảnh/ });
    if (await restoredImageSettings.locator('input[type="range"]').first().inputValue() !== '24') throw new Error('Image radius did not survive restart.');
    if (!await restoredImageSettings.locator('input[type="checkbox"]').isChecked()) throw new Error('Image background removal did not survive restart.');
    await page.locator('.source-panel li').filter({ hasText: 'Chinese Beauty Sale 3' }).click();
    await page.locator('.avatar-script-panel button').click();
    if (await page.locator('.avatar-scripts-column textarea').inputValue() !== 'Persisted avatar script') throw new Error('Avatar script did not survive restart.');
    await page.locator('.script-editor-dialog footer .save-button').click();
    await page.getByRole('button', { name: 'Cài đặt livestream', exact: true }).click();
    const restoredLivestream = page.locator('.live-settings-dialog');
    if (await restoredLivestream.getByPlaceholder('VD: nguyenvana').inputValue() !== 'studio_smoke') throw new Error('TikTok username did not survive restart.');
    if (!(await restoredLivestream.locator('.trigger-table > div').filter({ hasText: 'Thích' }).locator('.switch').getAttribute('class'))?.includes('on')) throw new Error('Trigger state did not survive restart.');
    await restoredLivestream.locator('footer .save-button').click();
    const missingBanner = page.locator('.missing-media-banner');
    await missingBanner.waitFor({ state: 'visible' });
    const missingBannerText = await missingBanner.innerText();
    if (!missingBannerText.includes('1 tệp media')) {
      const mediaDebug = await page.evaluate(async () => {
        const projectId = new URL(globalThis.location.href).hash.split('/').at(-1);
        const references = (await globalThis.window.desktopApi.projects.get(projectId))?.scene.mediaReferences ?? [];
        return { references, statuses: await globalThis.window.desktopApi.media.check(references) };
      });
      throw new Error(`Missing media count was not detected: ${missingBannerText}; parentExists=${fs.existsSync(presentMediaPath)}; ${JSON.stringify(mediaDebug)}`);
    }
    if (await missingBanner.getByText('Present avatar').count() !== 0) throw new Error('Present media was incorrectly reported missing.');
    if (await missingBanner.getByRole('button', { name: /Missing avatar/ }).count() !== 1) throw new Error('Missing media repair action was not available.');
    await page.screenshot({ path: path.join(artifactDirectory, 'after-restart-open.png'), type: 'png' });
  });

  await withRenderer(9236, async (page) => {
    await page.waitForLoadState('domcontentloaded', { timeout: 45_000 });
    await page.locator('.projects-page').getByRole('button', { name: 'Tạo dự án' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'project.ailive.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportedProject),
    });
    const importedTitle = `${renamedTitle} (nhập)`;
    const importedCard = page.locator('.project-card-wrap').filter({ hasText: importedTitle });
    await importedCard.waitFor({ state: 'visible' });
    if (await importedCard.count() !== 1) throw new Error('Imported project was not unique in a clean profile.');
    await importedCard.locator('.project-button').click();
    await page.waitForURL((url) => url.hash.startsWith('#/projects/'));
    if (!await page.locator('.missing-media-banner').isVisible()) throw new Error('Imported broken media path was not visible.');
    const importedProjectId = new URL(page.url()).hash.split('/').at(-1);
    const importedScene = await page.evaluate(async (id) => (await globalThis.window.desktopApi.projects.get(id))?.scene, importedProjectId);
    if (importedScene?.avatarSettings.scripts[0] !== 'Persisted avatar script') throw new Error('Avatar settings did not survive export/import.');
    if (importedScene?.livestreamSettings.tiktokUsername !== 'studio_smoke') throw new Error('Livestream settings did not survive export/import.');
    if (importedScene?.livestreamSettings.triggers.find((trigger) => trigger.event === 'chat')?.actionType !== 'ai_speech') throw new Error('Trigger action did not survive export/import.');
    if (importedScene?.livestreamSettings.blockKeywords.join(',') !== 'lừa đảo,link bio') throw new Error('Moderation keywords did not survive export/import.');
    if (importedScene?.aiSettings.systemPrompt !== 'System prompt persisted' || importedScene.aiSettings.timeoutMs !== 17000 || importedScene.aiSettings.retryCount !== 2) throw new Error('AI reply settings did not survive export/import.');
    if (importedScene?.ttsSettings.voice !== 'Ngọc Lam' || importedScene.ttsSettings.speed !== 1.3 || importedScene.ttsSettings.timeoutMs !== 90000) throw new Error('TTS settings did not survive export/import.');
    if (importedScene?.canvasPreset !== 'landscape-1080p' || importedScene.width !== 1920 || importedScene.height !== 1080) throw new Error('Canvas preset did not survive export/import.');
    if (importedScene?.layers[0]?.fitMode !== 'fill' || importedScene.layers[0].chromaKey.tolerance !== 61 || !importedScene.layers[0].locked) throw new Error('Layer render metadata did not survive export/import.');
    if (!importedScene?.layers.some((layer) => layer.kind === 'video' && layer.source.type === 'builtin' && layer.source.assetId === 'flower-video')) throw new Error('Built-in video source did not survive export/import.');
    if (!importedScene?.layers.some((layer) => layer.kind === 'gif' && layer.source.type === 'builtin' && layer.source.assetId === 'flower-gif')) throw new Error('Built-in GIF source did not survive export/import.');
    if (!importedScene?.layers.some((layer) => layer.kind === 'avatar' && layer.avatarState === 'idle' && layer.source.type === 'builtin' && layer.source.assetId === 'template-host')) throw new Error('Idle avatar source did not survive export/import.');
    if (!importedScene?.layers.some((layer) => layer.kind === 'avatar' && layer.avatarState === 'talking' && layer.source.type === 'builtin' && layer.source.assetId === 'beauty-model')) throw new Error('Talking avatar source did not survive export/import.');
    if (importedScene?.products[0]?.name !== 'Serum dưỡng ẩm M5' || importedScene.products[0]?.price !== '299.000đ') throw new Error('Product catalog did not survive export/import.');
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
