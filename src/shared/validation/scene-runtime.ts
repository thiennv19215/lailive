import { z } from 'zod';
import { projectSceneSchema } from './projects';

export const sceneRuntimePublishSchema = z.object({
  scene: projectSceneSchema,
  avatarState: z.enum(['idle', 'talking']),
  presentation: z.object({
    mode: z.enum(['scene', 'stopped', 'starting', 'idle', 'playing', 'paused', 'loading', 'recovering', 'error']),
    activeScriptId: z.string().trim().min(1).max(120).nullable(),
    activeLayerId: z.string().trim().min(1).max(120).nullable(),
    activeAudioLayerId: z.string().trim().min(1).max(120).nullable(),
    activeAvatarLayerId: z.string().trim().min(1).max(120).nullable(),
    activeAvatarTransitionLayerId: z.string().trim().min(1).max(120).nullable(),
    pendingAvatarLayerId: z.string().trim().min(1).max(120).nullable(),
    managedLayerIds: z.array(z.string().trim().min(1).max(120)).max(40),
    playbackRevision: z.number().int().min(0),
    resumeActiveMedia: z.boolean(),
    activePaused: z.boolean(),
    activeMuted: z.boolean(),
    activeVolume: z.number().finite().min(0).max(1),
    activeLoop: z.boolean(),
    activeAudioMuted: z.boolean(),
    activeAudioVolume: z.number().finite().min(0).max(1),
  }).optional().default({ mode: 'scene', activeScriptId: null, activeLayerId: null, activeAudioLayerId: null, activeAvatarLayerId: null, activeAvatarTransitionLayerId: null, pendingAvatarLayerId: null, managedLayerIds: [], playbackRevision: 0, resumeActiveMedia: false, activePaused: true, activeMuted: true, activeVolume: 0, activeLoop: false, activeAudioMuted: true, activeAudioVolume: 0 }),
});

export const sceneRuntimeReadySchema = z.object({
  clientId: z.string().trim().min(1).max(120),
});

export const sceneRuntimeLogSchema = z.object({
  clientId: z.string().trim().min(1).max(120),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().trim().min(1).max(2000),
});

export const sceneRuntimePlaybackEndedSchema = z.object({
  scriptId: z.string().trim().min(1).max(200),
  layerId: z.string().trim().min(1).max(200),
  playbackRevision: z.number().int().min(0),
});
