/** Playback orchestration: queue, modes, resolve pipeline, lyrics priming. */

import { state, patchSettings, publish, persisters, PLAYBACK_MODES } from './state.js';
import { resolvePlayback, fetchLyrics, localMediaUrl } from './core-bridge.js';
import { parseLrc, isLrc } from './lrc.js';
import { snackbar } from './ui.js';

const audio = new Audio();
audio.preload = 'metadata';
audio.volume = clampVolume(state.settings.volume);
audio.muted = Boolean(state.settings.muted);
let lastVolume = audio.volume > 0 ? audio.volume : 0.8;
let resolveToken = 0;
const lyricsCache = new Map();

function clampVolume(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function statusLabel(status) {
  return status;
}

function setStatus(status, error = null) {
  state.playerStatus = status;
  state.playerError = error;
  publish('player');
}

function setSong(song, queue = state.queue, index = -1) {
  state.currentSong = song;
  state.queue = queue;
  state.queueIndex = index;
  state.resolvedVia = null;
  publish('player');
  void primeLyrics(song);
}

export function registerRecent(song) {
  if (!song) return;
  if (song.pluginId === 'local' && !song.mediaUri) return;
  state.recents = [
    { ...song, playedAt: new Date().toISOString() },
    ...state.recents.filter((item) => item.key !== song.key),
  ].slice(0, 30);
  persisters.recents();
  publish('recents');
}

async function primeLyrics(song) {
  if (!song || song.mediaUri) return;
  if (lyricsCache.has(song.key)) {
    state.lyrics = { ...lyricsCache.get(song.key), songKey: song.key };
    publish('lyrics');
    return;
  }
  state.lyrics = { loading: true, songKey: song.key, lines: [], synced: false, plain: '' };
  publish('lyrics');
  const result = await fetchLyrics(song);
  if (state.currentSong?.key !== song.key) return;
  let payload;
  if (result.ok && (result.value.lyric ?? '').trim()) {
    const lyricText = result.value.lyric ?? '';
    const translated = result.value.translatedLyric ?? '';
    const synced = Boolean(result.value.synced) && isLrc(lyricText);
    payload = {
      loading: false,
      lines: synced ? parseLrc(lyricText) : [],
      synced,
      plain: synced ? '' : lyricText,
      translatedLines: synced && translated ? parseLrc(translated) : [],
      translatedPlain: synced ? '' : translated,
      error: '',
    };
  } else {
    payload = {
      loading: false,
      lines: [],
      synced: false,
      plain: '',
      translatedLines: [],
      translatedPlain: '',
      error: result.ok ? '这首歌曲暂时没有歌词。' : result.error,
    };
  }
  lyricsCache.set(song.key, payload);
  state.lyrics = { ...payload, songKey: song.key };
  publish('lyrics');
}

async function playResolved(song, index) {
  const token = ++resolveToken;
  setStatus('loading');
  try {
    const resolved = await resolvePlayback(song);
    if (token !== resolveToken) return;
    state.resolvedVia = resolved.viaPluginId
      ? {
          pluginId: resolved.viaPluginId,
          ...(resolved.viaSource ? { source: resolved.viaSource } : {}),
          fallbackUsed: Boolean(resolved.fallbackUsed),
        }
      : null;
    audio.src = resolved.url;
    audio.currentTime = 0;
    await audio.play();
    if (resolved.fallbackUsed) {
      const viaName = state.resolvedVia?.source
        ? `${state.resolvedVia.pluginId} · ${state.resolvedVia.source}`
        : state.resolvedVia?.pluginId;
      snackbar(`原音源不可用，已从 ${viaName} 补全播放`);
    }
    registerRecent(song);
  } catch (error) {
    if (token !== resolveToken) return;
    audio.removeAttribute('src');
    setStatus('error', error instanceof Error ? error.message : '播放地址解析失败。');
    snackbar(state.playerError ?? '播放失败');
  }
}

export const player = {
  audio,

  statusLabel,

  /** Start playing `list` at `index` (defaults to first). */
  playContext(list, index = 0) {
    const song = list[index];
    if (!song) return;
    setSong(song, list, index);
    if (song.mediaUri) {
      setStatus('loading');
      audio.src = localMediaUrl(song);
      audio.currentTime = 0;
      audio.play().catch(() => setStatus('error', '无法播放本地文件。'));
      registerRecent(song);
    } else {
      void playResolved(song, index);
    }
    publish('queue');
  },

  playSongAt(index) {
    this.playContext(state.queue, index);
  },

  async toggle() {
    if (!state.currentSong) return;
    if (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.05)
      audio.currentTime = 0;
    if (audio.paused) await audio.play().catch(() => undefined);
    else audio.pause();
  },

  seekFraction(fraction) {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, fraction * audio.duration));
  },

  seekBy(seconds) {
    if (!state.currentSong) return;
    audio.currentTime = Math.max(0, audio.currentTime + seconds);
  },

  setVolume(value) {
    const volume = clampVolume(value);
    audio.volume = volume;
    audio.muted = false;
    if (volume > 0) lastVolume = volume;
    patchSettings({ volume, muted: false });
  },

  toggleMute() {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      audio.volume = lastVolume > 0 ? lastVolume : 0.8;
      patchSettings({ volume: audio.volume, muted: false });
    } else {
      patchSettings({ volume: audio.volume, muted: true });
      audio.muted = true;
    }
  },

  cycleMode() {
    const index = PLAYBACK_MODES.indexOf(state.settings.playbackMode);
    patchSettings({ playbackMode: PLAYBACK_MODES[(index + 1) % PLAYBACK_MODES.length] });
  },

  modeMeta() {
    return {
      sequence: { label: '顺序播放', icon: 'list' },
      'repeat-all': { label: '列表循环', icon: 'repeat' },
      shuffle: { label: '随机播放', icon: 'shuffle' },
      'repeat-one': { label: '单曲循环', icon: 'repeatOne' },
    }[state.settings.playbackMode];
  },

  previous() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    this.step(-1);
  },

  next() {
    this.step(1);
  },

  step(direction) {
    const { queue, queueIndex } = state;
    if (!queue.length) return;
    const mode = state.settings.playbackMode;
    if (mode === 'shuffle') {
      const candidates = queue.map((_, index) => index).filter((index) => index !== queueIndex);
      const target = candidates[Math.floor(Math.random() * candidates.length)] ?? queueIndex;
      this.playSongAt(target);
      return;
    }
    let target = queueIndex + direction;
    if (mode === 'repeat-all') target = (target + queue.length) % queue.length;
    if (target < 0 || target >= queue.length) {
      if (state.currentSong) audio.currentTime = 0;
      return;
    }
    this.playSongAt(target);
  },
};

