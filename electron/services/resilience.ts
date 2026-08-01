import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

interface RuntimeLockRecord {
  version: 1;
  pid: number;
  token: string;
  startedAt: string;
  executablePath: string;
}

export interface ShopBrowserOwnerRecord {
  version: 1;
  pid: number;
  token: string;
  launchedAt: string;
  executablePath: string;
  profileDirectory: string;
}

export interface ProcessDetails {
  pid: number;
  executablePath: string;
  commandLine: string;
}

export interface ProcessController {
  inspect(pid: number): Promise<ProcessDetails | null>;
  terminateTree(pid: number): Promise<void>;
}

export interface ResilienceStartupReport {
  runtimeLock: 'created' | 'replaced-stale' | 'replaced-invalid';
  shopBrowser: 'none' | 'record-invalid' | 'process-missing' | 'record-mismatch' | 'terminated-owned-orphan';
}

export class AppResilienceService {
  readonly runtimeLockPath: string;
  readonly shopOwnerPath: string;
  readonly shopProfileDirectory: string;
  private runtimeToken: string | null = null;

  constructor(
    private readonly userDataDirectory: string,
    private readonly processes: ProcessController = createSystemProcessController(),
  ) {
    this.runtimeLockPath = path.join(userDataDirectory, 'runtime.lock.json');
    this.shopOwnerPath = path.join(userDataDirectory, 'shop', 'browser-owner.json');
    this.shopProfileDirectory = path.join(userDataDirectory, 'shop', 'tiktok-profile');
  }

  async acquire(): Promise<ResilienceStartupReport> {
    fs.mkdirSync(this.userDataDirectory, { recursive: true });
    const runtimeLock = await this.acquireRuntimeLock();
    const shopBrowser = await this.cleanupOwnedShopBrowserOrphan();
    return { runtimeLock, shopBrowser };
  }

  release(): boolean {
    if (!this.runtimeToken) return false;
    const removed = removeRecordWithMatchingToken(this.runtimeLockPath, this.runtimeToken);
    this.runtimeToken = null;
    return removed;
  }

  private async acquireRuntimeLock(): Promise<ResilienceStartupReport['runtimeLock']> {
    let outcome: ResilienceStartupReport['runtimeLock'] = 'created';
    if (fs.existsSync(this.runtimeLockPath)) {
      const existing = readRuntimeLock(this.runtimeLockPath);
      if (!existing) {
        quarantineFile(this.runtimeLockPath);
        outcome = 'replaced-invalid';
      } else if (await this.processes.inspect(existing.pid)) {
        throw new Error('APP_INSTANCE_LOCK_ACTIVE');
      } else {
        quarantineFile(this.runtimeLockPath);
        outcome = 'replaced-stale';
      }
    }

    this.runtimeToken = randomUUID();
    writeJsonAtomic(this.runtimeLockPath, {
      version: 1,
      pid: process.pid,
      token: this.runtimeToken,
      startedAt: new Date().toISOString(),
      executablePath: process.execPath,
    } satisfies RuntimeLockRecord);
    return outcome;
  }

  private async cleanupOwnedShopBrowserOrphan(): Promise<ResilienceStartupReport['shopBrowser']> {
    if (!fs.existsSync(this.shopOwnerPath)) return 'none';
    const owner = readShopBrowserOwnerRecord(this.shopOwnerPath);
    if (!owner) {
      quarantineFile(this.shopOwnerPath);
      return 'record-invalid';
    }
    if (!samePath(owner.profileDirectory, this.shopProfileDirectory) || !isPathInside(owner.profileDirectory, this.userDataDirectory)) {
      quarantineFile(this.shopOwnerPath);
      return 'record-mismatch';
    }

    const running = await this.processes.inspect(owner.pid);
    if (!running) {
      removeRecordWithMatchingToken(this.shopOwnerPath, owner.token);
      return 'process-missing';
    }
    if (!matchesOwnedBrowserProcess(owner, running)) {
      quarantineFile(this.shopOwnerPath);
      return 'record-mismatch';
    }

    await this.processes.terminateTree(owner.pid);
    removeRecordWithMatchingToken(this.shopOwnerPath, owner.token);
    return 'terminated-owned-orphan';
  }
}

export function createShopBrowserOwnerRecord(input: {
  pid: number;
  executablePath: string;
  profileDirectory: string;
}): ShopBrowserOwnerRecord {
  return {
    version: 1,
    pid: input.pid,
    token: randomUUID(),
    launchedAt: new Date().toISOString(),
    executablePath: path.resolve(input.executablePath),
    profileDirectory: path.resolve(input.profileDirectory),
  };
}

