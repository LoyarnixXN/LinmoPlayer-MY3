import { createGdStudioMusicPlugin, GDSTUDIO_KNOWN_SOURCES } from './provider-gdstudio';
import { createNeteaseAccountMusicPlugin } from './provider-netease';
import { normalizeThemePayload } from './theme-tokens';
import type { PluginPackageFile, PluginPackageManifest } from './plugin-package';
import type { FontPayload, MusicPlugin, ThemePayload } from './index';

/**
 * Declarative plugin factory.
 *
 * Plugin ZIPs never ship executable code for the host. A `music-source` package
 * names a built-in engine (`provider`) plus a `config`; the host instantiates
 * the engine. Theme/font packages carry data files that hosts apply natively.
 * This keeps behavior identical on every device and keeps untrusted packages
 * out of the JS runtime.
 */

export function createMusicSourcePlugin(manifest: PluginPackageManifest): MusicPlugin {
  if (manifest.kind !== 'music-source' || !manifest.provider) throw new Error('不是音源插件清单。');
  const config = (manifest.config ?? {}) as Record<string, unknown>;
  switch (manifest.provider) {
    case 'gdstudio': {
      const sources = Array.isArray(config.sources)
        ? config.sources.filter(
            (source): source is string =>
              typeof source === 'string' &&
              (GDSTUDIO_KNOWN_SOURCES as readonly string[]).includes(source),
          )
        : [];
      return createGdStudioMusicPlugin({
        pluginId: manifest.id,
        ...(typeof config.baseUrl === 'string' ? { baseUrl: config.baseUrl } : {}),
        ...(sources.length ? { sources } : {}),
      });
    }
    case 'netease-api':
      return createNeteaseAccountMusicPlugin({
        pluginId: manifest.id,
        ...(typeof config.baseUrl === 'string' ? { baseUrl: config.baseUrl } : {}),
      });
    default:
      throw new Error(`未知的音源引擎：${manifest.provider}`);
  }
}

export function findPackageFile(
  files: readonly PluginPackageFile[],
  name: string,
): PluginPackageFile | undefined {
  return files.find((file) => file.name === name);
}

export function readThemePayload(
  manifest: PluginPackageManifest,
  files: readonly PluginPackageFile[],
): ThemePayload {
  if (manifest.kind !== 'theme' || !manifest.theme) throw new Error('不是主题插件包。');
  const file = findPackageFile(files, manifest.theme.entry);
  if (!file) throw new Error(`主题文件不存在：${manifest.theme.entry}`);
  const json = JSON.parse(new TextDecoder().decode(file.bytes));
  return normalizeThemePayload(json, manifest.name);
}

export function readFontPayload(manifest: PluginPackageManifest): FontPayload {
  if (manifest.kind !== 'font' || !manifest.font) throw new Error('不是字体插件包。');
  return {
    family: manifest.font.family,
    ...(manifest.font.displayName ? { displayName: manifest.font.displayName } : {}),
  };
}
