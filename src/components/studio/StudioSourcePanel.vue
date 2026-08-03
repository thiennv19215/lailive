<script setup lang="ts">
/* global HTMLElement, MouseEvent, Node, document */
import { AudioLines, Clapperboard, Image, Plus, Sticker, Type, UserRound, X } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { PreparedScriptRole, ProjectMediaKind, ProjectPreparedScript, ProjectSceneLayer } from '../../shared/contracts/projects';

const props = defineProps<{
  layers: ProjectSceneLayer[];
  scripts: ProjectPreparedScript[];
  activeLayerIndex: number | null;
  primaryAction: string;
  sourceDisplayName: (layer: ProjectSceneLayer) => string;
}>();

const emit = defineEmits<{
  importMedia: [kind: ProjectMediaKind];
  importAvatar: [];
  addBuiltin: [label: string];
  remove: [index: number];
  select: [index: number];
  assign: [layerId: string, role: PreparedScriptRole];
  addAudio: [layerId: string];
  convertVideoToGif: [layerId: string];
  editScripts: [];
}>();

const sourceListElement = ref<HTMLElement | null>(null);
const sourceMenuElement = ref<HTMLElement | null>(null);
const importMenuOpen = ref(false);
const visualLayers = computed(() => props.layers
  .map((layer, index) => ({ layer, index }))
  // Audio belongs to a video/script, not the composited visual layout.
  .filter(({ layer }) => layer.kind !== 'audio'));
const activeLayer = computed(() => props.activeLayerIndex === null ? null : props.layers[props.activeLayerIndex] ?? null);
const activeCanScript = computed(() => Boolean(activeLayer.value && ['avatar', 'video'].includes(activeLayer.value.kind)));
const activeScript = computed(() => activeLayer.value
  ? props.scripts.find((script) => script.mediaLayerId === activeLayer.value?.id || script.audioLayerId === activeLayer.value?.id || script.avatarLayerId === activeLayer.value?.id)
  : undefined);

function roleLabel(role: PreparedScriptRole): string {
  return role === 'idle' ? 'Vòng lặp nền' : role === 'activation' ? 'Chờ phát ưu tiên' : 'Phản hồi tức thời';
}

onMounted(async () => {
  await nextTick();
  if (sourceListElement.value) sourceListElement.value.scrollTop = 62;
});

function closeImportMenu(event: MouseEvent): void {
  if (!sourceMenuElement.value?.contains(event.target as Node)) importMenuOpen.value = false;
}
onMounted(() => document.addEventListener('pointerdown', closeImportMenu));
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeImportMenu));
</script>

<template>
  <section class="source-panel source-workspace">
    <header>
      <strong>Nguồn</strong>
      <div ref="sourceMenuElement" class="source-import-menu"><button type="button" :aria-label="primaryAction" :aria-expanded="importMenuOpen" @click="importMenuOpen = !importMenuOpen"><Plus :size="17" /></button><div v-if="importMenuOpen" class="source-import-options"><strong>Thêm từ máy</strong><button type="button" @click="emit('importMedia', 'video'); importMenuOpen = false"><Clapperboard :size="14" />Video</button><button type="button" @click="emit('importMedia', 'image'); importMenuOpen = false"><Image :size="14" />Ảnh</button><button type="button" @click="emit('importMedia', 'audio'); importMenuOpen = false"><AudioLines :size="14" />Audio</button><button type="button" @click="emit('importAvatar'); importMenuOpen = false"><UserRound :size="14" />Avatar</button></div></div>
      <div class="source-quick-add">
        <button type="button" aria-label="Thêm văn bản" @click="emit('addBuiltin', 'Văn bản')"><Type :size="15" /></button>
        <button type="button" aria-label="Thêm hình dán" @click="emit('addBuiltin', 'HOT DEAL')"><Sticker :size="15" /></button>
      </div>
    </header>
    <ul ref="sourceListElement">
      <li v-for="entry in visualLayers" :key="entry.layer.id" :data-layer-id="entry.layer.id" :class="{ active: activeLayerIndex === entry.index }" @click="emit('select', entry.index)">
        <template v-for="layer in [entry.layer]" :key="layer.id">
        <UserRound v-if="layer.kind === 'avatar'" :size="14" />
        <Type v-else-if="layer.kind === 'text'" :size="14" />
        <Clapperboard v-else-if="layer.kind === 'video'" :size="14" />
        <Image v-else :size="14" />
        <span>{{ sourceDisplayName(layer) }}</span>
        <button type="button" :aria-label="`Xóa ${layer.name}`" @click.stop="emit('remove', entry.index)"><X :size="13" /></button>
        </template>
      </li>
    </ul>
    <section class="source-script-workbench" :class="{ disabled: !activeCanScript }">
      <header><strong>Đưa vào Timeline</strong><button type="button" @click="emit('editScripts')">Chi tiết</button></header>
      <template v-if="activeCanScript && activeLayer">
        <p><b>{{ sourceDisplayName(activeLayer) }}</b><span v-if="activeScript"> · {{ roleLabel(activeScript.role) }}</span></p>
        <div class="source-script-actions">
          <button type="button" :class="{ active: activeScript?.role === 'idle' }" @click="emit('assign', activeLayer.id, 'idle')">+ Hàng tự chạy</button>
          <button type="button" :class="{ active: activeScript?.role === 'activation' }" @click="emit('assign', activeLayer.id, 'activation')">+ Chờ phát ưu tiên</button>
          <button type="button" :class="{ active: activeScript?.role === 'conversation' }" @click="emit('assign', activeLayer.id, 'conversation')">+ Phản hồi tức thời</button>
        </div>
        <button v-if="activeLayer.kind === 'video' || activeLayer.kind === 'avatar'" type="button" class="source-audio-action" @click="emit('addAudio', activeLayer.id)">+ Gắn audio cho nguồn này</button>
        <button v-if="activeLayer.kind === 'video'" type="button" class="source-audio-action" @click="emit('convertVideoToGif', activeLayer.id)">Convert to GIF</button>
      </template>
      <p v-else>Chọn Avatar hoặc Video để đưa vào Timeline. Audio chỉ được gắn trong kịch bản video.</p>
    </section>
  </section>
</template>
