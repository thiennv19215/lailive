/* global EventSource, HTMLCanvasElement, HTMLImageElement, HTMLMediaElement, HTMLVideoElement, cancelAnimationFrame, crypto, document, fetch, requestAnimationFrame */
import { RuntimeMediaManager } from './media-manager.js';
const sceneElement = document.querySelector('#scene');
const statusElement = document.querySelector('#status');
const clientId = `scene-${crypto.randomUUID()}`;
const layerNodes = new Map();
let currentState = null;
let lastServerRevision = 0;
let lastPlaybackRevision = -1;
let chromaFrame = null;
let lastChromaFrameAt = 0;
// Each renderer cuts only after its own decoder has produced the successor's
// first frame. This never makes two timeline videos visible at once.
let displayedTimelineLayerId = null;
let activeTtsRequestId = null;
let activeTtsAudio = null;

const mediaManager = new RuntimeMediaManager({
  reportEvent: (event) => {
    const revision = currentState?.presentation?.playbackRevision;
    if (!Number.isInteger(revision)) return;
    void fetch('/media-event', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, revision, ...event }),
    }).catch(() => undefined);
  },
});

function report(level, message) {
  void fetch('/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, level, message: String(message).slice(0, 2000) }),
  }).catch(() => undefined);
}

function reportTts(kind, requestId, error = null) {
  console.info(`[TTS] ${kind}:`, error ?? requestId);
  return fetch('/tts-event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId, kind, error }) }).catch(() => undefined);
}

async function syncTts(tts) {
  if (!tts || tts.requestId === activeTtsRequestId) return;
  activeTtsAudio?.pause();
  activeTtsRequestId = tts.requestId;
  const audio = new Audio(`data:${tts.mimeType};base64,${tts.audioBase64}`);
  activeTtsAudio = audio;
  audio.preload = 'auto';
  audio.playbackRate = tts.speed;
  audio.volume = tts.volume;
  console.info('[TTS] provider: browser audio');
  console.info('[TTS] audio size:', tts.audioBase64.length);
  console.info('[TTS] url: data audio URL');
  audio.addEventListener('ended', () => { console.info('[TTS] play ended: true'); void reportTts('ended', tts.requestId); }, { once: true });
  audio.addEventListener('error', () => { const message = 'TTS_AUDIO_PLAYBACK_ERROR'; console.error('[TTS] error:', message); void reportTts('error', tts.requestId, message); }, { once: true });
  try {
    await audio.play();
    console.info('[TTS] play started: true');
    void reportTts('started', tts.requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[TTS] error:', message);
    void reportTts('error', tts.requestId, message);
  }
}

function mediaKind(layer, scene = currentState?.scene) {
  if (layer.source.type === 'media' && layer.source.mediaReferenceId) {
    return scene?.mediaReferences.find((reference) => reference.id === layer.source.mediaReferenceId)?.kind ?? 'image';
  }
  if (layer.source.assetId === 'flower-video') return 'video';
  return layer.kind === 'audio' ? 'audio' : layer.kind === 'video' ? 'video' : 'image';
}

function mediaReference(layer, scene) {
  if (layer.source.type !== 'media' || !layer.source.mediaReferenceId) return null;
  return scene.mediaReferences.find((reference) => reference.id === layer.source.mediaReferenceId) ?? null;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sourceSignature(layer, scene) {
  const reference = mediaReference(layer, scene);
  const sourceVersion = reference ? stableHash(`${reference.path}:${reference.kind}`) : '';
  return `${layer.kind}:${mediaKind(layer, scene)}:${layer.source.type}:${layer.source.assetId ?? ''}:${layer.source.mediaReferenceId ?? ''}:${sourceVersion}`;
}

function isPresentationMedia(layerId) {
  const presentation = currentState?.presentation;
  if (!presentation || !presentation.activeScriptId) return false;
  return presentation.activeLayerId === layerId
    || presentation.activeAudioLayerId === layerId;
}

function reportActiveMediaReady(layerId, media, signature) {
  const presentation = currentState?.presentation;
  if (!isPresentationMedia(layerId) || !presentation || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const revision = String(presentation.playbackRevision);
  if (media.dataset.readyRevision === revision) return;
  media.dataset.readyRevision = revision;
  mediaManager.reportEvent({ kind: 'ready', layerId, signature, currentTime: media.currentTime });
}

function mediaSourceUrl(layer, scene) {
  const sourceId = layer.source.type === 'builtin' ? layer.source.assetId : layer.source.mediaReferenceId;
  return `/assets/${encodeURIComponent(sourceId)}?v=${encodeURIComponent(sourceSignature(layer, scene))}`;
}

function preloadPresentationMedia(state) {
  const presentation = state.presentation;
  if (!presentation) return;
  const requestedIds = new Set([
    presentation.pendingLayerId,
    presentation.pendingAudioLayerId,
    presentation.pendingAvatarLayerId,
    presentation.preloadLayerId,
    ...(Array.isArray(presentation.preloadLayerIds) ? presentation.preloadLayerIds : []),
  ].filter(Boolean));
  for (const layer of state.scene.layers) {
    if (!requestedIds.has(layer.id) || !isRenderable(layer)) continue;
    const kind = mediaKind(layer, state.scene);
    if (kind === 'image') continue;
    void mediaManager.preload({
      signature: sourceSignature(layer, state.scene), kind, sourceUrl: mediaSourceUrl(layer, state.scene),
      resumeAtMs: presentationResumeAtMs(presentation, layer.id),
    });
  }
}

function presentationResumeAtMs(presentation, layerId) {
  if (layerId === presentation.activeAudioLayerId || layerId === presentation.pendingAudioLayerId) {
    // Older timeline snapshots have no dedicated hint, so retain their shared
    // resume behavior. State-driven audio always supplies its own offset.
    return Number.isFinite(presentation.audioResumeAtMs)
      ? presentation.audioResumeAtMs
      : Number.isFinite(presentation.resumeAtMs) ? presentation.resumeAtMs : null;
  }
  return Number.isFinite(presentation.resumeAtMs) ? presentation.resumeAtMs : null;
}

function isRenderable(layer) {
  if (layer.kind === 'text') return true;
  return layer.source.type === 'builtin' ? Boolean(layer.source.assetId) : layer.source.type === 'media' && Boolean(layer.source.mediaReferenceId);
}

function isDefaultBackgroundLayer(layer) {
  return layer.kind === 'image'
    && layer.source.type === 'builtin'
    && ['beauty-studio', 'beauty-cream', 'background-white-clean', 'background-white-warm', 'background-white-studio'].includes(layer.source.assetId);
}

function syncDisplayedTimelineLayer(presentation) {
  const requestedLayerId = presentation?.activeLayerId;
  if (!requestedLayerId) { displayedTimelineLayerId = null; return; }
  const media = layerNodes.get(requestedLayerId)?.querySelector('[data-media="source"]');
  if (!(media instanceof HTMLVideoElement) || media.dataset.frameReady === 'true') displayedTimelineLayerId = requestedLayerId;
  else if (!displayedTimelineLayerId) displayedTimelineLayerId = requestedLayerId;
}

function isStickerLayer(layer) {
  return layer.kind === 'image'
    && layer.source.type === 'builtin'
    && ['sticker-freeship', 'sticker-hot-deal', 'sticker-live-only', 'sticker-sale-50'].includes(layer.source.assetId);
}

function createLayerNode(layer, state) {
  const root = document.createElement(layer.kind === 'text' ? 'div' : 'section');
  root.className = layer.kind === 'text' ? 'runtime-layer runtime-text' : 'runtime-layer runtime-media';
  root.dataset.layerId = layer.id;
  root.dataset.sourceSignature = sourceSignature(layer, state.scene);
  const sourceId = layer.source.type === 'builtin' ? layer.source.assetId : layer.source.mediaReferenceId;
  if (layer.kind !== 'text' && sourceId) {
    const renderedKind = mediaKind(layer, state.scene);
    const signature = sourceSignature(layer, state.scene);
    const media = mediaManager.acquire({ signature, kind: renderedKind, sourceUrl: mediaSourceUrl(layer, state.scene) });
    media.dataset.media = 'source';
    if (media instanceof HTMLMediaElement) {
      // Audio is command-owned: preloading it must never make it audible.
      // `updateLayerNode` starts it only after a presentation selects the layer.
      media.autoplay = renderedKind !== 'audio';
      media.preload = 'auto';
      if (media instanceof HTMLVideoElement) media.playsInline = true;
      media.addEventListener('ended', () => {
        const presentation = currentState?.presentation;
        // A displayed predecessor can end while its successor is decoding.
        // A cue voice ends independently from the master visual. Only a
        // visual may use the legacy playback-ended endpoint.
        if (!presentation || presentation.pendingLayerId || !presentation.activeScriptId || !isPresentationMedia(layer.id)) return;
        if (presentation.activeLayerId === layer.id) {
          void fetch('/playback-ended', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ scriptId: presentation.activeScriptId, layerId: layer.id, playbackRevision: presentation.playbackRevision }),
          }).catch(() => undefined);
        }
        mediaManager.reportEvent({ kind: 'ended', layerId: layer.id, signature, currentTime: media.currentTime });
      });
      media.addEventListener('timeupdate', () => {
        if (isPresentationMedia(layer.id)) {
          mediaManager.reportEvent({ kind: 'progress', layerId: layer.id, signature, currentTime: media.currentTime });
        }
      });
    }
    const markMediaReady = () => {
      if (media instanceof HTMLVideoElement) {
        media.requestVideoFrameCallback(() => {
          media.dataset.frameReady = 'true';
          if (currentState) render(currentState);
        });
      }
      renderLayerChroma(layer.id);
    };
    media.addEventListener(media instanceof HTMLMediaElement ? 'loadeddata' : 'load', markMediaReady);
    // A preloaded element can be claimed after loadeddata already fired.
    if (!(media instanceof HTMLMediaElement) || media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markMediaReady();
    root.append(media);
    if (renderedKind !== 'audio') {
      const canvas = document.createElement('canvas');
      canvas.dataset.media = 'chroma';
      root.append(canvas);
    }
  }
  return root;
}

function layerBox(layer, imageIndex) {
  if (layer.kind === 'audio') return { left: 0, top: 0, width: 0.1, height: 0.1 };
  if (isDefaultBackgroundLayer(layer)) return { left: 0, top: 0, width: 100, height: 100 };
  if (isStickerLayer(layer)) return { left: 4, top: 3, width: 32, height: 12 };
  if (layer.kind === 'text') return { left: 8, top: 7, width: 84, height: 18 };
  if (layer.kind === 'video' || layer.kind === 'gif') return { left: 10, top: 30, width: 80, height: 30 };
  if (layer.kind === 'avatar') return { left: 42, top: 25, width: 54, height: 72 };
  if (imageIndex === 1) return { left: 8, top: 57, width: 84, height: 24 };
  return { left: 0, top: 0, width: 100, height: 100 };
}

function updateLayerNode(root, layer, index, imageIndex, state) {
  const isText = layer.kind === 'text';
  const box = layerBox(layer, imageIndex);
  const presentation = state.presentation ?? { mode: 'scene', activeScriptId: null, activeLayerId: null, pendingLayerId: null, activeAudioLayerId: null, pendingAudioLayerId: null, activeAvatarLayerId: null, activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, managedLayerIds: [], playbackRevision: 0, resumeActiveMedia: false, activePaused: true, activeMuted: true, activeVolume: 0, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0, activeAudioPaused: false };
  const managed = presentation.managedLayerIds.includes(layer.id);
  // A script-selected avatar owns its visibility; legacy idle/talking pairs keep their role behavior.
  const speechVisible = layer.kind !== 'avatar' || managed || layer.avatarState === 'none' || layer.avatarState === state.avatarState;
  // A video avatar assigned directly to a Timeline script is ordinary media;
  // only state-driven avatars are controlled by the avatar motion manager.
  const motionManaged = layer.kind === 'avatar' && Boolean(layer.avatarMotion) && presentation.activeLayerId !== layer.id;
  const presentationVisible = motionManaged
    ? presentation.activeAvatarLayerId === layer.id || presentation.pendingAvatarLayerId === layer.id
    : !managed || !presentation.activeScriptId || (layer.kind === 'avatar'
    ? !presentation.activeAvatarLayerId || presentation.activeAvatarLayerId === layer.id
    : displayedTimelineLayerId === layer.id || presentation.activeAudioLayerId === layer.id);
  const renderedKind = mediaKind(layer, state.scene);
  const sourceMedia = root.querySelector('[data-media="source"]');
  const waitingForAvatarFrame = motionManaged
    && layer.id === presentation.activeAvatarLayerId
    && sourceMedia instanceof HTMLVideoElement
    && sourceMedia.dataset.frameReady !== 'true';
  root.dataset.mediaKind = renderedKind;
  root.dataset.avatarState = layer.kind === 'avatar' ? layer.avatarState : '';
  root.classList.toggle('is-chroma', !isText && layer.chromaKey.enabled);
  Object.assign(root.style, {
    left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`,
    zIndex: String(1000 - index),
    opacity: layer.visible && speechVisible && presentationVisible && !waitingForAvatarFrame ? String(layer.opacity) : '0',
    pointerEvents: layer.kind === 'audio' ? 'none' : 'auto',
    transform: `translate(${(layer.transform.x / box.width) * 100}%, ${(layer.transform.y / box.height) * 100}%) rotate(${layer.transform.rotation}deg) scale(${layer.transform.scaleX}, ${layer.transform.scaleY})`,
  });
  if (isText) {
    const style = state.scene.textStyle;
    root.textContent = style.content || layer.name;
    Object.assign(root.style, {
      color: style.color, fontFamily: `'${style.font}', sans-serif`, fontSize: `${style.size}px`,
      fontStyle: style.italic ? 'italic' : 'normal', fontWeight: style.bold ? '700' : '400', textAlign: style.align,
    });
  } else {
    const media = sourceMedia;
    if (media) {
      media.style.objectFit = isDefaultBackgroundLayer(layer) ? 'cover' : layer.fitMode;
      media.style.borderRadius = layer.kind === 'image' ? `${state.scene.imageSettings.radius}px` : '0';
      if (media instanceof HTMLMediaElement) {
        const active = managed && ((presentation.pendingLayerId ?? presentation.activeLayerId) === layer.id || presentation.activeAudioLayerId === layer.id);
        // Timeline media must end so its callback can activate the next script.
        // Manual Live is intentionally allowed to loop its active visual; all
        // other managed timeline media must emit an end event for advancement.
        media.loop = managed ? Boolean(presentation.activeLoop && active && layer.id === presentation.activeLayerId) : layer.loop;
        media.muted = active ? (presentation.activeAudioLayerId === layer.id ? presentation.activeAudioMuted : presentation.activeMuted) : layer.muted;
        media.volume = active ? (presentation.activeAudioLayerId === layer.id ? presentation.activeAudioVolume : presentation.activeVolume) : layer.volume;
        const revision = String(presentation.playbackRevision);
        const speechManaged = layer.kind === 'avatar' && layer.avatarState !== 'none' && !motionManaged;
        if (motionManaged) {
          const motionActive = presentation.activeAvatarLayerId === layer.id || presentation.activeAvatarTransitionLayerId === layer.id || presentation.pendingAvatarLayerId === layer.id;
          media.loop = layer.avatarMotion === 'idle'; media.muted = true;
          if (!motionActive) media.pause();
          else { if (media.dataset.playbackRevision !== revision) { media.dataset.playbackRevision = revision; media.currentTime = 0; } void media.play().catch((error) => report('warn', error instanceof Error ? error.message : error)); }
        } else
        if (speechManaged && !speechVisible) {
          media.dataset.speechActive = 'false';
          media.pause();
        } else if (speechManaged) {
          if (media.dataset.speechActive !== 'true') media.currentTime = 0;
          media.dataset.speechActive = 'true';
          media.loop = true;
          void media.play().catch(() => undefined);
        } else if (layer.kind === 'audio' && !active) {
          // Scene audio has no ambient-autoplay mode. A track may remain in the
          // DOM for preload, but only the active prepared/live command owns it.
          media.pause();
          media.currentTime = 0;
        } else if (managed && ((layer.id === presentation.activeAudioLayerId ? presentation.activeAudioPaused : (presentation.mode === 'paused' || presentation.activePaused)) || !active)) {
          media.pause();
          if (managed && presentation.mode === 'stopped') media.currentTime = 0;
        } else {
          if (managed && media.dataset.playbackRevision !== revision) {
            media.dataset.playbackRevision = revision;
            if (!presentation.resumeActiveMedia) media.currentTime = 0;
          }
          const resumeAtMs = presentationResumeAtMs(presentation, layer.id);
          const hasIndependentAudioOffset = layer.id === presentation.activeAudioLayerId && Number.isFinite(presentation.audioResumeAtMs);
          if (managed && (presentation.resumeActiveMedia || hasIndependentAudioOffset) && resumeAtMs !== null && media.dataset.resumeAtMs !== String(resumeAtMs)) {
            // Progress events can publish another snapshot while seeking. Keep
            // playback paused until this exact seek settles, never starting at
            // the old frame during a segment cut or interrupt resume.
            if (media.dataset.pendingSeekAtMs !== String(resumeAtMs)) {
              media.dataset.pendingSeekAtMs = String(resumeAtMs);
              void mediaManager.seek(media, resumeAtMs).then(() => {
                media.dataset.resumeAtMs = String(resumeAtMs);
                delete media.dataset.pendingSeekAtMs;
                return media.play();
              }).catch((error) => report('warn', error instanceof Error ? error.message : error));
            }
          } else {
            void media.play().catch((error) => report('warn', error instanceof Error ? error.message : error));
          }
        }
        if (active) reportActiveMediaReady(layer.id, media, sourceSignature(layer, state.scene));
      }
    }
  }
  if (layer.chromaKey.enabled) {
    requestAnimationFrame(() => renderLayerChroma(layer.id));
  }
}

function objectFitRect(sourceWidth, sourceHeight, targetWidth, targetHeight, mode) {
  if (mode === 'fill' || sourceWidth <= 0 || sourceHeight <= 0) return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  const scale = mode === 'contain'
    ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

function applyChroma(data, color, tolerance) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return 0;
  const red = Number.parseInt(match[1], 16);
  const green = Number.parseInt(match[2], 16);
  const blue = Number.parseInt(match[3], 16);
  const threshold = Math.min(100, Math.max(0, tolerance)) / 100 * Math.sqrt(3 * 255 * 255);
  let removed = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (Math.hypot(data[index] - red, data[index + 1] - green, data[index + 2] - blue) <= threshold) {
      data[index + 3] = 0;
      removed += 1;
    }
  }
  return removed;
}

function renderLayerChroma(layerId) {
  if (!currentState) return;
  const layer = currentState.scene.layers.find((candidate) => candidate.id === layerId);
  const root = layerNodes.get(layerId);
  if (!layer?.chromaKey.enabled || !root) return;
  const media = root.querySelector('[data-media="source"]');
  const canvas = root.querySelector('[data-media="chroma"]');
  if (!media || !(canvas instanceof HTMLCanvasElement)) return;
  if (media instanceof HTMLMediaElement && !(media instanceof HTMLVideoElement)) return;
  const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0 || root.clientWidth <= 0 || root.clientHeight <= 0) return;
  const width = Math.max(1, Math.round(root.clientWidth));
  const height = Math.max(1, Math.round(root.clientHeight));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const rect = objectFitRect(sourceWidth, sourceHeight, width, height, layer.fitMode);
  context.clearRect(0, 0, width, height);
  context.drawImage(media, rect.x, rect.y, rect.width, rect.height);
  const pixels = context.getImageData(0, 0, width, height);
  canvas.dataset.chromaRemoved = String(applyChroma(pixels.data, layer.chromaKey.color, layer.chromaKey.tolerance));
  canvas.dataset.chromaPixels = String(width * height);
  context.putImageData(pixels, 0, 0);
}

function runChromaLoop(timestamp) {
  if (!currentState) {
    chromaFrame = null;
    return;
  }
  if (timestamp - lastChromaFrameAt >= 33) {
    for (const layer of currentState.scene.layers) {
      if (layer.chromaKey.enabled && mediaKind(layer) === 'video') renderLayerChroma(layer.id);
    }
    lastChromaFrameAt = timestamp;
  }
  const hasAnimatedChroma = currentState.scene.layers.some((layer) => layer.chromaKey.enabled && mediaKind(layer) === 'video');
  chromaFrame = hasAnimatedChroma ? requestAnimationFrame(runChromaLoop) : null;
}

function refreshChroma() {
  if (chromaFrame !== null) cancelAnimationFrame(chromaFrame);
  chromaFrame = null;
  if (!currentState) return;
  for (const layer of currentState.scene.layers) {
    if (layer.chromaKey.enabled) renderLayerChroma(layer.id);
  }
  if (currentState.scene.layers.some((layer) => layer.chromaKey.enabled && mediaKind(layer) === 'video')) {
    chromaFrame = requestAnimationFrame(runChromaLoop);
  }
}

function render(state) {
  currentState = state;
  void syncTts(state.tts);
  preloadPresentationMedia(state);
  syncDisplayedTimelineLayer(state.presentation);
  const ratio = state.scene.width / state.scene.height;
  Object.assign(sceneElement.style, {
    aspectRatio: `${state.scene.width} / ${state.scene.height}`,
    width: `min(100vw, ${ratio * 100}vh)`,
    height: `min(100vh, ${100 / ratio}vw)`,
  });
  const activeIds = new Set(state.scene.layers.filter(isRenderable).map((layer) => layer.id));
  for (const [id, node] of layerNodes) {
    if (!activeIds.has(id)) {
      const media = node.querySelector('[data-media="source"]');
      if (media instanceof HTMLMediaElement || media instanceof HTMLImageElement) mediaManager.release(node.dataset.sourceSignature, media);
      node.remove();
      layerNodes.delete(id);
    }
  }
  const imageLayers = state.scene.layers.filter((layer) => isRenderable(layer) && layer.kind === 'image');
  state.scene.layers.forEach((layer, index) => {
    if (!isRenderable(layer)) return;
    let node = layerNodes.get(layer.id);
    if (!node || node.dataset.sourceSignature !== sourceSignature(layer, state.scene)) {
      const replacement = createLayerNode(layer, state);
      if (node) {
        const oldMedia = node.querySelector('[data-media="source"]');
        if (oldMedia instanceof HTMLMediaElement || oldMedia instanceof HTMLImageElement) mediaManager.release(node.dataset.sourceSignature, oldMedia);
        node.replaceWith(replacement);
      } else sceneElement.append(replacement);
      node = replacement;
      layerNodes.set(layer.id, node);
    }
    updateLayerNode(node, layer, index, imageLayers.indexOf(layer), state);
    sceneElement.append(node);
  });
  refreshChroma();
  statusElement.classList.add('ready');
}

const events = new EventSource(`/events?clientId=${encodeURIComponent(clientId)}`);
events.addEventListener('scene', (event) => {
  try {
    const payload = JSON.parse(event.data);
    const playbackRevision = payload.state?.presentation?.playbackRevision ?? 0;
    if (payload.revision <= lastServerRevision || playbackRevision < lastPlaybackRevision) return;
    lastServerRevision = payload.revision;
    lastPlaybackRevision = playbackRevision;
    render(payload.state);
  } catch (error) {
    report('error', error instanceof Error ? error.message : error);
  }
});
events.addEventListener('open', () => {
  statusElement.textContent = 'Đã kết nối';
  void fetch('/ready', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId }),
  }).catch(() => undefined);
});
events.addEventListener('error', () => {
  statusElement.classList.remove('ready');
  statusElement.textContent = currentState ? 'Đang kết nối lại...' : 'Mất kết nối scene';
});
globalThis.addEventListener('error', (event) => report('error', event.message));
globalThis.addEventListener('unhandledrejection', (event) => report('error', event.reason));
globalThis.addEventListener('resize', () => {
  if (currentState) render(currentState);
});
