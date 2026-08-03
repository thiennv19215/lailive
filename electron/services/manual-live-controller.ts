import type { ManualPlaybackState, ManualVideoSnapshot } from '../../src/shared/contracts/manual-live';
import type { ProjectMediaReference } from '../../src/shared/contracts/projects';

type Listener = (snapshot: ManualVideoSnapshot) => void;

export class ManualLiveController {
  private playlist: ProjectMediaReference[] = [];
  private currentIndex: number | null = null;
  private state: ManualPlaybackState = 'idle';
  private loop = false;
  private revision = 0;
  private readonly listeners = new Set<Listener>();

  snapshot(): ManualVideoSnapshot {
    return {
      playlist: this.playlist.map((item) => ({ ...item })),
      currentIndex: this.currentIndex,
      state: this.state,
      loop: this.loop,
      revision: this.revision,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  import(references: ProjectMediaReference[]): ManualVideoSnapshot {
    this.playlist = this.mergeVideoReferences(references);
    if (this.currentIndex === null && this.playlist.length > 0) this.currentIndex = 0;
    return this.commit();
  }

  play(): ManualVideoSnapshot {
    if (this.currentIndex === null && this.playlist.length > 0) this.currentIndex = 0;
    if (this.currentIndex !== null) this.state = 'playing';
    return this.commit();
  }

  pause(): ManualVideoSnapshot {
    if (this.state === 'playing') this.state = 'paused';
    return this.commit();
  }

  stop(): ManualVideoSnapshot {
    if (this.currentIndex !== null) this.state = 'stopped';
    return this.commit();
  }

  next(): ManualVideoSnapshot {
    if (this.playlist.length === 0) return this.commit();
    const wasPlaying = this.state === 'playing';
    this.currentIndex = this.currentIndex === null ? 0 : (this.currentIndex + 1) % this.playlist.length;
    this.state = wasPlaying ? 'playing' : 'stopped';
    return this.commit();
  }

  previous(): ManualVideoSnapshot {
    if (this.playlist.length === 0) return this.commit();
    const wasPlaying = this.state === 'playing';
    this.currentIndex = this.currentIndex === null
      ? 0
      : (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.state = wasPlaying ? 'playing' : 'stopped';
    return this.commit();
  }

  setLoop(loop: boolean): ManualVideoSnapshot {
    this.loop = loop;
    return this.commit();
  }

  onEnded(): ManualVideoSnapshot {
    if (this.state !== 'playing' || this.currentIndex === null) return this.snapshot();
    if (this.loop) return this.commit();
    this.state = 'stopped';
    return this.commit();
  }

  private mergeVideoReferences(references: ProjectMediaReference[]): ProjectMediaReference[] {
    const imported = references.filter((reference) => reference.kind === 'video');
    const byId = new Map(this.playlist.map((reference) => [reference.id, reference]));
    for (const reference of imported) byId.set(reference.id, { ...reference });
    return [...byId.values()];
  }

  private commit(): ManualVideoSnapshot {
    this.revision += 1;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }
}
