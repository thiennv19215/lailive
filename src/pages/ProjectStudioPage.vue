<script setup lang="ts">
/* global Event, HTMLElement, HTMLImageElement, PointerEvent */
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Check,
  ChevronDown,
  MonitorUp,
  Plus,
  X,
} from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import beautyCream from '../assets/mock/beauty-cream.jpg';
import beautyModel from '../assets/mock/beauty-model.jpg';
import beautyStudio from '../assets/mock/beauty-studio.jpg';
import flowerGif from '../assets/mock/flower.gif';
import templateHost from '../assets/mock/template-host-v2.jpg';
import stickerFreeship from '../assets/defaults/sticker-freeship.svg';
import stickerHotDeal from '../assets/defaults/sticker-hot-deal.svg';
import stickerLiveOnly from '../assets/defaults/sticker-live-only.svg';
import stickerSale50 from '../assets/defaults/sticker-sale-50.svg';
import {
  DEFAULT_STUDIO_TEXT_STYLE,
  applyTextStylePreset,
  normalizeTextStyle,
  type TextAlignment,
  type TextStylePreset,
  type StudioTextStyle,
} from '../shared/studio/text-style';
import {
  DEFAULT_LAYER_TRANSFORM,
  reorderLayer,
  resizeLayer,
  rotateLayer,
  translateLayer,
  type LayerOrderAction,
  type LayerTransform,
  type ResizeHandle,
} from '../shared/studio/layer-transform';
import { fitContainedPreviewBox, isPreviewRenderable, previewLayerBox, previewLayerStyle, resolvePreviewSource } from '../shared/studio/preview';
import { ensureUniqueLayerIds } from '../shared/studio/layer-identity';
import { PROJECT_SCHEMA_VERSION, createEmptyScene, createProjectSceneLayer, type AvatarVideoState, type ProjectMediaReference, type ProjectMediaStatus, type PreparedScriptRole, type ProjectSceneDocument, type ProjectSceneLayer, type ProjectTriggerEvent } from '../shared/contracts/projects';
import type { ObsConfigInput, ObsStatus } from '../shared/contracts/obs';
import type { AvatarSpeechState } from '../shared/contracts/queue';
import SceneMediaLayer from '../components/SceneMediaLayer.vue';
import StudioAssetBrowser from '../components/studio/StudioAssetBrowser.vue';
import StudioInspectorSidebar from '../components/studio/StudioInspectorSidebar.vue';
import StudioMixerFooter from '../components/studio/StudioMixerFooter.vue';
import StudioPlaylistPanel from '../components/studio/StudioPlaylistPanel.vue';
import StudioSourcePanel from '../components/studio/StudioSourcePanel.vue';
import StudioToolRail from '../components/studio/StudioToolRail.vue';
import { useStudioPlayback } from '../composables/useStudioPlayback';
import { AvatarVideoStateManager, type AvatarVideoSnapshot } from '../modules/playback/avatar-video-state-manager';

type ToolName = 'Avatar' | 'Hình nền' | 'Video' | 'Hình dán' | 'Văn bản';
type DialogName = 'livestream' | 'export' | 'start' | null;
type LayerKind = ProjectSceneLayer['kind'];
type StudioLayer = ProjectSceneLayer;
type TransformMode = 'move' | 'rotate' | `resize-${ResizeHandle}`;
type TransformInteraction = {
  layerId: string;
  mode: TransformMode;
  startX: number;
  startY: number;
  startAngle: number;
  centerX: number;
  centerY: number;
  boxWidth: number;
  boxHeight: number;
  posterWidth: number;
  posterHeight: number;
  transform: LayerTransform;
};

function createLayer(name: string, kind: LayerKind, source?: ProjectSceneLayer['source']): StudioLayer {
  return createProjectSceneLayer(`layer-${globalThis.crypto.randomUUID()}`, name, kind, source);
}

const activeTool = ref<ToolName>('Avatar');
const route = useRoute();
const projectTitle = ref('Perfume 11:48:42 PM');
const projectLoaded = ref(false);
const hydratingProject = ref(true);
const persistedScene = ref<ProjectSceneDocument>(createEmptyScene());
const autosaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const dialog = ref<DialogName>(null);
const savingProject = ref(false);
const avatarLibraryOpen = ref(false);
const avatarAddOpen = ref(false);
const preparedScriptsOpen = ref(false);
const scriptDialogOpen = ref(false);
const avatarScriptsDraft = ref<string[] | null>(null);
const scenePosterElement = ref<HTMLElement | null>(null);
const avatarName = ref('');
const avatarVideoName = ref('');
const avatarMediaKind = ref<ProjectMediaReference['kind']>('video');
const notice = ref('');
// This is a preview override only; automated TTS will own this state later.
const avatarPreviewState = ref<AvatarSpeechState>('idle');
const avatarVideoManager = new AvatarVideoStateManager();
const avatarVideoSnapshot = ref<AvatarVideoSnapshot>(avatarVideoManager.snapshot());
const tiktokUsername = ref('');
const voice = ref('Mỹ Dung');
const voiceMenuOpen = ref(false);
const globalCooldown = ref(2);
const userCooldown = ref(30);
const minimumPinTime = ref(60);
const productPinEnabled = ref(false);
const activeLayerIndex = ref<number | null>(null);
const textStyle = reactive({ ...DEFAULT_STUDIO_TEXT_STYLE });
const activeTextPresetId = ref<string | null>('preset-1');
const textFocusRequest = ref(0);
const imageRadius = ref(0);
const removeImageBackground = ref(false);
const backgroundColor = ref('#07911d');
const backgroundSensitivity = ref(32);
const productSource = ref<'manual' | 'manager'>('manual');
const productLink = ref('');
const scriptProducts = ref([{ name: '', information: '' }]);
const textHistoryPast = ref<StudioTextStyle[]>([]);
const textHistoryFuture = ref<StudioTextStyle[]>([]);
let textEditSnapshot: StudioTextStyle | null = null;
let textEditCommitted = false;
const imageHistoryPast = ref<number[]>([]);
const imageHistoryFuture = ref<number[]>([]);
const avatarHistoryPast = ref<string[][]>([]);
const avatarHistoryFuture = ref<string[][]>([]);
let imageEditSnapshot: number | null = null;
const avatarScripts = ref(['']);
const mediaReferences = ref<ProjectMediaReference[]>([]);
const videoSources = ref<Record<string, string>>({});
const imageSources = ref<Record<string, string>>({});
const mediaStatuses = ref<ProjectMediaStatus[]>([]);
const pendingAvatarMedia = ref<ProjectMediaReference | null>(null);
const audioSources = ref<Record<string, string>>({});
const obsConfig = reactive<ObsConfigInput>({
  kind: 'obs-websocket',
  host: '127.0.0.1',
  port: 4455,
  sceneName: 'AI Livestream',
  sourceName: 'AI Livestream Browser',
  width: 1080,
  height: 1920,
  fps: 30,
  password: '',
});
const obsStatus = ref<ObsStatus>({
  connected: false,
  kind: 'obs-websocket',
  version: null,
  sceneName: 'AI Livestream',
  sourceName: 'AI Livestream Browser',
  browserSourceReady: false,
  programSceneActive: false,
  virtualCameraAvailable: false,
  virtualCameraActive: false,
  virtualCameraOwned: false,
  lastError: null,
});
const obsMessage = ref('Chưa kết nối OBS.');
const obsBusy = ref(false);
const obsHasSavedPassword = ref(false);
const previewMediaAspectRatios = ref<Record<string, number>>({});
const pinManagerState = ref<'closed' | 'checking' | 'login-required'>('closed');
let pinManagerTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let autosaveTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let transformInteraction: TransformInteraction | null = null;
const triggers = ref([
  { event: 'chat' as ProjectTriggerEvent, label: '💬 Bình luận', enabled: true, reply: 'Phát giọng nói' },
  { event: 'gift' as ProjectTriggerEvent, label: '🎁 Tặng quà', enabled: true, reply: 'Phát giọng nói' },
  { event: 'like' as ProjectTriggerEvent, label: '❤️ Thích', enabled: false, reply: 'Phát giọng nói' },
  { event: 'follow' as ProjectTriggerEvent, label: '👤 Theo dõi', enabled: true, reply: 'Phát giọng nói' },
  { event: 'share' as ProjectTriggerEvent, label: '🔁 Chia sẻ', enabled: true, reply: 'Phát giọng nói' },
]);
const layers = ref<StudioLayer[]>([
  createLayer('1', 'image'),
  createLayer('10', 'image'),
  createLayer('44', 'image'),
  createLayer('text', 'text'),
  createLayer('text', 'text'),
  createLayer('text', 'text'),
  createLayer('text', 'text'),
  createLayer('45', 'image'),
  createLayer('53', 'image'),
  createLayer('20', 'image'),
  createLayer('Chinese Beauty Sale 3', 'avatar'),
  createLayer('22', 'image'),
]);

const {
  snapshot: playlistSnapshot,
  scripts: preparedScripts,
  sync: syncPlaybackController,
  publish: publishPlayback,
  toggle: togglePlaylist,
  add: addPreparedScript,
  remove: removePreparedScript,
  move: movePreparedScript,
  startSequence: playbackStart,
  playScript: playbackPlayScript,
  playRole: playbackPlayRole,
  pause: playbackPause,
  resume: playbackResume,
  skip: playbackSkip,
  stop: playbackStop,
  ready: playbackReady,
  ended: playbackEnded,
  error: playbackError,
} = useStudioPlayback({
  scene: persistedScene,
  layers,
  mediaStatuses,
  projectLoaded,
  avatarState: avatarPreviewState,
  avatarVideo: avatarVideoSnapshot,
  buildSceneDocument,
  onPublishError: (message) => { notice.value = message.startsWith('Playlist') ? message : `Không đồng bộ Browser Source: ${message}`; },
});

