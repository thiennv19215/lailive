import { EventEmitter } from 'node:events';
import { ControlEvent, WebcastEvent } from 'tiktok-live-connector';
import { WebcastPushConnection } from 'tiktok-live-connector/legacy';
import {
  LIVE_FIXTURE_FORMAT,
  LIVE_FIXTURE_VERSION,
  MAX_LIVE_FEED_EVENTS,
  DEFAULT_MOCK_LIVE_EVENTS,
  createDisconnectedLiveSnapshot,
  createEmptyLiveCounters,
  type LiveConnectInput,
  type LiveConnectorMode,
  type LiveFixtureEnvelope,
  type LiveInteractionType,
  type LiveProbeInput,
  type LiveProbeResult,
  type LiveSessionSnapshot,
  type LiveUser,
  type NormalizedLiveEvent,
} from '../../src/shared/contracts/live';
import { liveConnectSchema, liveFixtureEnvelopeSchema, liveProbeSchema, normalizedLiveEventSchema } from '../../src/shared/validation/live';

export interface LiveConnectorHandlers {
  onEvent(event: NormalizedLiveEvent): void;
  onDisconnected(reason?: string): void;
  onError(error: Error): void;
}

export interface LiveConnectorAdapter {
  connect(username: string, handlers: LiveConnectorHandlers): Promise<{ roomId: string }>;
  disconnect(): Promise<void>;
}

type AdapterFactory = (mode: LiveConnectorMode) => LiveConnectorAdapter;
type RawEvent = Record<string, unknown>;

function asRecord(value: unknown): RawEvent {
  return value && typeof value === 'object' ? value as RawEvent : {};
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function userFromRaw(raw: RawEvent): LiveUser | undefined {
  const nested = asRecord(raw.user);
  const uniqueId = stringValue(raw.uniqueId ?? nested.uniqueId);
  const nickname = stringValue(raw.nickname ?? nested.nickname, uniqueId || 'TikTok user');
  const id = stringValue(raw.userId ?? nested.userId ?? nested.id, uniqueId || nickname);
  const avatarUrl = stringValue(raw.profilePictureUrl ?? nested.profilePictureUrl ?? nested.avatarThumb);
  if (!id && !uniqueId && !nickname) return undefined;
  return { id, uniqueId, nickname, ...(avatarUrl.startsWith('http') ? { avatarUrl } : {}) };
}

export function normalizeTikTokEvent(
  type: LiveInteractionType,
  input: unknown,
  id: string,
  timestamp = new Date().toISOString(),
  source: LiveConnectorMode = 'real',
): NormalizedLiveEvent | null {
  const raw = asRecord(input);
  if (type === 'gift' && raw.repeatEnd !== true) return null;
  const base = { id, type, timestamp, source, user: userFromRaw(raw) } satisfies NormalizedLiveEvent;
  if (type === 'chat') return normalizedLiveEventSchema.parse({ ...base, text: stringValue(raw.comment ?? raw.text) });
  if (type === 'like') return normalizedLiveEventSchema.parse({ ...base, count: numberValue(raw.likeCount ?? raw.count, 1) });
  if (type === 'gift') {
    const extended = asRecord(raw.extendedGiftInfo);
    return normalizedLiveEventSchema.parse({
      ...base,
      count: 1,
      gift: {
        id: stringValue(raw.giftId ?? extended.id),
        name: stringValue(raw.giftName ?? extended.name, 'Gift'),
        diamondCount: numberValue(raw.diamondCount ?? extended.diamondCount),
        repeatCount: Math.max(1, numberValue(raw.repeatCount, 1)),
        repeatEnd: true,
      },
    });
  }
  return normalizedLiveEventSchema.parse({ ...base, count: 1 });
}

export class MockLiveConnector implements LiveConnectorAdapter {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private connected = false;

  constructor(private readonly events = DEFAULT_MOCK_LIVE_EVENTS, private readonly intervalMs = 120) {}

  async connect(username: string, handlers: LiveConnectorHandlers): Promise<{ roomId: string }> {
    await this.disconnect();
    this.connected = true;
    this.events.forEach((event, index) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (this.connected) handlers.onEvent({ ...event, id: `${event.id}-${Date.now()}` });
      }, this.intervalMs * (index + 1));
      this.timers.add(timer);
    });
    return { roomId: `mock-${username}` };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}

