import { describe, expect, it, vi } from 'vitest';
import { InteractionQueue, type InteractionQueueDependencies } from '../../src/modules/queue/interaction-queue';
import { createDefaultAiReplySettings } from '../../src/shared/contracts/ai';
import { createDefaultTtsProjectSettings } from '../../src/shared/contracts/tts';
import type { InteractionQueueInput } from '../../src/shared/contracts/queue';
import type { QueueDiagnosticEvent } from '../../src/shared/contracts/diagnostics';

function input(index: number, actionType: InteractionQueueInput['actionType'] = 'voice_tts'): InteractionQueueInput {
  const event = {
    id: `event-${index}`, type: 'chat' as const, source: 'mock' as const,
    timestamp: new Date(1_785_283_200_000 + index).toISOString(),
    user: { id: `user-${index}`, uniqueId: `user-${index}`, nickname: `User ${index}` }, text: `Comment ${index}`,
  };
  return {
    id: `job-${index}`, event, actionType, directText: `Reply ${index}`,
    aiInput: actionType === 'ai_speech' ? {
      requestId: `ai-${index}`, event, settings: createDefaultAiReplySettings(), productMatch: null, bannedOutputTerms: [],
    } : null,
    ttsSettings: createDefaultTtsProjectSettings(),
  };
}

function dependencies(overrides: Partial<InteractionQueueDependencies> = {}): InteractionQueueDependencies {
  const generateAi: InteractionQueueDependencies['generateAi'] = async (request) => ({
    requestId: request.requestId, eventId: request.event.id, status: 'success', text: `AI ${request.event.id}`,
    provider: 'mock', model: 'mock-livestream-v1', attempts: 1, reason: null,
    prompt: { systemMessage: 'system', userMessage: 'user', eventType: 'chat', product: null, productScore: null },
  });
  const synthesize: InteractionQueueDependencies['synthesize'] = async (request) => ({
    requestId: request.requestId, provider: 'mock', transport: 'mock', text: request.text,
    voice: request.voice, durationMs: 1, mimeType: null, audioBase64: null, cacheKey: request.text, cached: false,
  });
  return {
    generateAi: vi.fn(generateAi),
    cancelAi: vi.fn(async () => false),
    synthesize: vi.fn(synthesize),
    cancelTts: vi.fn(async () => false),
    play: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('interaction queue', () => {
  it('processes AI, TTS, and playback sequentially without overlap', async () => {
    let playing = 0;
    let maximumPlaying = 0;
    const states: string[] = [];
    const queue = new InteractionQueue(dependencies({
      play: vi.fn(async () => {
        playing += 1;
        maximumPlaying = Math.max(maximumPlaying, playing);
        await Promise.resolve();
        playing -= 1;
      }),
      onAvatarState: (state) => states.push(state),
    }));
    queue.enqueue(input(1, 'ai_speech'));
    queue.enqueue(input(2));
    await queue.waitForIdle();
    const snapshot = queue.snapshot();
    expect(snapshot.jobs.map((job) => job.state)).toEqual(['done', 'done']);
    expect(snapshot.jobs.find((job) => job.id === 'job-1')?.text).toBe('AI event-1');
    expect(maximumPlaying).toBe(1);
    expect(states).toEqual(['talking', 'idle', 'talking', 'idle']);
    expect(snapshot.avatarState).toBe('idle');
  });

  it('continues after an AI failure and supports retry', async () => {
    let aiAttempt = 0;
    const generateAiImpl: InteractionQueueDependencies['generateAi'] = async (request) => {
      aiAttempt += 1;
      if (aiAttempt === 1) throw new Error('AI down');
      return {
        requestId: request.requestId, eventId: request.event.id, status: 'success', text: 'Recovered', provider: 'mock', model: 'mock', attempts: 1, reason: null,
        prompt: { systemMessage: 'system', userMessage: 'user', eventType: 'chat', product: null, productScore: null },
      };
    };
    const generateAi = vi.fn(generateAiImpl);
    const queue = new InteractionQueue(dependencies({ generateAi }));
    queue.enqueue(input(1, 'ai_speech'));
    queue.enqueue(input(2));
    await queue.waitForIdle();
    expect(queue.snapshot().jobs.find((job) => job.id === 'job-1')?.state).toBe('error');
    expect(queue.snapshot().jobs.find((job) => job.id === 'job-2')?.state).toBe('done');
    expect(queue.retry('job-1')).toBe(true);
    await queue.waitForIdle();
    expect(queue.snapshot().jobs.find((job) => job.id === 'job-1')).toMatchObject({ state: 'done', text: 'Recovered', attempts: 2 });
  });

  it('reports only bounded structural diagnostics for queue failures and retries', async () => {
    const events: QueueDiagnosticEvent[] = [];
    const queue = new InteractionQueue(dependencies({
      generateAi: vi.fn(async () => { throw new Error('private viewer text and token-should-not-cross'); }),
      onDiagnostic: (event) => events.push(event),
    }));
    queue.enqueue(input(1, 'ai_speech'));
    await queue.waitForIdle();
    expect(queue.retry('job-1')).toBe(true);
    await queue.waitForIdle();
    expect(events).toEqual([
      { kind: 'job-error', stage: 'ai', count: 1 },
      { kind: 'retry', stage: null, count: 2 },
      { kind: 'job-error', stage: 'ai', count: 2 },
    ]);
    expect(JSON.stringify(events)).not.toContain('private viewer text');
    expect(JSON.stringify(events)).not.toContain('token-should-not-cross');
  });

  it('cancels the active item and all queued work on clear', async () => {
    const play: InteractionQueueDependencies['play'] = vi.fn((_result, _settings, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const queue = new InteractionQueue(dependencies({ play }));
    queue.enqueue(input(1));
    queue.enqueue(input(2));
    await vi.waitFor(() => expect(queue.snapshot().activeJobId).toBe('job-1'));
    expect(await queue.clear()).toBe(2);
    await queue.waitForIdle();
    expect(queue.snapshot().jobs.map((job) => job.state)).toEqual(['cancelled', 'cancelled']);
  });

  it('enforces the 100-job bound and marks overflow as skipped', () => {
    const queue = new InteractionQueue(dependencies({ play: vi.fn(() => new Promise<void>(() => undefined)) }));
    for (let index = 0; index < 101; index += 1) queue.enqueue(input(index));
    const snapshot = queue.snapshot();
    expect(snapshot.jobs.filter((job) => ['queued', 'playing', 'tts_processing'].includes(job.state))).toHaveLength(100);
    expect(snapshot.jobs.find((job) => job.id === 'job-100')).toMatchObject({ state: 'skipped', error: 'queue-full' });
  });

  it('processes hundreds of mock jobs without growing subscriptions', async () => {
    const queue = new InteractionQueue(dependencies());
    let emissions = 0;
    const unsubscribe = queue.subscribe(() => { emissions += 1; });
    for (let batch = 0; batch < 3; batch += 1) {
      for (let index = 0; index < 100; index += 1) queue.enqueue(input(batch * 100 + index));
      await queue.waitForIdle();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    }
    expect(queue.snapshot().jobs.filter((job) => job.state === 'done')).toHaveLength(300);
    expect(emissions).toBe(4);
    unsubscribe();
    const emissionsAfterUnsubscribe = emissions;
    queue.enqueue(input(301));
    await queue.waitForIdle();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(emissions).toBe(emissionsAfterUnsubscribe);
    expect(queue.snapshot().activeJobId).toBeNull();
  }, 30_000);
});
