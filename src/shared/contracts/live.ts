export const LIVE_FIXTURE_FORMAT = 'ai-livestream-live-events' as const;
export const LIVE_FIXTURE_VERSION = 1 as const;
export const MAX_LIVE_FEED_EVENTS = 200;

export type LiveConnectorMode = 'mock' | 'real';
export type LiveConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'error';
export type LiveInteractionType = 'chat' | 'gift' | 'like' | 'follow' | 'share';
export type LiveEventType = LiveInteractionType | 'stream-end' | 'error';

export interface LiveUser {
  id: string;
  uniqueId: string;
  nickname: string;
  avatarUrl?: string;
}

export interface NormalizedLiveEvent {
  id: string;
  type: LiveEventType;
  timestamp: string;
  source: LiveConnectorMode;
  user?: LiveUser;
  text?: string;
  count?: number;
  gift?: {
    id: string;
    name: string;
    diamondCount: number;
    repeatCount: number;
    repeatEnd: boolean;
  };
  errorCode?: string;
}

export interface LiveCounters {
  chat: number;
  gift: number;
  like: number;
  follow: number;
  share: number;
}

export interface LiveConnectInput {
  projectId: string;
  username: string;
  mode: LiveConnectorMode;
}

export interface LiveProbeInput {
  username: string;
  mode: LiveConnectorMode;
}

export interface LiveProbeResult {
  ok: boolean;
  username: string;
  roomId: string | null;
  message: string;
}

export interface LiveSessionSnapshot {
  status: LiveConnectionStatus;
  mode: LiveConnectorMode | null;
  projectId: string | null;
  username: string;
  roomId: string | null;
  connectedAt: string | null;
  lastError: string | null;
  counters: LiveCounters;
  events: NormalizedLiveEvent[];
}

export interface LiveFixtureEnvelope {
  format: typeof LIVE_FIXTURE_FORMAT;
  version: typeof LIVE_FIXTURE_VERSION;
  recordedAt: string;
  events: NormalizedLiveEvent[];
}

export function createEmptyLiveCounters(): LiveCounters {
  return { chat: 0, gift: 0, like: 0, follow: 0, share: 0 };
}

export function createDisconnectedLiveSnapshot(): LiveSessionSnapshot {
  return {
    status: 'disconnected',
    mode: null,
    projectId: null,
    username: '',
    roomId: null,
    connectedAt: null,
    lastError: null,
    counters: createEmptyLiveCounters(),
    events: [],
  };
}

export const DEFAULT_MOCK_LIVE_EVENTS: NormalizedLiveEvent[] = [
  { id: 'mock-chat-1', type: 'chat', timestamp: '2026-07-29T12:00:00.000Z', source: 'mock', user: { id: 'u-1', uniqueId: 'lan.nguyen', nickname: 'Lan' }, text: 'Serum này dùng cho da dầu được không?' },
  { id: 'mock-gift-1', type: 'gift', timestamp: '2026-07-29T12:00:01.000Z', source: 'mock', user: { id: 'u-2', uniqueId: 'minh.anh', nickname: 'Minh Anh' }, count: 1, gift: { id: 'rose', name: 'Rose', diamondCount: 1, repeatCount: 3, repeatEnd: true } },
  { id: 'mock-like-1', type: 'like', timestamp: '2026-07-29T12:00:02.000Z', source: 'mock', user: { id: 'u-3', uniqueId: 'bao.tran', nickname: 'Bảo' }, count: 12 },
  { id: 'mock-follow-1', type: 'follow', timestamp: '2026-07-29T12:00:03.000Z', source: 'mock', user: { id: 'u-4', uniqueId: 'thu.ha', nickname: 'Thu Hà' }, count: 1 },
  { id: 'mock-share-1', type: 'share', timestamp: '2026-07-29T12:00:04.000Z', source: 'mock', user: { id: 'u-5', uniqueId: 'quang.vo', nickname: 'Quang' }, count: 1 },
];
