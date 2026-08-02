import { describe, expect, it } from 'vitest';
import { reactive, ref, toRaw } from 'vue';
import { createEmptyScene, createProjectSceneLayer, type ProjectSceneDocument } from '../../src/shared/contracts/projects';
import { projectSceneSchema } from '../../src/shared/validation/projects';
import type { ScenePresentationState } from '../../src/shared/contracts/scene-runtime';

function preparePlainSceneForOutput(
  sceneRef: { value: ProjectSceneDocument },
  layersRef: { value: ReturnType<typeof createProjectSceneLayer>[] },
  mediaRef: { value: ReadonlyArray<{ id: string; label: string; kind: string; path: string }> },
): ProjectSceneDocument {
  const rawScene = toRaw(sceneRef.value);
  const rawLayers = layersRef.value.map((layer) => toRaw(layer));
  const rawMedia = mediaRef.value.map((refItem) => toRaw(refItem));
  const plainScene = {
    ...rawScene,
    layers: rawLayers,
    mediaReferences: rawMedia,
  };
  return projectSceneSchema.parse(plainScene);
}

function preparePlainPresentation(
  mode: 'stopped' | 'idle' | 'paused',
  activeLayerId: string | null,
  enabled: boolean,
  playlistLayerIds: string[],
  playbackRevision: number,
): ScenePresentationState {
  return {
    mode,
    activeScriptId: null,
    activeLayerId: activeLayerId ? String(activeLayerId) : null,
    activeAudioLayerId: null,
    pendingAudioLayerId: null,
    activeAvatarLayerId: null,
    activeAvatarTransitionLayerId: null,
    pendingAvatarLayerId: null,
    pendingLayerId: null,
    managedLayerIds: enabled ? playlistLayerIds.map((id) => String(id)) : [],
    playbackRevision: Number(playbackRevision),
    resumeActiveMedia: false,
    activePaused: mode !== 'idle',
    activeMuted: false,
    activeVolume: 1,
    activeLoop: false,
    activeAudioMuted: true,
    activeAudioVolume: 0,
  };
}

describe('studio scene serialization', () => {
  it('un-proxies Vue reactive scene state into a plain object that passes structuredClone without error', () => {
    const emptyScene = createEmptyScene();
    const layer1 = createProjectSceneLayer('layer-1', 'Background', 'image', { type: 'builtin', assetId: 'beauty-studio', mediaReferenceId: null });
    const layer2 = createProjectSceneLayer('layer-2', 'Video', 'video', { type: 'media', assetId: null, mediaReferenceId: 'media-1' });

    const sceneRef = ref(reactive(emptyScene));
    const layersRef = ref(reactive([layer1, layer2]));
    const mediaRef = ref(reactive([
      { id: 'media-1', label: 'Video.mp4', kind: 'video', path: 'C:\\media\\video.mp4' },
    ]));

    const plainScene = preparePlainSceneForOutput(sceneRef, layersRef, mediaRef);

    expect(() => structuredClone(plainScene)).not.toThrow();

    const cloned = structuredClone(plainScene);
    expect(cloned.layers).toHaveLength(2);
    expect(cloned.layers[0]!.id).toBe('layer-1');
    expect(cloned.mediaReferences).toHaveLength(1);
    expect(cloned.mediaReferences[0]!.id).toBe('media-1');
  });

  it('serializes scene presentation state into a plain object that passes structuredClone', () => {
    const playlistIdsRef = ref(reactive(['layer-1', 'layer-2', 'layer-3']));

    const presentation = preparePlainPresentation(
      'idle',
      'layer-3',
      true,
      playlistIdsRef.value,
      1,
    );

    expect(() => structuredClone(presentation)).not.toThrow();

    const cloned = structuredClone(presentation);
    expect(cloned.mode).toBe('idle');
    expect(cloned.activeLayerId).toBe('layer-3');
    expect(cloned.managedLayerIds).toEqual(['layer-1', 'layer-2', 'layer-3']);
  });
});
