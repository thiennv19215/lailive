import type { ProjectSceneLayer } from '../contracts/projects';
import { normalizeLayerTransform, type LayerTransform } from './layer-transform';

export type PreviewSource =
  | { type: 'builtin'; assetId: NonNullable<ProjectSceneLayer['source']['assetId']> }
  | { type: 'media'; mediaReferenceId: string };

export interface PreviewLayerStyle {
  left: string;
  top: string;
  width: string;
  height: string;
  zIndex: string;
  opacity: number;
  pointerEvents: 'auto' | 'none';
  transform: string;
}

const BUILTIN_ASSETS = new Set<NonNullable<ProjectSceneLayer['source']['assetId']>>([
  'template-host', 'beauty-model', 'beauty-studio', 'beauty-cream',
  'background-white-clean', 'background-white-warm', 'background-white-studio',
  'flower-video', 'flower-gif',
  'sticker-freeship', 'sticker-hot-deal', 'sticker-live-only', 'sticker-sale-50',
]);

export function resolvePreviewSource(layer: ProjectSceneLayer, loadedMediaIds: ReadonlySet<string> = new Set()): PreviewSource | null {
  if (layer.source.type === 'builtin' && layer.source.assetId && BUILTIN_ASSETS.has(layer.source.assetId)) {
    return { type: 'builtin', assetId: layer.source.assetId };
  }
  if (layer.source.type === 'media' && layer.source.mediaReferenceId && loadedMediaIds.has(layer.source.mediaReferenceId)) {
    return { type: 'media', mediaReferenceId: layer.source.mediaReferenceId };
  }
  return null;
}

export function isPreviewRenderable(layer: ProjectSceneLayer, loadedMediaIds: ReadonlySet<string> = new Set()): boolean {
  return layer.kind === 'text' || resolvePreviewSource(layer, loadedMediaIds) !== null;
}

export interface PreviewLayerBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function previewLayerBox(layer: ProjectSceneLayer, imageIndex = 0): PreviewLayerBox {
  if (layer.kind === 'text') return { left: 8, top: 7, width: 84, height: 18 };
  if (layer.kind === 'video' || layer.kind === 'gif') return { left: 10, top: 30, width: 80, height: 30 };
  if (layer.kind === 'avatar') return { left: 42, top: 25, width: 54, height: 72 };
  if (imageIndex === 1) return { left: 8, top: 57, width: 84, height: 24 };
  return { left: 0, top: 0, width: 100, height: 100 };
}

export function fitContainedPreviewBox(box: PreviewLayerBox, sourceAspectRatio: number, posterAspectRatio: number): PreviewLayerBox {
  if (sourceAspectRatio <= 0 || posterAspectRatio <= 0 || box.width <= 0 || box.height <= 0) return box;
  const targetAspectRatio = (box.width * posterAspectRatio) / box.height;

  if (sourceAspectRatio > targetAspectRatio) {
    const height = box.height * (targetAspectRatio / sourceAspectRatio);
    return { ...box, top: box.top + (box.height - height) / 2, height };
  }

  const width = box.width * (sourceAspectRatio / targetAspectRatio);
  return { ...box, left: box.left + (box.width - width) / 2, width };
}

export function previewTransform(transform: LayerTransform, box: { width: number; height: number }): string {
  const normalized = normalizeLayerTransform(transform);
  return `translate(${(normalized.x / box.width) * 100}%, ${(normalized.y / box.height) * 100}%) rotate(${normalized.rotation}deg) scale(${normalized.scaleX}, ${normalized.scaleY})`;
}

export function previewLayerStyle(layer: ProjectSceneLayer, index: number, imageIndex = 0): PreviewLayerStyle {
  const box = previewLayerBox(layer, imageIndex);
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
    zIndex: String(1000 - index),
    opacity: layer.visible ? layer.opacity : 0,
    pointerEvents: layer.visible ? 'auto' : 'none',
    transform: previewTransform(layer.transform, box),
  };
}
