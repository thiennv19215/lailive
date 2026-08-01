import type { ProjectManualPlaybackSettings, ProjectSceneLayer } from '../../shared/contracts/projects';

export type ManualVideoPlaybackMode = 'stopped' | 'starting' | 'idle' | 'paused' | 'loading' | 'recovering' | 'error';

export interface ManualVideoPlaybackSnapshot {
  mode: ManualVideoPlaybackMode;
  activeLayerId: string | null;
  activePlaylistIndex: number | null;
  playbackRevision: number;
  attemptedLayerIds: string[];
  sessionHistory: string[];
  warnings: string[];
  errorMessage: string | null;
  activeSettings: { loop: boolean; muted: boolean; volume: number } | null;
}

type PlaybackListener = (snapshot: ManualVideoPlaybackSnapshot) => void;
type PlayableLayer = Pick<ProjectSceneLayer, 'id' | 'kind' | 'loop' | 'muted' | 'volume'> & { available?: boolean };

function cloneSnapshot(snapshot: ManualVideoPlaybackSnapshot): ManualVideoPlaybackSnapshot {
  return { ...snapshot, attemptedLayerIds: [...snapshot.attemptedLayerIds], sessionHistory: [...snapshot.sessionHistory], warnings: [...snapshot.warnings], activeSettings: snapshot.activeSettings ? { ...snapshot.activeSettings } : null };
}

export class ManualVideoPlaybackController {
  private settings: ProjectManualPlaybackSettings = { enabled: false, playlist: [] };
  private layers = new Map<string, PlayableLayer>();
  private disposed = false;
  private snapshotValue: ManualVideoPlaybackSnapshot = { mode: 'stopped', activeLayerId: null, activePlaylistIndex: null, playbackRevision: 0, attemptedLayerIds: [], sessionHistory: [], warnings: [], errorMessage: null, activeSettings: null };
  private readonly listeners = new Set<PlaybackListener>();

  subscribe(listener: PlaybackListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): ManualVideoPlaybackSnapshot { return cloneSnapshot(this.snapshotValue); }

  configure(settings: ProjectManualPlaybackSettings, layers: readonly PlayableLayer[]): void {
    this.settings = { enabled: settings.enabled, playlist: settings.playlist.map((item) => ({ ...item })) };
    this.layers = new Map(layers.filter((layer) => layer.kind === 'video' || layer.kind === 'audio').map((layer) => [layer.id, { ...layer }]));
    this.resetSession();
  }

  start(): boolean {
    if (!this.settings.enabled) return this.fail('Bật playlist trước khi bắt đầu phát.');
    if (!this.settings.playlist.length) return this.fail('Thêm ít nhất một video hoặc audio vào playlist.');
    this.snapshotValue.warnings = this.playlistWarnings();
    this.snapshotValue.mode = 'starting';
    this.emit();
    return this.activateNext(0, false);
  }

  pause(): boolean {
    if (this.snapshotValue.mode === 'stopped' || this.snapshotValue.mode === 'paused' || !this.snapshotValue.activeLayerId) return false;
    this.snapshotValue.mode = 'paused';
    this.emit();
    return true;
  }

  resume(): boolean {
    if (this.snapshotValue.mode !== 'paused' || !this.snapshotValue.activeLayerId) return false;
    this.snapshotValue.playbackRevision += 1;
    this.snapshotValue.mode = 'loading';
    this.emit();
    return true;
  }

  skip(): boolean {
    if (!this.snapshotValue.activeLayerId || this.snapshotValue.mode === 'stopped' || this.snapshotValue.mode === 'error') return false;
    return this.advance();
  }

  stop(): boolean {
    const changed = this.snapshotValue.mode !== 'stopped' || this.snapshotValue.activeLayerId !== null;
    this.snapshotValue.mode = 'stopped';
    this.snapshotValue.activeLayerId = null;
    this.snapshotValue.activePlaylistIndex = null;
    this.snapshotValue.activeSettings = null;
    if (changed) { this.snapshotValue.playbackRevision += 1; this.emit(); }
    return changed;
  }

  retry(): boolean {
    this.resetSession();
    return this.start();
  }

