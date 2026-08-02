import { MAX_INTERACTION_QUEUE_JOBS, type AvatarSpeechState, type InteractionQueueInput, type InteractionQueueJob, type InteractionQueueSnapshot } from '../../shared/contracts/queue';
import type { AiGenerateInput, AiReplyResult } from '../../shared/contracts/ai';
import type { TtsSynthesisResult, TtsSynthesizeInput } from '../../shared/contracts/tts';
import type { QueueDiagnosticEvent } from '../../shared/contracts/diagnostics';

export interface InteractionQueueDependencies {
  generateAi(input: AiGenerateInput): Promise<AiReplyResult>;
  cancelAi(requestId: string): Promise<boolean>;
  synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesisResult>;
  cancelTts(requestId: string): Promise<boolean>;
  play(result: TtsSynthesisResult, settings: InteractionQueueInput['ttsSettings'], signal: AbortSignal, onStarted: () => void): Promise<void>;
  onAvatarState?(state: AvatarSpeechState, job: InteractionQueueJob | null): void;
  onDiagnostic?(event: QueueDiagnosticEvent): void;
}

function timestamp(): string { return new Date().toISOString(); }
function isActiveState(state: InteractionQueueJob['state']): boolean {
  return ['queued', 'ai_processing', 'tts_processing', 'playing'].includes(state);
}
function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
    || reason instanceof Error && /abort|cancel/i.test(`${reason.name} ${reason.message}`);
}

export class InteractionQueue {
  private readonly jobs: InteractionQueueJob[] = [];
  private readonly listeners = new Set<(snapshot: InteractionQueueSnapshot) => void>();
  private activeJobId: string | null = null;
  private avatarState: AvatarSpeechState = 'idle';
  private controller: AbortController | null = null;
  private processing = false;
  private idleWaiters = new Set<() => void>();
  private emitScheduled = false;

  constructor(
    private readonly dependencies: InteractionQueueDependencies,
    private readonly maximum = MAX_INTERACTION_QUEUE_JOBS,
  ) {}

  enqueue(input: InteractionQueueInput): InteractionQueueJob {
    const now = timestamp();
    const job: InteractionQueueJob = {
      ...input, state: this.jobs.filter((candidate) => isActiveState(candidate.state)).length >= this.maximum ? 'skipped' : 'queued',
      text: '', aiReply: null, synthesis: null,
      error: null, createdAt: now, updatedAt: now, startedAt: null,
      completedAt: null, attempts: 0,
    };
    if (job.state === 'skipped') {
      job.error = 'queue-full';
      job.completedAt = now;
      this.dependencies.onDiagnostic?.({ kind: 'queue-full', stage: 'queued', count: this.maximum });
    }
    this.jobs.unshift(job);
    this.trimHistory();
    this.emit();
    if (job.state === 'queued') void this.process();
    return structuredClone(job);
  }

  async skipCurrent(): Promise<boolean> {
    const job = this.currentJob();
    if (!job || !this.controller) return false;
    this.controller.abort();
    await Promise.allSettled([
      job.aiInput ? this.dependencies.cancelAi(job.aiInput.requestId) : Promise.resolve(false),
      this.dependencies.cancelTts(this.ttsRequestId(job)),
    ]);
    return true;
  }

  async clear(): Promise<number> {
    const pending = this.jobs.filter((job) => isActiveState(job.state)).length;
    for (const job of this.jobs) {
      if (job.state !== 'queued') continue;
      this.update(job, { state: 'cancelled', error: 'queue-cleared', completedAt: timestamp() });
    }
    await this.skipCurrent();
    if (pending > 0) this.dependencies.onDiagnostic?.({ kind: 'cleared', stage: null, count: pending });
    this.emit();
    return pending;
  }

