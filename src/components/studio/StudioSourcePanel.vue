<script setup lang="ts">
/* global HTMLElement */
import { Image, Plus, Type, UserRound, X } from '@lucide/vue';
import { nextTick, onMounted, ref } from 'vue';
import type { ProjectSceneLayer } from '../../shared/contracts/projects';

defineProps<{
  layers: ProjectSceneLayer[];
  activeLayerIndex: number | null;
  primaryAction: string;
  sourceDisplayName: (layer: ProjectSceneLayer) => string;
}>();

const emit = defineEmits<{
  add: [];
  remove: [index: number];
  select: [index: number];
}>();

const sourceListElement = ref<HTMLElement | null>(null);

onMounted(async () => {
  await nextTick();
  if (sourceListElement.value) sourceListElement.value.scrollTop = 62;
});
</script>

<template>
  <section class="source-panel">
    <header>
      <strong>Nguồn</strong>
      <button type="button" :aria-label="primaryAction" @click="emit('add')"><Plus :size="17" /></button>
    </header>
    <ul ref="sourceListElement">
      <li
        v-for="(layer, index) in layers"
        :key="layer.id"
        :data-layer-id="layer.id"
        :class="{ active: activeLayerIndex === index }"
        @click="emit('select', index)"
      >
        <UserRound v-if="layer.kind === 'avatar'" :size="14" />
        <Type v-else-if="layer.kind === 'text'" :size="14" />
        <Image v-else :size="14" />
        <span>{{ sourceDisplayName(layer) }}</span>
        <button type="button" :aria-label="`Xóa ${layer.name}`" @click.stop="emit('remove', index)"><X :size="13" /></button>
      </li>
    </ul>
  </section>
</template>
