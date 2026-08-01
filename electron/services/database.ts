import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import initSqlJs, { type Database } from 'sql.js/dist/sql-asm.js';
import type { SettingRecord } from '../../src/shared/contracts/desktop-api';
import { PROJECT_EXPORT_FORMAT, PROJECT_SCHEMA_VERSION, createDefaultProjects, createEmptyScene, type ProjectCreateInput, type ProjectRecord, type ProjectSceneDocument } from '../../src/shared/contracts/projects';
import { migrateProjectScene, projectCreateSchema, projectExportEnvelopeSchema, projectIdSchema, projectRecordSchema, projectSceneSchema, projectTitleSchema } from '../../src/shared/validation/projects';

const migrations = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    poster_preset TEXT NOT NULL,
    scene_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS projects_updated_at_index ON projects(updated_at DESC);`,
];

export class SettingsDatabase {
  private constructor(
    private readonly database: Database,
    private readonly filePath: string,
    private readonly DatabaseClass: DatabaseConstructor,
    private readonly recoveryReport: DatabaseRecoveryReport,
  ) {}

  static async open(filePath: string): Promise<SettingsDatabase> {
    const SQL = await initSqlJs();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const recoveryReport = recoverDatabaseFiles(SQL.Database, filePath);
    const bytes = fs.existsSync(filePath) ? fs.readFileSync(filePath) : undefined;
    const instance = new SettingsDatabase(new SQL.Database(bytes), filePath, SQL.Database, recoveryReport);
    instance.migrate();
    instance.migrateProjectDocuments();
    instance.seedProjects();
    instance.persist();
    return instance;
  }

  get path(): string {
    return this.filePath;
  }

  getRecoveryReport(): DatabaseRecoveryReport {
    return structuredClone(this.recoveryReport);
  }

  get<T = unknown>(key: string): SettingRecord | null {
    const statement = this.database.prepare(
      'SELECT key, value_json, updated_at FROM settings WHERE key = $key',
    );
    try {
      statement.bind({ $key: key });
      if (!statement.step()) return null;
      const row = statement.getAsObject() as {
        key: string;
        value_json: string;
        updated_at: string;
      };
      return { key: row.key, value: JSON.parse(row.value_json) as T, updatedAt: row.updated_at };
    } finally {
      statement.free();
    }
  }

  set(key: string, value: unknown): SettingRecord {
    const updatedAt = new Date().toISOString();
    this.database.run(
      `INSERT INTO settings (key, value_json, updated_at)
       VALUES ($key, $value, $updatedAt)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      { $key: key, $value: JSON.stringify(value), $updatedAt: updatedAt },
    );
    this.persist();
    return { key, value, updatedAt };
  }

  listProjects(): ProjectRecord[] {
    const result = this.database.exec(
      `SELECT id, title, poster_preset, scene_json, created_at, updated_at, last_opened_at
       FROM projects ORDER BY updated_at DESC, created_at DESC`,
    );
    return (result[0]?.values ?? []).map((row) => this.parseProjectRow(row));
  }

  getProject(id: string): ProjectRecord | null {
    const parsedId = projectIdSchema.parse(id);
    const statement = this.database.prepare(
      `SELECT id, title, poster_preset, scene_json, created_at, updated_at, last_opened_at
       FROM projects WHERE id = $id`,
    );
    try {
      statement.bind({ $id: parsedId });
      if (!statement.step()) return null;
      return this.parseProjectObject(statement.getAsObject());
    } finally {
      statement.free();
    }
  }

  createProject(input: ProjectCreateInput): ProjectRecord {
    const parsed = projectCreateSchema.parse(input);
    const timestamp = new Date().toISOString();
    const project: ProjectRecord = {
      id: `project-${randomUUID()}`,
      title: parsed.title,
      posterPreset: parsed.posterPreset ?? 'product',
      scene: createEmptyScene(),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
    };
    this.insertProject(project);
    this.persist();
    return project;
  }

  renameProject(id: string, title: string): ProjectRecord {
    const parsedId = projectIdSchema.parse(id);
    const parsedTitle = projectTitleSchema.parse(title);
    const updatedAt = new Date().toISOString();
    this.database.run(
      'UPDATE projects SET title = $title, updated_at = $updatedAt WHERE id = $id',
      { $id: parsedId, $title: parsedTitle, $updatedAt: updatedAt },
    );
    const project = this.getProject(parsedId);
    if (!project) throw new Error(`Project ${parsedId} was not found.`);
    this.persist();
    return project;
  }

  duplicateProject(id: string): ProjectRecord {
    const source = this.getProject(id);
    if (!source) throw new Error(`Project ${id} was not found.`);
    const timestamp = new Date().toISOString();
    const duplicate: ProjectRecord = {
      ...source,
      id: `project-${randomUUID()}`,
      title: projectTitleSchema.parse(`${source.title.slice(0, 69)} (bản sao)`),
      scene: structuredClone(source.scene),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
    };
    this.insertProject(duplicate);
    this.persist();
    return duplicate;
  }

  touchProject(id: string): ProjectRecord {
    const parsedId = projectIdSchema.parse(id);
    const lastOpenedAt = new Date().toISOString();
    this.database.run('UPDATE projects SET last_opened_at = $lastOpenedAt WHERE id = $id', { $id: parsedId, $lastOpenedAt: lastOpenedAt });
    const project = this.getProject(parsedId);
    if (!project) throw new Error(`Project ${parsedId} was not found.`);
    this.persist();
    return project;
  }

  saveProjectScene(id: string, scene: ProjectSceneDocument): ProjectRecord {
    const parsedId = projectIdSchema.parse(id);
    const parsedScene = projectSceneSchema.parse(scene);
    const updatedAt = new Date().toISOString();
    this.database.run(
      'UPDATE projects SET scene_json = $scene, updated_at = $updatedAt WHERE id = $id',
      { $id: parsedId, $scene: JSON.stringify(parsedScene), $updatedAt: updatedAt },
    );
    const project = this.getProject(parsedId);
    if (!project) throw new Error(`Project ${parsedId} was not found.`);
    this.persist();
    return project;
  }

  exportProject(id: string): string {
    const project = this.getProject(id);
    if (!project) throw new Error(`Project ${id} was not found.`);
    return JSON.stringify({
      format: PROJECT_EXPORT_FORMAT,
      version: PROJECT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      project,
    }, null, 2);
  }

  importProject(data: string): ProjectRecord {
    const envelope = projectExportEnvelopeSchema.parse(JSON.parse(data));
    const timestamp = new Date().toISOString();
    const project: ProjectRecord = {
      ...envelope.project,
      id: `project-${randomUUID()}`,
      title: projectTitleSchema.parse(`${envelope.project.title.slice(0, 67)} (nhập)`),
      scene: structuredClone(envelope.project.scene),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
    };
    this.insertProject(project);
    this.persist();
    return project;
  }

  deleteProject(id: string): boolean {
    const parsedId = projectIdSchema.parse(id);
    const existed = this.getProject(parsedId) !== null;
    if (!existed) return false;
    this.database.run('DELETE FROM projects WHERE id = $id', { $id: parsedId });
    this.persist();
    return true;
  }

  close(): void {
    this.persist();
    this.database.close();
  }

  private migrate(): void {
    this.database.run(migrations[0]);
    const applied = new Set<number>();
    const result = this.database.exec('SELECT version FROM schema_migrations');
    for (const value of result[0]?.values ?? []) applied.add(Number(value[0]));

    if (fs.existsSync(this.filePath) && migrations.some((_migration, index) => index > 0 && !applied.has(index))) {
      fs.copyFileSync(this.filePath, `${this.filePath}.bak`);
    }

    for (let index = 1; index < migrations.length; index += 1) {
      if (applied.has(index)) continue;
      this.database.run('BEGIN');
      try {
        this.database.run(migrations[index]);
        this.database.run(
          'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
          [index, new Date().toISOString()],
        );
        this.database.run('COMMIT');
      } catch (error) {
        this.database.run('ROLLBACK');
        throw error;
      }
    }
  }

  private migrateProjectDocuments(): void {
    const result = this.database.exec('SELECT id, scene_json FROM projects');
    for (const row of result[0]?.values ?? []) {
      const id = String(row[0]);
      const scene = JSON.parse(String(row[1])) as unknown;
      const migrated = migrateProjectScene(scene);
      if (JSON.stringify(scene) === JSON.stringify(migrated)) continue;
      this.database.run('UPDATE projects SET scene_json = $scene WHERE id = $id', {
        $id: id,
        $scene: JSON.stringify(migrated),
      });
    }
  }

  private seedProjects(): void {
    const count = Number(this.database.exec('SELECT COUNT(*) FROM projects')[0]?.values[0]?.[0] ?? 0);
    if (count > 0) return;
    for (const project of createDefaultProjects()) this.insertProject(project);
  }

  private insertProject(project: ProjectRecord): void {
    const parsed = projectRecordSchema.parse(project);
    this.database.run(
      `INSERT INTO projects (id, title, poster_preset, scene_json, created_at, updated_at, last_opened_at)
       VALUES ($id, $title, $posterPreset, $scene, $createdAt, $updatedAt, $lastOpenedAt)`,
      {
        $id: parsed.id,
        $title: parsed.title,
        $posterPreset: parsed.posterPreset,
        $scene: JSON.stringify(parsed.scene),
        $createdAt: parsed.createdAt,
        $updatedAt: parsed.updatedAt,
        $lastOpenedAt: parsed.lastOpenedAt,
      },
    );
  }

  private parseProjectRow(row: unknown[]): ProjectRecord {
    return projectRecordSchema.parse({
      id: String(row[0]),
      title: String(row[1]),
      posterPreset: String(row[2]),
      scene: JSON.parse(String(row[3])),
      createdAt: String(row[4]),
      updatedAt: String(row[5]),
      lastOpenedAt: row[6] === null ? null : String(row[6]),
    });
  }

  private parseProjectObject(row: Record<string, unknown>): ProjectRecord {
    return projectRecordSchema.parse({
      id: row.id,
      title: row.title,
      posterPreset: row.poster_preset,
      scene: JSON.parse(String(row.scene_json)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastOpenedAt: row.last_opened_at ?? null,
    });
  }

  private persist(): void {
    const temporaryPath = `${this.filePath}.tmp`;
    const backupPath = `${this.filePath}.bak`;
    if (fs.existsSync(this.filePath) && isValidDatabaseFile(this.DatabaseClass, this.filePath)) {
      fs.copyFileSync(this.filePath, backupPath);
    }
    const descriptor = fs.openSync(temporaryPath, 'w');
    try {
      fs.writeFileSync(descriptor, Buffer.from(this.database.export()));
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporaryPath, this.filePath);
  }
}

