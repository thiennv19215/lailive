import type { SceneRuntimeService } from './scene-runtime';
import type { TimelineOwner, TimelineOwnershipSnapshot, TimelinePublishCommand, TimelinePublishResult } from '../../src/shared/contracts/timeline';
import type { SceneTtsPlayback } from '../../src/shared/contracts/scene-runtime';
import type { ProjectSceneDocument } from '../../src/shared/contracts/projects';
import type { AvatarSpeechState } from '../../src/shared/contracts/queue';

export class TimelinePlaybackController {
  private owner: TimelineOwner | null = null;
  private revision = 0;
  private changedAt: string | null = null;
  private pendingOwner: TimelineOwner | null = null;
  private runtimePlaybackRevision = 0;
  private sourcePlaybackRevision: number | null = null;
  private manualVisualSignature: string | null = null;
  private currentScene: ProjectSceneDocument | null = null;
  private currentPresentation: TimelinePublishCommand['presentation'] | null = null;
  private currentAvatarState: AvatarSpeechState = 'idle';
  private activeTts: SceneTtsPlayback | null = null;

  constructor(private readonly sceneRuntime: SceneRuntimeService) {}

  snapshot(): TimelineOwnershipSnapshot {
    return { owner: this.owner, revision: this.revision, changedAt: this.changedAt };
  }

  handoff(owner: TimelineOwner): TimelineOwnershipSnapshot {
    // This is an operator intent, not an ownership change. The owner updates
    // atomically with that source's next accepted scene publication.
    this.pendingOwner = owner;
    return this.snapshot();
  }

  private activate(owner: TimelineOwner): void {
    if (this.owner !== owner) {
      this.owner = owner;
      this.revision += 1;
      this.changedAt = new Date().toISOString();
    }
    this.pendingOwner = null;
  }

  // Converts Browser Source revisions back to the producer's local state
  // machine revision after the arbiter assigned its globally unique revision.
  sourceRevisionFor(runtimePlaybackRevision: number): number | null {
    return runtimePlaybackRevision === this.runtimePlaybackRevision ? this.sourcePlaybackRevision : null;
  }

  publish(command: TimelinePublishCommand): TimelinePublishResult {
    if (this.owner !== command.owner) {
      if (this.owner === null && !command.claim && this.pendingOwner !== command.owner) return { accepted: false, event: null, playbackRevision: null, ...this.snapshot() };
      if (this.owner !== null && this.pendingOwner !== command.owner && !command.handoff) return { accepted: false, event: null, playbackRevision: null, ...this.snapshot() };
      this.activate(command.owner);
    }
    this.sourcePlaybackRevision = command.presentation.playbackRevision;
    const presentation = structuredClone(command.presentation);
    const visualSignature = command.owner === 'manual-live' ? JSON.stringify({
      activeLayerId: presentation.activeLayerId, mode: presentation.mode, activePaused: presentation.activePaused,
      activeLoop: presentation.activeLoop, resumeActiveMedia: presentation.resumeActiveMedia, resumeAtMs: presentation.resumeAtMs,
    }) : null;
    const preserveManualVisualRevision = command.owner === 'manual-live' && this.manualVisualSignature === visualSignature;
    if (!preserveManualVisualRevision) presentation.playbackRevision = ++this.runtimePlaybackRevision;
    else presentation.playbackRevision = this.runtimePlaybackRevision;
    this.manualVisualSignature = command.owner === 'manual-live' ? visualSignature : null;
    this.currentScene = structuredClone(command.scene);
    this.currentPresentation = structuredClone(presentation);
    this.currentAvatarState = command.avatarState;
    return {
      accepted: true,
      event: this.sceneRuntime.publish(command.scene, this.activeTts ? 'talking' : command.avatarState, presentation, this.activeTts ?? command.tts ?? null),
      playbackRevision: presentation.playbackRevision,
      ...this.snapshot(),
    };
  }

  playTts(tts: SceneTtsPlayback): void {
    if (!this.currentScene || !this.currentPresentation || !this.owner) throw new Error('SCENE_RUNTIME_SCENE_UNAVAILABLE');
    this.activeTts = structuredClone(tts);
    this.publishCurrentTtsState();
  }

  stopTts(requestId: string): boolean {
    if (this.activeTts?.requestId !== requestId) return false;
    this.activeTts = null;
    this.publishCurrentTtsState();
    return true;
  }

  private publishCurrentTtsState(): void {
    if (!this.currentScene || !this.currentPresentation) return;
    this.sceneRuntime.publish(this.currentScene, this.activeTts ? 'talking' : this.currentAvatarState, this.currentPresentation, this.activeTts);
  }
}
