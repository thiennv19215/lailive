<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Plus } from '@lucide/vue';
import type { PreparedLiveProgramCue, PreparedLiveProgramCueState, ProjectPreparedLiveProgramSettings, ProjectSceneLayer } from '../../shared/contracts/projects';

type DragMode = 'move' | 'start' | 'end';
type DragOperation = { index: number; mode: DragMode; originX: number; start: number; end: number };
const props = defineProps<{ layers: ProjectSceneLayer[] }>();
const program = defineModel<ProjectPreparedLiveProgramSettings>({ required: true });
const emit = defineEmits<{ changed: [] }>();
const track = ref<HTMLElement | null>(null);
const drag = ref<DragOperation | null>(null);
const snapSeconds = 0.5;
const states: PreparedLiveProgramCueState[] = ['CONSULT', 'DEMO', 'CTA', 'WELCOME', 'THANKS'];
const visualLayers = computed(() => props.layers.filter((layer) => layer.kind === 'video' && mediaId(layer)));
const audioLayers = computed(() => props.layers.filter((layer) => layer.kind === 'audio' && mediaId(layer)));
const displayDuration = computed(() => Math.max(60, ...program.value.cues.map((cue) => cue.visualEndAt)));
const mappedStates = computed(() => new Set(program.value.cues.map((cue) => cue.state)));

function mediaId(layer: ProjectSceneLayer): string { return layer.source.mediaReferenceId ?? layer.source.assetId ?? ''; }
function visualLayerId(value: string): void { program.value.visualVideoLayerId = value || null; emit('changed'); }
function baseAudioLayerId(value: string): void { program.value.baseAudioLayerId = value || null; emit('changed'); }
function cueStyle(cue: PreparedLiveProgramCue) { return { left: `${(cue.visualStartAt / displayDuration.value) * 100}%`, width: `${Math.max(1, ((cue.visualEndAt - cue.visualStartAt) / displayDuration.value) * 100)}%` }; }
function format(seconds: number): string { const min = Math.floor(seconds / 60); return `${String(min).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`; }
function behaviorFor(state: PreparedLiveProgramCueState): PreparedLiveProgramCue['behavior'] { return state === 'WELCOME' || state === 'THANKS' ? 'interrupt-resume' : 'jump'; }
function behaviorLabel(cue: PreparedLiveProgramCue): string { return cue.behavior === 'interrupt-resume' ? 'Ngat video, phat audio, roi resume' : 'Den chuong trong video chinh'; }
function addCue(): void {
  const state = states.find((item) => !mappedStates.value.has(item));
  if (!state || !program.value.visualVideoLayerId) return;
  const lastEnd = Math.max(0, ...program.value.cues.map((cue) => cue.visualEndAt));
  program.value.cues.push({ state, visualStartAt: lastEnd, visualEndAt: lastEnd + 8, audioLayerId: null, behavior: behaviorFor(state) });
  emit('changed');
}
function updateAudio(cue: PreparedLiveProgramCue, value: string): void { cue.audioLayerId = value || null; emit('changed'); }
function beginDrag(event: PointerEvent, index: number, mode: DragMode): void {
  const cue = program.value.cues[index]; if (!cue) return;
  drag.value = { index, mode, originX: event.clientX, start: cue.visualStartAt, end: cue.visualEndAt };
  window.addEventListener('pointermove', moveDrag); window.addEventListener('pointerup', finishDrag, { once: true });
}
function snap(value: number): number { return Math.max(0, Math.round(value / snapSeconds) * snapSeconds); }
function moveDrag(event: PointerEvent): void {
  if (!drag.value || !track.value) return;
  const operation = drag.value; const cue = program.value.cues[operation.index]; if (!cue) return;
  const delta = ((event.clientX - operation.originX) / track.value.getBoundingClientRect().width) * displayDuration.value;
  const length = operation.end - operation.start;
  if (operation.mode === 'move') { cue.visualStartAt = snap(operation.start + delta); cue.visualEndAt = cue.visualStartAt + length; }
  if (operation.mode === 'start') cue.visualStartAt = Math.min(snap(operation.start + delta), operation.end - snapSeconds);
  if (operation.mode === 'end') cue.visualEndAt = Math.max(snap(operation.end + delta), operation.start + snapSeconds);
  emit('changed');
}
function finishDrag(): void { drag.value = null; window.removeEventListener('pointermove', moveDrag); }
onBeforeUnmount(finishDrag);
</script>

