<script setup lang="ts">
import { Mic2, MonitorUp, Radio, Settings2, Volume2 } from '@lucide/vue';

const emit = defineEmits<{
  export: [];
  settings: [];
  start: [];
}>();
</script>

<template>
  <section class="studio-mixer-footer">
    <section class="mixer-panel">
      <header><Mic2 :size="15" /><span>Nguồn âm thanh</span></header>
      <div>Không có nguồn âm thanh</div>
    </section>
    <section class="mixer-panel output">
      <header><Volume2 :size="15" /><span>Phát trực tiếp</span></header>
      <div><span>Âm lượng đầu ra</span><b>100%</b></div>
    </section>
    <div class="studio-actions">
      <button type="button" class="studio-action muted" @click="emit('export')"><MonitorUp :size="15" />Xuất video</button>
      <button type="button" class="studio-action live" @click="emit('start')"><Radio :size="15" />Bắt đầu livestream</button>
      <button type="button" class="studio-action live" @click="emit('settings')"><Settings2 :size="15" />Cài đặt livestream</button>
    </div>
  </section>
</template>
