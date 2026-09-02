export type PluginId = string;
export type SourceId = string;

export interface SongSourceRef {
  readonly pluginId: PluginId;
  readonly sourceId: SourceId;
  readonly remoteId: string;
}

export interface UnifiedSong extends SongSourceRef {
  readonly key: string;
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
  readonly coverUrl?: string;
  readonly durationMs?: number;
  /** Local media URI. Only the local library adapter should populate this. */
  readonly mediaUri?: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface UnifiedPlaylist extends SongSourceRef {
  readonly key: string;
  readonly title: string;
  readonly coverUrl?: string;
  readonly count?: number;
  readonly songs?: readonly UnifiedSong[];
  readonly updatedAt?: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export type PlaybackQuality = 'standard' | 'higher' | 'lossless' | 'hires';

export interface PlaybackResource {
  readonly url: string;
  readonly quality: PlaybackQuality;
  readonly expiresAt?: string;
  readonly requiresEntitlement?: boolean;
}

export interface LyricDocument {
  readonly lyric: string;
  readonly translatedLyric?: string;
  readonly synced: boolean;
}

/** Material 3 style color tokens a theme plugin may override. */
export type ThemeColorToken =
  | 'primary'
  | 'onPrimary'
  | 'primaryContainer'
  | 'onPrimaryContainer'
  | 'secondary'
  | 'secondaryContainer'
  | 'onSecondaryContainer'
  | 'tertiaryContainer'
  | 'onTertiaryContainer'
  | 'surface'
  | 'surfaceContainer'
  | 'surfaceContainerHigh'
  | 'surfaceContainerHighest'
  | 'onSurface'
  | 'onSurfaceVariant'
  | 'outline'
  | 'outlineVariant'
  | 'error'
  | 'scrim';

export type ThemeColorOverrides = Readonly<Partial<Record<ThemeColorToken, string>>>;

export interface ThemePayload {
  readonly name: string;
  readonly mode: 'light' | 'dark';
  readonly colors: ThemeColorOverrides;
}

export interface FontPayload {
  readonly family: string;
  readonly displayName?: string;
}
