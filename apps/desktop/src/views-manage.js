/** Plugins page and Settings page. */

import { state, publish, persisters, patchSettings, QUALITIES, PLAYBACK_MODES } from './state.js';
import { enablePlugin, disablePlugin, uninstallPlugin } from './core-bridge.js';
import { applyThemePlugin, applyFontPluginSelection } from './theme.js';
import { icon } from './icons.js';
import { qs, escapeHtml, snackbar, confirmDialog, openDialog } from './ui.js';
import { PLUGIN_PERMISSION_LABELS, missingPermissions } from '../../../packages/core/src/index.ts';

const KIND_LABELS = { 'music-source': '音源', theme: '主题', font: '字体' };
const KIND_ICONS = { 'music-source': 'plugins', theme: 'palette', font: 'font' };
const CAPABILITY_LABELS = {
  search: '搜索',
  playback: '播放',
  lyrics: '歌词',
  playlists: '歌单',
  account: '账号',
  recommendations: '推荐',
};

function permissionLabel(key) {
  return PLUGIN_PERMISSION_LABELS[key] ?? key;
}

function permissionChips(plugin) {
  const declared = plugin.permissions ?? [];
  if (!declared.length) return '';
  const granted = new Set(plugin.grantedPermissions ?? []);
  return `<div class="plugin-caps">${declared
    .map(
      (key) =>
        `<span class="cap-chip ${granted.has(key) ? '' : 'is-pending'}">${escapeHtml(permissionLabel(key))}${granted.has(key) ? '' : ' · 未授权'}</span>`,
    )
    .join('')}</div>`;
}

export async function grantPluginPermissions(pluginId) {
  const plugin = state.plugins.find((item) => item.id === pluginId);
  if (!plugin) return false;
  const declared = plugin.permissions ?? [];
  if (!declared.length) return true;
  const body = `<p class="field-hint">该插件申请以下权限。仅在你信任来源时授权。</p>
    <div class="permission-list">${declared
      .map(
        (key) =>
          `<label class="permission-row"><input type="checkbox" data-perm="${escapeHtml(key)}" checked/><span>${escapeHtml(permissionLabel(key))}<small>${escapeHtml(permHint(key))}</small></span></label>`,
      )
      .join('')}</div>`;
  const result = await openDialog({
    eyebrow: 'PERMISSIONS',
    title: `授权「${plugin.name}」？`,
    body,
    confirmLabel: '授权所选',
    cancelLabel: '取消',
    danger: true,
  });
  if (!result) return false;
  const granted = [...result.querySelectorAll('[data-perm]:checked')].map(
    (node) => node.dataset.perm,
  );
  plugin.grantedPermissions = granted;
  if (missingPermissions(declared, granted).length) {
    snackbar('未授予全部所需权限，插件无法启用。');
    persisters.plugins();
    publish('plugins');
    return false;
  }
  persisters.plugins();
  publish('plugins');
  snackbar(`已授权「${plugin.name}」的权限`);
  return true;
}

function permHint(key) {
  return (
    {
      network: '访问网络以搜索、登录和拉取封面/歌词',
      'secure-storage': '在本机加密保存登录态等敏感数据',
      notifications: '在系统通知中显示切歌信息',
      'media-library': '读取你选择的本地音乐文件',
    }[key] ?? ''
  );
}

export async function verifyPluginIntegrity(pluginId) {
  try {
    const result = await window.linmoDesktop?.plugins?.verifyIntegrity?.(pluginId);
    if (!result) throw new Error('完整性接口不可用');
    if (!result.ok) snackbar(result.error ?? '完整性校验失败');
    else snackbar(`完整性正常 · v${result.version}`);
  } catch (error) {
    snackbar(error instanceof Error ? error.message : '完整性校验失败');
  }
}

export async function rollbackPlugin(pluginId) {
  const plugin = state.plugins.find((item) => item.id === pluginId);
  if (!plugin) return;
  const confirmed = await confirmDialog(
    '回滚插件',
    `将「${plugin.name}」回滚到上一安装版本？当前解包文件会被覆盖。`,
    '回滚',
  );
  if (!confirmed) return;
  try {
    const result = await window.linmoDesktop?.plugins?.rollback?.(pluginId);
    if (!result?.ok) throw new Error(result?.error ?? '回滚失败');
    snackbar(`已回滚到 v${result.version}，请重新导入或重启应用以刷新元数据`);
  } catch (error) {
    snackbar(error instanceof Error ? error.message : '回滚失败');
  }
}

