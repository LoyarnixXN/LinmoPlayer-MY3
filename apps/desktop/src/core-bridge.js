/** Bridge between the renderer app and packages/core (registry, aggregator, providers). */

import './net.js';
import {
  PluginRegistry,
  SourceAggregator,
  createMusicSourcePlugin,
  missingPermissions,
} from '../../../packages/core/src/index.ts';
import { state, publish, installedPlugin, enabledAccountPlugin, persisters } from './state.js';

export const registry = new PluginRegistry({
  info: (message, details) => console.info(`[linmo] ${message}`, details ?? ''),
  error: (message, details) => console.error(`[linmo] ${message}`, details ?? ''),
});
export const aggregator = new SourceAggregator(registry);

function pluginStorage(pluginId) {
  const prefix = `linmo.pluginStorage.${pluginId}.`;
  return {
    async get(key) {
      return localStorage.getItem(prefix + key);
    },
    async set(key, value) {
      localStorage.setItem(prefix + key, String(value));
    },
    async remove(key) {
      localStorage.removeItem(prefix + key);
    },
  };
}

function ensurePermissions(meta) {
  const missing = missingPermissions(meta.permissions, meta.grantedPermissions);
  if (missing.length) {
    meta.status = 'error';
    meta.lastError = `缺少权限授权：${missing.join('、')}。请在插件卡片中授权后重试。`;
    return { ok: false, error: meta.lastError };
  }
  return null;
}

async function startPlugin(meta) {
  if (meta.kind !== 'music-source') return { ok: true };
  const denied = ensurePermissions(meta);
  if (denied) return denied;
  try {
    // Bundled service: start with the plugin; when baseUrl is not set, use the
    // service port as the provider endpoint.
    if (meta.service?.entry) {
      const started = await window.linmoDesktop?.plugins?.startService?.({
        pluginId: meta.id,
        entry: meta.service.entry,
        port: meta.service.port,
      });
      if (started && started.ok === false) throw new Error(started.error ?? '捆绑服务启动失败。');
      if (meta.service.port && !meta.config?.baseUrl) {
        meta.config = {
          ...(meta.config ?? {}),
          baseUrl: `http://127.0.0.1:${meta.service.port}`,
        };
      }
    }
    const plugin = createMusicSourcePlugin(manifestOf(meta));
    const registered = registry.register(plugin);
    if (!registered.ok) throw new Error(registered.error);
    const enabled = await registry.enable(meta.id, {
      sourceId: meta.id,
      storage: pluginStorage(meta.id),
      log: (message, details) => console.info(`[linmo:${meta.id}] ${message}`, details ?? ''),
    });
    if (!enabled.ok) throw new Error(enabled.error);
    meta.status = 'enabled';
    meta.lastError = '';
    return { ok: true };
  } catch (error) {
    meta.status = 'error';
    meta.lastError = error instanceof Error ? error.message : '插件初始化失败。';
    return { ok: false, error: meta.lastError };
  }
}

function manifestOf(meta) {
  const { id, name, version, hostApiVersion, kind, provider, config, capabilities, permissions } =
    meta;
  return {
    id,
    name,
    version,
    hostApiVersion,
    kind,
    provider,
    config,
    capabilities,
    ...(permissions ? { permissions } : {}),
  };
}

export async function enablePlugin(pluginId) {
  const meta = installedPlugin(pluginId);
  if (!meta) return { ok: false, error: '插件不存在。' };
  const denied = ensurePermissions(meta);
  if (denied) {
    persisters.plugins();
    publish('plugins');
    return denied;
  }
  meta.enabled = true;
  const result = await startPlugin(meta);
  persisters.plugins();
  publish('plugins');
  return result;
}

export async function disablePlugin(pluginId) {
  const meta = installedPlugin(pluginId);
  if (!meta) return { ok: false, error: '插件不存在。' };
  meta.enabled = false;
  meta.status = '';
  if (meta.kind === 'music-source') {
    await registry.disable(pluginId).catch(() => undefined);
    registry.unregister(pluginId);
    await window.linmoDesktop?.plugins?.stopService?.(pluginId).catch?.(() => undefined);
  }
  persisters.plugins();
  publish('plugins');
  return { ok: true };
}

/** Enable every plugin marked enabled in metadata (called on boot). */
export async function bootPlugins() {
  for (const meta of state.plugins) {
    if (meta.enabled && meta.kind === 'music-source') await startPlugin(meta);
  }
  publish('plugins');
}

