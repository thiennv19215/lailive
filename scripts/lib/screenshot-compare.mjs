import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export class ScreenshotDimensionMismatchError extends Error {
  constructor(reference, rebuild) {
    super(
      `Screenshot dimensions must match: reference is ${reference.width}x${reference.height}, ` +
        `rebuild is ${rebuild.width}x${rebuild.height}. Capture both at the same viewport.`,
    );
    this.name = 'ScreenshotDimensionMismatchError';
  }
}

function validateThreshold(threshold) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('Pixel threshold must be a number from 0 to 1.');
  }
}

function decodePng(contents, label) {
  try {
    return PNG.sync.read(contents);
  } catch (error) {
    throw new Error(`Could not decode ${label} as a PNG.`, { cause: error });
  }
}

function createOverlay(reference, rebuild) {
  const overlay = new PNG({ width: reference.width, height: reference.height });

  for (let index = 0; index < reference.data.length; index += 1) {
    overlay.data[index] = Math.round((reference.data[index] + rebuild.data[index]) / 2);
  }

  return overlay;
}

export function comparePngImages(reference, rebuild, options = {}) {
  const threshold = options.threshold ?? 0.1;
  validateThreshold(threshold);

  if (reference.width !== rebuild.width || reference.height !== rebuild.height) {
    throw new ScreenshotDimensionMismatchError(reference, rebuild);
  }

  const diff = new PNG({ width: reference.width, height: reference.height });
  const mismatchedPixels = pixelmatch(
    reference.data,
    rebuild.data,
    diff.data,
    reference.width,
    reference.height,
    { threshold, includeAA: false },
  );
  const totalPixels = reference.width * reference.height;

  return {
    diff,
    overlay: createOverlay(reference, rebuild),
    metrics: {
      width: reference.width,
      height: reference.height,
      totalPixels,
      mismatchedPixels,
      mismatchPercentage: (mismatchedPixels / totalPixels) * 100,
      threshold,
    },
  };
}

export async function compareScreenshotFiles({
  referencePath,
  rebuildPath,
  outputDirectory,
  threshold = 0.1,
  referenceLabel = path.basename(referencePath),
  rebuildLabel = path.basename(rebuildPath),
}) {
  const [referenceContents, rebuildContents] = await Promise.all([
    readFile(referencePath),
    readFile(rebuildPath),
  ]);
  const reference = decodePng(referenceContents, referenceLabel);
  const rebuild = decodePng(rebuildContents, rebuildLabel);
  const comparison = comparePngImages(reference, rebuild, { threshold });
  const outputPaths = {
    diff: path.join(outputDirectory, 'pixel-diff.png'),
    overlay: path.join(outputDirectory, 'overlay-50-50.png'),
    report: path.join(outputDirectory, 'report.json'),
  };
  const report = {
    reference: { label: referenceLabel, width: reference.width, height: reference.height },
    rebuild: { label: rebuildLabel, width: rebuild.width, height: rebuild.height },
    ...comparison.metrics,
    outputs: {
      diff: path.basename(outputPaths.diff),
      overlay: path.basename(outputPaths.overlay),
    },
  };

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(outputPaths.diff, PNG.sync.write(comparison.diff)),
    writeFile(outputPaths.overlay, PNG.sync.write(comparison.overlay)),
    writeFile(outputPaths.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
  ]);

  return { report, outputPaths };
}
