import { describe, expect, it } from 'vitest';
import { createEmptyScene, createProjectSceneLayer, PROJECT_EXPORT_FORMAT, PROJECT_SCHEMA_VERSION } from '../../src/shared/contracts/projects';
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
    expect(migrated.manualPlaybackSettings).toEqual({ enabled: false, playlist: [] });
    expect(migrated.preparedScriptSettings).toEqual({ enabled: true, scripts: [] });
    expect(migrated.stateMachineSettings).toMatchObject({ enabled: false });
    expect(migrated.stateMachineSettings.definitions.WELCOME).toMatchObject({ state: 'WELCOME', duration: 8, nextState: 'IDLE' });
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

  it('enables embedded audio for new and legacy video sources', () => {
    expect(createProjectSceneLayer('new-video', 'New video', 'video').muted).toBe(false);
    const migrated = migrateProjectScene({
      ...createEmptyScene(),
      schemaVersion: 18,
      mediaReferences: [{ id: 'avatar-video-file', label: 'Avatar video', kind: 'video', path: 'C:\\media\\avatar.mp4' }],
      layers: [{
        ...createProjectSceneLayer('legacy-video', 'Legacy video', 'video'),
        muted: true,
      }, {
        ...createProjectSceneLayer('legacy-avatar', 'Legacy avatar', 'avatar', { type: 'media', assetId: null, mediaReferenceId: 'avatar-video-file' }),
        muted: true,
      }],
    });
    expect(migrated.layers.map((layer) => layer.muted)).toEqual([false, false]);
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
      manualPlaybackSettings: { enabled: true, playlist: [{ layerId: 'audio-r1', enabled: true }] },
    });

    expect(migrated.layers[0]).toMatchObject({ kind: 'audio', volume: 1, muted: false });
    expect(migrated.manualPlaybackSettings.playlist).toEqual([{ layerId: 'audio-r1', enabled: true, role: 'idle' }]);
    expect(migrated.preparedScriptSettings.scripts[0]).toMatchObject({ playbackType: 'audio', mediaLayerId: 'audio-r1' });
    expect(projectSceneLayerSchema.safeParse({ ...migrated.layers[0], volume: 1.1 }).success).toBe(false);
  });

  it('preserves v13 prepared scripts and leaves their new avatar assignment empty', () => {
    const legacy = createEmptyScene();
    const migrated = migrateProjectScene({
      ...legacy,
      schemaVersion: 13,
      preparedScriptSettings: {
        enabled: true,
        scripts: [{ id: 'r1', name: 'R1', enabled: true, order: 0, playbackType: 'tts', mediaLayerId: null, speechText: 'Xin chao', interruptMode: 'immediate', completionMode: 'stop' }],
      },
    });
    expect(migrated.preparedScriptSettings.scripts).toEqual([expect.objectContaining({ id: 'r1', avatarLayerId: null })]);
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

  it('persists valid state machine definitions while safely disabling malformed legacy settings', () => {
    const scene = createEmptyScene();
    const configured = projectRecordSchema.parse({
      id: 'state-machine-project',
      title: 'State machine project',
      posterPreset: 'product',
      scene: {
        ...scene,
        stateMachineSettings: {
          enabled: true,
          definitions: {
            ...scene.stateMachineSettings.definitions,
            DEMO: {
              ...scene.stateMachineSettings.definitions.DEMO,
              avatar: { assetId: 'demo-avatar', kind: 'video' },
              audio: { assetId: 'demo-audio', kind: 'audio' },
              timeline: [{ checkpoint: 'intro', startTime: 0, endTime: 10, transition: 'fade' }],
            },
          },
        },
      },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastOpenedAt: null,
    });
    expect(configured.scene.stateMachineSettings.enabled).toBe(true);
    expect(configured.scene.stateMachineSettings.definitions.DEMO.timeline).toHaveLength(1);

    const migrated = migrateProjectScene({
      ...scene,
      schemaVersion: 19,
      stateMachineSettings: { enabled: true, definitions: { DEMO: { duration: -1 } } },
    });
    expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.stateMachineSettings).toMatchObject({ enabled: false });
    expect(migrated.preparedScriptSettings).toEqual(scene.preparedScriptSettings);
    expect(migrated.manualPlaybackSettings).toEqual(scene.manualPlaybackSettings);
  });

  it('stores bounded master-video timeline metadata and upgrades v20 projects safely', () => {
    const scene = createEmptyScene();
    const masterVideo = { id: 'long-demo', label: 'Long demo', kind: 'video' as const, path: 'C:\\media\\long-demo.mp4' };
    const configured = projectRecordSchema.parse({
      id: 'master-video-project',
      title: 'Master video project',
      posterPreset: 'product',
      scene: {
        ...scene,
        mediaReferences: [masterVideo],
        stateMachineSettings: {
          ...scene.stateMachineSettings,
          masterVideoAssetId: masterVideo.id,
          durationSeconds: 3_600.5,
        },
      },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastOpenedAt: null,
    });
    expect(configured.scene.stateMachineSettings).toMatchObject({ masterVideoAssetId: 'long-demo', durationSeconds: 3_600.5 });
    expect(projectRecordSchema.safeParse({
      ...configured,
      scene: { ...configured.scene, stateMachineSettings: { ...configured.scene.stateMachineSettings, durationSeconds: 86_401 } },
    }).success).toBe(false);
    expect(projectRecordSchema.safeParse({
      ...configured,
      scene: { ...configured.scene, stateMachineSettings: { ...configured.scene.stateMachineSettings, masterVideoAssetId: 'missing-video' } },
    }).success).toBe(false);

    const upgraded = migrateProjectScene({
      ...scene,
      schemaVersion: 20,
      stateMachineSettings: { enabled: true, definitions: scene.stateMachineSettings.definitions },
    });
    expect(upgraded.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(upgraded.stateMachineSettings).toMatchObject({
      enabled: true,
      masterVideoAssetId: null,
      durationSeconds: 0,
    });
  });

  it('persists the optional single-visual program without replacing legacy state-machine settings', () => {
    const scene = createEmptyScene();
    const visual = { ...scene.layers[0]!, id: 'program-video', name: 'Program visual', kind: 'video' as const };
    const baseAudio = { ...scene.layers[0]!, id: 'program-audio', name: 'Program voice', kind: 'audio' as const };
    const welcomeAudio = { ...scene.layers[0]!, id: 'welcome-audio', name: 'Welcome voice', kind: 'audio' as const };
    const configured = migrateProjectScene({
      ...scene,
      layers: [visual, baseAudio, welcomeAudio],
      preparedLiveProgram: {
        enabled: true,
        visualVideoLayerId: visual.id,
        baseAudioLayerId: baseAudio.id,
        cues: [{ state: 'WELCOME', visualStartAt: 5, visualEndAt: 12, audioLayerId: welcomeAudio.id, behavior: 'interrupt-resume' }],
      },
    });
    expect(configured.preparedLiveProgram).toMatchObject({ enabled: true, visualVideoLayerId: 'program-video', baseAudioLayerId: 'program-audio' });
    expect(configured.preparedLiveProgram.cues[0]).toMatchObject({ state: 'WELCOME', audioLayerId: 'welcome-audio' });
    expect(configured.stateMachineSettings).toEqual(scene.stateMachineSettings);

    const v21 = migrateProjectScene({ ...scene, schemaVersion: 21 });
    expect(v21.preparedLiveProgram).toEqual({ enabled: false, visualVideoLayerId: null, baseAudioLayerId: null, cues: [] });
  });
});