<template>
  <section class="long-video-editor">
    <div class="editor-heading"><div><small>Chuong trinh phat san</small><h3>Mot video hinh anh, nhieu audio thoai</h3><p>Video chinh chi dung de hien hinh/nhai moi. Tat ca loi thoai duoi day la file audio rieng.</p></div><button type="button" :disabled="!program.visualVideoLayerId || mappedStates.size === states.length" @click="addCue"><Plus :size="14" /> Them chuong</button></div>
    <div class="program-flow"><span>1. Video hinh anh</span><i>-&gt;</i><span>2. Keo cac chuong</span><i>-&gt;</i><span>3. Gan audio thoai rieng</span></div>
    <div class="editor-controls"><label>Video hinh anh chinh<select :value="program.visualVideoLayerId ?? ''" @change="visualLayerId(($event.target as HTMLSelectElement).value)"><option value="">Chon video dai de bat dau</option><option v-for="layer in visualLayers" :key="layer.id" :value="layer.id">{{ layer.name }}</option></select></label><label>Audio nen (tuy chon)<select :value="program.baseAudioLayerId ?? ''" @change="baseAudioLayerId(($event.target as HTMLSelectElement).value)"><option value="">Khong co audio nen</option><option v-for="layer in audioLayers" :key="layer.id" :value="layer.id">{{ layer.name }}</option></select></label><small>Snap 0.5 giay</small></div>
    <template v-if="program.visualVideoLayerId">
      <div class="timeline-scroll"><div class="timeline-ruler"><span v-for="tick in 7" :key="tick" :style="{ left: `${((tick - 1) / 6) * 100}%` }">{{ format(((tick - 1) / 6) * displayDuration) }}</span></div><div ref="track" class="timeline-track"><div class="lane-label">HINH</div><p v-if="!program.cues.length">Chua co chuong nao. Bam “Them chuong” de gan doan dau tien.</p><button v-for="(cue, index) in program.cues" :key="cue.state" type="button" class="cue-block" :class="`cue-${cue.state.toLowerCase()}`" :style="cueStyle(cue)" @pointerdown.prevent="beginDrag($event, index, 'move')"><i class="handle start" @pointerdown.stop.prevent="beginDrag($event, index, 'start')" /><b>{{ cue.state }}</b><span>{{ format(cue.visualStartAt) }} - {{ format(cue.visualEndAt) }}</span><i class="handle end" @pointerdown.stop.prevent="beginDrag($event, index, 'end')" /></button></div></div>
      <div class="audio-assignment"><div class="audio-assignment-heading"><b>THOAI / AUDIO RIENG</b><span>Audio cua tung chuong khong phat tu video</span></div><div v-for="cue in program.cues" :key="`${cue.state}-audio`" class="audio-row"><div class="audio-range"><b>{{ cue.state }}</b><span>{{ format(cue.visualStartAt) }} - {{ format(cue.visualEndAt) }}</span></div><select :value="cue.audioLayerId ?? ''" @change="updateAudio(cue, ($event.target as HTMLSelectElement).value)"><option value="">Chua gan audio thoai</option><option v-for="layer in audioLayers" :key="layer.id" :value="layer.id">{{ layer.name }}</option></select><small>{{ behaviorLabel(cue) }}</small></div></div>
    </template>
    <p v-else class="timeline-empty">Chon video hinh anh chinh truoc. Sau do keo cac chuong tren timeline va gan file audio rieng cho tung chuong.</p>
  </section>
</template>

