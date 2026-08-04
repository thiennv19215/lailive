import type { TtsProjectSettings, TtsSynthesisResult } from '../../shared/contracts/tts';

function abortError(): DOMException { return new DOMException('Playback cancelled', 'AbortError'); }

function audioBytes(base64: string): ArrayBuffer {
  const decoded = globalThis.atob(base64);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function playAudio(result: TtsSynthesisResult, settings: TtsProjectSettings, signal: AbortSignal, onStarted?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const blob = new globalThis.Blob([audioBytes(result.audioBase64)], { type: result.mimeType ?? 'audio/mpeg' });
    const url = globalThis.URL.createObjectURL(blob);
    const audio = new globalThis.Audio(url);
    audio.preload = 'auto';
    audio.playbackRate = settings.speed;
    audio.volume = settings.volume;
    const cancel = (): void => { audio.pause(); cleanup(); reject(abortError()); };
    const cleanup = (): void => { audio.onended = null; audio.onerror = null; signal.removeEventListener('abort', cancel); globalThis.URL.revokeObjectURL(url); };
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new Error('TTS_AUDIO_PLAYBACK_ERROR')); };
    signal.addEventListener('abort', cancel, { once: true });
    void audio.play().then(() => onStarted?.()).catch((reason) => { cleanup(); reject(reason); });
  });
}

export async function playTtsResult(result: TtsSynthesisResult, settings: TtsProjectSettings, signal: AbortSignal, onStarted?: () => void): Promise<void> {
  return playAudio(result, settings, signal, onStarted);
}

// Settings voice checks remain local. Livestream jobs use the Browser Source
// so OBS receives one mixed audio stream without Desktop Audio.
export async function playLiveTtsThroughSceneRuntime(result: TtsSynthesisResult, settings: TtsProjectSettings, signal: AbortSignal, onStarted?: () => void): Promise<void> {
  const requestId = result.requestId;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let stopping = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    const cleanup = (): void => {
      if (timeout !== null) globalThis.clearTimeout(timeout);
      unsubscribe();
      signal.removeEventListener('abort', cancel);
    };
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const stopAndReject = (error: Error): void => {
      if (stopping || settled) return;
      stopping = true;
      void globalThis.window.desktopApi.sceneRuntime.stopTts(requestId).finally(() => settle(() => reject(error)));
    };
    const cancel = (): void => stopAndReject(abortError());
    const unsubscribe = globalThis.window.desktopApi.sceneRuntime.onTtsEvent((event) => {
      if (event.requestId !== requestId) return;
      if (event.kind === 'started') onStarted?.();
      if (event.kind === 'ended') settle(resolve);
      if (event.kind === 'error') settle(() => reject(new Error(event.error ?? 'TTS_AUDIO_PLAYBACK_ERROR')));
    });
    signal.addEventListener('abort', cancel, { once: true });
    timeout = globalThis.setTimeout(() => stopAndReject(new Error('TTS_SCENE_RUNTIME_PLAYBACK_TIMEOUT')), settings.timeoutMs);
    void globalThis.window.desktopApi.sceneRuntime.playTts({
      requestId,
      audioBase64: result.audioBase64,
      mimeType: result.mimeType ?? 'audio/mpeg',
      speed: settings.speed,
      volume: settings.volume,
    }).catch((error) => settle(() => reject(error)));
  });
}
