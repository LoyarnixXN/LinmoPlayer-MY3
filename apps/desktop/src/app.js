/** App shell: navigation, top bar, account menu, plugin import, boot sequence. */

import './net.js';
import {
  validatePluginPackageManifest,
  missingPermissions,
} from '../../../packages/core/src/index.ts';
import {
  state,
  subscribe,
  publish,
  persisters,
  installedPlugin,
  enabledAccountPlugin,
} from './state.js';
import {
  bootPlugins,
  migrateLegacyBuiltinPlugins,
  refreshAccount,
  accountLogout,
  syncRemotePlaylists,
  fetchRecommendations,
} from './core-bridge.js';
import { applyAppearance, setMode } from './theme.js';
import { player, requestNotificationPermission } from './player.js';
import { renderHome, renderSearch, renderLibrary, runSearch } from './views-main.js';
import { renderPlugins, renderSettings } from './views-manage.js';
import { initPlayerView, renderMiniPlayer } from './views-player.js';
import { initOnboarding } from './onboarding.js';
import { loginDialog, createPlaylistDialog, renamePlaylistDialog } from './dialogs.js';
import {
  installRipple,
  qs,
  qsa,
  snackbar,
  escapeHtml,
  installImageErrorFallback,
  openDialog,
} from './ui.js';
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
    ? `<img src="${escapeHtml(account.avatarUrl)}" alt=""/>`
    : icon('person');
  avatar.classList.toggle('has-account', Boolean(account));
  const menu = qs('#account-menu');
  if (menu && !menu.hidden) fillAccountMenu();
}

function fillAccountMenu() {
  const menu = qs('#account-menu');
  if (!menu) return;
  const account = state.account;
  const hasAccountPlugin = Boolean(enabledAccountPlugin());
  // 只在已登录时展示插件提供的个人信息；未登录保持中性文案，不出现具体平台名。
  const subtitle = account
    ? `${escapeHtml(installedPlugin(state.accountPluginId)?.name ?? '插件账号')} · 已连接`
    : hasAccountPlugin
      ? '登录后同步账号内容'
      : '启用账号类插件后可登录';
  menu.innerHTML = `<div class="account-header">
      <span class="account-avatar-large">${account?.avatarUrl ? `<img src="${escapeHtml(account.avatarUrl)}" alt=""/>` : icon('person')}</span>
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

const RISK_ACK_KEY = 'linmo.pluginRiskAck';

/** Third-party plugin risk notice shown at import and first enable. */
async function pluginRiskConfirm(kindLabel, name) {
  const acknowledged = localStorage.getItem(RISK_ACK_KEY) === '1';
  if (acknowledged) return true;
  const confirmed = await openDialog({
    eyebrow: kindLabel,
    title: `安装「${name}」？`,
    body: `<p class="risk-text">插件由第三方提供，启用后可能按其配置连接外部网络服务、获取并展示第三方内容。请仅安装你信任来源的插件包；安装或启用前请自行确认其来源与内容。</p>
      <label class="risk-ack"><input type="checkbox" id="risk-ack"/><span>我已了解风险，同类提示不再显示</span></label>`,
    confirmLabel: '仍然安装',
    cancelLabel: '取消',
    danger: true,
  });
  if (!confirmed) return false;
  if (qs('#risk-ack', confirmed)?.checked) localStorage.setItem(RISK_ACK_KEY, '1');
  return true;
}

async function importPluginZip(file) {
  let installedId = null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const installed = await window.linmoDesktop.plugins.install(bytes);
    installedId = installed.manifest?.manifest?.id ?? installed.manifest?.id ?? null;
    const manifest = validatePluginPackageManifest(installed.manifest);
    installedId = manifest.id;
    const kindLabel = { 'music-source': 'MUSIC SOURCE', theme: 'THEME', font: 'FONT' }[
      manifest.kind
    ];
    const approved = await pluginRiskConfirm(kindLabel, manifest.name);
    if (!approved) {
      await window.linmoDesktop.plugins.uninstall(manifest.id).catch(() => undefined);
      installedId = null;
      snackbar('已取消安装');
      return;
    }
    const previous = state.plugins.find((plugin) => plugin.id === manifest.id);
    const meta = {
      ...manifest,
      enabled: false,
      status: '',
      grantedPermissions: previous?.grantedPermissions ?? [],
      ...(installed.integrity
        ? {
            integrity: {
              checksum: installed.integrity.checksum,
              version: installed.integrity.version,
            },
          }
        : {}),
    };
    if (installed.integrity?.direction === 'downgrade')
      snackbar(`注意：正在安装低于已安装版本的插件（v${installed.integrity.version}）`);
    else if (installed.integrity?.direction === 'upgrade')
      snackbar(`已升级「${meta.name}」至 v${installed.integrity.version}`);
    state.plugins = [...state.plugins.filter((plugin) => plugin.id !== meta.id), meta];
    persisters.plugins();
    publish('plugins');
    if (
      meta.permissions?.length &&
      missingPermissions(meta.permissions, meta.grantedPermissions).length
    )
      snackbar(`已安装「${meta.name}」，启用前请完成权限授权`);
    else snackbar(`已安装「${meta.name}」，可在列表中启用`);
  } catch (error) {
    if (installedId) {
      await window.linmoDesktop.plugins.uninstall(installedId).catch(() => undefined);
      state.plugins = state.plugins.filter((plugin) => plugin.id !== installedId);
      persisters.plugins();
      publish('plugins');
    }
    snackbar(error instanceof Error ? error.message : '插件 ZIP 无法读取。');
  }
}

/* ---------------- window controls ---------------- */

function updateMaximizeIcon(maximized) {
  const next =
    typeof maximized === 'boolean'
      ? maximized
      : window.outerWidth >= window.screen.availWidth - 8 &&
        window.outerHeight >= window.screen.availHeight - 8;
  for (const id of ['#window-maximize', '#np-maximize']) {
    const button = qs(id);
    if (!button) continue;
    button.innerHTML = icon(next ? 'restore' : 'maximize');
    button.setAttribute('aria-label', next ? '还原' : '最大化');
  }
}

function updateThemeToggleIcon() {
  const button = qs('#theme-toggle');
  if (!button) return;
  const dark = state.settings.mode === 'dark';
  button.innerHTML = icon(dark ? 'sun' : 'moon');
  button.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
}

/* ---------------- boot ---------------- */

function bindShell() {
  installImageErrorFallback();
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
  window.linmoDesktop?.window?.onMaximized?.(updateMaximizeIcon);
  window.addEventListener('resize', () => updateMaximizeIcon());
  updateMaximizeIcon();
  updateThemeToggleIcon();
  subscribe('theme', updateThemeToggleIcon);

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

async function boot() {
  installRipple();
  bindShell();

  // 旧版本内置插件必须在首次渲染前清理，避免首页短暂显示「1 个启用插件」。
  await migrateLegacyBuiltinPlugins();

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

  // 在线音源与账号插件不再自动预置：用户在插件中心自行导入并启用。
  await applyAppearance();
  await bootPlugins();
  await refreshAccount();
  if (state.account) void fetchRecommendations();
  if (state.settings.notifyOnTrackChange) requestNotificationPermission();
  initOnboarding();
}

void boot();
