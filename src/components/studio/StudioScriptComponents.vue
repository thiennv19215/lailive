<script setup lang="ts">
/* global Event, HTMLSelectElement */
import { AudioLines, Clapperboard, UserRound } from '@lucide/vue';
import type { PreparedScriptRole, ProjectPreparedScript, ProjectSceneLayer } from '../../shared/contracts/projects';

const props = defineProps<{
  layers: ProjectSceneLayer[];
  scripts: ProjectPreparedScript[];
  activeLayerId: string | null;
}>();

const emit = defineEmits<{
  select: [layerId: string];
  assign: [layerId: string, role: PreparedScriptRole];
  addAudio: [layerId: string];
  edit: [];
}>();

const roleOptions: Array<{ value: PreparedScriptRole; label: string }> = [
  { value: 'idle', label: 'Cho' },
  { value: 'activation', label: 'Kich hoat' },
  { value: 'conversation', label: 'Dang noi' },
];

function components(): ProjectSceneLayer[] {
  return props.layers.filter((layer) => ['avatar', 'video', 'audio'].includes(layer.kind));
}

function scriptFor(layerId: string): ProjectPreparedScript | undefined {
  return props.scripts.find((script) => script.mediaLayerId === layerId || script.audioLayerId === layerId || script.avatarLayerId === layerId);
}

function roleFor(layerId: string): PreparedScriptRole {
  return scriptFor(layerId)?.role ?? 'activation';
}

function changeRole(layerId: string, event: Event): void {
  const role = (event.target as HTMLSelectElement).value as PreparedScriptRole;
  emit('assign', layerId, role);
}
</script>

<template>
  <section class="script-components" aria-label="Thanh phan kich ban">
    <header><strong>Thanh phan kich ban</strong><button type="button" @click="emit('edit')">Mo bang</button></header>
    <p>Chon thanh phan, gan che do va phat o Timeline.</p>
    <ul v-if="components().length">
      <li v-for="layer in components()" :key="layer.id" :class="{ active: activeLayerId === layer.id }" @click="emit('select', layer.id)">
        <span class="script-component-icon"><UserRound v-if="layer.kind === 'avatar'" :size="14" /><AudioLines v-else-if="layer.kind === 'audio'" :size="14" /><Clapperboard v-else :size="14" /></span>
        <span class="script-component-name"><b>{{ layer.kind === 'avatar' ? 'Avatar' : layer.kind === 'audio' ? 'Audio' : 'Video' }}</b><small>{{ layer.name }}</small></span>
        <select :value="roleFor(layer.id)" :aria-label="`Che do cho ${layer.name}`" @click.stop @change="changeRole(layer.id, $event)">
          <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <button v-if="layer.kind === 'video' || layer.kind === 'avatar'" type="button" class="script-component-audio" @click.stop="emit('addAudio', layer.id)">+ Audio</button>
      </li>
    </ul>
    <div v-else class="script-components-empty">Them Avatar, Video hoac Audio de tao kich ban.</div>
  </section>
</template>
