import { z } from 'zod';
import { PROJECT_EXPORT_FORMAT, PROJECT_SCHEMA_VERSION, createEmptyScene, type ProjectSceneDocument } from '../contracts/projects';
import { productCatalogSchema } from './products';
import { aiReplySettingsSchema } from './ai';
import { ttsProjectSettingsSchema } from './tts';

export const projectIdSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9_-]*$/i);
export const projectTitleSchema = z.string().trim().min(1).max(80);
export const projectPosterPresetSchema = z.enum(['gold', 'blossom', 'empty-avatar', 'product']);
export const projectLayerTransformSchema = z.object({
  x: z.number().finite().min(-100).max(100),
  y: z.number().finite().min(-100).max(100),
  scaleX: z.number().finite().min(0.25).max(3),
  scaleY: z.number().finite().min(0.25).max(3),
  rotation: z.number().finite().min(-180).max(180),
});
export const projectTextStyleSchema = z.object({
  content: z.string().max(160),
  font: z.enum(['Arial', 'Georgia', 'Impact', 'Oswald', 'Montserrat', 'Playfair Display']),
  size: z.number().int().min(12).max(96),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  align: z.enum(['left', 'center', 'right']),
  bold: z.boolean(),
  italic: z.boolean(),
});
export const projectSceneLayerSchema = z.object({
  id: projectIdSchema,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['avatar', 'image', 'gif', 'video', 'audio', 'text']),
  transform: projectLayerTransformSchema,
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().finite().min(0).max(1),
  fitMode: z.enum(['contain', 'cover', 'fill']),
  loop: z.boolean(),
  muted: z.boolean(),
  volume: z.number().finite().min(0).max(1),
  avatarState: z.enum(['none', 'idle', 'talking']),
  avatarMotion: z.enum(['idle', 'talk', 'point-product', 'point-cart', 'listen', 'thank', 'wave']).nullable().default(null),
  chromaKey: z.object({
    enabled: z.boolean(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    tolerance: z.number().int().min(0).max(100),
  }),
  source: z.object({
    type: z.enum(['none', 'builtin', 'media', 'text']),
    assetId: z.enum([
      'template-host',
      'beauty-model',
      'beauty-studio',
      'beauty-cream',
      'background-white-clean',
      'background-white-warm',
      'background-white-studio',
      'flower-video',
      'flower-gif',
      'sticker-freeship',
      'sticker-hot-deal',
      'sticker-live-only',
      'sticker-sale-50',
    ]).nullable(),
    mediaReferenceId: projectIdSchema.nullable(),
  }).refine((source) => (
    source.type === 'builtin' ? source.assetId !== null && source.mediaReferenceId === null
      : source.type === 'media' ? source.mediaReferenceId !== null && source.assetId === null
        : source.assetId === null && source.mediaReferenceId === null
  ), 'Layer source fields must match the selected source type.'),
});
export const projectMediaKindSchema = z.enum(['image', 'video', 'audio']);
export const absoluteMediaPathSchema = z.string().trim().min(1).max(2048).refine(
  (value) => /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value),
  'Media path must be absolute.',
);
export const projectMediaReferenceSchema = z.object({
  id: projectIdSchema,
  label: z.string().trim().min(1).max(120),
  kind: projectMediaKindSchema,
  path: absoluteMediaPathSchema,
});
export const projectImageSettingsSchema = z.object({
  radius: z.number().int().min(0).max(120),
  removeBackground: z.boolean(),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  backgroundSensitivity: z.number().int().min(0).max(100),
});
export const projectScriptProductSchema = z.object({
  name: z.string().max(40),
  information: z.string().max(500),
});
export const projectAvatarSettingsSchema = z.object({
  productSource: z.enum(['manual', 'manager']),
  productLink: z.string().max(2048),
  products: z.array(projectScriptProductSchema).min(1).max(50),
  scripts: z.array(z.string().max(5000)).min(1).max(50),
});
export const projectTriggerSettingSchema = z.object({
  event: z.enum(['chat', 'gift', 'like', 'follow', 'share']),
  enabled: z.boolean(),
  actionType: z.enum(['ignore', 'voice_tts', 'ai_speech']),
});
export const projectLivestreamSettingsSchema = z.object({
  tiktokUsername: z.string().trim().max(120),
  voice: z.string().trim().max(80),
  globalCooldown: z.number().min(0).max(10),
  userCooldown: z.number().int().min(5).max(120),
  duplicateWindow: z.number().int().min(0).max(600),
  minimumCommentLength: z.number().int().min(0).max(40),
  allowKeywords: z.array(z.string().trim().min(1).max(80)).max(100),
  blockKeywords: z.array(z.string().trim().min(1).max(80)).max(100),
  bannedOutputTerms: z.array(z.string().trim().min(1).max(80)).max(100),
  minimumPinTime: z.number().int().min(30).max(300),
  productPinEnabled: z.boolean(),
  triggers: z.array(projectTriggerSettingSchema).length(5).refine(
    (triggers) => new Set(triggers.map((trigger) => trigger.event)).size === 5,
    'Each trigger event must appear exactly once.',
  ),
});
export const projectManualPlaybackItemSchema = z.object({
  layerId: projectIdSchema,
  enabled: z.boolean(),
  role: z.enum(['idle', 'response']).default('idle'),
});
export const projectManualPlaybackSettingsSchema = z.object({
  enabled: z.boolean(),
  playlist: z.array(projectManualPlaybackItemSchema).max(20).refine(
    (items) => new Set(items.map((item) => item.layerId)).size === items.length,
    'Playlist layer IDs must be unique.',
  ),
});
export const projectPreparedScriptSchema = z.object({
  id: projectIdSchema,
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(19),
  playbackType: z.enum(['video', 'audio', 'tts']),
  role: z.enum(['idle', 'activation', 'conversation']),
  mediaLayerId: projectIdSchema.nullable(),
  audioLayerId: projectIdSchema.nullable(),
  avatarLayerId: projectIdSchema.nullable(),
  speechText: z.string().trim().max(5_000),
  interruptMode: z.enum(['immediate', 'after-current']),
  completionMode: z.enum(['stop', 'next', 'resume-sequence']),
}).superRefine((script, context) => {
  if (script.playbackType === 'tts' && !script.speechText) {
    context.addIssue({ code: 'custom', path: ['speechText'], message: 'TTS scripts need speech text.' });
  }
  if (script.playbackType !== 'tts' && !script.mediaLayerId) {
    context.addIssue({ code: 'custom', path: ['mediaLayerId'], message: 'Media scripts need a source layer.' });
  }
  if (script.playbackType === 'tts' && script.mediaLayerId !== null) {
    context.addIssue({ code: 'custom', path: ['mediaLayerId'], message: 'TTS scripts cannot reference a media layer.' });
  }
  if (script.playbackType !== 'video' && script.audioLayerId !== null) {
    context.addIssue({ code: 'custom', path: ['audioLayerId'], message: 'Only video scripts can have an attached audio track.' });
  }
});
export const projectPreparedScriptSettingsSchema = z.object({
  enabled: z.boolean(),
  scripts: z.array(projectPreparedScriptSchema).max(20).superRefine((scripts, context) => {
    if (new Set(scripts.map((script) => script.id)).size !== scripts.length) context.addIssue({ code: 'custom', message: 'Script IDs must be unique.' });
    if (new Set(scripts.map((script) => script.order)).size !== scripts.length) context.addIssue({ code: 'custom', message: 'Script orders must be unique.' });
  }),
});
export const projectSceneSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  canvasPreset: z.enum(['portrait-1080p', 'landscape-1080p']),
  width: z.union([z.literal(1080), z.literal(1920)]),
  height: z.union([z.literal(1080), z.literal(1920)]),
  layers: z.array(projectSceneLayerSchema).max(500),
  textStyle: projectTextStyleSchema,
  imageSettings: projectImageSettingsSchema,
  avatarSettings: projectAvatarSettingsSchema,
  livestreamSettings: projectLivestreamSettingsSchema,
  manualPlaybackSettings: projectManualPlaybackSettingsSchema,
  preparedScriptSettings: projectPreparedScriptSettingsSchema,
  aiSettings: aiReplySettingsSchema,
  ttsSettings: ttsProjectSettingsSchema,
  products: productCatalogSchema,
  mediaReferences: z.array(projectMediaReferenceSchema).max(500).refine(
    (references) => new Set(references.map((reference) => reference.id)).size === references.length,
    'Media reference IDs must be unique.',
  ),
}).refine(
  (scene) => scene.canvasPreset === 'portrait-1080p'
    ? scene.width === 1080 && scene.height === 1920
    : scene.width === 1920 && scene.height === 1080,
  'Canvas dimensions must match the selected preset.',
).superRefine((scene, context) => {
  scene.preparedScriptSettings.scripts.forEach((script, index) => {
    if (script.avatarLayerId && !scene.layers.some((layer) => layer.id === script.avatarLayerId && layer.kind === 'avatar')) {
      context.addIssue({ code: 'custom', path: ['preparedScriptSettings', 'scripts', index, 'avatarLayerId'], message: 'Script avatar must reference an avatar layer.' });
    }
    if (script.audioLayerId && !scene.layers.some((layer) => layer.id === script.audioLayerId && layer.kind === 'audio')) {
      context.addIssue({ code: 'custom', path: ['preparedScriptSettings', 'scripts', index, 'audioLayerId'], message: 'Attached audio must reference an audio layer.' });
    }
  });
});
export const projectRecordSchema = z.object({
  id: projectIdSchema,
  title: projectTitleSchema,
  posterPreset: projectPosterPresetSchema,
  scene: projectSceneSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastOpenedAt: z.iso.datetime().nullable(),
});
export const projectCreateSchema = z.object({
  title: projectTitleSchema,
  posterPreset: projectPosterPresetSchema.optional(),
});
export const projectRenameSchema = z.object({ id: projectIdSchema, title: projectTitleSchema });
export const projectIdPayloadSchema = z.object({ id: projectIdSchema });
export const projectSceneWriteSchema = z.object({ id: projectIdSchema, scene: projectSceneSchema });
export const projectMediaCheckSchema = z.object({ references: z.array(projectMediaReferenceSchema).max(500) });
export const projectMediaPickSchema = z.object({
  kind: projectMediaKindSchema,
  label: z.string().trim().min(1).max(120),
});
export const projectImportSchema = z.object({ data: z.string().min(1).max(5_000_000) });
const portableProjectRecordSchema = projectRecordSchema.omit({ scene: true }).extend({ scene: z.unknown() });
export const projectExportEnvelopeSchema = z.object({
  format: z.literal(PROJECT_EXPORT_FORMAT),
  version: z.number().int().min(1).max(PROJECT_SCHEMA_VERSION),
  exportedAt: z.iso.datetime(),
  project: portableProjectRecordSchema,
}).transform((envelope) => ({
  ...envelope,
  version: PROJECT_SCHEMA_VERSION,
  project: projectRecordSchema.parse({
    ...envelope.project,
    scene: migrateProjectScene(envelope.project.scene),
  }),
}));

