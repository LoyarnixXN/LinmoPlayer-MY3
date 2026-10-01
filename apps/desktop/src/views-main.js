/** Home, Search and Library pages. */

import { state, publish, persisters, installedPlugin, enabledSourcePlugins } from './state.js';
import { player } from './player.js';
import { searchAll, fetchCover } from './core-bridge.js';
import { icon } from './icons.js';
import { qs, qsa, escapeHtml, coverMarkup, snackbar, formatTime, openDialog } from './ui.js';

export function sourceName(pluginId) {
  if (pluginId === 'local') return '本地';
  return installedPlugin(pluginId)?.name ?? pluginId;
}

let coverHydrationChain = Promise.resolve();

/**
 * Lazily resolve covers for rendered rows whose songs have no coverUrl yet
 * (e.g. GD Studio results, which only ship a pic id). Requests are serialized
 * with a short spacing so public pic endpoints are not hammered; transient
 * failures retry once after the plugin backoff elapses.
 */
export function hydrateCovers(container, list, rowAttr = 'data-row-index') {
  if (!container) return;
  qsa(`[${rowAttr}]`, container).forEach((row) => {
    const song = list[Number(row.getAttribute(rowAttr))];
    if (!song || song.coverUrl) return;
    const coverEl = row.querySelector('.cover');
    if (!coverEl || coverEl.dataset.hydratedKey === song.key) return;
    coverEl.dataset.hydratedKey = song.key;
    const apply = (url) => {
      if (!url || !coverEl.isConnected) return false;
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      coverEl.classList.add('cover-image');
      coverEl.appendChild(img);
      return true;
    };
    coverHydrationChain = coverHydrationChain.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (await (async () => apply(await fetchCover(song)))()) return;
      // One deferred retry for rate-limited lookups.
      await new Promise((resolve) => setTimeout(resolve, 16_000));
      apply(await fetchCover(song));
    });
  });
}

export function songRow(song, list, index, options = {}) {
  const active = state.currentSong?.key === song.key;
  const badge = song.mediaUri ? '本地' : sourceName(song.pluginId);
  const duration = song.durationMs ? formatTime(song.durationMs / 1000) : '';
  const actions = options.removable
    ? `<button type="button" class="row-action ripple" data-row-remove="${index}" aria-label="从歌单移除">${icon('delete')}</button>`
    : `<button type="button" class="row-action ripple" data-row-queue="${index}" aria-label="加入队列">${icon('queueAdd')}</button>
       <button type="button" class="row-action ripple" data-row-playlist="${index}" aria-label="加入歌单">${icon('playlistAdd')}</button>`;
  return `<div class="song-row ripple ${active ? 'is-active' : ''}" role="button" tabindex="0" data-row-index="${index}">
    ${coverMarkup(song, 'small')}
    <span class="song-copy">
      <span class="song-title">${escapeHtml(song.title)}</span>
      <span class="song-artist">${escapeHtml(song.artist)}${song.album ? ` · ${escapeHtml(song.album)}` : ''}</span>
    </span>
    <span class="song-badge">${escapeHtml(badge)}</span>
    <span class="song-duration">${duration}</span>
    ${actions}
  </div>`;
}

export function bindSongRows(container, list, { onRemove } = {}) {
  const listEl = container.classList?.contains('song-list')
    ? container
    : qs('.song-list', container);
  listEl?.addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest('[data-row-index]') : null;
    if (!row) return;
    const index = Number(row.dataset.rowIndex);
    if (event.target instanceof Element && event.target.closest('[data-row-playlist]')) {
      void addToPlaylistFlow(list[index]);
      return;
    }
    if (event.target instanceof Element && event.target.closest('[data-row-queue]')) {
      enqueue(list[index]);
      return;
    }
    if (onRemove && event.target instanceof Element && event.target.closest('[data-row-remove]')) {
      onRemove(index);
      return;
    }
    player.playContext(list, index);
  });
}

export function enqueue(song) {
  if (!song) return;
  if (state.queue.some((item) => item.key === song.key)) {
    snackbar('已在播放队列中');
    return;
  }
  const index = state.queueIndex >= 0 ? state.queueIndex : -1;
  state.queue.splice(index + 1, 0, song);
  publish('queue');
  snackbar(`已加入队列：${song.title}`);
}

