import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreSongMatch } from '../src/source-aggregator.ts';
import type { UnifiedSong } from '../src/models.ts';

function song(
  overrides: Partial<UnifiedSong> & Pick<UnifiedSong, 'title' | 'artist'>,
): UnifiedSong {
  return {
    pluginId: 'p',
    sourceId: 'p',
    remoteId: overrides.remoteId ?? '1',
    key: 'p:1',
    ...overrides,
  };
}

describe('scoreSongMatch', () => {
  it('scores exact title+artist highest', () => {
    const a = song({ title: '晴天', artist: '周杰伦', album: '叶惠美' });
    const b = song({ title: '晴天', artist: '周杰伦', album: '叶惠美' });
    assert.ok(scoreSongMatch(a, b) > 4);
  });

  it('scores partial artist overlap lower', () => {
    const target = song({ title: '晴天', artist: '周杰伦 / 梁心颐' });
    const candidate = song({ title: '晴天', artist: '周杰伦' });
    const score = scoreSongMatch(candidate, target);
    assert.ok(score > 3 && score < 5);
  });

  it('returns 0 for different titles', () => {
    const a = song({ title: '晴天', artist: '周杰伦' });
    const b = song({ title: '七里香', artist: '周杰伦' });
    assert.equal(scoreSongMatch(a, b), 0);
  });
});
