/** Central app state with localStorage persistence and a tiny pub/sub bus. */

const PREFIX = 'linmo.';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: state stays in memory */
  }
}

const listeners = new Map();

export function subscribe(topic, handler) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(handler);
}

export function publish(topic) {
  const set = listeners.get(topic);
  if (!set) return;
  for (const handler of set) handler();
}

export const PLAYBACK_MODES = ['sequence', 'repeat-all', 'shuffle', 'repeat-one'];
export const QUALITIES = [
  ['standard', '标准 128k'],
  ['higher', '较高 320k'],
  ['lossless', '无损'],
  ['hires', 'Hi-Res'],
];

export const state = {
  page: 'home',
  libraryTab: 'songs',
  libraryPlaylistKey: null,

  songs: load('library', []).filter((song) => typeof song?.mediaUri === 'string'),
  playlists: load('playlists', []).filter((playlist) => Array.isArray(playlist?.songs)),
  remotePlaylists: load('remote-playlists', []),
  recents: load('recents', []),
  plugins: load('plugins', []),
  searchResults: [],
  searchFailures: [],
  searchQuery: '',
  searchSource: 'all',
  searchLoading: false,
  searchSearched: false,
  recommendations: [],
  recommendationsLoading: false,
  account: null,
  accountPluginId: null,

  currentSong: null,
  queue: [],
  queueIndex: -1,
  playerStatus: 'idle',
  playerError: null,
  resolvedVia: null, // { pluginId, source, fallbackUsed }
  isPlaying: false,
  nowPlayingOpen: false,
  lyrics: null, // { lines, synced, translated, plain, songKey, loading, error }

  settings: Object.assign(
    {
      mode: 'light',
      themeId: '',
      fontId: '',
      quality: 'higher',
      autoplayNext: true,
      backgroundPlayback: true,
      playbackMode: 'sequence',
      volume: 0.8,
      muted: false,
      onboardingDone: false,
      notifyOnTrackChange: true,
    },
    load('preferences', {}),
  ),
};
if (!PLAYBACK_MODES.includes(state.settings.playbackMode)) state.settings.playbackMode = 'sequence';
if (!QUALITIES.some(([id]) => id === state.settings.quality)) state.settings.quality = 'higher';

/** Last playback position per song key, for resume-on-replay. */
export const playbackMemory = load('playback-memory', {});

export const persisters = {
  library: () => save('library', state.songs),
  playlists: () => save('playlists', state.playlists),
  remotePlaylists: () => save('remote-playlists', state.remotePlaylists),
  recents: () => save('recents', state.recents.slice(0, 30)),
  plugins: () => save('plugins', state.plugins),
  preferences: () => save('preferences', state.settings),
  playbackMemory: () => save('playback-memory', playbackMemory),
};

export function patchSettings(patch) {
  Object.assign(state.settings, patch);
  persisters.preferences();
  publish('settings');
}

export function installedPlugin(id) {
  return state.plugins.find((plugin) => plugin.id === id) ?? null;
}

export function enabledSourcePlugins() {
  return state.plugins.filter(
    (plugin) => plugin.enabled && plugin.kind === 'music-source' && plugin.status !== 'error',
  );
}

export function enabledAccountPlugin() {
  return (
    state.plugins.find(
      (plugin) =>
        plugin.enabled && plugin.kind === 'music-source' && plugin.capabilities.includes('account'),
    ) ?? null
  );
}