export function renderPlugins() {
  const root = qs('#page-plugins');
  if (!root) return;
  const plugins = state.plugins;
  const cards = plugins
    .map((plugin) => {
      const caps = plugin.capabilities
        .map(
          (capability) =>
            `<span class="cap-chip">${CAPABILITY_LABELS[capability] ?? capability}</span>`,
        )
        .join('');
      const kindBadge = `<span class="kind-badge kind-${plugin.kind}">${KIND_LABELS[plugin.kind] ?? plugin.kind}</span>${plugin.builtin ? '<span class="kind-badge kind-builtin">内置</span>' : ''}`;
      const defaultBaseUrl =
        plugin.provider === 'netease-api'
          ? 'http://127.0.0.1:3000'
          : 'https://music-api.gdstudio.xyz/api.php';
      const configNote =
        plugin.kind === 'music-source'
          ? `<div class="plugin-config-row">
              <input type="text" data-plugin-baseurl-input="${escapeHtml(plugin.id)}" value="${escapeHtml(
                typeof plugin.config?.baseUrl === 'string' ? plugin.config.baseUrl : defaultBaseUrl,
              )}" aria-label="代理服务地址" spellcheck="false"/>
              <button type="button" class="text-button" data-plugin-baseurl-save="${escapeHtml(plugin.id)}">保存地址</button>
            </div>`
          : '';
      const errorNote =
        plugin.status === 'error' && plugin.lastError
          ? `<span class="plugin-error">${icon('error', 'row-icon')}${escapeHtml(plugin.lastError)}</span>`
          : '';
      let kindAction = '';
      if (plugin.kind === 'theme')
        kindAction =
          state.settings.themeId === plugin.id
            ? `<button type="button" class="tonal-button ripple small" data-plugin-theme="${escapeHtml(plugin.id)}" disabled>${icon('check', 'button-icon')}使用中</button>`
            : `<button type="button" class="tonal-button ripple small" data-plugin-theme="${escapeHtml(plugin.id)}">${icon('palette', 'button-icon')}应用主题</button>`;
      else if (plugin.kind === 'font')
        kindAction =
          state.settings.fontId === plugin.id
            ? `<button type="button" class="tonal-button ripple small" data-plugin-font="${escapeHtml(plugin.id)}" disabled>${icon('check', 'button-icon')}使用中</button>`
            : `<button type="button" class="tonal-button ripple small" data-plugin-font="${escapeHtml(plugin.id)}">${icon('font', 'button-icon')}应用字体</button>`;
      return `<article class="plugin-card">
        <div class="plugin-head">
          <span class="plugin-icon">${icon(KIND_ICONS[plugin.kind] ?? 'plugins')}</span>
          <div class="plugin-title">
            <strong>${escapeHtml(plugin.name)}</strong>
            <small>v${escapeHtml(plugin.version)} · ${kindBadge}</small>
          </div>
          <label class="m3-switch" aria-label="${plugin.enabled ? '停用插件' : '启用插件'}">
            <input type="checkbox" data-plugin-toggle="${escapeHtml(plugin.id)}" ${plugin.enabled ? 'checked' : ''}/>
            <span class="track"><span class="thumb"></span></span>
          </label>
        </div>
        <p class="plugin-description">${escapeHtml(plugin.description || '未提供插件说明。')}</p>
        <div class="plugin-caps">${caps}</div>
        ${permissionChips(plugin)}
        ${configNote}${errorNote}
        <div class="plugin-actions">
          ${kindAction}
          ${
            (plugin.permissions ?? []).length &&
            missingPermissions(plugin.permissions, plugin.grantedPermissions).length
              ? `<button type="button" class="tonal-button ripple small" data-plugin-grant="${escapeHtml(plugin.id)}">${icon('login', 'button-icon')}授权权限</button>`
              : ''
          }
          ${
            plugin.kind === 'music-source' && !plugin.builtin
              ? `<button type="button" class="text-button" data-plugin-verify="${escapeHtml(plugin.id)}">校验完整性</button>
               <button type="button" class="text-button" data-plugin-rollback="${escapeHtml(plugin.id)}">回滚版本</button>`
              : ''
          }
          ${plugin.builtin ? '' : `<button type="button" class="text-button danger-text" data-plugin-uninstall="${escapeHtml(plugin.id)}">${icon('delete', 'button-icon')}卸载</button>`}
        </div>
      </article>`;
    })
    .join('');
  root.innerHTML = `<div class="section-heading"><h3>插件中心</h3>
      <button type="button" class="filled-button ripple" id="plugin-import">${icon('download', 'button-icon')}导入插件 ZIP</button>
    </div>
    <div class="inline-note">插件是包含 plugin.json 的声明式 ZIP 包：音源插件映射到宿主内置引擎，主题与字体插件只携带数据文件，宿主不会执行包内代码。</div>
    ${
      plugins.length
        ? `<div class="plugin-grid">${cards}</div>`
        : `<div class="empty-state">${icon('plugins', 'empty-icon')}<h2>还没有安装插件</h2><p>导入插件 ZIP 后，可在此启用音源、应用主题与字体。打包命令见项目 README。</p></div>`
    }`;
  qs('#plugin-import', root)?.addEventListener('click', () => qs('#plugin-files')?.click());
  root.querySelectorAll('[data-plugin-toggle]').forEach((input) =>
    input.addEventListener('change', () => {
      void togglePlugin(input.dataset.pluginToggle, input.checked);
    }),
  );
  root.querySelectorAll('[data-plugin-grant]').forEach((button) =>
    button.addEventListener('click', () => {
      void grantPluginPermissions(button.dataset.pluginGrant);
    }),
  );
  root.querySelectorAll('[data-plugin-verify]').forEach((button) =>
    button.addEventListener('click', () => {
      void verifyPluginIntegrity(button.dataset.pluginVerify);
    }),
  );
  root.querySelectorAll('[data-plugin-rollback]').forEach((button) =>
    button.addEventListener('click', () => {
      void rollbackPlugin(button.dataset.pluginRollback);
    }),
  );
  root.querySelectorAll('[data-plugin-theme]').forEach((button) =>
    button.addEventListener('click', () => {
      void applyThemePlugin(button.dataset.pluginTheme);
    }),
  );
  root.querySelectorAll('[data-plugin-font]').forEach((button) =>
    button.addEventListener('click', () => {
      void applyFontPluginSelection(button.dataset.pluginFont);
    }),
  );
  root.querySelectorAll('[data-plugin-baseurl-save]').forEach((button) =>
    button.addEventListener('click', () => {
      const pluginId = button.dataset.pluginBaseurlSave;
      const input = root.querySelector(`[data-plugin-baseurl-input="${CSS.escape(pluginId)}"]`);
      if (input) void saveBaseUrl(pluginId, input.value);
    }),
  );
  root.querySelectorAll('[data-plugin-uninstall]').forEach((button) =>
    button.addEventListener('click', () => {
      void uninstallFlow(button.dataset.pluginUninstall);
    }),
  );
}

