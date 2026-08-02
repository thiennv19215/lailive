export const PROJECT_SCHEMA_VERSION = 16 as const;
export const PROJECT_EXPORT_FORMAT = 'ai-livestream-project' as const;
export const LAST_OPENED_PROJECT_KEY = 'project.last-opened-id' as const;

export type ProjectPosterPreset = 'gold' | 'blossom' | 'empty-avatar' | 'product';
export type ProjectLayerKind = 'avatar' | 'image' | 'gif' | 'video' | 'audio' | 'text';
export type ProjectCanvasPreset = 'portrait-1080p' | 'landscape-1080p';
export type ProjectLayerAssetId =
  | 'template-host'
  | 'beauty-model'
  | 'beauty-studio'
  | 'beauty-cream'
  | 'background-white-clean'
  | 'background-white-warm'
  | 'background-white-studio'
  | 'flower-video'
  | 'flower-gif'
  | 'sticker-freeship'
  | 'sticker-hot-deal'
  | 'sticker-live-only'
  | 'sticker-sale-50';
export type ProjectMediaKind = 'image' | 'video' | 'audio';
export type ProjectTriggerEvent = 'chat' | 'gift' | 'like' | 'follow' | 'share';

export interface ProjectMediaReference {
  id: string;
  label: string;
  kind: ProjectMediaKind;
  path: string;
}

export interface ProjectMediaStatus extends ProjectMediaReference {
  exists: boolean;
}

export interface ProjectImageSettings {
  radius: number;
  removeBackground: boolean;
  backgroundColor: string;
  backgroundSensitivity: number;
}

export interface ProjectScriptProduct {
  name: string;
  information: string;
}

export interface ProjectAvatarSettings {
  productSource: 'manual' | 'manager';
  productLink: string;
  products: ProjectScriptProduct[];
  scripts: string[];
}

export interface ProjectTriggerSetting {
  event: ProjectTriggerEvent;
  enabled: boolean;
  actionType: 'ignore' | 'voice_tts' | 'ai_speech';
}

export interface ProjectLivestreamSettings {
  tiktokUsername: string;
  voice: string;
  globalCooldown: number;
  userCooldown: number;
  duplicateWindow: number;
  minimumCommentLength: number;
  allowKeywords: string[];
  blockKeywords: string[];
  bannedOutputTerms: string[];
  minimumPinTime: number;
  productPinEnabled: boolean;
  triggers: ProjectTriggerSetting[];
}

export interface ProjectManualPlaylistItem {
  layerId: string;
  enabled: boolean;
  role?: 'idle' | 'response';
}

export interface ProjectManualPlaybackSettings {
  enabled: boolean;
  playlist: ProjectManualPlaylistItem[];
}

export type PreparedScriptPlaybackType = 'video' | 'audio' | 'tts';
export type PreparedScriptRole = 'idle' | 'activation' | 'conversation';
export type PreparedScriptInterruptMode = 'immediate' | 'after-current';
export type PreparedScriptCompletionMode = 'stop' | 'next' | 'resume-sequence';

export interface ProjectPreparedScript {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
  playbackType: PreparedScriptPlaybackType;
  role: PreparedScriptRole;
  mediaLayerId: string | null;
  // Optional voice track that is started and stopped with a video script.
  audioLayerId: string | null;
  // The VAS can show one assigned avatar for a script, independently of its audio/video source.
  avatarLayerId: string | null;
  speechText: string;
  interruptMode: PreparedScriptInterruptMode;
  completionMode: PreparedScriptCompletionMode;
}

export interface ProjectPreparedScriptSettings {
  enabled: boolean;
  scripts: ProjectPreparedScript[];
}

export interface ProjectSceneLayer {
  id: string;
  name: string;
  kind: ProjectLayerKind;
  transform: LayerTransform;
  visible: boolean;
  locked: boolean;
  opacity: number;
  fitMode: 'contain' | 'cover' | 'fill';
  loop: boolean;
  muted: boolean;
  volume: number;
  avatarState: 'none' | 'idle' | 'talking';
  chromaKey: {
    enabled: boolean;
    color: string;
    tolerance: number;
  };
  source: {
    type: 'none' | 'builtin' | 'media' | 'text';
    assetId: ProjectLayerAssetId | null;
    mediaReferenceId: string | null;
  };
}

export interface ProjectSceneDocument {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  canvasPreset: ProjectCanvasPreset;
  width: 1080 | 1920;
  height: 1080 | 1920;
  layers: ProjectSceneLayer[];
  textStyle: StudioTextStyle;
  imageSettings: ProjectImageSettings;
  avatarSettings: ProjectAvatarSettings;
  livestreamSettings: ProjectLivestreamSettings;
  manualPlaybackSettings: ProjectManualPlaybackSettings;
  preparedScriptSettings: ProjectPreparedScriptSettings;
  aiSettings: AiReplySettings;
  ttsSettings: TtsProjectSettings;
  products: ProductCatalogItem[];
  mediaReferences: ProjectMediaReference[];
}

