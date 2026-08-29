import type { PluginId, UnifiedPlaylist } from './models';

export interface PlaylistStore {
  save(playlist: UnifiedPlaylist): Promise<void>;
  getAll(): Promise<readonly UnifiedPlaylist[]>;
  getByPlugin(pluginId: PluginId): Promise<readonly UnifiedPlaylist[]>;
  remove(key: string): Promise<void>;
}

export interface PlaybackPreferences {
  readonly preferredQuality: 'standard' | 'higher' | 'lossless' | 'hires';
  readonly autoplay: boolean;
  readonly crossfadeSeconds: number;
}

export interface PreferencesStore {
  getPlayback(): Promise<PlaybackPreferences>;
  setPlayback(preferences: PlaybackPreferences): Promise<void>;
}
