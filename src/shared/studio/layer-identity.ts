import type { ProjectSceneLayer } from '../contracts/projects';

export function ensureUniqueLayerIds(
  layers: ProjectSceneLayer[],
  createId: () => string = () => `layer-${globalThis.crypto.randomUUID()}`,
): { layers: ProjectSceneLayer[]; changed: boolean } {
  const usedIds = new Set<string>();
  let changed = false;

  return {
    layers: layers.map((layer) => {
      if (layer.id && !usedIds.has(layer.id)) {
        usedIds.add(layer.id);
        return layer;
      }

      changed = true;
      let id = createId();
      while (!id || usedIds.has(id)) id = createId();
      usedIds.add(id);
      return { ...layer, id };
    }),
    get changed() { return changed; },
  };
}
