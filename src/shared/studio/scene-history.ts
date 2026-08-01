import type { ProjectAvatarSettings, ProjectCanvasPreset, ProjectImageSettings, ProjectManualPlaybackSettings, ProjectSceneLayer } from '../contracts/projects';
import type { StudioTextStyle } from './text-style';

export interface SceneEditorSnapshot {
  canvasPreset: ProjectCanvasPreset;
  layers: ProjectSceneLayer[];
  textStyle: StudioTextStyle;
  imageSettings: ProjectImageSettings;
  avatarSettings: ProjectAvatarSettings;
  manualPlaybackSettings: ProjectManualPlaybackSettings;
}

function cloneLayers(layers: readonly ProjectSceneLayer[]): ProjectSceneLayer[] {
  return layers.map((layer) => ({
    ...layer,
    transform: { ...layer.transform },
    chromaKey: { ...layer.chromaKey },
    source: { ...layer.source },
  }));
}

function cloneSnapshot(snapshot: SceneEditorSnapshot): SceneEditorSnapshot {
  return {
    canvasPreset: snapshot.canvasPreset,
    layers: cloneLayers(snapshot.layers),
    textStyle: { ...snapshot.textStyle },
    imageSettings: { ...snapshot.imageSettings },
    avatarSettings: {
      ...snapshot.avatarSettings,
      products: snapshot.avatarSettings.products.map((product) => ({ ...product })),
      scripts: [...snapshot.avatarSettings.scripts],
    },
    manualPlaybackSettings: {
      enabled: snapshot.manualPlaybackSettings.enabled,
      playlist: snapshot.manualPlaybackSettings.playlist.map((item) => ({ ...item })),
    },
  };
}

function sameSnapshot(left: SceneEditorSnapshot, right: SceneEditorSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class SceneEditorHistory {
  private readonly past: SceneEditorSnapshot[] = [];
  private readonly future: SceneEditorSnapshot[] = [];
  private present: SceneEditorSnapshot;

  constructor(initial: SceneEditorSnapshot, private readonly limit = 100) {
    this.present = cloneSnapshot(initial);
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  reset(snapshot: SceneEditorSnapshot): void {
    this.past.length = 0;
    this.future.length = 0;
    this.present = cloneSnapshot(snapshot);
  }

  commit(snapshot: SceneEditorSnapshot): boolean {
    if (sameSnapshot(this.present, snapshot)) return false;
    this.past.push(cloneSnapshot(this.present));
    while (this.past.length > this.limit) this.past.shift();
    this.present = cloneSnapshot(snapshot);
    this.future.length = 0;
    return true;
  }

  undo(): SceneEditorSnapshot | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(cloneSnapshot(this.present));
    this.present = cloneSnapshot(previous);
    return cloneSnapshot(this.present);
  }

  redo(): SceneEditorSnapshot | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneSnapshot(this.present));
    this.present = cloneSnapshot(next);
    return cloneSnapshot(this.present);
  }
}
