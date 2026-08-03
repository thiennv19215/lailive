import { describe, expect, it } from 'vitest';
import { LiveStateEngine, type LiveStateEngineClock } from '../../electron/services/live-state-engine';
import { liveStateAudioSeekTime, type LiveStateDefinitions } from '../../src/shared/contracts/live-state';
import { liveStateDefinitionsSchema } from '../../src/shared/validation/live-state';

class FakeClock implements LiveStateEngineClock {
  private nextId = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  private time = 0;
  now(): number { return this.time; }
  setTimeout(callback: () => void, delayMs: number): number {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.time + delayMs, callback });
    return id;
  }
  clearTimeout(handle: unknown): void { this.timers.delete(handle as number); }
  advance(milliseconds: number): void {
    const target = this.time + milliseconds;
    while (true) {
      const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = target;
  }
}

const definitions: LiveStateDefinitions = {
  IDLE: { state: 'IDLE', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: null, priority: 0, nextState: null, timeline: [] },
  WELCOME: { state: 'WELCOME', avatar: { assetId: 'welcome.webm', kind: 'video' }, audio: { assetId: 'welcome.mp3', kind: 'audio' }, startAt: 0, endAt: null, audioStartAt: 0, duration: 8, priority: 100, nextState: 'IDLE', timeline: [] },
  CONSULT: { state: 'CONSULT', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: null, priority: 50, nextState: 'IDLE', timeline: [] },
  DEMO: { state: 'DEMO', avatar: { assetId: 'product-demo.mp4', kind: 'video' }, audio: { assetId: 'product-demo-audio.mp3', kind: 'audio' }, startAt: 30, endAt: 45, audioStartAt: null, duration: null, priority: 40, nextState: 'IDLE', timeline: [{ checkpoint: 'intro', startTime: 0, endTime: 10, transition: 'cut' }, { checkpoint: 'consult', startTime: 10, endTime: 30, transition: 'fade' }, { checkpoint: 'demo', startTime: 30, endTime: 45, transition: 'cut' }] },
  CTA: { state: 'CTA', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: 5, priority: 80, nextState: 'THANKS', timeline: [] },
  THANKS: { state: 'THANKS', avatar: null, audio: null, startAt: 0, endAt: null, audioStartAt: null, duration: 4, priority: 90, nextState: 'IDLE', timeline: [] },
};

