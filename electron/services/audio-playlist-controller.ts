import type { ManualAudioSnapshot, ManualPlaybackState } from '../../src/shared/contracts/manual-live';
import type { ProjectMediaReference } from '../../src/shared/contracts/projects';

type Listener = (snapshot: ManualAudioSnapshot) => void;

export class AudioPlaylistController {
  private queue: ProjectMediaReference[] = [];
  private currentIndex: number | null = null;
  private state: ManualPlaybackState = 'idle';
  private volume = 1;
  private autoNext = true;
  private revision = 0;
  private readonly listeners = new Set<Listener>();

  snapshot(): ManualAudioSnapshot {
    return {
      queue: this.queue.map((item) => ({ ...item })),
      currentIndex: this.currentIndex,
      state: this.state,
      volume: this.volume,
      autoNext: this.autoNext,
      revision: this.revision,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  import(references: ProjectMediaReference[]): ManualAudioSnapshot {
    this.queue = this.mergeAudioReferences(references);
    if (this.currentIndex === null && this.queue.length > 0) this.currentIndex = 0;
    return this.commit();
  }

  play(): ManualAudioSnapshot {
    if (this.currentIndex === null && this.queue.length > 0) this.currentIndex = 0;
    if (this.currentIndex !== null) this.state = 'playing';
    return this.commit();
  }

  pause(): ManualAudioSnapshot {
    if (this.state === 'playing') this.state = 'paused';
    return this.commit();
  }

  stop(): ManualAudioSnapshot {
    if (this.currentIndex !== null) this.state = 'stopped';
    return this.commit();
  }

  next(): ManualAudioSnapshot {
    if (this.queue.length === 0) return this.commit();
    const wasPlaying = this.state === 'playing';
    this.currentIndex = this.currentIndex === null ? 0 : (this.currentIndex + 1) % this.queue.length;
    this.state = wasPlaying ? 'playing' : 'stopped';
    return this.commit();
  }

  previous(): ManualAudioSnapshot {
    if (this.queue.length === 0) return this.commit();
    const wasPlaying = this.state === 'playing';
    this.currentIndex = this.currentIndex === null
      ? 0
      : (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    this.state = wasPlaying ? 'playing' : 'stopped';
    return this.commit();
  }

  setVolume(volume: number): ManualAudioSnapshot {
    this.volume = Math.min(1, Math.max(0, volume));
    return this.commit();
  }

  setAutoNext(autoNext: boolean): ManualAudioSnapshot {
    this.autoNext = autoNext;
    return this.commit();
  }

  onEnded(): ManualAudioSnapshot {
    if (this.state !== 'playing' || this.currentIndex === null) return this.snapshot();
    if (this.autoNext && this.currentIndex < this.queue.length - 1) {
      this.currentIndex += 1;
      return this.commit();
    }
    this.state = 'stopped';
    return this.commit();
  }

  private mergeAudioReferences(references: ProjectMediaReference[]): ProjectMediaReference[] {
    const imported = references.filter((reference) => reference.kind === 'audio');
    const byId = new Map(this.queue.map((reference) => [reference.id, reference]));
    for (const reference of imported) byId.set(reference.id, { ...reference });
    return [...byId.values()];
  }

  private commit(): ManualAudioSnapshot {
    this.revision += 1;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }
}
