import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDIO_TEXT_STYLE,
  TEXT_STYLE_PRESETS,
  applyTextStylePreset,
  clampTextSize,
  normalizeTextStyle,
} from '../../src/shared/studio/text-style';

describe('studio text style', () => {
  it('clamps finite sizes and restores the default for invalid values', () => {
    expect(clampTextSize(8)).toBe(12);
    expect(clampTextSize(44.6)).toBe(45);
    expect(clampTextSize(120)).toBe(96);
    expect(clampTextSize(Number.NaN)).toBe(44);
  });

  it('normalizes unsafe color and content values', () => {
    const normalized = normalizeTextStyle({
      ...DEFAULT_STUDIO_TEXT_STYLE,
      content: 'x'.repeat(200),
      color: 'red',
    });

    expect(normalized.content).toHaveLength(160);
    expect(normalized.color).toBe(DEFAULT_STUDIO_TEXT_STYLE.color);
  });

  it('applies a preset without replacing the edited content', () => {
    const current = { ...DEFAULT_STUDIO_TEXT_STYLE, content: 'Ưu đãi hôm nay' };
    const applied = applyTextStylePreset(current, TEXT_STYLE_PRESETS[5]!);

    expect(applied.content).toBe('Ưu đãi hôm nay');
    expect(applied.font).toBe(TEXT_STYLE_PRESETS[5]!.style.font);
    expect(applied.italic).toBe(TEXT_STYLE_PRESETS[5]!.style.italic);
  });

  it('provides twenty deterministic inspector presets', () => {
    expect(TEXT_STYLE_PRESETS).toHaveLength(20);
    expect(new Set(TEXT_STYLE_PRESETS.map((preset) => preset.id))).toHaveLength(20);
  });
});
