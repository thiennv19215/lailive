import { z } from 'zod';
import { projectMediaReferenceSchema } from './projects';

export const manualMediaImportSchema = z.object({ references: z.array(projectMediaReferenceSchema).min(1).max(100) });
export const manualVolumeSchema = z.object({ volume: z.number().finite().min(0).max(1) });
export const manualLoopSchema = z.object({ loop: z.boolean() });
export const manualAutoNextSchema = z.object({ autoNext: z.boolean() });
