<script setup lang="ts">
/* global Event, HTMLInputElement, HTMLSelectElement */
import type { PreparedScriptPlaybackSnapshot } from '../../modules/playback/prepared-script-playback';
import type { ProjectPreparedScript, ProjectSceneLayer } from '../../shared/contracts/projects';

const props = defineProps<{ enabled: boolean; snapshot: PreparedScriptPlaybackSnapshot; scripts: ProjectPreparedScript[]; layers: ProjectSceneLayer[]; sourceDisplayName: (layer: ProjectSceneLayer) => string; }>();
const emit = defineEmits<{ play: [scriptId: string]; start: []; pause: []; resume: []; skip: []; stop: []; toggle: []; move: [index: number, delta: number]; remove: [index: number]; changed: []; add: [type: 'video' | 'audio' | 'tts', layerId: string | null, role?: 'idle' | 'activation']; }>();

const audioLayers = () => props.layers.filter((layer) => layer.kind === 'audio');
type PlayableLayer = ProjectSceneLayer & { kind: 'video' };
function isPlayableLayer(layer: ProjectSceneLayer): layer is PlayableLayer {
  return layer.kind === 'video';
}
const playableLayers = (): PlayableLayer[] => props.layers.filter(isPlayableLayer);
const layerFor = (id: string | null): ProjectSceneLayer | undefined => id ? props.layers.find((layer) => layer.id === id) : undefined;

function toggleLayerMute(layer: ProjectSceneLayer): void {
  layer.muted = !layer.muted;
  emit('changed');
}

function updateLayerVolume(layer: ProjectSceneLayer, event: Event): void {
  layer.volume = Number((event.target as HTMLInputElement).value);
  emit('changed');
}

function chooseMedia(script: ProjectPreparedScript, event: Event): void {
  const previousMediaLayerId = script.mediaLayerId;
  const previousPlaybackType = script.playbackType;
  const selectedId = (event.target as HTMLSelectElement).value || null;
  if (!selectedId) {
    script.mediaLayerId = null;
    script.audioLayerId = null;
    emit('changed');
    return;
  }
  const layer = playableLayers().find((candidate) => candidate.id === selectedId);
  if (!layer) return;
  script.mediaLayerId = layer.id;
  script.playbackType = layer.kind;
  if (previousPlaybackType === 'audio' && previousMediaLayerId) {
    // Choosing a video after an audio-only script means the operator wants
    // that audio to become the video's synchronized companion track.
    script.audioLayerId = previousMediaLayerId;
  }
  script.speechText = '';
  emit('changed');
}
</script>

