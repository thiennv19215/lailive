import { afterEach, describe, expect, it, vi } from 'vitest';
import { playLiveTtsThroughSceneRuntime } from '../../src/modules/tts/playback';
import { createDefaultTtsProjectSettings } from '../../src/shared/contracts/tts';
import { InteractionQueue } from '../../src/modules/queue/interaction-queue';
import type { InteractionQueueInput } from '../../src/shared/contracts/queue';

type TtsEvent = { requestId: string; kind: 'started' | 'ended' | 'error'; error: string | null };

const result = {
  requestId: 'tts-1', provider: 'mock' as const, transport: 'audio' as const, text: 'Xin chao', voice: 'mock',
  durationMs: 1, mimeType: 'audio/wav', audioBase64: 'AA==', audioUrl: null, cacheKey: 'tts-1', cached: false,
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('live TTS Scene Runtime playback', () => {
  it('keeps Scene Runtime TTS jobs sequential in the production queue', async () => {
    const listeners = new Set<(event: TtsEvent) => void>();
    const playTts = vi.fn<(tts: { requestId: string }) => Promise<boolean>>(async () => true);
    vi.stubGlobal('window', { desktopApi: { sceneRuntime: {
      playTts, stopTts: vi.fn(async () => true),
      onTtsEvent: (listener: (event: TtsEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    } } });
    const queue = new InteractionQueue({
      generateAi: vi.fn(), cancelAi: vi.fn(async () => false), cancelTts: vi.fn(async () => false),
      synthesize: async (input) => ({ ...result, requestId: input.requestId, text: input.text, voice: input.voice }),
      play: playLiveTtsThroughSceneRuntime,
    });
    const makeInput = (id: string): InteractionQueueInput => ({
      id, actionType: 'voice_tts', directText: id, aiInput: null, ttsSettings: createDefaultTtsProjectSettings(),
      event: { id, type: 'chat', source: 'mock', timestamp: new Date().toISOString(), user: { id, uniqueId: id, nickname: id }, text: id },
    });
    queue.enqueue(makeInput('one'));
    queue.enqueue(makeInput('two'));
    await vi.waitFor(() => expect(playTts).toHaveBeenCalledTimes(1));
    const firstId = (playTts.mock.calls[0]?.[0] as { requestId: string }).requestId;
    for (const listener of [...listeners]) listener({ requestId: firstId, kind: 'started', error: null });
    for (const listener of [...listeners]) listener({ requestId: firstId, kind: 'ended', error: null });
    await vi.waitFor(() => expect(playTts).toHaveBeenCalledTimes(2));
    const secondId = (playTts.mock.calls[1]?.[0] as { requestId: string }).requestId;
    for (const listener of [...listeners]) listener({ requestId: secondId, kind: 'started', error: null });
    for (const listener of [...listeners]) listener({ requestId: secondId, kind: 'ended', error: null });
    await queue.waitForIdle();
    expect(queue.snapshot().jobs.map((job) => job.state)).toEqual(['done', 'done']);
  });

  it('waits for Scene Runtime lifecycle events before completing playback', async () => {
    const listeners = new Set<(event: TtsEvent) => void>();
    const playTts = vi.fn(async () => true);
    vi.stubGlobal('window', { desktopApi: { sceneRuntime: {
      playTts,
      stopTts: vi.fn(async () => true),
      onTtsEvent: (listener: (event: TtsEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    } } });
    const controller = new AbortController();
    let started = false;
    const first = playLiveTtsThroughSceneRuntime(result, createDefaultTtsProjectSettings(), controller.signal, () => { started = true; });
    await vi.waitFor(() => expect(playTts).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'tts-1' })));
    expect(started).toBe(false);
    for (const listener of listeners) listener({ requestId: 'tts-1', kind: 'started', error: null });
    expect(started).toBe(true);
    for (const listener of [...listeners]) listener({ requestId: 'tts-1', kind: 'ended', error: null });
    await first;
    let secondStarted = false;
    const second = playLiveTtsThroughSceneRuntime({ ...result, requestId: 'tts-2' }, createDefaultTtsProjectSettings(), controller.signal, () => { secondStarted = true; });
    await vi.waitFor(() => expect(playTts).toHaveBeenCalledTimes(2));
    for (const listener of [...listeners]) listener({ requestId: 'tts-2', kind: 'started', error: null });
    for (const listener of [...listeners]) listener({ requestId: 'tts-2', kind: 'ended', error: null });
    await second;
    expect(secondStarted).toBe(true);
  });

  it('stops the active Browser Source TTS when the queue aborts and rejects runtime errors', async () => {
    const listeners = new Set<(event: TtsEvent) => void>();
    const stopTts = vi.fn(async () => true);
    vi.stubGlobal('window', { desktopApi: { sceneRuntime: {
      playTts: vi.fn(async () => true), stopTts,
      onTtsEvent: (listener: (event: TtsEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    } } });
    const controller = new AbortController();
    const pending = playLiveTtsThroughSceneRuntime(result, createDefaultTtsProjectSettings(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(stopTts).toHaveBeenCalledWith('tts-1');

    const error = playLiveTtsThroughSceneRuntime(result, createDefaultTtsProjectSettings(), new AbortController().signal);
    for (const listener of [...listeners]) listener({ requestId: 'tts-1', kind: 'error', error: 'decode failed' });
    await expect(error).rejects.toThrow('decode failed');
  });

  it('stops and rejects a playback that never receives a Browser Source lifecycle event', async () => {
    vi.useFakeTimers();
    const stopTts = vi.fn(async () => true);
    vi.stubGlobal('window', { desktopApi: { sceneRuntime: {
      playTts: vi.fn(async () => true), stopTts,
      onTtsEvent: () => () => undefined,
    } } });
    const pending = playLiveTtsThroughSceneRuntime(result, { ...createDefaultTtsProjectSettings(), timeoutMs: 25 }, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('TTS_SCENE_RUNTIME_PLAYBACK_TIMEOUT');
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(stopTts).toHaveBeenCalledWith('tts-1');
  });
});
