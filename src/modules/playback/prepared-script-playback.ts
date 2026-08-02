import type { ProjectPreparedScript, PreparedScriptRole, ProjectPreparedScriptSettings, ProjectSceneLayer } from '../../shared/contracts/projects';

export type PreparedScriptPlaybackMode = 'stopped' | 'loading' | 'playing' | 'paused' | 'recovering' | 'error';

export interface PreparedScriptPlaybackSnapshot {
  mode: PreparedScriptPlaybackMode;
  activeScriptId: string | null;
  activeLayerId: string | null;
  activeAudioLayerId: string | null;
  activeAvatarLayerId: string | null;
  playbackRevision: number;
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
  private resumeIdleScriptId: string | null = null;
  private snapshotValue: PreparedScriptPlaybackSnapshot = { mode: 'stopped', activeScriptId: null, activeLayerId: null, activeAudioLayerId: null, activeAvatarLayerId: null, playbackRevision: 0, queuedScriptIds: [], errorMessage: null };

  configure(settings: ProjectPreparedScriptSettings, layers: readonly PlayableLayer[]): void {
    this.settings = { enabled: settings.enabled, scripts: [...settings.scripts].sort((a, b) => a.order - b.order).map((script, order) => ({ ...script, order })) };
    this.layers = new Map(layers.map((layer) => [layer.id, { ...layer }]));
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
    // An immediate operator command supersedes requests that were waiting behind the prior script.
    this.snapshotValue.queuedScriptIds = [];
    return this.activate(script);
  }

  playRole(role: PreparedScriptRole): boolean {
    const script = this.settings.scripts.find((candidate) => candidate.enabled && candidate.role === role);
    if (!script) return this.fail(`No enabled ${role} script is configured.`);
    if (role === 'idle') {
      this.resumeIdleScriptId = null;
      this.sequenceActive = false;
      return this.activate(script);
    }
    const active = this.snapshotValue.activeScriptId ? this.script(this.snapshotValue.activeScriptId) : undefined;
    // Never cut an active spoken response. A role request waits for its ended
    // callback; idle media may switch immediately because it is background state.
    if (active && active.role !== 'idle') return this.enqueue(script.id);
    this.resumeIdleScriptId = active?.role === 'idle' ? active.id : null;
    return this.playScript(script.id);
  }

  pause(): boolean { if (this.snapshotValue.mode !== 'playing') return false; this.snapshotValue.mode = 'paused'; this.emit(); return true; }
  resume(): boolean { if (this.snapshotValue.mode !== 'paused') return false; this.snapshotValue.mode = 'playing'; this.emit(); return true; }
  stop(): boolean {
    const changed = this.snapshotValue.mode !== 'stopped';
    this.sequenceActive = false;
    this.resumeIdleScriptId = null;
    this.snapshotValue = { ...this.snapshotValue, mode: 'stopped', activeScriptId: null, activeLayerId: null, activeAudioLayerId: null, activeAvatarLayerId: null, queuedScriptIds: [], errorMessage: null, playbackRevision: this.snapshotValue.playbackRevision + (changed ? 1 : 0) };
    if (changed) this.emit();
    return changed;
  }
  skip(): boolean { return this.completeActive(); }

  onReady(scriptId: string, revision: number): boolean {
    if (!this.matches(scriptId, revision) || this.snapshotValue.mode === 'paused') return false;
    this.snapshotValue.mode = 'playing'; this.emit(); return true;
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
    const queued = this.snapshotValue.queuedScriptIds.shift();
    if (queued) return this.activate(this.script(queued)!);
    const idle = this.resumeIdleScriptId ? this.script(this.resumeIdleScriptId) : undefined;
    if (idle?.enabled && active.role !== 'idle') {
      this.resumeIdleScriptId = null;
      return this.activate(idle);
    }
    if (active.role === 'idle' && this.sequenceActive) return this.activateNext(active.order + 1, 'idle');
    if (active.completionMode === 'next') return this.activateNext(active.order + 1, active.role);
    this.snapshotValue = { ...this.snapshotValue, mode: 'stopped', activeScriptId: null, activeLayerId: null, activeAudioLayerId: null, activeAvatarLayerId: null, errorMessage: null, playbackRevision: this.snapshotValue.playbackRevision + 1 };
    this.emit(); return true;
  }
  private activateNext(start: number, role?: PreparedScriptRole): boolean {
    for (let index = start; index < this.settings.scripts.length; index += 1) {
      const script = this.settings.scripts[index]!;
      if (script.enabled && (!role || script.role === role)) return this.activate(script);
    }
    this.sequenceActive = false;
    return this.stop();
  }
  private activate(script: ProjectPreparedScript): boolean {
    if (script.playbackType !== 'tts') {
      const layer = script.mediaLayerId ? this.layers.get(script.mediaLayerId) : undefined;
      if (!layer || !layer.available || layer.kind !== script.playbackType) return this.fail(`Nguồn ${script.playbackType} của ${script.name} chưa sẵn sàng.`);
    }
    if (script.audioLayerId) {
      const audio = this.layers.get(script.audioLayerId);
      if (!audio || !audio.available || audio.kind !== 'audio') return this.fail(`Audio for ${script.name} is unavailable.`);
    }
    if (script.avatarLayerId) {
      const avatar = this.layers.get(script.avatarLayerId);
      if (!avatar || !avatar.available || avatar.kind !== 'avatar') return this.fail(`Avatar for ${script.name} is unavailable.`);
    }
    this.snapshotValue = { ...this.snapshotValue, mode: 'loading', activeScriptId: script.id, activeLayerId: script.mediaLayerId, activeAudioLayerId: script.audioLayerId, activeAvatarLayerId: script.avatarLayerId, errorMessage: null, playbackRevision: this.snapshotValue.playbackRevision + 1 };
    this.emit(); return true;
  }
  private enqueue(scriptId: string): true {
    if (!this.snapshotValue.queuedScriptIds.includes(scriptId)) this.snapshotValue.queuedScriptIds.push(scriptId);
    this.emit();
    return true;
  }
  private script(id: string): ProjectPreparedScript | undefined { return this.settings.scripts.find((script) => script.id === id); }
  private scriptIndex(id: string): number { return this.settings.scripts.findIndex((script) => script.id === id); }
  private matches(scriptId: string, revision: number): boolean { return !this.disposed && this.snapshotValue.activeScriptId === scriptId && this.snapshotValue.playbackRevision === revision; }
  private fail(message: string): false { this.snapshotValue = { ...this.snapshotValue, mode: 'error', activeScriptId: null, activeLayerId: null, activeAudioLayerId: null, activeAvatarLayerId: null, errorMessage: message }; this.emit(); return false; }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) listener(this.snapshot()); }
}
