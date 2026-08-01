import { describe, expect, it } from 'vitest';
import { createProjectSceneLayer, type ProjectSceneLayer, type ProjectSceneDocument } from '../../src/shared/contracts/projects';

function cleanBrokenSources(
  layers: ProjectSceneLayer[],
  manualPlaybackSettings: ProjectSceneDocument['manualPlaybackSettings'],
  failedLayerIds: Set<string>,
  unavailableMediaIds: Set<string>,
): {
  cleanedLayers: ProjectSceneLayer[];
  updatedSettings: ProjectSceneDocument['manualPlaybackSettings'];
  removedCount: number;
} {
  const removable = layers.filter((layer) => {
    const isFailed = failedLayerIds.has(layer.id);
    const isUnavailable = Boolean(layer.source.mediaReferenceId && unavailableMediaIds.has(layer.source.mediaReferenceId));
    const isTextEmpty = layer.kind === 'text' && layer.name.trim().toLowerCase() === 'text';
    const isNoSource = !layer.source.assetId && !layer.source.mediaReferenceId && layer.kind !== 'text';
    return isFailed || isUnavailable || isTextEmpty || isNoSource;
  });

  if (!removable.length) {
    return {
      cleanedLayers: [...layers],
      updatedSettings: { ...manualPlaybackSettings },
      removedCount: 0,
    };
  }

  const removedIds = new Set(removable.map((l) => l.id));
  const cleanedLayers = layers.filter((l) => !removedIds.has(l.id));

  const playlist = manualPlaybackSettings.playlist.filter((item) => !removedIds.has(item.layerId));
  const enabled = manualPlaybackSettings.enabled && playlist.length > 0;

  return {
    cleanedLayers,
    updatedSettings: {
      enabled,
      playlist,
    },
    removedCount: removable.length,
  };
}

describe('studio source cleanup', () => {
  it('identifies and removes failed, missing, empty, or unrenderable layers', () => {
    const validVideo = createProjectSceneLayer('layer-1', 'Valid Video', 'video', { type: 'builtin', assetId: 'flower-video', mediaReferenceId: null });
    const missingMediaVideo = createProjectSceneLayer('layer-2', 'Missing Video', 'video', { type: 'media', assetId: null, mediaReferenceId: 'media-missing' });
    const failedImage = createProjectSceneLayer('layer-3', 'Failed Image', 'image', { type: 'media', assetId: null, mediaReferenceId: 'media-failed' });
    const emptyText = createProjectSceneLayer('layer-4', 'text', 'text');
    const validText = createProjectSceneLayer('layer-5', 'Gia khuyen mai', 'text');

    const layers = [validVideo, missingMediaVideo, failedImage, emptyText, validText];
    const settings = { enabled: true, playlist: [{ layerId: 'layer-1', enabled: true }, { layerId: 'layer-2', enabled: true }, { layerId: 'layer-3', enabled: true }] };
    const failedLayerIds = new Set(['layer-3']);
    const unavailableMediaIds = new Set(['media-missing']);

    const result = cleanBrokenSources(layers, settings, failedLayerIds, unavailableMediaIds);

    expect(result.removedCount).toBe(3);
    expect(result.cleanedLayers.map((l) => l.id)).toEqual(['layer-1', 'layer-5']);
    expect(result.updatedSettings.playlist).toEqual([{ layerId: 'layer-1', enabled: true }]);
    expect(result.updatedSettings.enabled).toBe(true);
  });

  it('handles clean state when no broken sources exist', () => {
    const validVideo = createProjectSceneLayer('layer-1', 'Valid Video', 'video', { type: 'builtin', assetId: 'flower-video', mediaReferenceId: null });
    const settings = { enabled: true, playlist: [{ layerId: 'layer-1', enabled: true }] };

    const result = cleanBrokenSources([validVideo], settings, new Set(), new Set());

    expect(result.removedCount).toBe(0);
    expect(result.cleanedLayers).toHaveLength(1);
    expect(result.updatedSettings.enabled).toBe(true);
  });

  it('disables manual playback settings if all assigned layers are cleaned', () => {
    const failedVideo = createProjectSceneLayer('layer-1', 'Broken Video', 'video', { type: 'media', assetId: null, mediaReferenceId: 'missing-id' });
    const settings = { enabled: true, playlist: [{ layerId: 'layer-1', enabled: true }] };

    const result = cleanBrokenSources([failedVideo], settings, new Set(), new Set(['missing-id']));

    expect(result.removedCount).toBe(1);
    expect(result.cleanedLayers).toHaveLength(0);
    expect(result.updatedSettings.enabled).toBe(false);
    expect(result.updatedSettings.playlist).toEqual([]);
  });
});
