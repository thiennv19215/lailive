import type { AvatarSpeechState } from './queue';
import type { ProjectSceneDocument } from './projects';
import type { ScenePresentationState, SceneRuntimeEvent, SceneTtsPlayback } from './scene-runtime';

// Exactly one producer may control the Browser Source at a time.
export type TimelineOwner = 'studio' | 'manual-live' | 'live-state' | 'prepared-live-program';

export interface TimelineOwnershipSnapshot {
  owner: TimelineOwner | null;
  revision: number;
  changedAt: string | null;
}

export interface TimelinePublishCommand {
  owner: TimelineOwner;
  scene: ProjectSceneDocument;
  avatarState: AvatarSpeechState;
  presentation: ScenePresentationState;
  tts?: SceneTtsPlayback | null;
  // A user action may deliberately replace the currently active producer.
  handoff?: boolean;
  // Passive configuration updates must not claim output from the active owner.
  claim?: boolean;
}

export interface TimelinePublishResult extends TimelineOwnershipSnapshot {
  accepted: boolean;
  event: SceneRuntimeEvent | null;
  playbackRevision: number | null;
}
