<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronDown, ChevronUp, FileAudio, Image, Plus, Trash2, Type, Video, Volume2 } from '@lucide/vue';
import { createProjectSceneLayer, type ProjectLayerKind, type ProjectMediaKind, type ProjectMediaReference, type ProjectRecord, type ProjectSceneLayer } from '../shared/contracts/projects';

const route = useRoute();
const project = ref<ProjectRecord | null>(null);
const layers = ref<ProjectSceneLayer[]>([]);
const mediaReferences = ref<ProjectMediaReference[]>([]);
const selectedLayerId = ref<string | null>(null);
const notice = ref('');
const saving = ref(false);
let sequence = 0;

const visualLayers = computed(() => layers.value.filter((layer) => layer.visible && layer.kind !== 'audio'));
const selectedLayer = computed(() => layers.value.find((layer) => layer.id === selectedLayerId.value) ?? null);

function layerIcon(kind: ProjectLayerKind) {
  if (kind === 'video' || kind === 'gif') return Video;
  if (kind === 'audio') return Volume2;
  if (kind === 'text') return Type;
  return Image;
}

function mediaFor(layer: ProjectSceneLayer): ProjectMediaReference | undefined {
  return mediaReferences.value.find((reference) => reference.id === layer.source.mediaReferenceId);
}

function mediaUrl(reference: ProjectMediaReference): string {
  return `file:///${reference.path.replace(/\\/g, '/')}`;
}

function createLayer(name: string, kind: ProjectLayerKind, mediaReferenceId: string | null = null): ProjectSceneLayer {
  sequence += 1;
  return createProjectSceneLayer(`studio-${Date.now()}-${sequence}`, name, kind, {
    type: mediaReferenceId ? 'media' : kind === 'text' ? 'text' : 'none',
    assetId: null,
    mediaReferenceId,
  });
}

async function persist(): Promise<void> {
  if (!project.value) return;
  saving.value = true;
  try {
    project.value = await globalThis.window.desktopApi.projects.saveScene(project.value.id, {
      ...project.value.scene,
      layers: layers.value,
      mediaReferences: mediaReferences.value,
    });
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'Khong the luu thay doi.';
  } finally {
    saving.value = false;
  }
}

async function addMedia(kind: ProjectMediaKind): Promise<void> {
  const label = kind === 'video' ? 'Video livestream' : kind === 'image' ? 'Banner livestream' : 'Am thanh livestream';
  const reference = await globalThis.window.desktopApi.media.pick(kind, label);
  if (!reference) return;
  mediaReferences.value = [...mediaReferences.value, reference];
  const layer = createLayer(reference.label.replace(/\.[^.]+$/, ''), kind, reference.id);
  layer.muted = kind === 'video';
  layers.value = [...layers.value, layer];
  selectedLayerId.value = layer.id;
  notice.value = `Da them ${kind === 'image' ? 'banner/hinh' : kind}.`;
  await persist();
}

async function addText(): Promise<void> {
  const layer = createLayer('Noi dung cua ban', 'text');
  layers.value = [...layers.value, layer];
  selectedLayerId.value = layer.id;
  notice.value = 'Da them lop van ban.';
  await persist();
}

async function removeLayer(id: string): Promise<void> {
  const removed = layers.value.find((layer) => layer.id === id);
  layers.value = layers.value.filter((layer) => layer.id !== id);
  if (selectedLayerId.value === id) selectedLayerId.value = layers.value[layers.value.length - 1]?.id ?? null;
  notice.value = removed ? `Da xoa ${removed.name}.` : '';
  await persist();
}

async function moveLayer(id: string, direction: -1 | 1): Promise<void> {
  const index = layers.value.findIndex((layer) => layer.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= layers.value.length) return;
  const updated = [...layers.value];
  [updated[index], updated[next]] = [updated[next]!, updated[index]!];
  layers.value = updated;
  await persist();
}