async function importAudioFiles() {
  const desktop = window.linmoDesktop;
  const paths = desktop?.library?.pickAudio ? await desktop.library.pickAudio() : [];
  addLocalPaths(paths);
}

async function importAudioFolder() {
  const desktop = window.linmoDesktop;
  const paths = desktop?.library?.pickFolder ? await desktop.library.pickFolder() : [];
  if (paths.length) snackbar(`文件夹扫描完成，发现 ${paths.length} 个音频文件`);
  addLocalPaths(paths);
}

function addLocalPaths(paths) {
  if (!paths?.length) return;
  const known = new Set(state.songs.map((song) => song.remoteId));
  const added = paths
    .filter((path) => !known.has(path))
    .map((path) => ({
      key: `local:${path}`,
      pluginId: 'local',
      sourceId: 'local',
      remoteId: path,
      title: path
        .split(/[\\/]/)
        .pop()
        .replace(/\.[^/.]+$/, ''),
      artist: '本地文件',
      mediaUri: path,
      format: (path.split('.').pop() ?? '').toUpperCase(),
    }));
  if (!added.length) {
    snackbar('所选文件已在音乐库中');
    return;
  }
  state.songs = [...state.songs, ...added];
  persisters.library();
  publish('songs');
  if (!state.currentSong) player.playContext(state.songs, state.songs.indexOf(added[0]));
  snackbar(`已导入 ${added.length} 首本地音乐`);
}

export async function runSearch(query) {
  const trimmed = query.trim();
  state.searchQuery = trimmed;
  state.searchSearched = Boolean(trimmed);
  if (!trimmed) {
    state.searchResults = [];
    state.searchFailures = [];
    state.searchLoading = false;
    publish('search');
    return;
  }
  if (!enabledSourcePlugins().length) {
    state.searchResults = [];
    state.searchFailures = ['没有已启用的音源插件：请先在插件中心导入并启用音源插件。'];
    state.searchLoading = false;
    publish('search');
    return;
  }
  state.searchLoading = true;
  publish('search');
  try {
    const { items, failures } = await searchAll(trimmed);
    state.searchResults = items;
    state.searchFailures = failures;
  } catch (error) {
    state.searchResults = [];
    state.searchFailures = [error instanceof Error ? error.message : '搜索失败'];
  }
  state.searchLoading = false;
  publish('search');
}

function searchResultList() {
  if (state.searchSource === 'all') return state.searchResults.map((item) => item.song);
  return state.searchResults
    .filter((item) => item.pluginId === state.searchSource)
    .map((item) => item.song);
}

export function renderSearch() {
  const root = qs('#page-search');
  if (!root) return;
  const results = searchResultList();
  const sourceIds = [...new Set(state.searchResults.map((item) => item.pluginId))];
  const chips = [
    `<button type="button" class="filter-chip ${state.searchSource === 'all' ? 'is-selected' : ''}" data-search-source="all">全部</button>`,
    ...sourceIds.map(
      (id) =>
        `<button type="button" class="filter-chip ${state.searchSource === id ? 'is-selected' : ''}" data-search-source="${escapeHtml(id)}">${escapeHtml(sourceName(id))}</button>`,
    ),
  ].join('');
  let body;
  if (!state.searchSearched) {
    body = `<div class="empty-state">${icon('search', 'empty-icon')}<h2>搜索在线音乐</h2><p>输入歌名、歌手或专辑，已启用的音源插件会同时搜索。</p></div>`;
  } else if (state.searchLoading) {
    body = `<div class="empty-state"><span class="spinner"></span><h2>正在搜索…</h2><p>已在所有启用的音源中查找「${escapeHtml(state.searchQuery)}」。</p></div>`;
  } else if (!results.length) {
    body = `<div class="empty-state">${icon('error', 'empty-icon')}<h2>没有找到结果</h2><p>${
      state.searchFailures.length
        ? escapeHtml(state.searchFailures.join('；'))
        : `没有音源返回「${escapeHtml(state.searchQuery)}」的结果。`
    }</p></div>`;
  } else {
    body = `<div class="section-heading"><h3>找到 ${results.length} 首</h3><span class="muted">点击播放，队列将跟随此结果列表</span></div><div class="song-list">${results
      .map((song, index) => songRow(song, results, index))
      .join('')}</div>`;
  }
  qs('#search-results', root).innerHTML = body;
  qs('#search-chips', root).innerHTML = chips;
  qs('#search-chips', root).hidden = !sourceIds.length;
  qsaBind(root);
  bindSongRows(root, results);
  hydrateCovers(root, results);
}

