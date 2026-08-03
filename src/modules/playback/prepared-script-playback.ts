import type { ProjectPreparedScript, PreparedScriptRole, ProjectPreparedScriptSettings, ProjectSceneLayer } from '../../shared/contracts/projects';

export type PreparedScriptPlaybackMode = 'stopped' | 'loading' | 'playing' | 'paused' | 'recovering' | 'error';

export interface PreparedScriptPlaybackSnapshot {
  mode: PreparedScriptPlaybackMode;
  activeScriptId: string | null;
  activeLayerId: string | null;
  activeAudioLayerId: string | null;
  // Attached audio starts only when its video becomes the displayed layer.
  pendingAudioLayerId: string | null;
  activeAvatarLayerId: string | null;
  // Incoming video decodes off-screen; only `activeLayerId` is ever visible.
  pendingLayerId: string | null;
  playbackRevision: number;
  // A resumed waiting video keeps its existing media element and currentTime.
  resumeActiveMedia: boolean;
  queuedScriptIds: string[];
  errorMessage: string | null;
}

type Listener = (snapshot: PreparedScriptPlaybackSnapshot) => void;
type PlayableLayer = Pick<ProjectSceneLayer, 'id' | 'kind' | 'loop' | 'muted' | 'volume'> & { available: boolean };

function copy(snapshot: PreparedScriptPlaybackSnapshot): PreparedScriptPlaybackSnapshot {
  return { ...snapshot, queuedScriptIds: [...snapshot.queuedScriptIds] };
}

export class PreparedScriptPlaybackController {
  private settings: ProjectPreparedScriptSettings = { enabled: true, scripts: [] };
  private layers = new Map<string, PlayableLayer>();
  private listeners = new Set<Listener>();
  private disposed = false;
  private sequenceActive = false;
  private suspendedIdleScriptId: string | null = null;
  private resumeIdleAfterOrder: number | null = null;
  private snapshotValue: PreparedScriptPlaybackSnapshot = { mode: 'stopped', activeScriptId: null, activeLayerId: null, pendingLayerId: null, activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null, playbackRevision: 0, resumeActiveMedia: false, queuedScriptIds: [], errorMessage: null };

