import type { PluginPlaylist, MusicPlugin } from './plugin-contract.ts';
import { toUnifiedPlaylist, toUnifiedSong } from './plugin-contract.ts';
import type { PluginId, UnifiedPlaylist } from './models.ts';
import type { PluginRegistry } from './plugin-registry.ts';

export interface PlaylistRepository {
  save(playlist: UnifiedPlaylist): Promise<void>;
}

export interface SyncSummary {
  readonly pluginId: PluginId;
  readonly synced: number;
  readonly failed: boolean;
}

export class PlaylistAggregator {
  private readonly registry: PluginRegistry;
  private readonly repository: PlaylistRepository;

  public constructor(registry: PluginRegistry, repository: PlaylistRepository) {
    this.registry = registry;
    this.repository = repository;
  }

  public async syncPlugin(pluginId: PluginId): Promise<SyncSummary> {
    const record = this.registry.get(pluginId);
    if (!record || record.status !== 'enabled') return { pluginId, synced: 0, failed: true };
    if (!record.plugin.listUserPlaylists) return { pluginId, synced: 0, failed: false };

    const result = await this.registry.invoke(pluginId, 'playlists', (plugin) =>
      plugin.listUserPlaylists!(),
    );
    if (!result.ok) return { pluginId, synced: 0, failed: true };

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
