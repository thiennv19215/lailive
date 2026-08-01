<script setup lang="ts">
import { Mic2, MonitorUp, Radio, Settings2, Volume2 } from '@lucide/vue';
import type { ObsStatus } from '../../shared/contracts/obs';

const props = defineProps<{
  obsStatus: ObsStatus;
  obsBusy: boolean;
}>();

const emit = defineEmits<{
  export: [];
  settings: [];
  start: [];
  connectObs: [];
  toggleCamera: [];
}>();

function outputState(): string {
  if (props.obsStatus.virtualCameraActive) return 'CAM ON';
  if (props.obsStatus.browserSourceReady) return 'CONNECTED';
  if (props.obsStatus.connected) return 'OBS';
  return 'OFFLINE';
}
</script>

<template>
  <section class="studio-mixer-footer">
    <section class="mixer-panel">
      <header><Mic2 :size="15" /><span>Nguồn âm thanh</span></header>
      <div>Âm thanh từ video/audio trong scene sẽ được chuyển sang Browser Source.</div>
    </section>
    <section class="mixer-panel output">
      <header>
        <Volume2 :size="15" />
        <span>Đầu ra OBS</span>
        <b :class="{ active: obsStatus.connected }">{{ outputState() }}</b>
      </header>
      <div class="obs-output-summary">
        <span>
          <strong>{{ obsStatus.sceneName }}</strong>
          <small>{{ obsStatus.browserSourceReady ? obsStatus.sourceName : 'Chưa tạo Browser Source' }}</small>
        </span>
        <div>
          <button v-if="!obsStatus.browserSourceReady" type="button" :disabled="obsBusy" @click="emit('connectObs')">
            {{ obsBusy ? 'Đang kết nối...' : 'Kết nối OBS' }}
          </button>
          <button v-else type="button" :disabled="obsBusy || (!obsStatus.virtualCameraAvailable && !obsStatus.virtualCameraActive)" @click="emit('toggleCamera')">
            {{ obsStatus.virtualCameraActive ? 'Dừng camera' : 'Bật camera' }}
          </button>
          <button type="button" :disabled="obsBusy" @click="emit('settings')">Cài đặt</button>
        </div>
      </div>
    </section>
    <div class="studio-actions">
      <button type="button" class="studio-action muted" @click="emit('export')"><MonitorUp :size="15" />Xuất video</button>
      <button type="button" class="studio-action live" @click="emit('start')"><Radio :size="15" />Bắt đầu livestream</button>
      <button type="button" class="studio-action live" @click="emit('settings')"><Settings2 :size="15" />Cài đặt livestream</button>
    </div>
  </section>
</template>
