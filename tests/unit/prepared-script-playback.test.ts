import { describe, expect, it } from 'vitest';
import { PreparedScriptPlaybackController } from '../../src/modules/playback/prepared-script-playback';

const layers = [
  { id: 'video-r1', kind: 'video' as const, loop: false, muted: false, volume: 1, available: true },
  { id: 'audio-r2', kind: 'audio' as const, loop: false, muted: false, volume: 1, available: true },
  { id: 'avatar-a', kind: 'avatar' as const, loop: true, muted: true, volume: 0, available: true },
  { id: 'avatar-b', kind: 'avatar' as const, loop: true, muted: true, volume: 0, available: true },
];
const settings = { enabled: true, scripts: [
  { id: 'r1', name: 'R1', enabled: true, order: 0, playbackType: 'video' as const, mediaLayerId: 'video-r1', avatarLayerId: 'avatar-a', speechText: '', interruptMode: 'immediate' as const, completionMode: 'next' as const },
  { id: 'r2', name: 'R2', enabled: true, order: 1, playbackType: 'audio' as const, mediaLayerId: 'audio-r2', avatarLayerId: 'avatar-b', speechText: '', interruptMode: 'after-current' as const, completionMode: 'stop' as const },
  { id: 'r3', name: 'R3', enabled: true, order: 2, playbackType: 'tts' as const, mediaLayerId: null, avatarLayerId: 'avatar-a', speechText: 'Xin chao', interruptMode: 'immediate' as const, completionMode: 'stop' as const },
] };

describe('prepared script playback controller', () => {
  it('plays scripts in sequence and ignores stale media callbacks', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure(settings, layers);
    expect(controller.startSequence()).toBe(true);
    const revision = controller.snapshot().playbackRevision;
    expect(controller.onEnded('r1', revision - 1)).toBe(false);
    expect(controller.onReady('r1', revision)).toBe(true);
    expect(controller.onEnded('r1', revision)).toBe(true);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r2', activeLayerId: 'audio-r2', activeAvatarLayerId: 'avatar-b' });
  });

  it('queues after-current scripts while immediate scripts interrupt', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure(settings, layers); controller.startSequence();
    expect(controller.playScript('r2')).toBe(true);
    expect(controller.snapshot().queuedScriptIds).toEqual(['r2']);
    expect(controller.playScript('r3')).toBe(true);
    expect(controller.snapshot().activeScriptId).toBe('r3');
    expect(controller.stop()).toBe(true);
    expect(controller.snapshot().activeScriptId).toBeNull();
  });

  it('rejects missing media and leaves no active script', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure(settings, [{ ...layers[0], available: false }, layers[1]]);
    expect(controller.playScript('r1')).toBe(false);
    expect(controller.snapshot()).toMatchObject({ mode: 'error', activeScriptId: null });
  });

  it('switches to exactly one assigned avatar when an immediate script replaces another', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure({
      ...settings,
      scripts: settings.scripts.map((script) => script.id === 'r2' ? { ...script, interruptMode: 'immediate' as const } : script),
    }, layers);
    controller.playScript('r1');
    expect(controller.snapshot().activeAvatarLayerId).toBe('avatar-a');
    controller.playScript('r2');
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r2', activeAvatarLayerId: 'avatar-b', queuedScriptIds: [] });
    controller.stop();
    expect(controller.snapshot().activeAvatarLayerId).toBeNull();
  });
});
