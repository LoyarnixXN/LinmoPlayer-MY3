import { unzipSync } from 'fflate';
import {
  validatePluginPackage,
  validatePluginPackageManifest,
  type PluginPackageManifest,
} from '@linmo/core';

export async function readPluginPackage(uri: string): Promise<PluginPackageManifest> {
  return (await readPluginPackageData(uri)).manifest;
}

export async function readPluginPackageData(uri: string): Promise<{
  manifest: PluginPackageManifest;
  files: readonly { name: string; bytes: Uint8Array }[];
}> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('无法读取插件 ZIP 文件。');
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const files = Object.entries(entries).map(([name, bytes]) => ({
    name: normalizeZipName(name),
    bytes,
  }));
  const manifestFile = files.find((file) => file.name === 'plugin.json');
  if (!manifestFile) throw new Error('插件 ZIP 根目录必须包含 plugin.json。');
  const manifest = validatePluginPackageManifest(
    JSON.parse(new TextDecoder().decode(manifestFile.bytes)),
  );
  validatePluginPackage({ manifest, files });
  return { manifest, files };
}

function normalizeZipName(name: string): string {
  const normalized = name.replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized) throw new Error('插件 ZIP 包含空路径。');
  return normalized;
}
