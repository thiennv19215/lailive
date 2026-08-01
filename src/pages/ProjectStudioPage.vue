<script setup lang="ts">
/* global HTMLElement, PointerEvent */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Check,
  ChevronDown,
  CircleStop,
  Image,
  Italic,
  Mic2,
  MonitorUp,
  Plus,
  Radio,
  Settings2,
  Sticker,
  Type,
  UserRound,
  Video,
  Volume2,
  X,
} from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import beautyCream from '../assets/mock/beauty-cream.jpg';
import beautyModel from '../assets/mock/beauty-model.jpg';
import beautyStudio from '../assets/mock/beauty-studio.jpg';
import flowerGif from '../assets/mock/flower.gif';
import templateHost from '../assets/mock/template-host-v2.jpg';
import {
  DEFAULT_STUDIO_TEXT_STYLE,
  TEXT_FONT_FAMILIES,
  TEXT_STYLE_PRESETS,
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
import { PROJECT_SCHEMA_VERSION, createEmptyScene, createProjectSceneLayer, type ProjectMediaReference, type ProjectMediaStatus, type ProjectSceneDocument, type ProjectSceneLayer, type ProjectTriggerEvent } from '../shared/contracts/projects';

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

let layerSequence = 0;
function createLayer(name: string, kind: LayerKind): StudioLayer {
  layerSequence += 1;
  return createProjectSceneLayer(`layer-${layerSequence}`, name, kind);
}

const activeTool = ref<ToolName>('Avatar');
const route = useRoute();
const projectTitle = ref('Perfume 11:48:42 PM');
const projectLoaded = ref(false);
const hydratingProject = ref(true);
const persistedScene = ref<ProjectSceneDocument>(createEmptyScene());
const autosaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const backgroundSection = ref<'For You' | 'Của tôi'>('For You');
const videoCategory = ref<'Tất cả' | 'Default'>('Tất cả');
const stickerCategory = ref('After Sales Service');
const dialog = ref<DialogName>(null);
const savingProject = ref(false);
const avatarLibraryOpen = ref(false);
const avatarAddOpen = ref(false);
const scriptDialogOpen = ref(false);
const avatarScriptsDraft = ref<string[] | null>(null);
const sourceListElement = ref<{ scrollTop: number } | null>(null);
const scenePosterElement = ref<HTMLElement | null>(null);
const avatarName = ref('');
const avatarVideoName = ref('');
const notice = ref('');
const tiktokUsername = ref('');
const voice = ref('Mỹ Dung');
const voiceMenuOpen = ref(false);
const stickerSection = ref<'Hình dán' | 'Của tôi'>('Của tôi');
const globalCooldown = ref(2);
const userCooldown = ref(30);
const minimumPinTime = ref(60);
const productPinEnabled = ref(false);
const activeLayerIndex = ref<number | null>(null);
const textStyle = reactive({ ...DEFAULT_STUDIO_TEXT_STYLE });
const activeTextPresetId = ref<string | null>('preset-1');
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
const mediaStatuses = ref<ProjectMediaStatus[]>([]);
const pendingAvatarMedia = ref<ProjectMediaReference | null>(null);
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

const tools = [
  { label: 'Avatar' as const, icon: UserRound },
  { label: 'Hình nền' as const, icon: Image },
  { label: 'Video' as const, icon: Video },
  { label: 'Hình dán' as const, icon: Sticker },
  { label: 'Văn bản' as const, icon: Type },
];
const stickerCategories = ['After Sales Service', 'Decorative', 'Product', 'Promotion', 'Sticker'];
const voiceOptions = ['Mỹ Dung', 'Minh Anh', 'Ngọc Lam'];
const videoCategories: Array<'Tất cả' | 'Default'> = ['Tất cả', 'Default'];
const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const textAlignments: Array<{ value: TextAlignment; label: string; icon: typeof AlignLeft }> = [
  { value: 'left', label: 'Căn trái', icon: AlignLeft },
  { value: 'center', label: 'Căn giữa', icon: AlignCenter },
  { value: 'right', label: 'Căn phải', icon: AlignRight },
];

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
const hasAuthoredScene = computed(() => layers.value.some((layer) => layer.source.type === 'builtin' || layer.source.type === 'media'));
const hasImageLayer = computed(() => layers.value.some((layer) => layer.kind === 'image' || layer.kind === 'avatar'));
const hasTextLayer = computed(() => layers.value.some((layer) => layer.kind === 'text'));
const previewImageLayer = computed(() => {
  const layer = layers.value.find((candidate) => candidate.kind === 'image' || candidate.kind === 'avatar');
  if (!layer) return null;
  const name = layer.name.toLowerCase();
  const source = name.includes('10') ? beautyCream : name.includes('44') ? beautyStudio : name.includes('22') ? beautyModel : templateHost;
  return { layer, source };
});

const activeTransform = computed(() => activeLayer.value?.transform ?? DEFAULT_LAYER_TRANSFORM);
const activeSelectionBox = computed(() => activeLayer.value?.kind === 'text'
  ? { left: 8, top: 10, width: 84, height: 12 }
  : { left: 0, top: 0, width: 100, height: 100 });
const activeSceneTransform = computed(() => {
  const transform = activeTransform.value;
  return `translate(${transform.x}%, ${transform.y}%) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`;
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
  transform: activeLayer.value?.kind === 'text' ? activeSceneTransform.value : undefined,
}));

