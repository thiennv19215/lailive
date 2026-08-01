import type {
  ModerationDecision,
  ModerationInput,
  ModerationSettings,
  ModerationTraceStep,
  OutputInspection,
  TriggerRule,
} from '../../shared/contracts/moderation';
import type { LiveInteractionType } from '../../shared/contracts/live';
import { moderationSettingsSchema } from '../../shared/validation/moderation';

const URL_PATTERN = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|vn|io|co)\b)/i;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const EMOJI_TEST_PATTERN = /\p{Extended_Pictographic}/u;
const LETTER_OR_NUMBER_PATTERN = /[\p{L}\p{N}]/u;
const TRIVIAL_GREETINGS = new Set([
  'alo', 'chao', 'chao ban', 'hello', 'hey', 'hi', 'ok', 'xin chao', 'xin chao ban',
]);

export function foldVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function normalizeComment(value: string): string {
  return foldVietnamese(value)
    .toLowerCase()
    .replace(EMOJI_PATTERN, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesKeyword(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    const normalized = normalizeComment(keyword);
    if (normalized && (` ${text} `).includes(` ${normalized} `)) return keyword;
  }
  return null;
}

function userKey(input: ModerationInput): string {
  const user = input.event.user;
  return user?.id || user?.uniqueId || user?.nickname || 'anonymous';
}

export class ModerationEngine {
  private settings: ModerationSettings;
  private lastAcceptedAt = Number.NEGATIVE_INFINITY;
  private readonly lastAcceptedByUser = new Map<string, number>();
  private readonly duplicateComments = new Map<string, number>();

  constructor(settings: ModerationSettings) {
    this.settings = moderationSettingsSchema.parse(settings);
  }

  updateSettings(settings: ModerationSettings): void {
    this.settings = moderationSettingsSchema.parse(settings);
  }

  reset(): void {
    this.lastAcceptedAt = Number.NEGATIVE_INFINITY;
    this.lastAcceptedByUser.clear();
    this.duplicateComments.clear();
  }

  decide(input: ModerationInput): ModerationDecision {
    const now = input.now ?? new Date();
    const nowMs = now.getTime();
    const eventType = input.event.type as LiveInteractionType;
    const rule = this.settings.triggers.find((candidate) => candidate.event === eventType);
    const trace: ModerationTraceStep[] = [];
    const normalizedText = eventType === 'chat' ? normalizeComment(input.event.text ?? '') : '';
    const decision = (status: ModerationDecision['status'], reason: ModerationDecision['reason'], activeRule: TriggerRule): ModerationDecision => ({
      eventId: input.event.id,
      eventType,
      status,
      reason,
      actionType: activeRule.actionType,
      normalizedText,
      decidedAt: now.toISOString(),
      trace,
    });

    if (!rule || !rule.enabled) {
      trace.push({ rule: 'trigger-enabled', outcome: 'skip' });
      return decision('skipped', 'event-disabled', rule ?? { event: eventType, enabled: false, actionType: 'ignore' });
    }
    trace.push({ rule: 'trigger-enabled', outcome: 'pass' });
    if (rule.actionType === 'ignore') {
      trace.push({ rule: 'action-type', outcome: 'skip', detail: 'ignore' });
      return decision('skipped', 'action-ignore', rule);
    }
    trace.push({ rule: 'action-type', outcome: 'pass', detail: rule.actionType });

    if (eventType === 'chat') {
      const rawText = (input.event.text ?? '').trim();
      if (!rawText) return this.skip(decision, rule, trace, 'empty-comment', 'comment-content');
      if (URL_PATTERN.test(rawText)) return this.skip(decision, rule, trace, 'url', 'url-filter');
      if (!LETTER_OR_NUMBER_PATTERN.test(rawText.replace(EMOJI_PATTERN, ''))) {
        const reason = EMOJI_TEST_PATTERN.test(rawText) ? 'emoji-only' : 'punctuation-only';
        return this.skip(decision, rule, trace, reason, 'content-shape');
      }

      const blockedKeyword = includesKeyword(normalizedText, this.settings.blockKeywords);
      if (blockedKeyword) return this.skip(decision, rule, trace, 'blocked-keyword', 'block-keyword', blockedKeyword);
      const allowedKeyword = includesKeyword(normalizedText, this.settings.allowKeywords);
      if (allowedKeyword) trace.push({ rule: 'allow-keyword', outcome: 'bypass', detail: allowedKeyword });
      else {
        if (TRIVIAL_GREETINGS.has(normalizedText)) return this.skip(decision, rule, trace, 'trivial-greeting', 'trivial-greeting');
        if (normalizedText.replace(/\s/g, '').length < this.settings.minimumCommentLength) {
          return this.skip(decision, rule, trace, 'too-short', 'minimum-length');
        }
      }

      this.pruneDuplicates(nowMs);
      const duplicateKey = `${userKey(input)}:${normalizedText}`;
      const duplicateAt = this.duplicateComments.get(duplicateKey);
      if (duplicateAt !== undefined && nowMs - duplicateAt < this.settings.duplicateWindowSeconds * 1000) {
        return this.skip(decision, rule, trace, 'duplicate-comment', 'duplicate-window');
      }
    }

    if (nowMs - this.lastAcceptedAt < this.settings.globalCooldownSeconds * 1000) {
      return this.skip(decision, rule, trace, 'global-cooldown', 'global-cooldown');
    }
    const currentUserKey = userKey(input);
    const userAcceptedAt = this.lastAcceptedByUser.get(currentUserKey);
    if (userAcceptedAt !== undefined && nowMs - userAcceptedAt < this.settings.userCooldownSeconds * 1000) {
      return this.skip(decision, rule, trace, 'user-cooldown', 'user-cooldown');
    }

    trace.push({ rule: 'cooldowns', outcome: 'pass' });
    this.lastAcceptedAt = nowMs;
    this.lastAcceptedByUser.set(currentUserKey, nowMs);
    if (eventType === 'chat') this.duplicateComments.set(`${currentUserKey}:${normalizedText}`, nowMs);
    trace.push({ rule: 'decision', outcome: 'pass', detail: rule.actionType });
    return decision('accepted', 'accepted', rule);
  }

  inspectOutput(text: string): OutputInspection {
    const normalizedText = normalizeComment(text);
    const matchedTerm = includesKeyword(normalizedText, this.settings.bannedOutputTerms);
    return { accepted: matchedTerm === null, normalizedText, matchedTerm };
  }

  private skip(
    decision: (status: ModerationDecision['status'], reason: ModerationDecision['reason'], rule: TriggerRule) => ModerationDecision,
    rule: TriggerRule,
    trace: ModerationTraceStep[],
    reason: ModerationDecision['reason'],
    traceRule: string,
    detail?: string,
  ): ModerationDecision {
    trace.push({ rule: traceRule, outcome: 'skip', ...(detail ? { detail } : {}) });
    return decision('skipped', reason, rule);
  }

  private pruneDuplicates(nowMs: number): void {
    const cutoff = nowMs - this.settings.duplicateWindowSeconds * 1000;
    for (const [key, timestamp] of this.duplicateComments) {
      if (timestamp <= cutoff) this.duplicateComments.delete(key);
    }
  }
}
