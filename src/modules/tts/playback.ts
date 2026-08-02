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
