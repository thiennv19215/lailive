import { describe, expect, it } from 'vitest';
import { createProjectSceneLayer } from '../../src/shared/contracts/projects';
import { fitContainedPreviewBox, isDefaultBackgroundLayer, isPreviewRenderable, isStickerLayer, previewLayerBox, previewLayerStyle, previewTransform, resolvePreviewSource } from '../../src/shared/studio/preview';

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
    expect(style.zIndex).toBe('997');
    expect(previewTransform(layer.transform, { width: 80, height: 30 })).toContain('translate(12.5%');
    layer.visible = false;
    expect(previewLayerStyle(layer, 3).pointerEvents).toBe('none');
    expect(previewLayerStyle(layer, 3).opacity).toBe(0);
    expect(layer.fitMode).toBe('cover');
  });

  it('fits a contained landscape image tightly inside a portrait layer box', () => {
    expect(fitContainedPreviewBox(
      { left: 0, top: 0, width: 100, height: 100 },
      1.5,
      9 / 16,
    )).toEqual({ left: 0, top: 31.25, width: 100, height: 37.5 });
  });

  it('keeps default background assets full-canvas regardless of source ordering', () => {
    const background = createProjectSceneLayer('background', 'Hinh nen', 'image', { type: 'builtin', assetId: 'beauty-cream', mediaReferenceId: null });

    expect(isDefaultBackgroundLayer(background)).toBe(true);
    expect(previewLayerBox(background, 4)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    expect(previewLayerStyle(background, 5, 4)).toMatchObject({ left: '0%', top: '0%', width: '100%', height: '100%' });
  });

  it('adds built-in stickers as a compact overlay instead of a full-canvas image', () => {
    const sticker = createProjectSceneLayer('sticker', 'HOT DEAL', 'image', { type: 'builtin', assetId: 'sticker-hot-deal', mediaReferenceId: null });

    expect(isStickerLayer(sticker)).toBe(true);
    expect(previewLayerBox(sticker)).toEqual({ left: 4, top: 3, width: 32, height: 12 });
    expect(previewLayerStyle(sticker, 0)).toMatchObject({ left: '4%', top: '3%', width: '32%', height: '12%' });
  });

  it('renders lower array indexes above later layers', () => {
    const front = createProjectSceneLayer('front', 'Front', 'image', { type: 'builtin', assetId: 'beauty-model', mediaReferenceId: null });
    const back = createProjectSceneLayer('back', 'Back', 'image', { type: 'builtin', assetId: 'beauty-studio', mediaReferenceId: null });

    expect(Number(previewLayerStyle(front, 0).zIndex)).toBeGreaterThan(Number(previewLayerStyle(back, 1).zIndex));
  });

  it('uses source-list order for avatars too, so layouts can be placed in front', () => {
    const layout = createProjectSceneLayer('layout', 'HOT DEAL', 'image', { type: 'builtin', assetId: 'sticker-hot-deal', mediaReferenceId: null });
    const avatar = createProjectSceneLayer('avatar', 'Host', 'avatar', { type: 'builtin', assetId: 'template-host', mediaReferenceId: null });

    expect(Number(previewLayerStyle(layout, 0).zIndex)).toBeGreaterThan(Number(previewLayerStyle(avatar, 1).zIndex));
  });

  it('gives text layers the same authored box, transform and z-order rules as media layers', () => {
    const text = createProjectSceneLayer('text', 'Văn bản', 'text', { type: 'text', assetId: null, mediaReferenceId: null });
    text.transform = { x: 4, y: 6, scaleX: 1.2, scaleY: 0.9, rotation: 8 };

    expect(isPreviewRenderable(text)).toBe(true);
    expect(previewLayerStyle(text, 0)).toMatchObject({
      left: '8%',
      top: '7%',
      width: '84%',
      height: '18%',
      zIndex: '1000',
      transform: 'translate(4.761904761904762%, 33.33333333333333%) rotate(8deg) scale(1.2, 0.9)',
    });
  });

  it('keeps legacy text layers renderable when their old source type is none', () => {
    const legacyText = createProjectSceneLayer('legacy-text', 'text', 'text');

    expect(legacyText.source.type).toBe('none');
    expect(isPreviewRenderable(legacyText)).toBe(true);
  });
});
