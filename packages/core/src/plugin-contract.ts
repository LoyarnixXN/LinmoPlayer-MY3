import type {
  LyricDocument,
  PlaybackQuality,
  PlaybackResource,
  PluginId,
  SourceId,
  UnifiedPlaylist,
  UnifiedSong,
} from './models';

export const HOST_API_VERSION = '1';

/** What a plugin package provides. The host executes every kind with built-in engines. */
export type PluginKind = 'music-source' | 'theme' | 'font';

export type PluginCapability =
  'search' | 'playback' | 'lyrics' | 'playlists' | 'account' | 'recommendations';

export const PLUGIN_CAPABILITIES: readonly PluginCapability[] = [
  'search',
  'playback',
  'lyrics',
  'playlists',
  'account',
  'recommendations',
];

export type SearchType = 'song' | 'album' | 'artist' | 'playlist';

export interface PluginManifest {
  readonly id: PluginId;
  readonly name: string;
  readonly version: string;
  readonly hostApiVersion: string;
  readonly kind?: PluginKind;
  readonly provider?: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly capabilities: readonly PluginCapability[];
  readonly description?: string;
  readonly iconDataUri?: string;
}

export interface PluginSong {
  readonly remoteId: string;
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
  readonly coverUrl?: string;
  readonly durationMs?: number;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface PluginPlaylist {
  readonly remoteId: string;
  readonly title: string;
  readonly coverUrl?: string;
  readonly count?: number;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface SearchRequest {
  readonly query: string;
  readonly type: SearchType;
  readonly page: number;
  readonly pageSize: number;
}

export interface SearchResponse {
  readonly items: readonly PluginSong[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface PluginUser {
  readonly remoteId: string;
  readonly name: string;
  readonly avatarUrl?: string;
}

export interface PluginLoginRequest {
  readonly method: 'phone' | 'email';
  readonly identifier: string;
  readonly password: string;
  readonly countryCode?: string;
}

export type QrLoginState = 'waiting' | 'scanned' | 'authorized' | 'expired';

/** Initial ticket of a QR login session. */
export interface QrLoginTicket {
  /** Renderable QR image as a data URI; hosts should show it directly when present. */
  readonly qrDataUri?: string;
  /** Raw QR content; fallback for hosts that render their own QR code. */
  readonly qrUrl?: string;
}

/** One poll result of a QR login session. */
export interface QrLoginPollResult {
  readonly state: QrLoginState;
  /** Present when `state` is `'authorized'`. */
  readonly user?: PluginUser;
}

export interface PluginContext {
  readonly sourceId: SourceId;
  readonly storage: PluginStorage;
  readonly log: (message: string, details?: Readonly<Record<string, unknown>>) => void;
}

export interface PluginStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface MusicPlugin {
  readonly manifest: PluginManifest;
  initialize?(context: PluginContext): Promise<void>;
  dispose?(): Promise<void>;
  search?(request: SearchRequest): Promise<SearchResponse>;
  resolvePlayback?(song: UnifiedSong, quality: PlaybackQuality): Promise<PlaybackResource>;
  getLyrics?(song: UnifiedSong): Promise<LyricDocument>;
  /** Resolve a display cover URL for a song; hosts cache results. */
  getCover?(song: UnifiedSong): Promise<string | null>;
  listUserPlaylists?(): Promise<readonly PluginPlaylist[]>;
  listPlaylistSongs?(
    playlist: PluginPlaylist,
    page: number,
    pageSize: number,
  ): Promise<SearchResponse>;
  getUser?(): Promise<PluginUser | null>;
  login?(request: PluginLoginRequest): Promise<PluginUser>;
  logout?(): Promise<void>;
  isAuthenticated?(): Promise<boolean>;
  /** Begin a QR-code login session; the session key stays on the plugin instance. */
  qrLoginStart?(): Promise<QrLoginTicket>;
  /** Poll the QR session once; hosts typically poll every ~2 seconds. */
  qrLoginCheck?(): Promise<QrLoginPollResult>;
  getRecommendations?(): Promise<readonly PluginSong[]>;
  /** Sources exposed by a multi-source plugin, in fallback priority order. */
  listSources?(): Promise<readonly string[]>;
  /** Search one specific source of a multi-source plugin. */
  searchSource?(source: string, request: SearchRequest): Promise<SearchResponse>;
}

export function sourceKey(sourceId: string, remoteId: string): string {
  return `${sourceId}:${remoteId}`;
}

export function toUnifiedSong(plugin: MusicPlugin, song: PluginSong): UnifiedSong {
  const sourceId = plugin.manifest.id;
  return {
    pluginId: plugin.manifest.id,
    sourceId,
    remoteId: song.remoteId,
    key: sourceKey(sourceId, song.remoteId),
    title: song.title,
    artist: song.artist,
    ...(song.album === undefined ? {} : { album: song.album }),
    ...(song.coverUrl === undefined ? {} : { coverUrl: song.coverUrl }),
    ...(song.durationMs === undefined ? {} : { durationMs: song.durationMs }),
    ...(song.extra === undefined ? {} : { extra: song.extra }),
  };
}

export function toUnifiedPlaylist(plugin: MusicPlugin, playlist: PluginPlaylist): UnifiedPlaylist {
  const sourceId = plugin.manifest.id;
  return {
    pluginId: plugin.manifest.id,
    sourceId,
    remoteId: playlist.remoteId,
    key: sourceKey(sourceId, playlist.remoteId),
    title: playlist.title,
    ...(playlist.coverUrl === undefined ? {} : { coverUrl: playlist.coverUrl }),
    ...(playlist.count === undefined ? {} : { count: playlist.count }),
    ...(playlist.extra === undefined ? {} : { extra: playlist.extra }),
  };
}