const sceneMediaStyle = computed(() => ({
  transform: previewImageLayer.value
    ? `translate(${previewImageLayer.value.layer.transform.x}%, ${previewImageLayer.value.layer.transform.y}%) rotate(${previewImageLayer.value.layer.transform.rotation}deg) scale(${previewImageLayer.value.layer.transform.scaleX}, ${previewImageLayer.value.layer.transform.scaleY})`
    : undefined,
}));

onBeforeUnmount(() => {
  if (pinManagerTimer !== null) globalThis.clearTimeout(pinManagerTimer);
  if (autosaveTimer !== null) globalThis.clearTimeout(autosaveTimer);
  stopLayerTransform();
});

onMounted(async () => {
  const projectId = String(route.params.projectId ?? '');
  const project = await globalThis.window.desktopApi.projects.get(projectId).catch(() => null);
  if (project) {
    projectTitle.value = project.title;
    persistedScene.value = clonePlain(project.scene);
    if (project.scene.layers.length > 0) layers.value = project.scene.layers.map((layer) => ({ ...layer, transform: { ...layer.transform } }));
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
    projectLoaded.value = true;
    autosaveStatus.value = 'saved';
    await refreshMediaStatus();
  }
  else notice.value = 'Không tìm thấy dữ liệu dự án local; đang mở scene mock an toàn.';
  await nextTick();
  hydratingProject.value = false;
  if (sourceListElement.value) sourceListElement.value.scrollTop = 62;
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
], () => {
  if (!projectLoaded.value || hydratingProject.value) return;
  if (autosaveTimer !== null) globalThis.clearTimeout(autosaveTimer);
  autosaveStatus.value = 'idle';
  autosaveTimer = globalThis.setTimeout(() => { void saveSceneNow(); }, 350);
}, { deep: true });

