/** App shell: navigation, top bar, account menu, plugin import, boot sequence. */

import './net.js';
import { validatePluginPackageManifest } from '../../../packages/core/src/index.ts';
import { state, subscribe, publish, persisters, installedPlugin } from './state.js';
import {
  bootPlugins,
  refreshAccount,
  accountLogout,
  syncRemotePlaylists,
  fetchRecommendations,
} from './core-bridge.js';
import { applyAppearance, setMode } from './theme.js';
import { player } from './player.js';
import { renderHome, renderSearch, renderLibrary, runSearch } from './views-main.js';
import { renderPlugins, renderSettings } from './views-manage.js';
import { initPlayerView, renderMiniPlayer } from './views-player.js';
import { initOnboarding } from './onboarding.js';
import { loginDialog, createPlaylistDialog, renamePlaylistDialog } from './dialogs.js';
import { installRipple, qs, qsa, snackbar, escapeHtml } from './ui.js';
import { icon } from './icons.js';

const PAGE_TITLES = {
  home: '首页',
  search: '在线搜索',
  library: '音乐库',
  plugins: '插件中心',
  settings: '设置',
};

function renderActivePage() {
  switch (state.page) {
    case 'home':
      renderHome();
      break;
    case 'search':
      renderSearch();
      break;
    case 'library':
      renderLibrary();
      break;
    case 'plugins':
      renderPlugins();
      break;
    case 'settings':
      renderSettings();
      break;
  }
}

function setPage(page) {
  if (!PAGE_TITLES[page]) return;
  state.page = page;
  qsa('.nav-item').forEach((item) =>
    item.classList.toggle('is-active', item.dataset.page === page),
  );
  qsa('.page').forEach((section) => {
    const active = section.id === `page-${page}`;
    section.classList.toggle('is-active', active);
    if (active) {
      section.classList.remove('page-enter');
      void section.offsetWidth;
      section.classList.add('page-enter');
    }
  });
  qs('#page-title').textContent = PAGE_TITLES[page];
  closeAccountMenu();
  renderActivePage();
  if (page === 'search') qs('#search-input')?.focus();
}

/* ---------------- account menu ---------------- */

function renderAccount() {
  const avatar = qs('#account-avatar');
  if (!avatar) return;
  const account = state.account;
  avatar.innerHTML = account?.avatarUrl
    ? `<img src="${escapeHtml(account.avatarUrl)}" alt="" onerror="this.remove()"/>`
    : icon('person');
  avatar.classList.toggle('has-account', Boolean(account));
  const menu = qs('#account-menu');
  if (menu && !menu.hidden) fillAccountMenu();
}

function fillAccountMenu() {
  const menu = qs('#account-menu');
  if (!menu) return;
  const account = state.account;
  const hasAccountPlugin = state.plugins.some(
    (plugin) =>
      plugin.enabled && plugin.kind === 'music-source' && plugin.capabilities.includes('account'),
  );
  // 只在已登录时展示插件提供的个人信息；未登录保持中性文案，不出现具体平台名。
  const subtitle = account
    ? `${escapeHtml(installedPlugin(state.accountPluginId)?.name ?? '插件账号')} · 已连接`
    : hasAccountPlugin
      ? '登录后同步账号内容'
      : '启用账号类插件后可登录';
  menu.innerHTML = `<div class="account-header">
      <span class="account-avatar-large">${account?.avatarUrl ? `<img src="${escapeHtml(account.avatarUrl)}" alt="" onerror="this.remove()"/>` : icon('person')}</span>
      <span><strong>${account ? escapeHtml(account.name) : '未登录'}</strong>
      <small>${subtitle}</small></span>
    </div>
    <div class="account-actions">
      ${
        account
          ? `<button type="button" class="list-option" data-account-action="sync">${icon('sync', 'button-icon')}<span>同步远程歌单</span></button>
             <button type="button" class="list-option" data-account-action="logout">${icon('logout', 'button-icon')}<span>退出登录</span></button>`
          : `<button type="button" class="list-option" data-account-action="login" ${hasAccountPlugin ? '' : 'disabled'}>${icon('login', 'button-icon')}<span>登录账号</span></button>`
      }
    </div>
    `;
  menu.querySelectorAll('[data-account-action]').forEach((button) =>
    button.addEventListener('click', async () => {
      closeAccountMenu();
      const action = button.dataset.accountAction;
      if (action === 'login') await loginDialog();
      else if (action === 'logout') {
        await accountLogout();
        snackbar('已退出登录');
      } else if (action === 'sync') {
        snackbar('正在同步远程歌单…');
        const result = await syncRemotePlaylists();
        if (result.ok) {
          snackbar(`已同步 ${result.count} 个远程歌单`);
          setPage('library');
          state.libraryTab = 'playlists';
          renderActivePage();
        } else snackbar(result.error);
      }
    }),
  );
}

function toggleAccountMenu() {
  const menu = qs('#account-menu');
  if (!menu) return;
  if (menu.hidden) {
    fillAccountMenu();
    menu.hidden = false;
    menu.classList.add('is-open');
    qs('#account-avatar')?.setAttribute('aria-expanded', 'true');
  } else closeAccountMenu();
}

