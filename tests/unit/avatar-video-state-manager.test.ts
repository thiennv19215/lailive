import { describe, expect, it, vi } from 'vitest';
import { AvatarVideoStateManager } from '../../src/modules/playback/avatar-video-state-manager';

describe('AvatarVideoStateManager', () => {
  it('waits for the target video before replacing the visible state', () => {
    vi.useFakeTimers();
    const manager = new AvatarVideoStateManager();
    manager.configure([['idle', 'idle-layer'], ['talk', 'talk-layer']]);
    expect(manager.snapshot().pendingLayerId).toBe('idle-layer');
    manager.ready('idle-layer'); vi.advanceTimersByTime(300);
    manager.request('talk');
    expect(manager.snapshot()).toMatchObject({ activeLayerId: 'idle-layer', pendingLayerId: 'talk-layer' });
    manager.ready('talk-layer');
    expect(manager.snapshot()).toMatchObject({ activeLayerId: 'talk-layer', previousLayerId: null });
    vi.advanceTimersByTime(300);
    expect(manager.snapshot().previousLayerId).toBeNull();
    vi.useRealTimers();
  });

  it('returns an action to idle after it ends', () => {
    vi.useFakeTimers();
    const manager = new AvatarVideoStateManager();
    manager.configure([['idle', 'idle-layer'], ['talk', 'talk-layer']]);
    manager.ready('idle-layer'); vi.advanceTimersByTime(300);
    manager.request('talk'); manager.ready('talk-layer'); vi.advanceTimersByTime(300);
    manager.ended('talk-layer');
    expect(manager.snapshot().pendingLayerId).toBe('idle-layer');
    vi.useRealTimers();
  });
});
