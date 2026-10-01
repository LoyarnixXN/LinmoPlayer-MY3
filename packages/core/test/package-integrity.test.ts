import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareVersions,
  isValidVersion,
  missingPermissions,
  normalizeIntegrityRecord,
} from '../src/package-integrity.ts';

describe('package-integrity', () => {
  it('compares simple versions', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.ok(compareVersions('1.1.0', '1.0.9') > 0);
    assert.ok(compareVersions('2.0.0', '10.0.0') < 0);
    assert.ok(compareVersions('v1.2.3', '1.2.3') === 0);
  });

  it('validates version strings', () => {
    assert.equal(isValidVersion('1.0.0'), true);
    assert.equal(isValidVersion(''), false);
    assert.equal(isValidVersion(undefined), false);
  });

  it('normalizes integrity records', () => {
    const checksum = 'a'.repeat(64);
    const record = normalizeIntegrityRecord({
      pluginId: 'netease',
      version: '1.2.0',
      checksum: checksum.toUpperCase(),
      fileName: 'netease-1.2.0.zip',
    });
    assert.equal(record?.checksum, checksum);
    assert.equal(record?.algorithm, 'sha256');
    assert.equal(normalizeIntegrityRecord({ checksum: 'zz' }), null);
  });

  it('computes missing permissions', () => {
    assert.deepEqual(missingPermissions(['network'], ['network']), []);
    assert.deepEqual(missingPermissions(['network', 'secure-storage'], ['network']), [
      'secure-storage',
    ]);
    assert.deepEqual(missingPermissions(undefined, ['network']), []);
  });
});