function closeAccountMenu() {
  const menu = qs('#account-menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  menu.classList.remove('is-open');
  qs('#account-avatar')?.setAttribute('aria-expanded', 'false');
}

/* ---------------- plugin import ---------------- */

async function importPluginZip(file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const installed = await window.linmoDesktop.plugins.install(bytes);
    const manifest = validatePluginPackageManifest(installed.manifest);
    if (manifest.kind === 'theme' && !installed.fileNames.includes(manifest.theme.entry))
      throw new Error(`插件缺少主题文件：${manifest.theme.entry}`);
    if (manifest.kind === 'font' && !installed.fileNames.includes(manifest.font.file))
      throw new Error(`插件缺少字体文件：${manifest.font.file}`);
    const meta = { ...manifest, enabled: false, status: '' };
    state.plugins = [...state.plugins.filter((plugin) => plugin.id !== meta.id), meta];
    persisters.plugins();
    publish('plugins');
    snackbar(`已安装「${meta.name}」，可在列表中启用`);
  } catch (error) {
    snackbar(error instanceof Error ? error.message : '插件 ZIP 无法读取。');
  }
}

/* ---------------- window controls ---------------- */

function updateMaximizeIcon() {
  const button = qs('#window-maximize');
  if (!button) return;
  const maximized =
    window.outerWidth >= window.screen.availWidth - 8 &&
    window.outerHeight >= window.screen.availHeight - 8;
  button.innerHTML = icon(maximized ? 'restore' : 'maximize');
  button.setAttribute('aria-label', maximized ? '还原' : '最大化');
}

/* ---------------- boot ---------------- */

function bindShell() {
  qsa('[data-icon]').forEach((element) => {
    element.innerHTML = icon(element.dataset.icon || 'music');
  });
  qsa('.nav-item').forEach((item) =>
    item.addEventListener('click', () => setPage(item.dataset.page)),
  );
  qs('#window-minimize')?.addEventListener('click', () => window.linmoDesktop?.window?.minimize());
  qs('#window-maximize')?.addEventListener('click', () =>
    window.linmoDesktop?.window?.toggleMaximize(),
  );
  qs('#window-close')?.addEventListener('click', () => window.linmoDesktop?.window?.close());
  // Now Playing 全屏时保留窗口控制
  qs('#np-minimize')?.addEventListener('click', () => window.linmoDesktop?.window?.minimize());
  qs('#np-maximize')?.addEventListener('click', () =>
    window.linmoDesktop?.window?.toggleMaximize(),
  );
  qs('#np-close-window')?.addEventListener('click', () => window.linmoDesktop?.window?.close());
  window.addEventListener('resize', updateMaximizeIcon);
  updateMaximizeIcon();

  qs('#account-avatar')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleAccountMenu();
  });
  document.addEventListener('click', (event) => {
    const wrap = qs('.account-wrap');
    if (wrap && event.target instanceof Element && !wrap.contains(event.target)) closeAccountMenu();
  });

  qs('#theme-toggle')?.addEventListener('click', () =>
    setMode(state.settings.mode === 'dark' ? 'light' : 'dark'),
  );

  const searchInput = qs('#search-input');
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void runSearch(searchInput.value);
  });
  qs('#search-submit')?.addEventListener('click', () => void runSearch(searchInput?.value ?? ''));

  qs('#plugin-files')?.addEventListener('change', (event) => {
    const files = event.target.files;
    if (files?.length) [...files].forEach((file) => void importPluginZip(file));
    event.target.value = '';
  });

  window.addEventListener('linmo:navigate', (event) => setPage(event.detail));
  window.addEventListener('linmo:create-playlist', () => void createPlaylistDialog());
  window.addEventListener(
    'linmo:rename-playlist',
    (event) => void renamePlaylistDialog(event.detail),
  );

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.matches('input, textarea, select, [contenteditable="true"]')
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      void player.toggle();
    } else if (event.key === 'ArrowLeft') player.seekBy(-5);
    else if (event.key === 'ArrowRight') player.seekBy(5);
    else if (event.key.toLowerCase() === 'm') player.toggleMute();
    else if (event.key.toLowerCase() === 'n') player.next();
    else if (event.key.toLowerCase() === 'p') player.previous();
  });
}

const BUILTIN_NETEASE_ID = 'linmo.netease';

/** Seed the built-in declarative NetEase plugin (still zero-code: provider + config). */
function seedBuiltinPlugins() {
  if (state.plugins.some((plugin) => plugin.id === BUILTIN_NETEASE_ID)) return;
  state.plugins = [
    ...state.plugins,
    {
      packageVersion: 1,
      id: BUILTIN_NETEASE_ID,
      name: '网易云音乐',
      version: '1.0.0',
      hostApiVersion: '1',
      kind: 'music-source',
      provider: 'netease-api',
      config: { baseUrl: 'http://127.0.0.1:3000' },
      capabilities: ['account', 'playlists', 'search', 'playback', 'lyrics', 'recommendations'],
      description:
        '内置网易云音源：扫码登录、搜索播放、歌词、账号歌单与每日推荐。需要运行 NeteaseCloudMusicApi 代理，服务地址可在下方修改。',
      enabled: true,
      status: '',
      builtin: true,
    },
  ];
  persisters.plugins();
}

async function boot() {
  installRipple();
  bindShell();
  initPlayerView();
  renderMiniPlayer();
  renderAccount();
  setPage('home');

  const topics = [
    'songs',
    'playlists',
    'remote-playlists',
    'recents',
    'recommendations',
    'plugins',
    'search',
    'settings',
    'account',
  ];
  topics.forEach((topic) => subscribe(topic, renderActivePage));
  subscribe('account', renderAccount);

  seedBuiltinPlugins();
  await applyAppearance();
  await bootPlugins();
  await refreshAccount();
  if (state.account) void fetchRecommendations();
  initOnboarding();
}

void boot();
