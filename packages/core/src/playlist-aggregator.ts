import type { PluginPlaylist, MusicPlugin } from './plugin-contract';
import { toUnifiedPlaylist, toUnifiedSong } from './plugin-contract';
import type { PluginId, UnifiedPlaylist } from './models';
import type { PluginRegistry } from './plugin-registry';

export interface PlaylistRepository {
  save(playlist: UnifiedPlaylist): Promise<void>;
}

export interface SyncSummary {
  readonly pluginId: PluginId;
  readonly synced: number;
  readonly failed: boolean;
}

export class PlaylistAggregator {
  public constructor(
    private readonly registry: PluginRegistry,
    private readonly repository: PlaylistRepository,
  ) {}

  public async syncPlugin(pluginId: PluginId): Promise<SyncSummary> {
    const result = await this.registry.invoke(pluginId, 'playlists', async (plugin) => {
      if (!plugin.listUserPlaylists) throw new Error('Playlist capability is not implemented.');
      return plugin.listUserPlaylists();
    });
    if (!result.ok) return { pluginId, synced: 0, failed: true };

    const record = this.registry.get(pluginId);
    if (!record) return { pluginId, synced: 0, failed: true };
    let synced = 0;
    for (const remotePlaylist of result.value) {
      const playlist = toUnifiedPlaylist(record.plugin, remotePlaylist);
      const songs = await this.loadSongs(record.plugin, remotePlaylist);
      await this.repository.save(songs.length ? { ...playlist, songs } : playlist);
      synced += 1;
    }
    return { pluginId, synced, failed: false };
  }

  private async loadSongs(plugin: MusicPlugin, playlist: PluginPlaylist) {
    if (!plugin.listPlaylistSongs) return [];
    const response = await plugin.listPlaylistSongs(playlist, 1, 100);
    return response.items.map((song) => toUnifiedSong(plugin, song));
  }
}
