import { describe, expect, it } from 'vitest';
import { ManualVideoPlaybackController } from '../../src/modules/playback/manual-video-playback';

const settings = {
  enabled: true,
  idleLayerIds: ['idle-r1', 'idle-r2', 'idle-r3'],
  responseLayerIds: ['reply-1', 'reply-2'],
  selectedResponseLayerId: 'reply-1',
};

describe('ManualVideoPlaybackController', () => {
  it('cycles idle scripts in order and loops back to R1', () => {
    const controller = new ManualVideoPlaybackController();
    controller.configure(settings, [...settings.idleLayerIds, ...settings.responseLayerIds]);
    expect(controller.snapshot()).toMatchObject({ mode: 'idle', activeLayerId: 'idle-r1', idleIndex: 0 });

    let snapshot = controller.snapshot();
    controller.onEnded(snapshot.activeLayerId!, snapshot.playbackRevision);
    expect(controller.snapshot()).toMatchObject({ mode: 'idle', activeLayerId: 'idle-r2', idleIndex: 1 });

    snapshot = controller.snapshot();
    controller.onEnded(snapshot.activeLayerId!, snapshot.playbackRevision);
    snapshot = controller.snapshot();
    controller.onEnded(snapshot.activeLayerId!, snapshot.playbackRevision);
    expect(controller.snapshot()).toMatchObject({ mode: 'idle', activeLayerId: 'idle-r1', idleIndex: 0 });
  });

  it('interrupts idle playback for a manual reply and resumes the next script', () => {
    const controller = new ManualVideoPlaybackController();
    controller.configure(settings, [...settings.idleLayerIds, ...settings.responseLayerIds]);
    expect(controller.enqueueReply('comment-1')).toBe(true);
    expect(controller.snapshot()).toMatchObject({ mode: 'response', activeLayerId: 'reply-1', activeReplyEventId: 'comment-1', replyStates: { 'comment-1': 'playing' } });

    const reply = controller.snapshot();
    controller.onEnded(reply.activeLayerId!, reply.playbackRevision);
    expect(controller.snapshot()).toMatchObject({ mode: 'idle', activeLayerId: 'idle-r2', replyStates: { 'comment-1': 'done' } });
  });

  it('queues repeated operator replies without overlapping videos', () => {
    const controller = new ManualVideoPlaybackController();
    controller.configure(settings, [...settings.idleLayerIds, ...settings.responseLayerIds]);
    controller.enqueueReply('comment-1');
    controller.enqueueReply('comment-2', 'reply-2');
    expect(controller.snapshot()).toMatchObject({ activeReplyEventId: 'comment-1', queuedReplies: [{ eventId: 'comment-2', state: 'queued' }] });

    const first = controller.snapshot();
    controller.onEnded(first.activeLayerId!, first.playbackRevision);
    expect(controller.snapshot()).toMatchObject({ mode: 'response', activeLayerId: 'reply-2', activeReplyEventId: 'comment-2' });
  });

  it('pauses, resumes from the beginning, skips, and rejects missing response videos', () => {
    const controller = new ManualVideoPlaybackController();
    controller.configure(settings, [...settings.idleLayerIds, ...settings.responseLayerIds]);
    const revision = controller.snapshot().playbackRevision;
    expect(controller.pause()).toBe(true);
    expect(controller.snapshot().mode).toBe('paused');
    expect(controller.resume()).toBe(true);
    expect(controller.snapshot().playbackRevision).toBeGreaterThan(revision);
    expect(controller.skip()).toBe(true);
    expect(controller.snapshot().activeLayerId).toBe('idle-r2');

    controller.configure({ ...settings, responseLayerIds: [], selectedResponseLayerId: null }, settings.idleLayerIds);
    expect(controller.enqueueReply('comment-missing')).toBe(false);
  });
});