function migrateManualPlaybackSettings(
  value: unknown,
  fallback: ProjectSceneDocument['manualPlaybackSettings'],
): ProjectSceneDocument['manualPlaybackSettings'] {
  const current = projectManualPlaybackSettingsSchema.safeParse(value);
  if (current.success) return {
    enabled: current.data.enabled,
    // Keep the legacy idle form compact so existing portable projects round-trip unchanged.
    playlist: current.data.playlist.map(({ role, ...item }) => role === 'idle' ? item : { ...item, role }),
  };
  if (!value || typeof value !== 'object') return fallback;
  const legacy = value as Record<string, unknown>;
  const idleLayerIds = z.array(projectIdSchema).max(20).catch([]).parse(legacy.idleLayerIds);
  return { enabled: Boolean(legacy.enabled), playlist: idleLayerIds.map((layerId) => ({ layerId, enabled: true, role: 'idle' })) };
}

function migratePreparedScriptSettings(
  value: unknown,
  manualPlayback: ProjectSceneDocument['manualPlaybackSettings'],
  layers: ProjectSceneDocument['layers'],
  fallback: ProjectSceneDocument['preparedScriptSettings'],
): ProjectSceneDocument['preparedScriptSettings'] {
  const current = projectPreparedScriptSettingsSchema.safeParse(value);
  if (current.success && (current.data.scripts.length > 0 || manualPlayback.playlist.length === 0)) {
    return { ...current.data, scripts: [...current.data.scripts].sort((a, b) => a.order - b.order).map((script, order) => ({ ...script, order })) };
  }
  // Schema v13/v14 did not have a behavior role. Preserve its scripts while
  // making the new activation behavior explicit and safely unassigned.
  const legacy = z.object({
    enabled: z.boolean(),
    scripts: z.array(z.object({
      id: projectIdSchema, name: z.string().trim().min(1).max(120), enabled: z.boolean(), order: z.number().int().min(0).max(19),
      playbackType: z.enum(['video', 'audio', 'tts']), mediaLayerId: projectIdSchema.nullable(), avatarLayerId: projectIdSchema.nullable().optional(), speechText: z.string().trim().max(5_000),
      role: z.enum(['idle', 'activation', 'conversation']).optional(), audioLayerId: projectIdSchema.nullable().optional(),
      interruptMode: z.enum(['immediate', 'after-current']), completionMode: z.enum(['stop', 'next', 'resume-sequence']),
    })).max(20),
  }).safeParse(value);
  if (legacy.success && (legacy.data.scripts.length > 0 || manualPlayback.playlist.length === 0)) {
    return projectPreparedScriptSettingsSchema.parse({
      ...legacy.data,
      scripts: legacy.data.scripts.map((script) => ({ ...script, avatarLayerId: script.avatarLayerId ?? null, audioLayerId: script.audioLayerId ?? null, role: script.role ?? 'activation' })),
    });
  }
  const scripts = manualPlayback.playlist.flatMap((item, order) => {
    const layer = layers.find((candidate) => candidate.id === item.layerId);
    if (!layer || (layer.kind !== 'video' && layer.kind !== 'audio')) return [];
    return [{
      id: `script-${order + 1}-${layer.id}`,
      name: `R${order + 1} - ${layer.name}`,
      enabled: item.enabled,
      order,
      playbackType: layer.kind,
      role: 'idle' as const,
      mediaLayerId: layer.id,
      audioLayerId: null,
      avatarLayerId: null,
      speechText: '',
      interruptMode: 'after-current' as const,
      completionMode: 'next' as const,
    }];
  });
  return scripts.length ? { enabled: manualPlayback.enabled, scripts } : fallback;
}