  configure(settings: ProjectPreparedScriptSettings, layers: readonly PlayableLayer[]): void {
    this.settings = { enabled: settings.enabled, scripts: [...settings.scripts].sort((a, b) => a.order - b.order).map((script, order) => ({ ...script, order })) };
    this.layers = new Map(layers.map((layer) => [layer.id, { ...layer }]));
    const active = this.snapshotValue.activeScriptId ? this.script(this.snapshotValue.activeScriptId) : undefined;
    if (!active) return;
    const activeLayerId = active.playbackType === 'tts' ? null : active.mediaLayerId;
    const activeAudioLayerId = active.playbackType === 'video' ? active.audioLayerId : null;
    if (this.snapshotValue.activeLayerId === activeLayerId && this.snapshotValue.activeAudioLayerId === activeAudioLayerId) return;
    // A source edit can change an active video script into an audio script.
    // Rebind the presentation atomically so stale media cannot remain muted.
    this.snapshotValue = {
      ...this.snapshotValue,
      mode: 'loading',
      activeLayerId,
      activeAudioLayerId,
      pendingAudioLayerId: null,
      pendingLayerId: null,
      resumeActiveMedia: false,
      playbackRevision: this.snapshotValue.playbackRevision + 1,
    };
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener);
  }
  snapshot(): PreparedScriptPlaybackSnapshot { return copy(this.snapshotValue); }

  startSequence(startScriptId?: string): boolean {
    this.sequenceActive = true;
    const start = startScriptId ? this.scriptIndex(startScriptId) : 0;
    // The prepared timeline is the waiting program only. Activation and
    // conversation scripts are event-driven priority work, never playlist items.
    return this.activateNext(start < 0 ? 0 : start, 'idle');
  }

  playScript(scriptId: string): boolean {
    const script = this.script(scriptId);
    if (!script || !script.enabled) return this.fail('Kịch bản không tồn tại hoặc đã tắt.');
    if (this.snapshotValue.activeScriptId && script.interruptMode === 'after-current') {
      if (!this.snapshotValue.queuedScriptIds.includes(scriptId)) this.snapshotValue.queuedScriptIds.push(scriptId);
      this.emit();
      return true;
    }
    this.sequenceActive = false;
    this.suspendedIdleScriptId = null;
    this.resumeIdleAfterOrder = null;
    // An immediate operator command supersedes requests that were waiting behind the prior script.
    this.snapshotValue.queuedScriptIds = [];
    return this.activate(script);
  }

  playRole(role: PreparedScriptRole): boolean {
    const script = this.settings.scripts.find((candidate) => candidate.enabled && candidate.role === role);
    if (!script) return this.fail(`No enabled ${role} script is configured.`);
    if (role === 'idle') {
      this.suspendedIdleScriptId = null;
      this.resumeIdleAfterOrder = null;
      this.sequenceActive = false;
      return this.activate(script);
    }
    return this.playPriority(script.id);
  }

  playPriority(scriptId: string): boolean {
    const script = this.script(scriptId);
    if (!script || !script.enabled || script.role === 'idle') return this.fail('Priority script is unavailable.');
    const active = this.snapshotValue.activeScriptId ? this.script(this.snapshotValue.activeScriptId) : undefined;
    // Priority scenes interrupt the background immediately. Further priority
    // requests remain FIFO so audio/video never overlap before idle resumes.
    if (active && active.role !== 'idle') return this.enqueue(script.id, true);
    if (active?.role === 'idle') {
      this.suspendedIdleScriptId = active.id;
      this.resumeIdleAfterOrder = null;
    }
    return this.activate(script);
  }

  pause(): boolean { if (this.snapshotValue.mode !== 'playing') return false; this.snapshotValue.mode = 'paused'; this.emit(); return true; }
  resume(): boolean { if (this.snapshotValue.mode !== 'paused') return false; this.snapshotValue.mode = 'playing'; this.emit(); return true; }
  stop(): boolean {
    const changed = this.snapshotValue.mode !== 'stopped';
    this.sequenceActive = false;
    this.suspendedIdleScriptId = null;
    this.resumeIdleAfterOrder = null;
    this.snapshotValue = { ...this.snapshotValue, mode: 'stopped', activeScriptId: null, activeLayerId: null, pendingLayerId: null, activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null, resumeActiveMedia: false, queuedScriptIds: [], errorMessage: null, playbackRevision: this.snapshotValue.playbackRevision + (changed ? 1 : 0) };
    if (changed) this.emit();
    return changed;
  }
  skip(): boolean { return this.completeActive(); }

  removeScripts(scriptIds: readonly string[]): boolean {
    const removed = new Set(scriptIds);
    if (removed.size === 0) return false;
    const activeRemoved = this.snapshotValue.activeScriptId !== null && removed.has(this.snapshotValue.activeScriptId);
    const suspended = this.suspendedIdleScriptId ? this.script(this.suspendedIdleScriptId) : undefined;
    if (suspended && removed.has(suspended.id)) {
      this.suspendedIdleScriptId = null;
      this.resumeIdleAfterOrder = suspended.order + 1;
    }
    this.snapshotValue.queuedScriptIds = this.snapshotValue.queuedScriptIds.filter((id) => !removed.has(id));
    if (activeRemoved) return this.stop();
    this.emit();
    return false;
  }

  onReady(scriptId: string, revision: number): boolean {
    if (!this.matches(scriptId, revision) || this.snapshotValue.mode === 'paused') return false;
    if (this.snapshotValue.mode !== 'playing') {
      this.snapshotValue.mode = 'playing';
      this.snapshotValue.activeLayerId = this.snapshotValue.pendingLayerId ?? this.snapshotValue.activeLayerId;
      this.snapshotValue.pendingLayerId = null;
      this.snapshotValue.activeAudioLayerId = this.snapshotValue.pendingAudioLayerId ?? this.snapshotValue.activeAudioLayerId;
      this.snapshotValue.pendingAudioLayerId = null;
      this.emit();
    }
    return true;
  }
  onEnded(scriptId: string, revision: number): boolean { return this.matches(scriptId, revision) && this.snapshotValue.mode !== 'paused' ? this.completeActive() : false; }
  onError(scriptId: string, revision: number, reason: string): boolean {
    if (!this.matches(scriptId, revision)) return false;
    this.snapshotValue.mode = 'recovering'; this.snapshotValue.errorMessage = reason; this.emit();
    return this.completeActive();
  }
  dispose(): void { this.disposed = true; this.listeners.clear(); }

  private completeActive(): boolean {
    const active = this.snapshotValue.activeScriptId ? this.script(this.snapshotValue.activeScriptId) : undefined;
    if (!active) return false;
    while (this.snapshotValue.queuedScriptIds.length) {
      const queued = this.snapshotValue.queuedScriptIds.shift();
      const queuedScript = queued ? this.script(queued) : undefined;
      if (queuedScript?.enabled) return this.activate(queuedScript);
    }
    const idle = this.suspendedIdleScriptId ? this.script(this.suspendedIdleScriptId) : undefined;
    if (idle?.enabled && active.role !== 'idle') {
      this.suspendedIdleScriptId = null;
      this.resumeIdleAfterOrder = null;
      return this.activate(idle, true);
    }
    if (active.role !== 'idle' && this.sequenceActive && this.resumeIdleAfterOrder !== null) {
      const start = this.resumeIdleAfterOrder;
      this.resumeIdleAfterOrder = null;
      return this.activateNext(start, 'idle');
    }
    if (active.role === 'idle' && this.sequenceActive) return this.activateNext(active.order + 1, 'idle');
    if (active.completionMode === 'next') return this.activateNext(active.order + 1, active.role);
    // Keep a media failure visible after playback stops; the next activation
    // clears it, while the operator can now see what needs fixing.
    this.snapshotValue = { ...this.snapshotValue, mode: 'stopped', activeScriptId: null, activeLayerId: null, pendingLayerId: null, activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null, resumeActiveMedia: false, playbackRevision: this.snapshotValue.playbackRevision + 1 };
    this.emit(); return true;
  }
  private activateNext(start: number, role?: PreparedScriptRole): boolean {
    for (let index = start; index < this.settings.scripts.length; index += 1) {
      const script = this.settings.scripts[index]!;
      if (script.enabled && (!role || script.role === role)) return this.activate(script);
    }
    // The automatic timeline is a continuous background program. Once the
    // last waiting clip ends, begin the waiting list again from its first clip.
    if (role === 'idle' && this.sequenceActive) {
      for (const script of this.settings.scripts) {
        if (script.enabled && script.role === 'idle') return this.activate(script);
      }
    }
    this.sequenceActive = false;
    return this.stop();
  }
  private activate(script: ProjectPreparedScript, resumeActiveMedia = false): boolean {
    if (script.playbackType !== 'tts') {
      const layer = script.mediaLayerId ? this.layers.get(script.mediaLayerId) : undefined;
      const isAvatarVideo = script.playbackType === 'video' && layer?.kind === 'avatar';
      if (!layer || !layer.available || (layer.kind !== script.playbackType && !isAvatarVideo)) return this.fail(`Nguồn ${script.playbackType} của ${script.name} chưa sẵn sàng.`);
    }
    if (script.audioLayerId) {
      const audio = this.layers.get(script.audioLayerId);
      if (!audio || !audio.available || audio.kind !== 'audio') return this.fail(`Audio for ${script.name} is unavailable.`);
    }
    if (script.avatarLayerId) {
      const avatar = this.layers.get(script.avatarLayerId);
      if (!avatar || !avatar.available || avatar.kind !== 'avatar') return this.fail(`Avatar for ${script.name} is unavailable.`);
    }
    const previous = this.snapshotValue.activeScriptId ? this.script(this.snapshotValue.activeScriptId) : undefined;
    const incomingVideo = script.playbackType === 'video' && script.mediaLayerId !== null;
    const retainDisplayedVideo = incomingVideo && previous?.playbackType === 'video' && this.snapshotValue.activeLayerId !== script.mediaLayerId;
    // The successor plays hidden and reports a decoded frame. At that point
    // `onReady` performs one atomic hard cut; there is no transition layer.
    // Start the companion audio immediately with the video request. The video
    // still gates the visual handoff, but audio must not wait for that frame.
    this.snapshotValue = { ...this.snapshotValue, mode: 'loading', activeScriptId: script.id, activeLayerId: retainDisplayedVideo ? this.snapshotValue.activeLayerId : script.mediaLayerId, pendingLayerId: retainDisplayedVideo ? script.mediaLayerId : null, activeAudioLayerId: script.audioLayerId, pendingAudioLayerId: null, activeAvatarLayerId: script.avatarLayerId, resumeActiveMedia, errorMessage: null, playbackRevision: this.snapshotValue.playbackRevision + 1 };
    this.emit(); return true;
  }
  private enqueue(scriptId: string, allowDuplicates = false): true {
    if (allowDuplicates || !this.snapshotValue.queuedScriptIds.includes(scriptId)) this.snapshotValue.queuedScriptIds.push(scriptId);
    this.emit();
    return true;
  }
  private script(id: string): ProjectPreparedScript | undefined { return this.settings.scripts.find((script) => script.id === id); }
  private scriptIndex(id: string): number { return this.settings.scripts.findIndex((script) => script.id === id); }
  private matches(scriptId: string, revision: number): boolean { return !this.disposed && this.snapshotValue.activeScriptId === scriptId && this.snapshotValue.playbackRevision === revision; }
  private fail(message: string): false { this.suspendedIdleScriptId = null; this.resumeIdleAfterOrder = null; this.snapshotValue = { ...this.snapshotValue, mode: 'error', activeScriptId: null, activeLayerId: null, pendingLayerId: null, activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null, resumeActiveMedia: false, errorMessage: message }; this.emit(); return false; }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) listener(this.snapshot()); }
}
