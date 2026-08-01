import { z } from 'zod';
import { projectSceneSchema } from './projects';

export const sceneRuntimePublishSchema = z.object({
  scene: projectSceneSchema,
  avatarState: z.enum(['idle', 'talking']),
  presentation: z.object({
    mode: z.enum(['scene', 'stopped', 'starting', 'idle', 'paused', 'loading', 'recovering', 'error']),
    activeLayerId: z.string().trim().min(1).max(120).nullable(),
    managedLayerIds: z.array(z.string().trim().min(1).max(120)).max(40),
    playbackRevision: z.number().int().min(0),
    activePaused: z.boolean(),
    activeMuted: z.boolean(),
    activeVolume: z.number().finite().min(0).max(1),
    activeLoop: z.boolean(),
  }).optional().default({ mode: 'scene', activeLayerId: null, managedLayerIds: [], playbackRevision: 0, activePaused: true, activeMuted: true, activeVolume: 0, activeLoop: false }),
});

export const sceneRuntimeReadySchema = z.object({
  clientId: z.string().trim().min(1).max(120),
});

export const sceneRuntimeLogSchema = z.object({
  clientId: z.string().trim().min(1).max(120),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().trim().min(1).max(2000),
});