describe('LiveStateEngine', () => {
  it('defaults legacy definitions to an unbounded segment and rejects invalid bounds', () => {
    const legacy = structuredClone(definitions) as unknown as Record<string, Record<string, unknown>>;
    delete legacy.DEMO.startAt;
    delete legacy.DEMO.endAt;
    delete legacy.DEMO.audioStartAt;
    expect(liveStateDefinitionsSchema.parse(legacy).DEMO).toMatchObject({ startAt: 0, endAt: null, audioStartAt: null });

    const invalid = structuredClone(definitions);
    invalid.DEMO.endAt = 30;
    expect(liveStateDefinitionsSchema.safeParse(invalid).success).toBe(false);
    invalid.DEMO.endAt = 45;
    invalid.DEMO.audioStartAt = -0.1;
    expect(liveStateDefinitionsSchema.safeParse(invalid).success).toBe(false);
  });

  it('maps separate welcome audio to its own offset while synced demo audio follows the segment', () => {
    expect(liveStateAudioSeekTime(definitions.WELCOME, 35.5)).toBe(0);
    expect(liveStateAudioSeekTime(definitions.DEMO, 30)).toBe(30);
  });

  it('starts only after a typed PLAY_STATE command and waits for runtime ready before duration', () => {
    const clock = new FakeClock();
    const engine = new LiveStateEngine(definitions, clock);
    expect(engine.play({ type: 'PLAY_STATE', state: 'WELCOME' })).toBe(true);
    expect(engine.snapshot()).toMatchObject({ state: 'WELCOME', mode: 'loading', revision: 1, currentTime: 0 });
    clock.advance(9_000);
    expect(engine.snapshot().state).toBe('WELCOME');
    engine.onRuntimeEvent({ kind: 'ready', revision: 1 });
    clock.advance(8_000);
    expect(engine.snapshot()).toMatchObject({ state: 'IDLE', mode: 'idle' });
  });

  it('interrupts and resumes an exact progress checkpoint after welcome finishes', () => {
    const engine = new LiveStateEngine(definitions, new FakeClock());
    engine.play({ type: 'PLAY_STATE', state: 'DEMO' });
    const demoRevision = engine.snapshot().revision;
    expect(engine.snapshot().currentTime).toBe(30);
    engine.onRuntimeEvent({ kind: 'ready', revision: demoRevision });
    engine.onRuntimeEvent({ kind: 'progress', revision: demoRevision, currentTime: 35.5 });
    expect(engine.play({ type: 'PLAY_STATE', state: 'WELCOME' })).toBe(true);
    const welcomeRevision = engine.snapshot().revision;
    expect(engine.snapshot()).toMatchObject({ state: 'WELCOME', resumeStack: [{ state: 'DEMO', currentTime: 35.5 }] });
    engine.onRuntimeEvent({ kind: 'ended', revision: welcomeRevision });
    expect(engine.snapshot()).toMatchObject({ state: 'DEMO', currentTime: 35.5, mode: 'loading', resumeStack: [] });
    // DEMO has synced audio, so it resumes with the visual checkpoint.
    expect(liveStateAudioSeekTime(engine.snapshot().definition, engine.snapshot().currentTime)).toBe(35.5);
  });

  it('restarts independent audio at its configured offset when its state resumes', () => {
    const engine = new LiveStateEngine(definitions, new FakeClock());
    engine.play({ type: 'PLAY_STATE', state: 'CONSULT' });
    const consultRevision = engine.snapshot().revision;
    engine.onRuntimeEvent({ kind: 'progress', revision: consultRevision, currentTime: 12 });
    engine.play({ type: 'PLAY_STATE', state: 'WELCOME' });
    const welcomeRevision = engine.snapshot().revision;
    engine.onRuntimeEvent({ kind: 'ended', revision: welcomeRevision });
    const resumed = engine.snapshot();
    expect(resumed).toMatchObject({ state: 'CONSULT', currentTime: 12 });
    expect(liveStateAudioSeekTime(resumed.definition, resumed.currentTime)).toBe(12);

    // Make CONSULT independently voiced and repeat the same interruption.
    const independentlyVoiced = structuredClone(definitions);
    independentlyVoiced.CONSULT.audio = { assetId: 'consult.mp3', kind: 'audio' };
    independentlyVoiced.CONSULT.audioStartAt = 0;
    const independentEngine = new LiveStateEngine(independentlyVoiced, new FakeClock());
    independentEngine.play({ type: 'PLAY_STATE', state: 'CONSULT' });
    const independentRevision = independentEngine.snapshot().revision;
    independentEngine.onRuntimeEvent({ kind: 'progress', revision: independentRevision, currentTime: 12 });
    independentEngine.play({ type: 'PLAY_STATE', state: 'WELCOME' });
    independentEngine.onRuntimeEvent({ kind: 'ended', revision: independentEngine.snapshot().revision });
    const independentlyResumed = independentEngine.snapshot();
    expect(independentlyResumed).toMatchObject({ state: 'CONSULT', currentTime: 12 });
    expect(liveStateAudioSeekTime(independentlyResumed.definition, independentlyResumed.currentTime)).toBe(0);
  });

  it('plays a bounded video segment and completes at its end timestamp', () => {
    const engine = new LiveStateEngine(definitions, new FakeClock());
    engine.play({ type: 'PLAY_STATE', state: 'DEMO' });
    const revision = engine.snapshot().revision;
    expect(engine.snapshot()).toMatchObject({ state: 'DEMO', currentTime: 30, definition: { startAt: 30, endAt: 45 } });
    engine.onRuntimeEvent({ kind: 'ready', revision });
    engine.onRuntimeEvent({ kind: 'progress', revision, currentTime: 44.9 });
    expect(engine.snapshot()).toMatchObject({ state: 'DEMO', currentTime: 44.9 });
    engine.onRuntimeEvent({ kind: 'progress', revision, currentTime: 45 });
    expect(engine.snapshot()).toMatchObject({ state: 'IDLE', currentTime: 0 });
  });

  it('supports nested interrupts in LIFO order and rejects insufficient priority', () => {
    const engine = new LiveStateEngine(definitions, new FakeClock());
    engine.play({ type: 'PLAY_STATE', state: 'DEMO' });
    expect(engine.play({ type: 'PLAY_STATE', state: 'CONSULT' })).toBe(true);
    expect(engine.play({ type: 'PLAY_STATE', state: 'DEMO' })).toBe(false);
    expect(engine.play({ type: 'PLAY_STATE', state: 'WELCOME' })).toBe(true);
    const welcomeRevision = engine.snapshot().revision;
    engine.onRuntimeEvent({ kind: 'ended', revision: welcomeRevision });
    expect(engine.snapshot().state).toBe('CONSULT');
    const consultRevision = engine.snapshot().revision;
    engine.onRuntimeEvent({ kind: 'ended', revision: consultRevision });
    expect(engine.snapshot().state).toBe('DEMO');
  });

  it('ignores stale runtime callbacks and uses the current duration state only', () => {
    const clock = new FakeClock();
    const engine = new LiveStateEngine(definitions, clock);
    engine.play({ type: 'PLAY_STATE', state: 'CTA' });
    const ctaRevision = engine.snapshot().revision;
    engine.onRuntimeEvent({ kind: 'ready', revision: ctaRevision });
    engine.play({ type: 'PLAY_STATE', state: 'WELCOME' });
    expect(engine.onRuntimeEvent({ kind: 'ended', revision: ctaRevision })).toBe(false);
    clock.advance(5_000);
    expect(engine.snapshot().state).toBe('WELCOME');
  });

  it('clears a runtime error by resuming the interrupted state', () => {
    const engine = new LiveStateEngine(definitions, new FakeClock());
    engine.play({ type: 'PLAY_STATE', state: 'DEMO' });
    const demoRevision = engine.snapshot().revision;
    engine.onRuntimeEvent({ kind: 'progress', revision: demoRevision, currentTime: 12.25 });
    engine.play({ type: 'PLAY_STATE', state: 'WELCOME' });
    const welcomeRevision = engine.snapshot().revision;
    expect(engine.onRuntimeEvent({ kind: 'error', revision: welcomeRevision, message: 'media failed' })).toBe(true);
    expect(engine.snapshot()).toMatchObject({ state: 'DEMO', currentTime: 12.25, errorMessage: null });
  });

  it('resets an active state when a different project manifest is configured', () => {
    const engine = new LiveStateEngine(definitions, new FakeClock());
    engine.play({ type: 'PLAY_STATE', state: 'DEMO' });
    const projectDefinitions = structuredClone(definitions);
    projectDefinitions.DEMO.priority = 41;
    engine.configure(projectDefinitions);
    expect(engine.snapshot()).toMatchObject({ state: 'IDLE', mode: 'idle', currentTime: 0, resumeStack: [] });
  });
});
