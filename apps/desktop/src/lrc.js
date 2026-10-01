/** Minimal LRC lyric parsing and active-line lookup. */

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Parse an LRC document into [{ timeMs, text }] sorted by time. */
export function parseLrc(text) {
  const lines = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    TIME_TAG.lastIndex = 0;
    const stamps = [];
    let match;
    let lastIndex = 0;
    while ((match = TIME_TAG.exec(rawLine))) {
      if (match.index !== lastIndex) break;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
      stamps.push((minutes * 60 + seconds) * 1000 + fraction);
      lastIndex = TIME_TAG.lastIndex;
    }
    if (!stamps.length) continue;
    const content = rawLine.slice(lastIndex).trim();
    for (const timeMs of stamps) lines.push({ timeMs, text: content });
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

/** Index of the line active at `timeMs`, or -1 before the first line. */
export function activeLineIndex(lines, timeMs) {
  let index = -1;
  for (let cursor = 0; cursor < lines.length; cursor += 1) {
    if (lines[cursor].timeMs <= timeMs + 120) index = cursor;
    else break;
  }
  return index;
}

export function isLrc(text) {
  TIME_TAG.lastIndex = 0;
  return TIME_TAG.test(String(text ?? ''));
}