async function toggleVisibility(layer: ProjectSceneLayer): Promise<void> {
  layer.visible = !layer.visible;
  layers.value = [...layers.value];
  await persist();
}

async function updateSelectedName(value: string): Promise<void> {
  if (!selectedLayer.value) return;
  selectedLayer.value.name = value.slice(0, 120) || 'Khong ten';
  layers.value = [...layers.value];
  await persist();
}

onMounted(async () => {
  const id = String(route.params.projectId ?? '');
  const loaded = await globalThis.window.desktopApi.projects.get(id);
  if (!loaded) {
    notice.value = 'Khong tim thay du an.';
    return;
  }
  project.value = loaded;
  layers.value = loaded.scene.layers;
  mediaReferences.value = loaded.scene.mediaReferences;
  selectedLayerId.value = layers.value[layers.value.length - 1]?.id ?? null;
});
</script>

<template>
  <main class="studio-recovery-page">
    <header class="studio-topbar">
      <div>
        <RouterLink to="/" class="back-link">Du an</RouterLink>
        <h1>{{ project?.title ?? 'Dang mo Studio...' }}</h1>
      </div>
      <span class="save-state">{{ saving ? 'Dang luu...' : 'Tu dong luu' }}</span>
    </header>

    <section class="studio-workspace">
      <aside class="media-rail" aria-label="Them nguon livestream">
        <div class="rail-heading">
          <h2>Nguon</h2>
          <p>Chon noi dung de dua len khung live.</p>
        </div>
        <div class="add-source-grid">
          <button type="button" class="add-source video" @click="addMedia('video')"><Video :size="19" /><span>Tai video</span><small>MP4, MOV, WebM</small></button>
          <button type="button" class="add-source image" @click="addMedia('image')"><Image :size="19" /><span>Tai banner</span><small>PNG, JPG, WebP</small></button>
          <button type="button" class="add-source text" @click="addText"><Type :size="19" /><span>Them chu</span><small>Gia, uu dai, CTA</small></button>
          <button type="button" class="add-source audio" @click="addMedia('audio')"><FileAudio :size="19" /><span>Tai am thanh</span><small>MP3, WAV, M4A</small></button>
        </div>
        <p class="source-tip">Video va banner se duoc luu theo du an. Keo thu tu nguon de doi lop tren khung live.</p>
      </aside>

      <section class="preview-region" aria-label="Xem truoc khung livestream">
        <div class="preview-head"><span>Khung hinh 9:16</span><span>{{ visualLayers.length }} nguon hien thi</span></div>
        <div class="live-frame">
          <template v-if="visualLayers.length">
            <div v-for="(layer, index) in visualLayers" :key="layer.id" class="preview-layer" :class="`kind-${layer.kind}`" :style="{ zIndex: index + 1, opacity: layer.opacity }">
              <img v-if="layer.kind === 'image' && mediaFor(layer)" :src="mediaUrl(mediaFor(layer)!)" :alt="layer.name" />
              <video v-else-if="(layer.kind === 'video' || layer.kind === 'gif') && mediaFor(layer)" :src="mediaUrl(mediaFor(layer)!)" :muted="layer.muted" :loop="layer.loop" autoplay playsinline />
              <p v-else-if="layer.kind === 'text'">{{ layer.name }}</p>
            </div>
          </template>
          <div v-else class="empty-frame"><Image :size="34" /><strong>Khung live dang trong</strong><span>Tai video hoac banner de bat dau.</span><button type="button" @click="addMedia('video')"><Plus :size="15" />Tai video</button></div>
        </div>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      </section>

      <aside class="layers-rail" aria-label="Danh sach nguon">
        <div class="layers-heading"><h2>Danh sach nguon</h2><span>{{ layers.length }}</span></div>
        <div v-if="selectedLayer" class="layer-name-editor"><label for="layer-name">Ten nguon</label><input id="layer-name" :value="selectedLayer.name" @change="updateSelectedName(($event.target as HTMLInputElement).value)" /></div>
        <div v-if="layers.length" class="layers-list">
          <article v-for="(layer, index) in layers" :key="layer.id" :class="['layer-row', { selected: selectedLayerId === layer.id, hidden: !layer.visible }]" @click="selectedLayerId = layer.id">
            <component :is="layerIcon(layer.kind)" :size="16" />
            <span><strong>{{ layer.name }}</strong><small>{{ layer.kind === 'image' ? 'Banner / hinh' : layer.kind }}</small></span>
            <div class="layer-actions" @click.stop>
              <button type="button" :aria-label="layer.visible ? 'An nguon' : 'Hien nguon'" @click="toggleVisibility(layer)">{{ layer.visible ? 'An' : 'Hien' }}</button>
              <button type="button" aria-label="Dua len tren" :disabled="index === layers.length - 1" @click="moveLayer(layer.id, 1)"><ChevronUp :size="14" /></button>
              <button type="button" aria-label="Dua xuong duoi" :disabled="index === 0" @click="moveLayer(layer.id, -1)"><ChevronDown :size="14" /></button>
              <button type="button" class="delete" aria-label="Xoa nguon" @click="removeLayer(layer.id)"><Trash2 :size="14" /></button>
            </div>
          </article>
        </div>
        <div v-else class="layers-empty">Chua co nguon. Them video, banner hoac chu o cot ben trai.</div>
        <div class="output-card"><div><strong>San sang cho OBS</strong><span>Khung nay se la noi dung Browser Source.</span></div><button type="button" @click="notice = 'Mo Cai dat livestream de ket noi OBS WebSocket.'">Cai dat OBS</button></div>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.studio-recovery-page { --ink: #f8fafc; --muted: #98a2b3; --line: rgba(255,255,255,.1); --panel: #121823; --accent: #ff5a36; min-height: 100vh; color: var(--ink); background: radial-gradient(circle at 50% -20%, #263447 0, #10151e 40%, #090c12 76%); font-family: "Trebuchet MS", "Segoe UI", sans-serif; }
.studio-topbar { display: flex; align-items: center; justify-content: space-between; padding: 20px 30px; border-bottom: 1px solid var(--line); background: rgba(8,11,16,.75); }.studio-topbar h1 { margin: 4px 0 0; font-size: 19px; }.back-link { color: #bfc7d4; font-size: 12px; text-decoration: none; }.save-state { color: #a7f3d0; font-size: 12px; }
.studio-workspace { display: grid; grid-template-columns: minmax(240px, 290px) minmax(420px, 1fr) minmax(270px, 320px); gap: 18px; max-width: 1500px; margin: 0 auto; padding: 22px; }.media-rail, .layers-rail { align-self: start; border: 1px solid var(--line); border-radius: 18px; background: rgba(18,24,35,.92); box-shadow: 0 16px 45px rgba(0,0,0,.18); }.rail-heading, .layers-heading { padding: 18px 18px 10px; }.rail-heading h2, .layers-heading h2 { margin: 0; font-size: 15px; }.rail-heading p, .source-tip, .layers-empty, .output-card span { color: var(--muted); font-size: 12px; line-height: 1.45; }.rail-heading p { margin: 7px 0 0; }.add-source-grid { display: grid; gap: 8px; padding: 10px 12px; }.add-source { display: grid; grid-template-columns: 28px 1fr; align-items: center; gap: 2px 8px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; color: var(--ink); text-align: left; cursor: pointer; transition: transform .16s ease, border-color .16s ease; }.add-source:hover { transform: translateY(-1px); border-color: currentColor; }.add-source svg { grid-row: span 2; }.add-source span { font-size: 13px; font-weight: 800; }.add-source small { color: var(--muted); font-size: 10px; }.video { background: #182946; color: #9ac4ff; }.image { background: #282046; color: #d2b6ff; }.text { background: #153b36; color: #9de5d4; }.audio { background: #42251c; color: #ffba99; }.source-tip { margin: 5px 18px 18px; }
.preview-region { display: grid; justify-items: center; align-content: start; gap: 12px; }.preview-head { display: flex; width: min(100%, 540px); justify-content: space-between; color: var(--muted); font-size: 12px; }.live-frame { position: relative; width: min(100%, 450px); aspect-ratio: 9 / 16; overflow: hidden; border: 1px solid rgba(255,255,255,.17); border-radius: 23px; background: repeating-linear-gradient(45deg, #151b26 0 15px, #111721 15px 30px); box-shadow: 0 28px 70px rgba(0,0,0,.35); }.preview-layer { position: absolute; inset: 0; display: grid; place-items: center; }.preview-layer img, .preview-layer video { width: 100%; height: 100%; object-fit: contain; }.preview-layer.kind-text { inset: auto 9% 12%; }.preview-layer p { margin: 0; color: white; font-size: clamp(22px, 4vw, 42px); font-weight: 900; text-align: center; text-shadow: 0 3px 14px #000; }.empty-frame { display: grid; height: 100%; place-content: center; gap: 10px; color: var(--muted); text-align: center; }.empty-frame strong { color: var(--ink); }.empty-frame button, .output-card button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; margin: 4px auto 0; border: 0; border-radius: 8px; padding: 9px 12px; color: white; background: var(--accent); font-weight: 800; cursor: pointer; }.notice { margin: 0; color: #b9f5d4; font-size: 12px; }
.layers-heading { display: flex; align-items: center; justify-content: space-between; }.layers-heading span { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 50%; background: #283446; color: #dbeafe; font-size: 11px; }.layer-name-editor { display: grid; gap: 6px; padding: 0 13px 13px; border-bottom: 1px solid var(--line); }.layer-name-editor label { color: var(--muted); font-size: 10px; }.layer-name-editor input { min-width: 0; border: 1px solid var(--line); border-radius: 7px; padding: 8px; color: var(--ink); background: #0b1018; }.layers-list { display: grid; gap: 5px; max-height: 52vh; overflow: auto; padding: 10px; }.layer-row { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 9px; border: 1px solid transparent; border-radius: 10px; color: #cbd5e1; cursor: pointer; }.layer-row:hover, .layer-row.selected { border-color: #4f6480; background: #1d2838; }.layer-row.hidden { opacity: .52; }.layer-row span { min-width: 0; }.layer-row strong, .layer-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.layer-row strong { font-size: 11px; }.layer-row small { margin-top: 2px; color: var(--muted); font-size: 10px; }.layer-actions { display: flex; gap: 2px; }.layer-actions button { display: grid; width: 24px; height: 24px; place-items: center; border: 0; border-radius: 5px; color: #aeb8c7; background: transparent; cursor: pointer; font-size: 9px; }.layer-actions button:hover:not(:disabled) { color: white; background: #33455d; }.layer-actions button:disabled { opacity: .25; cursor: default; }.layer-actions .delete:hover { background: #8d342d; }.layers-empty { padding: 18px; }.output-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px; padding: 13px; border-radius: 12px; background: #17251f; }.output-card strong, .output-card span { display: block; }.output-card strong { font-size: 11px; }.output-card span { margin-top: 3px; font-size: 10px; }.output-card button { flex: 0 0 auto; margin: 0; background: #2d7d56; font-size: 10px; }
@media (max-width: 980px) { .studio-workspace { grid-template-columns: 1fr; }.media-rail, .layers-rail { width: min(100%, 680px); justify-self: center; }.add-source-grid { grid-template-columns: repeat(2, 1fr); }.layers-list { max-height: none; }.live-frame { width: min(88vw, 450px); } }
@media (max-width: 520px) { .studio-topbar { padding: 15px; }.studio-workspace { padding: 12px; }.add-source-grid { grid-template-columns: 1fr; }.add-source { min-height: 56px; }.layer-actions button:nth-child(2), .layer-actions button:nth-child(3) { display: none; } }
</style>
