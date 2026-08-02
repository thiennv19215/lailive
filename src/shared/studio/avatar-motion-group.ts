import type { ProjectSceneLayer } from '../contracts/projects';
import type { LayerTransform } from './layer-transform';

type MotionAvatar = Pick<ProjectSceneLayer, 'id' | 'kind' | 'avatarMotion' | 'transform'>;

function sameTransform(left: LayerTransform, right: LayerTransform): boolean {
  return left.x === right.x && left.y === right.y && left.scaleX === right.scaleX
    && left.scaleY === right.scaleY && left.rotation === right.rotation;
}

export function synchronizeAvatarMotionTransforms(layers: MotionAvatar[], sourceId?: string): boolean {
  const motionLayers = layers.filter((layer) => layer.kind === 'avatar' && layer.avatarMotion !== null);
  const source = (sourceId ? motionLayers.find((layer) => layer.id === sourceId) : undefined) ?? motionLayers[0];
  if (!source) return false;
  let changed = false;
  for (const layer of motionLayers) {
    if (sameTransform(layer.transform, source.transform)) continue;
    layer.transform = { ...source.transform };
    changed = true;
  }
  return changed;
}
