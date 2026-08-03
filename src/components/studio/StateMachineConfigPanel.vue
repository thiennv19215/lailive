<script setup lang="ts">
import { computed } from 'vue';
import { Plus, Trash2, X } from '@lucide/vue';
import LongVideoTimelineEditor from './LongVideoTimelineEditor.vue';
import { LIVE_STATES, type LiveStateDefinition } from '../../shared/contracts/live-state';
import type { ProjectPreparedLiveProgramSettings, ProjectSceneLayer, ProjectStateMachineSettings } from '../../shared/contracts/projects';

// These fields are optional while older saved projects are migrated.
type StatePlaybackRange = LiveStateDefinition & {
  startAt?: number;
  endAt?: number | null;
};

const props = defineProps<{
  layers: ProjectSceneLayer[];
  mediaMissingIds: string[];
}>();

const settings = defineModel<ProjectStateMachineSettings>({ required: true });
const preparedLiveProgram = defineModel<ProjectPreparedLiveProgramSettings>('preparedLiveProgram');
const emit = defineEmits<{ close: []; changed: []; }>();

const visualLayers = computed(() => props.layers.filter((layer) => (
  (layer.kind === 'avatar' || layer.kind === 'video') && stateMediaId(layer) !== null
)));
const audioLayers = computed(() => props.layers.filter((layer) => layer.kind === 'audio' && stateMediaId(layer) !== null));

function stateMediaId(layer: ProjectSceneLayer): string | null {
  return layer.source.mediaReferenceId ?? layer.source.assetId ?? null;
}

function layerMissing(layer: ProjectSceneLayer): boolean {
  const id = layer.source.mediaReferenceId;
  return id !== null && props.mediaMissingIds.includes(id);
}

function selectedLayerId(media: LiveStateDefinition['avatar'] | LiveStateDefinition['audio']): string {
  return media?.assetId ?? '';
}

function setMedia(definition: LiveStateDefinition, field: 'avatar' | 'audio', assetId: string): void {
  definition[field] = assetId ? { assetId, kind: field === 'audio' ? 'audio' : 'video' } : null;
  emit('changed');
}

function playbackRange(definition: LiveStateDefinition): StatePlaybackRange {
  return definition as StatePlaybackRange;
}

function rangeStart(definition: LiveStateDefinition): number {
  return playbackRange(definition).startAt ?? 0;
}

function rangeEnd(definition: LiveStateDefinition): number | null {
  return playbackRange(definition).endAt ?? definition.duration;
}

function setRangeStart(definition: LiveStateDefinition, value: string): void {
  const startAt = Number(value);
  playbackRange(definition).startAt = Number.isFinite(startAt) && startAt >= 0 ? startAt : 0;
  emit('changed');
}

function setRangeEnd(definition: LiveStateDefinition, value: string): void {
  const endAt = Number(value);
  playbackRange(definition).endAt = Number.isFinite(endAt) && endAt > rangeStart(definition) ? endAt : null;
  emit('changed');
}

function audioStartAt(definition: LiveStateDefinition): number | null {
  return playbackRange(definition).audioStartAt ?? null;
}

function setAudioStartAt(definition: LiveStateDefinition, value: string): void {
  const startAt = Number(value);
  playbackRange(definition).audioStartAt = Number.isFinite(startAt) && startAt >= 0 ? startAt : null;
  emit('changed');
}

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function playbackSummary(definition: LiveStateDefinition): string {
  const endAt = rangeEnd(definition);
  return endAt === null
    ? `${definition.state} chạy từ ${formatTime(rangeStart(definition))} đến hết video`
    : `${definition.state} chạy ${formatTime(rangeStart(definition))} -> ${formatTime(endAt)}`;
}

function addCue(definition: LiveStateDefinition): void {
  const startTime = definition.timeline.length ? definition.timeline[definition.timeline.length - 1]!.endTime : 0;
  definition.timeline.push({ checkpoint: `Cue ${definition.timeline.length + 1}`, startTime, endTime: startTime + 5, transition: 'cut' });
  emit('changed');
}

function removeCue(definition: LiveStateDefinition, index: number): void {
  definition.timeline.splice(index, 1);
  emit('changed');
}
</script>

