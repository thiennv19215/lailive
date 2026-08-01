import type { ProjectManualPlaybackSettings } from '../../shared/contracts/projects';

export type ManualVideoPlaybackMode = 'stopped' | 'idle' | 'response' | 'paused';
export type ManualReplyState = 'queued' | 'playing' | 'done' | 'skipped';

export interface ManualVideoReplyJob {
  id: string;
  eventId: string;
  layerId: string;
  state: ManualReplyState;
}

export interface ManualVideoPlaybackSnapshot {
  mode: ManualVideoPlaybackMode;
  activeLayerId: string | null;
  activeReplyEventId: string | null;
  playbackRevision: number;
  idleIndex: number;
  queuedReplies: ManualVideoReplyJob[];
  replyStates: Record<string, ManualReplyState>;
}

function cloneSnapshot(snapshot: ManualVideoPlaybackSnapshot): ManualVideoPlaybackSnapshot {
  return {
    ...snapshot,
    queuedReplies: snapshot.queuedReplies.map((job) => ({ ...job })),
    replyStates: { ...snapshot.replyStates },
  };
}

export class ManualVideoPlaybackController {
  private settings: ProjectManualPlaybackSettings = { enabled: false, idleLayerIds: [], responseLayerIds: [], selectedResponseLayerId: null };
  private validLayerIds = new Set<string>();
  private resumeMode: Exclude<ManualVideoPlaybackMode, 'paused'> = 'stopped';
  private snapshotValue: ManualVideoPlaybackSnapshot = {
    mode: 'stopped', activeLayerId: null, activeReplyEventId: null,
    playbackRevision: 0, idleIndex: 0, queuedReplies: [], replyStates: {},
  };
  private readonly listeners = new Set<(snapshot: ManualVideoPlaybackSnapshot) => void>();