export class TikTokLiveConnectorAdapter implements LiveConnectorAdapter {
  private connection: (EventEmitter & { connect(): Promise<{ roomId: string }>; disconnect(): Promise<void> }) | null = null;
  private sequence = 0;

  async connect(username: string, handlers: LiveConnectorHandlers): Promise<{ roomId: string }> {
    await this.disconnect();
    const Connection = WebcastPushConnection as unknown as new (uniqueId: string, options: Record<string, unknown>) => EventEmitter & { connect(): Promise<{ roomId: string }>; disconnect(): Promise<void> };
    const connection = new Connection(username, {
      processInitialData: false,
      enableExtendedGiftInfo: true,
      requestPollingIntervalMs: 1000,
    });
    this.connection = connection;
    const bind = (eventName: string, type: LiveInteractionType): void => {
      connection.on(eventName, (raw: unknown) => {
        this.sequence += 1;
        const event = normalizeTikTokEvent(type, raw, `real-${this.sequence}`);
        if (event) handlers.onEvent(event);
      });
    };
    bind(WebcastEvent.CHAT, 'chat');
    bind(WebcastEvent.GIFT, 'gift');
    bind(WebcastEvent.LIKE, 'like');
    bind(WebcastEvent.FOLLOW, 'follow');
    bind(WebcastEvent.SHARE, 'share');
    connection.on(WebcastEvent.STREAM_END, () => handlers.onDisconnected('stream-end'));
    connection.on(ControlEvent.DISCONNECTED, (event: unknown) => handlers.onDisconnected(stringValue(asRecord(event).reason)));
    connection.on(ControlEvent.ERROR, (error: unknown) => handlers.onError(error instanceof Error ? error : new Error(String(error))));
    return connection.connect();
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    if (!connection) return;
    connection.removeAllListeners();
    await connection.disconnect().catch(() => undefined);
  }
}

export class LiveSessionService {
  private snapshot: LiveSessionSnapshot = createDisconnectedLiveSnapshot();
  private adapter: LiveConnectorAdapter | null = null;
  private generation = 0;
  private readonly listeners = new Set<(snapshot: LiveSessionSnapshot) => void>();

  constructor(private readonly createAdapter: AdapterFactory = (mode) => mode === 'mock' ? new MockLiveConnector() : new TikTokLiveConnectorAdapter()) {}

  getSnapshot(): LiveSessionSnapshot {
    return structuredClone(this.snapshot);
  }

