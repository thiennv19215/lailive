<script setup lang="ts">
/* global Event, HTMLInputElement */
import { Activity, AudioLines, CircleStop, Film, FolderOpen, Pause, Play, SkipBack, SkipForward, Volume2 } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import type { ManualAudioSnapshot, ManualVideoSnapshot } from '../shared/contracts/manual-live';
import type { ObsStatus } from '../shared/contracts/obs';
import type { SceneRuntimeStatus } from '../shared/contracts/scene-runtime';
import type { TimelineOwnershipSnapshot } from '../shared/contracts/timeline';

const emptyVideo: ManualVideoSnapshot = { playlist: [], currentIndex: null, state: 'idle', loop: false, revision: 0 };
const emptyAudio: ManualAudioSnapshot = { queue: [], currentIndex: null, state: 'idle', volume: 1, autoNext: true, revision: 0 };
const desktopApi = globalThis.window.desktopApi;
const video = ref<ManualVideoSnapshot>(emptyVideo);
const audio = ref<ManualAudioSnapshot>(emptyAudio);
const sceneStatus = ref<SceneRuntimeStatus | null>(null);
const obsStatus = ref<ObsStatus | null>(null);
const timeline = ref<TimelineOwnershipSnapshot | null>(null);
const notice = ref('');
const commandInFlight = ref(false);
let removeVideoSnapshot: (() => void) | null = null;
let removeAudioSnapshot: (() => void) | null = null;
let statusTimer: ReturnType<typeof globalThis.setInterval> | null = null;

const currentVideo = computed(() => video.value.currentIndex === null ? null : video.value.playlist[video.value.currentIndex] ?? null);
const currentAudio = computed(() => audio.value.currentIndex === null ? null : audio.value.queue[audio.value.currentIndex] ?? null);
const obsLabel = computed(() => obsStatus.value?.connected ? 'CONNECTED' : 'MOCK / OFFLINE');
const sceneLabel = computed(() => sceneStatus.value?.running ? 'READY' : 'OFFLINE');
const timelineOwnerLabel = computed(() => {
  const labels = {
    studio: 'STUDIO',
    'manual-live': 'MANUAL LIVE',
    'live-state': 'LIVE STATE',
    'prepared-live-program': 'LIVE PROGRAM',
  } as const;
  return timeline.value?.owner ? labels[timeline.value.owner] : 'UNASSIGNED';
});
const manualOwnsTimeline = computed(() => timeline.value?.owner === 'manual-live');

onMounted(async () => {
  removeVideoSnapshot = desktopApi.manualLive.video.onSnapshot((snapshot) => { video.value = snapshot; });
  removeAudioSnapshot = desktopApi.manualLive.audio.onSnapshot((snapshot) => { audio.value = snapshot; });
  await refreshState();
  statusTimer = globalThis.setInterval(() => { void refreshExternalStatus(); }, 4_000);
});

onUnmounted(() => {
  removeVideoSnapshot?.();
  removeAudioSnapshot?.();
  if (statusTimer !== null) globalThis.clearInterval(statusTimer);
});

async function refreshState(): Promise<void> {
  const [videoSnapshot, audioSnapshot] = await Promise.all([
    desktopApi.manualLive.video.list(),
    desktopApi.manualLive.audio.list(),
  ]);
  video.value = videoSnapshot ?? emptyVideo;
  audio.value = audioSnapshot ?? emptyAudio;
  await refreshExternalStatus();
}

async function refreshExternalStatus(): Promise<void> {
  [sceneStatus.value, obsStatus.value, timeline.value] = await Promise.all([
    desktopApi.sceneRuntime.getStatus(),
    desktopApi.obs.getStatus(),
    desktopApi.timeline.getSnapshot(),
  ]);
}

async function importVideo(): Promise<void> {
  await importMedia('video');
}

async function importAudio(): Promise<void> {
  await importMedia('audio');
}

async function importMedia(kind: 'video' | 'audio'): Promise<void> {
  notice.value = '';
  if (!await claimManualTimeline()) return;
  const references = await desktopApi.media.pickMany(kind, kind === 'video' ? 'Import Video' : 'Import Audio');
  if (references.length === 0) return;
  if (kind === 'video') video.value = await desktopApi.manualLive.video.import({ references });
  else audio.value = await desktopApi.manualLive.audio.import({ references });
  notice.value = `Đã thêm ${references.length} tệp ${kind === 'video' ? 'video' : 'audio'}.`;
}

