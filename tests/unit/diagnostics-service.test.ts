import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsService, redactText, redactValue } from '../../electron/services/diagnostics';

const temporaryDirectories: string[] = [];
function tempFile(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-live-diagnostics-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'diagnostics.json');
}

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

describe('DiagnosticsService', () => {
  it('redacts secret fields, private prompts, bearer tokens, query secrets, and circular values before persistence/export', async () => {
    const file = tempFile();
    const service = new DiagnosticsService(file);
    const circular: Record<string, unknown> = { ok: true };
    circular.self = circular;
    service.record({
      level: 'error', source: 'ai',
      message: 'Request failed Bearer abc.def.ghi?token=secret-value',
      details: { apiKey: 'sk-private-value', password: 'hunter2', systemPrompt: 'hidden prompt', nested: { authorization: 'Bearer private' }, circular },
    });
    const exported = await service.export();
    expect(exported).not.toContain('sk-private-value');
    expect(exported).not.toContain('hunter2');
    expect(exported).not.toContain('hidden prompt');
    expect(exported).not.toContain('abc.def.ghi');
    expect(exported).toContain('[REDACTED_SECRET]');
    expect(exported).toContain('[REDACTED_PRIVATE_TEXT]');
    expect(exported).toContain('[REDACTED_CIRCULAR]');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('private-value');
  });

  it('searches, filters, bounds results, clears logs, and restores persisted entries', () => {
    const file = tempFile();
    const service = new DiagnosticsService(file);
    service.record({ level: 'info', source: 'scene', message: 'Scene ready' });
    service.record({ level: 'warn', source: 'obs', message: 'OBS offline' });
    service.record({ level: 'error', source: 'shop', message: 'Selector changed' });
    expect(service.list({ search: 'obs' })).toHaveLength(1);
    expect(service.list({ levels: ['error'], sources: ['shop'] })[0]?.message).toBe('Selector changed');
    expect(service.list({ limit: 2 })).toHaveLength(2);
    expect(new DiagnosticsService(file).list()).toHaveLength(3);
    expect(service.clear()).toBe(3);
    expect(service.list()).toEqual([]);
  });

  it('keeps a sustained diagnostic burst bounded across persistence and restart', () => {
    const file = tempFile();
    const service = new DiagnosticsService(file);
    for (let index = 0; index < 2_200; index += 1) {
      service.record({ level: 'debug', source: 'long-run', message: `event-${index}` });
    }

    expect(service.list({ limit: 2000 })).toHaveLength(2000);
    expect(service.list({ limit: 2000 })[1999]?.message).toBe('event-200');
    expect(new DiagnosticsService(file).list({ limit: 2000 })).toHaveLength(2000);
    expect(fs.statSync(file).size).toBeLessThan(500_000);
  }, 15_000);

  it('throttles repeated internal transitions and reports the suppressed count on recovery', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T20:00:00.000Z'));
    const service = new DiagnosticsService(tempFile());
    expect(service.recordThrottled('scene:client-error', 5_000, { level: 'warn', source: 'scene', message: 'Scene client error.' })).not.toBeNull();
    expect(service.recordThrottled('scene:client-error', 5_000, { level: 'warn', source: 'scene', message: 'Scene client error.' })).toBeNull();
    expect(service.recordThrottled('scene:client-error', 5_000, { level: 'warn', source: 'scene', message: 'Scene client error.' })).toBeNull();
    vi.advanceTimersByTime(5_000);
    const recovered = service.recordThrottled('scene:client-error', 5_000, { level: 'info', source: 'scene', message: 'Scene client recovered.' });
    expect(recovered?.details).toEqual({ suppressedSinceLast: 2 });
    expect(service.list()).toHaveLength(2);
  });

  it('exposes bounded redacted startup recovery notices in snapshots and exports', async () => {
    const service = new DiagnosticsService(tempFile());
    for (let index = 0; index < 12; index += 1) service.addRecoveryNotice({
      kind: 'database-recovered', severity: 'warn', title: `Recovered ${index}`,
      message: 'Recovered Bearer private-recovery-token', detail: { token: 'private-token', source: 'temporary' },
    });
    const snapshot = await service.getSnapshot();
    expect(snapshot.recoveryNotices).toHaveLength(10);
    expect(snapshot.recoveryNotices[0]).toMatchObject({ title: 'Recovered 11', message: expect.not.stringContaining('private-recovery-token'), detail: { token: '[REDACTED_SECRET]', source: 'temporary' } });
    const exported = await service.export();
    expect(exported).toContain('recoveryNotices');
    expect(exported).not.toContain('private-recovery-token');
    expect(exported).not.toContain('private-token');
  });

  it('aggregates health and converts provider failures into redacted actionable states', async () => {
    const service = new DiagnosticsService(tempFile(), {
      database: () => ({ component: 'database', state: 'healthy', summary: 'SQLite sẵn sàng.', detail: null, checkedAt: '' }),
      obs: () => { throw new Error('Bearer private-token OBS unavailable'); },
    });
    const snapshot = await service.getSnapshot();
    expect(snapshot.health).toEqual([
      expect.objectContaining({ component: 'database', state: 'healthy' }),
      expect.objectContaining({ component: 'obs', state: 'error', detail: expect.not.stringContaining('private-token') }),
    ]);
  });

  it('redaction helpers preserve safe diagnostics while removing common inline credentials', () => {
    expect(redactText('url?token=abc123&mode=test')).toBe('url?token=[REDACTED_SECRET]&mode=test');
    expect(redactValue({ model: 'safe-model', cookie: 'private', prompt: 'private prompt' })).toEqual({ model: 'safe-model', cookie: '[REDACTED_SECRET]', prompt: '[REDACTED_PRIVATE_TEXT]' });
  });
});
