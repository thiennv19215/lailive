import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import electronPath from 'electron';

const devServerUrl = process.env.AI_LIVESTREAM_DEV_SERVER_URL ?? 'http://127.0.0.1:5173/';

try {
  const response = await fetch(devServerUrl);
  if (!response.ok) throw new Error(`Dev server returned HTTP ${response.status}`);
} catch (error) {
  console.error(`Start pnpm dev:win before this smoke test: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const smokeDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-smoke-'));
const child = spawn(electronPath, ['.', '--phase0-smoke'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AI_LIVESTREAM_SMOKE_DATA_DIR: smokeDataDirectory,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

const exitCode = await new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
fs.rmSync(smokeDataDirectory, { recursive: true, force: true });
if (exitCode !== 0 || !output.includes('PHASE0_SMOKE_OK')) {
  console.error('Electron smoke test did not confirm renderer readiness.');
  process.exit(1);
}
