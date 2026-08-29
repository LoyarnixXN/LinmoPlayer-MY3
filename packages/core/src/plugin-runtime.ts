import type { MusicPlugin } from './plugin-contract';
import type { PluginCallResult, PluginRegistry } from './plugin-registry';

/**
 * Runtime-neutral loader boundary.
 *
 * The mobile host must inject a sandboxed implementation in a later phase.
 * This package intentionally does not implement require(), network downloads,
 * or execution of untrusted JavaScript.
 */
export interface PluginModuleLoader {
  discover(): Promise<readonly string[]>;
  load(moduleId: string): Promise<MusicPlugin>;
}

export interface PluginLoadReport {
  readonly moduleId: string;
  readonly result: PluginCallResult<void>;
}

export class PluginRuntime {
  public constructor(
    private readonly loader: PluginModuleLoader,
    private readonly registry: PluginRegistry,
  ) {}

  public async loadDiscovered(): Promise<readonly PluginLoadReport[]> {
    const moduleIds = await this.loader.discover();
    const reports: PluginLoadReport[] = [];
    for (const moduleId of moduleIds) {
      try {
        const plugin = await this.loader.load(moduleId);
        reports.push({ moduleId, result: this.registry.register(plugin) });
      } catch (error) {
        reports.push({
          moduleId,
          result: {
            ok: false,
            error: error instanceof Error ? error.message : 'Plugin module could not be loaded.',
          },
        });
      }
    }
    return reports;
  }
}
