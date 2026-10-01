import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PluginRegistry } from '../src/plugin-registry.ts';
import type { MusicPlugin } from '../src/plugin-contract.ts';

function plugin(overrides: Partial<MusicPlugin> & Pick<MusicPlugin, 'manifest'>): MusicPlugin {
  return {
    search: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    ...overrides,
  };
}

describe('PluginRegistry', () => {
  it('registers, enables, invokes and unregisters', async () => {
    const registry = new PluginRegistry();
    const musicPlugin = plugin({
      manifest: {
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        hostApiVersion: '1',
        capabilities: ['search'],
      },
    });
    assert.equal(registry.register(musicPlugin).ok, true);
    assert.equal(registry.register(musicPlugin).ok, false);
    const enabled = await registry.enable('demo', {
      sourceId: 'demo',
      storage: {
        get: async () => null,
        set: async () => undefined,
        remove: async () => undefined,
      },
      log: () => undefined,
    });
    assert.equal(enabled.ok, true);
    const invoked = await registry.invoke('demo', 'search', (p) =>
      p.search!({ query: '', type: 'song', page: 1, pageSize: 20 }),
    );
    assert.equal(invoked.ok, true);
    assert.equal(registry.unregister('demo'), true);
  });

  it('rejects incompatible host API version', () => {
    const registry = new PluginRegistry();
    const result = registry.register(
      plugin({
        manifest: {
          id: 'future',
          name: 'Future',
          version: '1.0.0',
          hostApiVersion: '99',
          capabilities: ['search'],
        },
      }),
    );
    assert.equal(result.ok, false);
  });
});
