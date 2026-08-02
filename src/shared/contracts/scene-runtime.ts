import type { AvatarSpeechState } from './queue';
import type { ProjectSceneDocument } from './projects';

export interface ScenePresentationState {
  mode: 'scene' | 'stopped' | 'starting' | 'idle' | 'playing' | 'paused' | 'loading' | 'recovering' | 'error';
  activeScriptId: string | null;
  activeLayerId: string | null;
  activeAudioLayerId: string | null;
  activeAvatarLayerId: string | null;
  activeAvatarTransitionLayerId: string | null;
  pendingAvatarLayerId: string | null;
  managedLayerIds: string[];
  playbackRevision: number;
  activePaused: boolean;
  activeMuted: boolean;
  activeVolume: number;
  activeLoop: boolean;
  activeAudioMuted: boolean;
  activeAudioVolume: number;
}

export function createDefaultScenePresentationState(): ScenePresentationState {
  return { mode: 'scene', activeScriptId: null, activeLayerId: null, activeAudioLayerId: null, activeAvatarLayerId: null, activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, managedLayerIds: [], playbackRevision: 0, activePaused: true, activeMuted: true, activeVolume: 0, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0 };
}

export interface SceneRuntimeState {
  scene: ProjectSceneDocument;
  avatarState: AvatarSpeechState;
  presentation: ScenePresentationState;
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
