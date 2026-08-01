import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import electronPath from 'electron';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';
const artifactDirectory = path.resolve('artifacts/rebuild/text-inspector');
fs.mkdirSync(artifactDirectory, { recursive: true });

async function waitForCdp(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return;
    } catch {
      // The isolated Electron renderer is still starting.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
  }
  throw new Error(`Text inspector smoke CDP ${port} did not start.`);
}

async function runViewport(name, viewport, port) {
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `ai-livestream-text-${name}-`));
  const child = spawn(electronPath, ['.', '--ui-capture', `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_LIVESTREAM_SMOKE_DATA_DIR: profileDirectory,
      AI_LIVESTREAM_CAPTURE_VIEWPORT: viewport,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childOutput = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { childOutput += chunk.toString(); });
  }

  let browser;
  try {
    await waitForCdp(port);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = browser.contexts()[0]?.pages().find((candidate) => candidate.url().startsWith(devServerUrl));
    if (!page) throw new Error(`Text inspector renderer was not found for ${name}.`);
    const errors = [];
    page.on('console', (message) => {
      const text = message.text();
      if ((message.type() === 'error' || message.type() === 'warning') && !text.includes('Electron Security Warning')) {
        errors.push(text);
      }
    });

    await page.goto(`${devServerUrl}#/projects/perfume`, { waitUntil: 'domcontentloaded' });
    const textLayers = page.locator('.source-panel li').filter({ hasText: 'text' });
    const textLayerCount = await textLayers.count();
    if (textLayerCount < 1) throw new Error('No text source was available for inspector QA.');
    if (name === 'reference-desktop') {
      const imageLayers = page.locator('.source-panel li').filter({ hasText: '1' });
      if (await imageLayers.count() < 1) throw new Error('No image source was available for selected-state capture.');
      await imageLayers.nth(0).click();
      await page.screenshot({ path: path.join(artifactDirectory, 'selected-image-reference-desktop.png'), type: 'png' });
      const avatarLayer = page.locator('.source-panel li').filter({ hasText: 'Chinese Beauty Sale 3' });
      if (await avatarLayer.count() !== 1) throw new Error('Avatar source was not unique for selected-state capture.');
      await avatarLayer.click();
      await page.screenshot({ path: path.join(artifactDirectory, 'selected-avatar-reference-desktop.png'), type: 'png' });
    }
    await textLayers.nth(0).click();
    await page.screenshot({ path: path.join(artifactDirectory, `selected-${name}.png`), type: 'png' });

    const selectedLayerId = await page.locator('.source-panel li.active').getAttribute('data-layer-id');
    const selectedIndexBefore = await page.locator('.source-panel li').evaluateAll((elements, layerId) => (
      elements.findIndex((element) => element.getAttribute('data-layer-id') === layerId)
    ), selectedLayerId);
    await page.getByRole('button', { name: 'Đưa lên một lớp' }).click();
    const selectedIndexAfter = await page.locator('.source-panel li').evaluateAll((elements, layerId) => (
      elements.findIndex((element) => element.getAttribute('data-layer-id') === layerId)
    ), selectedLayerId);
    if (selectedIndexAfter !== Math.max(0, selectedIndexBefore - 1)) {
      throw new Error(`Layer order action did not move the selected source: ${selectedIndexBefore} -> ${selectedIndexAfter}`);
    }

    const selection = page.locator('.scene-selection');
    if (await page.locator('.scene-resize-handle').count() !== 8) {
      throw new Error('Selected scene layer does not expose eight resize handles.');
    }
    const initialTransform = await selection.getAttribute('style');
    const selectionBox = await selection.boundingBox();
    if (!selectionBox) throw new Error('Selected scene layer has no measurable box.');
    await page.mouse.move(selectionBox.x + selectionBox.width / 2, selectionBox.y + selectionBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(selectionBox.x + selectionBox.width / 2 + 18, selectionBox.y + selectionBox.height / 2 + 12);
    await page.mouse.up();
    const movedTransform = await selection.getAttribute('style');
    if (movedTransform === initialTransform) throw new Error('Dragging the selected layer did not update its transform.');

    const resizeHandle = page.locator('.scene-resize-handle--se');
    const resizeBox = await resizeHandle.boundingBox();
    if (!resizeBox) throw new Error('Resize handle has no measurable box.');
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 16, resizeBox.y + resizeBox.height / 2 + 10);
    await page.mouse.up();
    const resizedTransform = await selection.getAttribute('style');
    if (resizedTransform === movedTransform) throw new Error('Resize handle did not update the selected layer.');

    if (name === 'desktop') {
      const rotatedSelectionBox = await selection.boundingBox();
      const rotateHandle = page.locator('.scene-rotate-handle');
      const rotateBox = await rotateHandle.boundingBox();
      if (!rotatedSelectionBox || !rotateBox) throw new Error('Rotation control has no measurable geometry.');
      await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(rotatedSelectionBox.x + rotatedSelectionBox.width + 35, rotatedSelectionBox.y + rotatedSelectionBox.height / 2);
      await page.mouse.up();
      const rotatedTransform = await selection.getAttribute('style');
      if (rotatedTransform === resizedTransform) throw new Error('Rotation control did not update the selected layer.');
    }

    const editor = page.getByLabel('Nội dung văn bản');
    const initialText = await editor.inputValue();
    await editor.fill('ƯU ĐÃI HÔM NAY');
    await editor.press('Tab');
    const undoButton = page.getByRole('button', { name: 'Hoàn tác lớp' });
    const redoButton = page.getByRole('button', { name: 'Làm lại lớp' });
    await undoButton.click();
    if (await editor.inputValue() !== initialText) throw new Error('Text undo did not restore the prior inspector content.');
    await redoButton.click();
    if (await editor.inputValue() !== 'ƯU ĐÃI HÔM NAY') throw new Error('Text redo did not restore the edited inspector content.');
    await page.getByRole('button', { name: 'Căn trái' }).click();
    await page.getByRole('button', { name: 'Chữ đậm' }).click();
    await page.getByRole('button', { name: 'Chữ nghiêng' }).click();

    const preview = page.locator('.scene-copy > strong');
    const editedState = await preview.evaluate((element) => {
      const style = globalThis.getComputedStyle(element);
      return {
        text: element.textContent,
        align: style.textAlign,
        weight: style.fontWeight,
        fontStyle: style.fontStyle,
      };
    });
    if (editedState.text !== 'ƯU ĐÃI HÔM NAY' || editedState.align !== 'left' || editedState.fontStyle !== 'italic') {
      throw new Error(`Text controls did not update the preview: ${JSON.stringify(editedState)}`);
    }
    if (!['400', 'normal'].includes(editedState.weight)) {
      throw new Error(`Bold toggle did not update preview weight: ${editedState.weight}`);
    }

    await page.getByRole('button', { name: 'Kiểu chữ 6' }).click();
    const presetState = await preview.evaluate((element) => {
      const style = globalThis.getComputedStyle(element);
      return { text: element.textContent, align: style.textAlign, fontStyle: style.fontStyle };
    });
    if (presetState.text !== 'ƯU ĐÃI HÔM NAY' || presetState.align !== 'center' || presetState.fontStyle !== 'italic') {
      throw new Error(`Preset did not preserve content and apply style: ${JSON.stringify(presetState)}`);
    }
    await page.screenshot({ path: path.join(artifactDirectory, `${name}.png`), type: 'png' });

    if (name === 'desktop') {
      const imageLayers = page.locator('.source-panel li').filter({ hasText: '1' });
      const imageLayerCount = await imageLayers.count();
      if (imageLayerCount < 1) throw new Error('No image layer was available for inspector history QA.');
      await imageLayers.nth(0).click();
      const imageRanges = page.locator('.source-properties-panel input[type="range"]');
      const imageRangeCount = await imageRanges.count();
      if (imageRangeCount !== 2) throw new Error(`Unexpected image range control count: ${imageRangeCount}`);
      const radiusInput = imageRanges.nth(0);
      const initialRadius = await radiusInput.inputValue();
      await radiusInput.fill('24');
      await radiusInput.press('Tab');
      await undoButton.click();
      if (await radiusInput.inputValue() !== initialRadius) throw new Error('Image radius undo did not restore the prior value.');
      await redoButton.click();
      if (await radiusInput.inputValue() !== '24') throw new Error('Image radius redo did not restore the edited value.');

      const avatarLayer = page.locator('.source-panel li').filter({ hasText: 'Chinese Beauty Sale 3' });
      if (await avatarLayer.count() !== 1) throw new Error('Avatar source was not unique for inspector history QA.');
      await avatarLayer.click();
      const editScripts = page.locator('.avatar-script-panel').getByRole('button', { name: '✎ Chỉnh sửa' });
      await editScripts.click();
      const scriptInput = page.locator('.avatar-script-row textarea');
      if (await scriptInput.count() !== 1) throw new Error('Avatar script draft was not unique.');
      const initialScript = await scriptInput.inputValue();
      await scriptInput.fill('Bản nháp phải bị hủy.');
      await page.locator('.script-editor-dialog footer').getByRole('button', { name: 'Hủy' }).click();
      await editScripts.click();
      if (await scriptInput.inputValue() !== initialScript) throw new Error('Avatar dialog cancel leaked draft changes.');
      await scriptInput.fill('Kịch bản đã lưu để kiểm tra undo.');
      await page.locator('.script-editor-dialog footer').getByRole('button', { name: 'Lưu' }).click();
      await undoButton.click();
      await editScripts.click();
      if (await scriptInput.inputValue() !== initialScript) throw new Error('Avatar inspector undo did not restore the prior script.');
      await page.locator('.script-editor-dialog footer').getByRole('button', { name: 'Hủy' }).click();
      await redoButton.click();
      await editScripts.click();
      if (await scriptInput.inputValue() !== 'Kịch bản đã lưu để kiểm tra undo.') throw new Error('Avatar inspector redo did not restore the saved script.');
      await page.locator('.script-editor-dialog footer').getByRole('button', { name: 'Hủy' }).click();

      await page.locator('.studio-tools').getByRole('button', { name: 'Video' }).click();
      await page.getByRole('button', { name: 'Flower GIF' }).click();
      const gifLayer = page.locator('.scene-runtime-media[data-media-kind="gif"]');
      if (await gifLayer.count() !== 1) throw new Error('Animated GIF layer did not mount exactly once.');
      const gifImage = gifLayer.locator('img');
      if (!(await gifImage.getAttribute('src'))?.includes('flower.gif')) throw new Error('GIF layer did not use the controlled local GIF source.');
      const gifBox = await gifLayer.boundingBox();
      if (!gifBox) throw new Error('GIF layer had no measurable render box.');
      const frameAPath = path.join(artifactDirectory, 'gif-frame-a.png');
      const frameBPath = path.join(artifactDirectory, 'gif-frame-b.png');
      await page.screenshot({ path: frameAPath, type: 'png', clip: gifBox });
      await page.waitForTimeout(450);
      await page.screenshot({ path: frameBPath, type: 'png', clip: gifBox });
      const frameA = PNG.sync.read(fs.readFileSync(frameAPath));
      const frameB = PNG.sync.read(fs.readFileSync(frameBPath));
      const changedPixels = pixelmatch(frameA.data, frameB.data, null, frameA.width, frameA.height, { threshold: 0.08 });
      if (changedPixels < 100) throw new Error(`Animated GIF frames did not visibly advance: ${changedPixels} changed pixels.`);
      await page.screenshot({ path: path.join(artifactDirectory, 'gif-runtime-desktop.png'), type: 'png' });
    }

    const studioTools = page.locator('.studio-tools');
    await studioTools.getByRole('button', { name: 'Hình dán' }).click();
    const stickerTabs = page.locator('.asset-browser .panel-tabs');
    await stickerTabs.getByRole('button', { name: 'Hình dán' }).click();
    if (!(await page.getByRole('button', { name: 'FREESHIP' }).isVisible())) {
      throw new Error('Built-in sticker tab did not expose sticker choices.');
    }
    await stickerTabs.getByRole('button', { name: 'Của tôi' }).click();
    if (!(await page.getByText('Chưa có hình dán cá nhân', { exact: true }).isVisible())) {
      throw new Error('Personal sticker tab did not expose its empty state.');
    }

    await page.getByRole('button', { name: 'Cài đặt livestream' }).click();
    await page.locator('.voice-row .select-button').click();
    await page.locator('.voice-menu').getByRole('option', { name: 'Minh Anh' }).click();
    if ((await page.locator('.voice-row .select-button').innerText()).trim() !== 'Minh Anh') {
      throw new Error('Voice selector did not retain the selected option.');
    }

    const layout = await page.evaluate(() => ({
      clientWidth: globalThis.document.documentElement.clientWidth,
      scrollWidth: globalThis.document.documentElement.scrollWidth,
      overlay: Boolean(globalThis.document.querySelector('vite-error-overlay')),
    }));
    if (layout.scrollWidth !== layout.clientWidth || layout.overlay) {
      throw new Error(`Invalid ${name} layout state: ${JSON.stringify(layout)}`);
    }
    await page.screenshot({ path: path.join(artifactDirectory, `controls-${name}.png`), type: 'png' });
    if (errors.length > 0) throw new Error(`Console errors in ${name}: ${errors.join(' | ')}`);
  } catch (error) {
    if (childOutput) console.error(childOutput);
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
        if (attempt === 9) {
          console.warn(`Temporary text-inspector profile cleanup is pending: ${error instanceof Error ? error.message : error}`);
        } else {
          await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
        }
      }
    }
  }
}

await runViewport('desktop', '1240x669', 9231);
await runViewport('mobile', '390x844', 9232);
await runViewport('reference-desktop', '1536x824', 9233);
console.log('STUDIO_TEXT_INSPECTOR_SMOKE_OK');
