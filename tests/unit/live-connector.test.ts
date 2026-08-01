import { describe, expect, it, vi } from 'vitest';
import type { NormalizedLiveEvent } from '../../src/shared/contracts/live';
import { LiveSessionService, normalizeTikTokEvent, type LiveConnectorAdapter, type LiveConnectorHandlers } from '../../electron/services/live-connector';

class FakeConnector implements LiveConnectorAdapter {
  handlers: LiveConnectorHandlers | null = null;
  connectCount = 0;
  disconnectCount = 0;

  async connect(username: string, handlers: LiveConnectorHandlers): Promise<{ roomId: string }> {
    this.connectCount += 1;
    this.handlers = handlers;
    return { roomId: `room-${username}` };
  }

  async disconnect(): Promise<void> {
    this.disconnectCount += 1;
    this.handlers = null;
  }

  emit(event: NormalizedLiveEvent): void {
    this.handlers?.onEvent(event);
  }

  end(reason = 'stream-end'): void {
    this.handlers?.onDisconnected(reason);
  }

  fail(error: Error): void {
    this.handlers?.onError(error);
  }
}

describe('TikTok live normalization', () => {
  it('normalizes all interaction types and processes only completed gift streaks', () => {
    const user = { userId: '1', uniqueId: 'lan', nickname: 'Lan' };
    expect(normalizeTikTokEvent('chat', { ...user, comment: 'Xin chào' }, 'chat-1')?.text).toBe('Xin chào');
    expect(normalizeTikTokEvent('like', { ...user, likeCount: 12 }, 'like-1')?.count).toBe(12);
    expect(normalizeTikTokEvent('follow', user, 'follow-1')?.type).toBe('follow');
    expect(normalizeTikTokEvent('share', user, 'share-1')?.type).toBe('share');
    expect(normalizeTikTokEvent('gift', { ...user, giftId: 10, giftName: 'Rose', repeatCount: 3, repeatEnd: false }, 'gift-incomplete')).toBeNull();
    expect(normalizeTikTokEvent('gift', { ...user, giftId: 10, giftName: 'Rose', diamondCount: 1, repeatCount: 3, repeatEnd: true }, 'gift-complete')?.gift).toEqual({
      id: '10', name: 'Rose', diamondCount: 1, repeatCount: 3, repeatEnd: true,
    });
  });
});

describe('LiveSessionService', () => {
  it('probes a room without changing the active session and always disconnects the probe adapter', async () => {
    const active = new FakeConnector();
    const probe = new FakeConnector();
    const adapters = [active, probe];
    const service = new LiveSessionService(() => adapters.shift()!);
    await service.connect({ projectId: 'project-live', username: 'active.room', mode: 'mock' });

    const result = await service.probe({ username: '@probe.room', mode: 'real' });

    expect(result).toMatchObject({ ok: true, username: 'probe.room', roomId: 'room-probe.room' });
    expect(probe.disconnectCount).toBe(1);
    expect(service.getSnapshot()).toMatchObject({ status: 'connected', username: 'active.room' });
  });

  it('connects, counts events, reconnects without stale listeners, clears, and disconnects', async () => {
    const adapters: FakeConnector[] = [];
    const service = new LiveSessionService(() => {
      const adapter = new FakeConnector();
      adapters.push(adapter);
      return adapter;
    });

    await service.connect({ projectId: 'project-live', username: '@studio.demo', mode: 'mock' });
    expect(service.getSnapshot()).toMatchObject({ status: 'connected', username: 'studio.demo', roomId: 'room-studio.demo' });
    adapters[0]?.emit({ id: 'chat-1', type: 'chat', timestamp: new Date().toISOString(), source: 'mock', text: 'Hello' });
    adapters[0]?.emit({ id: 'like-1', type: 'like', timestamp: new Date().toISOString(), source: 'mock', count: 5 });
    expect(service.getSnapshot().counters).toMatchObject({ chat: 1, like: 5 });

    const staleAdapter = adapters[0];
    await service.reconnect();
    expect(staleAdapter?.disconnectCount).toBe(1);
    staleAdapter?.emit({ id: 'stale', type: 'chat', timestamp: new Date().toISOString(), source: 'mock', text: 'Stale' });
    expect(service.getSnapshot().events.some((event) => event.id === 'stale')).toBe(false);
    expect(adapters).toHaveLength(2);

    service.clear();
    expect(service.getSnapshot().events).toEqual([]);
    expect(service.getSnapshot().counters.chat).toBe(0);
    await service.disconnect();
    expect(service.getSnapshot().status).toBe('disconnected');
    expect(adapters[1]?.disconnectCount).toBe(1);
  });

  it('records and replays a validated fixture', async () => {
    const adapter = new FakeConnector();
    const service = new LiveSessionService(() => adapter);
    await service.connect({ projectId: 'project-live', username: 'studio', mode: 'mock' });
    adapter.emit({ id: 'share-1', type: 'share', timestamp: new Date().toISOString(), source: 'mock', count: 1 });
    const recording = service.createRecording();
    service.clear();
    service.replay(recording);
    expect(service.getSnapshot().counters.share).toBe(1);
    expect(service.getSnapshot().events[0]?.id).toContain('replay-share-1');
  });

  it('records stream end and releases the active connector', async () => {
    const adapter = new FakeConnector();
    const service = new LiveSessionService(() => adapter);
    await service.connect({ projectId: 'project-live', username: 'studio', mode: 'real' });

    adapter.end();
    await vi.waitFor(() => expect(adapter.disconnectCount).toBe(1));

    expect(service.getSnapshot()).toMatchObject({
      status: 'ended',
      roomId: null,
      connectedAt: null,
    });
    expect(service.getSnapshot().events[0]).toMatchObject({ type: 'stream-end', source: 'real' });
  });

  it('surfaces connector errors, rejects later stale events, and releases resources', async () => {
    const adapter = new FakeConnector();
    const service = new LiveSessionService(() => adapter);
    await service.connect({ projectId: 'project-live', username: 'studio', mode: 'real' });

    const staleHandlers = adapter.handlers;
    adapter.fail(new TypeError('Room is unavailable.'));
    await vi.waitFor(() => expect(adapter.disconnectCount).toBe(1));
    staleHandlers?.onEvent({ id: 'late-chat', type: 'chat', timestamp: new Date().toISOString(), source: 'real', text: 'Late' });

    expect(service.getSnapshot()).toMatchObject({
      status: 'error',
      roomId: null,
      connectedAt: null,
      lastError: 'Room is unavailable.',
    });
    expect(service.getSnapshot().events[0]).toMatchObject({ type: 'error', errorCode: 'TypeError' });
    expect(service.getSnapshot().events.some((event) => event.id === 'late-chat')).toBe(false);
  });
});