type DatabaseConstructor = new (data?: Uint8Array | number[]) => Database;

export interface DatabaseRecoveryReport {
  source: 'none' | 'primary' | 'temporary' | 'backup';
  recovered: boolean;
  quarantinedCount: number;
}

function recoverDatabaseFiles(DatabaseClass: DatabaseConstructor, filePath: string): DatabaseRecoveryReport {
  const temporaryPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;
  const existing = [filePath, temporaryPath, backupPath].filter((candidate) => fs.existsSync(candidate));
  if (!existing.length) return { source: 'none', recovered: false, quarantinedCount: 0 };

  const mainModified = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : -1;
  const temporaryModified = fs.existsSync(temporaryPath) ? fs.statSync(temporaryPath).mtimeMs : -1;
  const candidates = temporaryModified >= mainModified
    ? [temporaryPath, filePath, backupPath]
    : [filePath, temporaryPath, backupPath];
  const valid = candidates.filter((candidate) => fs.existsSync(candidate) && isValidDatabaseFile(DatabaseClass, candidate));
  const selected = valid[0];

  let quarantinedCount = 0;
  for (const candidate of existing) {
    if (valid.includes(candidate)) continue;
    quarantineFile(candidate, 'invalid');
    quarantinedCount += 1;
  }
  if (!selected) throw new Error('Không thể khôi phục cơ sở dữ liệu local từ tệp chính, tệp tạm hoặc bản sao lưu.');

  if (selected !== filePath) {
    if (fs.existsSync(filePath) && isValidDatabaseFile(DatabaseClass, filePath)) fs.copyFileSync(filePath, backupPath);
    fs.copyFileSync(selected, filePath);
  }
  if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  const source = selected === filePath ? 'primary' : selected === temporaryPath ? 'temporary' : 'backup';
  return { source, recovered: source !== 'primary', quarantinedCount };
}

function isValidDatabaseFile(DatabaseClass: DatabaseConstructor, filePath: string): boolean {
  try {
    const candidate = new DatabaseClass(fs.readFileSync(filePath));
    try {
      const integrity = candidate.exec('PRAGMA integrity_check');
      return integrity[0]?.values[0]?.[0] === 'ok';
    } finally {
      candidate.close();
    }
  } catch {
    return false;
  }
}

function quarantineFile(filePath: string, reason: string): void {
  if (!fs.existsSync(filePath)) return;
  fs.renameSync(filePath, `${filePath}.${reason}-${Date.now()}`);
}