<style scoped>
.long-video-editor{margin:18px 24px;padding:16px;border:1px solid #5b4330;border-radius:10px;background:linear-gradient(135deg,#251b17,#1d1e24)}.editor-heading{display:flex;justify-content:space-between;gap:16px}.editor-heading small{color:#d99758;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.editor-heading h3{margin:3px 0;font-size:15px;color:#f4c8a5}.editor-heading p,.timeline-empty{margin:0;color:#aaaab2;font-size:12px;line-height:1.45}.editor-heading button{align-self:start;display:inline-flex;align-items:center;gap:4px;border:1px solid #9a6032;border-radius:6px;padding:7px 9px;background:#d8782b;color:#fff;font-weight:700;font-size:11px;cursor:pointer}.editor-heading button:disabled{opacity:.45;cursor:not-allowed}.program-flow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:13px 0 0;color:#edbe92;font-size:11px;font-weight:700}.program-flow span{padding:5px 7px;border-radius:4px;background:#34251d}.program-flow i{color:#92613c;font-style:normal}.editor-controls{display:flex;align-items:end;gap:10px;margin:14px 0}.editor-controls label{display:grid;gap:4px;color:#c0c0c8;font-size:11px}.editor-controls select,.audio-row select{min-width:180px;border:1px solid #4a4b55;border-radius:5px;padding:7px;background:#14151a;color:#f2f2f5}.editor-controls small{padding-bottom:8px;color:#858692;font-size:11px}.timeline-scroll{overflow-x:auto}.timeline-ruler{position:relative;height:25px;min-width:480px;border-bottom:1px solid #5a4a3c;color:#b9a18d;font-size:10px}.timeline-ruler span{position:absolute;transform:translateX(-50%)}.timeline-ruler span::after{content:'';display:block;width:1px;height:5px;margin:3px auto 0;background:#80634c}.timeline-track{position:relative;min-width:480px;height:80px;overflow:hidden;border:1px solid #514238;border-radius:7px;background:repeating-linear-gradient(90deg,#16171c 0,#16171c calc(10% - 1px),#363038 calc(10% - 1px),#363038 10%)}.lane-label{position:absolute;top:3px;left:7px;z-index:2;color:#aaaab2;font-size:9px;font-weight:800;letter-spacing:.08em}.timeline-track>p{margin:27px;color:#858692;font-size:12px;text-align:center}.cue-block{position:absolute;top:20px;height:45px;min-width:54px;overflow:hidden;border:1px solid #efbc83;border-radius:6px;padding:4px 10px;color:#fff;text-align:left;cursor:grab;touch-action:none}.cue-block:active{cursor:grabbing}.cue-block b,.cue-block span{display:block;white-space:nowrap}.cue-block b{font-size:11px}.cue-block span{margin-top:4px;color:#ffe2c5;font-size:10px}.cue-consult{background:#285a63}.cue-demo{background:#6d3c25}.cue-cta{background:#6b3150}.cue-welcome{background:#36517d}.cue-thanks{background:#4b6040}.handle{position:absolute;top:0;bottom:0;width:8px;background:rgb(255 255 255 / 25%)}.handle.start{left:0;cursor:ew-resize}.handle.end{right:0;cursor:ew-resize}.audio-assignment{margin-top:10px;border:1px solid #514238;border-radius:7px;overflow:hidden}.audio-assignment-heading{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;background:#201c1c;color:#bdbec6;font-size:10px}.audio-assignment-heading b{color:#f0c7a4;letter-spacing:.08em}.audio-row{display:grid;grid-template-columns:135px minmax(180px,1fr) minmax(180px,1.25fr);gap:10px;align-items:center;padding:8px 10px;border-top:1px solid #403b3b}.audio-range{display:grid;gap:2px}.audio-range b{color:#f1d2b8;font-size:11px}.audio-range span,.audio-row small{color:#9596a0;font-size:10px;line-height:1.3}.timeline-empty{padding-top:3px}@media(max-width:760px){.long-video-editor{margin:14px}.editor-heading,.editor-controls,.audio-row{display:grid}.editor-controls select,.audio-row select{min-width:0;width:100%}}
</style>
