import type { LiveInteractionType, NormalizedLiveEvent } from './live';

export const DEFAULT_DUPLICATE_WINDOW_SECONDS = 45;
export const DEFAULT_GLOBAL_COOLDOWN_SECONDS = 2;
export const DEFAULT_USER_COOLDOWN_SECONDS = 30;

export type TriggerActionType = 'ignore' | 'voice_tts' | 'ai_speech';
export type ModerationDecisionStatus = 'accepted' | 'skipped';
export type ModerationReasonCode =
  | 'accepted'
  | 'event-disabled'
  | 'action-ignore'
  | 'empty-comment'
  | 'url'
  | 'punctuation-only'
  | 'emoji-only'
  | 'trivial-greeting'
  | 'too-short'
  | 'blocked-keyword'
  | 'duplicate-comment'
  | 'global-cooldown'
  | 'user-cooldown';

export interface TriggerRule {
  event: LiveInteractionType;
  enabled: boolean;
  actionType: TriggerActionType;
}

export interface ModerationSettings {
  duplicateWindowSeconds: number;
  globalCooldownSeconds: number;
  userCooldownSeconds: number;
  minimumCommentLength: number;
  allowKeywords: string[];
  blockKeywords: string[];
  bannedOutputTerms: string[];
  triggers: TriggerRule[];
}

export interface ModerationTraceStep {
  rule: string;
  outcome: 'pass' | 'skip' | 'bypass';
  detail?: string;
}

export interface ModerationDecision {
  eventId: string;
  eventType: LiveInteractionType;
  status: ModerationDecisionStatus;
  reason: ModerationReasonCode;
  actionType: TriggerActionType;
  normalizedText: string;
  decidedAt: string;
  trace: ModerationTraceStep[];
}

export interface OutputInspection {
  accepted: boolean;
  normalizedText: string;
  matchedTerm: string | null;
}

export interface ModerationInput {
  event: NormalizedLiveEvent;
  now?: Date;
}

export function createDefaultModerationSettings(): ModerationSettings {
  return {
    duplicateWindowSeconds: DEFAULT_DUPLICATE_WINDOW_SECONDS,
    globalCooldownSeconds: DEFAULT_GLOBAL_COOLDOWN_SECONDS,
    userCooldownSeconds: DEFAULT_USER_COOLDOWN_SECONDS,
    minimumCommentLength: 3,
    allowKeywords: [],
    blockKeywords: [],
    bannedOutputTerms: [],
    triggers: [
      { event: 'chat', enabled: true, actionType: 'voice_tts' },
      { event: 'gift', enabled: true, actionType: 'voice_tts' },
      { event: 'like', enabled: false, actionType: 'voice_tts' },
      { event: 'follow', enabled: true, actionType: 'voice_tts' },
      { event: 'share', enabled: true, actionType: 'voice_tts' },
    ],
  };
}