export function migrateProjectScene(scene: unknown): ProjectSceneDocument {
  const current = projectSceneSchema.safeParse(scene);
  if (current.success) return current.data;

  const defaults = createEmptyScene();
  const source = scene && typeof scene === 'object' ? scene as Record<string, unknown> : {};
  const sourceLivestream = source.livestreamSettings && typeof source.livestreamSettings === 'object'
    ? source.livestreamSettings as Record<string, unknown>
    : {};
  const legacyTriggerSchema = z.object({
    event: z.enum(['chat', 'gift', 'like', 'follow', 'share']),
    enabled: z.boolean(),
    actionType: z.enum(['ignore', 'voice_tts', 'ai_speech']).optional(),
    reply: z.literal('voice_tts').optional(),
  });
  const legacyTriggers = z.array(legacyTriggerSchema).safeParse(sourceLivestream.triggers);
  const migratedTriggers = legacyTriggers.success && legacyTriggers.data.length === 5
    ? legacyTriggers.data.map((trigger) => ({ event: trigger.event, enabled: trigger.enabled, actionType: trigger.actionType ?? trigger.reply ?? 'voice_tts' as const }))
    : defaults.livestreamSettings.triggers;
  const migratedLayers = z.array(z.unknown()).max(500).catch([]).parse(source.layers).map((layer, index) => {
    const candidate = layer && typeof layer === 'object' ? layer as Record<string, unknown> : {};
    const kind = z.enum(['avatar', 'image', 'gif', 'video', 'audio', 'text']).catch('image').parse(candidate.kind);
    return projectSceneLayerSchema.parse({
      ...candidate,
      id: candidate.id ?? `migrated-layer-${index + 1}`,
      name: candidate.name ?? `Layer ${index + 1}`,
      kind,
      transform: projectLayerTransformSchema.catch(defaults.layers[0]?.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }).parse(candidate.transform),
      visible: candidate.visible ?? true, locked: candidate.locked ?? false, opacity: candidate.opacity ?? 1, fitMode: candidate.fitMode ?? 'contain',
      loop: candidate.loop ?? (kind === 'gif' || kind === 'video' || kind === 'audio'), muted: candidate.muted ?? (kind === 'video'), volume: candidate.volume ?? 1,
      avatarState: candidate.avatarState ?? (kind === 'avatar' ? 'idle' : 'none'), avatarMotion: candidate.avatarMotion ?? null, chromaKey: candidate.chromaKey ?? { enabled: false, color: '#00ff00', tolerance: 24 },
      source: candidate.source ?? { type: 'none', assetId: null, mediaReferenceId: null },
    });
  });
  const manualPlaybackSettings = migrateManualPlaybackSettings(source.manualPlaybackSettings, defaults.manualPlaybackSettings);
  return projectSceneSchema.parse({
    ...defaults,
    ...source,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    canvasPreset: source.canvasPreset ?? defaults.canvasPreset,
    layers: migratedLayers,
    textStyle: projectTextStyleSchema.catch(defaults.textStyle).parse(source.textStyle),
    imageSettings: projectImageSettingsSchema.catch(defaults.imageSettings).parse(source.imageSettings),
    avatarSettings: projectAvatarSettingsSchema.catch(defaults.avatarSettings).parse(source.avatarSettings),
    livestreamSettings: projectLivestreamSettingsSchema.parse({
      ...defaults.livestreamSettings,
      ...sourceLivestream,
      triggers: migratedTriggers,
    }),
    manualPlaybackSettings,
    preparedScriptSettings: migratePreparedScriptSettings(source.preparedScriptSettings, manualPlaybackSettings, migratedLayers, defaults.preparedScriptSettings),

    aiSettings: aiReplySettingsSchema.catch(defaults.aiSettings).parse(source.aiSettings),
    ttsSettings: ttsProjectSettingsSchema.catch(defaults.ttsSettings).parse(source.ttsSettings),
    products: productCatalogSchema.catch(defaults.products).parse(source.products),
    mediaReferences: z.array(projectMediaReferenceSchema).max(500).catch(defaults.mediaReferences).parse(source.mediaReferences),
  });
}
