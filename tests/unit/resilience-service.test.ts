import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AppResilienceService,
  browserOwnerTokenArgument,
  createShopBrowserOwnerRecord,
  writeShopBrowserOwnerRecord,
  type ProcessController,
  type ProcessDetails,
} from '../../electron/services/resilience';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

class FakeProcessController implements ProcessController {
  readonly processes = new Map<number, ProcessDetails>();
  readonly terminated: number[] = [];

  async inspect(pid: number): Promise<ProcessDetails | null> {
    return this.processes.get(pid) ?? null;
  }

  async terminateTree(pid: number): Promise<void> {
    this.terminated.push(pid);
    this.processes.delete(pid);
  }
}

function createFixture(): { root: string; processes: FakeProcessController; service: AppResilienceService } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-live-resilience-'));
  temporaryDirectories.push(root);
  const processes = new FakeProcessController();
  return { root, processes, service: new AppResilienceService(root, processes) };
}

describe('AppResilienceService', () => {
  it('quarantines a stale dead runtime lock and replaces it', async () => {
    const { root, service } = createFixture();
    fs.writeFileSync(service.runtimeLockPath, JSON.stringify({
      version: 1,
      pid: 43210,
      token: 'stale-token',
      startedAt: new Date(0).toISOString(),
      executablePath: 'C:\\stale\\electron.exe',
    }));

    await expect(service.acquire()).resolves.toMatchObject({ runtimeLock: 'replaced-stale' });
    expect(fs.readdirSync(root).some((entry) => entry.startsWith('runtime.lock.json.invalid-'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(service.runtimeLockPath, 'utf8')).pid).toBe(process.pid);
    expect(service.release()).toBe(true);
  });

  it('refuses to replace an active runtime lock', async () => {
    const { processes, service } = createFixture();
    processes.processes.set(43211, { pid: 43211, executablePath: 'C:\\app\\electron.exe', commandLine: 'electron.exe' });
    fs.writeFileSync(service.runtimeLockPath, JSON.stringify({
      version: 1,
      pid: 43211,
      token: 'active-token',
      startedAt: new Date().toISOString(),
      executablePath: 'C:\\app\\electron.exe',
    }));

    await expect(service.acquire()).rejects.toThrow('APP_INSTANCE_LOCK_ACTIVE');
    expect(processes.terminated).toEqual([]);
    expect(JSON.parse(fs.readFileSync(service.runtimeLockPath, 'utf8')).token).toBe('active-token');
  });

  it('terminates only an orphan with the exact executable, profile, PID, and owner token', async () => {
    const { processes, service } = createFixture();
    const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const owner = createShopBrowserOwnerRecord({ pid: 51001, executablePath, profileDirectory: service.shopProfileDirectory });
    writeShopBrowserOwnerRecord(service.shopOwnerPath, owner);
    processes.processes.set(owner.pid, {
      pid: owner.pid,
      executablePath,
      commandLine: `"${executablePath}" "--user-data-dir=${service.shopProfileDirectory}" "${browserOwnerTokenArgument(owner.token)}" --remote-debugging-port=9222`,
    });

    await expect(service.acquire()).resolves.toMatchObject({ shopBrowser: 'terminated-owned-orphan' });
    expect(processes.terminated).toEqual([owner.pid]);
    expect(fs.existsSync(service.shopOwnerPath)).toBe(false);
    service.release();
  });

  it.each([
    ['wrong profile', (service: AppResilienceService) => path.join(path.dirname(service.shopProfileDirectory), 'other-profile'), 'chrome.exe'],
    ['wrong executable', (service: AppResilienceService) => service.shopProfileDirectory, 'firefox.exe'],
  ])('never terminates a process with %s', async (_label, profileForProcess, executableName) => {
    const { processes, service } = createFixture();
    const recordedExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const owner = createShopBrowserOwnerRecord({ pid: 51002, executablePath: recordedExecutable, profileDirectory: service.shopProfileDirectory });
    writeShopBrowserOwnerRecord(service.shopOwnerPath, owner);
    const runningExecutable = path.join(path.dirname(recordedExecutable), executableName);
    processes.processes.set(owner.pid, {
      pid: owner.pid,
      executablePath: runningExecutable,
      commandLine: `"${runningExecutable}" "--user-data-dir=${profileForProcess(service)}" "${browserOwnerTokenArgument(owner.token)}"`,
    });

    await expect(service.acquire()).resolves.toMatchObject({ shopBrowser: 'record-mismatch' });
    expect(processes.terminated).toEqual([]);
    service.release();
  });

  it('does not terminate a nearby PID when the recorded process is gone', async () => {
    const { processes, service } = createFixture();
    const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const owner = createShopBrowserOwnerRecord({ pid: 51003, executablePath, profileDirectory: service.shopProfileDirectory });
    writeShopBrowserOwnerRecord(service.shopOwnerPath, owner);
    processes.processes.set(owner.pid + 1, {
      pid: owner.pid + 1,
      executablePath,
      commandLine: `"${executablePath}" "--user-data-dir=${service.shopProfileDirectory}" "${browserOwnerTokenArgument(owner.token)}"`,
    });

    await expect(service.acquire()).resolves.toMatchObject({ shopBrowser: 'process-missing' });
    expect(processes.terminated).toEqual([]);
    service.release();
  });

  it('releases only the runtime lock carrying its own token', async () => {
    const { service } = createFixture();
    await service.acquire();
    const current = JSON.parse(fs.readFileSync(service.runtimeLockPath, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(service.runtimeLockPath, JSON.stringify({ ...current, token: 'replacement-token' }));

    expect(service.release()).toBe(false);
    expect(fs.existsSync(service.runtimeLockPath)).toBe(true);
  });
});
