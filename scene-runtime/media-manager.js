/* global HTMLImageElement, HTMLMediaElement, HTMLVideoElement, document */

const PRELOAD_CACHE_LIMIT = 12;
const PRELOAD_IDLE_MS = 2 * 60_000;
const READY_TIMEOUT_MS = 10_000;

function waitFor(target, event, timeoutMs = READY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => finish(new Error(`Timed out waiting for ${event}.`)), timeoutMs);
    const finish = (error) => {
      globalThis.clearTimeout(timeout);
      target.removeEventListener(event, onReady);
      target.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error(`Media failed while waiting for ${event}.`));
    target.addEventListener(event, onReady, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

export class RuntimeMediaManager {
  constructor({ reportEvent, limit = PRELOAD_CACHE_LIMIT } = {}) {
    this.entries = new Map();
    this.reportEvent = reportEvent ?? (() => undefined);
    this.limit = limit;
    this.preloadRoot = document.createElement('div');
    this.preloadRoot.setAttribute('aria-hidden', 'true');
    Object.assign(this.preloadRoot.style, {
      position: 'fixed', left: '-10000px', top: '-10000px', width: '1px', height: '1px', opacity: '0', overflow: 'hidden', pointerEvents: 'none',
    });
    document.body.append(this.preloadRoot);
  }

  create(kind, sourceUrl) {
    const media = document.createElement(kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'img');
    media.src = sourceUrl;
    if (media instanceof HTMLMediaElement) {
      media.preload = 'auto';
      media.playsInline = true;
    }
    return media;
  }

  acquire({ signature, kind, sourceUrl }) {
    let entry = this.entries.get(signature);
    if (!entry) {
      entry = { signature, kind, sourceUrl, media: this.create(kind, sourceUrl), attached: false, lastUsedAt: Date.now() };
      this.entries.set(signature, entry);
      this.preloadRoot.append(entry.media);
    }
    entry.lastUsedAt = Date.now();
    // A source can legitimately appear in two layers. Never steal a visible
    // element from the first layer; cache the second one once it is released.
    if (entry.attached) return this.create(kind, sourceUrl);
    entry.attached = true;
    return entry.media;
  }

  release(signature, media) {
    const entry = this.entries.get(signature);
    if (!entry || entry.media !== media) return;
    entry.attached = false;
    entry.lastUsedAt = Date.now();
    this.preloadRoot.append(media);
  }

  async preload({ signature, kind, sourceUrl, resumeAtMs = null }) {
    const entry = this.entries.get(signature) ?? { signature, kind, sourceUrl, media: this.create(kind, sourceUrl), attached: false, lastUsedAt: Date.now() };
    if (!this.entries.has(signature)) {
      this.entries.set(signature, entry);
      this.preloadRoot.append(entry.media);
    }
    entry.lastUsedAt = Date.now();
    try {
      if (entry.media instanceof HTMLMediaElement) {
        if (entry.media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitFor(entry.media, 'loadeddata');
        if (Number.isFinite(resumeAtMs) && resumeAtMs >= 0) await this.seek(entry.media, resumeAtMs);
      } else if (entry.media instanceof HTMLImageElement && !entry.media.complete) {
        await waitFor(entry.media, 'load');
      }
      // Preload readiness is cache-local. The runtime reports `ready` only
      // after this entry becomes the active presentation media.
    } catch (error) {
      this.reportEvent({ kind: 'error', signature, error: error instanceof Error ? error.message : String(error) });
    }
    this.cleanup();
  }

  async seek(media, resumeAtMs) {
    if (!(media instanceof HTMLMediaElement) || !Number.isFinite(resumeAtMs) || resumeAtMs < 0) return;
    try {
      if (media.readyState < HTMLMediaElement.HAVE_METADATA) await waitFor(media, 'loadedmetadata');
      const targetSeconds = resumeAtMs / 1000;
      if (Math.abs(media.currentTime - targetSeconds) > 0.025) {
        const seeked = waitFor(media, 'seeked');
        media.currentTime = targetSeconds;
        await seeked;
      }
      if (media instanceof HTMLVideoElement && typeof media.requestVideoFrameCallback === 'function') {
        await new Promise((resolve) => media.requestVideoFrameCallback(() => resolve()));
      }
      this.reportEvent({ kind: 'seeked', resumeAtMs, signature: this.signatureFor(media) });
    } catch (error) {
      this.reportEvent({ kind: 'error', resumeAtMs, signature: this.signatureFor(media), error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  cleanup() {
    const now = Date.now();
    const removable = [...this.entries.values()]
      .filter((entry) => !entry.attached && now - entry.lastUsedAt > PRELOAD_IDLE_MS)
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt);
    const overflow = Math.max(0, this.entries.size - this.limit);
    for (const entry of [...removable, ...[...this.entries.values()].filter((candidate) => !candidate.attached).sort((left, right) => left.lastUsedAt - right.lastUsedAt).slice(0, overflow)]) {
      if (!this.entries.has(entry.signature)) continue;
      entry.media.pause?.();
      entry.media.removeAttribute?.('src');
      entry.media.load?.();
      entry.media.remove();
      this.entries.delete(entry.signature);
    }
  }

  signatureFor(media) {
    return [...this.entries.values()].find((entry) => entry.media === media)?.signature ?? null;
  }
}
