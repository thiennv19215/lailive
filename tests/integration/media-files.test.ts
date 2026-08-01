import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectMediaReferences } from '../../electron/services/media-files';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('media file inspection', () => {
  it('reports present and missing absolute references without reading file content', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-livestream-media-'));
    temporaryDirectories.push(directory);
    const presentPath = path.join(directory, 'present.mp4');
    fs.writeFileSync(presentPath, 'fixture');
    const missingPath = path.join(directory, 'missing.mp4');

    expect(inspectMediaReferences([
      { id: 'media-present', label: 'Present video', kind: 'video', path: presentPath },
      { id: 'media-missing', label: 'Missing video', kind: 'video', path: missingPath },
    ]).map(({ id, exists }) => ({ id, exists }))).toEqual([
      { id: 'media-present', exists: true },
      { id: 'media-missing', exists: false },
    ]);
  });
});
