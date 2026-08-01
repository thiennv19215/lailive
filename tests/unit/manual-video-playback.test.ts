import { describe, expect, it } from 'vitest';
import { ManualVideoPlaybackController } from '../../src/modules/playback/manual-video-playback';
import type { ProjectManualPlaybackSettings } from '../../src/shared/contracts/projects';

const settings: ProjectManualPlaybackSettings = { enabled: true, playlist: [
  { layerId: 'r1', enabled: true }, { layerId: 'r2', enabled: true }, { layerId: 'r3', enabled: true },
] };
const layers = ['r1', 'r2', 'r3'].map((id) => ({ id, kind: 'video' as const, loop: false, muted: false, volume: 1, available: true }));

describe('manual video playlist controller', () => {
  it('cycles R1 to R2 to R3 to R1 and rejects stale revisions', () => {
    const controller = new ManualVideoPlaybackController();
    controller.configure(settings, layers);
    expect(controller.start()).toBe(true);
    expect(controller.snapshot().activeLayerId).toBe('r1');
    const firstRevision = controller.snapshot().playbackRevision;
    expect(controller.onEnded('r1', firstRevision - 1)).toBe(false);
    expect(controller.onEnded('r1', firstRevision)).toBe(true);
    expect(controller.snapshot().activeLayerId).toBe('r2');
    expect(controller.onReady('r2', controller.snapshot().playbackRevision)).toBe(true);
    expect(controller.onEnded('r2', controller.snapshot().playbackRevision)).toBe(true);
    expect(controller.onEnded('r3', controller.snapshot().playbackRevision)).toBe(true);
    expect(controller.snapshot().activeLayerId).toBe('r1');
  });

  it('supports pause, resume, skip, stop and exact stale-event guards', () => {
    const controller = new ManualVideoPlaybackController();
    controller.configure(settings, layers);
    controller.start();
    const revision = controller.snapshot().playbackRevision;
    expect(controller.pause()).toBe(true);
    expect(controller.onEnded('r1', revision)).toBe(false);
    expect(controller.resume()).toBe(true);
    expect(controller.onEnded('r1', revision)).toBe(false);
    expect(controller.skip()).toBe(true);
    expect(controller.snapshot().activeLayerId).toBe('r2');
    expect(controller.stop()).toBe(true);
    expect(controller.onEnded('r2', controller.snapshot().playbackRevision)).toBe(false);
    expect(controller.snapshot().mode).toBe('stopped');
  });

  it('skips unavailable items with bounded recovery and errors when all fail', () => {
    const controller = new ManualVideoPlaybackController();
    controller.configure(settings, layers);
    controller.start();
    const firstRevision = controller.snapshot().playbackRevision;
    expect(controller.onError('r1', firstRevision, 'missing')).toBe(true);
    expect(controller.snapshot().activeLayerId).toBe('r2');
    const allInvalid = new ManualVideoPlaybackController();
    allInvalid.configure(settings, layers.map((layer) => ({ ...layer, available: false })));
    allInvalid.start();
    expect(allInvalid.snapshot().mode).toBe('error');
    expect(allInvalid.snapshot().errorMessage).toBeTruthy();
  });

  it('warns for a one-item playlist, propagates media settings, and disposes listeners', () => {
    const controller = new ManualVideoPlaybackController();
    const one = { id: 'one', kind: 'audio' as const, loop: true, muted: true, volume: 0.4, available: true };
    controller.configure({ enabled: true, playlist: [{ layerId: 'one', enabled: true }] }, [one]);
    let notifications = 0;
    const unsubscribe = controller.subscribe(() => { notifications += 1; });
    controller.start();
    expect(controller.snapshot().warnings.length).toBeGreaterThan(0);
    expect(controller.snapshot().activeSettings).toEqual({ loop: true, muted: true, volume: 0.4 });
    unsubscribe();
    controller.dispose();
    const before = notifications;
    controller.stop();
    expect(notifications).toBe(before);
  });
});