  subscribe(listener: (snapshot: LiveSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async probe(input: LiveProbeInput): Promise<LiveProbeResult> {
    const parsed = liveProbeSchema.parse(input);
    const adapter = this.createAdapter(parsed.mode);
    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('TIKTOK_PROBE_TIMEOUT')), 15_000);
    });
    try {
      const result = await Promise.race([
        adapter.connect(parsed.username, {
          onEvent: () => undefined,
          onDisconnected: () => undefined,
          onError: () => undefined,
        }),
        timeout,
      ]);
      return {
        ok: true,
        username: parsed.username,
        roomId: result.roomId,
        message: `Đã tìm thấy phòng live @${parsed.username}.`,
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'TIKTOK_PROBE_FAILED';
      return {
        ok: false,
        username: parsed.username,
        roomId: null,
        message: liveProbeErrorMessage(code),
      };
    } finally {
      await adapter.disconnect().catch(() => undefined);
    }
  }

  async connect(input: LiveConnectInput, reconnecting = false): Promise<LiveSessionSnapshot> {
    const parsed = liveConnectSchema.parse(input);
    await this.stopAdapter();
    const generation = ++this.generation;
    this.snapshot = {
      ...createDisconnectedLiveSnapshot(),
      status: reconnecting ? 'reconnecting' : 'connecting',
      mode: parsed.mode,
      projectId: parsed.projectId,
      username: parsed.username,
    };
    this.emit();
    const adapter = this.createAdapter(parsed.mode);
    this.adapter = adapter;
    try {
      const result = await adapter.connect(parsed.username, {
        onEvent: (event) => { if (generation === this.generation) this.pushEvent(event); },
        onDisconnected: (reason) => { if (generation === this.generation) void this.handleDisconnected(reason); },
        onError: (error) => { if (generation === this.generation) void this.handleError(error); },
      });
      if (generation !== this.generation) return this.getSnapshot();
      this.snapshot.status = 'connected';
      this.snapshot.roomId = result.roomId;
      this.snapshot.connectedAt = new Date().toISOString();
      this.emit();
      return this.getSnapshot();
    } catch (error) {
      if (generation === this.generation) await this.handleError(error instanceof Error ? error : new Error(String(error)));
      else await this.stopAdapter();
      return this.getSnapshot();
    }
  }

  async reconnect(): Promise<LiveSessionSnapshot> {
    if (!this.snapshot.projectId || !this.snapshot.mode || !this.snapshot.username) throw new Error('No previous live session is available.');
    return this.connect({ projectId: this.snapshot.projectId, mode: this.snapshot.mode, username: this.snapshot.username }, true);
  }

  async disconnect(): Promise<LiveSessionSnapshot> {
    ++this.generation;
    await this.stopAdapter();
    this.snapshot.status = 'disconnected';
    this.snapshot.roomId = null;
    this.snapshot.connectedAt = null;
    this.emit();
    return this.getSnapshot();
  }

  clear(): LiveSessionSnapshot {
    this.snapshot.events = [];
    this.snapshot.counters = createEmptyLiveCounters();
    this.emit();
    return this.getSnapshot();
  }

  createRecording(): LiveFixtureEnvelope {
    return {
      format: LIVE_FIXTURE_FORMAT,
      version: LIVE_FIXTURE_VERSION,
      recordedAt: new Date().toISOString(),
      events: this.snapshot.events.map((event) => ({ ...event })),
    };
  }

  replay(fixture: LiveFixtureEnvelope): LiveSessionSnapshot {
    const parsed = liveFixtureEnvelopeSchema.parse(fixture);
    for (const event of parsed.events) this.pushEvent({ ...event, id: `replay-${event.id}-${Date.now()}`, source: 'mock' });
    return this.getSnapshot();
  }

  async close(): Promise<void> {
    await this.disconnect();
    this.listeners.clear();
  }

  private pushEvent(event: NormalizedLiveEvent): void {
    const parsed = normalizedLiveEventSchema.parse(event);
    this.snapshot.events = [parsed, ...this.snapshot.events].slice(0, MAX_LIVE_FEED_EVENTS);
    if (parsed.type === 'chat') this.snapshot.counters.chat += 1;
    else if (parsed.type === 'gift') this.snapshot.counters.gift += 1;
    else if (parsed.type === 'like') this.snapshot.counters.like += parsed.count ?? 1;
    else if (parsed.type === 'follow') this.snapshot.counters.follow += 1;
    else if (parsed.type === 'share') this.snapshot.counters.share += 1;
    this.emit();
  }

  private async handleDisconnected(reason?: string): Promise<void> {
    ++this.generation;
    this.snapshot.status = reason === 'stream-end' ? 'ended' : 'disconnected';
    this.snapshot.roomId = null;
    this.snapshot.connectedAt = null;
    if (reason === 'stream-end') this.pushEvent({
      id: `stream-end-${Date.now()}`,
      type: 'stream-end',
      timestamp: new Date().toISOString(),
      source: this.snapshot.mode ?? 'real',
      text: 'Livestream đã kết thúc.',
    });
    else this.emit();
    await this.stopAdapter();
  }

  private async handleError(error: Error): Promise<void> {
    ++this.generation;
    this.snapshot.status = 'error';
    this.snapshot.roomId = null;
    this.snapshot.connectedAt = null;
    this.snapshot.lastError = error.message;
    this.pushEvent({
      id: `live-error-${Date.now()}`,
      type: 'error',
      timestamp: new Date().toISOString(),
      source: this.snapshot.mode ?? 'real',
      text: error.message,
      errorCode: error.name,
    });
    await this.stopAdapter();
  }

  private async stopAdapter(): Promise<void> {
    const adapter = this.adapter;
    this.adapter = null;
    if (adapter) await adapter.disconnect();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function liveProbeErrorMessage(code: string): string {
  if (/offline|not live|user.*offline/i.test(code)) return 'Tài khoản hợp lệ nhưng hiện không phát live.';
  if (/timeout/i.test(code)) return 'TikTok phản hồi quá chậm; hãy kiểm tra mạng rồi thử lại.';
  if (/invalid.*unique|username|user.*not found/i.test(code)) return 'Không tìm thấy tài khoản TikTok này.';
  return `Không thể mở phòng TikTok: ${code}`;
}