function qsaBind(root) {
  root.querySelectorAll('[data-search-source]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.searchSource = chip.dataset.searchSource;
      renderSearch();
    }),
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function renderHome() {
  const root = qs('#page-home');
  if (!root) return;
  const stats = [
    `${state.songs.length} 首本地音乐`,
    `${state.playlists.length} 个本地歌单`,
    `${state.plugins.filter((plugin) => plugin.enabled).length} 个启用插件`,
  ].join(' · ');
  const quick = `<div class="quick-actions">
    <button type="button" class="tonal-button ripple" id="home-import">${icon('add', 'button-icon')}导入音乐</button>
    <button type="button" class="tonal-button ripple" id="home-folder">${icon('folder', 'button-icon')}导入文件夹</button>
    <button type="button" class="tonal-button ripple" id="home-shuffle" ${state.songs.length ? '' : 'disabled'}>${icon('shuffle', 'button-icon')}随机播放全部</button>
  </div>`;
  const recents = state.recents.length
    ? `<div class="section-heading"><h3>最近播放</h3></div><div class="recent-grid">${state.recents
        .slice(0, 8)
        .map(
          (song, index) =>
            `<div class="recent-card ripple" role="button" tabindex="0" data-recent-index="${index}">${coverMarkup(
              song,
            )}<span class="recent-title">${escapeHtml(song.title)}</span><span class="recent-artist">${escapeHtml(
              song.artist,
            )}</span></div>`,
        )
        .join('')}</div>`
    : '';
  const recommendations = state.recommendations.length
    ? `<div class="section-heading"><h3>每日推荐</h3><span class="muted">来自网易云账号</span></div><div class="song-list" id="home-recommend-list">${state.recommendations
        .slice(0, 10)
        .map((song, index) => songRow(song, state.recommendations, index))
        .join('')}</div>`
    : '';
  const library = state.songs.length
    ? `<div class="section-heading"><h3>本地音乐</h3><button type="button" class="text-button" data-nav-library>查看全部</button></div><div class="song-list" id="home-local-list">${state.songs
        .slice(0, 6)
        .map((song, index) => songRow(song, state.songs, index))
        .join('')}</div>`
    : `<div class="empty-state">${icon('music', 'empty-icon')}<h2>开始使用 Linmo Player</h2><p>导入本地音频文件，或启用音源插件后在线搜索播放。</p></div>`;
  root.innerHTML = `<div class="hero">
      <div class="hero-copy">
        <div class="eyebrow">LINMO PLAYER</div>
        <h2>${greeting()}</h2>
        <p>${stats}</p>
        ${quick}
      </div>
      <div class="hero-orb" aria-hidden="true"><span></span></div>
    </div>
    ${recents}${recommendations}${library}`;
  qs('#home-import', root)?.addEventListener('click', () => void importAudioFiles());
  qs('#home-folder', root)?.addEventListener('click', () => void importAudioFolder());
  qs('#home-shuffle', root)?.addEventListener('click', () => {
    if (!state.songs.length) return;
    const shuffled = [...state.songs].sort(() => Math.random() - 0.5);
    player.playContext(shuffled, 0);
  });
  root
    .querySelector('[data-nav-library]')
    ?.addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('linmo:navigate', { detail: 'library' })),
    );
  root.querySelectorAll('[data-recent-index]').forEach((card) =>
    card.addEventListener('click', () => {
      const index = Number(card.dataset.recentIndex);
      player.playContext(state.recents.slice(0, 8), index);
    }),
  );
  // Each home section keeps its own list so row indexes and cover hydration
  // always map to the songs that were actually rendered there. Sections are
  // optional — empty libraries render an empty-state instead of a list.
  const recommendList = qs('#home-recommend-list', root);
  if (recommendList) {
    bindSongRows(recommendList, state.recommendations);
    hydrateCovers(recommendList, state.recommendations);
  }
  const localList = qs('#home-local-list', root);
  if (localList) {
    bindSongRows(localList, state.songs);
    hydrateCovers(localList, state.songs);
  }
  hydrateCovers(root, state.recents.slice(0, 8), 'data-recent-index');
}

