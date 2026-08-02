<script setup lang="ts">
import type { PreparedScriptPlaybackSnapshot } from '../../modules/playback/prepared-script-playback';
import type { ProjectPreparedScript, ProjectSceneLayer } from '../../shared/contracts/projects';

const props = defineProps<{ enabled: boolean; snapshot: PreparedScriptPlaybackSnapshot; scripts: ProjectPreparedScript[]; layers: ProjectSceneLayer[]; sourceDisplayName: (layer: ProjectSceneLayer) => string; }>();
const emit = defineEmits<{ play: [scriptId: string]; start: []; pause: []; resume: []; skip: []; stop: []; toggle: []; move: [index: number, delta: number]; remove: [index: number]; changed: []; add: [type: 'video', layerId: string]; }>();

const videoLayers = () => props.layers.filter((layer) => layer.kind === 'video');
const audioLayers = () => props.layers.filter((layer) => layer.kind === 'audio');

function chooseVideo(script: ProjectPreparedScript): void {
  script.playbackType = 'video';
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
          <label>Video<select v-model="script.mediaLayerId" @change="chooseVideo(script)"><option :value="null">Chọn video</option><option v-for="layer in videoLayers()" :key="layer.id" :value="layer.id">{{ sourceDisplayName(layer) }}</option></select></label>
          <label>Audio kèm<select v-model="script.audioLayerId" @change="emit('changed')"><option :value="null">Không có audio kèm</option><option v-for="layer in audioLayers()" :key="layer.id" :value="layer.id">{{ sourceDisplayName(layer) }}</option></select></label>
        </div>
      </li>
    </ol>
    <div class="playlist-add-list"><button v-for="layer in videoLayers()" :key="layer.id" type="button" @click="emit('add', 'video', layer.id)">+ {{ sourceDisplayName(layer) }}</button><small v-if="!videoLayers().length">Thêm video từ Nguồn + để tạo kịch bản.</small></div>
  </section>
</template>
