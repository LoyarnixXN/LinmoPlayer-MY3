import type { ThemeColorOverrides, ThemeColorToken, ThemePayload } from './models';

/** Host default palette (Material 3 baseline). Both hosts start from this. */
export const DEFAULT_THEME_TOKENS: Readonly<Record<ThemeColorToken, string>> = {
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  secondary: '#625B71',
  secondaryContainer: '#E8DEF8',
  onSecondaryContainer: '#1D192B',
  tertiaryContainer: '#FFD8E4',
  onTertiaryContainer: '#31111D',
  surface: '#FFFBFE',
  surfaceContainer: '#F3EDF7',
  surfaceContainerHigh: '#ECE6F0',
  surfaceContainerHighest: '#E6E0E9',
  onSurface: '#1D1B20',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  error: '#BA1A1A',
  scrim: '#000000',
};

export const THEME_COLOR_TOKEN_KEYS = Object.keys(
  DEFAULT_THEME_TOKENS,
) as readonly ThemeColorToken[];

function isValidColor(value: unknown): value is string {
  return (
    typeof value === 'string' && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
  );
}

export function normalizeThemePayload(input: unknown, fallbackName: string): ThemePayload {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('theme.json 必须是对象。');
  const raw = input as Record<string, unknown>;
  const mode = raw.mode === 'dark' ? 'dark' : 'light';
  const colorsInput = typeof raw.colors === 'object' && raw.colors !== null ? raw.colors : {};
  const colors: Record<ThemeColorToken, string> = {} as Record<ThemeColorToken, string>;
  for (const key of THEME_COLOR_TOKEN_KEYS) {
    const value = (colorsInput as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (!isValidColor(value))
      throw new Error(`theme.json 颜色值无效：${key} 必须是 #RGB/#RRGGBB 十六进制颜色。`);
    colors[key] = value.toLowerCase();
  }
  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallbackName,
    mode,
    colors,
  };
}

/** Merge a theme payload over the host defaults; unknown tokens are ignored. */
export function mergeThemeTokens(payload: ThemePayload | null): Record<ThemeColorToken, string> {
  if (!payload) return { ...DEFAULT_THEME_TOKENS };
  const merged: Record<ThemeColorToken, string> = { ...DEFAULT_THEME_TOKENS };
  for (const [key, value] of Object.entries(payload.colors)) {
    if (value !== undefined) merged[key as ThemeColorToken] = value;
  }
  return merged;
}
