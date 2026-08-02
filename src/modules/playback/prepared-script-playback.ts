import type { ProjectPreparedScript, ProjectPreparedScriptSettings, ProjectSceneLayer } from '../../shared/contracts/projects';

export type PreparedScriptPlaybackMode = 'stopped' | 'loading' | 'playing' | 'paused' | 'recovering' | 'error';

export interface PreparedScriptPlaybackSnapshot {
  mode: PreparedScriptPlaybackMode;
  activeScriptId: string | null;
  activeLayerId: string | null;
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
  private snapshotValue: PreparedScriptPlaybackSnapshot = { mode: 'stopped', activeScriptId: null, activeLayerId: null, playbackRevision: 0, queuedScriptIds: [], errorMessage: null };

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
    return this.activateNext(start < 0 ? 0 : start);
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

  pause(): boolean { if (this.snapshotValue.mode !== 'playing') return false; this.snapshotValue.mode = 'paused'; this.emit(); return true; }
  resume(): boolean { if (this.snapshotValue.mode !== 'paused') return false; this.snapshotValue.mode = 'playing'; this.emit(); return true; }
  stop(): boolean {
    const changed = this.snapshotValue.mode !== 'stopped';
    this.sequenceActive = false;
    this.snapshotValue = { ...this.snapshotValue, mode: 'stopped', activeScriptId: null, activeLayerId: null, queuedScriptIds: [], errorMessage: null, playbackRevision: this.snapshotValue.playbackRevision + (changed ? 1 : 0) };
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
    if (active.completionMode === 'next' || (active.completionMode === 'resume-sequence' && this.sequenceActive)) return this.activateNext(active.order + 1);
    this.snapshotValue = { ...this.snapshotValue, mode: 'stopped', activeScriptId: null, activeLayerId: null, errorMessage: null, playbackRevision: this.snapshotValue.playbackRevision + 1 };
    this.emit(); return true;
  }
  private activateNext(start: number): boolean {
    for (let index = start; index < this.settings.scripts.length; index += 1) {
      const script = this.settings.scripts[index]!;
      if (script.enabled) return this.activate(script);
    }
    this.sequenceActive = false;
    return this.stop();
  }
  private activate(script: ProjectPreparedScript): boolean {
    if (script.playbackType !== 'tts') {
      const layer = script.mediaLayerId ? this.layers.get(script.mediaLayerId) : undefined;
      if (!layer || !layer.available || layer.kind !== script.playbackType) return this.fail(`Nguồn ${script.playbackType} của ${script.name} chưa sẵn sàng.`);
    }
    this.snapshotValue = { ...this.snapshotValue, mode: 'loading', activeScriptId: script.id, activeLayerId: script.mediaLayerId, errorMessage: null, playbackRevision: this.snapshotValue.playbackRevision + 1 };
    this.emit(); return true;
  }
  private script(id: string): ProjectPreparedScript | undefined { return this.settings.scripts.find((script) => script.id === id); }
  private scriptIndex(id: string): number { return this.settings.scripts.findIndex((script) => script.id === id); }
  private matches(scriptId: string, revision: number): boolean { return !this.disposed && this.snapshotValue.activeScriptId === scriptId && this.snapshotValue.playbackRevision === revision; }
  private fail(message: string): false { this.snapshotValue = { ...this.snapshotValue, mode: 'error', activeScriptId: null, activeLayerId: null, errorMessage: message }; this.emit(); return false; }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) listener(this.snapshot()); }
}
