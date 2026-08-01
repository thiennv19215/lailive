export const TEXT_FONT_FAMILIES = [
  'Arial',
  'Georgia',
  'Impact',
  'Oswald',
  'Montserrat',
  'Playfair Display',
] as const;

export type TextFontFamily = (typeof TEXT_FONT_FAMILIES)[number];
export type TextAlignment = 'left' | 'center' | 'right';

export type StudioTextStyle = {
  content: string;
  font: TextFontFamily;
  size: number;
  color: string;
  align: TextAlignment;
  bold: boolean;
  italic: boolean;
};

export type TextStylePreset = {
  id: string;
  preview: string;
  label: string;
  style: Omit<StudioTextStyle, 'content'>;
};

export const DEFAULT_STUDIO_TEXT_STYLE: StudioTextStyle = {
  content: 'CHỈ CÓ TRÊN LIVE',
  font: 'Oswald',
  size: 44,
  color: '#e23f2d',
  align: 'center',
  bold: true,
  italic: false,
};

const presetStyles: Array<Omit<StudioTextStyle, 'content'>> = [
  { font: 'Oswald', size: 44, color: '#e23f2d', align: 'center', bold: true, italic: false },
  { font: 'Arial', size: 36, color: '#ffffff', align: 'left', bold: true, italic: false },
  { font: 'Georgia', size: 42, color: '#fff2be', align: 'center', bold: false, italic: true },
  { font: 'Impact', size: 52, color: '#ffcf31', align: 'center', bold: true, italic: false },
  { font: 'Montserrat', size: 38, color: '#ffffff', align: 'right', bold: true, italic: false },
  { font: 'Playfair Display', size: 46, color: '#f8d6bb', align: 'center', bold: true, italic: true },
  { font: 'Oswald', size: 32, color: '#111111', align: 'left', bold: false, italic: false },
  { font: 'Arial', size: 48, color: '#ff5a50', align: 'center', bold: true, italic: true },
  { font: 'Georgia', size: 34, color: '#ffffff', align: 'right', bold: false, italic: false },
  { font: 'Impact', size: 58, color: '#ffffff', align: 'center', bold: true, italic: false },
];

export const TEXT_STYLE_PRESETS: TextStylePreset[] = presetStyles.flatMap((style, index) => [
  {
    id: `preset-${index + 1}`,
    preview: index === 0 ? '∅' : 'T',
    label: index === 0 ? 'Khôi phục kiểu mặc định' : `Kiểu chữ ${index + 1}`,
    style,
  },
  {
    id: `preset-${index + 11}`,
    preview: 'T',
    label: `Kiểu chữ ${index + 11}`,
    style: {
      ...style,
      color: index % 2 === 0 ? '#ffffff' : '#ffe06a',
      italic: !style.italic,
    },
  },
]);

export function clampTextSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_STUDIO_TEXT_STYLE.size;
  return Math.min(96, Math.max(12, Math.round(size)));
}

export function normalizeTextStyle(style: StudioTextStyle): StudioTextStyle {
  return {
    ...style,
    content: style.content.slice(0, 160),
    size: clampTextSize(style.size),
    color: /^#[0-9a-f]{6}$/i.test(style.color) ? style.color.toLowerCase() : DEFAULT_STUDIO_TEXT_STYLE.color,
  };
}

export function applyTextStylePreset(current: StudioTextStyle, preset: TextStylePreset): StudioTextStyle {
  return normalizeTextStyle({ ...current, ...preset.style });
}
