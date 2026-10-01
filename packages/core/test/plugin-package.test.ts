import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSafePluginVersion, validatePluginPackageManifest } from '../src/plugin-package.ts';

const validMusicSource = {
  packageVersion: 1,
  id: 'demo-source',
  name: 'Demo',
  version: '1.0.0',
  hostApiVersion: '1',
  kind: 'music-source',
  provider: 'gdstudio',
  capabilities: ['search', 'playback'],
  permissions: ['network', 'secure-storage'],
};

describe('plugin-package', () => {
  it('accepts a valid music-source manifest with permissions', () => {
    const manifest = validatePluginPackageManifest(validMusicSource);
    assert.equal(manifest.id, 'demo-source');
    assert.deepEqual(manifest.permissions, ['network', 'secure-storage']);
  });

  it('rejects unknown permissions', () => {
    assert.throws(
      () =>
        validatePluginPackageManifest({
          ...validMusicSource,
          permissions: ['network', 'root-access'],
        }),
      /未支持的权限/,
    );
  });

  it('defaults music-source kind and rejects bad ids', () => {
    assert.throws(() =>
      validatePluginPackageManifest({
        packageVersion: 1,
        id: 'Bad ID!',
        name: 'X',
        version: '1',
        hostApiVersion: '1',
        capabilities: ['search'],
        provider: 'gdstudio',
      }),
    );
  });

  it('validates font plugin shape', () => {
    const manifest = validatePluginPackageManifest({
      packageVersion: 1,
      id: 'font-inter',
      name: 'Inter',
      version: '1.0.0',
      hostApiVersion: '1',
      kind: 'font',
      font: { family: 'Inter', file: 'Inter.woff2' },
    });
    assert.equal(manifest.kind, 'font');
  });

  it('validates bundled service spec', () => {
    const manifest = validatePluginPackageManifest({
      ...validMusicSource,
      id: 'demo-service',
      service: { entry: 'service/server.mjs', port: 18765 },
    });
    assert.deepEqual(manifest.service, { entry: 'service/server.mjs', port: 18765 });
  });

  it('rejects invalid service ports and paths', () => {
    assert.throws(
      () =>
        validatePluginPackageManifest({
          ...validMusicSource,
          service: { entry: 'service/server.mjs', port: 0 },
        }),
      /service\.port/,
    );
    assert.throws(
      () =>
        validatePluginPackageManifest({
          ...validMusicSource,
          service: { entry: '../escape.mjs', port: 3000 },
        }),
      /service\.entry/,
    );
  });

  it('rejects path-like plugin versions used as file names', () => {
    assert.equal(isSafePluginVersion('1.0.0'), true);
    assert.equal(isSafePluginVersion('1.2.3-beta.1+build'), true);
    assert.equal(isSafePluginVersion('../escape'), false);
    assert.equal(isSafePluginVersion('1.0.0/../../evil'), false);
    assert.equal(isSafePluginVersion('1.0.0\\..\\evil'), false);
    assert.equal(isSafePluginVersion('1.0.0-..'), false);
    assert.equal(isSafePluginVersion(''), false);
    assert.throws(
      () =>
        validatePluginPackageManifest({
          ...validMusicSource,
          version: '1.0.0/../../evil',
        }),
      /版本号/,
    );
  });
});
