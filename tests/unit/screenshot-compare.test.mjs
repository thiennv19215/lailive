import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import {
  compareScreenshotFiles,
  ScreenshotDimensionMismatchError,
} from '../../scripts/lib/screenshot-compare.mjs';

function makePng(width, height, changedPixel = false) {
  const png = new PNG({ width, height });
  png.data.fill(255);

  if (changedPixel) {
    png.data[0] = 0;
    png.data[1] = 0;
    png.data[2] = 0;
  }

  return PNG.sync.write(png);
}

async function withFixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ai-livestream-ui-compare-'));

  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('screenshot comparison', () => {
  it('writes diff, overlay, and deterministic metrics', async () => {
    await withFixture(async (directory) => {
      const referencePath = path.join(directory, 'reference.png');
      const rebuildPath = path.join(directory, 'rebuild.png');
      const outputDirectory = path.join(directory, 'output');
      await Promise.all([
        writeFile(referencePath, makePng(2, 2)),
        writeFile(rebuildPath, makePng(2, 2, true)),
      ]);

      const result = await compareScreenshotFiles({
        referencePath,
        rebuildPath,
        outputDirectory,
        threshold: 0.1,
      });

      expect(result.report).toMatchObject({
        width: 2,
        height: 2,
        totalPixels: 4,
        mismatchedPixels: 1,
        mismatchPercentage: 25,
        threshold: 0.1,
      });
      await expect(readFile(result.outputPaths.diff)).resolves.toBeInstanceOf(Uint8Array);
      await expect(readFile(result.outputPaths.overlay)).resolves.toBeInstanceOf(Uint8Array);
      await expect(readFile(result.outputPaths.report, 'utf8')).resolves.toContain(
        '"mismatchedPixels": 1',
      );
    });
  });

  it('rejects different dimensions instead of resizing evidence', async () => {
    await withFixture(async (directory) => {
      const referencePath = path.join(directory, 'reference.png');
      const rebuildPath = path.join(directory, 'rebuild.png');
      await Promise.all([
        writeFile(referencePath, makePng(2, 2)),
        writeFile(rebuildPath, makePng(3, 2)),
      ]);

      await expect(
        compareScreenshotFiles({
          referencePath,
          rebuildPath,
          outputDirectory: path.join(directory, 'output'),
        }),
      ).rejects.toBeInstanceOf(ScreenshotDimensionMismatchError);
    });
  });
});
