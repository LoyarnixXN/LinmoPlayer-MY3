/** Modal dialogs: playlist management and plugin account login (QR + password). */

import { state, persisters, publish } from './state.js';
import {
  accountLogin,
  qrLoginStart,
  qrLoginCheck,
  refreshAccount,
  fetchRecommendations,
} from './core-bridge.js';
import { openDialog, snackbar, qs, escapeHtml } from './ui.js';
import { icon } from './icons.js';

function nextPlaylistId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function createPlaylistDialog() {
  const layer = await openDialog({
    eyebrow: 'LOCAL PLAYLIST',
    title: '新建歌单',
    body: `<label class="field"><span>歌单名称</span>
      <input type="text" id="playlist-name" maxlength="60" placeholder="例如：深夜驾车" /></label>`,
    confirmLabel: '创建',
    cancelLabel: '取消',
  });
  if (!layer) return null;
  const name = String(qs('#playlist-name', layer)?.value ?? '').trim();
  if (!name) return null;
  const playlist = {
    id: nextPlaylistId(),
    name,
    songs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.playlists = [...state.playlists, playlist];
  persisters.playlists();
  publish('playlists');
  snackbar(`已创建歌单「${name}」`);
  return playlist;
}

export async function renamePlaylistDialog(playlistId) {
  const playlist = state.playlists.find((item) => String(item.id) === String(playlistId));
  if (!playlist) return;
  const layer = await openDialog({
    eyebrow: 'LOCAL PLAYLIST',
    title: '重命名歌单',
    body: `<label class="field"><span>歌单名称</span>
      <input type="text" id="playlist-name" maxlength="60" value="${playlist.name.replace(/"/g, '&quot;')}" /></label>`,
    confirmLabel: '保存',
    cancelLabel: '取消',
  });
  if (!layer) return;
  const name = String(qs('#playlist-name', layer)?.value ?? '').trim();
  if (!name || name === playlist.name) return;
  playlist.name = name;
  playlist.updatedAt = new Date().toISOString();
  persisters.playlists();
  publish('playlists');
}

const QR_HINT = '需要已启用账号类插件，且其服务地址指向可用的代理服务（可在插件中心修改）。';

function loginDialogBody() {
  return `<div class="segmented login-tabs" role="tablist" aria-label="登录方式">
      <button type="button" class="segment is-selected" data-login-tab="qr">扫码登录</button>
      <button type="button" class="segment" data-login-tab="password">账号密码</button>
    </div>
    <div class="login-panel is-selected" data-login-panel="qr">
      <div class="qr-stage" id="qr-stage"><span class="spinner"></span></div>
      <p class="qr-status" id="qr-status">正在获取二维码…</p>
      <button type="button" class="text-button" id="qr-refresh" hidden>${icon('refresh', 'button-icon')}刷新二维码</button>
      <p class="field-hint">${QR_HINT}</p>
    </div>
    <div class="login-panel" data-login-panel="password">
      <div class="field"><span>登录方式</span>
        <select id="login-method">
          <option value="phone">手机号</option>
          <option value="email">邮箱</option>
        </select></div>
      <div class="field-row" id="login-identifier-row">
        <label class="field country-field" id="login-country-wrap"><span>国家码</span>
          <input type="text" id="login-country" value="86" inputmode="numeric" /></label>
        <label class="field"><span id="login-identifier-label">手机号</span>
          <input type="text" id="login-identifier" placeholder="手机号" autocomplete="username" /></label>
      </div>
      <label class="field"><span>密码</span>
        <input type="password" id="login-password" placeholder="密码" autocomplete="current-password" /></label>
      <button type="button" class="filled-button" id="login-submit">${icon('login', 'button-icon')}登录</button>
    </div>`;
}

function switchLoginTab(layer, tab) {
  qs('[data-login-tab="qr"]', layer)?.classList.toggle('is-selected', tab === 'qr');
  qs('[data-login-tab="password"]', layer)?.classList.toggle('is-selected', tab === 'password');
  qs('[data-login-panel="qr"]', layer)?.classList.toggle('is-selected', tab === 'qr');
  qs('[data-login-panel="password"]', layer)?.classList.toggle('is-selected', tab === 'password');
}

let qrFlowToken = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runQrFlow(layer) {
  const token = ++qrFlowToken;
  const alive = () => layer.isConnected && token === qrFlowToken;
  const stage = qs('#qr-stage', layer);
  const status = qs('#qr-status', layer);
  const refresh = qs('#qr-refresh', layer);
  if (!stage || !status) return;
  const setStatus = (text) => (status.textContent = text);
  refresh.hidden = true;
  stage.innerHTML = '<span class="spinner"></span>';
  setStatus('正在获取二维码…');
  const start = await qrLoginStart();
  if (!alive()) return;
  if (!start.ok) {
    stage.innerHTML = `<span class="qr-fail">${icon('error')}</span>`;
    setStatus(start.error);
    refresh.hidden = false;
    return;
  }
  stage.innerHTML = start.value.qrDataUri
    ? `<img src="${escapeHtml(start.value.qrDataUri)}" alt="登录二维码"/>`
    : `<a class="qr-link" href="${escapeHtml(start.value.qrUrl ?? '')}" target="_blank">${escapeHtml(start.value.qrUrl ?? '')}</a>`;
  setStatus('请使用对应音乐 App 扫一扫');
  while (alive()) {
    await sleep(2000);
    if (!alive()) return;
    let poll;
    try {
      poll = await qrLoginCheck();
    } catch {
      continue;
    }
    if (!alive()) return;
    if (!poll.ok) {
      setStatus(poll.error);
      refresh.hidden = false;
      return;
    }
    if (poll.value.state === 'scanned') setStatus('已扫码，请在手机上确认');
    else if (poll.value.state === 'expired') {
      setStatus('二维码已过期，请刷新后重试');
      refresh.hidden = false;
      return;
    } else if (poll.value.state === 'authorized') {
      setStatus('登录成功');
      await refreshAccount();
      void fetchRecommendations();
      snackbar(state.account ? `登录成功：${state.account.name}` : '登录成功');
      qs('[data-dialog-confirm]', layer)?.click();
      return;
    }
  }
}

export async function loginDialog() {
  const wire = (layer) => {
    if (!layer) {
      qrFlowToken += 1;
      return;
    }
    layer.querySelectorAll('[data-login-tab]').forEach((tab) =>
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.loginTab;
        switchLoginTab(layer, tabId);
        if (tabId === 'qr') void runQrFlow(layer);
        else qrFlowToken += 1;
      }),
    );
    qs('#qr-refresh', layer)?.addEventListener('click', () => void runQrFlow(layer));
    qs('#login-method', layer)?.addEventListener('change', (event) => {
      const isPhone = event.target.value === 'phone';
      qs('#login-country-wrap', layer).hidden = !isPhone;
      qs('#login-identifier-label', layer).textContent = isPhone ? '手机号' : '邮箱';
      qs('#login-identifier', layer).placeholder = isPhone ? '手机号' : '邮箱地址';
    });
    qs('#login-submit', layer)?.addEventListener('click', async () => {
      const method = qs('#login-method', layer)?.value ?? 'phone';
      const identifier = String(qs('#login-identifier', layer)?.value ?? '').trim();
      const password = String(qs('#login-password', layer)?.value ?? '');
      const countryCode = String(qs('#login-country', layer)?.value ?? '86').trim();
      if (!identifier || !password) {
        snackbar('请填写账号和密码');
        return;
      }
      snackbar('正在登录…');
      const result = await accountLogin({
        method,
        identifier,
        password,
        ...(method === 'phone' ? { countryCode } : {}),
      });
      if (result.ok) {
        snackbar('登录成功');
        qrFlowToken += 1;
        qs('[data-dialog-confirm]', layer)?.click();
      } else snackbar(result.error);
    });
    void runQrFlow(layer);
  };
  const layerPromise = openDialog({
    eyebrow: 'PLUGIN ACCOUNT',
    title: '登录账号',
    body: loginDialogBody(),
    confirmLabel: '关闭',
    cancelLabel: '',
    onOpen: wire,
  });
  return layerPromise;
}