async function claimManualTimeline(): Promise<boolean> {
  const previousOwner = timeline.value?.owner;
  try {
    timeline.value = await desktopApi.timeline.handoff('manual-live');
    if (previousOwner && previousOwner !== 'manual-live') notice.value = `Timeline control transferred from ${previousOwner}.`;
    return true;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'Unable to claim timeline control.';
    return false;
  }
}

async function run(command: () => Promise<ManualVideoSnapshot | ManualAudioSnapshot>): Promise<void> {
  if (commandInFlight.value) return;
  notice.value = '';
  commandInFlight.value = true;
  try {
    if (!await claimManualTimeline()) return;
    const snapshot = await command();
    if ('playlist' in snapshot) video.value = snapshot;
    else audio.value = snapshot;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'Không thể thực hiện lệnh.';
  } finally {
    commandInFlight.value = false;
  }
}

function setVolume(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  void run(() => desktopApi.manualLive.audio.setVolume(value));
}
</script>

<template>
  <AppShell>
    <div class="live-control-page">
      <header class="live-control-heading">
        <div>
          <small>OPERATOR CONSOLE</small>
          <h1>LIVE CONTROL</h1>
          <p>Manual transport desk · video và audio độc lập.</p>
        </div>
        <div class="live-control-runtime"><span class="runtime-dot" :class="{ ready: sceneStatus?.running }" /><span>SCENE {{ sceneLabel }}</span><span class="runtime-owner" :class="{ active: manualOwnsTimeline }">OWNER {{ timelineOwnerLabel }}</span><b>{{ obsLabel }}</b></div>
      </header>

      <div class="live-control-toolbar" role="toolbar" aria-label="Live control overview">
        <span class="toolbar-mode"><Activity :size="14" /> PROGRAM</span>
        <span class="toolbar-divider" />
        <span class="toolbar-owner" :class="{ active: manualOwnsTimeline }">TIMELINE OWNER <b>{{ timelineOwnerLabel }}</b></span>
        <span>VIDEO <b :class="`toolbar-state toolbar-state--${video.state}`">{{ video.state.toUpperCase() }}</b></span>
        <span>AUDIO <b :class="`toolbar-state toolbar-state--${audio.state}`">{{ audio.state.toUpperCase() }}</b></span>
        <span class="toolbar-spacer" />
        <span class="toolbar-hint">Audio không ảnh hưởng transport video</span>
      </div>

      <p v-if="notice" class="live-control-notice">{{ notice }}</p>

      <section class="live-control-grid">
        <article class="live-panel manual-video-panel">
          <header class="live-panel-heading"><span class="panel-icon"><Film :size="18" /></span><div><strong>VIDEO PANEL</strong><small>Visual playback / Scene Runtime</small></div></header>
          <div class="live-now-playing">
            <span class="live-now-label">VIDEO HIỆN TẠI</span>
            <strong>{{ currentVideo?.label ?? 'Chưa có video' }}</strong>
            <small>{{ video.state.toUpperCase() }} · {{ video.playlist.length }} tệp</small>
          </div>
          <div class="live-actions live-actions--five">
            <button type="button" :disabled="commandInFlight || video.playlist.length === 0" @click="run(() => desktopApi.manualLive.video.play())"><Play :size="15" />Play</button>
            <button type="button" :disabled="commandInFlight || video.state !== 'playing'" @click="run(() => desktopApi.manualLive.video.pause())"><Pause :size="15" />Pause</button>
            <button type="button" :disabled="commandInFlight || video.currentIndex === null" @click="run(() => desktopApi.manualLive.video.stop())"><CircleStop :size="15" />Stop</button>
            <button type="button" :disabled="commandInFlight" class="loop-button" :class="{ active: video.loop }" @click="run(() => desktopApi.manualLive.video.setLoop(!video.loop))">Loop {{ video.loop ? 'ON' : 'OFF' }}</button>
            <button type="button" :disabled="commandInFlight" class="import-button" @click="importVideo"><FolderOpen :size="15" />Import Video</button>
          </div>
          <div class="live-switch-row"><button type="button" :disabled="commandInFlight || video.playlist.length === 0" @click="run(() => desktopApi.manualLive.video.previous())"><SkipBack :size="15" />Previous</button><button type="button" :disabled="commandInFlight || video.playlist.length === 0" @click="run(() => desktopApi.manualLive.video.next())">Next<SkipForward :size="15" /></button></div>
          <div class="live-playlist"><div class="live-list-heading"><span>PLAYLIST</span><b>{{ video.playlist.length }}</b></div><ol><li v-for="(item, index) in video.playlist" :key="item.id" :class="{ active: index === video.currentIndex }"><span>{{ index + 1 }}</span><strong>{{ item.label }}</strong><small>{{ index === video.currentIndex ? video.state.toUpperCase() : 'READY' }}</small></li></ol><p v-if="video.playlist.length === 0" class="live-empty">Import một hoặc nhiều video để bắt đầu.</p></div>
        </article>

        <article class="live-panel manual-audio-panel">
          <header class="live-panel-heading"><span class="panel-icon panel-icon--audio"><AudioLines :size="18" /></span><div><strong>AUDIO PANEL</strong><small>Independent OBS audio source</small></div></header>
          <div class="live-now-playing live-now-playing--audio"><span class="live-now-label">AUDIO HIỆN TẠI</span><strong>{{ currentAudio?.label ?? 'Chưa có audio' }}</strong><small>{{ audio.state.toUpperCase() }} · {{ audio.queue.length }} tệp</small></div>
          <div class="live-actions live-actions--four"><button type="button" :disabled="commandInFlight || audio.queue.length === 0" @click="run(() => desktopApi.manualLive.audio.play())"><Play :size="15" />Play</button><button type="button" :disabled="commandInFlight || audio.state !== 'playing'" @click="run(() => desktopApi.manualLive.audio.pause())"><Pause :size="15" />Pause</button><button type="button" :disabled="commandInFlight || audio.currentIndex === null" @click="run(() => desktopApi.manualLive.audio.stop())"><CircleStop :size="15" />Stop</button><button type="button" :disabled="commandInFlight" class="import-button" @click="importAudio"><FolderOpen :size="15" />Import Audio</button></div>
          <div class="live-switch-row"><button type="button" :disabled="commandInFlight || audio.queue.length === 0" @click="run(() => desktopApi.manualLive.audio.previous())"><SkipBack :size="15" />Previous</button><button type="button" :disabled="commandInFlight || audio.queue.length === 0" @click="run(() => desktopApi.manualLive.audio.next())">Next<SkipForward :size="15" /></button></div>
          <label class="volume-control"><span><Volume2 :size="15" />Volume <b>{{ Math.round(audio.volume * 100) }}%</b></span><input :value="audio.volume" :disabled="commandInFlight" type="range" min="0" max="1" step="0.01" @input="setVolume" /></label>
          <label class="auto-next-control"><input :checked="audio.autoNext" :disabled="commandInFlight" type="checkbox" @change="run(() => desktopApi.manualLive.audio.setAutoNext(!audio.autoNext))" />Auto play next</label>
          <div class="live-playlist"><div class="live-list-heading"><span>PLAYLIST</span><b>{{ audio.queue.length }}</b></div><ol><li v-for="(item, index) in audio.queue" :key="item.id" :class="{ active: index === audio.currentIndex }"><span>{{ index + 1 }}</span><strong>{{ item.label }}</strong><small>{{ index === audio.currentIndex ? audio.state.toUpperCase() : 'READY' }}</small></li></ol><p v-if="audio.queue.length === 0" class="live-empty">Import một hoặc nhiều audio để tạo queue.</p></div>
        </article>

        <aside class="live-status-panel"><header><Activity :size="17" /><div><strong>LIVE STATUS</strong><small>Transport & output health</small></div><span class="status-live-mark">LOCAL</span></header><div class="status-line"><span>Video transport</span><b :class="`status-${video.state}`">{{ video.state.toUpperCase() }}</b></div><div class="status-line"><span>Audio transport</span><b :class="`status-${audio.state}`">{{ audio.state.toUpperCase() }}</b></div><div class="status-line"><span>OBS output</span><b :class="{ connected: obsStatus?.connected }">{{ obsLabel }}</b></div><div class="status-line"><span>Scene runtime</span><b :class="{ connected: sceneStatus?.running }">{{ sceneLabel }}</b></div><div class="status-note"><span class="status-note-dot" />Independent buses</div><p>Đổi audio không restart video.<br />Đổi video không restart audio.</p></aside>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.live-control-page { min-height: calc(100vh - 40px); box-sizing: border-box; padding: 18px 20px 28px; background: #181818; color: #e8e8e8; }
.live-control-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 12px; padding-bottom: 14px; border-bottom: 1px solid #303030; }
.live-control-heading small, .live-now-label, .live-list-heading span { color: #ff8b45; font-size: 9px; font-weight: 800; letter-spacing: .13em; }
.live-control-heading h1 { margin: 4px 0 5px; font-size: 26px; letter-spacing: -.04em; }
.live-control-heading p { margin: 0; color: #8e8e8e; font-size: 11px; }
.live-control-runtime { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 10px; border: 1px solid #3a3a3a; border-radius: 4px; background: #202020; color: #aaa; font-size: 9px; font-weight: 700; letter-spacing: .07em; }
.live-control-runtime b { color: #d7d7d7; font-size: 8px; }.runtime-dot { width: 7px; height: 7px; border-radius: 50%; background: #c46d3b; box-shadow: 0 0 0 3px rgba(196,109,59,.12); }.runtime-dot.ready { background: #64c98a; box-shadow: 0 0 0 3px rgba(100,201,138,.12); }
.runtime-owner { color: #a0a0aa; }.runtime-owner.active { color: #70d29a; }
.live-control-toolbar { display: flex; align-items: center; gap: 12px; min-height: 32px; margin-bottom: 12px; padding: 0 10px; border: 1px solid #303030; border-radius: 4px; background: #202020; color: #9e9e9e; font-size: 9px; font-weight: 700; letter-spacing: .06em; }.toolbar-mode { display: inline-flex; align-items: center; gap: 6px; color: #e3e3e3; }.toolbar-mode svg { color: #ff8b45; }.toolbar-divider { width: 1px; height: 16px; background: #3a3a3a; }.toolbar-spacer { flex: 1; }.toolbar-hint { color: #6f6f6f; font-size: 8px; font-weight: 500; letter-spacing: 0; }.toolbar-state { margin-left: 4px; color: #c17d52; font-size: 8px; }.toolbar-state--playing { color: #6ed091; }.toolbar-state--paused { color: #d7aa64; }
.toolbar-owner { color: #a2a2aa; }.toolbar-owner b { color: #e0c4a4; }.toolbar-owner.active b { color: #70d29a; }
.live-control-notice { margin: -2px 0 12px; padding: 8px 10px; border: 1px solid #785034; border-radius: 4px; background: #2a211b; color: #efb789; font-size: 10px; }
.live-control-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) 270px; gap: 10px; align-items: stretch; }
.live-panel, .live-status-panel { min-width: 0; border: 1px solid #383838; border-radius: 4px; background: #202020; box-shadow: 0 8px 20px rgba(0,0,0,.18); overflow: hidden; }
.live-panel { display: flex; flex-direction: column; }
.live-panel-heading, .live-status-panel > header { display: flex; align-items: center; gap: 9px; min-height: 42px; box-sizing: border-box; padding: 8px 10px; border-bottom: 1px solid #363636; background: #292929; }.live-panel-heading > div, .live-status-panel > header > div { display: grid; gap: 2px; }.live-panel-heading strong, .live-status-panel strong { font-size: 10px; letter-spacing: .06em; }.live-panel-heading small, .live-status-panel small { color: #858585; font-size: 8px; }.panel-icon { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 3px; background: #35241b; color: #ff9856; }.panel-icon--audio { background: #1c3028; color: #70d29a; }
.live-now-playing { display: grid; gap: 4px; min-height: 82px; box-sizing: border-box; padding: 13px 12px; border-bottom: 1px solid #353535; background: #2b211c; }.live-now-playing--audio { background: #202d28; }.live-now-playing strong { overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }.live-now-playing small { color: #aaa; font-size: 9px; }
.live-actions { display: grid; gap: 5px; padding: 9px 10px 5px; }.live-actions--five { grid-template-columns: repeat(4, minmax(0, 1fr)); }.live-actions--five .import-button, .live-actions--four .import-button { grid-column: 1 / -1; }.live-actions--four { grid-template-columns: repeat(3, minmax(0, 1fr)); }.live-actions button, .live-switch-row button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 29px; border: 1px solid #444; border-radius: 3px; background: #303030; color: #d7d7d7; font: inherit; font-size: 8px; font-weight: 800; }.live-actions button:hover, .live-switch-row button:hover { border-color: #ff8b45; background: #373737; }.live-actions button:disabled, .live-switch-row button:disabled { opacity: .35; }.live-actions .loop-button.active { border-color: #d9783e; background: #4a2a1b; color: #ffc49e; }.live-actions .import-button { border-color: #a35c35; background: #3b261c; color: #ffbd93; }
.live-switch-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 4px 10px 9px; }.live-playlist { flex: 1; min-height: 150px; margin: 0 10px 10px; padding: 9px; border: 1px solid #383838; border-radius: 3px; background: #181818; }.live-list-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }.live-list-heading b { min-width: 20px; padding: 3px 5px; border: 1px solid #454545; border-radius: 3px; background: #292929; color: #ff9a61; font-size: 8px; text-align: center; }.live-playlist ol { display: grid; gap: 2px; max-height: 210px; overflow: auto; margin: 0; padding: 0; list-style: none; }.live-playlist li { display: grid; grid-template-columns: 21px minmax(0, 1fr) auto; gap: 7px; align-items: center; min-height: 30px; padding: 4px 6px; border-left: 2px solid transparent; color: #929292; }.live-playlist li.active { border-left-color: #ff8b45; background: #33251e; color: #f3d2bd; }.live-playlist li > span { color: #b8754c; font-size: 8px; font-weight: 800; text-align: center; }.live-playlist li strong { overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.live-playlist li small { color: #707070; font-size: 7px; }.live-playlist li.active small { color: #ff9a61; }.live-empty { margin: 9px 0 2px; color: #707070; font-size: 9px; line-height: 1.4; }
.volume-control { display: grid; gap: 7px; margin: 0 10px 7px; color: #999; font-size: 9px; }.volume-control span { display: flex; align-items: center; gap: 5px; }.volume-control b { margin-left: auto; color: #ddd; }.volume-control input { width: 100%; accent-color: #ff7a2f; }.auto-next-control { display: flex; align-items: center; gap: 6px; margin: 0 10px 9px; color: #aaa; font-size: 9px; }.auto-next-control input { accent-color: #ff7a2f; }
.live-status-panel { align-self: stretch; display: flex; flex-direction: column; background: #202020; }.live-status-panel > header { position: relative; }.live-status-panel > header svg { color: #ff9856; }.status-live-mark { margin-left: auto; padding: 3px 5px; border: 1px solid #4a4a4a; border-radius: 3px; color: #888; font-size: 7px; letter-spacing: .08em; }.status-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 10px; border-bottom: 1px solid #363636; color: #a8a8a8; font-size: 9px; }.status-line b { color: #d69365; font-size: 8px; letter-spacing: .08em; }.status-line b.connected, .status-line b.status-playing { color: #71d096; }.status-line b.status-paused { color: #dcb46c; }.status-line b.status-stopped { color: #d28b70; }.status-note { display: flex; align-items: center; gap: 6px; margin: 12px 10px 0; padding: 7px 8px; border: 1px solid #31563f; background: #1b2b21; color: #8ed7a4; font-size: 8px; }.status-note-dot { width: 6px; height: 6px; border-radius: 50%; background: #72d095; }.live-status-panel > p { margin: auto 10px 14px; padding-top: 18px; color: #777; font-size: 9px; line-height: 1.5; }
@media (max-width: 1120px) { .live-control-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.live-status-panel { grid-column: 1 / -1; }.live-status-panel > header { min-height: 38px; }.live-status-panel { display: grid; grid-template-columns: auto repeat(4, minmax(0, 1fr)); align-items: stretch; }.live-status-panel > header { grid-column: 1 / -1; }.live-status-panel .status-line { border-right: 1px solid #363636; }.live-status-panel .status-note { margin: 8px 10px; }.live-status-panel > p { margin: 8px 10px; } }
@media (max-width: 720px) { .live-control-page { padding: 14px 10px 28px; }.live-control-heading { align-items: flex-start; flex-direction: column; gap: 10px; }.live-control-heading h1 { font-size: 23px; }.live-control-runtime { width: 100%; box-sizing: border-box; }.live-control-toolbar { flex-wrap: wrap; gap: 8px; padding: 7px 9px; }.toolbar-spacer, .toolbar-hint { display: none; }.live-control-grid { grid-template-columns: 1fr; }.live-status-panel { grid-column: auto; display: block; }.live-status-panel .status-line { border-right: 0; }.live-status-panel .status-note { margin: 10px; }.live-actions--five, .live-actions--four { grid-template-columns: repeat(2, minmax(0, 1fr)); }.live-actions--five .import-button, .live-actions--four .import-button { grid-column: 1 / -1; } }
</style>
