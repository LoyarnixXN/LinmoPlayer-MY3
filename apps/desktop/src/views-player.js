/** Mini player bar and Now Playing overlay (core transport only; lyrics/queue UI deferred). */

import { state, subscribe } from './state.js';
import { player } from './player.js';
import { fetchCover } from './core-bridge.js';
import { icon } from './icons.js';
import { qs, escapeHtml, coverMarkup, formatTime } from './ui.js';

let miniDragging = false;
let npDragging = false;

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
  const duration = Number.isFinite(player.audio.duration) ? player.audio.duration : 0;
  root.innerHTML = `<div class="mini-info" id="mini-open" role="button" tabindex="${song ? 0 : -1}" aria-label="打开播放页" ${song ? '' : 'aria-disabled="true"'}>
      ${coverMarkup(song, 'small')}
      <span class="mini-copy">
        <strong>${song ? escapeHtml(song.title) : '未选择歌曲'}</strong>
        <small>${song ? `${escapeHtml(song.artist)}${song.album ? ` · ${escapeHtml(song.album)}` : ''}` : '导入或搜索音乐后开始播放'}</small>
      </span>
    </div>
    <div class="mini-transport">
      <div class="mini-controls">
        <button type="button" class="player-control ripple mode-control ${state.settings.playbackMode !== 'sequence' ? 'is-active' : ''}" data-mini-action="mode" aria-label="播放方式：${modeLabel()}" title="播放方式：${modeLabel()}">${icon(modeIcon())}</button>
        <button type="button" class="player-control ripple" data-mini-action="previous" aria-label="上一首" ${canPrev ? '' : 'disabled'}>${icon('previous')}</button>
        <button type="button" class="play-button ripple ${state.isPlaying ? 'is-playing' : ''}" data-mini-action="toggle" aria-label="${state.isPlaying ? '暂停' : '播放'}" ${song ? '' : 'disabled'}>${icon(state.isPlaying ? 'pause' : 'play', 'player-icon')}</button>
        <button type="button" class="player-control ripple" data-mini-action="next" aria-label="下一首" ${canNext ? '' : 'disabled'}>${icon('next')}</button>
        <button type="button" class="player-control ripple" data-mini-action="mute" aria-label="${muted ? '取消静音' : '静音'}">${icon(muted ? 'volumeMute' : 'volume')}</button>
      </div>
      <div class="mini-progress-row">
        <span class="mini-time" id="mini-current">0:00</span>
        <input id="mini-progress" class="m3-slider mini-progress" type="range" min="0" max="1000" step="1" value="0" aria-label="播放进度" ${song ? '' : 'disabled'} />
        <span class="mini-time is-right" id="mini-duration">${duration ? formatTime(duration) : '0:00'}</span>
      </div>
    </div>
    <div class="mini-extra">
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
  const info = qs('#mini-open', root);
  info?.addEventListener('click', () => {
    if (!song) return;
    setNowPlayingOpen(true);
  });
  info?.addEventListener('keydown', (event) => {
    if (!song) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setNowPlayingOpen(true);
    }
  });
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

export function updateProgressUI() {
  const audio = player.audio;
  const fraction =
    Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
  const miniRoot = qs('#mini-player');
  if (miniRoot) miniRoot.style.setProperty('--progress', `${Math.round(fraction * 100)}%`);
  const mini = qs('#mini-progress');
  if (mini && !miniDragging && document.activeElement !== mini)
    mini.value = String(Math.round(fraction * 1000));
  const miniCurrent = qs('#mini-current');
  const miniDuration = qs('#mini-duration');
  if (miniCurrent) miniCurrent.textContent = formatTime(audio.currentTime);
  if (miniDuration)
    miniDuration.textContent = Number.isFinite(audio.duration)
      ? formatTime(audio.duration)
      : '0:00';
  const np = qs('#np-progress');
  if (np && !npDragging && document.activeElement !== np)
    np.value = String(Math.round(fraction * 1000));
  const npCurrent = qs('#np-current');
  const npDuration = qs('#np-duration');
  if (npCurrent) npCurrent.textContent = formatTime(audio.currentTime);
  if (npDuration)
    npDuration.textContent = Number.isFinite(audio.duration) ? formatTime(audio.duration) : '0:00';
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
  subscribe('player', () => {
    renderMiniPlayer();
    if (state.nowPlayingOpen) renderNowPlaying();
  });
  subscribe('player-time', () => {
    updateProgressUI();
  });
  subscribe('theme', () => renderMiniPlayer());
}
