/** Mini player bar, Now Playing overlay, lyrics and queue tabs. */

import { state, publish, subscribe } from './state.js';
import { player } from './player.js';
import { fetchCover } from './core-bridge.js';
import { icon } from './icons.js';
import { qs, qsa, escapeHtml, coverMarkup, formatTime } from './ui.js';
import { activeLineIndex } from './lrc.js';

let miniDragging = false;
let npDragging = false;
let activeLyricIndex = -2;
let lyricsHoldUntil = 0;

function modeIcon() {
  return player.modeMeta().icon;
}

function modeLabel() {
  return player.modeMeta().label;
}

export function renderMiniPlayer() {
  const root = qs('#mini-player');
  if (!root) return;
  const song = state.currentSong;
  const muted = player.audio.muted || player.audio.volume === 0;
  const canPrev = Boolean(song && (player.audio.currentTime > 3 || state.queueIndex > 0));
  const canNext = Boolean(song && state.queueIndex < state.queue.length - 1);
  root.innerHTML = `<input id="mini-progress" class="mini-progress-top" type="range" min="0" max="1000" step="1" value="0" aria-label="播放进度" ${song ? '' : 'disabled'} />
    <button type="button" class="mini-info" id="mini-open" aria-label="打开播放页" ${song ? '' : 'disabled'}>
      ${coverMarkup(song, 'small')}
      <span class="mini-copy">
        <strong>${song ? escapeHtml(song.title) : '未选择歌曲'}</strong>
        <small>${song ? `${escapeHtml(song.artist)}${song.album ? ` · ${escapeHtml(song.album)}` : ''}` : '导入或搜索音乐后开始播放'}</small>
      </span>
    </button>
    <div class="mini-controls">
      <button type="button" class="player-control ripple mode-control ${state.settings.playbackMode !== 'sequence' ? 'is-active' : ''}" data-mini-action="mode" aria-label="播放方式：${modeLabel()}" title="播放方式：${modeLabel()}">${icon(modeIcon())}</button>
      <button type="button" class="player-control ripple" data-mini-action="previous" aria-label="上一首" ${canPrev ? '' : 'disabled'}>${icon('previous')}</button>
      <button type="button" class="play-button ripple ${state.isPlaying ? 'is-playing' : ''}" data-mini-action="toggle" aria-label="${state.isPlaying ? '暂停' : '播放'}" ${song ? '' : 'disabled'}>${icon(state.isPlaying ? 'pause' : 'play', 'player-icon')}</button>
      <button type="button" class="player-control ripple" data-mini-action="next" aria-label="下一首" ${canNext ? '' : 'disabled'}>${icon('next')}</button>
    </div>
    <div class="mini-extra">
      <button type="button" class="player-control ripple" data-mini-action="mute" aria-label="${muted ? '取消静音' : '静音'}">${icon(muted ? 'volumeMute' : 'volume')}</button>
      <input class="m3-slider volume-slider" type="range" min="0" max="100" step="1" value="${Math.round((muted ? 0 : player.audio.volume) * 100)}" aria-label="音量" />
    </div>`;
  root
    .querySelector('[data-mini-action="toggle"]')
    ?.addEventListener('click', () => void player.toggle());
  root
    .querySelector('[data-mini-action="mode"]')
    ?.addEventListener('click', () => player.cycleMode());
  root
    .querySelector('[data-mini-action="previous"]')
    ?.addEventListener('click', () => player.previous());
  root.querySelector('[data-mini-action="next"]')?.addEventListener('click', () => player.next());
  root
    .querySelector('[data-mini-action="mute"]')
    ?.addEventListener('click', () => player.toggleMute());
  qs('#mini-open', root)?.addEventListener('click', () => setNowPlayingOpen(true));
  const miniProgress = qs('#mini-progress', root);
  miniProgress?.addEventListener('pointerdown', () => (miniDragging = true));
  miniProgress?.addEventListener('pointerup', () => (miniDragging = false));
  miniProgress?.addEventListener('input', (event) =>
    player.seekFraction(Number(event.target.value) / 1000),
  );
  const volume = qs('.volume-slider', root);
  volume?.addEventListener('input', (event) => player.setVolume(Number(event.target.value) / 100));
  updateProgressUI();
}

