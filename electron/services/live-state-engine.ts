import type { LiveRuntimeEvent, LiveState, LiveStateDefinitions, LiveStateSnapshot, PlayStateCommand } from '../../src/shared/contracts/live-state';
import { DEFAULT_LIVE_STATE_DEFINITIONS } from '../../src/shared/contracts/live-state';
import { liveRuntimeEventSchema, liveStateDefinitionsSchema, playStateCommandSchema } from '../../src/shared/validation/live-state';

export interface LiveStateEngineClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: LiveStateEngineClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function copy(snapshot: LiveStateSnapshot): LiveStateSnapshot {
  return structuredClone(snapshot);
}

/** Owns deterministic live-state transitions; rendering remains in the scene runtime. */
export class LiveStateEngine {
  private definitions: LiveStateDefinitions;
  private readonly listeners = new Set<(snapshot: LiveStateSnapshot) => void>();
  private snapshotValue: LiveStateSnapshot;
  private durationTimer: unknown | null = null;

  constructor(definitions: LiveStateDefinitions = DEFAULT_LIVE_STATE_DEFINITIONS, private readonly clock: LiveStateEngineClock = systemClock) {
    this.definitions = liveStateDefinitionsSchema.parse(definitions);
    this.snapshotValue = {
      mode: 'idle', state: 'IDLE', revision: 0, currentTime: 0, ready: false,
      definition: this.definitions.IDLE, resumeStack: [], errorMessage: null,
    };
  }

  snapshot(): LiveStateSnapshot { return copy(this.snapshotValue); }

  /** Replaces the project-owned manifest and clears state from the prior project. */
  configure(definitions: LiveStateDefinitions): void {
    const parsed = liveStateDefinitionsSchema.parse(definitions);
    if (JSON.stringify(parsed) === JSON.stringify(this.definitions)) return;
    this.definitions = parsed;
    this.activate('IDLE', 0, []);
  }

  subscribe(listener: (snapshot: LiveStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  play(value: PlayStateCommand): boolean {
    const command = playStateCommandSchema.parse(value);
    if (command.state === 'IDLE') { this.activate('IDLE', 0, []); return true; }
    const current = this.snapshotValue;
    if (current.state !== 'IDLE') {
      const target = this.definitions[command.state];
      const mayInterrupt = command.interrupt ?? target.priority > current.definition.priority;
      if (!mayInterrupt) return false;
      this.activate(command.state, target.startAt, [...current.resumeStack, { state: current.state, currentTime: current.currentTime }]);
      return true;
    }
    this.activate(command.state, this.definitions[command.state].startAt, []);
    return true;
  }

  onRuntimeEvent(value: LiveRuntimeEvent): boolean {
    const event = liveRuntimeEventSchema.parse(value);
    if (event.revision !== this.snapshotValue.revision || this.snapshotValue.state === 'IDLE') return false;
    if (event.kind === 'ready') {
      if (this.snapshotValue.ready) return true;
      this.snapshotValue.ready = true;
      this.snapshotValue.mode = 'playing';
      this.armDurationTimer();
      this.emit();
      return true;
    }
    if (event.currentTime !== undefined) this.snapshotValue.currentTime = event.currentTime;
    if (event.kind === 'progress') {
      const endAt = this.snapshotValue.definition.endAt;
      if (endAt !== null && this.snapshotValue.currentTime >= endAt) {
        this.snapshotValue.currentTime = endAt;
        this.complete();
        return true;
      }
      this.emit();
      return true;
    }
    if (event.kind === 'error') {
      this.snapshotValue.mode = 'error';
      this.snapshotValue.errorMessage = event.message;
      this.emit();
      this.complete();
      return true;
    }
    this.complete();
    return true;
  }

  dispose(): void {
    this.clearDurationTimer();
    this.listeners.clear();
  }

  private activate(state: LiveState, currentTime: number, resumeStack: LiveStateSnapshot['resumeStack']): void {
    this.clearDurationTimer();
    const definition = this.definitions[state];
    this.snapshotValue = {
      mode: state === 'IDLE' ? 'idle' : 'loading', state, revision: this.snapshotValue.revision + 1,
      currentTime, ready: false, definition, resumeStack: structuredClone(resumeStack), errorMessage: null,
    };
    this.emit();
  }

  private complete(): void {
    this.clearDurationTimer();
    const { resumeStack, definition } = this.snapshotValue;
    const resume = resumeStack.length > 0 ? resumeStack[resumeStack.length - 1] : undefined;
    if (resume) {
      this.activate(resume.state, resume.currentTime, resumeStack.slice(0, -1));
      return;
    }
    this.activate(definition.nextState ?? 'IDLE', 0, []);
  }

  private armDurationTimer(): void {
    const duration = this.snapshotValue.definition.duration;
    if (duration === null) return;
    const revision = this.snapshotValue.revision;
    this.durationTimer = this.clock.setTimeout(() => {
      if (this.snapshotValue.revision === revision && this.snapshotValue.ready) this.complete();
    }, duration * 1_000);
  }

  private clearDurationTimer(): void {
    if (this.durationTimer === null) return;
    this.clock.clearTimeout(this.durationTimer);
    this.durationTimer = null;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