  subscribe(listener: (snapshot: ManualVideoPlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): ManualVideoPlaybackSnapshot { return cloneSnapshot(this.snapshotValue); }

  configure(settings: ProjectManualPlaybackSettings, validLayerIds: readonly string[]): void {
    this.validLayerIds = new Set(validLayerIds);
    const idleLayerIds = settings.idleLayerIds.filter((id) => this.validLayerIds.has(id));
    const responseLayerIds = settings.responseLayerIds.filter((id) => this.validLayerIds.has(id));
    this.settings = {
      enabled: settings.enabled,
      idleLayerIds,
      responseLayerIds,
      selectedResponseLayerId: settings.selectedResponseLayerId && responseLayerIds.includes(settings.selectedResponseLayerId)
        ? settings.selectedResponseLayerId
        : responseLayerIds[0] ?? null,
    };
    this.snapshotValue.queuedReplies = this.snapshotValue.queuedReplies.filter((job) => responseLayerIds.includes(job.layerId));
    if (!settings.enabled) {
      this.stop();
      return;
    }
    if (this.snapshotValue.activeLayerId && !this.validLayerIds.has(this.snapshotValue.activeLayerId)) {
      this.startIdle();
      return;
    }
    if (this.snapshotValue.mode === 'stopped') this.startIdle();
    else this.emit();
  }

  startIdle(layerId?: string): boolean {
    if (!this.settings.enabled || this.settings.idleLayerIds.length === 0) return this.stop();
    const requestedIndex = layerId ? this.settings.idleLayerIds.indexOf(layerId) : -1;
    const index = requestedIndex >= 0 ? requestedIndex : Math.min(this.snapshotValue.idleIndex, this.settings.idleLayerIds.length - 1);
    this.snapshotValue.idleIndex = Math.max(0, index);
    this.activate('idle', this.settings.idleLayerIds[this.snapshotValue.idleIndex]!, null);
    return true;
  }

  playNextIdle(): boolean {
    if (this.settings.idleLayerIds.length === 0) return this.stop();
    this.snapshotValue.idleIndex = (this.snapshotValue.idleIndex + 1) % this.settings.idleLayerIds.length;
    return this.startIdle(this.settings.idleLayerIds[this.snapshotValue.idleIndex]);
  }

  enqueueReply(eventId: string, layerId = this.settings.selectedResponseLayerId): boolean {
    if (!this.settings.enabled || !layerId || !this.settings.responseLayerIds.includes(layerId)) return false;
    const job: ManualVideoReplyJob = { id: `manual-reply-${eventId}-${Date.now()}`, eventId, layerId, state: 'queued' };
    this.snapshotValue.replyStates[eventId] = 'queued';
    if (this.snapshotValue.mode === 'response' || (this.snapshotValue.mode === 'paused' && this.resumeMode === 'response')) {
      this.snapshotValue.queuedReplies.push(job);
      this.emit();
      return true;
    }
    this.playReply(job);
    return true;
  }

  pause(): boolean {
    if (this.snapshotValue.mode === 'stopped' || this.snapshotValue.mode === 'paused') return false;
    this.resumeMode = this.snapshotValue.mode;
    this.snapshotValue.mode = 'paused';
    this.emit();
    return true;
  }

  resume(): boolean {
    if (this.snapshotValue.mode !== 'paused' || !this.snapshotValue.activeLayerId) return false;
    this.snapshotValue.mode = this.resumeMode;
    this.snapshotValue.playbackRevision += 1;
    this.emit();
    return true;
  }

  skip(): boolean {
    if (this.snapshotValue.mode === 'response' || (this.snapshotValue.mode === 'paused' && this.resumeMode === 'response')) {
      if (this.snapshotValue.activeReplyEventId) this.snapshotValue.replyStates[this.snapshotValue.activeReplyEventId] = 'skipped';
      return this.playNextReplyOrIdle();
    }
    return this.playNextIdle();
  }

  onEnded(layerId: string, playbackRevision: number): boolean {
    if (this.snapshotValue.mode === 'paused' || this.snapshotValue.activeLayerId !== layerId || this.snapshotValue.playbackRevision !== playbackRevision) return false;
    if (this.snapshotValue.mode === 'response') {
      if (this.snapshotValue.activeReplyEventId) this.snapshotValue.replyStates[this.snapshotValue.activeReplyEventId] = 'done';
      return this.playNextReplyOrIdle();
    }
    if (this.snapshotValue.mode === 'idle') return this.playNextIdle();
    return false;
  }

  clearReplies(): void {
    for (const job of this.snapshotValue.queuedReplies) this.snapshotValue.replyStates[job.eventId] = 'skipped';
    this.snapshotValue.queuedReplies = [];
    if (this.snapshotValue.mode === 'response') {
      if (this.snapshotValue.activeReplyEventId) this.snapshotValue.replyStates[this.snapshotValue.activeReplyEventId] = 'skipped';
      this.startIdle();
    } else this.emit();
  }

  stop(): boolean {
    const changed = this.snapshotValue.mode !== 'stopped' || this.snapshotValue.activeLayerId !== null;
    this.snapshotValue.mode = 'stopped';
    this.snapshotValue.activeLayerId = null;
    this.snapshotValue.activeReplyEventId = null;
    if (changed) this.emit();
    return changed;
  }

  private playReply(job: ManualVideoReplyJob): void {
    job.state = 'playing';
    this.snapshotValue.replyStates[job.eventId] = 'playing';
    this.activate('response', job.layerId, job.eventId);
  }

  private playNextReplyOrIdle(): boolean {
    const next = this.snapshotValue.queuedReplies.shift();
    if (next) {
      this.playReply(next);
      return true;
    }
    this.snapshotValue.activeReplyEventId = null;
    return this.playNextIdle();
  }

  private activate(mode: 'idle' | 'response', layerId: string, eventId: string | null): void {
    this.snapshotValue.mode = mode;
    this.snapshotValue.activeLayerId = layerId;
    this.snapshotValue.activeReplyEventId = eventId;
    this.snapshotValue.playbackRevision += 1;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
