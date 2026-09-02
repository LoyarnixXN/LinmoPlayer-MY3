import type {
  MusicPlugin,
  PluginContext,
  PluginLoginRequest,
  PluginPlaylist,
  PluginSong,
  PluginUser,
  SearchRequest,
  SearchResponse,
} from './plugin-contract';
import type { LyricDocument, PlaybackQuality, PlaybackResource, UnifiedSong } from './models';

/**
 * NeteaseCloudMusicApi proxy engine.
 *
 * The mainstream self-hosted proxy for NetEase Cloud Music account features:
 * cookie login, user playlists and playlist tracks. Playback resolution goes
 * through the proxy first; the host aggregator completes songs the proxy cannot
 * authorize (VIP / region locked) from other enabled sources.
 */

export const NETEASE_API_DEFAULT_BASE_URL = 'http://127.0.0.1:3000';

export interface NeteaseEngineOptions {
  readonly pluginId: string;
  readonly baseUrl?: string;
  readonly requestTimeoutMs?: number;
}

interface NeteaseLoginResponse {
  readonly cookie?: string;
  readonly account?: { id?: number };
  readonly profile?: { userId?: number; nickname?: string; avatarUrl?: string };
  readonly code?: number;
  readonly message?: string;
}

interface NeteaseSong {
  readonly id?: number;
  readonly name?: string;
  readonly dt?: number;
  readonly fee?: number;
  readonly al?: { name?: string; picUrl?: string };
  readonly ar?: readonly { name?: string }[];
}

interface NeteasePlaylist {
  readonly id?: number;
  readonly name?: string;
  readonly coverImgUrl?: string;
  readonly trackCount?: number;
}

export class NeteaseApiError extends Error {
  public constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'NeteaseApiError';
  }
}

const COOKIE_KEY = 'netease.cookie';
const USER_KEY = 'netease.user';

