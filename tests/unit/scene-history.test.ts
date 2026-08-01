import { describe, expect, it } from 'vitest';
import { createProjectSceneLayer } from '../../src/shared/contracts/projects';
import { SceneEditorHistory, type SceneEditorSnapshot } from '../../src/shared/studio/scene-history';

function snapshot(layers: ReturnType<typeof createProjectSceneLayer>[], canvasPreset: 'portrait-1080p' | 'landscape-1080p' = 'portrait-1080p'): SceneEditorSnapshot {
  return {
    canvasPreset,
    layers,
    textStyle: { content: 'Live', font: 'Arial' as const, size: 32, color: '#ffffff', align: 'center' as const, bold: false, italic: false },
    imageSettings: { radius: 0, removeBackground: false, backgroundColor: '#00ff00', backgroundSensitivity: 32 },
    avatarSettings: { productSource: 'manual' as const, productLink: '', products: [{ name: '', information: '' }], scripts: [''] },
    manualPlaybackSettings: { enabled: false, playlist: [] },
  };
}

describe('scene layer history', () => {
  it('undoes and redoes committed layer mutations without sharing nested state', () => {
    const initial = [createProjectSceneLayer('a', 'Avatar', 'avatar')];
    const history = new SceneEditorHistory(snapshot(initial));
    const changed = [...initial, createProjectSceneLayer('b', 'Video', 'video')];
    expect(history.commit(snapshot(changed))).toBe(true);
    changed[0]!.transform.x = 99;

    expect(history.undo()?.layers.map((layer) => layer.id)).toEqual(['a']);
    expect(history.redo()?.layers.map((layer) => layer.id)).toEqual(['a', 'b']);
    expect(history.undo()?.layers[0]?.transform.x).toBe(0);
  });

  it('restores manual playback assignments when deleting or restoring a stacked layout', () => {
    const idle = createProjectSceneLayer('idle-video', 'Idle video', 'video');
    const initial = snapshot([idle]);
    initial.manualPlaybackSettings = { enabled: true, playlist: [{ layerId: 'idle-video', enabled: true }] };
    const history = new SceneEditorHistory(initial);
    const cleared = snapshot([]);
    history.commit(cleared);

    expect(history.undo()).toMatchObject({
      layers: [{ id: 'idle-video' }],
      manualPlaybackSettings: { enabled: true, playlist: [{ layerId: 'idle-video', enabled: true }] },
    });
  });

  it('drops redo state after a new commit and ignores identical snapshots', () => {
    const first = [createProjectSceneLayer('a', 'Image', 'image')];
    const history = new SceneEditorHistory(snapshot(first), 2);
    expect(history.commit(snapshot(first))).toBe(false);
    history.commit(snapshot([...first, createProjectSceneLayer('b', 'Text', 'text')]));
    history.undo();
    history.commit(snapshot([...first, createProjectSceneLayer('c', 'GIF', 'gif')], 'landscape-1080p'));
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toMatchObject({ canvasPreset: 'portrait-1080p', layers: [{ id: 'a' }] });
  });

  it('clones nested layer sources across history snapshots', () => {
    const layer = createProjectSceneLayer('video', 'Video', 'video', {
      type: 'builtin', assetId: 'flower-video', mediaReferenceId: null,
    });
    const history = new SceneEditorHistory(snapshot([layer]));
    history.commit(snapshot([layer], 'landscape-1080p'));
    layer.source.assetId = 'beauty-studio';

    expect(history.undo()?.layers[0]?.source.assetId).toBe('flower-video');
    expect(history.redo()?.layers[0]?.source.assetId).toBe('flower-video');
  });

  it('undoes inspector settings without sharing nested avatar drafts', () => {
    const initial = snapshot([createProjectSceneLayer('text', 'Text', 'text')]);
    const history = new SceneEditorHistory(initial);
    const changed = snapshot(initial.layers);
    changed.textStyle.content = 'Changed';
    changed.imageSettings.radius = 24;
    changed.avatarSettings.products[0]!.name = 'Serum';
    expect(history.commit(changed)).toBe(true);
    changed.avatarSettings.products[0]!.name = 'Mutated later';

    expect(history.undo()).toMatchObject({
      textStyle: { content: 'Live' },
      imageSettings: { radius: 0 },
      avatarSettings: { products: [{ name: '' }] },
    });
    expect(history.redo()).toMatchObject({
      textStyle: { content: 'Changed' },
      imageSettings: { radius: 24 },
      avatarSettings: { products: [{ name: 'Serum' }] },
    });
  });
});
