import { describe, expect, it } from 'vitest';
import { ModerationEngine, foldVietnamese, normalizeComment } from '../../src/modules/triggers/moderation-engine';
import { createDefaultModerationSettings } from '../../src/shared/contracts/moderation';
import type { NormalizedLiveEvent } from '../../src/shared/contracts/live';
import { VIETNAMESE_MODERATION_CASES } from '../fixtures/vietnamese-moderation-cases';

function chat(id: string, text: string, userId = 'viewer-1'): NormalizedLiveEvent {
  return {
    id,
    type: 'chat',
    timestamp: '2026-07-29T12:00:00.000Z',
    source: 'mock',
    text,
    user: { id: userId, uniqueId: userId, nickname: userId },
  };
}

describe('Vietnamese moderation normalization', () => {
  it('folds Vietnamese accents, case, punctuation, emoji, and whitespace deterministically', () => {
    expect(foldVietnamese('Đặng Thị Hồng')).toBe('Dang Thi Hong');
    expect(normalizeComment('  ĐẸP quá!!! 😍  ')).toBe('dep qua');
  });

  it(`classifies all ${VIETNAMESE_MODERATION_CASES.length} Vietnamese fixtures`, () => {
    expect(VIETNAMESE_MODERATION_CASES.length).toBeGreaterThanOrEqual(50);
    for (const fixture of VIETNAMESE_MODERATION_CASES) {
      const settings = { ...createDefaultModerationSettings(), ...fixture.settings };
      const engine = new ModerationEngine(settings);
      const decision = engine.decide({ event: chat(fixture.name, fixture.text), now: new Date('2026-07-29T12:00:00.000Z') });
      expect(decision.reason, fixture.name).toBe(fixture.expected);
      expect(decision.trace.length, fixture.name).toBeGreaterThan(0);
    }
  });
});

describe('ModerationEngine stateful decisions', () => {
  it('applies trigger changes immediately without reconnecting', () => {
    const settings = createDefaultModerationSettings();
    const engine = new ModerationEngine(settings);
    const like: NormalizedLiveEvent = { id: 'like-1', type: 'like', timestamp: '2026-07-29T12:00:00.000Z', source: 'mock', count: 4 };
    expect(engine.decide({ event: like, now: new Date('2026-07-29T12:00:00.000Z') }).reason).toBe('event-disabled');

    engine.updateSettings({
      ...settings,
      triggers: settings.triggers.map((trigger) => trigger.event === 'like' ? { ...trigger, enabled: true } : trigger),
    });
    expect(engine.decide({ event: { ...like, id: 'like-2' }, now: new Date('2026-07-29T12:00:01.000Z') }).reason).toBe('accepted');
  });

  it('enforces duplicate, global, and per-user cooldown windows with exact boundaries', () => {
    const engine = new ModerationEngine(createDefaultModerationSettings());
    const at = (seconds: number) => new Date(Date.parse('2026-07-29T12:00:00.000Z') + seconds * 1000);

    expect(engine.decide({ event: chat('first', 'Sản phẩm này còn hàng không?'), now: at(0) }).reason).toBe('accepted');
    expect(engine.decide({ event: chat('global', 'Màu xanh còn không?', 'viewer-2'), now: at(1) }).reason).toBe('global-cooldown');
    expect(engine.decide({ event: chat('user', 'Màu xanh còn không?'), now: at(2) }).reason).toBe('user-cooldown');
    expect(engine.decide({ event: chat('duplicate', 'Sản phẩm này còn hàng không?'), now: at(30) }).reason).toBe('duplicate-comment');
    expect(engine.decide({ event: chat('boundary', 'Sản phẩm này còn hàng không?'), now: at(45) }).reason).toBe('accepted');
  });

  it('keeps duplicate detection scoped to one user and blocks configured output terms', () => {
    const settings = { ...createDefaultModerationSettings(), globalCooldownSeconds: 0, userCooldownSeconds: 0, bannedOutputTerms: ['giá chỉ 99k'] };
    const engine = new ModerationEngine(settings);
    const now = new Date('2026-07-29T12:00:00.000Z');
    expect(engine.decide({ event: chat('a', 'Còn hàng không?', 'viewer-a'), now }).reason).toBe('accepted');
    expect(engine.decide({ event: chat('b', 'Còn hàng không?', 'viewer-b'), now }).reason).toBe('accepted');
    expect(engine.inspectOutput('Sản phẩm có giá chỉ 99K hôm nay.')).toMatchObject({ accepted: false, matchedTerm: 'giá chỉ 99k' });
    expect(engine.inspectOutput('Mình sẽ kiểm tra thông tin sản phẩm cho bạn.').accepted).toBe(true);
  });

  it('supports an explicit ignore action with a machine-readable trace', () => {
    const settings = createDefaultModerationSettings();
    settings.triggers = settings.triggers.map((trigger) => trigger.event === 'chat' ? { ...trigger, actionType: 'ignore' } : trigger);
    const decision = new ModerationEngine(settings).decide({ event: chat('ignored', 'Sản phẩm còn hàng không?') });
    expect(decision).toMatchObject({ status: 'skipped', reason: 'action-ignore', actionType: 'ignore' });
    expect(decision.trace[decision.trace.length - 1]).toMatchObject({ rule: 'action-type', outcome: 'skip' });
  });
});
