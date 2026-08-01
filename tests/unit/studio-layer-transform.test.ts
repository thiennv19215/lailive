import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER_TRANSFORM,
  normalizeLayerTransform,
  reorderLayer,
  resizeLayer,
  rotateLayer,
  snapLayerTranslation,
  translateLayer,
} from '../../src/shared/studio/layer-transform';

describe('studio layer transform', () => {
  it('clamps translation and scale to a usable local scene range', () => {
    expect(normalizeLayerTransform({ x: 140, y: -150, scaleX: 0, scaleY: 7, rotation: 540 })).toEqual({
      x: 100,
      y: -100,
      scaleX: 0.25,
      scaleY: 3,
      rotation: -180,
    });
  });

  it('translates, resizes, and rotates deterministically', () => {
    expect(translateLayer(DEFAULT_LAYER_TRANSFORM, 12, -8)).toMatchObject({ x: 12, y: -8 });
    expect(resizeLayer(DEFAULT_LAYER_TRANSFORM, 'se', 0.5, 0.25)).toMatchObject({ scaleX: 1.5, scaleY: 1.25 });
    expect(resizeLayer(DEFAULT_LAYER_TRANSFORM, 'nw', 0.5, 0.25)).toMatchObject({ scaleX: 0.5, scaleY: 0.75 });
    expect(rotateLayer(DEFAULT_LAYER_TRANSFORM, 35).rotation).toBe(35);
  });

  it('keeps media proportions when a corner resize acts as zoom', () => {
    expect(resizeLayer(DEFAULT_LAYER_TRANSFORM, 'se', 0.4, 0.2, true)).toMatchObject({ scaleX: 1.4, scaleY: 1.4 });
    expect(resizeLayer(DEFAULT_LAYER_TRANSFORM, 'nw', 0.3, 0.5, true)).toMatchObject({ scaleX: 0.5, scaleY: 0.5 });
    expect(resizeLayer(DEFAULT_LAYER_TRANSFORM, 'e', 0.4, 0.2, true)).toMatchObject({ scaleX: 1.4, scaleY: 1 });
  });

  it('moves a selected layer through all four observed order actions', () => {
    expect(reorderLayer(['a', 'b', 'c'], 1, 'top')).toEqual({ items: ['b', 'a', 'c'], index: 0 });
    expect(reorderLayer(['a', 'b', 'c'], 1, 'up')).toEqual({ items: ['b', 'a', 'c'], index: 0 });
    expect(reorderLayer(['a', 'b', 'c'], 1, 'down')).toEqual({ items: ['a', 'c', 'b'], index: 2 });
    expect(reorderLayer(['a', 'b', 'c'], 1, 'bottom')).toEqual({ items: ['a', 'c', 'b'], index: 2 });
  });

  it('snaps translation to the grid and exposes center guides', () => {
    expect(snapLayerTranslation({ ...DEFAULT_LAYER_TRANSFORM, x: 12.4, y: -17.6 })).toEqual({
      transform: { ...DEFAULT_LAYER_TRANSFORM, x: 10, y: -20 },
      guideX: false,
      guideY: false,
    });
    expect(snapLayerTranslation({ ...DEFAULT_LAYER_TRANSFORM, x: 0.8, y: -1.1 })).toEqual({
      transform: DEFAULT_LAYER_TRANSFORM,
      guideX: true,
      guideY: true,
    });
  });
});