const LIBRARY_TABS = [
  ['songs', '歌曲'],
  ['albums', '专辑'],
  ['artists', '歌手'],
  ['playlists', '歌单'],
];

export function renderLibrary() {
  const root = qs('#page-library');
  if (!root) return;
  if (state.libraryPlaylistKey) {
    renderPlaylistDetail(root);
    return;
  }
  const tabs = LIBRARY_TABS.map(
    ([id, label]) =>
      `<button type="button" class="filter-chip ${state.libraryTab === id ? 'is-selected' : ''}" data-library-tab="${id}">${label}</button>`,
  ).join('');
  let body = '';
  if (state.libraryTab === 'songs') body = renderSongsTab();
  else if (state.libraryTab === 'albums') body = renderGroupTab('album', '未知专辑');
  else if (state.libraryTab === 'artists') body = renderGroupTab('artist', '未知歌手');
  else body = renderPlaylistsTab();
  root.innerHTML = `<div class="section-heading"><h3>音乐库</h3><div class="heading-actions">
      <button type="button" class="text-button" id="library-import">${icon('add', 'button-icon')}导入</button>
      <button type="button" class="text-button" id="library-folder">${icon('folder', 'button-icon')}文件夹</button>
    </div></div>
    <div class="filter-row">${tabs}</div>${body}`;
  qs('#library-import', root)?.addEventListener('click', () => void importAudioFiles());
  qs('#library-folder', root)?.addEventListener('click', () => void importAudioFolder());
  root.querySelectorAll('[data-library-tab]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.libraryTab = chip.dataset.libraryTab;
      state.libraryPlaylistKey = null;
      renderLibrary();
    }),
  );
  if (state.libraryTab === 'songs') {
    bindSongRows(root, state.songs);
    hydrateCovers(root, state.songs);
  }
  bindLibraryGroups(root);
  bindPlaylistsTab(root);
}

function renderSongsTab() {
  if (!state.songs.length)
    return `<div class="empty-state">${icon('music', 'empty-icon')}<h2>音乐库还是空的</h2><p>导入本地音频文件后将在此显示，支持 MP3、FLAC、M4A 等格式。</p></div>`;
  const formats = [...new Set(state.songs.map((song) => song.format).filter(Boolean))].join(' · ');
  return `<div class="library-stats"><div class="library-stat"><strong>${state.songs.length}</strong><span>曲目</span></div><div class="library-stat"><strong>${formats || '—'}</strong><span>格式</span></div></div><div class="song-list">${state.songs
    .map((song, index) => songRow(song, state.songs, index))
    .join('')}</div>`;
}

function renderGroupTab(field, fallbackLabel) {
  if (!state.songs.length)
    return `<div class="empty-state">${icon('library', 'empty-icon')}<h2>暂无内容</h2><p>导入本地音乐后即可按${field === 'album' ? '专辑' : '歌手'}浏览。</p></div>`;
  const groups = new Map();
  state.songs.forEach((song) => {
    const label = (field === 'album' ? song.album : song.artist) || fallbackLabel;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(song);
  });
  return [...groups.entries()]
    .map(
      ([label, songs]) =>
        `<section class="library-group"><div class="library-group-heading"><h4>${escapeHtml(label)}</h4><span>${songs.length} 首</span></div><div class="song-list collapsed">${songs
          .slice(0, 4)
          .map((song, index) => songRow(song, songs, index))
          .join('')}</div>${
          songs.length > 4
            ? `<button type="button" class="text-button group-expand" data-group-label="${escapeHtml(label)}">展开全部 ${songs.length} 首</button>`
            : ''
        }</section>`,
    )
    .join('');
}