<template>
  <div class="state-machine-backdrop" @click.self="emit('close')">
    <section class="state-machine-panel" role="dialog" aria-modal="true" aria-labelledby="state-machine-title">
      <header>
        <div><small>Phase 1 control center</small><h2 id="state-machine-title">State Machine</h2><p>Gán video và âm thanh cho các lệnh điều khiển gửi đến OBS.</p></div>
        <button type="button" aria-label="Close State Machine settings" @click="emit('close')"><X :size="18" /></button>
      </header>

      <label class="state-machine-enabled">
        <input v-model="settings.enabled" type="checkbox" @change="emit('changed')" />
        <span><b>Bật state machine cho người vận hành</b><small>Prepared Scripts cũ vẫn hoạt động riêng, không bị thay đổi.</small></span>
      </label>

      <p v-if="!visualLayers.length" class="state-machine-warning">Hãy thêm layer Avatar hoặc Video có nguồn media trước khi gán hình cho state.</p>
      <p v-if="!audioLayers.length" class="state-machine-warning">Chưa có layer Audio. State vẫn có thể chạy chỉ với hình.</p>

      <LongVideoTimelineEditor v-if="preparedLiveProgram" :layers="layers" :model-value="preparedLiveProgram" @update:model-value="preparedLiveProgram = $event" @changed="emit('changed')" />
      <p v-else class="state-machine-warning">Chuong trinh phat san dang khoi tao. Hay luu/moi lai project neu thong bao nay khong tu mat.</p>

      <p class="legacy-settings-label">State Machine cu (nang cao / tuong thich project cu)</p>
      <div class="state-machine-list">
        <article v-for="state in LIVE_STATES" :key="state" class="state-definition-card">
          <h3>{{ state }}</h3>
          <div class="state-definition-grid">
            <label>Layer avatar / video
              <select :value="selectedLayerId(settings.definitions[state].avatar)" @change="setMedia(settings.definitions[state], 'avatar', ($event.target as HTMLSelectElement).value)">
                <option value="">Chưa chọn</option>
                <option v-for="layer in visualLayers" :key="layer.id" :value="stateMediaId(layer)!" :disabled="layerMissing(layer)">{{ layer.name }} ({{ layer.id }}){{ layerMissing(layer) ? ' - thiếu file' : '' }}</option>
              </select>
            </label>
            <label>Layer âm thanh
              <select :value="selectedLayerId(settings.definitions[state].audio)" @change="setMedia(settings.definitions[state], 'audio', ($event.target as HTMLSelectElement).value)">
                <option value="">Chưa chọn</option>
                <option v-for="layer in audioLayers" :key="layer.id" :value="stateMediaId(layer)!" :disabled="layerMissing(layer)">{{ layer.name }} ({{ layer.id }}){{ layerMissing(layer) ? ' - thiếu file' : '' }}</option>
              </select>
            </label>
            <label>Video bắt đầu tại (giây)<input :value="rangeStart(settings.definitions[state])" type="number" min="0" max="86400" step="0.1" @change="setRangeStart(settings.definitions[state], ($event.target as HTMLInputElement).value)" /></label>
            <label>Dừng/chuyển state tại (giây)<input :value="rangeEnd(settings.definitions[state]) ?? ''" type="number" min="0.1" max="86400" step="0.1" placeholder="Để trống = hết video" @change="setRangeEnd(settings.definitions[state], ($event.target as HTMLInputElement).value)" /></label>
            <fieldset class="audio-sync-field">
              <legend>Âm thanh riêng</legend>
              <label><input :checked="audioStartAt(settings.definitions[state]) === null" type="radio" :name="`audio-sync-${state}`" @change="playbackRange(settings.definitions[state]).audioStartAt = null; emit('changed')" /> Đồng bộ với video</label>
              <label><input :checked="audioStartAt(settings.definitions[state]) !== null" type="radio" :name="`audio-sync-${state}`" @change="playbackRange(settings.definitions[state]).audioStartAt = 0; emit('changed')" /> Bắt đầu riêng</label>
              <input :value="audioStartAt(settings.definitions[state]) ?? ''" :disabled="audioStartAt(settings.definitions[state]) === null" type="number" min="0" max="86400" step="0.1" placeholder="Audio bắt đầu tại (giây)" aria-label="Audio bắt đầu tại giây" @change="setAudioStartAt(settings.definitions[state], ($event.target as HTMLInputElement).value)" />
              <small>Chọn “Đồng bộ” để thoại đi theo mốc video, kể cả khi resume. Offset riêng, ví dụ 0, sẽ phát audio độc lập từ mốc đó.</small>
            </fieldset>
            <label>Ưu tiên<input v-model.number="settings.definitions[state].priority" type="number" min="0" max="1000" step="1" @change="emit('changed')" /></label>
            <label>State tiếp theo
              <select v-model="settings.definitions[state].nextState" @change="emit('changed')"><option :value="null">Dừng / không chuyển tiếp</option><option v-for="nextState in LIVE_STATES" :key="nextState" :value="nextState" :disabled="nextState === state">{{ nextState }}</option></select>
            </label>
          </div>

          <p class="state-playback-summary">{{ playbackSummary(settings.definitions[state]) }}</p>

          <div class="state-cues">
            <div><strong>Mốc chương (tùy chọn)</strong><button type="button" @click="addCue(settings.definitions[state])"><Plus :size="13" />Thêm mốc</button></div>
            <div v-for="(cue, index) in settings.definitions[state].timeline" :key="`${state}-${index}`" class="state-cue-row">
              <input v-model="cue.checkpoint" aria-label="Tên mốc chương" maxlength="80" placeholder="Tên mốc" @change="emit('changed')" />
              <input v-model.number="cue.startTime" aria-label="Mốc bắt đầu tính bằng giây" type="number" min="0" step="0.1" @change="emit('changed')" />
              <input v-model.number="cue.endTime" aria-label="Mốc kết thúc tính bằng giây" type="number" min="0.1" step="0.1" @change="emit('changed')" />
              <span class="state-cue-cut" title="Runtime hiện chỉ cắt tức thì">Cắt tức thì</span>
              <button type="button" :aria-label="`Xóa ${cue.checkpoint}`" @click="removeCue(settings.definitions[state], index)"><Trash2 :size="13" /></button>
            </div>
            <small>Mốc chương chỉ để đặt tên/đánh dấu các đoạn, không quyết định video phát từ đâu đến đâu. Ví dụ: video dài 60 phút, đặt DEMO từ 30:00 đến 45:00 ở hai ô phía trên.</small>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.state-machine-backdrop { position: fixed; inset: 0; z-index: 4000; display: grid; place-items: center; padding: 24px; background: rgb(7 8 12 / 76%); }
