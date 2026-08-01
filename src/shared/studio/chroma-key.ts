export type ObjectFitMode = 'contain' | 'cover' | 'fill';

export type DrawRect = { x: number; y: number; width: number; height: number };

export function calculateObjectFitRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: ObjectFitMode,
): DrawRect {
  if (mode === 'fill' || sourceWidth <= 0 || sourceHeight <= 0) {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  }
  const scale = mode === 'contain'
    ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

export function applyChromaKeyToPixels(data: Uint8ClampedArray, color: string, tolerance: number): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return 0;
  const red = Number.parseInt(match[1]!, 16);
  const green = Number.parseInt(match[2]!, 16);
  const blue = Number.parseInt(match[3]!, 16);
  const threshold = Math.min(100, Math.max(0, tolerance)) / 100 * Math.sqrt(3 * 255 * 255);
  let removed = 0;
  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.hypot(data[index]! - red, data[index + 1]! - green, data[index + 2]! - blue);
    if (distance <= threshold) {
      data[index + 3] = 0;
      removed += 1;
    }
  }
  return removed;
}
