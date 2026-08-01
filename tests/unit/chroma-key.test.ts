import { describe, expect, it } from 'vitest';
import { applyChromaKeyToPixels, calculateObjectFitRect } from '../../src/shared/studio/chroma-key';

describe('studio chroma key', () => {
  it('removes pixels near the configured key while preserving distant pixels', () => {
    const pixels = new Uint8ClampedArray([
      0, 255, 0, 255,
      12, 245, 8, 255,
      255, 0, 0, 255,
    ]);
    expect(applyChromaKeyToPixels(pixels, '#00ff00', 8)).toBe(2);
    expect(Array.from(pixels)).toEqual([
      0, 255, 0, 0,
      12, 245, 8, 0,
      255, 0, 0, 255,
    ]);
  });

  it('calculates contain, cover, and fill draw rectangles', () => {
    expect(calculateObjectFitRect(1920, 1080, 100, 100, 'contain')).toEqual({ x: 0, y: 21.875, width: 100, height: 56.25 });
    expect(calculateObjectFitRect(1920, 1080, 100, 100, 'cover')).toEqual({ x: -38.888888888888886, y: 0, width: 177.77777777777777, height: 100 });
    expect(calculateObjectFitRect(1920, 1080, 100, 100, 'fill')).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});
