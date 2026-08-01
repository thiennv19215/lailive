import { describe, expect, it } from 'vitest';
import { createEmptyScene, PROJECT_EXPORT_FORMAT, PROJECT_SCHEMA_VERSION } from '../../src/shared/contracts/projects';
import { absoluteMediaPathSchema, migrateProjectScene, projectCreateSchema, projectExportEnvelopeSchema, projectIdSchema, projectRecordSchema, projectSceneLayerSchema } from '../../src/shared/validation/projects';

describe('project validation', () => {
  it('normalizes a valid create payload and rejects blank or oversized names', () => {
    expect(projectCreateSchema.parse({ title: '  Studio mỹ phẩm  ' })).toEqual({ title: 'Studio mỹ phẩm' });
    expect(projectCreateSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(projectCreateSchema.safeParse({ title: 'x'.repeat(81) }).success).toBe(false);
  });

  it('accepts safe project ids and rejects path traversal', () => {
    expect(projectIdSchema.parse('project-safe_01')).toBe('project-safe_01');
    expect(projectIdSchema.safeParse('../settings').success).toBe(false);
  });

  it('requires versioned portrait or landscape canvas dimensions', () => {
    const timestamp = new Date().toISOString();
    expect(projectRecordSchema.parse({
      id: 'project-1',
      title: 'Project 1',
      posterPreset: 'product',
      scene: createEmptyScene(),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
    }).scene.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(projectRecordSchema.safeParse({
      id: 'project-wide',
      title: 'Project wide',
      posterPreset: 'product',
      scene: { ...createEmptyScene(), canvasPreset: 'landscape-1080p', width: 1920, height: 1080 },
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
    }).success).toBe(true);
    expect(projectRecordSchema.safeParse({
      id: 'project-1',
      title: 'Project 1',
      posterPreset: 'product',
      scene: { ...createEmptyScene(), width: 720 },
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
    }).success).toBe(false);
  });

  it('accepts the current portable export envelope and upgrades older scene documents', () => {
    const timestamp = new Date().toISOString();
    const project = projectRecordSchema.parse({
      id: 'export-project', title: 'Export project', posterPreset: 'product', scene: createEmptyScene(),
      createdAt: timestamp, updatedAt: timestamp, lastOpenedAt: null,
    });
    expect(projectExportEnvelopeSchema.parse({
      format: PROJECT_EXPORT_FORMAT, version: PROJECT_SCHEMA_VERSION, exportedAt: timestamp, project,
    }).project.id).toBe('export-project');
    const legacy = projectExportEnvelopeSchema.parse({
      format: PROJECT_EXPORT_FORMAT,
      version: 2,
      exportedAt: timestamp,
      project: { ...project, scene: { schemaVersion: 2, width: 1080, height: 1920, layers: [], textStyle: project.scene.textStyle } },
    });
    expect(legacy.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(legacy.project.scene.livestreamSettings.globalCooldown).toBe(2);
  });

  it('validates absolute media paths and repairs missing v2 settings with defaults', () => {
    expect(absoluteMediaPathSchema.safeParse('C:\\media\\avatar.mp4').success).toBe(true);
    expect(absoluteMediaPathSchema.safeParse('/var/media/avatar.mp4').success).toBe(true);
    expect(absoluteMediaPathSchema.safeParse('../avatar.mp4').success).toBe(false);
    const migrated = migrateProjectScene({ schemaVersion: 2, width: 1080, height: 1920, layers: [], textStyle: createEmptyScene().textStyle });
    expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.imageSettings.backgroundColor).toBe('#07911d');
    expect(migrated.avatarSettings.scripts).toEqual(['']);
    expect(migrated.aiSettings.timeoutMs).toBe(20_000);
    expect(migrated.ttsSettings.timeoutMs).toBe(120_000);
    expect(migrated.products).toEqual([]);
    expect(migrated.mediaReferences).toEqual([]);
    expect(migrated.manualPlaybackSettings).toEqual({ enabled: false, idleLayerIds: [], responseLayerIds: [], selectedResponseLayerId: null });
    expect(migrated.canvasPreset).toBe('portrait-1080p');
  });

  it('upgrades legacy layer records with Phase 8 editor metadata', () => {
    const migrated = migrateProjectScene({
      ...createEmptyScene(),
      schemaVersion: 7,
      canvasPreset: undefined,
      layers: [{ id: 'legacy-avatar', name: 'Legacy avatar', kind: 'avatar', transform: { x: 4, y: 2, scaleX: 1, scaleY: 1, rotation: 0 } }],
    });
    expect(migrated.layers[0]).toMatchObject({
      id: 'legacy-avatar',
      visible: true,
      locked: false,
      opacity: 1,
      volume: 1,
      fitMode: 'contain',
      avatarState: 'idle',
      chromaKey: { enabled: false, color: '#00ff00', tolerance: 24 },
      source: { type: 'none', assetId: null, mediaReferenceId: null },
    });
  });

  it('accepts prepared audio sources with bounded volume and migrates old media layers', () => {
    const migrated = migrateProjectScene({
      ...createEmptyScene(),
      schemaVersion: 10,
      mediaReferences: [{ id: 'audio-script', label: 'Kịch bản mở đầu', kind: 'audio', path: 'C:\\media\\opening.mp3' }],
      layers: [{
        id: 'audio-r1', name: 'Kịch bản mở đầu', kind: 'audio',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        visible: true, locked: false, opacity: 1, fitMode: 'contain', loop: true, muted: false,
        avatarState: 'none', chromaKey: { enabled: false, color: '#00ff00', tolerance: 24 },
        source: { type: 'media', assetId: null, mediaReferenceId: 'audio-script' },
      }],
      manualPlaybackSettings: { enabled: true, idleLayerIds: ['audio-r1'], responseLayerIds: [], selectedResponseLayerId: null },
    });

    expect(migrated.layers[0]).toMatchObject({ kind: 'audio', volume: 1, muted: false });
    expect(migrated.manualPlaybackSettings.idleLayerIds).toEqual(['audio-r1']);
    expect(projectSceneLayerSchema.safeParse({ ...migrated.layers[0], volume: 1.1 }).success).toBe(false);
  });

  it('accepts controlled built-in layer sources and rejects mismatched source fields', () => {
    const layer = migrateProjectScene({
      ...createEmptyScene(),
      layers: [{
        id: 'video-layer',
        name: 'Flower video',
        kind: 'video',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        source: { type: 'builtin', assetId: 'flower-video', mediaReferenceId: null },
      }],
    }).layers[0]!;
    expect(layer.source).toEqual({ type: 'builtin', assetId: 'flower-video', mediaReferenceId: null });

    expect(projectSceneLayerSchema.parse({
      ...layer,
      kind: 'gif',
      source: { type: 'builtin', assetId: 'flower-gif', mediaReferenceId: null },
    }).source).toEqual({ type: 'builtin', assetId: 'flower-gif', mediaReferenceId: null });
    expect(projectSceneLayerSchema.safeParse({
      ...layer,
      source: { type: 'builtin', assetId: null, mediaReferenceId: null },
    }).success).toBe(false);
    expect(projectSceneLayerSchema.safeParse({
      ...layer,
      source: { type: 'media', assetId: 'flower-video', mediaReferenceId: 'media-1' },
    }).success).toBe(false);
  });

  it('upgrades v3 livestream settings without losing configured values', () => {
    const defaults = createEmptyScene();
    const legacy = migrateProjectScene({
      ...defaults,
      schemaVersion: 3,
      livestreamSettings: {
        tiktokUsername: 'studio_demo',
        voice: 'Ngoc Lam',
        globalCooldown: 4,
        userCooldown: 55,
        minimumPinTime: 90,
        productPinEnabled: true,
        triggers: defaults.livestreamSettings.triggers.map((trigger) => ({ event: trigger.event, enabled: trigger.event !== 'share', reply: 'voice_tts' })),
      },
    });

    expect(legacy.livestreamSettings).toMatchObject({
      tiktokUsername: 'studio_demo',
      voice: 'Ngoc Lam',
      globalCooldown: 4,
      userCooldown: 55,
      duplicateWindow: 45,
      minimumCommentLength: 3,
      productPinEnabled: true,
    });
    expect(legacy.livestreamSettings.triggers.find((trigger) => trigger.event === 'share')).toMatchObject({ enabled: false, actionType: 'voice_tts' });
  });
});
