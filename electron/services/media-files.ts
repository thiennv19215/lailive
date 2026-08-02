import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectMediaReference, ProjectMediaStatus } from '../../src/shared/contracts/projects';
import { projectMediaCheckSchema } from '../../src/shared/validation/projects';

const MEDIA_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
};

const execFileAsync = promisify(execFile);

export function inspectMediaReferences(references: ProjectMediaReference[]): ProjectMediaStatus[] {
  const parsed = projectMediaCheckSchema.parse({ references }).references;
  return parsed.map((reference) => ({ ...reference, exists: fs.existsSync(reference.path) }));
}

export function readMediaDataUrl(reference: ProjectMediaReference): string | null {
  if (!fs.existsSync(reference.path) || !['image', 'video', 'audio'].includes(reference.kind)) return null;
  const stat = fs.statSync(reference.path);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) return null;
  const mimeType = MEDIA_TYPES[reference.path.slice(reference.path.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mimeType};base64,${fs.readFileSync(reference.path).toString('base64')}`;
}

export async function convertVideoToGif(reference: ProjectMediaReference, outputDirectory: string): Promise<ProjectMediaReference> {
  if (reference.kind !== 'video' || !fs.existsSync(reference.path) || !fs.statSync(reference.path).isFile()) {
    throw new Error('Video nguồn không tồn tại hoặc không hợp lệ.');
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `${path.basename(reference.path, path.extname(reference.path))}-${Date.now()}.gif`);
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', reference.path, '-t', '15',
      '-vf', 'fps=12,scale=480:-1:flags=lanczos', '-loop', '0', outputPath,
    ], { windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 });
  } catch {
    throw new Error('Không thể tạo GIF. Kiểm tra FFmpeg đã được cài đặt và video có thể phát.');
  }
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) throw new Error('FFmpeg không tạo được tệp GIF hợp lệ.');
  return { id: `media-${randomUUID()}`, label: `${reference.label.replace(/\.[^.]+$/, '')}.gif`, kind: 'image', path: outputPath };
}