export function setNowPlayingOpen(open) {
  state.nowPlayingOpen = open;
  const overlay = qs('#now-playing');
  if (!overlay) return;
  overlay.classList.toggle('is-open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  if (open) renderNowPlaying();
}

export function renderNowPlaying() {
  const overlay = qs('#now-playing');
  if (!overlay) return;
  const song = state.currentSong;
  const via = state.resolvedVia;
  const coverUrl = song?.coverUrl ?? null;
  overlay.style.setProperty('--np-cover-image', coverUrl ? `url("${coverUrl}")` : 'none');
  const coverEl = qs('#np-cover', overlay);
  coverEl.innerHTML = song ? coverMarkup(song, 'large') : coverMarkup(null, 'large');
  if (song && !song.coverUrl) {
    void (async () => {
      const url = await fetchCover(song);
      if (!url || state.currentSong?.key !== song.key) return;
      overlay.style.setProperty('--np-cover-image', `url("${url}")`);
      const el = qs('#np-cover .cover', overlay) ?? qs('#np-cover', overlay);
      if (!el) return;
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.onerror = () => img.remove();
      el.classList.add('cover-image');
      el.appendChild(img);
    })();
  }
  qs('#np-title', overlay).textContent = song?.title ?? '未选择歌曲';
  qs('#np-artist', overlay).textContent = song
    ? `${song.artist}${song.album ? ` · ${song.album}` : ''}`
    : '导入或搜索音乐后开始播放';
  const viaNode = qs('#np-via', overlay);
  if (via && !song?.mediaUri) {
    viaNode.hidden = false;
    viaNode.innerHTML = `${icon('info', 'row-icon')}${via.fallbackUsed ? '已多源补全 · ' : '来源：'}${escapeHtml(
      via.pluginId,
    )}${via.source ? ` · ${escapeHtml(via.source)}` : ''}`;
  } else if (song?.mediaUri) {
    viaNode.hidden = false;
    viaNode.textContent = '本地文件';
  } else {
    viaNode.hidden = true;
  }
  renderNpControls();
  renderLyricsTab();
  renderQueueTab();
}

function renderNpControls() {
  const overlay = qs('#now-playing');
  if (!overlay) return;
  const muted = player.audio.muted || player.audio.volume === 0;
  const canPrev = Boolean(
    state.currentSong && (player.audio.currentTime > 3 || state.queueIndex > 0),
  );
  const canNext = Boolean(state.currentSong && state.queueIndex < state.queue.length - 1);
  const mode = qs('#np-mode', overlay);
  if (mode) {
    mode.innerHTML = icon(modeIcon());
    mode.classList.toggle('is-active', state.settings.playbackMode !== 'sequence');
    mode.setAttribute('aria-label', `播放方式：${modeLabel()}`);
  }
  const prev = qs('#np-previous', overlay);
  if (prev) prev.disabled = !canPrev;
  const play = qs('#np-play', overlay);
  if (play) {
    play.innerHTML = icon(state.isPlaying ? 'pause' : 'play', 'player-icon');
    play.classList.toggle('is-playing', state.isPlaying);
    play.setAttribute('aria-label', state.isPlaying ? '暂停' : '播放');
  }
  const next = qs('#np-next', overlay);
  if (next) next.disabled = !canNext;
  const mute = qs('#np-mute', overlay);
  if (mute) {
    mute.innerHTML = icon(muted ? 'volumeMute' : 'volume');
    mute.setAttribute('aria-label', muted ? '取消静音' : '静音');
  }
  const volume = qs('#np-volume', overlay);
  if (volume && document.activeElement !== volume)
    volume.value = String(Math.round((muted ? 0 : player.audio.volume) * 100));
}

export function renderLyricsTab() {
  const container = qs('#np-lyrics');
  if (!container) return;
  const lyrics = state.lyrics;
  activeLyricIndex = -2;
  if (!state.currentSong || state.currentSong.mediaUri) {
    container.innerHTML = `<div class="lyrics-empty">本地歌曲暂无歌词服务。</div>`;
    return;
  }
  if (!lyrics || lyrics.songKey !== state.currentSong.key) {
    container.innerHTML = `<div class="lyrics-empty">歌词尚未加载。</div>`;
    return;
  }
  if (lyrics.loading) {
    container.innerHTML = `<div class="lyrics-empty"><span class="spinner"></span>正在获取歌词…</div>`;
    return;
  }
  if (lyrics.error || (!lyrics.lines.length && !lyrics.plain)) {
    container.innerHTML = `<div class="lyrics-empty">${escapeHtml(lyrics.error || '这首歌曲暂时没有歌词。')}</div>`;
    return;
  }
  if (lyrics.synced) {
    const translated = new Map(lyrics.translatedLines.map((line) => [line.timeMs, line.text]));
    container.innerHTML = lyrics.lines
      .map(
        (line, index) =>
          `<div class="lyrics-line" data-line="${index}"><span>${escapeHtml(line.text || '· · ·')}</span>${
            translated.has(line.timeMs)
              ? `<small>${escapeHtml(translated.get(line.timeMs))}</small>`
              : ''
          }</div>`,
      )
      .join('');
  } else {
    container.innerHTML = `<div class="lyrics-plain">${escapeHtml(lyrics.plain)}${
      lyrics.translatedPlain ? `\n\n—— 翻译 ——\n${escapeHtml(lyrics.translatedPlain)}` : ''
    }</div>`;
  }
}

export function renderQueueTab() {
  const container = qs('#np-queue');
  if (!container) return;
  if (!state.queue.length) {
    container.innerHTML = `<div class="lyrics-empty">播放队列为空。</div>`;
    return;
  }
  container.innerHTML = state.queue
    .map(
      (song, index) =>
        `<button type="button" class="queue-row ${index === state.queueIndex ? 'is-active' : ''}" data-queue-index="${index}">
          <span class="queue-index">${index === state.queueIndex ? icon('play', 'row-icon') : index + 1}</span>
          <span class="queue-copy"><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist)}</small></span>
        </button>`,
    )
    .join('');
  container
    .querySelectorAll('[data-queue-index]')
    .forEach((row) =>
      row.addEventListener('click', () => player.playSongAt(Number(row.dataset.queueIndex))),
    );
}

export function updateProgressUI() {
  const audio = player.audio;
  const fraction =
    Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
  const miniRoot = qs('#mini-player');
  if (miniRoot) miniRoot.style.setProperty('--progress', `${Math.round(fraction * 100)}%`);
  const mini = qs('#mini-progress');
  if (mini && !miniDragging && document.activeElement !== mini)
    mini.value = String(Math.round(fraction * 1000));
  const np = qs('#np-progress');
  if (np && !npDragging && document.activeElement !== np)
    np.value = String(Math.round(fraction * 1000));
}

function updateLyricsHighlight() {
  if (!state.nowPlayingOpen) return;
  const lyrics = state.lyrics;
  const container = qs('#np-lyrics');
  if (!lyrics?.synced || !container) return;
  const index = activeLineIndex(lyrics.lines, player.audio.currentTime * 1000);
  if (index === activeLyricIndex) return;
  activeLyricIndex = index;
  qsa('.lyrics-line', container).forEach((node) => {
    const isActive = Number(node.dataset.line) === index;
    node.classList.toggle('is-active', isActive);
    if (isActive && Date.now() > lyricsHoldUntil)
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

export function initPlayerView() {
  const overlay = qs('#now-playing');
  if (!overlay) return;
  qs('#np-close', overlay)?.addEventListener('click', () => setNowPlayingOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.nowPlayingOpen) setNowPlayingOpen(false);
  });
  qs('#np-play', overlay)?.addEventListener('click', () => void player.toggle());
  qs('#np-mode', overlay)?.addEventListener('click', () => {
    player.cycleMode();
    renderNpControls();
  });
  qs('#np-previous', overlay)?.addEventListener('click', () => player.previous());
  qs('#np-next', overlay)?.addEventListener('click', () => player.next());
  qs('#np-mute', overlay)?.addEventListener('click', () => {
    player.toggleMute();
    renderNpControls();
  });
  const npProgress = qs('#np-progress', overlay);
  npProgress?.addEventListener('pointerdown', () => (npDragging = true));
  npProgress?.addEventListener('pointerup', () => (npDragging = false));
  npProgress?.addEventListener('input', (event) =>
    player.seekFraction(Number(event.target.value) / 1000),
  );
  qs('#np-volume', overlay)?.addEventListener('input', (event) => {
    player.setVolume(Number(event.target.value) / 100);
    renderNpControls();
  });
  qs('#np-tab-lyrics', overlay)?.addEventListener('click', () => switchNpTab('lyrics'));
  qs('#np-tab-queue', overlay)?.addEventListener('click', () => switchNpTab('queue'));
  const lyricsContainer = qs('#np-lyrics', overlay);
  lyricsContainer?.addEventListener('wheel', () => (lyricsHoldUntil = Date.now() + 4000), {
    passive: true,
  });
  lyricsContainer?.addEventListener('click', (event) => {
    const line = event.target instanceof Element ? event.target.closest('[data-line]') : null;
    if (!line || !state.lyrics?.synced) return;
    const timeMs = state.lyrics.lines[Number(line.dataset.line)]?.timeMs;
    if (timeMs !== undefined)
      player.seekFraction(timeMs / 1000 / Math.max(player.audio.duration, 0.001));
  });
  subscribe('player', () => {
    renderMiniPlayer();
    if (state.nowPlayingOpen) renderNowPlaying();
  });
  subscribe('player-time', () => {
    updateProgressUI();
    updateLyricsHighlight();
  });
  subscribe('lyrics', renderLyricsTab);
  subscribe('queue', renderQueueTab);
  subscribe('theme', () => renderMiniPlayer());
}

function switchNpTab(tab) {
  const overlay = qs('#now-playing');
  if (!overlay) return;
  qs('#np-tab-lyrics', overlay)?.classList.toggle('is-selected', tab === 'lyrics');
  qs('#np-tab-queue', overlay)?.classList.toggle('is-selected', tab === 'queue');
  qs('#np-lyrics', overlay)?.classList.toggle('is-selected', tab === 'lyrics');
  qs('#np-queue', overlay)?.classList.toggle('is-selected', tab === 'queue');
}
