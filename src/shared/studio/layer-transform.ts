export type LayerOrderAction = 'top' | 'up' | 'down' | 'bottom';
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type LayerTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

export type LayerSnapResult = {
  transform: LayerTransform;
  guideX: boolean;
  guideY: boolean;
};

export const DEFAULT_LAYER_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeLayerTransform(transform: LayerTransform): LayerTransform {
  const rotation = Number.isFinite(transform.rotation) ? ((transform.rotation + 180) % 360 + 360) % 360 - 180 : 0;
  return {
    x: clamp(Number.isFinite(transform.x) ? transform.x : 0, -100, 100),
    y: clamp(Number.isFinite(transform.y) ? transform.y : 0, -100, 100),
    scaleX: clamp(Number.isFinite(transform.scaleX) ? transform.scaleX : 1, 0.25, 3),
    scaleY: clamp(Number.isFinite(transform.scaleY) ? transform.scaleY : 1, 0.25, 3),
    rotation,
  };
}

export function translateLayer(transform: LayerTransform, deltaX: number, deltaY: number): LayerTransform {
  return normalizeLayerTransform({ ...transform, x: transform.x + deltaX, y: transform.y + deltaY });
}

export function snapLayerTranslation(
  transform: LayerTransform,
  gridStep = 5,
  centerThreshold = 1.2,
): LayerSnapResult {
  const snapAxis = (value: number): { value: number; center: boolean } => {
    if (Math.abs(value) <= centerThreshold) return { value: 0, center: true };
    return { value: Math.round(value / gridStep) * gridStep, center: false };
  };
  const x = snapAxis(transform.x);
  const y = snapAxis(transform.y);
  return {
    transform: normalizeLayerTransform({ ...transform, x: x.value, y: y.value }),
    guideX: x.center,
    guideY: y.center,
  };
}

export function resizeLayer(
  transform: LayerTransform,
  handle: ResizeHandle,
  horizontalRatio: number,
  verticalRatio: number,
  preserveAspectRatio = false,
): LayerTransform {
  const horizontalDirection = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const verticalDirection = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  if (preserveAspectRatio && horizontalDirection !== 0 && verticalDirection !== 0) {
    const horizontalDelta = horizontalRatio * horizontalDirection;
    const verticalDelta = verticalRatio * verticalDirection;
    const scaleDelta = Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta;
    return normalizeLayerTransform({
      ...transform,
      scaleX: transform.scaleX + scaleDelta,
      scaleY: transform.scaleY + scaleDelta,
    });
  }
  return normalizeLayerTransform({
    ...transform,
    scaleX: transform.scaleX + horizontalRatio * horizontalDirection,
    scaleY: transform.scaleY + verticalRatio * verticalDirection,
  });
}

export function rotateLayer(transform: LayerTransform, deltaDegrees: number): LayerTransform {
  return normalizeLayerTransform({ ...transform, rotation: transform.rotation + deltaDegrees });
}

export function reorderLayer<T>(items: readonly T[], index: number, action: LayerOrderAction): { items: T[]; index: number } {
  if (index < 0 || index >= items.length) return { items: [...items], index };
  const target = action === 'top'
    ? 0
    : action === 'bottom'
      ? items.length - 1
      : action === 'up'
        ? Math.max(0, index - 1)
        : Math.min(items.length - 1, index + 1);
  if (target === index) return { items: [...items], index };
  const reordered = [...items];
  const [item] = reordered.splice(index, 1);
  reordered.splice(target, 0, item!);
  return { items: reordered, index: target };
}
