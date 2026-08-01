import { describe, expect, it } from 'vitest';
import { createProjectSceneLayer } from '../../src/shared/contracts/projects';
import { ensureUniqueLayerIds } from '../../src/shared/studio/layer-identity';

describe('Studio layer identity', () => {
  it('keeps the first id and repairs later duplicates', () => {
    const layers = [
      createProjectSceneLayer('layer-1', 'Video', 'video'),
      createProjectSceneLayer('layer-1', 'Text', 'text'),
    ];
    const result = ensureUniqueLayerIds(layers, () => 'layer-repaired');

    expect(result.changed).toBe(true);
    expect(result.layers.map((layer) => layer.id)).toEqual(['layer-1', 'layer-repaired']);
  });

  it('does not rewrite an already valid layer list', () => {
    const layers = [
      createProjectSceneLayer('layer-1', 'Video', 'video'),
      createProjectSceneLayer('layer-2', 'Text', 'text'),
    ];
    const result = ensureUniqueLayerIds(layers, () => 'unused');

    expect(result.changed).toBe(false);
    expect(result.layers).toEqual(layers);
  });
});
