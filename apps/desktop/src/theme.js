/** Material 3 token application, theme plugins and font plugins. */

import {
  DEFAULT_THEME_TOKENS,
  mergeThemeTokens,
  normalizeThemePayload,
} from '../../../packages/core/src/index.ts';
import { state, patchSettings, publish, installedPlugin } from './state.js';
import { snackbar } from './ui.js';

/** M3 dark scheme baseline — themes override on top of this when mode=dark. */
const DARK_TOKENS = {
  primary: '#D0BCFF',
  onPrimary: '#381E72',
  primaryContainer: '#4F378B',
  onPrimaryContainer: '#EADDFF',
  secondary: '#CCC2DC',
  secondaryContainer: '#4A4458',
  onSecondaryContainer: '#E8DEF8',
  tertiaryContainer: '#633B48',
  onTertiaryContainer: '#FFD8E4',
  surface: '#141218',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  surfaceContainerHighest: '#36343B',
  onSurface: '#E6E0E9',
  onSurfaceVariant: '#CAC4D0',
  outline: '#938F99',
  outlineVariant: '#49454F',
  error: '#F2B8B5',
  scrim: '#000000',
};

/** MiSans is first; Chinese/system fallbacks only — Inter is opt-in via font plugin. */
const DEFAULT_FONT_STACK =
  "'MiSans', 'MiSans VF', 'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif";

function tokenToCustomProperty(token) {
  return `--m3-${token.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function readPluginFile(pluginId, fileName) {
  const base64 = await window.linmoDesktop.plugins.readFile(pluginId, fileName);
  return base64ToArrayBuffer(base64);
}

async function applyFontPlugin() {
  const root = document.documentElement;
  const fontId = state.settings.fontId;
  const stale = document.querySelectorAll('style[data-linmo-font]');
  stale.forEach((node) => node.remove());
  root.style.setProperty('--app-font', DEFAULT_FONT_STACK);
  if (!fontId) return;
  const meta = installedPlugin(fontId);
  if (!meta?.font) return;
  try {
    const buffer = await readPluginFile(fontId, meta.font.file);
    const face = new FontFace(meta.font.family, buffer);
    await face.load();
    document.fonts.add(face);
    root.style.setProperty('--app-font', `'${meta.font.family}', ${DEFAULT_FONT_STACK}`);
  } catch (error) {
    snackbar(`字体加载失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function applyAppearance() {
  const root = document.documentElement;
  const { mode, themeId } = state.settings;
  const base = mode === 'dark' ? DARK_TOKENS : DEFAULT_THEME_TOKENS;
  let tokens = { ...base };
  if (themeId) {
    const meta = installedPlugin(themeId);
    if (meta?.theme?.entry) {
      try {
        const buffer = await readPluginFile(themeId, meta.theme.entry);
        const payload = normalizeThemePayload(
          JSON.parse(new TextDecoder().decode(buffer)),
          meta.name,
        );
        tokens = mergeThemeTokens({ ...payload, colors: { ...base, ...payload.colors } });
      } catch (error) {
        snackbar(`主题应用失败：${error instanceof Error ? error.message : '未知错误'}`);
        patchSettings({ themeId: '' });
      }
    } else {
      patchSettings({ themeId: '' });
    }
  }
  for (const [token, value] of Object.entries(tokens))
    root.style.setProperty(tokenToCustomProperty(token), value);
  root.dataset.mode = mode;
  await applyFontPlugin();
  publish('theme');
}

export async function applyThemePlugin(pluginId) {
  const meta = installedPlugin(pluginId);
  let mode = state.settings.mode;
  if (meta?.theme?.entry) {
    try {
      const buffer = await readPluginFile(pluginId, meta.theme.entry);
      const payload = normalizeThemePayload(
        JSON.parse(new TextDecoder().decode(buffer)),
        meta.name,
      );
      mode = payload.mode;
    } catch {
      /* fall back to current mode; applyAppearance reports the read error */
    }
  }
  patchSettings({ themeId: pluginId, mode });
  await applyAppearance();
}

export async function applyFontPluginSelection(pluginId) {
  patchSettings({ fontId: pluginId });
  await applyAppearance();
}

export async function setMode(mode) {
  patchSettings({ mode, themeId: '' });
  await applyAppearance();
}

export const installedThemePlugins = () =>
  state.plugins.filter((plugin) => plugin.kind === 'theme');
export const installedFontPlugins = () => state.plugins.filter((plugin) => plugin.kind === 'font');
