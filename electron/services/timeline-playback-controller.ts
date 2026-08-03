import type { SceneRuntimeService } from './scene-runtime';
import type { TimelineOwner, TimelineOwnershipSnapshot, TimelinePublishCommand, TimelinePublishResult } from '../../src/shared/contracts/timeline';

export class TimelinePlaybackController {
  private owner: TimelineOwner | null = null;
  private revision = 0;
  private changedAt: string | null = null;
  private pendingOwner: TimelineOwner | null = null;
  private runtimePlaybackRevision = 0;
  private sourcePlaybackRevision: number | null = null;
  private manualVisualSignature: string | null = null;

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
    return {
      accepted: true,
      event: this.sceneRuntime.publish(command.scene, command.avatarState, presentation, command.tts ?? null),
      playbackRevision: presentation.playbackRevision,
      ...this.snapshot(),
    };
  }
}
