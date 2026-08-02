import type { AvatarSpeechState } from './queue';
import type { ProjectSceneDocument } from './projects';

export interface ScenePresentationState {
  mode: 'scene' | 'stopped' | 'starting' | 'idle' | 'playing' | 'paused' | 'loading' | 'recovering' | 'error';
  activeScriptId: string | null;
  activeLayerId: string | null;
  activeAudioLayerId: string | null;
  pendingAudioLayerId: string | null;
  activeAvatarLayerId: string | null;
  activeAvatarTransitionLayerId: string | null;
  pendingAvatarLayerId: string | null;
  pendingLayerId: string | null;
  managedLayerIds: string[];
  playbackRevision: number;
  // True only when returning from a priority reply to a paused waiting video.
  resumeActiveMedia: boolean;
  activePaused: boolean;
  activeMuted: boolean;
  activeVolume: number;
  activeLoop: boolean;
  activeAudioMuted: boolean;
  activeAudioVolume: number;
}

export function createDefaultScenePresentationState(): ScenePresentationState {
  return { mode: 'scene', activeScriptId: null, activeLayerId: null, pendingLayerId: null, activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null, activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, managedLayerIds: [], playbackRevision: 0, resumeActiveMedia: false, activePaused: true, activeMuted: true, activeVolume: 0, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0 };
}

export interface SceneRuntimeState {
  scene: ProjectSceneDocument;
  avatarState: AvatarSpeechState;
  presentation: ScenePresentationState;
  tts: SceneTtsPlayback | null;
}

export interface SceneTtsPlayback {
  requestId: string;
  audioBase64: string;
  mimeType: string;
  speed: number;
  volume: number;
}

export interface SceneRuntimeEvent {
  kind: 'snapshot' | 'patch';
  revision: number;
  sentAt: string;
  changedKeys: string[];
  state: SceneRuntimeState;
}

export interface SceneRuntimeBrowserLog {
  clientId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

// Sent by the loopback Browser Source when the currently selected timeline
// media reaches its end. The renderer verifies the revision before advancing.
export interface SceneRuntimePlaybackEnded {
  scriptId: string;
  layerId: string;
  playbackRevision: number;
}

export interface SceneRuntimeTtsEvent {
  requestId: string;
  kind: 'started' | 'ended' | 'error';
  error: string | null;
}

export interface SceneRuntimeStatus {
  running: boolean;
  host: '127.0.0.1';
  port: number | null;
  url: string | null;
  revision: number;
  connectedClients: number;
  readyClients: number;
  hasScene: boolean;
  lastPublishedAt: string | null;
  lastReadyAt: string | null;
  recentLogs: SceneRuntimeBrowserLog[];
}
