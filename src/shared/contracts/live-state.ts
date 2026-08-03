export const LIVE_STATES = ['IDLE', 'WELCOME', 'CONSULT', 'DEMO', 'CTA', 'THANKS'] as const;

export type LiveState = typeof LIVE_STATES[number];
export type LiveStateMode = 'idle' | 'loading' | 'playing' | 'error';
export type LiveRuntimeEventKind = 'ready' | 'progress' | 'ended' | 'error';

export interface LiveStateMedia {
  assetId: string;
  kind: 'video' | 'audio';
}

// A cue describes an operator-visible chapter inside a playable state.
export interface LiveTimelineCue {
  checkpoint: string;
  startTime: number;
  endTime: number;
  transition: 'cut' | 'fade';
}

export interface LiveStateDefinition {
  state: LiveState;
  avatar: LiveStateMedia | null;
  audio: LiveStateMedia | null;
  // A state can play a bounded chapter from a longer media asset.
  startAt: number;
  endAt: number | null;
  // Null keeps separate audio synchronized to the visual media time. A value
  // starts separate audio at that offset whenever the state is activated.
  audioStartAt: number | null;
  // Elapsed-time safety cap, independent of media segment bounds.
  duration: number | null;
  priority: number;
  nextState: LiveState | null;
  timeline: LiveTimelineCue[];
}

/**
 * Calculates the audio seek target for a state activation. Independent tracks
 * intentionally restart at their configured offset after an interruption;
 * synchronized tracks follow the resumed visual media checkpoint.
 */
export function liveStateAudioSeekTime(definition: LiveStateDefinition, visualCurrentTime: number): number {
  return definition.audioStartAt ?? visualCurrentTime;
}

export type LiveStateDefinitions = Record<LiveState, LiveStateDefinition>;

export interface PlayStateCommand {
  type: 'PLAY_STATE';
  state: LiveState;
  // When omitted, priority determines whether a non-idle state can interrupt.
  interrupt?: boolean;
}

export interface LiveRuntimeEvent {
  kind: LiveRuntimeEventKind;
  revision: number;
  currentTime?: number;
  message?: string;
}

export interface LiveStateResumeFrame {
  state: LiveState;
  currentTime: number;
}

export interface LiveStateSnapshot {
  mode: LiveStateMode;
  state: LiveState;
  revision: number;
  currentTime: number;
  ready: boolean;
  definition: LiveStateDefinition;
  resumeStack: LiveStateResumeFrame[];
  errorMessage: string | null;
}

export interface LiveStateConfigurationResult {
  enabled: boolean;
  message: string | null;
}

export const DEFAULT_LIVE_STATE_DEFINITIONS: LiveStateDefinitions = {
  IDLE: { state: 'IDLE', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: null, priority: 0, nextState: null, timeline: [] },
  WELCOME: { state: 'WELCOME', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: 8, priority: 100, nextState: 'IDLE', timeline: [] },
  CONSULT: { state: 'CONSULT', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: null, priority: 50, nextState: 'IDLE', timeline: [] },
  DEMO: { state: 'DEMO', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: null, priority: 40, nextState: 'IDLE', timeline: [] },
  CTA: { state: 'CTA', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: 8, priority: 80, nextState: 'IDLE', timeline: [] },
  THANKS: { state: 'THANKS', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: 6, priority: 90, nextState: 'IDLE', timeline: [] },
};