  onReady(layerId: string, playbackRevision: number): boolean {
    if (!this.matches(layerId, playbackRevision) || this.snapshotValue.mode === 'paused') return false;
    this.snapshotValue.mode = 'idle';
    this.emit();
    return true;
  }

  onError(layerId: string, playbackRevision: number, reason = 'Tệp không đọc được.'): boolean {
    if (!this.matches(layerId, playbackRevision)) return false;
    this.snapshotValue.attemptedLayerIds = [...new Set([...this.snapshotValue.attemptedLayerIds, layerId])];
    this.snapshotValue.errorMessage = reason;
    this.snapshotValue.mode = 'recovering';
    this.emit();
    return this.advance(true);
  }

  onEnded(layerId: string, playbackRevision: number): boolean {
    if (!this.matches(layerId, playbackRevision) || this.snapshotValue.mode === 'paused') return false;
    const layer = this.layers.get(layerId);
    if (layer?.loop) {
      this.snapshotValue.playbackRevision += 1;
      this.snapshotValue.mode = 'loading';
      this.emit();
      return true;
    }
    return this.advance();
  }

  dispose(): void { this.disposed = true; this.listeners.clear(); }

  private resetSession(): void {
    this.snapshotValue = { mode: 'stopped', activeLayerId: null, activePlaylistIndex: null, playbackRevision: 0, attemptedLayerIds: [], sessionHistory: [], warnings: [], errorMessage: null, activeSettings: null };
    this.emit();
  }

  private playlistWarnings(): string[] {
    const valid = this.settings.playlist.filter((item) => item.enabled && this.layers.has(item.layerId));
    const warnings: string[] = [];
    if (valid.length < 2) warnings.push('Playlist có ít hơn hai nội dung hợp lệ; lần lặp lại ngay lập tức có thể xảy ra.');
    if (valid.length === 1) warnings.push('Playlist chỉ có một nội dung phát được.');
    return warnings;
  }

  private activateNext(startIndex: number, recovering: boolean): boolean {
    const count = this.settings.playlist.length;
    if (!count) return this.fail('Playlist trống.');
    const validCount = this.settings.playlist.filter((candidate) => candidate.enabled && this.layers.get(candidate.layerId)?.available !== false && this.layers.has(candidate.layerId)).length;
    for (let offset = 0; offset < count; offset += 1) {
      const index = (startIndex + offset) % count;
      const item = this.settings.playlist[index];
      const layer = item && item.enabled ? this.layers.get(item.layerId) : undefined;
      if (!item?.enabled || !layer || layer.available === false) continue;
      if (this.snapshotValue.sessionHistory[this.snapshotValue.sessionHistory.length - 1] === layer.id && validCount > 1) continue;
      this.snapshotValue.activeLayerId = layer.id;
      this.snapshotValue.activePlaylistIndex = index;
      this.snapshotValue.activeSettings = { loop: layer.loop, muted: layer.muted, volume: layer.volume };
      this.snapshotValue.playbackRevision += 1;
      this.snapshotValue.mode = recovering ? 'recovering' : 'loading';
      this.snapshotValue.errorMessage = null;
      this.snapshotValue.sessionHistory = [...this.snapshotValue.sessionHistory, layer.id].slice(-20);
      this.emit();
      return true;
    }
    return this.fail(recovering ? 'Toàn bộ nội dung playlist không đọc được hoặc đã bị tắt.' : 'Không có nội dung video/audio hợp lệ để phát.');
  }

  private advance(recovering = false): boolean {
    const current = this.snapshotValue.activePlaylistIndex ?? -1;
    return this.activateNext((current + 1) % Math.max(1, this.settings.playlist.length), recovering);
  }

  private matches(layerId: string, revision: number): boolean {
    return !this.disposed && this.snapshotValue.activeLayerId === layerId && this.snapshotValue.playbackRevision === revision;
  }

  private fail(message: string): boolean {
    this.snapshotValue.mode = 'error';
    this.snapshotValue.activeLayerId = null;
    this.snapshotValue.activePlaylistIndex = null;
    this.snapshotValue.activeSettings = null;
    this.snapshotValue.errorMessage = message;
    this.emit();
    return false;
  }

  private emit(): void {
    if (this.disposed) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
