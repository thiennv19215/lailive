<script setup lang="ts">
import type { ManualVideoPlaybackSnapshot } from '../../modules/playback/manual-video-playback';
import type { ProjectManualPlaylistItem, ProjectSceneLayer } from '../../shared/contracts/projects';

defineProps<{
  enabled: boolean;
  snapshot: ManualVideoPlaybackSnapshot;
  items: ProjectManualPlaylistItem[];
  layers: ProjectSceneLayer[];
  sourceDisplayName: (layer: ProjectSceneLayer) => string;
}>();

const emit = defineEmits<{
  assign: [layerId: string];
  move: [index: number, delta: number];
  pause: [];
  remove: [index: number];
  resume: [];
  retry: [];
  skip: [];
  start: [];
  stop: [];
  toggle: [];
  toggleItem: [index: number];
}>();
</script>

<template>
  <section class="source-panel playlist-panel">
    <header>
      <strong>Playlist phát</strong>
      <button type="button" class="switch" :class="{ on: enabled }" :aria-pressed="enabled" @click="emit('toggle')"><span /></button>
    </header>
    <div class="playlist-controls">
      <button type="button" :disabled="snapshot.mode !== 'stopped' && snapshot.mode !== 'error'" @click="emit('start')">Bắt đầu</button>
      <button type="button" :disabled="snapshot.mode === 'paused' || snapshot.mode === 'stopped'" @click="emit('pause')">Tạm dừng</button>
      <button type="button" :disabled="snapshot.mode !== 'paused'" @click="emit('resume')">Tiếp tục</button>
      <button type="button" :disabled="!snapshot.activeLayerId" @click="emit('skip')">Bỏ qua</button>
      <button type="button" :disabled="snapshot.mode === 'stopped'" @click="emit('stop')">Dừng</button>
    </div>
    <p class="playlist-state">{{ snapshot.mode }}<span v-if="snapshot.activeLayerId"> · R{{ (snapshot.activePlaylistIndex ?? 0) + 1 }}</span></p>
    <p v-if="snapshot.warnings.length" class="playlist-warning">{{ snapshot.warnings[0] }}</p>
    <p v-if="snapshot.errorMessage" class="playlist-error">{{ snapshot.errorMessage }} <button type="button" @click="emit('retry')">Thử lại</button></p>
    <ol>
      <li v-for="(item, index) in items" :key="item.layerId">
        <span>R{{ index + 1 }} · {{ sourceDisplayName(layers.find((layer) => layer.id === item.layerId) ?? layers[0]!) }}</span>
        <button type="button" @click="emit('toggleItem', index)">{{ item.enabled ? 'Tắt' : 'Bật' }}</button>
        <button type="button" :disabled="index === 0" @click="emit('move', index, -1)">↑</button>
        <button type="button" :disabled="index === items.length - 1" @click="emit('move', index, 1)">↓</button>
        <button type="button" @click="emit('remove', index)">X</button>
      </li>
    </ol>
    <div class="playlist-add-list">
      <button
        v-for="layer in layers.filter((candidate) => (candidate.kind === 'video' || candidate.kind === 'audio') && !items.some((item) => item.layerId === candidate.id))"
        :key="layer.id"
        type="button"
        @click="emit('assign', layer.id)"
      >
        + {{ sourceDisplayName(layer) }}
      </button>
    </div>
  </section>
</template>