export async function uninstallPlugin(pluginId) {
  await disablePlugin(pluginId);
  await window.linmoDesktop?.plugins?.stopService?.(pluginId).catch?.(() => undefined);
  state.plugins = state.plugins.filter((plugin) => plugin.id !== pluginId);
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(`linmo.pluginStorage.${pluginId}.`)) localStorage.removeItem(key);
  }
  try {
    await window.linmoDesktop?.plugins?.uninstall?.(pluginId);
  } catch {
    /* files may already be gone */
  }
  persisters.plugins();
  publish('plugins');
}

export function searchAll(query) {
  return aggregator.searchAll({ query, page: 1, pageSize: 30 });
}

export async function resolvePlayback(song) {
  const quality = state.settings.quality;
  if (song.mediaUri) return { url: localMediaUrl(song), viaPluginId: 'local', fallbackUsed: false };
  const resolved = await aggregator.resolvePlayback(song, quality);
  return {
    url: mediaPlaybackUrl(resolved.resource.url),
    viaPluginId: resolved.viaPluginId,
    viaSource: resolved.viaSource,
    fallbackUsed: resolved.fallbackUsed,
  };
}

/**
 * file:// pages refuse plain-http media at the URL safety check, so those
 * streams are routed through the privileged linmo-media:// protocol.
 */
function mediaPlaybackUrl(url) {
  return /^http:\/\//i.test(url) ? `linmo-media://stream?url=${encodeURIComponent(url)}` : url;
}

export function localMediaUrl(song) {
  return `file:///${String(song.mediaUri).replaceAll('\\', '/')}`;
}

/** Translate raw network failures into actionable Chinese guidance. */
function friendlyNetError(message) {
  const text = String(message);
  if (/ERR_CONNECTION_REFUSED/i.test(text))
    return '无法连接到音源代理服务：请确认代理已启动，服务地址可在插件中心修改。';
  if (/ERR_CONNECTION_RESET|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED/i.test(text))
    return '网络连接不可用或被重置：请检查网络与代理设置后重试。';
  if (/ERR_TIMED_OUT|AbortError|超时/i.test(text)) return '连接超时：代理服务响应过慢或不可达。';
  if (/ERR_NAME_NOT_RESOLVED/i.test(text)) return '域名无法解析：请检查服务地址是否正确。';
  return text;
}

/**
 * Guarded plugin call that does NOT poison the plugin status on failure:
 * transient network errors (proxy down, timeout) surface as call results and
 * the plugin stays enabled for the next attempt. Capability checks still apply.
 */
async function callPlugin(pluginId, capability, operation) {
  const record = registry.get(pluginId);
  if (!record || record.status === 'disabled')
    return { ok: false, error: `插件 ${pluginId} 未启用。` };
  if (!record.plugin.manifest.capabilities?.includes(capability))
    return { ok: false, error: `插件 ${pluginId} 未声明 ${capability} 能力。` };
  try {
    return { ok: true, value: await operation(record.plugin) };
  } catch (error) {
    return {
      ok: false,
      error: friendlyNetError(error instanceof Error ? error.message : '插件调用失败。'),
    };
  }
}

export async function fetchLyrics(song) {
  if (song.mediaUri || !song.pluginId) return { ok: false, error: '本地歌曲暂无歌词。' };
  return callPlugin(song.pluginId, 'lyrics', (plugin) => plugin.getLyrics(song));
}

const coverCache = new Map(); // song.key -> url | null
const coverInflight = new Map();
const coverRetryAt = new Map(); // song.key -> earliest next-attempt timestamp

/** Resolve a display cover for a song via its plugin (`getCover`), cached. */
export async function fetchCover(song) {
  if (!song) return null;
  if (song.coverUrl) return song.coverUrl;
  if (coverCache.has(song.key)) return coverCache.get(song.key);
  const nextRetry = coverRetryAt.get(song.key) ?? 0;
  if (Date.now() < nextRetry) return null;
  if (coverInflight.has(song.key)) return coverInflight.get(song.key);
  const promise = (async () => {
    if (song.mediaUri || !song.pluginId) return null;
    const record = registry.get(song.pluginId);
    const plugin = record?.plugin;
    if (!plugin?.getCover) return null;
    try {
      return (await plugin.getCover(song)) ?? null;
    } catch {
      // Transient failure (rate limit, proxy down): retry after a backoff.
      coverRetryAt.set(song.key, Date.now() + 15_000);
      return null;
    }
  })();
  coverInflight.set(song.key, promise);
  const url = await promise;
  coverInflight.delete(song.key);
  if (!coverRetryAt.has(song.key)) coverCache.set(song.key, url);
  return url;
}

