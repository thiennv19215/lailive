import { z } from 'zod';
import { LIVE_STATES } from '../contracts/live-state';

export const liveStateSchema = z.enum(LIVE_STATES);
export const liveStateMediaSchema = z.object({
  assetId: z.string().trim().min(1).max(200),
  kind: z.enum(['video', 'audio']),
});
export const liveTimelineCueSchema = z.object({
  checkpoint: z.string().trim().min(1).max(80),
  startTime: z.number().finite().min(0),
  endTime: z.number().finite().positive(),
  transition: z.enum(['cut', 'fade']),
}).refine((cue) => cue.endTime > cue.startTime, 'Cue end time must follow its start time.');

export const liveStateDefinitionSchema = z.object({
  state: liveStateSchema,
  avatar: liveStateMediaSchema.nullable(),
  audio: liveStateMediaSchema.nullable(),
  // Defaults allow projects saved before segment support to load unchanged.
  startAt: z.number().finite().min(0).default(0),
  endAt: z.number().finite().min(0).nullable().default(null),
  // Older manifests synchronized audio to the visual media clock.
  audioStartAt: z.number().finite().min(0).nullable().default(null),
  duration: z.number().finite().positive().max(86_400).nullable(),
  priority: z.number().int().min(0).max(1_000),
  nextState: liveStateSchema.nullable(),
  timeline: z.array(liveTimelineCueSchema).max(100),
}).superRefine((definition, context) => {
  if (definition.endAt !== null && definition.endAt <= definition.startAt) {
    context.addIssue({ code: 'custom', path: ['endAt'], message: 'Segment end must follow its start.' });
  }
  definition.timeline.forEach((cue, index) => {
    if (index > 0 && cue.startTime < definition.timeline[index - 1]!.endTime) {
      context.addIssue({ code: 'custom', path: ['timeline', index, 'startTime'], message: 'Timeline cues cannot overlap.' });
    }
  });
});

export const liveStateDefinitionsSchema = z.object({
  IDLE: liveStateDefinitionSchema.safeExtend({ state: z.literal('IDLE') }),
  WELCOME: liveStateDefinitionSchema.safeExtend({ state: z.literal('WELCOME') }),
  CONSULT: liveStateDefinitionSchema.safeExtend({ state: z.literal('CONSULT') }),
  DEMO: liveStateDefinitionSchema.safeExtend({ state: z.literal('DEMO') }),
  CTA: liveStateDefinitionSchema.safeExtend({ state: z.literal('CTA') }),
  THANKS: liveStateDefinitionSchema.safeExtend({ state: z.literal('THANKS') }),
});

export const playStateCommandSchema = z.object({
  type: z.literal('PLAY_STATE'),
  state: liveStateSchema,
  interrupt: z.boolean().optional(),
});

export const liveRuntimeEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready'), revision: z.number().int().min(1) }),
  z.object({ kind: z.literal('progress'), revision: z.number().int().min(1), currentTime: z.number().finite().min(0) }),
  z.object({ kind: z.literal('ended'), revision: z.number().int().min(1), currentTime: z.number().finite().min(0).optional() }),
  z.object({ kind: z.literal('error'), revision: z.number().int().min(1), message: z.string().trim().min(1).max(500), currentTime: z.number().finite().min(0).optional() }),
]);

export const liveStateResumeFrameSchema = z.object({
  state: liveStateSchema,
  currentTime: z.number().finite().min(0),
});

export const liveStateSnapshotSchema = z.object({
  mode: z.enum(['idle', 'loading', 'playing', 'error']),
  state: liveStateSchema,
  revision: z.number().int().min(0),
  currentTime: z.number().finite().min(0),
  ready: z.boolean(),
  definition: liveStateDefinitionSchema,
  resumeStack: z.array(liveStateResumeFrameSchema).max(100),
  errorMessage: z.string().max(500).nullable(),
}).superRefine((snapshot, context) => {
  if (snapshot.definition.state !== snapshot.state) {
    context.addIssue({ code: 'custom', path: ['definition', 'state'], message: 'State definition must match snapshot state.' });
  }
});
