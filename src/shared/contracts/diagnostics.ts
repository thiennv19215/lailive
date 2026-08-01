export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type HealthState = 'healthy' | 'degraded' | 'offline' | 'error';
export type HealthComponent = 'database' | 'tiktok' | 'ai' | 'tts' | 'scene' | 'obs' | 'shop';
export type RecoveryNoticeKind = 'database-recovered' | 'database-quarantined' | 'stale-lock-recovered' | 'invalid-lock-replaced' | 'shop-orphan-terminated' | 'shop-owner-mismatch';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  level: DiagnosticLogLevel;
  source: string;
  message: string;
  details: unknown;
}

export interface DiagnosticLogQuery {
  search?: string;
  levels?: DiagnosticLogLevel[];
  sources?: string[];
  limit?: number;
}

export interface HealthCheckResult {
  component: HealthComponent;
  state: HealthState;
  summary: string;
  detail: string | null;
  checkedAt: string;
}

export interface DiagnosticsSnapshot {
  health: HealthCheckResult[];
  recoveryNotices: RecoveryNotice[];
  logCount: number;
  logFilePath: string;
  checkedAt: string;
}

export interface DiagnosticExportEnvelope {
  format: 'ai-livestream-diagnostics';
  version: 1;
  exportedAt: string;
  health: HealthCheckResult[];
  recoveryNotices: RecoveryNotice[];
  logs: DiagnosticLogEntry[];
}

export interface RecoveryNotice {
  id: string;
  kind: RecoveryNoticeKind;
  severity: 'info' | 'warn';
  title: string;
  message: string;
  detail: unknown;
  occurredAt: string;
}

export type RecoveryNoticeInput = Omit<RecoveryNotice, 'id' | 'occurredAt'>;

export interface QueueDiagnosticEvent {
  kind: 'queue-full' | 'job-error' | 'job-cancelled' | 'retry' | 'cleared';
  stage: 'queued' | 'ai' | 'tts' | 'playback' | null;
  count: number | null;
}
