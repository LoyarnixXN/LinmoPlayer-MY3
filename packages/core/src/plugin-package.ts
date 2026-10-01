import type { PluginCapability, PluginKind, PluginManifest } from './plugin-contract';
import { PLUGIN_CAPABILITIES, HOST_API_VERSION } from './plugin-contract';

export const PLUGIN_PACKAGE_VERSION = 1;
export const PLUGIN_ENTRY_LIMIT = 128;
export const PLUGIN_FILE_SIZE_LIMIT = 64 * 1024 * 1024;

export interface PluginFontSpec {
  readonly family: string;
  readonly displayName?: string;
  readonly file: string;
}

export interface PluginThemeSpec {
  readonly entry: string;
}

export interface PluginPackageManifest extends PluginManifest {
  readonly packageVersion: 1;
  readonly entry?: string;
  readonly kind: PluginKind;
  readonly provider?: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly theme?: PluginThemeSpec;
  readonly font?: PluginFontSpec;
  readonly permissions?: readonly string[];
}

export interface PluginPackageFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface PluginPackage {
  readonly manifest: PluginPackageManifest;
  readonly files: readonly PluginPackageFile[];
}

export const PLUGIN_KINDS: readonly PluginKind[] = ['music-source', 'theme', 'font'];

export function validatePluginPackageManifest(input: unknown): PluginPackageManifest {
  if (!isRecord(input)) throw new Error('插件包缺少 plugin.json。');
  const manifest = isRecord(input.manifest) ? input.manifest : input;
  const kind = manifest.kind === undefined ? 'music-source' : manifest.kind;
  if (!PLUGIN_KINDS.includes(kind)) {
    throw new Error(`插件类型无效：${String(kind)}（支持 ${PLUGIN_KINDS.join(' / ')}）。`);
  }
  const capabilities = manifest.capabilities;
  if (
    manifest.packageVersion !== PLUGIN_PACKAGE_VERSION ||
    typeof manifest.id !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(manifest.id) ||
    typeof manifest.name !== 'string' ||
    !manifest.name.trim() ||
    typeof manifest.version !== 'string' ||
    !manifest.version.trim() ||
    typeof manifest.hostApiVersion !== 'string' ||
    manifest.hostApiVersion.split('.')[0] !== HOST_API_VERSION.split('.')[0]
  ) {
    throw new Error(
      '插件包清单无效：需要 packageVersion=1、合法 ID、名称、版本和兼容的宿主 API 版本。',
    );
  }
  if (kind === 'music-source') {
    if (!Array.isArray(capabilities) || capabilities.length === 0)
      throw new Error('音源插件必须声明至少一个能力。');
    if (capabilities.some((item) => !isCapability(item)))
      throw new Error('音源插件声明了未支持的能力。');
    if (typeof manifest.provider !== 'string' || !isKnownProvider(manifest.provider)) {
      throw new Error(`音源插件必须声明受支持的 provider：${KNOWN_PROVIDERS.join(' / ')}。`);
    }
    if (manifest.config !== undefined && !isRecord(manifest.config))
      throw new Error('音源插件 config 必须是对象。');
    if (
      manifest.config &&
      manifest.config.baseUrl !== undefined &&
      (typeof manifest.config.baseUrl !== 'string' || !/^https?:\/\//.test(manifest.config.baseUrl))
    ) {
      throw new Error('音源插件 config.baseUrl 必须是 http(s) 地址。');
    }
  } else if (Array.isArray(capabilities) && capabilities.some((item) => !isCapability(item))) {
    throw new Error('插件声明了未支持的能力。');
  }

  const base = {
    packageVersion: 1 as const,
    id: manifest.id,
    name: manifest.name.trim(),
    version: manifest.version.trim(),
    hostApiVersion: manifest.hostApiVersion,
    kind,
    ...(typeof manifest.description === 'string'
      ? { description: manifest.description.trim() }
      : {}),
    ...(Array.isArray(manifest.permissions) &&
    manifest.permissions.every((item) => typeof item === 'string')
      ? { permissions: manifest.permissions }
      : {}),
  };

  if (kind === 'music-source') {
    return {
      ...base,
      capabilities: [...new Set(capabilities)] as PluginCapability[],
      provider: manifest.provider,
      ...(manifest.config ? { config: manifest.config } : {}),
      ...(typeof manifest.entry === 'string' && isSafePackagePath(manifest.entry)
        ? { entry: manifest.entry }
        : {}),
    };
  }

  if (kind === 'theme') {
    const theme = manifest.theme;
    const entry = theme && typeof theme.entry === 'string' ? theme.entry : 'theme.json';
    if (!isSafePackagePath(entry)) throw new Error('主题插件 theme.entry 路径非法。');
    return { ...base, capabilities: [], theme: { entry } };
  }

  const font = manifest.font;
  if (
    !font ||
    typeof font.family !== 'string' ||
    !font.family.trim() ||
    typeof font.file !== 'string' ||
    !isSafePackagePath(font.file)
  ) {
    throw new Error('字体插件需要声明 font.family 和 font.file。');
  }
  return {
    ...base,
    capabilities: [],
    font: {
      family: font.family.trim(),
      ...(typeof font.displayName === 'string' && font.displayName.trim()
        ? { displayName: font.displayName.trim() }
        : {}),
      file: font.file,
    },
  };
}

export function validatePluginPackage(pkg: PluginPackage): void {
  const manifest = validatePluginPackageManifest(pkg.manifest);
  if (!pkg.files.some((file) => file.name === 'plugin.json'))
    throw new Error('插件包必须包含根目录 plugin.json。');
  if (pkg.files.length > PLUGIN_ENTRY_LIMIT) throw new Error('插件包文件数量超过安全上限。');
  for (const file of pkg.files) {
    if (!isSafePackagePath(file.name)) throw new Error(`插件包包含非法路径：${file.name}`);
    if (file.bytes.byteLength > PLUGIN_FILE_SIZE_LIMIT)
      throw new Error(`插件包文件过大：${file.name}`);
  }
  if (manifest.kind === 'music-source' && manifest.entry) {
    if (!pkg.files.some((file) => file.name === manifest.entry))
      throw new Error(`插件入口文件不存在：${manifest.entry}`);
  }
  if (manifest.kind === 'theme') {
    const entry = manifest.theme!.entry;
    if (!pkg.files.some((file) => file.name === entry))
      throw new Error(`插件缺少主题文件：${entry}`);
  }
  if (manifest.kind === 'font') {
    if (!pkg.files.some((file) => file.name === manifest.font!.file))
      throw new Error(`插件缺少字体文件：${manifest.font!.file}`);
  }
}

export const KNOWN_PROVIDERS = ['gdstudio', 'netease-api'] as const;

function isKnownProvider(value: string): boolean {
  return (KNOWN_PROVIDERS as readonly string[]).includes(value);
}

function isSafePackagePath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 240 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.split('/').includes('..')
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCapability(value: unknown): value is PluginCapability {
  return typeof value === 'string' && PLUGIN_CAPABILITIES.includes(value as PluginCapability);
}