audio.addEventListener('play', () => {
  state.isPlaying = true;
  publish('player');
});
audio.addEventListener('pause', () => {
  state.isPlaying = false;
  publish('player');
});
audio.addEventListener('playing', () => setStatus('playing'));
audio.addEventListener('pause', () => {
  if (state.playerStatus === 'playing' || state.playerStatus === 'loading') setStatus('paused');
});
audio.addEventListener('timeupdate', () => publish('player-time'));
audio.addEventListener('loadedmetadata', () => {
  if (state.currentSong && !state.currentSong.durationMs) {
    state.queue[state.queueIndex] = {
      ...state.currentSong,
      durationMs: Math.round(audio.duration * 1000),
    };
    state.currentSong = state.queue[state.queueIndex];
  }
  publish('player-time');
});
audio.addEventListener('ended', () => {
  const mode = state.settings.playbackMode;
  if (mode === 'repeat-one') {
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
    return;
  }
  if (state.settings.autoplayNext && state.queue.length) {
    const index = state.queueIndex;
    if (mode === 'repeat-all' || index < state.queue.length - 1) {
      player.step(1);
      return;
    }
  }
  state.isPlaying = false;
  setStatus('paused');
  publish('player');
});
audio.addEventListener('error', () => {
  if (!state.currentSong || !audio.src) return;
  setStatus('error', '音频加载失败，可能是网络或音源问题。');
  snackbar(state.playerError);
});
window.addEventListener('blur', () => {
  if (!state.settings.backgroundPlayback && state.isPlaying) audio.pause();
});