function addLayer(label: string = activeTool.value): void {
  const kind: LayerKind = label === 'Flower GIF' ? 'gif' : label.includes('Avatar') ? 'avatar' : label.includes('Video') ? 'video' : label.includes('VÄƒn báº£n') ? 'text' : 'image';
  const sourceName = label.includes(' - ') || label === 'Flower GIF' || ['FREESHIP', '-50%', 'LIVE ONLY', 'HOT DEAL'].includes(label)
    ? label
    : `${label} ${layers.value.length + 1}`;
  layers.value.push(createLayer(sourceName, kind));
  activeLayerIndex.value = layers.value.length - 1;
  notice.value = `Đã thêm ${label.toLowerCase()} vào canvas.`;
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

function buildSceneDocument(): ProjectSceneDocument {
  const base = clonePlain(persistedScene.value);
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
    await globalThis.window.desktopApi.projects.saveScene(String(route.params.projectId), buildSceneDocument());
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

function saveLivestreamSettings(): void {
  dialog.value = null;
  notice.value = 'Đã lưu cài đặt livestream trong phiên mock.';
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
  const reference = await globalThis.window.desktopApi.media.pick('video', avatarName.value.trim() || 'Video avatar');
  if (!reference) {
    notice.value = 'Chưa chọn video avatar. Trong trình duyệt dev, hãy mở ứng dụng Electron để dùng hộp chọn tệp hệ thống.';
    return;
  }
  pendingAvatarMedia.value = reference;
  avatarVideoName.value = reference.path.split(/[\\/]/).pop() ?? reference.label;
}

async function saveAvatarMock(): Promise<void> {
  if (!avatarName.value.trim() || !avatarVideoName.value) {
    notice.value = 'Nhập tên và chọn video avatar MP4 trước khi lưu.';
    return;
  }
  if (pendingAvatarMedia.value) {
    mediaReferences.value.push(pendingAvatarMedia.value);
    pendingAvatarMedia.value = null;
    await refreshMediaStatus();
  }
  avatarAddOpen.value = false;
  avatarLibraryOpen.value = true;
  notice.value = `Đã thêm avatar “${avatarName.value.trim()}” vào thư viện mock.`;
}

async function refreshMediaStatus(): Promise<void> {
  try {
    mediaStatuses.value = await globalThis.window.desktopApi.media.check(mediaReferences.value);
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

    <aside class="studio-tools" aria-label="Công cụ editor">
      <button v-for="tool in tools" :key="tool.label" type="button" :class="[{ active: activeTool === tool.label }, tool.label === 'Văn bản' ? 'add-source text' : '']" @click="activeTool = tool.label; if (tool.label === 'Văn bản') addLayer('Văn bản')">
        <component :is="tool.icon" :size="19" />{{ tool.label }}
      </button>
    </aside>

    <div class="studio-left-stack">
      <section class="asset-browser">
        <template v-if="activeTool === 'Avatar'">
          <button class="wide-primary" type="button" @click="avatarLibraryOpen = true"><Plus :size="17" />Thêm avatar</button>
          <button class="asset-card" type="button" @click="addLayer('Avatar - Chinese Beauty Sale 3')"><img :src="templateHost" alt="Avatar presenter" /><span><strong>Chinese Beauty Sale 3</strong></span></button>
        </template>

        <template v-else-if="activeTool === 'Hình nền'">
          <div class="panel-tabs"><button type="button" :class="{ active: backgroundSection === 'For You' }" @click="backgroundSection = 'For You'">Hình nền</button><button type="button" :class="{ active: backgroundSection === 'Của tôi' }" @click="backgroundSection = 'Của tôi'">Của tôi</button></div>
          <template v-if="backgroundSection === 'For You'">
            <div class="subtabs"><button type="button" class="active" aria-pressed="true" @click="backgroundSection = 'For You'">For You</button></div>
            <div class="asset-grid"><button type="button" @click="addLayer('Background - Product table')"><img :src="beautyStudio" alt="Studio background" /><span>Beauty studio</span></button><button type="button" @click="addLayer('Hình nền')"><img :src="beautyCream" alt="Product background" /><span>Product table</span></button></div>
          </template>
          <div v-else class="asset-empty"><Image :size="31" /><strong>Chưa có hình nền nào</strong><button type="button" @click="addLayer('Hình nền')"><Plus :size="16" />Thêm hình nền</button></div>
        </template>

        <template v-else-if="activeTool === 'Video'">
          <div class="subtabs"><button v-for="category in videoCategories" :key="category" type="button" :class="{ active: videoCategory === category }" @click="videoCategory = category">{{ category }}</button></div>
          <button class="wide-primary compact" type="button" @click="addLayer('Video')"><Plus :size="17" />Thêm video</button>
          <div class="video-assets"><button type="button" aria-label="Flower GIF" @click="addLayer('Flower GIF')"><span class="video-thumb"><Video :size="24" /></span><strong>Flower GIF</strong></button><button type="button" @click="addLayer('Video - airpods')"><span class="video-thumb"><Video :size="24" /></span><strong>airpods</strong></button><button type="button" @click="addLayer('Video - water-glass')"><span class="video-thumb blue"><Video :size="24" /></span><strong>water-glass</strong></button></div>
        </template>

        <template v-else-if="activeTool === 'Hình dán'">
          <div class="panel-tabs"><button type="button" :class="{ active: stickerSection === 'Hình dán' }" :aria-pressed="stickerSection === 'Hình dán'" @click="stickerSection = 'Hình dán'">Hình dán</button><button type="button" :class="{ active: stickerSection === 'Của tôi' }" :aria-pressed="stickerSection === 'Của tôi'" @click="stickerSection = 'Của tôi'">Của tôi</button></div>
          <template v-if="stickerSection === 'Hình dán'"><div class="category-scroll"><button v-for="category in stickerCategories" :key="category" type="button" :class="{ active: stickerCategory === category }" @click="stickerCategory = category">{{ category }}</button></div><div class="sticker-grid"><button v-for="sticker in ['FREESHIP', '-50%', 'LIVE ONLY', 'HOT DEAL']" :key="sticker" type="button" @click="addLayer(sticker)">{{ sticker }}</button></div></template>
          <div v-else class="asset-empty"><Sticker :size="31" /><strong>Chưa có hình dán cá nhân</strong><button type="button" @click="addLayer('Hình dán của tôi')"><Plus :size="16" />Thêm hình dán</button></div>
        </template>

        <template v-else>
          <div class="asset-empty text-empty"><Type :size="34" /><strong>Thêm lớp văn bản vào canvas</strong><button type="button" @click="addLayer('Văn bản')"><Plus :size="16" />Thêm văn bản</button></div>
        </template>
      </section>

      <section class="source-panel">
        <header><strong>Nguồn</strong><button type="button" :aria-label="primaryAction" @click="addLayer()"><Plus :size="17" /></button></header>
        <ul ref="sourceListElement">
          <li v-for="(layer, index) in layers" :key="layer.id" :data-layer-id="layer.id" :class="{ active: activeLayerIndex === index }" @click="activeLayerIndex = index"><UserRound v-if="layer.kind === 'avatar'" :size="14" /><Type v-else-if="layer.kind === 'text'" :size="14" /><Image v-else :size="14" /><span>{{ sourceDisplayName(layer) }}</span><button type="button" :aria-label="`Xóa ${layer.name}`" @click.stop="removeLayer(index)"><X :size="13" /></button></li>
        </ul>
      </section>
    </div>

    <main class="studio-canvas-wrap">
      <div v-if="notice" class="studio-notice"><Check :size="14" />{{ notice }}<button type="button" aria-label="Đóng thông báo" @click="notice = ''"><X :size="13" /></button></div>
      <div class="studio-grid">
        <div ref="scenePosterElement" class="scene-poster live-frame scene-poster--perfume" :class="{ 'has-authored-scene': hasAuthoredScene, 'has-image-layer': hasImageLayer, 'has-text-layer': hasTextLayer }">
          <img v-if="previewImageLayer" :src="previewImageLayer.source" alt="Scene preview" :style="sceneMediaStyle" @pointerdown.stop="selectLayer(previewImageLayer.layer.id)" />
          <div v-if="activeLayer?.kind === 'gif'" class="scene-runtime-layer scene-runtime-media" data-media-kind="gif" :style="{ left: '10%', top: '30%', width: '80%', height: '30%', transform: activeSceneTransform }" @pointerdown.stop="selectLayer(activeLayer.id)"><img class="scene-runtime-media-source" :src="flowerGif" alt="Flower GIF" /></div>
          <div v-if="hasTextLayer" class="scene-copy" @pointerdown.stop="selectLayer(layers.find((layer) => layer.kind === 'text')?.id ?? '')"><small>DEAL HỜI</small><strong :style="sceneTextStyle">{{ textStyle.content || ' ' }}</strong><div class="scene-offers"><span>Giảm đến <b>50%</b></span><span>Hỗ trợ<br /><b>FREESHIP</b></span></div></div>
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

    <aside class="live-sidebar">
      <section v-if="activeLayer?.kind === 'text'" class="source-properties-panel">
        <header><strong>Chỉnh sửa văn bản</strong><div class="inspector-history"><button type="button" aria-label="Hoàn tác lớp" :disabled="!textHistoryPast.length" @click="undoTextEdit">↶</button><button type="button" aria-label="Làm lại lớp" :disabled="!textHistoryFuture.length" @click="redoTextEdit">↷</button></div></header>
        <div class="source-properties-scroll">
          <label>Nội dung<textarea v-model="textStyle.content" maxlength="160" aria-label="Nội dung văn bản" @focus="captureTextBeforeEdit" @input="markTextStyleCustom" @blur="finishTextEdit" /></label>
          <label>Nét chữ<select v-model="textStyle.font" @change="markTextStyleCustom"><option v-for="font in TEXT_FONT_FAMILIES" :key="font" :value="font">{{ font }}</option></select></label>
          <label>Cỡ chữ <b>{{ textStyle.size }}</b><input v-model.number="textStyle.size" type="range" min="12" max="96" aria-label="Cỡ chữ" @input="markTextStyleCustom" /></label>
          <label>Màu sắc<input v-model="textStyle.color" type="color" aria-label="Màu chữ" @input="markTextStyleCustom" /></label>
          <div class="text-format-row"><span>Căn chỉnh</span><button v-for="alignment in textAlignments" :key="alignment.value" type="button" :class="{ active: textStyle.align === alignment.value }" :aria-label="alignment.label" :aria-pressed="textStyle.align === alignment.value" @click="setTextAlignment(alignment.value)"><component :is="alignment.icon" :size="14" /></button><button type="button" :class="{ active: textStyle.bold }" aria-label="Chữ đậm" :aria-pressed="textStyle.bold" @click="textStyle.bold = !textStyle.bold; activeTextPresetId = null"><Bold :size="14" /></button><button type="button" :class="{ active: textStyle.italic }" aria-label="Chữ nghiêng" :aria-pressed="textStyle.italic" @click="textStyle.italic = !textStyle.italic; activeTextPresetId = null"><Italic :size="14" /></button></div>
          <div class="text-preset-grid" aria-label="Kiểu cài sẵn"><button v-for="preset in TEXT_STYLE_PRESETS" :key="preset.id" type="button" :class="{ active: activeTextPresetId === preset.id }" :aria-label="preset.label" :aria-pressed="activeTextPresetId === preset.id" @click="applyTextPreset(preset)">{{ preset.preview }}</button></div>
        </div>
      </section>
      <section v-else-if="activeLayer?.kind === 'image'" class="source-properties-panel">
        <header><strong>Chỉnh sửa hình ảnh</strong><div class="inspector-history"><button type="button" aria-label="Hoàn tác lớp" :disabled="!imageHistoryPast.length" @click="undoInspector">↶</button><button type="button" aria-label="Làm lại lớp" :disabled="!imageHistoryFuture.length" @click="redoInspector">↷</button></div></header>
        <div class="source-properties-scroll"><label>Bo góc <b>{{ imageRadius }}px</b><input v-model.number="imageRadius" type="range" min="0" max="120" @focus="captureImageBeforeEdit" @change="commitImageEdit" /></label><label class="property-checkbox">Cắt nền<input v-model="removeImageBackground" type="checkbox" /></label><label :class="{ disabled: !removeImageBackground }">Màu nền<input v-model="backgroundColor" type="color" :disabled="!removeImageBackground" /></label><label :class="{ disabled: !removeImageBackground }">Độ nhạy <b>{{ backgroundSensitivity }}</b><input v-model.number="backgroundSensitivity" type="range" min="0" max="100" :disabled="!removeImageBackground" /></label></div>
      </section>
      <section v-else-if="activeLayer?.kind === 'avatar'" class="avatar-script-panel">
        <header><strong>Kịch Bản Avatar</strong><div class="inspector-history"><button type="button" aria-label="Hoàn tác lớp" :disabled="!avatarHistoryPast.length" @click="undoInspector">↶</button><button type="button" aria-label="Làm lại lớp" :disabled="!avatarHistoryFuture.length" @click="redoInspector">↷</button><button type="button" @click="openAvatarScriptEditor">✎ Chỉnh sửa</button></div></header><div><p>Chưa có kịch bản nào.</p><span>Nhấn “Chỉnh sửa” để thêm.</span></div>
      </section>
      <section v-else class="interaction-panel">
        <header><span>Tương tác</span><b>Ngoại tuyến</b></header>
        <div class="interaction-empty"><CircleStop :size="25" /><strong>Chưa cài đặt livestream</strong><button type="button" @click="dialog = 'livestream'">Cài đặt</button></div>
      </section>
    </aside>

    <section class="studio-mixer-footer">
      <section class="mixer-panel"><header><Mic2 :size="15" /><span>Nguồn âm thanh</span></header><div>Không có nguồn âm thanh</div></section>
      <section class="mixer-panel output"><header><Volume2 :size="15" /><span>Phát trực tiếp</span></header><div><span>Âm lượng đầu ra</span><b>100%</b></div></section>
      <div class="studio-actions">
        <button type="button" class="studio-action muted" @click="dialog = 'export'"><MonitorUp :size="15" />Xuất video</button>
        <button type="button" class="studio-action live" @click="dialog = 'start'"><Radio :size="15" />Bắt đầu livestream</button>
        <button type="button" class="studio-action live" @click="dialog = 'livestream'"><Settings2 :size="15" />Cài đặt livestream</button>
      </div>
    </section>

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
        <div class="avatar-add-body"><label>Tên<input v-model="avatarName" type="text" /></label><label>Video<button class="avatar-file-control" type="button" @click="chooseAvatarVideo"><b>{{ avatarVideoName || 'Chọn tệp video' }}</b></button></label><div class="avatar-sample"><img :src="beautyModel" alt="Avatar mẫu" /><span><b>Avatar mẫu</b><small>Ảnh chụp khuôn mặt thẳng</small><small>Miệng có thể mở/ngậm</small><small>Khuôn mặt không bị che khuất</small></span></div><div class="avatar-requirements"><strong>Yêu cầu video avatar</strong><ol><li>Thời lượng video nên từ 10 đến 30 giây, định dạng MP4, độ phân giải 1080p đến 4K.</li><li>Chỉ có một khuôn mặt, xuất hiện trong mọi khung hình và không bị che khuất.</li><li>Giữ khoảng cách phù hợp với camera, miệng khép hoặc hé nhẹ.</li><li>Có thể đọc nhẹ “1 2 3 4 5 6 7 8 9” theo giọng tự nhiên.</li></ol></div></div>
        <footer><button type="button" @click="avatarAddOpen = false">Hủy</button><button type="submit" class="save-button">Lưu</button></footer>
      </form>
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
        </div>
        <footer><button type="button" class="save-button" @click="saveLivestreamSettings">Lưu</button></footer>
      </section>

      <section v-else-if="dialog === 'export'" class="studio-dialog compact-dialog" role="dialog" aria-modal="true"><header><div><small>Xuất video</small><h2>Chuẩn bị bản xem trước</h2><p>Phase 1 chỉ mô phỏng luồng xuất; không tạo file hay installer.</p></div><button type="button" aria-label="Đóng" @click="dialog = null"><X /></button></header><div class="export-summary"><span>Khung hình<b>1080 × 1920</b></span><span>Tỉ lệ<b>9:16</b></span><span>Chế độ<b>Bản xem trước</b></span></div><footer><button type="button" @click="dialog = null">Hủy</button><button type="button" class="save-button" @click="dialog = null; notice = 'Đã kiểm tra cấu hình xuất mock; chưa tạo tệp.'">Kiểm tra cấu hình</button></footer></section>

      <section v-else class="studio-dialog compact-dialog" role="dialog" aria-modal="true"><header><div><small>Bắt đầu livestream</small><h2>Chưa sẵn sàng phát trực tiếp</h2><p>Hãy cấu hình TikTok và voice trước. Ứng dụng sẽ không tự kết nối trong Phase 1.</p></div><button type="button" aria-label="Đóng" @click="dialog = null"><X /></button></header><div class="readiness-list"><span><i />TikTok username chưa kiểm tra</span><span><i class="ready" />Scene 1080 × 1920 sẵn sàng</span><span><i />TikTok Live Manager chưa mở</span></div><footer><button type="button" @click="dialog = null">Để sau</button><button type="button" class="save-button" @click="dialog = 'livestream'">Mở cài đặt</button></footer></section>
    </div>

    <div v-if="savingProject" class="project-saving-overlay" role="status" aria-live="polite"><span /><strong>Đang lưu dự án</strong><p>Vui lòng đợi...</p></div>
  </div>
</template>