function bindLibraryGroups(root) {
  const expanded = new Set();
  const field = state.libraryTab === 'albums' ? 'album' : 'artist';
  const fallback = field === 'album' ? '未知专辑' : '未知歌手';
  root.querySelectorAll('.library-group').forEach((group) => {
    const label = group.querySelector('h4')?.textContent ?? '';
    const songs = state.songs.filter(
      (song) => ((field === 'album' ? song.album : song.artist) || fallback) === label,
    );
    const list = qs('.song-list', group);
    if (!list) return;
    bindSongRows(list, songs);
    hydrateCovers(list, songs);
    const button = qs('.group-expand', group);
    if (!button) return;
    button.addEventListener('click', () => {
      if (expanded.has(label)) {
        expanded.delete(label);
        list.innerHTML = songs
          .slice(0, 4)
          .map((song, index) => songRow(song, songs, index))
          .join('');
        button.textContent = `展开全部 ${songs.length} 首`;
      } else {
        expanded.add(label);
        list.innerHTML = songs.map((song, index) => songRow(song, songs, index)).join('');
        button.textContent = '收起';
      }
      bindSongRows(list, songs);
      hydrateCovers(list, songs);
    });
  });
}

function renderPlaylistsTab() {
  const localCards = state.playlists
    .map(
      (
        playlist,
      ) => `<div class="playlist-card ripple" role="button" tabindex="0" data-playlist-open="local:${playlist.id}">
        <span class="playlist-cover">${icon('music')}</span>
        <span class="playlist-copy"><strong>${escapeHtml(playlist.name)}</strong><span>${playlist.songs.length} 首 · 本地歌单</span></span>
      </div>`,
    )
    .join('');
  const remoteCards = state.remotePlaylists
    .map(
      (
        playlist,
      ) => `<div class="playlist-card ripple" role="button" tabindex="0" data-playlist-open="remote:${escapeHtml(playlist.key)}">
        ${
          playlist.coverUrl
            ? `<span class="playlist-cover playlist-cover-image"><img src="${escapeHtml(playlist.coverUrl)}" alt="" loading="lazy" onerror="this.remove()"/></span>`
            : `<span class="playlist-cover">${icon('music')}</span>`
        }
        <span class="playlist-copy"><strong>${escapeHtml(playlist.title)}</strong><span>${playlist.count ?? playlist.songs.length ?? 0} 首 · ${escapeHtml(sourceName(playlist.pluginId))}</span></span>
      </div>`,
    )
    .join('');
  const accountHint = !enabledSourcePlugins().some((plugin) =>
    plugin.capabilities.includes('account'),
  )
    ? `<div class="inline-note">登录网易云账号插件后，可同步远程歌单到此处。</div>`
    : '';
  return `<div class="section-heading"><h4 class="subheading">本地歌单</h4><button type="button" class="text-button" id="playlist-create">${icon('add', 'button-icon')}新建歌单</button></div>
    ${
      localCards
        ? `<div class="playlist-grid">${localCards}</div>`
        : `<div class="inline-note">还没有本地歌单，点击「新建歌单」创建一个。</div>`
    }
    <div class="section-heading"><h4 class="subheading">远程歌单</h4><button type="button" class="text-button" id="playlist-sync">${icon('sync', 'button-icon')}同步歌单</button></div>
    ${accountHint}
    ${remoteCards ? `<div class="playlist-grid">${remoteCards}</div>` : ''}`;
}

function bindPlaylistsTab(root) {
  qs('#playlist-create', root)?.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('linmo:create-playlist')),
  );
  qs('#playlist-sync', root)?.addEventListener('click', async () => {
    const { syncRemotePlaylists } = await import('./core-bridge.js');
    snackbar('正在同步远程歌单…');
    const result = await syncRemotePlaylists();
    if (result.ok) snackbar(`已同步 ${result.count} 个远程歌单`);
    else snackbar(result.error);
  });
  root.querySelectorAll('[data-playlist-open]').forEach((card) =>
    card.addEventListener('click', () => {
      state.libraryPlaylistKey = card.dataset.playlistOpen;
      renderLibrary();
    }),
  );
}

