<script setup lang="ts">
/* global HTMLElement */
import { AudioLines, Clapperboard, Image, Plus, Type, UserRound, X } from '@lucide/vue';
import { computed, nextTick, onMounted, ref } from 'vue';
import type { PreparedScriptRole, ProjectPreparedScript, ProjectSceneLayer } from '../../shared/contracts/projects';

const props = defineProps<{
  layers: ProjectSceneLayer[];
  scripts: ProjectPreparedScript[];
  activeLayerIndex: number | null;
  primaryAction: string;
  sourceDisplayName: (layer: ProjectSceneLayer) => string;
}>();

const emit = defineEmits<{
  add: [];
  remove: [index: number];
  select: [index: number];
  assign: [layerId: string, role: PreparedScriptRole];
  addAudio: [layerId: string];
  editScripts: [];
}>();

const sourceListElement = ref<HTMLElement | null>(null);
const activeLayer = computed(() => props.activeLayerIndex === null ? null : props.layers[props.activeLayerIndex] ?? null);
const activeCanScript = computed(() => Boolean(activeLayer.value && ['avatar', 'video', 'audio'].includes(activeLayer.value.kind)));
const activeScript = computed(() => activeLayer.value
  ? props.scripts.find((script) => script.mediaLayerId === activeLayer.value?.id || script.audioLayerId === activeLayer.value?.id || script.avatarLayerId === activeLayer.value?.id)
  : undefined);

function roleLabel(role: PreparedScriptRole): string {
  return role === 'idle' ? 'Hàng tự chạy' : role === 'activation' ? 'Ưu tiên kích hoạt' : 'Đang nói';
}

onMounted(async () => {
  await nextTick();
  if (sourceListElement.value) sourceListElement.value.scrollTop = 62;
});
</script>

<template>
  <section class="source-panel source-workspace">
    <header>
      <strong>Nguồn</strong>
      <button type="button" :aria-label="primaryAction" @click="emit('add')"><Plus :size="17" /></button>
    </header>
    <ul ref="sourceListElement">
      <li v-for="(layer, index) in layers" :key="layer.id" :data-layer-id="layer.id" :class="{ active: activeLayerIndex === index }" @click="emit('select', index)">
        <UserRound v-if="layer.kind === 'avatar'" :size="14" />
        <Type v-else-if="layer.kind === 'text'" :size="14" />
        <AudioLines v-else-if="layer.kind === 'audio'" :size="14" />
        <Clapperboard v-else-if="layer.kind === 'video'" :size="14" />
        <Image v-else :size="14" />
        <span>{{ sourceDisplayName(layer) }}</span>
        <button type="button" :aria-label="`Xóa ${layer.name}`" @click.stop="emit('remove', index)"><X :size="13" /></button>
      </li>
    </ul>
    <section class="source-script-workbench" :class="{ disabled: !activeCanScript }">
      <header><strong>Đưa vào Timeline</strong><button type="button" @click="emit('editScripts')">Chi tiết</button></header>
      <template v-if="activeCanScript && activeLayer">
        <p><b>{{ sourceDisplayName(activeLayer) }}</b><span v-if="activeScript"> · {{ roleLabel(activeScript.role) }}</span></p>
        <div class="source-script-actions">
          <button type="button" :class="{ active: activeScript?.role === 'idle' }" @click="emit('assign', activeLayer.id, 'idle')">+ Hàng tự chạy</button>
          <button type="button" :class="{ active: activeScript?.role === 'activation' }" @click="emit('assign', activeLayer.id, 'activation')">Kích hoạt ưu tiên</button>
          <button type="button" :class="{ active: activeScript?.role === 'conversation' }" @click="emit('assign', activeLayer.id, 'conversation')">Khi nói</button>
        </div>
        <button v-if="activeLayer.kind === 'video' || activeLayer.kind === 'avatar'" type="button" class="source-audio-action" @click="emit('addAudio', activeLayer.id)">+ Gắn audio cho nguồn này</button>
      </template>
      <p v-else>Chọn một Avatar, Video hoặc Audio trong danh sách để đưa vào Timeline.</p>
    </section>
  </section>
</template>