const voiceOptions = ['Mỹ Dung', 'Minh Anh', 'Ngọc Lam'];
const unsubscribeAvatarVideo = avatarVideoManager.subscribe((snapshot) => {
  avatarVideoSnapshot.value = snapshot;
  void publishPlayback();
});
const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const primaryAction = computed(() => {
  const labels: Record<ToolName, string> = {
    Avatar: 'Thêm avatar',
    'Hình nền': 'Thêm hình nền',
    Video: 'Thêm video',
    'Hình dán': 'Thêm hình dán',
    'Văn bản': 'Thêm văn bản',
  };
  return labels[activeTool.value];
});

const pinManagerStatus = computed(() => {
  if (pinManagerState.value === 'checking') return 'Đang mở TikTok Live Manager';
  if (pinManagerState.value === 'login-required') return 'Đang chờ đăng nhập · Không có sản phẩm';
  return 'Chưa mở TikTok Live Manager';
});

const activeLayer = computed(() => (
  activeLayerIndex.value === null ? null : layers.value[activeLayerIndex.value] ?? null
));
const missingMedia = computed(() => {
  const usedReferenceIds = new Set(
    layers.value
      .map((layer) => layer.source.mediaReferenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  return mediaStatuses.value.filter((reference) => !reference.exists && usedReferenceIds.has(reference.id));
});
const loadedPreviewMediaIds = computed(() => new Set([
  ...Object.keys(imageSources.value),
  ...Object.keys(videoSources.value),
  ...Object.keys(audioSources.value),
]));
const previewRenderableLayers = computed(() => layers.value.filter((layer) => (
  layer.kind !== 'audio' && isPreviewRenderable(layer, loadedPreviewMediaIds.value)
)));
const previewImageLayers = computed(() => previewRenderableLayers.value.filter((layer) => layer.kind === 'image' || layer.kind === 'avatar'));

const activeTransform = computed(() => activeLayer.value?.transform ?? DEFAULT_LAYER_TRANSFORM);
const activeSelectionBox = computed(() => {
  const layer = activeLayer.value;
  if (!layer) return { left: 0, top: 0, width: 100, height: 100 };
  if (layer.kind === 'text') return previewLayerBox(layer);

  const box = previewLayerBox(layer, previewImageLayers.value.indexOf(layer));
  const sourceAspectRatio = previewMediaAspectRatios.value[layer.id];
  if (layer.fitMode !== 'contain' || !sourceAspectRatio) return box;
  return fitContainedPreviewBox(box, sourceAspectRatio, persistedScene.value.width / persistedScene.value.height);
});
const selectionStyle = computed(() => {
  const box = activeSelectionBox.value;
  const transform = activeTransform.value;
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
    transform: `translate(${(transform.x / box.width) * 100}%, ${(transform.y / box.height) * 100}%) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
  };
});

const sceneTextStyle = computed(() => ({
  color: textStyle.color,
  fontFamily: textStyle.font === DEFAULT_STUDIO_TEXT_STYLE.font ? 'inherit' : `'${textStyle.font}', sans-serif`,
  fontSize: `${Math.round((textStyle.size / DEFAULT_STUDIO_TEXT_STYLE.size) * 25)}px`,
  fontStyle: textStyle.italic ? 'italic' : 'normal',
  fontWeight: textStyle.bold ? '700' : '400',
  textAlign: textStyle.align,
}));


onBeforeUnmount(() => {
  if (pinManagerTimer !== null) globalThis.clearTimeout(pinManagerTimer);
  if (autosaveTimer !== null) globalThis.clearTimeout(autosaveTimer);
  stopLayerTransform();
  avatarVideoManager.dispose();
  unsubscribeAvatarVideo();
});

onMounted(async () => {
  const projectId = String(route.params.projectId ?? '');
  const project = await globalThis.window.desktopApi.projects.get(projectId).catch(() => null);
  let repairedDuplicateLayerIds = false;
  if (project) {
    projectTitle.value = project.title;
    persistedScene.value = clonePlain(project.scene);
    const normalizedLayers = ensureUniqueLayerIds(project.scene.layers);
    repairedDuplicateLayerIds = normalizedLayers.changed;
    persistedScene.value.layers = clonePlain(normalizedLayers.layers);
    if (normalizedLayers.layers.length > 0) layers.value = normalizedLayers.layers.map((layer) => ({ ...layer, transform: { ...layer.transform } }));
    Object.assign(textStyle, normalizeTextStyle(project.scene.textStyle));
    imageRadius.value = project.scene.imageSettings.radius;
    removeImageBackground.value = project.scene.imageSettings.removeBackground;
    backgroundColor.value = project.scene.imageSettings.backgroundColor;
    backgroundSensitivity.value = project.scene.imageSettings.backgroundSensitivity;
    productSource.value = project.scene.avatarSettings.productSource;
    productLink.value = project.scene.avatarSettings.productLink;
    scriptProducts.value = clonePlain(project.scene.avatarSettings.products);
    avatarScripts.value = [...project.scene.avatarSettings.scripts];
    tiktokUsername.value = project.scene.livestreamSettings.tiktokUsername;
    voice.value = project.scene.livestreamSettings.voice;
    globalCooldown.value = project.scene.livestreamSettings.globalCooldown;
    userCooldown.value = project.scene.livestreamSettings.userCooldown;
    minimumPinTime.value = project.scene.livestreamSettings.minimumPinTime;
    productPinEnabled.value = project.scene.livestreamSettings.productPinEnabled;
    for (const trigger of triggers.value) {
      const saved = project.scene.livestreamSettings.triggers.find((candidate) => candidate.event === trigger.event);
      if (saved) trigger.enabled = saved.enabled;
    }
    mediaReferences.value = clonePlain(project.scene.mediaReferences);
    syncAvatarVideoStates();
    projectLoaded.value = true;
    autosaveStatus.value = 'saved';
    await refreshMediaStatus();
    await loadMediaSources();
    syncPlaybackController();
    await publishPlayback();
  }
  else notice.value = 'Không tìm thấy dữ liệu dự án local; đang mở scene mock an toàn.';
  await nextTick();
  hydratingProject.value = false;
  if (repairedDuplicateLayerIds) {
    notice.value = 'Đã sửa ID nguồn bị trùng để trình chỉnh sửa hoạt động ổn định.';
    await saveSceneNow();
  }
  await loadObsState();
});

onBeforeRouteLeave(async () => {
  if (autosaveStatus.value !== 'idle' && autosaveStatus.value !== 'saving') return true;
  savingProject.value = true;
  await Promise.all([
    saveSceneNow(),
    new Promise((resolve) => globalThis.setTimeout(resolve, 450)),
  ]);
  return true;
});

watch([
  layers,
  () => ({ ...textStyle }),
  imageRadius,
  removeImageBackground,
  backgroundColor,
  backgroundSensitivity,
  productSource,
  productLink,
  scriptProducts,
  avatarScripts,
  tiktokUsername,
  voice,
  globalCooldown,
  userCooldown,
  minimumPinTime,
  productPinEnabled,
  triggers,
    mediaReferences,
  () => persistedScene.value.preparedScriptSettings,
], () => {
  if (!projectLoaded.value || hydratingProject.value) return;
  void publishPlayback();
  if (autosaveTimer !== null) globalThis.clearTimeout(autosaveTimer);
  autosaveStatus.value = 'idle';
  autosaveTimer = globalThis.setTimeout(() => { void saveSceneNow(); }, 350);
}, { deep: true });

function addLayer(label: string = activeTool.value): void {
  const kind: LayerKind = label === 'Flower GIF' ? 'gif' : label.includes('Avatar') ? 'avatar' : label.includes('Video') ? 'video' : label.includes('Văn bản') ? 'text' : 'image';
  const sourceName = label.includes(' - ') || label === 'Flower GIF' || ['FREESHIP', '-50%', 'LIVE ONLY', 'HOT DEAL'].includes(label)
    ? label
    : `${label} ${layers.value.length + 1}`;
  const builtinAsset = label === 'Flower GIF'
    ? 'flower-gif' as const
    : label.includes('Chinese Beauty Sale') || label.includes('Local presenter')
      ? 'template-host' as const
      : label.includes('Background - Product table')
        ? 'beauty-studio' as const
        : label === 'Hình nền'
          ? 'beauty-cream' as const
          : label === 'FREESHIP' ? 'sticker-freeship' as const
            : label === 'HOT DEAL' ? 'sticker-hot-deal' as const
              : label === 'LIVE ONLY' ? 'sticker-live-only' as const
                : label === '-50%' ? 'sticker-sale-50' as const
                  : null;
  const source = builtinAsset
    ? { type: 'builtin' as const, assetId: builtinAsset, mediaReferenceId: null }
    : kind === 'text'
      ? { type: 'text' as const, assetId: null, mediaReferenceId: null }
      : { type: 'none' as const, assetId: null, mediaReferenceId: null };
  layers.value.unshift(createLayer(sourceName, kind, source));
  if (builtinAsset) notice.value = `Đã thêm nguồn ${sourceName} vào canvas.`;
  activeLayerIndex.value = 0;
  if (kind === 'text') textFocusRequest.value += 1;
  notice.value = `Đã thêm ${label.toLowerCase()} vào canvas.`;
}

async function addLocalAudio(): Promise<void> {
  const reference = await globalThis.window.desktopApi.media.pick('audio', 'Thêm audio');
  if (!reference) { notice.value = 'Chưa chọn audio local.'; return; }
  const dataUrl = await globalThis.window.desktopApi.media.read(JSON.parse(JSON.stringify(reference)) as ProjectMediaReference);
  mediaReferences.value.push(reference);
  const layer = createLayer(reference.label, 'audio', { type: 'media', assetId: null, mediaReferenceId: reference.id });
  layers.value.unshift(layer);
  activeLayerIndex.value = 0;
  if (dataUrl) audioSources.value = { ...audioSources.value, [reference.id]: dataUrl };
  await refreshMediaStatus();
  notice.value = `Đã thêm audio ${reference.label} vào canvas.`;
}

async function addLocalVideo(): Promise<void> {
  const reference = await globalThis.window.desktopApi.media.pick('video', 'Thêm video');
  if (!reference) {
    notice.value = 'Chưa chọn video local.';
    return;
  }
  const dataUrl = await globalThis.window.desktopApi.media.read(JSON.parse(JSON.stringify(reference)) as ProjectMediaReference);
  mediaReferences.value.push(reference);
  const layer = createLayer(reference.label, 'video', { type: 'media', assetId: null, mediaReferenceId: reference.id });
  layers.value.unshift(layer);
  activeLayerIndex.value = 0;
  if (dataUrl) videoSources.value = { ...videoSources.value, [reference.id]: dataUrl };
  await refreshMediaStatus();
  notice.value = `Đã thêm video ${reference.label} vào canvas.`;
}

async function addLocalImage(): Promise<void> {
  const reference = await globalThis.window.desktopApi.media.pick('image', 'Thêm ảnh');
  if (!reference) {
    notice.value = 'Chưa chọn ảnh local.';
    return;
  }
  const dataUrl = await globalThis.window.desktopApi.media.read(JSON.parse(JSON.stringify(reference)) as ProjectMediaReference);
  mediaReferences.value.push(reference);
  const layer = createLayer(reference.label, 'image', { type: 'media', assetId: null, mediaReferenceId: reference.id });
  layers.value.unshift(layer);
  activeLayerIndex.value = 0;
  if (dataUrl) imageSources.value = { ...imageSources.value, [reference.id]: dataUrl };
  await refreshMediaStatus();
  notice.value = `Đã thêm ảnh ${reference.label} vào canvas.`;
}

async function loadMediaSources(): Promise<void> {
  const entries = await Promise.all(mediaReferences.value
    .filter((reference) => reference.kind === 'image' || reference.kind === 'video' || reference.kind === 'audio')
    .map(async (reference) => [reference, await globalThis.window.desktopApi.media.read(JSON.parse(JSON.stringify(reference)) as ProjectMediaReference)] as const));
  const loadedImages: Record<string, string> = {};
  const loadedVideos: Record<string, string> = {};
  const loadedAudio: Record<string, string> = {};
  for (const [reference, dataUrl] of entries) {
    if (!dataUrl) continue;
    if (reference.kind === 'image') loadedImages[reference.id] = dataUrl;
    if (reference.kind === 'video') loadedVideos[reference.id] = dataUrl;
    if (reference.kind === 'audio') loadedAudio[reference.id] = dataUrl;
  }
  if (Object.keys(loadedImages).length) imageSources.value = { ...imageSources.value, ...loadedImages };
  if (Object.keys(loadedVideos).length) videoSources.value = { ...videoSources.value, ...loadedVideos };
  if (Object.keys(loadedAudio).length) audioSources.value = { ...audioSources.value, ...loadedAudio };
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

function removeLayer(index: number): void {
  layers.value.splice(index, 1);
  if (activeLayerIndex.value === index) activeLayerIndex.value = null;
  else if (activeLayerIndex.value !== null && activeLayerIndex.value > index) activeLayerIndex.value -= 1;
}

function sourceDisplayName(layer: StudioLayer): string {
  if (layer.kind === 'avatar' && /^Avatar \d+$/i.test(layer.name)) return 'Chinese Beauty Sale 3';
  return layer.name;
}

function selectLayer(layerId: string): void {
  const index = layers.value.findIndex((layer) => layer.id === layerId);
  if (index >= 0) activeLayerIndex.value = index;
}

function syncAvatarVideoStates(): void {
  avatarVideoManager.configure(layers.value
    .filter((layer) => layer.kind === 'avatar' && layer.avatarMotion)
    .map((layer) => [layer.avatarMotion!, layer.id] as [AvatarVideoState, string]));
}

function changeAvatarVideoState(state: AvatarVideoState): void {
  syncAvatarVideoStates();
  if (!avatarVideoManager.request(state)) notice.value = `Avatar ${state} is not ready or already playing.`;
}

function avatarMotionReady(layerId: string): void { avatarVideoManager.ready(layerId); }
function avatarMotionEnded(layerId: string): void { avatarVideoManager.ended(layerId); }

function previewLayerHitStyle(layer: StudioLayer, index: number): Record<string, string | number> {
  const imageIndex = previewImageLayers.value.indexOf(layer);
  const style = { ...previewLayerStyle(layer, index, imageIndex) };
  // Prepared scripts own visibility and only advance when the active media ends.
  const isManagedMedia = preparedScripts().some((script) => script.mediaLayerId === layer.id || script.audioLayerId === layer.id);
  const isManagedAvatar = preparedScripts().some((script) => script.avatarLayerId === layer.id);
  if (layer.kind === 'avatar' && layer.avatarMotion) {
    const motion = avatarVideoSnapshot.value;
    if (motion.pendingLayerId === layer.id) style.opacity = 0;
    else if (motion.activeLayerId !== layer.id && motion.previousLayerId !== layer.id) style.opacity = 0;
    return style;
  }
  if (isManagedMedia && playlistSnapshot.value.activeLayerId !== layer.id && playlistSnapshot.value.activeAudioLayerId !== layer.id) style.opacity = 0;
  if (isManagedAvatar && playlistSnapshot.value.activeAvatarLayerId !== layer.id) style.opacity = 0;
  return style;
}

async function pickAudioForPreparedScript(scriptId: string): Promise<void> {
  const script = preparedScripts().find((item) => item.id === scriptId);
  if (!script) return;
  const reference = await globalThis.window.desktopApi.media.pick('audio', `Audio cho ${script.name}`);
  if (!reference) return;
  const dataUrl = await globalThis.window.desktopApi.media.read(JSON.parse(JSON.stringify(reference)) as ProjectMediaReference);
  mediaReferences.value.push(reference);
  const layer = createLayer(reference.label, 'audio', { type: 'media', assetId: null, mediaReferenceId: reference.id });
  layers.value.unshift(layer);
  audioSources.value = dataUrl ? { ...audioSources.value, [reference.id]: dataUrl } : audioSources.value;
  script.playbackType = 'audio';
  script.mediaLayerId = layer.id;
  script.audioLayerId = null;
  await refreshMediaStatus();
  syncPlaybackController();
  notice.value = `Đã gán audio “${reference.label}” cho ${script.name}.`;
}

async function addAudioForActiveAvatar(layerId?: string): Promise<void> {
  const source = layerId ? layers.value.find((layer) => layer.id === layerId) : activeLayer.value;
  if (!source || !['video', 'audio', 'avatar'].includes(source.kind)) {
    notice.value = 'Chọn video, audio hoặc avatar trước khi nhập audio.';
    return;
  }
  const reference = await globalThis.window.desktopApi.media.pick('audio', `Audio cho ${source.name}`);
  if (!reference) return;
  const dataUrl = await globalThis.window.desktopApi.media.read(JSON.parse(JSON.stringify(reference)) as ProjectMediaReference);
  mediaReferences.value.push(reference);
  const layer = createLayer(reference.label, 'audio', { type: 'media', assetId: null, mediaReferenceId: reference.id });
  layers.value.unshift(layer);
  if (dataUrl) audioSources.value = { ...audioSources.value, [reference.id]: dataUrl };
  // Keep imported voice with the selected video so one Play controls both tracks.
  let script = source.kind === 'video'
    ? preparedScripts().find((item) => item.mediaLayerId === source.id && item.playbackType === 'video')
    : undefined;
  if (!script) {
    addPreparedScript('audio', layer.id);
    script = preparedScripts()[preparedScripts().length - 1];
  }
  if (script) {
    if (source.kind === 'video') script.audioLayerId = layer.id;
    if (source.kind === 'avatar') script.avatarLayerId = source.id;
    script.name = source.kind === 'video'
      ? `R${script.order + 1} - ${source.name} + ${reference.label}`
      : `R${script.order + 1} - Audio - ${source.name}`;
  }
  await refreshMediaStatus();
  syncPlaybackController();
  preparedScriptsOpen.value = true;
  notice.value = `Đã thêm audio “${reference.label}” vào kịch bản của ${source.name}. Bấm Phát để chạy.`;
}

function assignActiveSourceToRole(role: PreparedScriptRole, layerId?: string): void {
  const layer = layerId ? layers.value.find((item) => item.id === layerId) : activeLayer.value;
  if (!layer || !['video', 'audio', 'avatar'].includes(layer.kind)) {
    notice.value = 'Chọn một layer video, audio hoặc avatar trước khi gán vào kịch bản.';
    return;
  }
  let script = preparedScripts().find((item) => item.mediaLayerId === layer.id || item.avatarLayerId === layer.id);
  if (!script) {
    if (layer.kind === 'avatar') {
      addPreparedScript('tts');
      script = preparedScripts()[preparedScripts().length - 1];
      if (script) script.avatarLayerId = layer.id;
    } else if (layer.kind === 'video' || layer.kind === 'audio') {
      addPreparedScript(layer.kind, layer.id);
      script = preparedScripts()[preparedScripts().length - 1];
    }
  }
  if (!script) return;
  script.role = role;
  script.name = `R${script.order + 1} - ${role === 'idle' ? 'Chờ' : role === 'activation' ? 'Kích hoạt' : 'Đang nói'} - ${layer.name}`;
  if (role === 'idle') script.completionMode = 'resume-sequence';
  if (role === 'conversation') script.completionMode = 'resume-sequence';
  syncPlaybackController();
  notice.value = `Đã gán ${layer.name} vào chế độ ${role === 'idle' ? 'Chờ' : role === 'activation' ? 'Kích hoạt' : 'Đang nói'}.`;
}

function setAvatarPreviewState(state: AvatarSpeechState): void {
  avatarPreviewState.value = state;
  void publishPlayback();
  notice.value = state === 'talking' ? 'Avatar đang ở trạng thái nói để kiểm tra chuyển động.' : 'Avatar đã trở về trạng thái chờ.';
}

function setActiveAvatarLayerState(state: AvatarSpeechState): void {
  if (!activeLayer.value || activeLayer.value.kind !== 'avatar') return;
  activeLayer.value.avatarState = state;
}

function previewMediaSource(layer: StudioLayer): string | null {
  const source = resolvePreviewSource(layer, loadedPreviewMediaIds.value);
  if (!source) return null;
  if (source.type === 'builtin') {
    if (source.assetId === 'beauty-model') return beautyModel;
    if (source.assetId === 'beauty-studio') return beautyStudio;
    if (source.assetId === 'beauty-cream') return beautyCream;
    if (source.assetId === 'template-host') return templateHost;
    if (source.assetId === 'flower-gif') return flowerGif;
    if (source.assetId === 'sticker-freeship') return stickerFreeship;
    if (source.assetId === 'sticker-hot-deal') return stickerHotDeal;
    if (source.assetId === 'sticker-live-only') return stickerLiveOnly;
    if (source.assetId === 'sticker-sale-50') return stickerSale50;
    return null;
  }
  return imageSources.value[source.mediaReferenceId]
    ?? videoSources.value[source.mediaReferenceId]
    ?? null;
}

function previewMediaObjectFit(layer: StudioLayer): string {
  return layer.fitMode;
}

function capturePreviewMediaAspectRatio(layerId: string, event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  previewMediaAspectRatios.value = {
    ...previewMediaAspectRatios.value,
    [layerId]: image.naturalWidth / image.naturalHeight,
  };
}

function previewMediaLayers(): StudioLayer[] {
  return previewRenderableLayers.value.filter((layer) => layer.kind === 'video' || layer.kind === 'gif' || layer.kind === 'image' || layer.kind === 'avatar');
}

function previewUsesVideo(layer: StudioLayer): boolean {
  if (layer.kind === 'video') return true;
  if (layer.kind !== 'avatar' || layer.source.type !== 'media' || !layer.source.mediaReferenceId) return false;
  return mediaReferences.value.some((reference) => reference.id === layer.source.mediaReferenceId && reference.kind === 'video');
}

function buildSceneDocument(): ProjectSceneDocument {
  const base = clonePlain(persistedScene.value);
  base.manualPlaybackSettings = clonePlain(persistedScene.value.manualPlaybackSettings);
  base.preparedScriptSettings = clonePlain(persistedScene.value.preparedScriptSettings);
  return {
    ...base,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    canvasPreset: base.canvasPreset,
    width: base.width,
    height: base.height,
    layers: clonePlain(layers.value),
    textStyle: normalizeTextStyle(textStyle),
    imageSettings: {
      radius: imageRadius.value,
      removeBackground: removeImageBackground.value,
      backgroundColor: backgroundColor.value,
      backgroundSensitivity: backgroundSensitivity.value,
    },
    avatarSettings: {
      productSource: productSource.value,
      productLink: productLink.value,
      products: clonePlain(scriptProducts.value),
      scripts: [...avatarScripts.value],
    },
    livestreamSettings: {
      ...base.livestreamSettings,
      tiktokUsername: tiktokUsername.value,
      voice: voice.value,
      globalCooldown: globalCooldown.value,
      userCooldown: userCooldown.value,
      minimumPinTime: minimumPinTime.value,
      productPinEnabled: productPinEnabled.value,
      triggers: triggers.value.map((trigger) => ({ event: trigger.event, enabled: trigger.enabled, actionType: 'voice_tts' as const })),
    },
    manualPlaybackSettings: clonePlain(persistedScene.value.manualPlaybackSettings),
    preparedScriptSettings: clonePlain(persistedScene.value.preparedScriptSettings),
    mediaReferences: clonePlain(mediaReferences.value),
  };
}

async function saveSceneNow(): Promise<void> {
  if (!projectLoaded.value) return;
  if (autosaveTimer !== null) {
    globalThis.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  autosaveStatus.value = 'saving';
  try {
    const scene = JSON.parse(JSON.stringify(buildSceneDocument())) as ProjectSceneDocument;
    await globalThis.window.desktopApi.projects.saveScene(String(route.params.projectId), scene);
    autosaveStatus.value = 'saved';
  } catch (error) {
    autosaveStatus.value = 'error';
    notice.value = `Autosave failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function moveActiveLayer(action: LayerOrderAction): void {
  if (activeLayerIndex.value === null) return;
  const result = reorderLayer(layers.value, activeLayerIndex.value, action);
  layers.value = result.items;
  activeLayerIndex.value = result.index;
}

function nudgeActiveLayer(deltaX: number, deltaY: number): void {
  if (!activeLayer.value) return;
  activeLayer.value.transform = translateLayer(activeLayer.value.transform, deltaX, deltaY);
}

function beginLayerTransform(event: PointerEvent, mode: TransformMode): void {
  if (!activeLayer.value || !scenePosterElement.value) return;
  stopLayerTransform();
  const selection = (event.currentTarget as HTMLElement).closest('.scene-selection');
  if (!(selection instanceof HTMLElement)) return;
  const box = selection.getBoundingClientRect();
  const poster = scenePosterElement.value.getBoundingClientRect();
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  transformInteraction = {
    layerId: activeLayer.value.id,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
    centerX,
    centerY,
    boxWidth: box.width,
    boxHeight: box.height,
    posterWidth: poster.width,
    posterHeight: poster.height,
    transform: { ...activeLayer.value.transform },
  };
  globalThis.addEventListener('pointermove', updateLayerTransform);
  globalThis.addEventListener('pointerup', stopLayerTransform, { once: true });
}

function updateLayerTransform(event: PointerEvent): void {
  if (!transformInteraction) return;
  const layer = layers.value.find((candidate) => candidate.id === transformInteraction?.layerId);
  if (!layer) return;
  const deltaX = event.clientX - transformInteraction.startX;
  const deltaY = event.clientY - transformInteraction.startY;
  if (transformInteraction.mode === 'move') {
    layer.transform = translateLayer(
      transformInteraction.transform,
      deltaX / transformInteraction.posterWidth * 100,
      deltaY / transformInteraction.posterHeight * 100,
    );
  } else if (transformInteraction.mode === 'rotate') {
    const angle = Math.atan2(event.clientY - transformInteraction.centerY, event.clientX - transformInteraction.centerX) * 180 / Math.PI;
    layer.transform = rotateLayer(transformInteraction.transform, angle - transformInteraction.startAngle);
  } else {
    layer.transform = resizeLayer(
      transformInteraction.transform,
      transformInteraction.mode.replace('resize-', '') as ResizeHandle,
      deltaX / transformInteraction.boxWidth,
      deltaY / transformInteraction.boxHeight,
    );
  }
  // Replace the collection so the selection overlay re-renders during pointer drags.
  layers.value = [...layers.value];
}

function stopLayerTransform(): void {
  globalThis.removeEventListener('pointermove', updateLayerTransform);
  transformInteraction = null;
}

function addScriptProduct(): void {
  scriptProducts.value.push({ name: '', information: '' });
}

function addAvatarScript(): void {
  avatarScripts.value.push('');
}

function openAvatarScriptEditor(): void {
  avatarScriptsDraft.value = [...avatarScripts.value];
  scriptDialogOpen.value = true;
}

function cancelAvatarScriptEditor(): void {
  if (avatarScriptsDraft.value) avatarScripts.value = [...avatarScriptsDraft.value];
  avatarScriptsDraft.value = null;
  scriptDialogOpen.value = false;
}

function generateScriptMock(): void {
  notice.value = 'Tạo kịch bản AI cần adapter nhà cung cấp ở Phase 7; chưa gửi dữ liệu ra ngoài.';
}

function saveAvatarScripts(): void {
  if (avatarScriptsDraft.value && JSON.stringify(avatarScriptsDraft.value) !== JSON.stringify(avatarScripts.value)) {
    avatarHistoryPast.value.push([...avatarScriptsDraft.value]);
    avatarHistoryFuture.value = [];
  }
  avatarScriptsDraft.value = null;
  scriptDialogOpen.value = false;
  notice.value = 'Đã lưu kịch bản avatar trong phiên mock local.';
}

async function saveLivestreamSettings(): Promise<void> {
  try {
    const saved = await globalThis.window.desktopApi.obs.setConfig(obsConfigInput());
    obsHasSavedPassword.value = saved.hasPassword;
  } catch (error) {
    obsMessage.value = obsErrorMessage(error);
    return;
  }
  dialog.value = null;
  notice.value = 'Đã lưu cài đặt livestream và cấu hình OBS.';
}

function obsConfigInput(): ObsConfigInput {
  return JSON.parse(JSON.stringify({
    ...obsConfig,
    port: Number(obsConfig.port),
    width: Number(obsConfig.width),
    height: Number(obsConfig.height),
    fps: Number(obsConfig.fps),
    password: obsConfig.password || undefined,
  })) as ObsConfigInput;
}

function obsErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    OBS_CONNECT_FAILED: 'Không kết nối được OBS. Hãy mở OBS và bật WebSocket Server.',
    OBS_CONNECT_TIMEOUT: 'OBS không phản hồi. Kiểm tra port WebSocket (mặc định 4455).',
    OBS_CONNECTION_CLOSED: 'OBS đã đóng hoặc khởi động lại. Hãy mở OBS rồi kết nối lại.',
    OBS_RESPONSE_TIMEOUT: 'OBS không trả lời lệnh. Hãy kết nối lại; nếu OBS vừa đóng, mở lại OBS trước.',
    OBS_PASSWORD_REQUIRED: 'OBS đang yêu cầu mật khẩu. Nhập mật khẩu WebSocket bên dưới.',
    OBS_NOT_CONNECTED: 'OBS chưa được kết nối.',
    OBS_SCENE_NAME_CONFLICT: 'Tên scene đã tồn tại nhưng không do ứng dụng quản lý. Hãy chọn tên khác.',
    OBS_SOURCE_NAME_CONFLICT: 'Tên Browser Source đã tồn tại nhưng không do ứng dụng quản lý. Hãy chọn tên khác.',
    OBS_VIRTUAL_CAMERA_UNAVAILABLE: 'OBS trên máy chưa có Virtual Camera; Browser Source vẫn dùng được.',
    OBS_VIRTUAL_CAMERA_ALREADY_ACTIVE: 'Virtual Camera đang được ứng dụng khác hoặc phiên OBS hiện tại sử dụng.',
  };
  return messages[code] ?? code;
}

async function loadObsState(): Promise<void> {
  try {
    const [saved, status] = await Promise.all([
      globalThis.window.desktopApi.obs.getConfig(),
      globalThis.window.desktopApi.obs.getStatus(),
    ]);
    Object.assign(obsConfig, {
      kind: saved.kind,
      host: saved.host,
      port: saved.port,
      sceneName: saved.sceneName,
      sourceName: saved.sourceName,
      width: saved.width,
      height: saved.height,
      fps: saved.fps,
      password: '',
    });
    obsHasSavedPassword.value = saved.hasPassword;
    obsStatus.value = status;
    if (status.connected) obsMessage.value = status.browserSourceReady ? 'Browser Source đã sẵn sàng.' : 'Đã kết nối OBS.';
  } catch (error) {
    obsMessage.value = obsErrorMessage(error);
  }
}

async function testObsConnection(): Promise<boolean> {
  obsBusy.value = true;
  try {
    const result = await globalThis.window.desktopApi.obs.testConnection(obsConfigInput());
    obsMessage.value = result.message;
    obsStatus.value = await globalThis.window.desktopApi.obs.getStatus();
    obsHasSavedPassword.value = obsHasSavedPassword.value || Boolean(obsConfig.password);
    return result.ok;
  } catch (error) {
    obsMessage.value = obsErrorMessage(error);
    await loadObsState();
    return false;
  } finally {
    obsBusy.value = false;
  }
}

async function connectObsOutput(): Promise<void> {
  obsBusy.value = true;
  try {
    await publishPlayback();
    if (!obsStatus.value.connected) {
      const result = await globalThis.window.desktopApi.obs.testConnection(obsConfigInput());
      if (!result.ok) throw new Error(result.message);
    }
    const runtime = await globalThis.window.desktopApi.sceneRuntime.getStatus();
    if (!runtime.running || !runtime.url) throw new Error('Scene Runtime chưa sẵn sàng.');
    const output = await globalThis.window.desktopApi.obs.ensureOutput(runtime.url);
    obsStatus.value = await globalThis.window.desktopApi.obs.showOutput();
    obsMessage.value = output.message;
    notice.value = `${output.message} OBS đang hiển thị scene “${output.sceneName}”.`;
  } catch (error) {
    obsMessage.value = obsErrorMessage(error);
    notice.value = obsMessage.value;
    await loadObsState();
  } finally {
    obsBusy.value = false;
  }
}

async function toggleObsCamera(): Promise<void> {
  obsBusy.value = true;
  try {
    obsStatus.value = obsStatus.value.virtualCameraActive
      ? await globalThis.window.desktopApi.obs.stopVirtualCamera()
      : await globalThis.window.desktopApi.obs.startVirtualCamera();
    obsMessage.value = obsStatus.value.virtualCameraActive ? 'Virtual Camera đang bật.' : 'Virtual Camera đã dừng.';
  } catch (error) {
    obsMessage.value = obsErrorMessage(error);
    notice.value = obsMessage.value;
    await loadObsState();
  } finally {
    obsBusy.value = false;
  }
}

async function disconnectObs(): Promise<void> {
  obsBusy.value = true;
  try {
    obsStatus.value = await globalThis.window.desktopApi.obs.disconnect();
    obsMessage.value = 'Đã ngắt kết nối OBS.';
  } catch (error) {
    obsMessage.value = obsErrorMessage(error);
  } finally {
    obsBusy.value = false;
  }
}

function useCanvasSizeForObs(): void {
  const scene = buildSceneDocument();
  obsConfig.width = scene.width;
  obsConfig.height = scene.height;
}

function checkTikTok(): void {
  notice.value = tiktokUsername.value.trim()
    ? `Đã kiểm tra định dạng @${tiktokUsername.value.trim()}; kết nối thật sẽ có ở Phase 3.`
    : 'Nhập tên người dùng TikTok trước khi kiểm tra.';
}

function openPinManagerMock(): void {
  if (pinManagerTimer !== null) globalThis.clearTimeout(pinManagerTimer);
  pinManagerState.value = 'checking';
  productPinEnabled.value = false;
  pinManagerTimer = globalThis.setTimeout(() => {
    pinManagerState.value = 'login-required';
    pinManagerTimer = null;
  }, 650);
}

function toggleProductPin(): void {
  if (pinManagerState.value !== 'login-required') {
    notice.value = 'Mở mô phỏng TikTok Live Manager trước khi bật ghim sản phẩm.';
    return;
  }
  notice.value = 'TikTok Live Manager đang chờ đăng nhập; chưa thể bật ghim sản phẩm.';
}

async function chooseAvatarVideo(): Promise<void> {
  const reference = await globalThis.window.desktopApi.media.pick(avatarMediaKind.value, avatarName.value.trim() || 'Avatar');
  if (!reference) {
    notice.value = 'Chưa chọn tệp avatar. Trong trình duyệt dev, hãy mở ứng dụng Electron để dùng hộp chọn tệp hệ thống.';
    return;
  }
  pendingAvatarMedia.value = reference;
  avatarVideoName.value = reference.path.split(/[\\/]/).pop() ?? reference.label;
}

async function saveAvatarMock(): Promise<void> {
  const reference = pendingAvatarMedia.value;
  if (!avatarName.value.trim() || !avatarVideoName.value || !reference) {
    notice.value = 'Nhập tên và chọn tệp video hoặc GIF/avatar trước khi lưu.';
    return;
  }
  const dataUrl = await globalThis.window.desktopApi.media.read(JSON.parse(JSON.stringify(reference)) as ProjectMediaReference);
  mediaReferences.value.push(reference);
  const layer = createLayer(avatarName.value.trim(), 'avatar', { type: 'media', assetId: null, mediaReferenceId: reference.id });
  layer.loop = true;
  layer.muted = true;
  layer.avatarState = 'idle';
  layers.value.unshift(layer);
  activeLayerIndex.value = 0;
  if (dataUrl) videoSources.value = { ...videoSources.value, [reference.id]: dataUrl };
  pendingAvatarMedia.value = null;
  await refreshMediaStatus();
  avatarAddOpen.value = false;
  avatarLibraryOpen.value = false;
  notice.value = `Đã thêm “${layer.name}” làm avatar. Gán avatar này vào từng kịch bản chờ để VAS chỉ phát một avatar mỗi lúc.`;
  avatarName.value = '';
  avatarVideoName.value = '';
}

async function refreshMediaStatus(): Promise<void> {
  try {
    mediaStatuses.value = await globalThis.window.desktopApi.media.check(JSON.parse(JSON.stringify(mediaReferences.value)) as ProjectMediaReference[]);
  } catch {
    mediaStatuses.value = mediaReferences.value.map((reference) => ({ ...reference, exists: false }));
  }
}

async function repairMedia(reference: ProjectMediaStatus): Promise<void> {
  const replacement = await globalThis.window.desktopApi.media.pick(reference.kind, reference.label);
  if (!replacement) return;
  const index = mediaReferences.value.findIndex((candidate) => candidate.id === reference.id);
  if (index < 0) return;
  mediaReferences.value[index] = { ...reference, path: replacement.path };
  await refreshMediaStatus();
  notice.value = `Đã cập nhật tệp cho “${reference.label}”.`;
}

function captureTextBeforeEdit(): void {
  textEditSnapshot = { ...textStyle };
  textEditCommitted = false;
}

function finishTextEdit(): void {
  textEditSnapshot = null;
  textEditCommitted = false;
}

function markTextStyleCustom(): void {
  if (textEditSnapshot && !textEditCommitted) {
    textHistoryPast.value.push(textEditSnapshot);
    textHistoryFuture.value = [];
    textEditCommitted = true;
  }
  Object.assign(textStyle, normalizeTextStyle(textStyle));
  activeTextPresetId.value = null;
}

function undoTextEdit(): void {
  const previous = textHistoryPast.value.pop();
  if (!previous) return;
  textHistoryFuture.value.push({ ...textStyle });
  Object.assign(textStyle, previous);
  activeTextPresetId.value = null;
}

function redoTextEdit(): void {
  const next = textHistoryFuture.value.pop();
  if (!next) return;
  textHistoryPast.value.push({ ...textStyle });
  Object.assign(textStyle, next);
  activeTextPresetId.value = null;
}

function captureImageBeforeEdit(): void {
  imageEditSnapshot = imageRadius.value;
}

function commitImageEdit(): void {
  if (imageEditSnapshot !== null && imageEditSnapshot !== imageRadius.value) {
    imageHistoryPast.value.push(imageEditSnapshot);
    imageHistoryFuture.value = [];
  }
  imageEditSnapshot = null;
}

function undoInspector(): void {
  if (activeLayer.value?.kind === 'avatar') {
    const previous = avatarHistoryPast.value.pop();
    if (!previous) return;
    avatarHistoryFuture.value.push([...avatarScripts.value]);
    avatarScripts.value = [...previous];
    return;
  }
  if (activeLayer.value?.kind === 'image') {
    const previous = imageHistoryPast.value.pop();
    if (previous === undefined) return;
    imageHistoryFuture.value.push(imageRadius.value);
    imageRadius.value = previous;
    return;
  }
  undoTextEdit();
}

function redoInspector(): void {
  if (activeLayer.value?.kind === 'avatar') {
    const next = avatarHistoryFuture.value.pop();
    if (!next) return;
    avatarHistoryPast.value.push([...avatarScripts.value]);
    avatarScripts.value = [...next];
    return;
  }
  if (activeLayer.value?.kind === 'image') {
    const next = imageHistoryFuture.value.pop();
    if (next === undefined) return;
    imageHistoryPast.value.push(imageRadius.value);
    imageRadius.value = next;
    return;
  }
  redoTextEdit();
}

function setTextAlignment(align: TextAlignment): void {
  textStyle.align = align;
  activeTextPresetId.value = null;
}

function applyTextPreset(preset: TextStylePreset): void {
  Object.assign(textStyle, applyTextStylePreset(textStyle, preset));
  activeTextPresetId.value = preset.id;
}

function selectVoice(option: string): void {
  voice.value = option;
  voiceMenuOpen.value = false;
}
</script>

<template>
  <div class="studio-page">
    <header class="studio-titlebar">
      <RouterLink to="/" class="wordmark"><span class="broadcast-mark">⌁</span>Live Stream Agent</RouterLink>
      <span class="dev-badge">DEV</span>
    </header>
    <div class="studio-projectbar"><div class="studio-project-name">{{ projectTitle }}</div></div>
    <section v-if="missingMedia.length" class="missing-media-banner" role="alert">
      <span><strong>{{ missingMedia.length }} tệp media không còn ở đường dẫn đã lưu.</strong><small>Dự án vẫn mở an toàn; chọn lại tệp để sửa liên kết.</small></span>
      <button v-for="reference in missingMedia" :key="reference.id" type="button" @click="repairMedia(reference)">Chọn lại {{ reference.label }}</button>
    </section>

    <StudioToolRail :active-tool="activeTool" @select="activeTool = $event; if ($event === 'Văn bản') addLayer('Văn bản')" />

    <div class="studio-left-stack">
      <StudioAssetBrowser :active-tool="activeTool" @add-layer="addLayer" @add-local-image="addLocalImage" @add-local-video="addLocalVideo" @add-local-audio="addLocalAudio" @open-avatar-uploader="avatarLibraryOpen = true" />

      <section class="avatar-state-controls"><strong>Avatar states</strong><button v-for="state in (['idle', 'talk', 'point-product', 'point-cart', 'listen', 'thank', 'wave'] as AvatarVideoState[])" :key="state" type="button" :class="{ active: avatarVideoSnapshot.state === state }" @click="changeAvatarVideoState(state)">{{ state }}</button></section>

      <StudioSourcePanel :layers="layers" :scripts="preparedScripts()" :active-layer-index="activeLayerIndex" :primary-action="primaryAction" :source-display-name="sourceDisplayName" @add="addLayer()" @remove="removeLayer" @select="activeLayerIndex = $event" @assign="(layerId, role) => assignActiveSourceToRole(role, layerId)" @add-audio="addAudioForActiveAvatar" @edit-scripts="preparedScriptsOpen = true" />
    </div>

    <main class="studio-canvas-wrap">
      <div v-if="notice" class="studio-notice"><Check :size="14" />{{ notice }}<button type="button" aria-label="Đóng thông báo" @click="notice = ''"><X :size="13" /></button></div>
      <div class="studio-grid">
        <div ref="scenePosterElement" class="scene-poster live-frame" :class="{ 'has-authored-scene': previewRenderableLayers.length > 0 }">
          <template v-for="layer in previewMediaLayers()" :key="`preview-media-${layer.id}`">
            <SceneMediaLayer v-if="previewUsesVideo(layer) || layer.kind === 'audio'" :layer="layer" :media-kind="layer.kind === 'audio' ? 'audio' : 'video'" :source-url="(layer.kind === 'audio' ? audioSources[layer.source.mediaReferenceId!] : (previewMediaSource(layer) ?? videoSources[layer.source.mediaReferenceId!])) ?? ''" :render-style="previewLayerHitStyle(layer, layers.indexOf(layer))" :selected="activeLayer?.id === layer.id" :playback-managed="preparedScripts().some((script) => script.mediaLayerId === layer.id || script.audioLayerId === layer.id)" :playback-active="playlistSnapshot.activeLayerId === layer.id || playlistSnapshot.activeAudioLayerId === layer.id" :playback-paused="playlistSnapshot.mode === 'paused' || playlistSnapshot.mode === 'stopped' || playlistSnapshot.mode === 'error'" :playback-revision="Math.max(playlistSnapshot.playbackRevision, avatarVideoSnapshot.revision)" :speech-managed="preparedScripts().some((script) => script.avatarLayerId === layer.id)" :speech-active="playlistSnapshot.activeAvatarLayerId === layer.id" :motion-controlled="layer.kind === 'avatar' && Boolean(layer.avatarMotion)" :motion-active="avatarVideoSnapshot.activeLayerId === layer.id || avatarVideoSnapshot.pendingLayerId === layer.id || avatarVideoSnapshot.previousLayerId === layer.id" @ready="() => playlistSnapshot.activeScriptId && playbackReady(playlistSnapshot.activeScriptId, playlistSnapshot.playbackRevision)" @motion-ready="avatarMotionReady" @motion-ended="avatarMotionEnded" @ended="(layerId) => playlistSnapshot.activeScriptId && layerId === playlistSnapshot.activeLayerId && playbackEnded(playlistSnapshot.activeScriptId, playlistSnapshot.playbackRevision)" @error="(_layerId, _revision, message) => playlistSnapshot.activeScriptId && playbackError(playlistSnapshot.activeScriptId, playlistSnapshot.playbackRevision, message)" @pointerdown.stop="selectLayer(layer.id)" />
            <div v-else class="scene-runtime-layer scene-runtime-media" :data-media-kind="layer.kind" :style="previewLayerHitStyle(layer, layers.indexOf(layer))" @pointerdown.stop="selectLayer(layer.id)"><img class="scene-runtime-media-source" :src="previewMediaSource(layer) ?? ''" :alt="layer.name" :style="{ objectFit: previewMediaObjectFit(layer) as 'contain' | 'cover' | 'fill' }" @load="capturePreviewMediaAspectRatio(layer.id, $event)" /></div>
          </template>
          <div v-if="!previewRenderableLayers.length" class="empty-frame"><strong>Khung live đang trống</strong><span>Thêm media có nguồn rõ ràng để bắt đầu.</span></div>
          <div v-for="layer in previewRenderableLayers.filter((candidate) => candidate.kind === 'text')" :key="`preview-text-${layer.id}`" class="scene-runtime-layer scene-runtime-text" :class="{ 'is-selected': activeLayer?.id === layer.id }" :style="{ ...previewLayerHitStyle(layer, layers.indexOf(layer)), ...sceneTextStyle }" @pointerdown.stop="selectLayer(layer.id)">{{ textStyle.content || layer.name }}</div>
          <div v-for="layer in previewRenderableLayers" :key="`preview-hit-${layer.id}`" class="scene-layer-hit-target" :class="{ active: activeLayer?.id === layer.id }" :style="previewLayerHitStyle(layer, layers.indexOf(layer))" :aria-label="`Chọn ${sourceDisplayName(layer)}`" @pointerdown.stop="selectLayer(layer.id)" />
          <template v-if="activeLayer">
            <div class="scene-layer-toolbar" aria-label="Thứ tự lớp">
              <button type="button" aria-label="Đưa lên trên cùng" @click="moveActiveLayer('top')"><ArrowUpToLine :size="14" /></button>
              <button type="button" aria-label="Đưa lên một lớp" @click="moveActiveLayer('up')"><ArrowUp :size="14" /></button>
              <button type="button" aria-label="Đưa xuống một lớp" @click="moveActiveLayer('down')"><ArrowDown :size="14" /></button>
              <button type="button" aria-label="Đưa xuống dưới cùng" @click="moveActiveLayer('bottom')"><ArrowDownToLine :size="14" /></button>
            </div>
            <div class="scene-selection" :class="`scene-selection--${activeLayer.kind}`" :style="selectionStyle" tabindex="0" aria-label="Lớp đang chọn; kéo để di chuyển" @keydown.left.prevent="nudgeActiveLayer(-1, 0)" @keydown.right.prevent="nudgeActiveLayer(1, 0)" @keydown.up.prevent="nudgeActiveLayer(0, -1)" @keydown.down.prevent="nudgeActiveLayer(0, 1)" @pointerdown.stop.prevent="beginLayerTransform($event, 'move')">
              <span v-for="handle in resizeHandles" :key="handle" class="scene-resize-handle" :class="`scene-resize-handle--${handle}`" @pointerdown.stop.prevent="beginLayerTransform($event, `resize-${handle}`)" />
              <span class="scene-transform-origin" />
              <span class="scene-rotate-handle" aria-label="Xoay lớp" @pointerdown.stop.prevent="beginLayerTransform($event, 'rotate')">↻</span>
            </div>
          </template>
        </div>
      </div>
      <div class="studio-status">1080 × 1920 · 9:16 <span>{{ autosaveStatus === 'saving' ? 'Đang lưu...' : autosaveStatus === 'error' ? 'Lưu thất bại' : autosaveStatus === 'saved' ? 'Đã lưu local' : 'Chưa có thay đổi' }}</span></div>
    </main>

    <StudioInspectorSidebar
      v-model:text-style="textStyle"
      v-model:active-text-preset-id="activeTextPresetId"
      v-model:image-radius="imageRadius"
      v-model:remove-image-background="removeImageBackground"
      v-model:background-color="backgroundColor"
      v-model:background-sensitivity="backgroundSensitivity"
      :active-layer-kind="activeLayer?.kind"
      :active-avatar-state="activeLayer?.avatarState"
      :avatar-preview-state="avatarPreviewState"
      :focus-text-request="textFocusRequest"
      :text-history-past-count="textHistoryPast.length"
      :text-history-future-count="textHistoryFuture.length"
      :image-history-past-count="imageHistoryPast.length"
      :image-history-future-count="imageHistoryFuture.length"
      :avatar-history-past-count="avatarHistoryPast.length"
      :avatar-history-future-count="avatarHistoryFuture.length"
      @capture-text-edit="captureTextBeforeEdit"
      @mark-text-custom="markTextStyleCustom"
      @finish-text-edit="finishTextEdit"
      @undo-text="undoTextEdit"
      @redo-text="redoTextEdit"
      @set-text-alignment="setTextAlignment"
      @apply-text-preset="applyTextPreset"
      @capture-image-edit="captureImageBeforeEdit"
      @commit-image-edit="commitImageEdit"
      @undo-inspector="undoInspector"
      @redo-inspector="redoInspector"
      @set-avatar-layer-state="setActiveAvatarLayerState"
      @set-avatar-preview-state="setAvatarPreviewState"
      @edit-avatar="openAvatarScriptEditor"
      @open-settings="dialog = 'livestream'"
    />

    <StudioMixerFooter :obs-status="obsStatus" :obs-busy="obsBusy" :scripts="preparedScripts()" :snapshot="playlistSnapshot" @open-prepared-scripts="preparedScriptsOpen = true" @start-sequence="playbackStart" @pause="playbackPause" @resume="playbackResume" @skip="playbackSkip" @stop="playbackStop" @play-role="playbackPlayRole" @export="dialog = 'export'" @start="dialog = 'start'" @settings="dialog = 'livestream'" @connect-obs="connectObsOutput" @toggle-camera="toggleObsCamera" />

    <div v-if="avatarLibraryOpen" class="studio-dialog-backdrop" @click.self="avatarLibraryOpen = false">
      <section class="studio-dialog avatar-library-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-library-title">
        <header><div><small>Tạo hình đại diện</small><h2 id="avatar-library-title">Tạo hình đại diện</h2></div><button type="button" aria-label="Đóng" @click="avatarLibraryOpen = false"><X /></button></header>
        <div class="avatar-library-tabs"><button type="button" class="active" aria-pressed="true" @click="notice = 'Đang hiển thị avatar trong thư viện của tôi.'">Của tôi</button></div>
        <div class="avatar-library-body"><button type="button" class="avatar-library-card" @click="addLayer('Avatar - Local presenter'); avatarLibraryOpen = false"><img :src="beautyModel" alt="Local presenter" /><strong>Local presenter</strong></button><button type="button" class="avatar-library-add" @click="avatarLibraryOpen = false; avatarAddOpen = true"><Plus :size="23" /><strong>Thêm avatar của bạn</strong><span>Avatar của bạn sẽ xuất hiện tại đây</span></button></div>
        <div class="avatar-library-preview"><span>Chọn avatar để xem trước</span><button type="button" @click="addLayer('Avatar - Local presenter'); avatarLibraryOpen = false">Chọn</button></div>
      </section>
    </div>

    <div v-if="avatarAddOpen" class="studio-dialog-backdrop" @click.self="avatarAddOpen = false">
      <form class="studio-dialog avatar-add-dialog" @submit.prevent="saveAvatarMock">
        <header><div><small>Avatar của tôi</small><h2>Thêm avatar</h2></div><button type="button" aria-label="Đóng" @click="avatarAddOpen = false"><X /></button></header>
        <div class="avatar-add-body"><label>Tên<input v-model="avatarName" type="text" /></label><label>Định dạng<select v-model="avatarMediaKind"><option value="video">Video</option><option value="image">Ảnh hoặc GIF động</option></select></label><label>Tệp avatar<button class="avatar-file-control" type="button" @click="chooseAvatarVideo"><b>{{ avatarVideoName || (avatarMediaKind === 'video' ? 'Chọn tệp video' : 'Chọn ảnh hoặc GIF') }}</b></button></label><div class="avatar-sample"><img :src="beautyModel" alt="Avatar mẫu" /><span><b>Avatar mẫu</b><small>Video hoặc GIF động</small><small>Một nhân vật rõ ràng</small><small>Có thể gán riêng cho từng kịch bản</small></span></div><div class="avatar-requirements"><strong>Yêu cầu avatar</strong><ol><li>Video dùng MP4/WebM; ảnh động dùng GIF.</li><li>Chỉ một nhân vật, xuất hiện rõ trong khung hình.</li><li>Mỗi kịch bản chọn tối đa một avatar VAS đang phát.</li><li>Chuyển sang kịch bản khác sẽ dừng avatar cũ trước.</li></ol></div></div>
        <footer><button type="button" @click="avatarAddOpen = false">Hủy</button><button type="submit" class="save-button">Lưu</button></footer>
      </form>
    </div>

    <div v-if="preparedScriptsOpen" class="studio-dialog-backdrop" @click.self="preparedScriptsOpen = false">
      <section class="studio-dialog prepared-scripts-dialog" role="dialog" aria-modal="true" aria-labelledby="prepared-scripts-title">
        <header><div><small>VAS</small><h2 id="prepared-scripts-title">Kịch bản avatar & audio</h2></div><button type="button" aria-label="Đóng" @click="preparedScriptsOpen = false"><X /></button></header>
        <p>Chọn avatar, audio hoặc TTS cho từng R, sau đó bấm <b>Phát</b> tại chính dòng kịch bản.</p>
        <StudioPlaylistPanel :enabled="persistedScene.preparedScriptSettings.enabled" :snapshot="playlistSnapshot" :scripts="preparedScripts()" :layers="layers" :source-display-name="sourceDisplayName" @toggle="togglePlaylist" @start="playbackStart" @play="playbackPlayScript" @pause="playbackPause" @resume="playbackResume" @skip="playbackSkip" @stop="playbackStop" @move="movePreparedScript" @remove="removePreparedScript" @add="addPreparedScript" @pick-audio="pickAudioForPreparedScript" @changed="syncPlaybackController" />
      </section>
    </div>

    <div v-if="scriptDialogOpen" class="studio-dialog-backdrop script-dialog-backdrop" @click.self="cancelAvatarScriptEditor">
      <section class="studio-dialog script-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="script-editor-title">
        <header><h2 id="script-editor-title">Chỉnh sửa kịch bản</h2><button type="button" aria-label="Đóng" @click="cancelAvatarScriptEditor"><X /></button></header>
        <div class="script-editor-body">
          <section class="script-account-card"><small>CẤU HÌNH TÀI KHOáº¢N</small><span>Tài khoản AI đang dùng</span><strong>● Chưa kết nối · Mock local</strong></section>
          <div class="script-editor-columns">
            <section class="product-script-column"><header><strong>Nhập Thông Tin Sản Phẩm</strong><button type="button" @click="addScriptProduct"><Plus :size="14" />Thêm</button></header><div class="product-source-tabs"><button type="button" :class="{ active: productSource === 'manual' }" @click="productSource = 'manual'">Thủ công</button><button type="button" :class="{ active: productSource === 'manager' }" @click="productSource = 'manager'">TikTok Live Manager</button></div><template v-if="productSource === 'manual'"><div class="script-ai-link"><strong>Tự lấy thông tin từ link sản phẩm <b>AI</b></strong><div><input v-model="productLink" placeholder="Dán link sản phẩm để AI tự điền thông tin bên dưới..." /><button type="button" @click="generateScriptMock">✓</button></div></div><div class="script-pager"><button type="button" disabled>&lt;</button><b>1</b><button type="button" disabled>&gt;</button></div><article v-for="(product, index) in scriptProducts" :key="index" class="script-product-card"><label><input v-model="product.name" maxlength="40" placeholder="Tên sản phẩm" /><span>{{ product.name.length }} / 40</span></label><label><textarea v-model="product.information" maxlength="500" placeholder="Thông tin sản phẩm" /><span>{{ product.information.length }} / 500</span></label></article><button class="generate-script-button" type="button" @click="generateScriptMock"><b>AI</b>Tạo kịch bản AI</button></template><div v-else class="script-manager-empty"><MonitorUp :size="30" /><strong>Đang chờ đăng nhập</strong><p>TikTok Live Manager chưa cung cấp sản phẩm trong trạng thái signed-out.</p><button type="button" @click="openPinManagerMock">Mở mô phỏng</button></div></section>
            <section class="avatar-scripts-column"><small>KỊCH BẢN</small><div v-for="(script, index) in avatarScripts" :key="index" class="avatar-script-row"><b>{{ index + 1 }}</b><textarea v-model="avatarScripts[index]" :placeholder="`Kịch bản ${index + 1}...`" /></div><button type="button" @click="addAvatarScript"><Plus :size="14" />Thêm kịch bản</button></section>
          </div>
        </div>
        <footer><button type="button" @click="cancelAvatarScriptEditor">Hủy</button><button type="button" class="save-button" @click="saveAvatarScripts">Lưu</button><button type="button" disabled>▷ Tạo video</button></footer>
      </section>
    </div>

    <div v-if="dialog" class="studio-dialog-backdrop" @click.self="dialog = null">
      <section v-if="dialog === 'livestream'" class="studio-dialog live-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="livestream-title">
        <header><div><small>Cài đặt livestream</small><h2 id="livestream-title">Cài đặt tương tác</h2><p>Chọn khi nào phản hồi khách, cách trả lời và giới hạn tần suất.</p></div><button type="button" aria-label="Đóng" @click="dialog = null"><X /></button></header>
        <div class="dialog-scroll">
          <div class="config-block"><strong>Tên người dùng TikTok</strong><p>Nhập tên người dùng TikTok để bắt đầu phát trực tiếp.</p><div class="inline-field"><input v-model="tiktokUsername" placeholder="VD: nguyenvana" /><button type="button" @click="checkTikTok">Kiểm tra</button></div></div>
          <div class="config-block"><strong>Voice phát giọng nói</strong><p>Chọn voice sẽ dùng khi phản hồi bằng Phát giọng nói.</p><div class="voice-row"><div class="voice-select-control"><button type="button" class="select-button" aria-haspopup="listbox" :aria-expanded="voiceMenuOpen" @click="voiceMenuOpen = !voiceMenuOpen">{{ voice }}<ChevronDown :size="14" /></button><div v-if="voiceMenuOpen" class="voice-menu" role="listbox" aria-label="Danh sách voice"><button v-for="option in voiceOptions" :key="option" type="button" role="option" :aria-selected="voice === option" @click="selectVoice(option)">{{ option }}</button></div></div><button type="button" class="accent-button" @click="voice = 'Mỹ Dung'">Chọn</button><button type="button" @click="notice = `Đang mô phỏng nghe thử voice ${voice}.`">Nghe thử</button><button type="button" @click="voice = 'Chưa chọn'; voiceMenuOpen = false">Bỏ chọn</button></div></div>
          <div class="trigger-table"><header><span>Loại tương tác</span><span>Phản hồi</span><span>Cách trả lời</span></header><div v-for="trigger in triggers" :key="trigger.label"><strong>{{ trigger.label }}</strong><button type="button" class="switch" :class="{ on: trigger.enabled }" :aria-pressed="trigger.enabled" @click="trigger.enabled = !trigger.enabled"><span /></button><span :class="{ muted: !trigger.enabled }">{{ trigger.enabled ? trigger.reply : 'Đã tắt' }}</span></div></div>
          <div class="config-block sliders"><strong>Giới hạn tương tác</strong><p>Cấu hình thời gian chờ để tránh spam.</p><label>Thời gian chờ chung <b>{{ globalCooldown.toFixed(1) }}s</b><input v-model.number="globalCooldown" type="range" min="0" max="10" step="0.5" /></label><label>Thời gian chờ mỗi người dùng <b>{{ userCooldown }}s</b><input v-model.number="userCooldown" type="range" min="5" max="120" step="5" /></label></div>
          <div class="config-block product-pin"><strong>Ghim sản phẩm TikTok</strong><p>Bật để AI tự động ghim sản phẩm theo kịch bản và bình luận.</p><div class="product-pin-status"><span><b>TikTok Live Manager</b><small aria-live="polite">{{ pinManagerStatus }}</small></span><button type="button" class="pin-manager-action" :disabled="pinManagerState === 'checking'" @click="openPinManagerMock"><MonitorUp :size="13" />{{ pinManagerState === 'login-required' ? 'Thử lại' : pinManagerState === 'checking' ? 'Đang mở...' : 'Mở mô phỏng' }}</button></div><div class="product-pin-status"><span><b>Tự động ghim sản phẩm</b><small>Phase 1 không điều khiển Chrome hoặc ghim sản phẩm thật.</small></span><button type="button" class="switch" :class="{ on: productPinEnabled }" :aria-pressed="productPinEnabled" aria-label="Bật tự động ghim sản phẩm" @click="toggleProductPin"><span /></button></div><label>Thời gian ghim tối thiểu <b>{{ minimumPinTime }}s</b><input v-model.number="minimumPinTime" type="range" min="30" max="300" step="10" /></label></div>
          <div class="config-block obs-config-block">
            <div><strong>Đầu ra OBS</strong><p>Ứng dụng tự tạo Browser Source từ scene hiện tại qua kết nối loopback an toàn.</p></div>
            <div class="obs-config-grid">
              <label>Adapter<select v-model="obsConfig.kind"><option value="obs-websocket">OBS WebSocket</option><option value="mock">Mock kiểm thử</option></select></label>
              <label>Host<input v-model="obsConfig.host" autocomplete="off" /></label>
              <label>Port<input v-model.number="obsConfig.port" type="number" min="1" max="65535" /></label>
              <label>Mật khẩu phiên này<input v-model="obsConfig.password" type="password" autocomplete="off" :placeholder="obsHasSavedPassword ? 'Đã có mật khẩu trong phiên' : 'Mật khẩu OBS WebSocket'" /></label>
              <label>Tên scene<input v-model="obsConfig.sceneName" /></label>
              <label>Tên Browser Source<input v-model="obsConfig.sourceName" /></label>
              <label>Chiều rộng<input v-model.number="obsConfig.width" type="number" min="320" max="7680" /></label>
              <label>Chiều cao<input v-model.number="obsConfig.height" type="number" min="320" max="7680" /></label>
              <label>FPS<input v-model.number="obsConfig.fps" type="number" min="1" max="120" /></label>
            </div>
            <div class="obs-config-actions">
              <button type="button" :disabled="obsBusy" @click="useCanvasSizeForObs">Dùng kích thước canvas</button>
              <button type="button" :disabled="obsBusy" @click="testObsConnection">Kiểm tra kết nối</button>
              <button type="button" :disabled="obsBusy" @click="connectObsOutput">Tạo/cập nhật output</button>
              <button type="button" :disabled="obsBusy || !obsStatus.connected" @click="disconnectObs">Ngắt kết nối</button>
              <small role="status">{{ obsMessage }}</small>
            </div>
          </div>
        </div>
        <footer><button type="button" class="save-button" @click="saveLivestreamSettings">Lưu</button></footer>
      </section>

      <section v-else-if="dialog === 'export'" class="studio-dialog compact-dialog" role="dialog" aria-modal="true"><header><div><small>Xuất video</small><h2>Chuẩn bị bản xem trước</h2><p>Phase 1 chỉ mô phỏng luồng xuất; không tạo file hay installer.</p></div><button type="button" aria-label="Đóng" @click="dialog = null"><X /></button></header><div class="export-summary"><span>Khung hình<b>1080 × 1920</b></span><span>Tỉ lệ<b>9:16</b></span><span>Chế độ<b>Bản xem trước</b></span></div><footer><button type="button" @click="dialog = null">Hủy</button><button type="button" class="save-button" @click="dialog = null; notice = 'Đã kiểm tra cấu hình xuất mock; chưa tạo tệp.'">Kiểm tra cấu hình</button></footer></section>

      <section v-else class="studio-dialog compact-dialog" role="dialog" aria-modal="true"><header><div><small>Bắt đầu livestream</small><h2>Chưa sẵn sàng phát trực tiếp</h2><p>Hãy cấu hình TikTok và voice trước. Ứng dụng sẽ không tự kết nối trong Phase 1.</p></div><button type="button" aria-label="Đóng" @click="dialog = null"><X /></button></header><div class="readiness-list"><span><i />TikTok username chưa kiểm tra</span><span><i class="ready" />Scene 1080 × 1920 sẵn sàng</span><span><i />TikTok Live Manager chưa mở</span></div><footer><button type="button" @click="dialog = null">Để sau</button><button type="button" class="save-button" @click="dialog = 'livestream'">Mở cài đặt</button></footer></section>
    </div>

    <div v-if="savingProject" class="project-saving-overlay" role="status" aria-live="polite"><span /><strong>Đang lưu dự án</strong><p>Vui lòng đợi...</p></div>
  </div>
</template>