async function saveBaseUrl(pluginId, value) {
  const meta = state.plugins.find((plugin) => plugin.id === pluginId);
  if (!meta) return;
  const url = String(value ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!/^https?:\/\//.test(url)) {
    snackbar('服务地址必须是 http(s) 地址。');
    return;
  }
  if (url === meta.config?.baseUrl) return;
  const wasEnabled = meta.enabled;
  if (wasEnabled) await disablePlugin(pluginId);
  meta.config = { ...(meta.config ?? {}), baseUrl: url };
  persisters.plugins();
  if (wasEnabled) await enablePlugin(pluginId);
  publish('plugins');
  snackbar(`「${meta.name}」服务地址已更新`);
}

async function togglePlugin(pluginId, nextEnabled) {
  const meta = state.plugins.find((plugin) => plugin.id === pluginId);
  if (!meta) return;
  if (nextEnabled) {
    if (missingPermissions(meta.permissions, meta.grantedPermissions).length) {
      const granted = await grantPluginPermissions(pluginId);
      if (!granted) {
        publish('plugins');
        return;
      }
    }
    const result = await enablePlugin(pluginId);
    if (!result.ok) {
      snackbar(`启用失败：${result.error}`);
      publish('plugins');
      return;
    }
    if (meta.kind === 'music-source') snackbar(`已启用「${meta.name}」`);
  } else {
    await disablePlugin(pluginId);
    if (state.settings.themeId === pluginId || state.settings.fontId === pluginId) {
      const { applyAppearance } = await import('./theme.js');
      patchSettings({
        ...(state.settings.themeId === pluginId ? { themeId: '' } : {}),
        ...(state.settings.fontId === pluginId ? { fontId: '' } : {}),
      });
      await applyAppearance();
    }
  }
  publish('plugins');
  publish('account');
}

