<script setup lang="ts">
import { Image, Sticker, Type, UserRound, Video } from '@lucide/vue';
import type { StudioToolName } from './studio-types';

defineProps<{ activeTool: StudioToolName }>();

const emit = defineEmits<{
  select: [tool: StudioToolName];
}>();

const tools = [
  { label: 'Avatar' as const, icon: UserRound },
  { label: 'Hình nền' as const, icon: Image },
  { label: 'Video' as const, icon: Video },
  { label: 'Hình dán' as const, icon: Sticker },
  { label: 'Văn bản' as const, icon: Type },
];
</script>

<template>
  <aside class="studio-tools" aria-label="Công cụ editor">
    <button v-for="tool in tools" :key="tool.label" type="button" :class="[{ active: activeTool === tool.label }, tool.label === 'Văn bản' ? 'add-source text' : '']" @click="emit('select', tool.label)">
      <component :is="tool.icon" :size="19" />{{ tool.label }}
    </button>
  </aside>
</template>
