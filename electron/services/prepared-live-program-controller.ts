import type { PreparedLiveProgramCue, ProjectPreparedLiveProgramSettings } from '../../src/shared/contracts/projects';
import { preparedLiveProgramSettingsSchema } from '../../src/shared/validation/projects';

export interface PreparedLiveProgramSnapshot {
  enabled: boolean;
  revision: number;
  visualVideoLayerId: string | null;
  visualCurrentTime: number;
  visualPlaying: boolean;
  baseAudioLayerId: string | null;
  baseAudioCurrentTime: number | null;
  baseAudioPlaying: boolean;
  activeCue: PreparedLiveProgramCue | null;
  cueAudioLayerId: string | null;
  cueAudioCurrentTime: number | null;
  cueAudioPlaying: boolean;
  resumeVisualTime: number | null;
}

function copy(snapshot: PreparedLiveProgramSnapshot): PreparedLiveProgramSnapshot {
  return structuredClone(snapshot);
}

function initial(settings: ProjectPreparedLiveProgramSettings, revision = 0): PreparedLiveProgramSnapshot {
  return {
    enabled: settings.enabled,
    revision,
    visualVideoLayerId: settings.visualVideoLayerId,
    visualCurrentTime: 0,
    visualPlaying: false,
    baseAudioLayerId: settings.baseAudioLayerId,
    baseAudioCurrentTime: null,
    baseAudioPlaying: false,
    activeCue: null,
    cueAudioLayerId: null,
    cueAudioCurrentTime: null,
    cueAudioPlaying: false,
    resumeVisualTime: null,
  };
}

/**
 * Controls a single long-form visual program. It only produces deterministic
 * presentation intent; the Scene Runtime remains responsible for media I/O.
 */
export class PreparedLiveProgramController {
  private settings: ProjectPreparedLiveProgramSettings;
  private snapshotValue: PreparedLiveProgramSnapshot;
  private readonly listeners = new Set<(snapshot: PreparedLiveProgramSnapshot) => void>();

  constructor(settings: ProjectPreparedLiveProgramSettings = { enabled: false, visualVideoLayerId: null, baseAudioLayerId: null, cues: [] }) {
    this.settings = preparedLiveProgramSettingsSchema.parse(settings);
    this.snapshotValue = initial(this.settings);
  }

  configure(settings: ProjectPreparedLiveProgramSettings): void {
    this.settings = preparedLiveProgramSettingsSchema.parse(settings);
    this.snapshotValue = initial(this.settings, this.snapshotValue.revision + 1);
    this.emit();
  }

  snapshot(): PreparedLiveProgramSnapshot { return copy(this.snapshotValue); }

  subscribe(listener: (snapshot: PreparedLiveProgramSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  /** Start the main visual program and its synchronized base audio track. */
  start(at = 0): boolean {
    if (!this.settings.enabled || !this.settings.visualVideoLayerId || !Number.isFinite(at) || at < 0) return false;
    this.snapshotValue = {
      ...this.snapshotValue,
      revision: this.snapshotValue.revision + 1,
      visualCurrentTime: at,
      visualPlaying: true,
      baseAudioCurrentTime: this.settings.baseAudioLayerId ? at : null,
      baseAudioPlaying: this.settings.baseAudioLayerId !== null,
      activeCue: null,
      cueAudioLayerId: null,
      cueAudioCurrentTime: null,
      cueAudioPlaying: false,
      resumeVisualTime: null,
    };
    this.emit();
    return true;
  }

  /** Seek-triggered chapters use their own audio; an interrupt restores the exact prior visual frame. */
  playCue(state: PreparedLiveProgramCue['state']): boolean {
    if (!this.settings.enabled || !this.settings.visualVideoLayerId) return false;
    const cue = this.settings.cues.find((entry) => entry.state === state);
    if (!cue) return false;
    const resumeVisualTime = cue.behavior === 'interrupt-resume' && this.snapshotValue.visualPlaying
      ? this.snapshotValue.visualCurrentTime
      : null;
    this.snapshotValue = {
      ...this.snapshotValue,
      revision: this.snapshotValue.revision + 1,
      visualCurrentTime: cue.visualStartAt,
      visualPlaying: true,
      // Cue speech has priority over the regular long-form voice track.
      baseAudioCurrentTime: this.settings.baseAudioLayerId ? cue.visualStartAt : null,
      baseAudioPlaying: false,
      activeCue: structuredClone(cue),
      cueAudioLayerId: cue.audioLayerId,
      cueAudioCurrentTime: cue.audioLayerId ? 0 : null,
      cueAudioPlaying: cue.audioLayerId !== null,
      resumeVisualTime,
    };
    this.emit();
    return true;
  }

  /** Scene Runtime progress feeds the visual clock, including while a cue voice is active. */
  onVisualProgress(revision: number, currentTime: number): boolean {
    if (revision !== this.snapshotValue.revision || !Number.isFinite(currentTime) || currentTime < 0) return false;
    this.snapshotValue.visualCurrentTime = currentTime;
    // Base audio follows visual time only while it owns the voice channel.
    if (this.snapshotValue.baseAudioPlaying) this.snapshotValue.baseAudioCurrentTime = currentTime;
    this.emit();
    return true;
  }

  /** Cue completion is driven by separate audio, never by the visual segment ending. */
  onCueAudioEnded(revision: number): boolean {
    if (revision !== this.snapshotValue.revision || !this.snapshotValue.activeCue) return false;
    const resumeAt = this.snapshotValue.resumeVisualTime;
    const nextTime = resumeAt ?? this.snapshotValue.visualCurrentTime;
    this.snapshotValue = {
      ...this.snapshotValue,
      revision: this.snapshotValue.revision + 1,
      visualCurrentTime: nextTime,
      visualPlaying: true,
      baseAudioCurrentTime: this.settings.baseAudioLayerId ? nextTime : null,
      baseAudioPlaying: this.settings.baseAudioLayerId !== null,
      activeCue: null,
      cueAudioLayerId: null,
      cueAudioCurrentTime: null,
      cueAudioPlaying: false,
      resumeVisualTime: null,
    };
    this.emit();
    return true;
  }

  stop(): void {
    this.snapshotValue = initial(this.settings, this.snapshotValue.revision + 1);
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
