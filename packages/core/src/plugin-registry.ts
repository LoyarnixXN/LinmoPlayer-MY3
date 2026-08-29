import type { PluginCapability, PluginContext, MusicPlugin } from './plugin-contract';
import { HOST_API_VERSION } from './plugin-contract';
import type { PluginId } from './models';

export type PluginStatus = 'registered' | 'enabled' | 'disabled' | 'error';

export interface PluginRecord {
  readonly plugin: MusicPlugin;
  status: PluginStatus;
  lastError?: string;
}

export interface PluginLogger {
  info(message: string, details?: Readonly<Record<string, unknown>>): void;
  error(message: string, details?: Readonly<Record<string, unknown>>): void;
}

export interface PluginCallSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface PluginCallFailure {
  readonly ok: false;
  readonly error: string;
}

export type PluginCallResult<T> = PluginCallSuccess<T> | PluginCallFailure;

const noopLogger: PluginLogger = {
  info: () => undefined,
  error: () => undefined,
};

export class PluginRegistry {
  private readonly records = new Map<PluginId, PluginRecord>();

  public constructor(private readonly logger: PluginLogger = noopLogger) {}

  public register(plugin: MusicPlugin): PluginCallResult<void> {
    const validationError = validateManifest(plugin);
    if (validationError) {
      return { ok: false, error: validationError };
    }
    const id = plugin.manifest.id;
    if (this.records.has(id)) {
      return { ok: false, error: `Plugin ${id} is already registered.` };
    }
    this.records.set(id, { plugin, status: 'registered' });
    this.logger.info('Plugin registered.', { pluginId: id });
    return { ok: true, value: undefined };
  }

  public list(): readonly PluginRecord[] {
    return [...this.records.values()];
  }

  public get(pluginId: PluginId): PluginRecord | undefined {
    return this.records.get(pluginId);
  }

  public async enable(pluginId: PluginId, context: PluginContext): Promise<PluginCallResult<void>> {
    const record = this.records.get(pluginId);
    if (!record) return { ok: false, error: `Plugin ${pluginId} is not registered.` };
    try {
      await record.plugin.initialize?.(context);
      record.status = 'enabled';
      delete record.lastError;
      return { ok: true, value: undefined };
    } catch (error) {
      return this.fail(record, 'initialize', error);
    }
  }

  public async disable(pluginId: PluginId): Promise<PluginCallResult<void>> {
    const record = this.records.get(pluginId);
    if (!record) return { ok: false, error: `Plugin ${pluginId} is not registered.` };
    try {
      await record.plugin.dispose?.();
      record.status = 'disabled';
      return { ok: true, value: undefined };
    } catch (error) {
      return this.fail(record, 'dispose', error);
    }
  }

  public async invoke<T>(
    pluginId: PluginId,
    capability: PluginCapability,
    operation: (plugin: MusicPlugin) => Promise<T>,
  ): Promise<PluginCallResult<T>> {
    const record = this.records.get(pluginId);
    if (!record) return { ok: false, error: `Plugin ${pluginId} is not registered.` };
    if (record.status !== 'enabled') {
      return { ok: false, error: `Plugin ${pluginId} is not enabled.` };
    }
    if (!record.plugin.manifest.capabilities.includes(capability)) {
      return { ok: false, error: `Plugin ${pluginId} does not declare ${capability}.` };
    }
    try {
      return { ok: true, value: await operation(record.plugin) };
    } catch (error) {
      return this.fail(record, capability, error);
    }
  }

  public unregister(pluginId: PluginId): boolean {
    return this.records.delete(pluginId);
  }

  private fail<T>(record: PluginRecord, operation: string, error: unknown): PluginCallResult<T> {
    const message = error instanceof Error ? error.message : 'Unknown plugin error.';
    record.status = 'error';
    record.lastError = message;
    this.logger.error('Plugin operation failed.', {
      pluginId: record.plugin.manifest.id,
      operation,
      error: message,
    });
    return { ok: false, error: message };
  }
}

function validateManifest(plugin: MusicPlugin): string | null {
  const manifest = plugin.manifest;
  if (
    !manifest ||
    typeof manifest.id !== 'string' ||
    typeof manifest.name !== 'string' ||
    typeof manifest.version !== 'string' ||
    typeof manifest.hostApiVersion !== 'string' ||
    !Array.isArray(manifest.capabilities)
  ) {
    return 'Plugin manifest must include id, name and version.';
  }
  if (manifest.hostApiVersion.split('.')[0] !== HOST_API_VERSION.split('.')[0]) {
    return `Plugin ${manifest.id} requires an incompatible host API.`;
  }
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
    return `Plugin ${manifest.id} declares duplicate capabilities.`;
  }
  return null;
}
