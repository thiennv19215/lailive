<script setup lang="ts">
import { ListVideo, MonitorUp, Radio, Settings2, Volume2 } from '@lucide/vue';
import type { ObsStatus } from '../../shared/contracts/obs';
import type { PreparedScriptPlaybackSnapshot } from '../../modules/playback/prepared-script-playback';
import type { ProjectPreparedScript } from '../../shared/contracts/projects';

const props = defineProps<{ obsStatus: ObsStatus; obsBusy: boolean; scripts: ProjectPreparedScript[]; snapshot: PreparedScriptPlaybackSnapshot; }>();
const emit = defineEmits<{ export: []; openPreparedScripts: []; playRole: ['activation' | 'conversation']; startSequence: []; pause: []; resume: []; skip: []; stop: []; settings: []; start: []; connectObs: []; toggleCamera: []; }>();

const waitingScripts = () => props.scripts.filter((script) => script.role === 'idle');
const priorityScripts = () => props.scripts.filter((script) => script.role === 'activation');
const conversationScripts = () => props.scripts.filter((script) => script.role === 'conversation');
function outputState(): string {
  if (props.obsStatus.virtualCameraActive) return 'CAM ON';
  if (props.obsStatus.browserSourceReady) return 'CONNECTED';
  if (props.obsStatus.connected) return 'OBS';
  return 'OFFLINE';
}
</script>

<template>
  <section class="studio-mixer-footer">
    <section class="mixer-panel timeline-panel">
      <p class="timeline-waiting">Hàng tự chạy phát lần lượt từ mục 1 đến mục cuối. Kích hoạt ưu tiên đợi mục hiện tại phát xong; phản hồi hội thoại có thể tạm dừng để trả lời ngay.</p>
      <header><ListVideo :size="15" /><span>Timeline tự chạy</span><button type="button" class="timeline-edit-button" @click="emit('openPreparedScripts')">Chỉnh chi tiết</button></header>
      <div class="timeline-body timeline-program">
        <div class="timeline-program-row">
          <div class="timeline-program-label"><strong>Hàng tự chạy</strong><small>{{ waitingScripts().length }} mục · phát tuần tự · lặp lại</small></div>
          <div class="timeline-track">
            <button v-for="(script, index) in waitingScripts()" :key="script.id" type="button" class="timeline-clip" :class="{ active: snapshot.activeScriptId === script.id, disabled: !script.enabled }" :disabled="!script.enabled"><b>{{ index + 1 }}</b><span>{{ script.name }}</span><small>{{ script.playbackType }} · tự chạy</small></button>
            <small v-if="!waitingScripts().length" class="timeline-empty">Chọn source rồi bấm “+ Hàng tự chạy”.</small>
          </div>
          <div class="timeline-playback-controls"><button v-if="snapshot.mode === 'stopped' || snapshot.mode === 'error'" type="button" :disabled="!waitingScripts().length" @click="emit('startSequence')">Chạy Timeline</button><button v-else-if="snapshot.mode === 'playing'" type="button" @click="emit('pause')">Tạm dừng</button><button v-else-if="snapshot.mode === 'paused'" type="button" @click="emit('resume')">Tiếp tục</button><button type="button" :disabled="!snapshot.activeScriptId" @click="emit('skip')">Bỏ qua</button><button type="button" :disabled="snapshot.mode === 'stopped'" @click="emit('stop')">Dừng</button></div>
        </div>
        <div class="timeline-priority-row">
          <div><strong>Kích hoạt ưu tiên</strong><small>Phát sau khi mục Timeline hiện tại kết thúc</small></div>
          <button type="button" :disabled="!priorityScripts().length" @click="emit('playRole', 'activation')">Phát kích hoạt</button>
          <span>{{ priorityScripts().length ? priorityScripts().map((script) => script.name).join(' · ') : 'Chưa chuẩn bị nguồn kích hoạt' }}</span>
        </div>
        <div v-if="conversationScripts().length" class="timeline-conversation-row"><strong>Khi nói</strong><button type="button" @click="emit('playRole', 'conversation')">Bắt đầu nói</button><span>{{ conversationScripts().map((script) => script.name).join(' · ') }}</span></div>
        <small v-if="snapshot.queuedScriptIds.length" class="timeline-waiting">Đang chờ phát xong câu hiện tại rồi sẽ chuyển sang kịch bản ưu tiên.</small>
        <small v-if="snapshot.errorMessage" class="playlist-error">{{ snapshot.errorMessage }}</small>
      </div>
    </section>
    <div class="studio-actions">
      <section class="livestream-output" :class="{ connected: obsStatus.connected }"><header><Volume2 :size="14" /><span>Đầu ra OBS</span><b>{{ outputState() }}</b></header><small>{{ obsStatus.browserSourceReady ? obsStatus.sourceName : 'Chưa tạo Browser Source' }}</small><div><button v-if="!obsStatus.browserSourceReady" type="button" :disabled="obsBusy" @click="emit('connectObs')">{{ obsBusy ? 'Đang kết nối...' : 'Kết nối OBS' }}</button><button v-else type="button" :disabled="obsBusy || (!obsStatus.virtualCameraAvailable && !obsStatus.virtualCameraActive)" @click="emit('toggleCamera')">{{ obsStatus.virtualCameraActive ? 'Dừng camera' : 'Bật camera' }}</button><button type="button" :disabled="obsBusy" @click="emit('settings')">Cài đặt</button></div></section>
      <button type="button" class="studio-action muted" @click="emit('export')"><MonitorUp :size="15" />Xuất video</button><button type="button" class="studio-action live" @click="emit('start')"><Radio :size="15" />Bắt đầu livestream</button><button type="button" class="studio-action live" @click="emit('settings')"><Settings2 :size="15" />Cài đặt livestream</button>
    </div>
  </section>
</template>
