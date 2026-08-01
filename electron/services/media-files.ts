import fs from 'node:fs';
import type { ProjectMediaReference, ProjectMediaStatus } from '../../src/shared/contracts/projects';
import { projectMediaCheckSchema } from '../../src/shared/validation/projects';

const MEDIA_TYPES: Record<string, string> = {
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export function inspectMediaReferences(references: ProjectMediaReference[]): ProjectMediaStatus[] {
  const parsed = projectMediaCheckSchema.parse({ references }).references;
  return parsed.map((reference) => ({ ...reference, exists: fs.existsSync(reference.path) }));
}

export function readMediaDataUrl(reference: ProjectMediaReference): string | null {
  if (!fs.existsSync(reference.path) || reference.kind !== 'video') return null;
  const stat = fs.statSync(reference.path);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) return null;
  const mimeType = MEDIA_TYPES[reference.path.slice(reference.path.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mimeType};base64,${fs.readFileSync(reference.path).toString('base64')}`;
}
