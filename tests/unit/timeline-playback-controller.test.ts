import { describe, expect, it, vi } from 'vitest';
import { TimelinePlaybackController } from '../../electron/services/timeline-playback-controller';
import { createEmptyScene } from '../../src/shared/contracts/projects';
import { createDefaultScenePresentationState } from '../../src/shared/contracts/scene-runtime';

describe('TimelinePlaybackController', () => {
  it('allows the current owner to publish while rejecting an implicit overwrite', () => {
    const publish = vi.fn(() => ({ revision: 1 }));
    const controller = new TimelinePlaybackController({ publish } as never);
    const studio = { owner: 'studio' as const, scene: createEmptyScene(), avatarState: 'idle' as const, presentation: createDefaultScenePresentationState(), claim: true };

    expect(controller.publish(studio)).toMatchObject({ accepted: true, owner: 'studio', playbackRevision: 1 });
    expect(controller.publish({ ...studio, owner: 'manual-live' })).toMatchObject({ accepted: false, owner: 'studio', event: null });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('assigns global Browser Source revisions while retaining the source revision', () => {
    const publishedRevisions: number[] = [];
    const controller = new TimelinePlaybackController({
      publish: (_scene: unknown, _avatarState: unknown, presentation: { playbackRevision: number }) => {
        publishedRevisions.push(presentation.playbackRevision);
        return { revision: 1 };
      },
    } as never);
    const command = { owner: 'studio' as const, scene: createEmptyScene(), avatarState: 'idle' as const, presentation: { ...createDefaultScenePresentationState(), playbackRevision: 42 }, claim: true };

    controller.publish(command);
    controller.publish({ ...command, presentation: { ...command.presentation, playbackRevision: 43 } });
    expect(publishedRevisions).toEqual([1, 2]);
    expect(controller.sourceRevisionFor(1)).toBeNull();
    expect(controller.sourceRevisionFor(2)).toBe(43);
  });

  it('permits an explicit handoff and does not let the former owner reclaim output', () => {
    const publish = vi.fn(() => ({ revision: 1 }));
    const controller = new TimelinePlaybackController({ publish } as never);
    const command = { scene: createEmptyScene(), avatarState: 'idle' as const, presentation: createDefaultScenePresentationState(), claim: true };

    controller.publish({ owner: 'live-state', ...command });
    // The request alone does not change reported ownership; it arms the
    // next source publication so UI ownership matches actual output.
    expect(controller.handoff('manual-live')).toMatchObject({ owner: 'live-state' });
    expect(controller.publish({ owner: 'manual-live', ...command })).toMatchObject({ accepted: true, owner: 'manual-live' });
    expect(controller.publish({ owner: 'live-state', ...command })).toMatchObject({ accepted: false, owner: 'manual-live' });
    expect(controller.snapshot()).toMatchObject({ owner: 'manual-live', revision: 2 });
  });

  it('does not let a passive producer claim output before an operator starts it', () => {
    const publish = vi.fn(() => ({ revision: 1 }));
    const controller = new TimelinePlaybackController({ publish } as never);
    const command = { owner: 'manual-live' as const, scene: createEmptyScene(), avatarState: 'idle' as const, presentation: createDefaultScenePresentationState(), claim: false };

    expect(controller.publish(command)).toMatchObject({ accepted: false, owner: null });
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps a Manual Live visual revision stable for audio-only changes', () => {
    const revisions: number[] = [];
    const controller = new TimelinePlaybackController({
      publish: (_scene: unknown, _avatar: unknown, presentation: { playbackRevision: number }) => {
        revisions.push(presentation.playbackRevision);
        return { revision: revisions.length };
      },
    } as never);
    const visual = { ...createDefaultScenePresentationState(), mode: 'playing' as const, activeLayerId: 'manual-video-a', activePaused: false, activeLoop: true, playbackRevision: 8 };

    controller.handoff('manual-live');
    controller.publish({ owner: 'manual-live', scene: createEmptyScene(), avatarState: 'idle', presentation: visual, claim: true });
    controller.publish({ owner: 'manual-live', scene: createEmptyScene(), avatarState: 'idle', presentation: { ...visual, activeAudioLayerId: 'manual-audio-b', activeAudioVolume: 0.35 }, claim: true });
    expect(revisions).toEqual([1, 1]);
  });

  it('attaches and clears live TTS without replacing the active presentation', () => {
    const publish = vi.fn(() => ({ revision: 1 }));
    const controller = new TimelinePlaybackController({ publish } as never);
    const scene = createEmptyScene();
    const presentation = { ...createDefaultScenePresentationState(), mode: 'playing' as const, activeLayerId: 'manual-video', activeAudioLayerId: 'manual-audio', playbackRevision: 7 };

    controller.handoff('manual-live');
    controller.publish({ owner: 'manual-live', scene, avatarState: 'idle', presentation, claim: true });
    controller.playTts({ requestId: 'tts-1', audioBase64: 'AA==', mimeType: 'audio/wav', speed: 1, volume: 0.8 });
    controller.stopTts('tts-1');

    expect(publish).toHaveBeenNthCalledWith(2, scene, 'talking', expect.objectContaining({ activeLayerId: 'manual-video', activeAudioLayerId: 'manual-audio' }), expect.objectContaining({ requestId: 'tts-1' }));
    expect(publish).toHaveBeenNthCalledWith(3, scene, 'idle', expect.objectContaining({ activeLayerId: 'manual-video', activeAudioLayerId: 'manual-audio' }), null);
  });
});