export async function accountLogin(payload) {
  const plugin = enabledAccountPlugin();
  if (!plugin) return { ok: false, error: '没有已启用的账号类音源插件。' };
  const result = await callPlugin(plugin.id, 'account', (instance) => instance.login(payload));
  if (!result.ok) return { ok: false, error: result.error };
  await refreshAccount();
  return { ok: true };
}

export async function qrLoginStart() {
  const plugin = enabledAccountPlugin();
  if (!plugin) return { ok: false, error: '没有已启用的账号类音源插件。' };
  return callPlugin(plugin.id, 'account', (instance) => instance.qrLoginStart());
}

export async function qrLoginCheck() {
  const plugin = enabledAccountPlugin();
  if (!plugin) return { ok: false, error: '没有已启用的账号类音源插件。' };
  return callPlugin(plugin.id, 'account', (instance) => instance.qrLoginCheck());
}

export async function accountLogout() {
  const plugin = enabledAccountPlugin();
  if (!plugin) return;
  await callPlugin(plugin.id, 'account', (instance) => instance.logout());
  state.account = null;
  state.remotePlaylists = [];
  state.recommendations = [];
  persisters.remotePlaylists();
  publish('account');
  publish('remote-playlists');
}

export async function refreshAccount() {
  const plugin = enabledAccountPlugin();
  state.accountPluginId = plugin?.id ?? null;
  if (!plugin) {
    state.account = null;
    publish('account');
    return;
  }
  const result = await callPlugin(plugin.id, 'account', (instance) => instance.getUser());
  state.account = result.ok ? result.value : null;
  publish('account');
}

export async function syncRemotePlaylists() {
  const plugin = enabledAccountPlugin();
  if (!plugin) return { ok: false, error: '没有已启用的账号类音源插件。' };
  const result = await callPlugin(plugin.id, 'playlists', (instance) =>
    instance.listUserPlaylists(),
  );
  if (!result.ok) return { ok: false, error: result.error };
  const synced = [];
  for (const remote of result.value.slice(0, 40)) {
    const playlist = {
      key: `${plugin.id}:${remote.remoteId}`,
      pluginId: plugin.id,
      sourceId: plugin.id,
      remoteId: remote.remoteId,
      title: remote.title,
      ...(remote.coverUrl ? { coverUrl: remote.coverUrl } : {}),
      ...(remote.count === undefined ? {} : { count: remote.count }),
      songs: [],
      syncedAt: new Date().toISOString(),
    };
    const songs = await callPlugin(plugin.id, 'playlists', (instance) =>
      instance.listPlaylistSongs(remote, 1, 100),
    );
    if (songs.ok) {
      playlist.songs = songs.value.items.map((item) => toUnified(plugin.id, item));
    }
    synced.push(playlist);
  }
  state.remotePlaylists = synced;
  persisters.remotePlaylists();
  publish('remote-playlists');
  return { ok: true, count: synced.length };
}

export async function fetchRecommendations() {
  const plugin = enabledAccountPlugin();
  if (!plugin || !plugin.capabilities.includes('recommendations')) {
    state.recommendations = [];
    publish('recommendations');
    return;
  }
  state.recommendationsLoading = true;
  publish('recommendations');
  const result = await callPlugin(plugin.id, 'recommendations', (instance) =>
    instance.getRecommendations(),
  );
  state.recommendationsLoading = false;
  state.recommendations = result.ok ? result.value.map((song) => toUnified(plugin.id, song)) : [];
  publish('recommendations');
}

export function toUnified(pluginId, pluginSong) {
  return {
    pluginId,
    sourceId: pluginId,
    remoteId: pluginSong.remoteId,
    key: `${pluginId}:${pluginSong.remoteId}`,
    title: pluginSong.title,
    artist: pluginSong.artist,
    ...(pluginSong.album === undefined ? {} : { album: pluginSong.album }),
    ...(pluginSong.coverUrl === undefined ? {} : { coverUrl: pluginSong.coverUrl }),
    ...(pluginSong.durationMs === undefined ? {} : { durationMs: pluginSong.durationMs }),
    ...(pluginSong.extra === undefined ? {} : { extra: pluginSong.extra }),
  };
}