.state-machine-panel { width: min(980px, 100%); max-height: min(860px, calc(100vh - 48px)); overflow: auto; border: 1px solid #454751; border-radius: 14px; background: #18191e; box-shadow: 0 28px 80px rgb(0 0 0 / 50%); color: #eeeef2; }
.state-machine-panel > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 22px 24px 16px; border-bottom: 1px solid #363741; }
.state-machine-panel header small { color: #d99758; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.state-machine-panel h2 { margin: 4px 0; font-size: 22px; }.state-machine-panel p { margin: 0; color: #a9aab4; font-size: 13px; }
.state-machine-panel > header button, .state-cue-row button { display: grid; place-items: center; border: 0; background: transparent; color: #c5c6ce; cursor: pointer; }
.state-machine-enabled { display: flex; gap: 12px; align-items: center; margin: 18px 24px; padding: 13px; border: 1px solid #4b4135; border-radius: 9px; background: #211c18; cursor: pointer; }.state-machine-enabled input { width: 17px; height: 17px; accent-color: #d78a45; }.state-machine-enabled span { display: grid; gap: 2px; }.state-machine-enabled small { color: #aaa8a4; font-size: 12px; }
.state-machine-warning { margin: 10px 24px; padding: 10px 12px; border-left: 3px solid #df9a4f; background: #271f18; color: #e9bd88 !important; }
.legacy-settings-label { margin: 20px 24px 0 !important; color: #858692 !important; font-size: 11px !important; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.state-machine-list { display: grid; gap: 12px; padding: 6px 24px 24px; }.state-definition-card { padding: 15px; border: 1px solid #393a43; border-radius: 10px; background: #202126; }.state-definition-card h3 { margin: 0 0 12px; color: #f0c7a4; font-size: 13px; letter-spacing: .08em; }
.state-definition-grid { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; }.state-definition-grid label { display: grid; gap: 5px; color: #b8b9c3; font-size: 11px; }.state-definition-grid select, .state-definition-grid input, .state-cue-row input { width: 100%; box-sizing: border-box; border: 1px solid #4a4b55; border-radius: 5px; padding: 7px; background: #14151a; color: #f2f2f5; }.audio-sync-field { display: grid; grid-column: span 2; gap: 5px; min-width: 0; margin: 0; padding: 8px; border: 1px solid #42434d; border-radius: 6px; }.audio-sync-field legend { padding: 0 3px; color: #b8b9c3; font-size: 11px; }.audio-sync-field label { display: flex; align-items: center; gap: 5px; }.audio-sync-field input[type='radio'] { width: auto; }.audio-sync-field input:disabled { opacity: .45; }.audio-sync-field small { color: #858692; font-size: 10px; line-height: 1.35; }.state-playback-summary { margin: 11px 0 0 !important; color: #f0c7a4 !important; font-size: 12px !important; font-weight: 700; }
.state-cues { margin-top: 13px; padding-top: 12px; border-top: 1px solid #393a43; }.state-cues > div:first-child { display: flex; align-items: center; justify-content: space-between; }.state-cues strong { font-size: 12px; }.state-cues > div:first-child button { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #6c513b; border-radius: 5px; padding: 5px 8px; background: #2d2119; color: #f2c49d; font-size: 11px; cursor: pointer; }.state-cue-row { display: grid; grid-template-columns: 1.5fr .7fr .7fr .8fr auto; gap: 7px; align-items: center; margin-top: 8px; }.state-cue-cut { padding: 7px; border: 1px solid #3e3f47; border-radius: 5px; color: #9b9ca5; font-size: 11px; text-align: center; }.state-cues small { display: block; margin-top: 7px; color: #858692; font-size: 11px; }
@media (max-width: 760px) { .state-machine-backdrop { padding: 10px; }.state-definition-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.state-cue-row { grid-template-columns: 1fr 1fr; }.state-cue-row button { justify-self: end; } }
</style>
