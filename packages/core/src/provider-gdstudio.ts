import type { MusicPlugin, PluginSong, SearchRequest, SearchResponse } from './plugin-contract';
import type { LyricDocument, PlaybackQuality, PlaybackResource, UnifiedSong } from './models';

/**
 * GD Studio Music API (https://music-api.gdstudio.xyz/api.php) engine.
 *
 * This is the de-facto mainstream multi-source endpoint used by the open-source
 * player ecosystem (MusicFree, LDDC, ...). One deployment exposes many sources
 * (netease, tencent, kuwo, migu, joox, tidal, qobuz, ytmusic, ...), which the
 * host aggregator uses to complete songs the primary source cannot play.
 */

export const GDSTUDIO_DEFAULT_BASE_URL = 'https://music-api.gdstudio.xyz/api.php';

/** Sources commonly available on public GD Studio deployments. */
export const GDSTUDIO_KNOWN_SOURCES = [
  'netease',
  'tencent',
  'kuwo',
  'migu',
  'joox',
  'tidal',
  'qobuz',
  'ytmusic',
] as const;

const QUALITY_BR: Record<PlaybackQuality, readonly number[]> = {
  standard: [128],
  higher: [320, 192, 128],
  lossless: [740, 320, 192, 128],
  hires: [999, 740, 320, 192, 128],
};

export interface GdStudioSongMeta {
  readonly source: string;
  readonly id: string;
  readonly urlId?: string;
  readonly lyricId?: string;
  readonly picId?: string;
}

export interface GdStudioEngineOptions {
  readonly pluginId: string;
  readonly baseUrl?: string;
  readonly sources?: readonly string[];
  readonly requestTimeoutMs?: number;
}

interface RawSearchItem {
  id?: string | number;
  name?: string;
  artist?: readonly string[];
  album?: string;
  pic_id?: string | number;
  url_id?: string | number;
  lyric_id?: string | number;
  source?: string;
}

interface RawUrlResult {
  url?: string;
  br?: number;
  size?: number;
}

interface RawLyricResult {
  lyric?: string;
  tlyric?: string;
}

const EXTRA_PREFIX = 'gdstudio:';

export function readGdStudioMeta(song: UnifiedSong, pluginId: string): GdStudioSongMeta | null {
  const extra = song.extra?.[`${EXTRA_PREFIX}${pluginId}`] as GdStudioSongMeta | undefined;
  if (!extra || typeof extra.source !== 'string' || typeof extra.id !== 'string') return null;
  return extra;
}

export function createGdStudioMusicPlugin(options: GdStudioEngineOptions): MusicPlugin {
  const pluginId = options.pluginId;
  const baseUrl = (options.baseUrl ?? GDSTUDIO_DEFAULT_BASE_URL).replace(/\/$/, '');
  const sources = (options.sources?.length ? options.sources : ['netease']).filter(
    (source): source is string => typeof source === 'string' && source.trim().length > 0,
  );
  if (!sources.length) throw new Error('GD Studio 音源插件至少需要一个来源。');
  const timeoutMs = options.requestTimeoutMs ?? 15_000;

  async function request<T>(params: Record<string, string | number>): Promise<T> {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`音源接口请求失败（HTTP ${response.status}）。`);
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        throw new Error('音源接口请求超时。');
      throw error instanceof Error ? error : new Error('无法连接音源接口。');
    } finally {
      clearTimeout(timer);
    }
  }

  function toPluginSong(item: RawSearchItem, fallbackSource: string): PluginSong | null {
    if (item.id === undefined || item.name === undefined) return null;
    const source = item.source ?? fallbackSource;
    const artist = (item.artist ?? []).filter((name) => typeof name === 'string' && name.trim());
    const meta: GdStudioSongMeta = {
      source,
      id: String(item.id),
      ...(item.url_id === undefined ? {} : { urlId: String(item.url_id) }),
      ...(item.lyric_id === undefined ? {} : { lyricId: String(item.lyric_id) }),
      ...(item.pic_id === undefined ? {} : { picId: String(item.pic_id) }),
    };
    return {
      remoteId: String(item.id),
      title: item.name,
      artist: artist.length ? artist.join(' / ') : '未知歌手',
      ...(item.album ? { album: item.album } : {}),
      extra: { [`${EXTRA_PREFIX}${pluginId}`]: meta },
    };
  }

  async function searchSource(source: string, request_: SearchRequest): Promise<SearchResponse> {
    const raw = await request<readonly RawSearchItem[]>({
      types: 'search',
      source,
      name: request_.query,
      count: request_.pageSize,
      pages: request_.page,
    });
    const items = (Array.isArray(raw) ? raw : [])
      .map((item) => toPluginSong(item, source))
      .filter((song): song is PluginSong => song !== null);
    return { items, total: items.length, page: request_.page, pageSize: request_.pageSize };
  }

  async function resolveUrl(
    meta: GdStudioSongMeta,
    quality: PlaybackQuality,
  ): Promise<PlaybackResource> {
    for (const br of QUALITY_BR[quality]) {
      const raw = await request<RawUrlResult | readonly RawUrlResult[]>({
        types: 'url',
        source: meta.source,
        id: meta.urlId ?? meta.id,
        br,
      });
      const entry = Array.isArray(raw) ? raw[0] : raw;
      if (entry?.url) {
        return {
          url: entry.url,
          quality: br >= 740 ? 'lossless' : br >= 320 ? 'higher' : 'standard',
        };
      }
    }
    throw new Error('此来源没有可播放的音频地址。');
  }

  return {
    manifest: {
      id: pluginId,
      name: 'GD Studio 多音源',
      version: '1.0.0',
      hostApiVersion: '1',
      capabilities: ['search', 'playback', 'lyrics'],
    },

    async initialize() {
      return;
    },

    async dispose() {
      return;
    },

    async search(request_: SearchRequest) {
      return searchSource(sources[0]!, request_);
    },

    async searchSource(source: string, request_: SearchRequest) {
      if (!sources.includes(source)) throw new Error(`未启用的音源：${source}`);
      return searchSource(source, request_);
    },

    async listSources() {
      return sources;
    },

    async resolvePlayback(song: UnifiedSong, quality: PlaybackQuality) {
      const meta = readGdStudioMeta(song, pluginId);
      if (!meta) throw new Error('歌曲缺少音源定位信息。');
      return resolveUrl(meta, quality);
    },

    async getLyrics(song: UnifiedSong): Promise<LyricDocument> {
      const meta = readGdStudioMeta(song, pluginId);
      if (!meta) throw new Error('歌曲缺少音源定位信息。');
      const raw = await request<RawLyricResult>({
        types: 'lyric',
        source: meta.source,
        id: meta.lyricId ?? meta.id,
      });
      return {
        lyric: raw.lyric ?? '',
        ...(raw.tlyric ? { translatedLyric: raw.tlyric } : {}),
        synced: (raw.lyric ?? '').includes('['),
      };
    },
  };
}
