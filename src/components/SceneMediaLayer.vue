<script setup lang="ts">
/* global HTMLAudioElement, HTMLCanvasElement, HTMLElement, HTMLImageElement, HTMLVideoElement, ResizeObserver */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ProjectSceneLayer } from '../shared/contracts/projects';
import { applyChromaKeyToPixels, calculateObjectFitRect } from '../shared/studio/chroma-key';

const props = defineProps<{
  layer: ProjectSceneLayer;
  mediaKind: 'image' | 'video' | 'audio';
  sourceUrl: string;
  renderStyle: Record<string, string | number>;
  selected: boolean;
  playbackManaged?: boolean;
  playbackActive?: boolean;
  playbackPaused?: boolean;
  playbackRevision?: number;
  speechManaged?: boolean;
  speechActive?: boolean;
}>();
const emit = defineEmits<{
  ended: [layerId: string, playbackRevision: number];
  ready: [layerId: string, playbackRevision: number];
  error: [layerId: string, playbackRevision: number, message: string];
}>();

const rootElement = ref<HTMLElement | null>(null);
const imageElement = ref<HTMLImageElement | null>(null);
const videoElement = ref<HTMLVideoElement | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);
const canvasElement = ref<HTMLCanvasElement | null>(null);
const chromaEnabled = computed(() => props.mediaKind !== 'audio' && props.layer.chromaKey.enabled);
let resizeObserver: ResizeObserver | null = null;
let animationFrame: number | null = null;
let lastVideoFrameAt = 0;
let appliedPlaybackRevision = -1;
let previousSpeechActive = false;

function syncMediaPlayback(): void {
  const media = videoElement.value ?? audioElement.value;
  if (!media) return;
  media.volume = props.layer.volume;
  media.muted = props.layer.muted;
  if (props.speechManaged) {
    media.loop = true;
    if (!props.speechActive) {
      media.pause();
      previousSpeechActive = false;
      return;
    }
    if (!previousSpeechActive && media.readyState > 0) media.currentTime = 0;
    previousSpeechActive = true;
    void media.play().catch(() => undefined);
    return;
  }
  if (!props.playbackManaged) {
    media.loop = props.layer.loop;
    void media.play().catch(() => undefined);
    return;
  }
  media.loop = false;
  if (!props.playbackActive || props.playbackPaused) {
    media.pause();
    return;
  }
  const revision = props.playbackRevision ?? 0;
  if (appliedPlaybackRevision !== revision) {
    appliedPlaybackRevision = revision;
    if (media.readyState > 0) media.currentTime = 0;
  }
  void media.play().catch(() => undefined);
}

function handleMediaReady(): void {
  refreshChromaRenderer();
  syncMediaPlayback();
  if (props.playbackManaged && props.playbackActive) emit('ready', props.layer.id, props.playbackRevision ?? 0);
}

function handleMediaError(): void {
  if (props.playbackManaged && props.playbackActive) emit('error', props.layer.id, props.playbackRevision ?? 0, `Không đọc được media “${props.layer.name}”.`);
}

function handleVideoEnded(): void {
  if (props.playbackManaged && props.playbackActive) emit('ended', props.layer.id, props.playbackRevision ?? 0);
}

function cancelRenderLoop(): void {
  if (animationFrame !== null) globalThis.cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function renderChromaFrame(): void {
  const root = rootElement.value;
  const canvas = canvasElement.value;
  const media = props.mediaKind === 'video' ? videoElement.value : imageElement.value;
  if (!root || !canvas || !media || !chromaEnabled.value) return;
  const width = Math.max(1, Math.round(root.clientWidth));
  const height = Math.max(1, Math.round(root.clientHeight));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) return;
  const rect = calculateObjectFitRect(sourceWidth, sourceHeight, width, height, props.layer.fitMode);
  context.clearRect(0, 0, width, height);
  context.drawImage(media, rect.x, rect.y, rect.width, rect.height);
  const frame = context.getImageData(0, 0, width, height);
  const removedPixels = applyChromaKeyToPixels(frame.data, props.layer.chromaKey.color, props.layer.chromaKey.tolerance);
  context.putImageData(frame, 0, 0);
  canvas.dataset.chromaRemoved = String(removedPixels);
  canvas.dataset.chromaPixels = String(width * height);
}

function runVideoLoop(timestamp = 0): void {
  if (!chromaEnabled.value || props.mediaKind !== 'video') {
    animationFrame = null;
    return;
  }
  if (timestamp - lastVideoFrameAt >= 33) {
    renderChromaFrame();
    lastVideoFrameAt = timestamp;
  }
  animationFrame = globalThis.requestAnimationFrame(runVideoLoop);
}

function refreshChromaRenderer(): void {
  cancelRenderLoop();
  void nextTick(() => {
    if (!chromaEnabled.value) return;
    renderChromaFrame();
    if (props.mediaKind === 'video') animationFrame = globalThis.requestAnimationFrame(runVideoLoop);
  });
}

watch(() => [
  props.layer.chromaKey.enabled,
  props.layer.chromaKey.color,
  props.layer.chromaKey.tolerance,
  props.layer.fitMode,
], refreshChromaRenderer);
watch(() => [props.playbackManaged, props.playbackActive, props.playbackPaused, props.playbackRevision, props.speechManaged, props.speechActive, props.layer.loop, props.layer.muted, props.layer.volume], syncMediaPlayback);

onMounted(() => {
  resizeObserver = new ResizeObserver(refreshChromaRenderer);
  if (rootElement.value) resizeObserver.observe(rootElement.value);
  refreshChromaRenderer();
  syncMediaPlayback();
});

onBeforeUnmount(() => {
  cancelRenderLoop();
  resizeObserver?.disconnect();
});
</script>

<template>
  <div ref="rootElement" class="scene-runtime-layer scene-runtime-media" :class="{ 'is-selected': selected, 'is-audio-source': mediaKind === 'audio' }" :data-runtime-layer-id="layer.id" :data-media-kind="mediaKind" :data-avatar-state="layer.kind === 'avatar' ? layer.avatarState : undefined" :style="renderStyle">
    <video v-if="mediaKind === 'video'" ref="videoElement" class="scene-runtime-media-source" :class="{ 'is-chroma-source': chromaEnabled }" :src="sourceUrl" :style="{ objectFit: layer.fitMode }" :loop="playbackManaged ? false : layer.loop" :muted="layer.muted" :autoplay="(!playbackManaged || playbackActive) && (!speechManaged || speechActive)" playsinline preload="auto" @loadeddata="handleMediaReady" @error="handleMediaError" @ended="handleVideoEnded" />
    <audio v-else-if="mediaKind === 'audio'" ref="audioElement" :src="sourceUrl" :loop="playbackManaged ? false : layer.loop" :muted="layer.muted" :autoplay="(!playbackManaged || playbackActive) && (!speechManaged || speechActive)" preload="auto" @loadeddata="handleMediaReady" @error="handleMediaError" @ended="handleVideoEnded" />
    <img v-else ref="imageElement" class="scene-runtime-media-source" :class="{ 'is-chroma-source': chromaEnabled }" :src="sourceUrl" :alt="layer.name" :style="{ objectFit: layer.fitMode }" @load="refreshChromaRenderer" />
    <canvas v-if="mediaKind !== 'audio'" ref="canvasElement" class="scene-chroma-canvas" :class="{ active: chromaEnabled }" aria-hidden="true" />
  </div>
</template>