function renderPlaylistDetail(root) {
  const [scope, id] = state.libraryPlaylistKey.split(/:(.+)/);
  const playlist =
    scope === 'local'
      ? state.playlists.find((item) => String(item.id) === id)
      : state.remotePlaylists.find((item) => item.key === id);
  if (!playlist) {
    state.libraryPlaylistKey = null;
    renderLibrary();
    return;
  }
  const isLocal = scope === 'local';
  const songs = playlist.songs ?? [];
  root.innerHTML = `<div class="playlist-hero">
      <span class="playlist-cover large">${icon('music')}</span>
      <div class="playlist-hero-copy">
        <div class="eyebrow">${isLocal ? '本地歌单' : `远程歌单 · ${escapeHtml(sourceName(playlist.pluginId))}`}</div>
        <h2>${escapeHtml(playlist.title)}</h2>
        <p>${songs.length} 首</p>
        <div class="heading-actions">
          <button type="button" class="filled-button ripple" id="playlist-play" ${songs.length ? '' : 'disabled'}>${icon('play', 'button-icon')}播放全部</button>
          ${isLocal ? `<button type="button" class="tonal-button ripple" id="playlist-rename">${icon('edit', 'button-icon')}重命名</button>` : ''}
          ${isLocal ? `<button type="button" class="text-button danger-text" id="playlist-delete">${icon('delete', 'button-icon')}删除歌单</button>` : ''}
        </div>
      </div>
    </div>
    ${
      songs.length
        ? `<div class="song-list">${songs
            .map((song, index) => songRow(song, songs, index, { removable: isLocal }))
            .join('')}</div>`
        : `<div class="empty-state">${icon('playlistAdd', 'empty-icon')}<h2>歌单还是空的</h2><p>在任意歌曲上点击「加入歌单」，即可把在线或本地歌曲收进这里。</p></div>`
    }`;
  qs('#playlist-play', root)?.addEventListener('click', () => player.playContext(songs, 0));
  qs('#playlist-rename', root)?.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('linmo:rename-playlist', { detail: playlist.id })),
  );
  qs('#playlist-delete', root)?.addEventListener('click', async () => {
    const { confirmDialog } = await import('./ui.js');
    const confirmed = await confirmDialog(
      '删除歌单',
      `确定删除歌单「${escapeHtml(playlist.name)}」？歌曲本身不会受影响。`,
    );
    if (!confirmed) return;
    state.playlists = state.playlists.filter((item) => String(item.id) !== String(playlist.id));
    persisters.playlists();
    state.libraryPlaylistKey = null;
    publish('playlists');
  });
  hydrateCovers(root, songs);
  bindSongRows(root, songs, {
    onRemove: (index) => {
      playlist.songs.splice(index, 1);
      persisters.playlists();
      publish('playlists');
    },
  });
}

/** Dialog flow: pick or create a playlist for `song`. */
export async function addToPlaylistFlow(song) {
  if (!song) return;
  const options = state.playlists
    .map(
      (playlist) =>
        `<button type="button" class="list-option" data-pick="${playlist.id}">${icon('music', 'button-icon')}<span>${escapeHtml(playlist.name)}</span><small>${playlist.songs.length} 首</small></button>`,
    )
    .join('');
  const picked = await openDialog({
    title: '加入歌单',
    body: `<div class="option-list">
        <button type="button" class="list-option accent" data-pick="__new__">${icon('add', 'button-icon')}<span>新建歌单</span></button>
        ${options}
      </div>`,
    confirmLabel: '关闭',
    cancelLabel: '',
    pickSelector: '[data-pick]',
  });
  if (!picked) return;
  const value = picked.dataset.pick;
  if (value === '__new__') {
    const { createPlaylistDialog } = await import('./dialogs.js');
    const playlist = await createPlaylistDialog();
    if (playlist) appendToPlaylist(playlist, song);
  } else {
    const playlist = state.playlists.find((item) => String(item.id) === value);
    if (playlist) appendToPlaylist(playlist, song);
  }
}

function appendToPlaylist(playlist, song) {
  if (playlist.songs.some((item) => item.key === song.key)) {
    snackbar('歌曲已在歌单中');
    return;
  }
  playlist.songs.push(song);
  playlist.updatedAt = new Date().toISOString();
  persisters.playlists();
  publish('playlists');
  snackbar(`已加入「${playlist.name}」`);
}

export { importAudioFiles, importAudioFolder };
