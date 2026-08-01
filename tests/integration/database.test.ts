import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsDatabase } from '../../electron/services/database';
import { createEmptyScene, createProjectSceneLayer, PROJECT_SCHEMA_VERSION } from '../../src/shared/contracts/projects';
import { DEFAULT_LAYER_TRANSFORM } from '../../src/shared/studio/layer-transform';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('SettingsDatabase', () => {
  it('persists a setting across database restarts', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.db');

    const first = await SettingsDatabase.open(filePath);
    first.set('sample.workspace-name', 'Studio persisted');
    first.close();

    const second = await SettingsDatabase.open(filePath);
    expect(second.get<string>('sample.workspace-name')?.value).toBe('Studio persisted');
    second.close();
  });

  it('persists the complete local project lifecycle across database restarts', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-projects-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'projects.db');

    const first = await SettingsDatabase.open(filePath);
    expect(first.listProjects().map((project) => project.id)).toEqual([
      'perfume',
      'beauty',
      'perfume-empty',
      'new-project',
    ]);
    const created = first.createProject({ title: 'Studio bền vững' });
    const renamed = first.renameProject(created.id, 'Studio đã đổi tên');
    const saved = first.saveProjectScene(renamed.id, {
      ...createEmptyScene(),
      imageSettings: { radius: 24, removeBackground: true, backgroundColor: '#123456', backgroundSensitivity: 47 },
      avatarSettings: { productSource: 'manual', productLink: 'https://example.invalid/product', products: [{ name: 'Serum', information: 'Persisted product details' }], scripts: ['Persisted avatar script'] },
      livestreamSettings: { ...createEmptyScene().livestreamSettings, tiktokUsername: 'studio_test', voice: 'Ngoc Lam', globalCooldown: 3.5, productPinEnabled: true },
      mediaReferences: [
        { id: 'media-avatar', label: 'Avatar test', kind: 'video', path: path.join(directory, 'missing-avatar.mp4') },
        { id: 'audio-reply-file', label: 'Audio reply', kind: 'audio', path: path.join(directory, 'missing-reply.mp3') },
      ],
      manualPlaybackSettings: { enabled: true, idleLayerIds: ['video-idle'], responseLayerIds: ['audio-reply'], selectedResponseLayerId: 'audio-reply' },
      layers: [
        { ...createProjectSceneLayer('layer-saved', 'Saved text', 'text'), transform: { ...DEFAULT_LAYER_TRANSFORM, x: 12 } },
        createProjectSceneLayer('video-idle', 'Idle R1', 'video', { type: 'builtin', assetId: 'flower-video', mediaReferenceId: null }),
        { ...createProjectSceneLayer('audio-reply', 'Manual audio reply', 'audio', { type: 'media', assetId: null, mediaReferenceId: 'audio-reply-file' }), volume: 0.65 },
      ],
      textStyle: { ...createEmptyScene().textStyle, content: 'Đã tự động lưu' },
    });
    const duplicate = first.duplicateProject(renamed.id);
    const imported = first.importProject(first.exportProject(renamed.id));
    const touched = first.touchProject(renamed.id);
    expect(renamed.title).toBe('Studio đã đổi tên');
    expect(duplicate.title).toBe('Studio đã đổi tên (bản sao)');
    expect(saved.scene.layers[0]?.transform.x).toBe(12);
    expect(imported.title).toBe('Studio đã đổi tên (nhập)');
    expect(touched.lastOpenedAt).not.toBeNull();
    expect(first.deleteProject(duplicate.id)).toBe(true);
    expect(first.deleteProject(duplicate.id)).toBe(false);
    first.close();

    const second = await SettingsDatabase.open(filePath);
    expect(second.getProject(created.id)?.title).toBe('Studio đã đổi tên');
    expect(second.getProject(created.id)?.lastOpenedAt).not.toBeNull();
    expect(second.getProject(created.id)?.scene.imageSettings.radius).toBe(24);
    expect(second.getProject(created.id)?.scene.avatarSettings.scripts).toEqual(['Persisted avatar script']);
    expect(second.getProject(created.id)?.scene.livestreamSettings.tiktokUsername).toBe('studio_test');
    expect(second.getProject(created.id)?.scene.manualPlaybackSettings).toEqual({ enabled: true, idleLayerIds: ['video-idle'], responseLayerIds: ['audio-reply'], selectedResponseLayerId: 'audio-reply' });
    expect(second.getProject(created.id)?.scene.layers.find((layer) => layer.id === 'audio-reply')).toMatchObject({ kind: 'audio', volume: 0.65 });
    expect(second.getProject(created.id)?.scene.mediaReferences[0]?.id).toBe('media-avatar');
    expect(second.getProject(created.id)?.scene.textStyle.content).toBe('Đã tự động lưu');
    expect(second.getProject(duplicate.id)).toBeNull();
    expect(second.getProject(imported.id)?.scene.layers[0]?.name).toBe('Saved text');
    expect(second.listProjects()).toHaveLength(6);
    second.close();
  });

  it('recovers a valid database left at the interrupted-save path', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-project-recovery-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'recovered.db');
    const first = await SettingsDatabase.open(filePath);
    first.set('recovery.marker', 'committed');
    first.close();
    fs.renameSync(filePath, `${filePath}.tmp`);

    const recovered = await SettingsDatabase.open(filePath);
    expect(recovered.get<string>('recovery.marker')?.value).toBe('committed');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    recovered.close();
  });

  it('promotes a newer valid interrupted save over the previous valid database', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-project-newer-recovery-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'recovered.db');
    const first = await SettingsDatabase.open(filePath);
    first.set('recovery.marker', 'previous');
    first.close();
    const previousBytes = fs.readFileSync(filePath);

    const second = await SettingsDatabase.open(filePath);
    second.set('recovery.marker', 'newer');
    second.close();
    const newerBytes = fs.readFileSync(filePath);
    fs.writeFileSync(filePath, previousBytes);
    fs.writeFileSync(`${filePath}.tmp`, newerBytes);
    const now = Date.now() / 1000;
    fs.utimesSync(filePath, now - 2, now - 2);
    fs.utimesSync(`${filePath}.tmp`, now, now);

    const recovered = await SettingsDatabase.open(filePath);
    expect(recovered.get<string>('recovery.marker')?.value).toBe('newer');
    expect(recovered.getRecoveryReport()).toEqual({ source: 'temporary', recovered: true, quarantinedCount: 0 });
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(fs.existsSync(`${filePath}.bak`)).toBe(true);
    recovered.close();
  });

  it('restores the latest valid backup when the primary database is corrupt', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-project-backup-recovery-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'recovered.db');
    const first = await SettingsDatabase.open(filePath);
    first.set('recovery.marker', 'backed-up');
    first.close();
    expect(fs.existsSync(`${filePath}.bak`)).toBe(true);
    fs.writeFileSync(filePath, 'not a sqlite database');

    const recovered = await SettingsDatabase.open(filePath);
    expect(recovered.get<string>('recovery.marker')?.value).toBe('backed-up');
    expect(recovered.getRecoveryReport()).toEqual({ source: 'backup', recovered: true, quarantinedCount: 1 });
    expect(fs.readdirSync(directory).some((entry) => entry.startsWith('recovered.db.invalid-'))).toBe(true);
    recovered.close();
  });

  it('fails closed when every recovery candidate is corrupt', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-project-failed-recovery-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'corrupt.db');
    fs.writeFileSync(filePath, 'invalid-main');
    fs.writeFileSync(`${filePath}.tmp`, 'invalid-temporary');
    fs.writeFileSync(`${filePath}.bak`, 'invalid-backup');

    await expect(SettingsDatabase.open(filePath)).rejects.toThrow('Không thể khôi phục cơ sở dữ liệu local');
    expect(fs.readdirSync(directory).filter((entry) => entry.includes('.invalid-'))).toHaveLength(3);
  });

  it('backs up and upgrades a legacy project document before migration', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-project-migration-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'legacy.db');
    const SQL = await initSqlJs();
    const legacy = new SQL.Database();
    legacy.run('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    legacy.run('INSERT INTO schema_migrations VALUES (1, ?), (2, ?)', [new Date().toISOString(), new Date().toISOString()]);
    legacy.run('CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)');
    legacy.run('CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, poster_preset TEXT NOT NULL, scene_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_at TEXT)');
    const timestamp = new Date().toISOString();
    legacy.run('INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)', [
      'legacy-project',
      'Legacy project',
      'product',
      JSON.stringify({ schemaVersion: 1, width: 1080, height: 1920, layers: [] }),
      timestamp,
      timestamp,
      null,
    ]);
    fs.writeFileSync(filePath, Buffer.from(legacy.export()));
    legacy.close();

    const migrated = await SettingsDatabase.open(filePath);
    expect(migrated.getProject('legacy-project')?.scene.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.getProject('legacy-project')?.scene.textStyle.content).toBe('CHỈ CÓ TRÊN LIVE');
    expect(fs.existsSync(`${filePath}.bak`)).toBe(true);
    migrated.close();
  });
});
