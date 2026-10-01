/** Playback orchestration: queue, modes, resolve pipeline, lyrics priming. */

import {
  state,
  patchSettings,
  publish,
  persisters,
  playbackMemory,
  PLAYBACK_MODES,
} from './state.js';
import { resolvePlayback, fetchLyrics, localMediaUrl, fetchCover } from './core-bridge.js';
import { parseLrc, isLrc } from './lrc.js';
import { snackbar } from './ui.js';

const audio = new Audio();
audio.preload = 'metadata';
audio.volume = clampVolume(state.settings.volume);
audio.muted = Boolean(state.settings.muted);
let lastVolume = audio.volume > 0 ? audio.volume : 0.8;
let resolveToken = 0;
let lastMemorySaveAt = 0;
let pendingSeekSeconds = 0;
let lastNotifiedKey = '';
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
  pendingSeekSeconds = 0;
  publish('player');
  void primeLyrics(song);
  void updateMediaSession(song);
}

function savedPositionSeconds(songKey) {
  const entry = playbackMemory[songKey];
  if (!entry || !Number.isFinite(entry.positionMs)) return 0;
  return Math.max(0, entry.positionMs / 1000);
}

function rememberPlayback(force = false) {
  const song = state.currentSong;
  if (!song?.key) return;
  const now = Date.now();
  if (!force && now - lastMemorySaveAt < 5000) return;
  lastMemorySaveAt = now;
  const duration = audio.duration;
  const position = audio.currentTime;
  if (!Number.isFinite(position)) return;
  // Near the end: treat as finished, do not resume into the outro.
  if (Number.isFinite(duration) && duration > 0 && position >= duration - 2) {
    delete playbackMemory[song.key];
  } else {
    playbackMemory[song.key] = {
      positionMs: Math.round(position * 1000),
      durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : undefined,
      updatedAt: new Date().toISOString(),
    };
  }
  persisters.playbackMemory();
}

function applyPendingSeek() {
  if (pendingSeekSeconds <= 0) return;
  const duration = audio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const target = Math.min(pendingSeekSeconds, Math.max(0, duration - 1));
  if (target > 1) {
    try {
      audio.currentTime = target;
    } catch {
      /* metadata not ready yet */
    }
  }
  pendingSeekSeconds = 0;
}

async function notifyTrackChange(song) {
  if (!state.settings.notifyOnTrackChange) return;
  if (!song || lastNotifiedKey === song.key) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  lastNotifiedKey = song.key;
  let iconUrl = '';
  if (song.coverUrl) iconUrl = song.coverUrl;
  else {
    const resolved = await fetchCover(song);
    if (resolved) iconUrl = resolved;
  }
  try {
    new Notification(song.title, {
      body: song.artist + (song.album ? ` · ${song.album}` : ''),
      ...(iconUrl ? { icon: iconUrl } : {}),
      silent: true,
    });
  } catch {
    /* notification unsupported or blocked */
  }
}

async function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  if (!song) {
    navigator.mediaSession.metadata = null;
    return;
  }
  let artwork = [];
  const coverUrl = song.coverUrl ?? (await fetchCover(song));
  if (coverUrl) {
    artwork = [
      { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
      { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
    ];
  }
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      ...(song.album ? { album: song.album } : {}),
      ...(artwork.length ? { artwork } : {}),
    });
  } catch {
    /* MediaMetadata unsupported */
  }
}

function bindMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const set = (action, handler) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* action not supported */
    }
  };
  set('play', () => void audio.play().catch(() => undefined));
  set('pause', () => audio.pause());
  set('previoustrack', () => player.previous());
  set('nexttrack', () => player.next());
  set('seekto', (details) => {
    if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime))
      audio.currentTime = Math.max(0, details.seekTime);
  });
  set('seekbackward', (details) => {
    const offset = details?.seekOffset ?? 10;
    audio.currentTime = Math.max(0, audio.currentTime - offset);
  });
  set('seekforward', (details) => {
    const offset = details?.seekOffset ?? 10;
    const duration = audio.duration;
    const next = audio.currentTime + offset;
    audio.currentTime = Number.isFinite(duration) ? Math.min(duration, next) : next;
  });
}

function syncMediaSessionPosition() {
  if (
    !('mediaSession' in navigator) ||
    typeof navigator.mediaSession.setPositionState !== 'function'
  )
    return;
  const duration = audio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(audio.currentTime, duration),
    });
  } catch {
    /* invalid position state */
  }
}

export function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => undefined);
  }
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
    pendingSeekSeconds = savedPositionSeconds(song.key);
    if (pendingSeekSeconds > 0) {
      const resumeAt = pendingSeekSeconds;
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (token === resolveToken && pendingSeekSeconds === resumeAt) applyPendingSeek();
        },
        { once: true },
      );
    }
    await audio.play();
    if (resolved.fallbackUsed) {
      const viaName = state.resolvedVia?.source
        ? `${state.resolvedVia.pluginId} · ${state.resolvedVia.source}`
        : state.resolvedVia?.pluginId;
      snackbar(`原音源不可用，已从 ${viaName} 补全播放`);
    }
    registerRecent(song);
    void notifyTrackChange(song);
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
      pendingSeekSeconds = savedPositionSeconds(song.key);
      const resumeAt = pendingSeekSeconds;
      if (resumeAt > 0) {
        audio.addEventListener(
          'loadedmetadata',
          () => {
            if (state.currentSong?.key === song.key && pendingSeekSeconds === resumeAt)
              applyPendingSeek();
          },
          { once: true },
        );
      }
      audio.play().catch(() => setStatus('error', '无法播放本地文件。'));
      registerRecent(song);
      void notifyTrackChange(song);
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
  rememberPlayback(true);
  publish('player');
});
audio.addEventListener('playing', () => setStatus('playing'));
audio.addEventListener('pause', () => {
  if (state.playerStatus === 'playing' || state.playerStatus === 'loading') setStatus('paused');
});
audio.addEventListener('timeupdate', () => {
  rememberPlayback(false);
  syncMediaSessionPosition();
  publish('player-time');
});
audio.addEventListener('loadedmetadata', () => {
  applyPendingSeek();
  syncMediaSessionPosition();
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
  rememberPlayback(true);
  const mode = state.settings.playbackMode;
  if (mode === 'repeat-one') {
    audio.currentTime = 0;
    delete playbackMemory[state.currentSong?.key ?? ''];
    persisters.playbackMemory();
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
window.addEventListener('beforeunload', () => rememberPlayback(true));

bindMediaSessionHandlers();
