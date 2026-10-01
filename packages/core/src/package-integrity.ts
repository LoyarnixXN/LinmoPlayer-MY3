/** Lightweight SemVer-ish compare + package integrity helpers (pure). */

export interface PluginIntegrityRecord {
  readonly pluginId: string;
  readonly version: string;
  readonly checksum: string;
  readonly algorithm: 'sha256';
  readonly installedAt: string;
  readonly fileName: string;
}

function parseVersion(value: string): number[] {
  const core = String(value).trim().replace(/^v/i, '').split(/[+-]/)[0];
  return (core || '0').split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

/** Return >0 when a is newer, <0 when b is newer, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const length = Math.max(pa.length, pb.length);
  for (let index = 0; index < length; index += 1) {
    const left = pa[index] ?? 0;
    const right = pb[index] ?? 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

export function isValidVersion(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 64;
}

export function normalizeIntegrityRecord(input: unknown): PluginIntegrityRecord | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (
    typeof raw.pluginId !== 'string' ||
    typeof raw.version !== 'string' ||
    typeof raw.checksum !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(raw.checksum) ||
    typeof raw.fileName !== 'string'
  ) {
    return null;
  }
  return {
    pluginId: raw.pluginId,
    version: raw.version,
    checksum: raw.checksum.toLowerCase(),
    algorithm: 'sha256',
    installedAt: typeof raw.installedAt === 'string' ? raw.installedAt : new Date(0).toISOString(),
    fileName: raw.fileName,
  };
}

export function missingPermissions(
  declared: readonly string[] | undefined,
  granted: readonly string[] | undefined,
): readonly string[] {
  const grantedSet = new Set(granted ?? []);
  return (declared ?? []).filter((item) => !grantedSet.has(item));
}