<template>
  <section class="source-panel playlist-panel">
    <header>
      <span><strong>Danh sách kịch bản</strong><small>Video và audio kèm</small></span>
      <button type="button" class="switch" :class="{ on: enabled }" :aria-pressed="enabled" @click="emit('toggle')"><span /></button>
    </header>

    <div class="playlist-toolbar">
      <span>{{ snapshot.mode === 'playing' ? 'Đang phát' : snapshot.mode === 'paused' ? 'Đã tạm dừng' : 'Sẵn sàng' }}</span>
      <div>
        <button type="button" :disabled="!enabled || snapshot.mode !== 'stopped'" @click="emit('start')">Chạy</button>
        <button type="button" :disabled="snapshot.mode !== 'playing'" @click="emit('pause')">Tạm dừng</button>
        <button type="button" :disabled="snapshot.mode !== 'paused'" @click="emit('resume')">Tiếp tục</button>
        <button type="button" :disabled="!snapshot.activeScriptId" @click="emit('skip')">Bỏ qua</button>
        <button type="button" :disabled="snapshot.mode === 'stopped'" @click="emit('stop')">Dừng</button>
      </div>
    </div>

    <p v-if="snapshot.errorMessage" class="playlist-error">{{ snapshot.errorMessage }}</p>
    <ol class="prepared-script-list">
      <li v-for="(script, index) in scripts" :key="script.id" :class="{ active: snapshot.activeScriptId === script.id }">
        <div class="prepared-script-row">
          <b>R{{ index + 1 }}</b>
          <input v-model="script.name" maxlength="120" aria-label="Tên kịch bản" @change="emit('changed')" />
          <button type="button" class="prepared-script-play" :disabled="!enabled || !script.enabled" @click="emit('play', script.id)">Phát</button>
          <div class="prepared-script-actions">
            <button type="button" :aria-label="script.enabled ? 'Tắt kịch bản' : 'Bật kịch bản'" @click="script.enabled = !script.enabled; emit('changed')">{{ script.enabled ? 'Bật' : 'Tắt' }}</button>
            <button type="button" aria-label="Đưa lên" :disabled="index === 0" @click="emit('move', index, -1)">↑</button>
            <button type="button" aria-label="Đưa xuống" :disabled="index === scripts.length - 1" @click="emit('move', index, 1)">↓</button>
            <button type="button" class="prepared-script-delete" @click="emit('remove', index)">Xóa</button>
          </div>
        </div>
        <div class="prepared-script-fields">
          <label>Luồng phát<select v-model="script.role" @change="emit('changed')"><option value="idle">Vòng lặp nền</option><option value="activation">Chờ phát ưu tiên</option><option value="conversation">Phản hồi tức thời</option></select></label>
          <label>Nguồn phát<select :value="script.mediaLayerId ?? ''" @change="chooseMedia(script, $event)"><option value="">Chọn video</option><option v-for="layer in playableLayers()" :key="layer.id" :value="layer.id">Video - {{ sourceDisplayName(layer) }}</option></select></label>
          <label>Audio kèm<select v-model="script.audioLayerId" :disabled="script.playbackType !== 'video'" @change="emit('changed')"><option :value="null">Không có audio kèm</option><option v-for="layer in audioLayers()" :key="layer.id" :value="layer.id">{{ sourceDisplayName(layer) }}</option></select></label>
        </div>
        <div v-if="layerFor(script.mediaLayerId) || layerFor(script.audioLayerId)" class="prepared-script-audio-mixer">
          <div v-if="layerFor(script.mediaLayerId)" class="prepared-script-audio-channel">
            <span>{{ script.playbackType === 'video' ? 'Am thanh video' : 'Am thanh script' }}</span>
            <button type="button" :aria-label="layerFor(script.mediaLayerId)!.muted ? 'Bat am thanh script' : 'Tat am thanh script'" :aria-pressed="layerFor(script.mediaLayerId)!.muted" @click="toggleLayerMute(layerFor(script.mediaLayerId)!)">{{ layerFor(script.mediaLayerId)!.muted ? 'Bat tieng' : 'Tat tieng' }}</button>
            <input type="range" min="0" max="1" step="0.05" :value="layerFor(script.mediaLayerId)!.volume" aria-label="Am luong script" @input="updateLayerVolume(layerFor(script.mediaLayerId)!, $event)" />
          </div>
          <div v-if="layerFor(script.audioLayerId)" class="prepared-script-audio-channel">
            <span>Audio kem (phat cung video)</span>
            <button type="button" :aria-label="layerFor(script.audioLayerId)!.muted ? 'Bat audio kem' : 'Tat audio kem'" :aria-pressed="layerFor(script.audioLayerId)!.muted" @click="toggleLayerMute(layerFor(script.audioLayerId)!)">{{ layerFor(script.audioLayerId)!.muted ? 'Bat tieng' : 'Tat tieng' }}</button>
            <input type="range" min="0" max="1" step="0.05" :value="layerFor(script.audioLayerId)!.volume" aria-label="Am luong audio kem" @input="updateLayerVolume(layerFor(script.audioLayerId)!, $event)" />
          </div>
        </div>
      </li>
    </ol>
    <div class="playlist-add-list">
      <header><span><strong>Thêm cảnh vào luồng</strong><small>Cảnh ưu tiên phát ngay, rồi quay lại vòng lặp nền.</small></span><button type="button" class="playlist-add-voice" @click="emit('add', 'tts', null, 'activation')">+ Thoại ưu tiên</button></header>
      <div v-for="layer in playableLayers()" :key="layer.id" class="playlist-add-source"><strong>{{ sourceDisplayName(layer) }}</strong><span>Video</span><div><button type="button" @click="emit('add', layer.kind, layer.id, 'idle')">+ Vòng lặp</button><button type="button" class="priority" @click="emit('add', layer.kind, layer.id, 'activation')">+ Ưu tiên</button></div></div>
      <small v-if="!playableLayers().length">Thêm video từ Nguồn để tạo cảnh; audio được gắn trong từng video.</small>
    </div>
  </section>
</template>
