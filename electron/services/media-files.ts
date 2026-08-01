import fs from 'node:fs';
import type { ProjectMediaReference, ProjectMediaStatus } from '../../src/shared/contracts/projects';
import { projectMediaCheckSchema } from '../../src/shared/validation/projects';

export function inspectMediaReferences(references: ProjectMediaReference[]): ProjectMediaStatus[] {
  const parsed = projectMediaCheckSchema.parse({ references }).references;
  return parsed.map((reference) => ({ ...reference, exists: fs.existsSync(reference.path) }));
}
