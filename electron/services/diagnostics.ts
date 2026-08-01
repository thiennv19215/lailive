import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  DiagnosticExportEnvelope,
  DiagnosticLogEntry,
  DiagnosticLogQuery,
  DiagnosticsSnapshot,
  HealthCheckResult,
  HealthComponent,
  RecoveryNotice,
  RecoveryNoticeInput,
} from '../../src/shared/contracts/diagnostics';
import { diagnosticLogQuerySchema, diagnosticRecordSchema, recoveryNoticeInputSchema } from '../../src/shared/validation/diagnostics';

const MAX_LOGS = 2000;
const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|cookie|password|passwd|secret|token|credential|session)/i;
const PRIVATE_TEXT_KEY_PATTERN = /(prompt|userMessage|systemMessage|persona|transcript)/i;
const INLINE_SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+=-]+/gi,
  /\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/gi,
  /([?&](?:key|token|secret|password)=)[^&\s]+/gi,
];

export type HealthProvider = () => HealthCheckResult | Promise<HealthCheckResult>;

export class DiagnosticsService {
  private readonly logs: DiagnosticLogEntry[] = [];
  private readonly throttleStates = new Map<string, { lastRecordedAt: number; suppressed: number }>();
  private readonly recoveryNotices: RecoveryNotice[] = [];

  constructor(
    private readonly filePath: string,
    private readonly healthProviders: Partial<Record<HealthComponent, HealthProvider>> = {},
  ) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.recoverInterruptedWrite();
    this.load();
  }

  get path(): string { return this.filePath; }

  record(input: { level: DiagnosticLogEntry['level']; source: string; message: string; details?: unknown }): DiagnosticLogEntry {
    const parsed = diagnosticRecordSchema.parse(input);
    const entry: DiagnosticLogEntry = {
      id: `log-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      level: parsed.level,
      source: parsed.source,
      message: redactText(parsed.message),
      details: redactValue(parsed.details ?? null),
    };
    this.logs.push(entry);
    while (this.logs.length > MAX_LOGS) this.logs.shift();
    this.persist();
    return structuredClone(entry);
  }

  recordThrottled(
    key: string,
    intervalMs: number,
    input: { level: DiagnosticLogEntry['level']; source: string; message: string; details?: Record<string, unknown> },
  ): DiagnosticLogEntry | null {
    const now = Date.now();
    const state = this.throttleStates.get(key);
    if (state && now - state.lastRecordedAt < intervalMs) {
      state.suppressed += 1;
      return null;
    }
    const suppressedSinceLast = state?.suppressed ?? 0;
    this.throttleStates.delete(key);
    this.throttleStates.set(key, { lastRecordedAt: now, suppressed: 0 });
    while (this.throttleStates.size > 500) this.throttleStates.delete(this.throttleStates.keys().next().value!);
    return this.record({
      ...input,
      details: suppressedSinceLast > 0 ? { ...input.details, suppressedSinceLast } : input.details,
    });
  }

  addRecoveryNotice(input: RecoveryNoticeInput): RecoveryNotice {
    const parsed = recoveryNoticeInputSchema.parse(input);
    const notice: RecoveryNotice = {
      ...parsed,
      id: `recovery-${randomUUID()}`,
      title: redactText(parsed.title),
      message: redactText(parsed.message),
      detail: redactValue(parsed.detail),
      occurredAt: new Date().toISOString(),
    };
    this.recoveryNotices.unshift(notice);
    while (this.recoveryNotices.length > 10) this.recoveryNotices.pop();
    return structuredClone(notice);
  }

  list(query: DiagnosticLogQuery = {}): DiagnosticLogEntry[] {
    const parsed = diagnosticLogQuerySchema.parse(query);
    const search = parsed.search?.toLocaleLowerCase('vi-VN');
    return this.logs
      .filter((entry) => !parsed.levels?.length || parsed.levels.includes(entry.level))
      .filter((entry) => !parsed.sources?.length || parsed.sources.includes(entry.source))
      .filter((entry) => !search || `${entry.source} ${entry.message} ${JSON.stringify(entry.details)}`.toLocaleLowerCase('vi-VN').includes(search))
      .slice(-parsed.limit)
      .reverse()
      .map((entry) => structuredClone(entry));
  }

  async getSnapshot(): Promise<DiagnosticsSnapshot> {
    const checkedAt = new Date().toISOString();
    const health = await Promise.all((Object.keys(this.healthProviders) as HealthComponent[]).map(async (component) => {
      try {
        const result = await this.healthProviders[component]!();
        return { ...result, component, checkedAt };
      } catch (error) {
        return {
          component,
          state: 'error' as const,
          summary: 'Không thể kiểm tra dịch vụ.',
          detail: redactText(error instanceof Error ? error.message : String(error)),
          checkedAt,
        };
      }
    }));
    return { health, recoveryNotices: structuredClone(this.recoveryNotices), logCount: this.logs.length, logFilePath: this.filePath, checkedAt };
  }

  async export(query: DiagnosticLogQuery = {}): Promise<string> {
    const snapshot = await this.getSnapshot();
    const envelope: DiagnosticExportEnvelope = {
      format: 'ai-livestream-diagnostics',
      version: 1,
      exportedAt: new Date().toISOString(),
      health: snapshot.health,
      recoveryNotices: snapshot.recoveryNotices,
      logs: this.list({ ...query, limit: query.limit ?? MAX_LOGS }),
    };
    return JSON.stringify(envelope, null, 2);
  }

  clear(): number {
    const count = this.logs.length;
    this.logs.splice(0);
    this.persist();
    return count;
  }

  private recoverInterruptedWrite(): void {
    const temporaryPath = `${this.filePath}.tmp`;
    if (!fs.existsSync(this.filePath) && fs.existsSync(temporaryPath)) fs.renameSync(temporaryPath, this.filePath);
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const decoded = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
      if (!Array.isArray(decoded)) return;
      for (const entry of decoded.slice(-MAX_LOGS)) {
        const parsed = parseStoredEntry(entry);
        if (parsed) this.logs.push(parsed);
      }
    } catch {
      const invalidPath = `${this.filePath}.invalid-${Date.now()}`;
      fs.renameSync(this.filePath, invalidPath);
    }
  }

  private persist(): void {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.logs), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}

export function redactValue(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED_SECRET]';
  if (PRIVATE_TEXT_KEY_PATTERN.test(key)) return '[REDACTED_PRIVATE_TEXT]';
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[REDACTED_CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactValue(item, '', seen));
  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, 100)) output[childKey] = redactValue(childValue, childKey, seen);
  return output;
}

export function redactText(value: string): string {
  let redacted = value.slice(0, 4000);
  for (const pattern of INLINE_SECRET_PATTERNS) redacted = redacted.replace(pattern, (match, prefix?: string) => prefix ? `${prefix}[REDACTED_SECRET]` : '[REDACTED_SECRET]');
  return redacted;
}

function parseStoredEntry(value: unknown): DiagnosticLogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DiagnosticLogEntry>;
  if (!candidate.id || !candidate.timestamp || !candidate.level || !candidate.source || !candidate.message) return null;
  if (!['debug', 'info', 'warn', 'error'].includes(candidate.level)) return null;
  return {
    id: String(candidate.id).slice(0, 160),
    timestamp: String(candidate.timestamp),
    level: candidate.level,
    source: String(candidate.source).slice(0, 80),
    message: redactText(String(candidate.message)),
    details: redactValue(candidate.details ?? null),
  };
}