export function createNeteaseAccountMusicPlugin(options: NeteaseEngineOptions): MusicPlugin {
  const pluginId = options.pluginId;
  const baseUrl = (options.baseUrl ?? NETEASE_API_DEFAULT_BASE_URL).replace(/\/$/, '');
  const timeoutMs = options.requestTimeoutMs ?? 15_000;
  let context: PluginContext | undefined;
  let cookie = '';
  let user: PluginUser | null = null;

  async function persistSession(): Promise<void> {
    if (!context) return;
    await context.storage.set(COOKIE_KEY, cookie);
    await context.storage.set(USER_KEY, user ? JSON.stringify(user) : '');
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('cookie', cookie);
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      const payload = (await response.json()) as T & {
        code?: number;
        msg?: string;
        message?: string;
      };
      if (
        !response.ok ||
        (typeof payload.code === 'number' && payload.code !== 200 && payload.code !== 0)
      ) {
        throw new NeteaseApiError(
          payload.msg ?? payload.message ?? `网易云代理请求失败（HTTP ${response.status}）。`,
          payload.code,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof NeteaseApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError')
        throw new NeteaseApiError('网易云代理请求超时。');
      throw new NeteaseApiError(error instanceof Error ? error.message : '无法连接网易云代理。');
    } finally {
      clearTimeout(timer);
    }
  }

  function get<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    const search = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)]),
    ).toString();
    return request<T>(`${path}${search ? `?${search}` : ''}`);
  }

  function post<T>(path: string, body: Record<string, string>): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function toPluginSong(song: NeteaseSong): PluginSong {
    if (song.id === undefined || song.name === undefined)
      throw new NeteaseApiError('网易云返回了缺少 ID 或标题的歌曲。');
    return {
      remoteId: String(song.id),
      title: song.name,
      artist:
        song.ar
          ?.map((artist) => artist.name)
          .filter((name): name is string => Boolean(name))
          .join(' / ') || '未知歌手',
      ...(song.al?.name ? { album: song.al.name } : {}),
      ...(song.al?.picUrl ? { coverUrl: song.al.picUrl } : {}),
      ...(song.dt === undefined ? {} : { durationMs: song.dt }),
      ...(song.fee === undefined ? {} : { extra: { neteaseFee: song.fee } }),
    };
  }

  return {
    manifest: {
      id: pluginId,
      name: '网易云音乐账号',
      version: '1.0.0',
      hostApiVersion: '1',
      capabilities: ['account', 'playlists', 'search', 'playback', 'lyrics'],
    },

    async initialize(pluginContext) {
      context = pluginContext;
      cookie = (await context.storage.get(COOKIE_KEY)) ?? '';
      const savedUser = await context.storage.get(USER_KEY);
      if (savedUser) {
        try {
          user = JSON.parse(savedUser) as PluginUser;
        } catch {
          user = null;
        }
      }
    },

    async dispose() {
      context = undefined;
      cookie = '';
      user = null;
    },

    async login(request_: PluginLoginRequest) {
      const response: NeteaseLoginResponse =
        request_.method === 'phone'
          ? await post('/login/cellphone', {
              phone: request_.identifier,
              password: request_.password,
              countrycode: request_.countryCode ?? '86',
            })
          : await post('/login', { email: request_.identifier, password: request_.password });
      if (!response.profile && !response.account)
        throw new NeteaseApiError('网易云登录失败：代理没有返回账户信息。');
      user = {
        remoteId: String(response.profile?.userId ?? response.account?.id ?? ''),
        name: response.profile?.nickname ?? '网易云用户',
        ...(response.profile?.avatarUrl ? { avatarUrl: response.profile.avatarUrl } : {}),
      };
      cookie = response.cookie ?? '';
      await persistSession();
      return user;
    },

    async logout() {
      try {
        await get('/logout');
      } finally {
        cookie = '';
        user = null;
        await persistSession();
      }
    },

    async isAuthenticated() {
      if (!cookie) return false;
      try {
        await get('/login/status');
        return true;
      } catch {
        return false;
      }
    },

    async getUser() {
      if (user) return user;
      if (!cookie) return null;
      try {
        const account = await get<{
          profile?: { userId?: number; nickname?: string; avatarUrl?: string };
        }>('/user/account');
        user = {
          remoteId: String(account.profile?.userId ?? ''),
          name: account.profile?.nickname ?? '网易云用户',
          ...(account.profile?.avatarUrl ? { avatarUrl: account.profile.avatarUrl } : {}),
        };
        return user;
      } catch {
        return null;
      }
    },

    async search(request_: SearchRequest) {
      const type =
        request_.type === 'playlist'
          ? 1000
          : request_.type === 'album'
            ? 10
            : request_.type === 'artist'
              ? 100
              : 1;
      const result = await get<{
        result?: { songs?: readonly NeteaseSong[]; songCount?: number };
      }>('/cloudsearch', {
        keywords: request_.query,
        type,
        limit: request_.pageSize,
        offset: (request_.page - 1) * request_.pageSize,
      });
      const items = (result.result?.songs ?? []).map(toPluginSong);
      return {
        items,
        total: result.result?.songCount ?? items.length,
        page: request_.page,
        pageSize: request_.pageSize,
      };
    },

    async resolvePlayback(song: UnifiedSong, quality: PlaybackQuality): Promise<PlaybackResource> {
      const level =
        quality === 'hires'
          ? 'hires'
          : quality === 'lossless'
            ? 'lossless'
            : quality === 'higher'
              ? 'higher'
              : 'standard';
      const response = await get<{ data?: readonly { url?: string; time?: number }[] }>(
        '/song/url/v1',
        { id: song.remoteId, level },
      );
      const resource = (response.data ?? []).find((item) => Boolean(item.url));
      if (!resource?.url) throw new Error('网易云代理无法提供此歌曲的播放地址。');
      return {
        url: resource.url,
        quality,
        ...(resource.time ? { expiresAt: new Date(Date.now() + resource.time).toISOString() } : {}),
      };
    },

    async getLyrics(song: UnifiedSong): Promise<LyricDocument> {
      const lyric = await get<{ lrc?: { lyric?: string }; tlyric?: { lyric?: string } }>('/lyric', {
        id: song.remoteId,
      });
      return {
        lyric: lyric.lrc?.lyric ?? '',
        ...(lyric.tlyric?.lyric ? { translatedLyric: lyric.tlyric.lyric } : {}),
        synced: (lyric.lrc?.lyric ?? '').includes('['),
      };
    },

    async listUserPlaylists(): Promise<readonly PluginPlaylist[]> {
      const currentUser = user ?? (await this.getUser?.());
      if (!currentUser) throw new NeteaseApiError('尚未登录网易云账号。');
      const response = await get<{ playlist?: readonly NeteasePlaylist[] }>('/user/playlist', {
        uid: currentUser.remoteId,
      });
      return (response.playlist ?? []).flatMap((playlist) =>
        playlist.id === undefined || playlist.name === undefined
          ? []
          : [
              {
                remoteId: String(playlist.id),
                title: playlist.name,
                ...(playlist.coverImgUrl ? { coverUrl: playlist.coverImgUrl } : {}),
                ...(playlist.trackCount === undefined ? {} : { count: playlist.trackCount }),
              },
            ],
      );
    },

    async listPlaylistSongs(playlist: PluginPlaylist, page: number, pageSize: number) {
      const response = await get<{ songs?: readonly NeteaseSong[]; total?: number }>(
        '/playlist/track/all',
        { id: playlist.remoteId, limit: pageSize, offset: (page - 1) * pageSize, order: 'true' },
      );
      const items = (response.songs ?? []).map(toPluginSong);
      return {
        items,
        total: response.total ?? items.length,
        page,
        pageSize,
      };
    },
  };
}
