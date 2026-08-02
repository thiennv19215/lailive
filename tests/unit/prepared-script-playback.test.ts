import { describe, expect, it } from 'vitest';
import { PreparedScriptPlaybackController } from '../../src/modules/playback/prepared-script-playback';

const layers = [
  { id: 'video-r1', kind: 'video' as const, loop: false, muted: false, volume: 1, available: true },
  { id: 'audio-r2', kind: 'audio' as const, loop: false, muted: false, volume: 1, available: true },
  { id: 'avatar-a', kind: 'avatar' as const, loop: true, muted: true, volume: 0, available: true },
  { id: 'avatar-b', kind: 'avatar' as const, loop: true, muted: true, volume: 0, available: true },
];
const settings = { enabled: true, scripts: [
  { id: 'r1', name: 'R1', enabled: true, order: 0, playbackType: 'video' as const, role: 'idle' as const, mediaLayerId: 'video-r1', audioLayerId: null, avatarLayerId: 'avatar-a', speechText: '', interruptMode: 'immediate' as const, completionMode: 'next' as const },
  { id: 'r2', name: 'R2', enabled: true, order: 1, playbackType: 'audio' as const, role: 'activation' as const, mediaLayerId: 'audio-r2', audioLayerId: null, avatarLayerId: 'avatar-b', speechText: '', interruptMode: 'after-current' as const, completionMode: 'stop' as const },
  { id: 'r3', name: 'R3', enabled: true, order: 2, playbackType: 'tts' as const, role: 'conversation' as const, mediaLayerId: null, audioLayerId: null, avatarLayerId: 'avatar-a', speechText: 'Xin chao', interruptMode: 'immediate' as const, completionMode: 'stop' as const },
] };

describe('prepared script playback controller', () => {
  it('plays only waiting scripts in a repeating sequence and ignores stale media callbacks', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure(settings, layers);
    expect(controller.startSequence()).toBe(true);
    const revision = controller.snapshot().playbackRevision;
    expect(controller.onEnded('r1', revision - 1)).toBe(false);
    expect(controller.onReady('r1', revision)).toBe(true);
    expect(controller.onEnded('r1', revision)).toBe(true);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r1', activeLayerId: 'video-r1', activeAvatarLayerId: 'avatar-a' });
  });

  it('moves from one waiting video to the next instead of looping the first video', () => {
    const controller = new PreparedScriptPlaybackController();
    controller.configure({ ...settings, scripts: [
      settings.scripts[0]!,
      { ...settings.scripts[0]!, id: 'r4', name: 'R4', order: 1, mediaLayerId: 'video-r2' },
    ] }, [...layers, { ...layers[0]!, id: 'video-r2' }]);
    controller.startSequence();
    const firstRevision = controller.snapshot().playbackRevision;
    controller.onEnded('r1', firstRevision);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r4', activeLayerId: 'video-r2' });
  });

  it('returns to the first waiting video after the last waiting video ends', () => {
    const controller = new PreparedScriptPlaybackController();
    controller.configure({ ...settings, scripts: [
      settings.scripts[0]!,
      { ...settings.scripts[0]!, id: 'r4', name: 'R4', order: 1, mediaLayerId: 'video-r2' },
    ] }, [...layers, { ...layers[0]!, id: 'video-r2' }]);
    controller.startSequence();
    controller.onEnded('r1', controller.snapshot().playbackRevision);
    controller.onEnded('r4', controller.snapshot().playbackRevision);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r1', activeLayerId: 'video-r1' });
  });

  it('plays an uploaded video avatar as timeline video media', () => {
    const controller = new PreparedScriptPlaybackController();
    controller.configure({ ...settings, scripts: [{ ...settings.scripts[0]!, mediaLayerId: 'avatar-a', avatarLayerId: null }] }, layers);
    expect(controller.startSequence()).toBe(true);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r1', activeLayerId: 'avatar-a' });
  });

  it('continues with the next waiting script if the interrupted one is removed', () => {
    const controller = new PreparedScriptPlaybackController();
    controller.configure({ ...settings, scripts: [
      settings.scripts[0]!,
      settings.scripts[1]!,
      { ...settings.scripts[0]!, id: 'r4', name: 'R4', order: 2, mediaLayerId: 'video-r2' },
    ] }, [...layers, { ...layers[0]!, id: 'video-r2' }]);
    controller.startSequence();
    controller.playRole('activation');
    controller.removeScripts(['r1']);
    const priorityRevision = controller.snapshot().playbackRevision;
    controller.onEnded('r2', priorityRevision);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r4', activeLayerId: 'video-r2' });
  });

  it('does not resume a waiting video after a manual immediate playback replaces the priority reply', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure(settings, layers);
    controller.startSequence();
    controller.playRole('activation');
    expect(controller.playScript('r3')).toBe(true);
    const revision = controller.snapshot().playbackRevision;
    controller.onEnded('r3', revision);
    expect(controller.snapshot().activeScriptId).toBeNull();
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

  it('interrupts idle with conversation and returns to idle after the response', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure(settings, layers);
    expect(controller.playRole('idle')).toBe(true);
    expect(controller.snapshot().activeScriptId).toBe('r1');
    expect(controller.playRole('conversation')).toBe(true);
    const revision = controller.snapshot().playbackRevision;
    expect(controller.onEnded('r3', revision)).toBe(true);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r1', activeAvatarLayerId: 'avatar-a', resumeActiveMedia: true });
  });

  it('queues each priority reply FIFO, then resumes the interrupted waiting video', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure(settings, layers);
    controller.startSequence();
    const waitingRevision = controller.snapshot().playbackRevision;
    controller.onReady('r1', waitingRevision);
    expect(controller.playRole('activation')).toBe(true);
    const activationRevision = controller.snapshot().playbackRevision;
    expect(controller.playRole('conversation')).toBe(true);
    expect(controller.playRole('conversation')).toBe(true);
    expect(controller.snapshot().queuedScriptIds).toEqual(['r3', 'r3']);
    controller.onEnded('r2', activationRevision);
    const firstConversationRevision = controller.snapshot().playbackRevision;
    controller.onEnded('r3', firstConversationRevision);
    const secondConversationRevision = controller.snapshot().playbackRevision;
    controller.onEnded('r3', secondConversationRevision);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r1', resumeActiveMedia: true });
  });

  it('waits for an active response to finish before switching conversation mode', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure(settings, layers);
    controller.playScript('r2');
    const responseRevision = controller.snapshot().playbackRevision;
    expect(controller.playRole('conversation')).toBe(true);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r2', queuedScriptIds: ['r3'] });
    expect(controller.onEnded('r2', responseRevision)).toBe(true);
    expect(controller.snapshot()).toMatchObject({ activeScriptId: 'r3', queuedScriptIds: [] });
  });

  it('starts an attached audio track with its video and clears it at completion', () => {
    const controller = new PreparedScriptPlaybackController(); controller.configure({
      ...settings,
      scripts: settings.scripts.map((script) => script.id === 'r1' ? { ...script, audioLayerId: 'audio-r2' } : script),
    }, layers);
    expect(controller.playScript('r1')).toBe(true);
    const revision = controller.snapshot().playbackRevision;
    expect(controller.snapshot()).toMatchObject({ activeLayerId: 'video-r1', activeAudioLayerId: 'audio-r2' });
    expect(controller.onEnded('r1', revision)).toBe(true);
    expect(controller.snapshot().activeAudioLayerId).toBeNull();
  });
});