async function uninstallFlow(pluginId) {
  const meta = state.plugins.find((plugin) => plugin.id === pluginId);
  if (!meta) return;
  const confirmed = await confirmDialog(
    '卸载插件',
    `确定卸载「${escapeHtml(meta.name)}」？插件的本地数据与文件将被删除。`,
    '卸载',
  );
  if (!confirmed) return;
  await uninstallPlugin(pluginId);
  snackbar(`已卸载「${meta.name}」`);
}

const MODE_OPTIONS = [
  ['light', '浅色', 'sun'],
  ['dark', '深色', 'moon'],
];

export function renderSettings() {
  const root = qs('#page-settings');
  if (!root) return;
  const { settings } = state;
  const themeOptions = [
    `<option value="" ${settings.themeId ? '' : 'selected'}>默认（跟随明暗模式）</option>`,
    ...state.plugins
      .filter((plugin) => plugin.kind === 'theme')
      .map(
        (plugin) =>
          `<option value="${escapeHtml(plugin.id)}" ${settings.themeId === plugin.id ? 'selected' : ''}>${escapeHtml(plugin.name)}</option>`,
      ),
  ].join('');
  const fontOptions = [
    `<option value="" ${settings.fontId ? '' : 'selected'}>系统默认</option>`,
    ...state.plugins
      .filter((plugin) => plugin.kind === 'font')
      .map(
        (plugin) =>
          `<option value="${escapeHtml(plugin.id)}" ${settings.fontId === plugin.id ? 'selected' : ''}>${escapeHtml(plugin.font?.displayName ?? plugin.name)}</option>`,
      ),
  ].join('');
  root.innerHTML = `<div class="section-heading"><h3>设置</h3></div>
    <section class="settings-group">
      <h4>${icon('palette', 'row-icon')}外观</h4>
      <div class="settings-option">
        <span><strong>明暗模式</strong><p>主题插件会自带明暗模式，切换后回到默认配色。</p></span>
        <div class="segmented" role="radiogroup" aria-label="明暗模式">
          ${MODE_OPTIONS.map(
            ([value, label, iconKey]) =>
              `<button type="button" class="segment ${settings.mode === value ? 'is-selected' : ''}" data-mode="${value}">${icon(iconKey, 'button-icon')}${label}</button>`,
          ).join('')}
        </div>
      </div>
      <div class="settings-option"><span><strong>主题插件</strong><p>应用插件中心导入的主题包。</p></span>
        <select class="settings-select" id="setting-theme" aria-label="主题插件">${themeOptions}</select></div>
      <div class="settings-option"><span><strong>字体插件</strong><p>使用字体插件提供的字体渲染界面。</p></span>
        <select class="settings-select" id="setting-font" aria-label="字体插件">${fontOptions}</select></div>
    </section>
    <section class="settings-group">
      <h4>${icon('music', 'row-icon')}播放</h4>
      <div class="settings-option"><span><strong>音质偏好</strong><p>在线播放的音质档位，音源不可用时自动降级或多源补全。</p></span>
        <select class="settings-select" id="setting-quality" aria-label="音质偏好">
          ${QUALITIES.map(([value, label]) => `<option value="${value}" ${settings.quality === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select></div>
      <div class="settings-option"><span><strong>播放方式</strong><p>顺序、循环或随机。</p></span>
        <select class="settings-select" id="setting-playback-mode" aria-label="播放方式">
          ${PLAYBACK_MODES.map(
            (value) =>
              `<option value="${value}" ${settings.playbackMode === value ? 'selected' : ''}>${{ sequence: '顺序播放', 'repeat-all': '列表循环', shuffle: '随机播放', 'repeat-one': '单曲循环' }[value]}</option>`,
          ).join('')}
        </select></div>
      <div class="settings-option"><span><strong>自动播放下一首</strong><p>当前曲目结束后自动继续。</p></span>
        <label class="m3-switch"><input type="checkbox" data-setting-toggle="autoplayNext" ${settings.autoplayNext ? 'checked' : ''}/><span class="track"><span class="thumb"></span></span></label></div>
      <div class="settings-option"><span><strong>后台播放</strong><p>窗口失焦时继续播放。</p></span>
        <label class="m3-switch"><input type="checkbox" data-setting-toggle="backgroundPlayback" ${settings.backgroundPlayback ? 'checked' : ''}/><span class="track"><span class="thumb"></span></span></label></div>
      <div class="settings-option"><span><strong>切歌桌面通知</strong><p>播放新歌曲时显示系统通知。</p></span>
        <label class="m3-switch"><input type="checkbox" data-setting-toggle="notifyOnTrackChange" ${settings.notifyOnTrackChange ? 'checked' : ''}/><span class="track"><span class="thumb"></span></span></label></div>
    </section>
    <section class="settings-group">
      <h4>${icon('file', 'row-icon')}数据</h4>
      <div class="settings-option"><span><strong>本地曲库</strong><p>${state.songs.length} 首本地音乐，路径持久保存在本机。</p></span>
        <button type="button" class="text-button danger-text" id="setting-clear-library">清空</button></div>
      <div class="settings-option"><span><strong>最近播放</strong><p>${state.recents.length} 条记录。</p></span>
        <button type="button" class="text-button danger-text" id="setting-clear-recents">清空</button></div>
      <div class="settings-option"><span><strong>新手引导</strong><p>重新查看三步引导。</p></span>
        <button type="button" class="tonal-button ripple" id="setting-onboarding">重新查看</button></div>
    </section>
    <section class="settings-group">
      <h4>${icon('info', 'row-icon')}关于</h4>
      <div class="settings-option"><span><strong>Linmo Player</strong><p>Electron 桌面端 · 声明式插件架构 · 版本 ${escapeHtml(window.linmoDesktop?.version ?? '0.1.0')}</p></span></div>
    </section>`;
  root.querySelectorAll('[data-mode]').forEach((button) =>
    button.addEventListener('click', async () => {
      const { setMode } = await import('./theme.js');
      await setMode(button.dataset.mode);
    }),
  );
  qs('#setting-theme', root)?.addEventListener('change', async (event) => {
    const { applyThemePlugin } = await import('./theme.js');
    if (event.target.value) await applyThemePlugin(event.target.value);
    else {
      patchSettings({ themeId: '' });
      const { applyAppearance } = await import('./theme.js');
      await applyAppearance();
    }
  });
  qs('#setting-font', root)?.addEventListener('change', async (event) => {
    const { applyFontPluginSelection } = await import('./theme.js');
    await applyFontPluginSelection(event.target.value);
  });
  qs('#setting-quality', root)?.addEventListener('change', (event) =>
    patchSettings({ quality: event.target.value }),
  );
  qs('#setting-playback-mode', root)?.addEventListener('change', (event) =>
    patchSettings({ playbackMode: event.target.value }),
  );
  root.querySelectorAll('[data-setting-toggle]').forEach((input) =>
    input.addEventListener('change', () => {
      patchSettings({ [input.dataset.settingToggle]: input.checked });
      if (input.dataset.settingToggle === 'notifyOnTrackChange' && input.checked) {
        void import('./player.js').then((module) => module.requestNotificationPermission());
      }
    }),
  );
  qs('#setting-clear-library', root)?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(
      '清空本地曲库',
      '将从音乐库移除全部本地曲目（不删除磁盘上的音频文件）。',
      '清空',
    );
    if (!confirmed) return;
    state.songs = [];
    persisters.library();
    publish('songs');
    snackbar('本地曲库已清空');
  });
  qs('#setting-clear-recents', root)?.addEventListener('click', () => {
    state.recents = [];
    persisters.recents();
    publish('recents');
    snackbar('最近播放已清空');
  });
  qs('#setting-onboarding', root)?.addEventListener('click', async () => {
    const { startOnboarding } = await import('./onboarding.js');
    startOnboarding(true);
  });
}
