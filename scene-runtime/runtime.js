/* global EventSource, HTMLCanvasElement, HTMLMediaElement, HTMLVideoElement, cancelAnimationFrame, crypto, document, fetch, requestAnimationFrame */
const sceneElement = document.querySelector('#scene');
const statusElement = document.querySelector('#status');
const clientId = `scene-${crypto.randomUUID()}`;
const layerNodes = new Map();
let currentState = null;
let lastServerRevision = 0;
let lastPlaybackRevision = -1;
let chromaFrame = null;
let lastChromaFrameAt = 0;

function report(level, message) {
  void fetch('/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, level, message: String(message).slice(0, 2000) }),
  }).catch(() => undefined);
}

function mediaKind(layer, scene = currentState?.scene) {
  if (layer.source.type === 'media' && layer.source.mediaReferenceId) {
    return scene?.mediaReferences.find((reference) => reference.id === layer.source.mediaReferenceId)?.kind ?? 'image';
  }
  if (layer.source.assetId === 'flower-video') return 'video';
  return layer.kind === 'audio' ? 'audio' : layer.kind === 'video' ? 'video' : 'image';
}

function sourceSignature(layer, scene) {
  return `${layer.kind}:${mediaKind(layer, scene)}:${layer.source.type}:${layer.source.assetId ?? ''}:${layer.source.mediaReferenceId ?? ''}`;
}

function isRenderable(layer) {
  if (layer.kind === 'text') return layer.source.type === 'text';
  return layer.source.type === 'builtin' ? Boolean(layer.source.assetId) : layer.source.type === 'media' && Boolean(layer.source.mediaReferenceId);
}

function createLayerNode(layer, state) {
  const root = document.createElement(layer.kind === 'text' ? 'div' : 'section');
  root.className = layer.kind === 'text' ? 'runtime-layer runtime-text' : 'runtime-layer runtime-media';
  root.dataset.layerId = layer.id;
  root.dataset.sourceSignature = sourceSignature(layer, state.scene);
  const sourceId = layer.source.type === 'builtin' ? layer.source.assetId : layer.source.mediaReferenceId;
  if (layer.kind !== 'text' && sourceId) {
    const renderedKind = mediaKind(layer, state.scene);
    const media = document.createElement(renderedKind === 'video' ? 'video' : renderedKind === 'audio' ? 'audio' : 'img');
    media.src = `/assets/${encodeURIComponent(sourceId)}`;
    media.dataset.media = 'source';
    if (media instanceof HTMLMediaElement) {
      media.autoplay = true;
      media.preload = 'auto';
      if (media instanceof HTMLVideoElement) media.playsInline = true;
    }
    media.addEventListener(media instanceof HTMLMediaElement ? 'loadeddata' : 'load', () => renderLayerChroma(layer.id));
    root.append(media);
    if (renderedKind !== 'audio') {
      const canvas = document.createElement('canvas');
      canvas.dataset.media = 'chroma';
      root.append(canvas);
    }
  }
  return root;
}

function updateLayerNode(root, layer, index, state) {
  const isText = layer.kind === 'text';
  const box = layer.kind === 'audio'
    ? { left: 0, top: 0, width: 0.1, height: 0.1 }
    : isText ? { left: 8, top: 10, width: 84, height: 12 } : { left: 0, top: 0, width: 100, height: 100 };
  const speechVisible = layer.kind !== 'avatar' || layer.avatarState === 'none' || layer.avatarState === state.avatarState;
  const presentation = state.presentation ?? { mode: 'scene', activeLayerId: null, managedLayerIds: [], playbackRevision: 0, activePaused: true, activeMuted: true, activeVolume: 0, activeLoop: false };
  const managed = presentation.managedLayerIds.includes(layer.id);
  const presentationVisible = !managed || presentation.activeLayerId === layer.id;
  const renderedKind = mediaKind(layer, state.scene);
  root.dataset.mediaKind = renderedKind;
  root.dataset.avatarState = layer.kind === 'avatar' ? layer.avatarState : '';
  root.classList.toggle('is-chroma', !isText && layer.chromaKey.enabled);
  Object.assign(root.style, {
    left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`,
    zIndex: String(1000 - index),
    opacity: layer.visible && speechVisible && presentationVisible ? String(layer.opacity) : '0',
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
    const media = root.querySelector('[data-media="source"]');
    if (media) {
      media.style.objectFit = layer.fitMode;
      media.style.borderRadius = layer.kind === 'image' ? `${state.scene.imageSettings.radius}px` : '0';
      if (media instanceof HTMLMediaElement) {
        const active = managed && presentation.activeLayerId === layer.id;
        media.loop = managed ? (active ? presentation.activeLoop : false) : layer.loop;
        media.muted = active ? presentation.activeMuted : layer.muted;
        media.volume = active ? presentation.activeVolume : layer.volume;
        const revision = String(presentation.playbackRevision);
        const speechManaged = layer.kind === 'avatar' && layer.avatarState !== 'none';
        if (speechManaged && !speechVisible) {
          media.dataset.speechActive = 'false';
          media.pause();
        } else if (speechManaged) {
          if (media.dataset.speechActive !== 'true') media.currentTime = 0;
          media.dataset.speechActive = 'true';
          media.loop = true;
          void media.play().catch(() => undefined);
        } else if (managed && (!presentationVisible || presentation.mode === 'paused' || presentation.activePaused || !active)) {
          media.pause();
        } else {
          if (managed && media.dataset.playbackRevision !== revision) {
            media.dataset.playbackRevision = revision;
            media.currentTime = 0;
          }
          void media.play().catch((error) => report('warn', error instanceof Error ? error.message : error));
        }
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
  const ratio = state.scene.width / state.scene.height;
  Object.assign(sceneElement.style, {
    aspectRatio: `${state.scene.width} / ${state.scene.height}`,
    width: `min(100vw, ${ratio * 100}vh)`,
    height: `min(100vh, ${100 / ratio}vw)`,
  });
  const activeIds = new Set(state.scene.layers.filter(isRenderable).map((layer) => layer.id));
  for (const [id, node] of layerNodes) {
    if (!activeIds.has(id)) {
      node.remove();
      layerNodes.delete(id);
    }
  }
  state.scene.layers.forEach((layer, index) => {
    if (!isRenderable(layer)) return;
    let node = layerNodes.get(layer.id);
    if (!node || node.dataset.sourceSignature !== sourceSignature(layer, state.scene)) {
      const replacement = createLayerNode(layer, state);
      if (node) node.replaceWith(replacement); else sceneElement.append(replacement);
      node = replacement;
      layerNodes.set(layer.id, node);
    }
    updateLayerNode(node, layer, index, state);
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
