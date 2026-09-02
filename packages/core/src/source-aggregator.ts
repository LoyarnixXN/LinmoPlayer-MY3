import type { PlaybackQuality, MusicPlugin, UnifiedSong } from './index';
import type { PlaybackResource } from './models';
import type { PluginRegistry } from './plugin-registry';

/**
 * Multi-source completion.
 *
 * Tries the song's own source first. If it cannot provide a playable stream
 * (VIP-only, region locked, taken down), the aggregator searches every other
 * enabled source for the same song (title + artist matching) and plays it from
 * there. One library, every song.
 */

export interface ResolvedPlayback {
  readonly resource: PlaybackResource;
  readonly viaPluginId: string;
  readonly viaSource?: string;
  readonly fallbackUsed: boolean;
}

export interface AggregatorSearchRequest {
  readonly query: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface AggregatorSearchItem {
  readonly song: UnifiedSong;
  readonly pluginId: string;
}

export interface AggregatorSearchResult {
  readonly items: readonly AggregatorSearchItem[];
  readonly failures: readonly string[];
}

interface FallbackMatch {
  readonly song: UnifiedSong;
  readonly pluginId: string;
  readonly source?: string;
  readonly score: number;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(\s*feat[^)]*\)/g, '')
    .replace(/\[\s*[^\]]*\]/g, '')
    .replace(/[·・_\-—–—~!@#$%^&*()+,./?;:'"{}<>＝|\\\s]/g, '')
    .replace(/\s+/g, '');
}

function artistTokens(artist: string): readonly string[] {
  return artist
    .split(/[/、,，&×xX+]/)
    .map((token) => normalizeText(token))
    .filter((token) => token.length > 0);
}

export function scoreSongMatch(candidate: UnifiedSong, target: UnifiedSong): number {
  const candidateTitle = normalizeText(candidate.title);
  const targetTitle = normalizeText(target.title);
  if (!candidateTitle || !targetTitle) return 0;
  let score = 0;
  if (candidateTitle === targetTitle) score += 3;
  else if (candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle))
    score += 1.5;
  else return 0;

  const targetArtists = artistTokens(target.artist);
  const candidateArtists = artistTokens(candidate.artist);
  const overlap = targetArtists.filter((token) =>
    candidateArtists.some((other) => other.includes(token) || token.includes(other)),
  ).length;
  if (targetArtists.length) score += (overlap / targetArtists.length) * 2;

  const targetAlbum = target.album ? normalizeText(target.album) : '';
  const candidateAlbum = candidate.album ? normalizeText(candidate.album) : '';
  if (targetAlbum && candidateAlbum && targetAlbum === candidateAlbum) score += 0.5;
  return score;
}

export class SourceAggregator {
  public constructor(private readonly registry: PluginRegistry) {}

  private enabledSourcePlugins(excludePluginId?: string): readonly MusicPlugin[] {
    return this.registry
      .list()
      .filter(
        (record) =>
          record.status === 'enabled' &&
          record.plugin.manifest.id !== excludePluginId &&
          record.plugin.manifest.capabilities.includes('playback'),
      )
      .map((record) => record.plugin);
  }

  public async resolvePlayback(
    song: UnifiedSong,
    quality: PlaybackQuality,
  ): Promise<ResolvedPlayback> {
    const ownRecord = this.registry.get(song.pluginId);
    if (ownRecord && ownRecord.status === 'enabled' && ownRecord.plugin.resolvePlayback) {
      try {
        const resource = await ownRecord.plugin.resolvePlayback(song, quality);
        if (resource.url) {
          return { resource, viaPluginId: song.pluginId, fallbackUsed: false };
        }
      } catch {
        // Fall through to multi-source completion.
      }
    }
    return this.resolveWithFallback(song, quality);
  }

  public async resolveWithFallback(
    song: UnifiedSong,
    quality: PlaybackQuality,
  ): Promise<ResolvedPlayback> {
    const query =
      song.artist && song.artist !== '未知歌手' ? `${song.title} ${song.artist}` : song.title;
    let lastError = '没有可用的音源插件。';
    for (const plugin of this.enabledSourcePlugins(song.pluginId)) {
      const matches = await this.findMatches(plugin, song, query);
      if (matches instanceof Error) {
        lastError = matches.message;
        continue;
      }
      for (const match of matches) {
        if (!plugin.resolvePlayback) continue;
        try {
          const resource = await plugin.resolvePlayback(match.song, quality);
          if (resource.url) {
            return {
              resource,
              viaPluginId: match.pluginId,
              ...(match.source ? { viaSource: match.source } : {}),
              fallbackUsed: true,
            };
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : '音源解析失败。';
        }
      }
    }
    throw new Error(lastError);
  }

  private async findMatches(
    plugin: MusicPlugin,
    target: UnifiedSong,
    query: string,
  ): Promise<readonly FallbackMatch[] | Error> {
    const sources =
      plugin.listSources && plugin.searchSource ? await safeListSources(plugin) : [undefined];
    if (sources instanceof Error) return sources;
    const collected: FallbackMatch[] = [];
    for (const source of sources) {
      try {
        const response = source
          ? await plugin.searchSource!(source, { query, type: 'song', page: 1, pageSize: 6 })
          : await plugin.search!({ query, type: 'song', page: 1, pageSize: 6 });
        const pluginId = plugin.manifest.id;
        for (const item of response.items) {
          const unified = toUnifiedFromPlugin(plugin, item);
          const score = scoreSongMatch(unified, target);
          if (score >= 2)
            collected.push({ song: unified, pluginId, ...(source ? { source } : {}), score });
        }
        if (collected.length) break;
      } catch (error) {
        return error instanceof Error ? error : new Error('音源搜索失败。');
      }
    }
    return collected.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  public async searchAll(request: AggregatorSearchRequest): Promise<AggregatorSearchResult> {
    const items: AggregatorSearchItem[] = [];
    const failures: string[] = [];
    const plugins = this.enabledSourcePlugins();
    for (const plugin of plugins) {
      try {
        const response = await plugin.search!({
          query: request.query,
          type: 'song',
          page: request.page,
          pageSize: request.pageSize,
        });
        for (const item of response.items) {
          items.push({ song: toUnifiedFromPlugin(plugin, item), pluginId: plugin.manifest.id });
        }
      } catch (error) {
        failures.push(
          `${plugin.manifest.name}: ${error instanceof Error ? error.message : '搜索失败'}`,
        );
      }
    }
    return { items, failures };
  }
}

async function safeListSources(plugin: MusicPlugin): Promise<readonly string[] | Error> {
  try {
    const sources = await plugin.listSources!();
    return sources.length ? sources : [];
  } catch (error) {
    return error instanceof Error ? error : new Error('获取音源列表失败。');
  }
}

function toUnifiedFromPlugin(
  plugin: MusicPlugin,
  item: import('./plugin-contract').PluginSong,
): UnifiedSong {
  const sourceId = plugin.manifest.id;
  return {
    pluginId: sourceId,
    sourceId,
    remoteId: item.remoteId,
    key: `${sourceId}:${item.remoteId}`,
    title: item.title,
    artist: item.artist,
    ...(item.album === undefined ? {} : { album: item.album }),
    ...(item.coverUrl === undefined ? {} : { coverUrl: item.coverUrl }),
    ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
    ...(item.extra === undefined ? {} : { extra: item.extra }),
  };
}