  retry(jobId: string): boolean {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || !['error', 'cancelled', 'skipped'].includes(job.state)) return false;
    if (this.jobs.filter((candidate) => isActiveState(candidate.state)).length >= this.maximum) return false;
    this.update(job, {
      state: 'queued', text: '', aiReply: null, synthesis: null, error: null,
      startedAt: null, completedAt: null,
    });
    this.emit();
    this.dependencies.onDiagnostic?.({ kind: 'retry', stage: null, count: job.attempts + 1 });
    void this.process();
    return true;
  }

  snapshot(): InteractionQueueSnapshot {
    return {
      jobs: structuredClone(this.jobs),
      activeJobId: this.activeJobId,
      avatarState: this.avatarState,
      queuedCount: this.jobs.filter((job) => job.state === 'queued').length,
    };
  }

  subscribe(listener: (snapshot: InteractionQueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  waitForIdle(): Promise<void> {
    if (!this.processing && !this.jobs.some((job) => isActiveState(job.state))) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (true) {
        const job = [...this.jobs].reverse().find((candidate) => candidate.state === 'queued');
        if (!job) return;
        this.activeJobId = job.id;
        this.controller = new AbortController();
        this.update(job, { startedAt: timestamp(), attempts: job.attempts + 1 });
        this.emit();
        try {
          if (job.actionType === 'ignore') {
            this.finish(job, 'skipped', 'action-ignore');
            continue;
          }
          if (job.actionType === 'ai_speech') {
            if (!job.aiInput) throw new Error('AI_INPUT_MISSING');
            this.update(job, { state: 'ai_processing' });
            this.emit();
            const reply = await this.dependencies.generateAi(job.aiInput);
            if (reply.status === 'cancelled') throw new DOMException('Cancelled', 'AbortError');
            if (!reply.text) throw new Error(reply.reason ?? 'AI_REPLY_EMPTY');
            this.update(job, { aiReply: reply, text: reply.text });
          } else {
            this.update(job, { text: job.directText.trim() });
          }
          if (!job.text) {
            this.finish(job, 'skipped', 'empty-speech');
            continue;
          }
          this.update(job, { state: 'tts_processing' });
          this.emit();
          const synthesis = await this.dependencies.synthesize({
            requestId: this.ttsRequestId(job), text: job.text, voice: job.ttsSettings.voice,
            speed: job.ttsSettings.speed, volume: job.ttsSettings.volume, timeoutMs: job.ttsSettings.timeoutMs,
          });
          this.update(job, { state: 'playing', synthesis });
          this.emit();
          await this.dependencies.play(synthesis, job.ttsSettings, this.controller.signal, () => this.setAvatarState('talking', job));
          this.finish(job, 'done', null);
        } catch (reason) {
          const stage = queueStage(job.state);
          const cancelled = isAbort(reason) || this.controller.signal.aborted;
          this.finish(job, cancelled ? 'cancelled' : 'error', reason instanceof Error ? reason.message : 'queue-error');
          this.dependencies.onDiagnostic?.({ kind: cancelled ? 'job-cancelled' : 'job-error', stage, count: job.attempts });
        } finally {
          this.setAvatarState('idle', null);
          this.activeJobId = null;
          this.controller = null;
          this.emit();
        }
      }
    } finally {
      this.processing = false;
      if (!this.jobs.some((job) => isActiveState(job.state))) {
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
      }
    }
  }

  private currentJob(): InteractionQueueJob | null {
    return this.jobs.find((job) => job.id === this.activeJobId) ?? null;
  }

  private ttsRequestId(job: InteractionQueueJob): string { return `tts-${job.id}`; }

  private finish(job: InteractionQueueJob, state: InteractionQueueJob['state'], error: string | null): void {
    this.update(job, { state, error, completedAt: timestamp() });
  }

  private update(job: InteractionQueueJob, patch: Partial<InteractionQueueJob>): void {
    Object.assign(job, patch, { updatedAt: timestamp() });
  }

  private setAvatarState(state: AvatarSpeechState, job: InteractionQueueJob | null): void {
    if (this.avatarState === state) return;
    this.avatarState = state;
    this.dependencies.onAvatarState?.(state, job ? structuredClone(job) : null);
  }

  private emit(): void {
    if (this.listeners.size === 0 || this.emitScheduled) return;
    this.emitScheduled = true;
    globalThis.setTimeout(() => {
      this.emitScheduled = false;
      if (this.listeners.size === 0) return;
      const snapshot = this.snapshot();
      for (const listener of this.listeners) listener(snapshot);
    }, 0);
  }

  private trimHistory(): void {
    if (this.jobs.length <= 300) return;
    const removable = this.jobs.filter((job) => !isActiveState(job.state)).slice(250);
    for (const job of removable) {
      const index = this.jobs.indexOf(job);
      if (index >= 0) this.jobs.splice(index, 1);
    }
  }
}

function queueStage(state: InteractionQueueJob['state']): QueueDiagnosticEvent['stage'] {
  if (state === 'ai_processing') return 'ai';
  if (state === 'tts_processing') return 'tts';
  if (state === 'playing') return 'playback';
  return 'queued';
}
