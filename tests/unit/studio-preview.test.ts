import { describe, expect, it } from 'vitest';
import { createProjectSceneLayer } from '../../src/shared/contracts/projects';
import { isPreviewRenderable, previewLayerStyle, previewTransform, resolvePreviewSource } from '../../src/shared/studio/preview';

describe('Studio preview source and geometry', () => {
  it('does not render implicit name-based or empty sources', () => {
    const layer = createProjectSceneLayer('layer-1', 'Beauty model', 'image');
    expect(resolvePreviewSource(layer)).toBeNull();
    expect(isPreviewRenderable(layer)).toBe(false);
  });

  it('resolves only explicit builtin and loaded local sources', () => {
    const builtin = createProjectSceneLayer('builtin', 'Any name', 'image', { type: 'builtin', assetId: 'beauty-model', mediaReferenceId: null });
    const local = createProjectSceneLayer('local', 'Any name', 'video', { type: 'media', assetId: null, mediaReferenceId: 'media-1' });
    expect(resolvePreviewSource(builtin)).toEqual({ type: 'builtin', assetId: 'beauty-model' });
    expect(resolvePreviewSource(local)).toBeNull();
    expect(resolvePreviewSource(local, new Set(['media-1']))).toEqual({ type: 'media', mediaReferenceId: 'media-1' });
  });

  it('uses persisted transform, visibility, opacity, z-order and object fit', () => {
    const layer = createProjectSceneLayer('video', 'Portrait', 'video', { type: 'builtin', assetId: 'flower-video', mediaReferenceId: null });
    layer.fitMode = 'cover';
    layer.transform = { x: 10, y: -5, scaleX: 1.5, scaleY: 0.8, rotation: 12 };
    layer.opacity = 0.65;
    const style = previewLayerStyle(layer, 3);
    expect(style.transform).toBe('translate(12.5%, -16.666666666666664%) rotate(12deg) scale(1.5, 0.8)');
    expect(style.opacity).toBe(0.65);
    expect(style.zIndex).toBe('103');
    expect(previewTransform(layer.transform, { width: 80, height: 30 })).toContain('translate(12.5%');
    layer.visible = false;
    expect(previewLayerStyle(layer, 3).pointerEvents).toBe('none');
    expect(previewLayerStyle(layer, 3).opacity).toBe(0);
    expect(layer.fitMode).toBe('cover');
  });
});
