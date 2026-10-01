import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeThemeTokens, normalizeThemePayload } from '../src/theme-tokens.ts';

describe('theme-tokens', () => {
  it('merges overrides over defaults', () => {
    const merged = mergeThemeTokens(
      normalizeThemePayload({ name: 'Dark', mode: 'dark', colors: { primary: '#ABCDEF' } }, 'x'),
    );
    assert.equal(merged.primary, '#abcdef');
    assert.equal(merged.error, '#BA1A1A');
  });

  it('rejects invalid colors', () => {
    assert.throws(() => normalizeThemePayload({ colors: { primary: 'purple' } }, 'x'));
  });

  it('defaults name when missing', () => {
    const payload = normalizeThemePayload({}, 'fallback');
    assert.equal(payload.name, 'fallback');
    assert.equal(payload.mode, 'light');
  });
});
