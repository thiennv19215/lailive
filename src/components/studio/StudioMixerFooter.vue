<script setup lang="ts">
import { ListVideo, MonitorUp, Radio, Settings2, Volume2 } from '@lucide/vue';
import type { ObsStatus } from '../../shared/contracts/obs';
import type { PreparedScriptPlaybackSnapshot } from '../../modules/playback/prepared-script-playback';
import type { ProjectPreparedScript, PreparedScriptRole, ProjectSceneLayer } from '../../shared/contracts/projects';

const props = defineProps<{
  obsStatus: ObsStatus;
  obsBusy: boolean;
  scripts: ProjectPreparedScript[];
  snapshot: PreparedScriptPlaybackSnapshot;
  activeSource: Pick<ProjectSceneLayer, 'name' | 'kind'> | null;
}>();

const emit = defineEmits<{
  export: [];
  addAvatarAudio: [];
  assignActiveSource: [role: PreparedScriptRole];
  openPreparedScripts: [];
  playRole: [role: PreparedScriptRole];
  playScript: [scriptId: string];
  settings: [];
  start: [];
  connectObs: [];
  toggleCamera: [];
}>();

const roles: Array<{ id: PreparedScriptRole; label: string; action: string }> = [
  { id: 'idle', label: 'Chờ', action: 'Chạy chờ' },
  { id: 'activation', label: 'Kích hoạt', action: 'Kích hoạt' },
  { id: 'conversation', label: 'Đang nói', action: 'Nói chuyện' },
];
const scriptsForRole = (role: PreparedScriptRole) => props.scripts.filter((script) => script.role === role);

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
      <header><ListVideo :size="15" /><span>Timeline kịch bản</span><button type="button" class="timeline-edit-button" @click="emit('openPreparedScripts')">Chỉnh sửa</button></header>
      <div class="timeline-body">
        <p v-if="!scripts.length">Chọn video, audio hoặc avatar trên canvas rồi gán nó vào một chế độ bên dưới.</p>
        <div v-else class="timeline-lanes" aria-label="Timeline kịch bản">
          <section v-for="role in roles" :key="role.id" class="timeline-lane"><button type="button" class="timeline-role-play" @click="emit('playRole', role.id)">{{ role.action }}</button><strong>{{ role.label }}</strong><div class="timeline-track"><button v-for="script in scriptsForRole(role.id)" :key="script.id" type="button" class="timeline-clip" :class="{ active: snapshot.activeScriptId === script.id, disabled: !script.enabled }" :disabled="!script.enabled" @click="emit('playScript', script.id)"><b>R{{ scripts.indexOf(script) + 1 }}</b><span>{{ script.name }}</span><small>{{ script.playbackType }}</small></button><small v-if="!scriptsForRole(role.id).length" class="timeline-empty">Chưa gán</small></div></section>
        </div>
        <small v-if="snapshot.queuedScriptIds.length" class="timeline-waiting">Đang đợi phát xong câu hiện tại trước khi chuyển.</small>
        <div class="timeline-actions"><strong>{{ activeSource ? `${activeSource.kind}: ${activeSource.name}` : 'Chọn video, audio hoặc avatar trên canvas' }}</strong><button type="button" :disabled="!activeSource || !['video', 'audio', 'avatar'].includes(activeSource.kind)" @click="emit('addAvatarAudio')">+ Nhập audio</button><button type="button" :disabled="!activeSource || !['video', 'audio', 'avatar'].includes(activeSource.kind)" @click="emit('assignActiveSource', 'idle')">Gán Chờ</button><button type="button" :disabled="!activeSource || !['video', 'audio', 'avatar'].includes(activeSource.kind)" @click="emit('assignActiveSource', 'activation')">Gán Kích hoạt</button><button type="button" :disabled="!activeSource || !['video', 'audio', 'avatar'].includes(activeSource.kind)" @click="emit('assignActiveSource', 'conversation')">Gán Đang nói</button></div>
      </div>
    </section>
    <div class="studio-actions">
      <section class="livestream-output" :class="{ connected: obsStatus.connected }">
        <header><Volume2 :size="14" /><span>Đầu ra OBS</span><b>{{ outputState() }}</b></header>
        <small>{{ obsStatus.browserSourceReady ? obsStatus.sourceName : 'Chưa tạo Browser Source' }}</small>
        <div><button v-if="!obsStatus.browserSourceReady" type="button" :disabled="obsBusy" @click="emit('connectObs')">{{ obsBusy ? 'Đang kết nối...' : 'Kết nối OBS' }}</button><button v-else type="button" :disabled="obsBusy || (!obsStatus.virtualCameraAvailable && !obsStatus.virtualCameraActive)" @click="emit('toggleCamera')">{{ obsStatus.virtualCameraActive ? 'Dừng camera' : 'Bật camera' }}</button><button type="button" :disabled="obsBusy" @click="emit('settings')">Cài đặt</button></div>
      </section>
      <button type="button" class="studio-action muted" @click="emit('export')"><MonitorUp :size="15" />Xuất video</button>
      <button type="button" class="studio-action live" @click="emit('start')"><Radio :size="15" />Bắt đầu livestream</button>
      <button type="button" class="studio-action live" @click="emit('settings')"><Settings2 :size="15" />Cài đặt livestream</button>
    </div>
  </section>
</template>
