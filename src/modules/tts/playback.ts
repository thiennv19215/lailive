import type { TtsProjectSettings, TtsSynthesisResult } from '../../shared/contracts/tts';

function abortError(): DOMException { return new DOMException('Playback cancelled', 'AbortError'); }

function wait(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const finish = (): void => { signal.removeEventListener('abort', cancel); resolve(); };
    const cancel = (): void => { globalThis.clearTimeout(timer); reject(abortError()); };
    const timer = globalThis.setTimeout(finish, durationMs);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function audioBytes(base64: string): ArrayBuffer {
  const decoded = globalThis.atob(base64);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function playAudio(result: TtsSynthesisResult, settings: TtsProjectSettings, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!result.audioBase64) return reject(new Error('TTS_AUDIO_MISSING'));
    const blob = new globalThis.Blob([audioBytes(result.audioBase64)], { type: result.mimeType ?? 'audio/mpeg' });
    const url = globalThis.URL.createObjectURL(blob);
    const audio = new globalThis.Audio(url);
    audio.playbackRate = settings.speed;
    audio.volume = settings.volume;
    const cancel = (): void => { audio.pause(); cleanup(); reject(abortError()); };
    const cleanup = (): void => { audio.onended = null; audio.onerror = null; signal.removeEventListener('abort', cancel); globalThis.URL.revokeObjectURL(url); };
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new Error('TTS_AUDIO_PLAYBACK_ERROR')); };
    signal.addEventListener('abort', cancel, { once: true });
    void audio.play().catch((reason) => { cleanup(); reject(reason); });
  });
}

function playSpeech(result: TtsSynthesisResult, settings: TtsProjectSettings, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in globalThis)) return reject(new Error('WINDOWS_SPEECH_UNAVAILABLE'));
    const utterance = new SpeechSynthesisUtterance(result.text);
    utterance.rate = settings.speed;
    utterance.volume = settings.volume;
    utterance.voice = globalThis.speechSynthesis.getVoices().find((voice) => voice.name === settings.voice) ?? null;
    const cancel = (): void => { globalThis.speechSynthesis.cancel(); reject(abortError()); };
    const cleanup = (): void => signal.removeEventListener('abort', cancel);
    utterance.onend = () => { cleanup(); resolve(); };
    utterance.onerror = (event) => { cleanup(); reject(new Error(`WINDOWS_SPEECH_${event.error}`)); };
    signal.addEventListener('abort', cancel, { once: true });
    globalThis.speechSynthesis.speak(utterance);
  });
}

export async function playTtsResult(result: TtsSynthesisResult, settings: TtsProjectSettings, signal: AbortSignal): Promise<void> {
  if (result.transport === 'mock') return wait(result.durationMs, signal);
  if (result.transport === 'audio') return playAudio(result, settings, signal);
  return playSpeech(result, settings, signal);
}
