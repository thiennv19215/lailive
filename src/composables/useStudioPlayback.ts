import { onBeforeUnmount, ref, type Ref } from 'vue';
import { ManualVideoPlaybackController, type ManualVideoPlaybackSnapshot } from '../modules/playback/manual-video-playback';
import type { ProjectMediaStatus, ProjectSceneDocument, ProjectSceneLayer } from '../shared/contracts/projects';
import type { ScenePresentationState } from '../shared/contracts/scene-runtime';

type StudioPlaybackOptions = {
  scene: Ref<ProjectSceneDocument>;
  layers: Ref<ProjectSceneLayer[]>;
  mediaStatuses: Ref<ProjectMediaStatus[]>;
  projectLoaded: Ref<boolean>;
  buildSceneDocument: () => ProjectSceneDocument;
  onPublishError: (message: string) => void;
};

const EMPTY_SNAPSHOT: ManualVideoPlaybackSnapshot = {
  mode: 'stopped',
  activeLayerId: null,
  activePlaylistIndex: null,
  playbackRevision: 0,
  attemptedLayerIds: [],
  sessionHistory: [],
  warnings: [],
  errorMessage: null,
  activeSettings: null,
};

export function useStudioPlayback(options: StudioPlaybackOptions) {
  const snapshot = ref<ManualVideoPlaybackSnapshot>(EMPTY_SNAPSHOT);
  const controller = new ManualVideoPlaybackController();
  let publishInFlight = false;
  let publishQueued = false;

  function items() {
    return options.scene.value.manualPlaybackSettings.playlist;
  }

  function sync(): void {
    controller.configure(
      options.scene.value.manualPlaybackSettings,
      options.layers.value
        .filter((layer) => (layer.kind === 'video' || layer.kind === 'audio') && Boolean(layer.source.mediaReferenceId || layer.source.assetId))
        .map((layer) => ({
          id: layer.id,
          kind: layer.kind,
          loop: layer.loop,
          muted: layer.muted,
          volume: layer.volume,
          available: layer.source.type === 'builtin' || options.mediaStatuses.value.find((status) => status.id === layer.source.mediaReferenceId)?.exists !== false,
        })),
    );
  }

  function presentation(current: ManualVideoPlaybackSnapshot): ScenePresentationState {
    return {
      mode: current.mode,
      activeLayerId: current.activeLayerId,
      managedLayerIds: items().map((item) => item.layerId),
      playbackRevision: current.playbackRevision,
      activePaused: current.mode === 'paused' || current.mode === 'stopped' || current.mode === 'error',
      activeMuted: current.activeSettings?.muted ?? true,
      activeVolume: current.activeSettings?.volume ?? 0,
      activeLoop: current.activeSettings?.loop ?? false,
    };
  }

  async function publish(current = snapshot.value): Promise<void> {
    if (!options.projectLoaded.value) return;
    if (publishInFlight) {
      publishQueued = true;
      return;
    }

    publishInFlight = true;
    try {
      const scene = JSON.parse(JSON.stringify(options.buildSceneDocument())) as ProjectSceneDocument;
      const scenePresentation = JSON.parse(JSON.stringify(presentation(current))) as ScenePresentationState;
      await globalThis.window.desktopApi.sceneRuntime.publish(scene, 'idle', scenePresentation);
    } catch (error) {
      options.onPublishError(error instanceof Error ? error.message : String(error));
    } finally {
      publishInFlight = false;
      if (publishQueued) {
        publishQueued = false;
        void publish();
      }
    }
  }

  function assign(layerId: string): void {
    if (!options.layers.value.some((layer) => layer.id === layerId && (layer.kind === 'video' || layer.kind === 'audio'))) return;
    if (items().some((item) => item.layerId === layerId)) return;
    if (items().length >= 20) {
      options.onPublishError('Playlist đã đủ 20 mục.');
      return;
    }
    items().push({ layerId, enabled: true });
    options.scene.value.manualPlaybackSettings.enabled = true;
    sync();
  }

  function remove(index: number): void {
    items().splice(index, 1);
    sync();
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= items().length) return;
    [items()[index], items()[target]] = [items()[target]!, items()[index]!];
    sync();
  }

  function toggleItem(index: number): void {
    const item = items()[index];
    if (item) item.enabled = !item.enabled;
    sync();
  }

  function toggle(): void {
    options.scene.value.manualPlaybackSettings.enabled = !options.scene.value.manualPlaybackSettings.enabled;
    sync();
  }

  const unsubscribe = controller.subscribe((current) => {
    snapshot.value = current;
    void publish(current);
  });

  onBeforeUnmount(() => {
    unsubscribe();
    controller.dispose();
  });

  return {
    snapshot,
    items,
    sync,
    publish,
    assign,
    remove,
    move,
    toggleItem,
    toggle,
    start: () => controller.start(),
    pause: () => controller.pause(),
    resume: () => controller.resume(),
    skip: () => controller.skip(),
    stop: () => controller.stop(),
    retry: () => controller.retry(),
    ready: (layerId: string, revision: number) => controller.onReady(layerId, revision),
    ended: (layerId: string, revision: number) => controller.onEnded(layerId, revision),
    error: (layerId: string, revision: number, message: string) => controller.onError(layerId, revision, message),
  };
}
