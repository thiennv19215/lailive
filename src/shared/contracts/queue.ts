import type { AiGenerateInput, AiReplyResult } from './ai';
import type { NormalizedLiveEvent } from './live';
import type { TriggerActionType } from './moderation';
import type { TtsProjectSettings, TtsSynthesisResult } from './tts';

export const MAX_INTERACTION_QUEUE_JOBS = 100;

export type InteractionQueueState =
  | 'queued'
  | 'ai_processing'
  | 'tts_processing'
  | 'playing'
  | 'done'
  | 'skipped'
  | 'cancelled'
  | 'error';

export type AvatarSpeechState = 'idle' | 'talking';

export interface InteractionQueueInput {
  id: string;
  event: NormalizedLiveEvent;
  actionType: TriggerActionType;
  directText: string;
  aiInput: AiGenerateInput | null;
  ttsSettings: TtsProjectSettings;
}

export interface InteractionQueueJob extends InteractionQueueInput {
  state: InteractionQueueState;
  text: string;
  aiReply: AiReplyResult | null;
  synthesis: TtsSynthesisResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attempts: number;
}

export interface InteractionQueueSnapshot {
  jobs: InteractionQueueJob[];
  activeJobId: string | null;
  avatarState: AvatarSpeechState;
  queuedCount: number;
}