export function writeShopBrowserOwnerRecord(filePath: string, record: ShopBrowserOwnerRecord): void {
  writeJsonAtomic(filePath, record);
}

export function removeShopBrowserOwnerRecord(filePath: string, token: string): boolean {
  return removeRecordWithMatchingToken(filePath, token);
}

export function browserOwnerTokenArgument(token: string): string {
  return `--ai-livestream-owner-token=${token}`;
}

function matchesOwnedBrowserProcess(owner: ShopBrowserOwnerRecord, running: ProcessDetails): boolean {
  const allowedNames = new Set(['chrome.exe', 'msedge.exe', 'chrome', 'msedge']);
  const ownerName = path.basename(owner.executablePath).toLowerCase();
  const runningName = path.basename(running.executablePath).toLowerCase();
  if (!allowedNames.has(ownerName) || ownerName !== runningName) return false;
  if (!samePath(owner.executablePath, running.executablePath)) return false;
  const args = splitCommandLine(running.commandLine);
  const profileArgument = args.find((argument) => argument.startsWith('--user-data-dir='));
  const tokenArgument = args.find((argument) => argument.startsWith('--ai-livestream-owner-token='));
  if (!profileArgument || !tokenArgument) return false;
  return samePath(profileArgument.slice('--user-data-dir='.length), owner.profileDirectory)
    && tokenArgument.slice('--ai-livestream-owner-token='.length) === owner.token;
}

function splitCommandLine(commandLine: string): string[] {
  const args: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < commandLine.length; index += 1) {
    const character = commandLine[index]!;
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (/\s/.test(character) && !quoted) {
      if (current) args.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current) args.push(current);
  return args;
}

function readRuntimeLock(filePath: string): RuntimeLockRecord | null {
  const value = readJson(filePath);
  if (!value || value.version !== 1 || !isPositivePid(value.pid) || !isNonEmptyString(value.token)
    || !isNonEmptyString(value.startedAt) || !isNonEmptyString(value.executablePath)) return null;
  return value as unknown as RuntimeLockRecord;
}

function readShopBrowserOwnerRecord(filePath: string): ShopBrowserOwnerRecord | null {
  const value = readJson(filePath);
  if (!value || value.version !== 1 || !isPositivePid(value.pid) || !isNonEmptyString(value.token)
    || !isNonEmptyString(value.launchedAt) || !isNonEmptyString(value.executablePath)
    || !isNonEmptyString(value.profileDirectory)) return null;
  return value as unknown as ShopBrowserOwnerRecord;
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  const descriptor = fs.openSync(temporaryPath, 'w');
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value), 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporaryPath, filePath);
}

function removeRecordWithMatchingToken(filePath: string, token: string): boolean {
  const value = readJson(filePath);
  if (value?.token !== token) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

function quarantineFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  fs.renameSync(filePath, `${filePath}.invalid-${Date.now()}-${randomUUID().slice(0, 8)}`);
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isPositivePid(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function createSystemProcessController(): ProcessController {
  return {
    inspect: async (pid) => {
      if (process.platform === 'win32') return await inspectWindowsProcess(pid);
      try {
        process.kill(pid, 0);
        return { pid, executablePath: '', commandLine: '' };
      } catch {
        return null;
      }
    },
    terminateTree: async (pid) => {
      if (process.platform !== 'win32') {
        process.kill(pid, 'SIGTERM');
        return;
      }
      await runHiddenProcess('taskkill.exe', ['/pid', String(pid), '/t', '/f']);
    },
  };
}

async function inspectWindowsProcess(pid: number): Promise<ProcessDetails | null> {
  const script = `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; if ($p) { [pscustomobject]@{ pid = [int]$p.ProcessId; executablePath = [string]$p.ExecutablePath; commandLine = [string]$p.CommandLine } | ConvertTo-Json -Compress }`;
  const output = await runHiddenProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  if (!output.trim()) return null;
  try {
    const value = JSON.parse(output) as Partial<ProcessDetails>;
    if (!isPositivePid(value.pid) || typeof value.executablePath !== 'string' || typeof value.commandLine !== 'string') return null;
    return { pid: value.pid, executablePath: value.executablePath, commandLine: value.commandLine };
  } catch {
    return null;
  }
}

async function runHiddenProcess(command: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 || code === 128 ? resolve(output) : reject(new Error(`${command} exited with code ${code ?? 'unknown'}`)));
  });
}