export interface ProjectRecord {
  id: string;
  title: string;
  posterPreset: ProjectPosterPreset;
  scene: ProjectSceneDocument;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface ProjectCreateInput {
  title: string;
  posterPreset?: ProjectPosterPreset;
}

export interface ProjectExportEnvelope {
  format: typeof PROJECT_EXPORT_FORMAT;
  version: typeof PROJECT_SCHEMA_VERSION;
  exportedAt: string;
  project: ProjectRecord;
}

export function createEmptyScene(): ProjectSceneDocument {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    canvasPreset: 'portrait-1080p',
    width: 1080,
    height: 1920,
    layers: [],
    textStyle: { ...DEFAULT_STUDIO_TEXT_STYLE },
    imageSettings: {
      radius: 0,
      removeBackground: false,
      backgroundColor: '#07911d',
      backgroundSensitivity: 32,
    },
    avatarSettings: {
      productSource: 'manual',
      productLink: '',
      products: [{ name: '', information: '' }],
      scripts: [''],
    },
    livestreamSettings: {
      tiktokUsername: '',
      voice: 'Mỹ Dung',
      globalCooldown: 2,
      userCooldown: 30,
      duplicateWindow: 45,
      minimumCommentLength: 3,
      allowKeywords: [],
      blockKeywords: [],
      bannedOutputTerms: [],
      minimumPinTime: 60,
      productPinEnabled: false,
      triggers: [
        { event: 'chat', enabled: true, actionType: 'voice_tts' },
        { event: 'gift', enabled: true, actionType: 'voice_tts' },
        { event: 'like', enabled: false, actionType: 'voice_tts' },
        { event: 'follow', enabled: true, actionType: 'voice_tts' },
        { event: 'share', enabled: true, actionType: 'voice_tts' },
      ],
    },
    manualPlaybackSettings: {
      enabled: false,
      playlist: [],
    },
    preparedScriptSettings: {
      enabled: true,
      scripts: [],
    },
    aiSettings: createDefaultAiReplySettings(),
    ttsSettings: createDefaultTtsProjectSettings(),
    products: [],
    mediaReferences: [],
  };
}

export function createProjectSceneLayer(
  id: string,
  name: string,
  kind: ProjectLayerKind,
  source: ProjectSceneLayer['source'] = { type: 'none', assetId: null, mediaReferenceId: null },
): ProjectSceneLayer {
  return {
    id,
    name,
    kind,
    transform: { ...DEFAULT_LAYER_TRANSFORM },
    visible: true,
    locked: false,
    opacity: 1,
    fitMode: 'contain',
    loop: kind === 'gif' || kind === 'video' || kind === 'audio',
    muted: kind === 'video',
    volume: 1,
    avatarState: kind === 'avatar' ? 'idle' : 'none',
    chromaKey: { enabled: false, color: '#00ff00', tolerance: 24 },
    source: { ...source },
  };
}

export function createDefaultProjects(now = new Date()): ProjectRecord[] {
  const atOffset = (milliseconds: number): string => new Date(now.getTime() - milliseconds).toISOString();
  return [
    { id: 'perfume', title: 'Perfume 11:48:42 PM', posterPreset: 'gold', scene: createEmptyScene(), createdAt: atOffset(240_000), updatedAt: atOffset(240_000), lastOpenedAt: null },
    { id: 'beauty', title: 'Beauty 2 10:53:56 PM', posterPreset: 'blossom', scene: createEmptyScene(), createdAt: atOffset(7_080_000), updatedAt: atOffset(7_080_000), lastOpenedAt: null },
    { id: 'perfume-empty', title: 'Perfume 10:53:14 PM', posterPreset: 'empty-avatar', scene: createEmptyScene(), createdAt: atOffset(7_140_000), updatedAt: atOffset(7_140_000), lastOpenedAt: null },
    { id: 'new-project', title: 'Dự án mới 9:45:53 PM', posterPreset: 'product', scene: createEmptyScene(), createdAt: atOffset(7_200_000), updatedAt: atOffset(7_200_000), lastOpenedAt: null },
  ];
}
import { DEFAULT_LAYER_TRANSFORM, type LayerTransform } from '../studio/layer-transform';
import { DEFAULT_STUDIO_TEXT_STYLE, type StudioTextStyle } from '../studio/text-style';
import type { ProductCatalogItem } from './products';
import { createDefaultAiReplySettings, type AiReplySettings } from './ai';
import { createDefaultTtsProjectSettings, type TtsProjectSettings } from './tts';
