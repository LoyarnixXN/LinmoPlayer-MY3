// ../../packages/core/src/audio-engine.ts
var PlayerController = class {
  constructor(audio) {
    this.audio = audio;
  }
  snapshot = {
    status: "idle",
    song: null,
    positionMs: 0,
    durationMs: 0,
    queue: [],
    queueIndex: -1,
    errorMessage: null
  };
  getState() {
    return this.snapshot;
  }
  setQueue(queue, startIndex = 0) {
    const song = queue[startIndex] ?? null;
    this.snapshot = {
      ...this.snapshot,
      queue,
      queueIndex: song ? startIndex : -1,
      song,
      positionMs: 0,
      durationMs: song?.durationMs ?? 0,
      status: "idle"
    };
  }
  async play(resource) {
    if (!this.snapshot.song) return;
    this.snapshot = { ...this.snapshot, status: "loading", errorMessage: null };
    try {
      await this.audio.load(resource);
      await this.audio.play();
      this.snapshot = { ...this.snapshot, status: "playing" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to play this song.";
      this.snapshot = { ...this.snapshot, status: "error", errorMessage };
    }
  }
  async pause() {
    await this.audio.pause();
    this.snapshot = { ...this.snapshot, status: "paused" };
  }
  async seekTo(positionMs) {
    await this.audio.seekTo(positionMs);
    this.snapshot = { ...this.snapshot, positionMs };
  }
  async next() {
    const nextIndex = this.snapshot.queueIndex + 1;
    const song = this.snapshot.queue[nextIndex];
    if (!song) return;
    await this.audio.unload();
    this.snapshot = {
      ...this.snapshot,
      queueIndex: nextIndex,
      song,
      positionMs: 0,
      durationMs: song.durationMs ?? 0,
      status: "idle"
    };
  }
};

// ../../packages/core/src/plugin-contract.ts
var HOST_API_VERSION = "1";
var PLUGIN_CAPABILITIES = [
  "search",
  "playback",
  "lyrics",
  "playlists",
  "account",
  "recommendations"
];
function sourceKey(sourceId, remoteId) {
  return `${sourceId}:${remoteId}`;
}
function toUnifiedSong(plugin, song) {
  const sourceId = plugin.manifest.id;
  return {
    pluginId: plugin.manifest.id,
    sourceId,
    remoteId: song.remoteId,
    key: sourceKey(sourceId, song.remoteId),
    title: song.title,
    artist: song.artist,
    ...song.album === void 0 ? {} : { album: song.album },
    ...song.coverUrl === void 0 ? {} : { coverUrl: song.coverUrl },
    ...song.durationMs === void 0 ? {} : { durationMs: song.durationMs },
    ...song.extra === void 0 ? {} : { extra: song.extra }
  };
}
function toUnifiedPlaylist(plugin, playlist) {
  const sourceId = plugin.manifest.id;
  return {
    pluginId: plugin.manifest.id,
    sourceId,
    remoteId: playlist.remoteId,
    key: sourceKey(sourceId, playlist.remoteId),
    title: playlist.title,
    ...playlist.coverUrl === void 0 ? {} : { coverUrl: playlist.coverUrl },
    ...playlist.count === void 0 ? {} : { count: playlist.count },
    ...playlist.extra === void 0 ? {} : { extra: playlist.extra }
  };
}

// ../../packages/core/src/playlist-aggregator.ts
var PlaylistAggregator = class {
  constructor(registry, repository) {
    this.registry = registry;
    this.repository = repository;
  }
  async syncPlugin(pluginId) {
    const result = await this.registry.invoke(pluginId, "playlists", async (plugin) => {
      if (!plugin.listUserPlaylists) throw new Error("Playlist capability is not implemented.");
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
  async loadSongs(plugin, playlist) {
    if (!plugin.listPlaylistSongs) return [];
    const response = await plugin.listPlaylistSongs(playlist, 1, 100);
    return response.items.map((song) => toUnifiedSong(plugin, song));
  }
};

// ../../packages/core/src/plugin-registry.ts
var noopLogger = {
  info: () => void 0,
  error: () => void 0
};
var PluginRegistry = class {
  constructor(logger = noopLogger) {
    this.logger = logger;
  }
  records = /* @__PURE__ */ new Map();
  register(plugin) {
    const validationError = validateManifest(plugin);
    if (validationError) {
      return { ok: false, error: validationError };
    }
    const id = plugin.manifest.id;
    if (this.records.has(id)) {
      return { ok: false, error: `Plugin ${id} is already registered.` };
    }
    this.records.set(id, { plugin, status: "registered" });
    this.logger.info("Plugin registered.", { pluginId: id });
    return { ok: true, value: void 0 };
  }
  list() {
    return [...this.records.values()];
  }
  get(pluginId) {
    return this.records.get(pluginId);
  }
  async enable(pluginId, context) {
    const record = this.records.get(pluginId);
    if (!record) return { ok: false, error: `Plugin ${pluginId} is not registered.` };
    try {
      await record.plugin.initialize?.(context);
      record.status = "enabled";
      delete record.lastError;
      return { ok: true, value: void 0 };
    } catch (error) {
      return this.fail(record, "initialize", error);
    }
  }
  async disable(pluginId) {
    const record = this.records.get(pluginId);
    if (!record) return { ok: false, error: `Plugin ${pluginId} is not registered.` };
    try {
      await record.plugin.dispose?.();
      record.status = "disabled";
      return { ok: true, value: void 0 };
    } catch (error) {
      return this.fail(record, "dispose", error);
    }
  }
  async invoke(pluginId, capability, operation) {
    const record = this.records.get(pluginId);
    if (!record) return { ok: false, error: `Plugin ${pluginId} is not registered.` };
    if (record.status !== "enabled") {
      return { ok: false, error: `Plugin ${pluginId} is not enabled.` };
    }
    if (!record.plugin.manifest.capabilities.includes(capability)) {
      return { ok: false, error: `Plugin ${pluginId} does not declare ${capability}.` };
    }
    try {
      return { ok: true, value: await operation(record.plugin) };
    } catch (error) {
      return this.fail(record, capability, error);
    }
  }
  unregister(pluginId) {
    return this.records.delete(pluginId);
  }
  fail(record, operation, error) {
    const message = error instanceof Error ? error.message : "Unknown plugin error.";
    record.status = "error";
    record.lastError = message;
    this.logger.error("Plugin operation failed.", {
      pluginId: record.plugin.manifest.id,
      operation,
      error: message
    });
    return { ok: false, error: message };
  }
};
function validateManifest(plugin) {
  const manifest = plugin.manifest;
  if (!manifest || typeof manifest.id !== "string" || typeof manifest.name !== "string" || typeof manifest.version !== "string" || typeof manifest.hostApiVersion !== "string" || !Array.isArray(manifest.capabilities)) {
    return "Plugin manifest must include id, name and version.";
  }
  if (manifest.hostApiVersion.split(".")[0] !== HOST_API_VERSION.split(".")[0]) {
    return `Plugin ${manifest.id} requires an incompatible host API.`;
  }
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
    return `Plugin ${manifest.id} declares duplicate capabilities.`;
  }
  return null;
}

// ../../packages/core/src/plugin-runtime.ts
var PluginRuntime = class {
  constructor(loader, registry) {
    this.loader = loader;
    this.registry = registry;
  }
  async loadDiscovered() {
    const moduleIds = await this.loader.discover();
    const reports = [];
    for (const moduleId of moduleIds) {
      try {
        const plugin = await this.loader.load(moduleId);
        reports.push({ moduleId, result: this.registry.register(plugin) });
      } catch (error) {
        reports.push({
          moduleId,
          result: {
            ok: false,
            error: error instanceof Error ? error.message : "Plugin module could not be loaded."
          }
        });
      }
    }
    return reports;
  }
};

// ../../packages/core/src/plugin-package.ts
var PLUGIN_PACKAGE_VERSION = 1;
var PLUGIN_ENTRY_LIMIT = 128;
var PLUGIN_FILE_SIZE_LIMIT = 64 * 1024 * 1024;
var PLUGIN_KINDS = ["music-source", "theme", "font"];
function validatePluginPackageManifest(input) {
  if (!isRecord(input)) throw new Error("\u63D2\u4EF6\u5305\u7F3A\u5C11 plugin.json\u3002");
  const manifest = isRecord(input.manifest) ? input.manifest : input;
  const kind = manifest.kind === void 0 ? "music-source" : manifest.kind;
  if (!PLUGIN_KINDS.includes(kind)) {
    throw new Error(`\u63D2\u4EF6\u7C7B\u578B\u65E0\u6548\uFF1A${String(kind)}\uFF08\u652F\u6301 ${PLUGIN_KINDS.join(" / ")}\uFF09\u3002`);
  }
  const capabilities = manifest.capabilities;
  if (manifest.packageVersion !== PLUGIN_PACKAGE_VERSION || typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(manifest.id) || typeof manifest.name !== "string" || !manifest.name.trim() || typeof manifest.version !== "string" || !manifest.version.trim() || typeof manifest.hostApiVersion !== "string" || manifest.hostApiVersion.split(".")[0] !== HOST_API_VERSION.split(".")[0]) {
    throw new Error(
      "\u63D2\u4EF6\u5305\u6E05\u5355\u65E0\u6548\uFF1A\u9700\u8981 packageVersion=1\u3001\u5408\u6CD5 ID\u3001\u540D\u79F0\u3001\u7248\u672C\u548C\u517C\u5BB9\u7684\u5BBF\u4E3B API \u7248\u672C\u3002"
    );
  }
  if (kind === "music-source") {
    if (!Array.isArray(capabilities) || capabilities.length === 0)
      throw new Error("\u97F3\u6E90\u63D2\u4EF6\u5FC5\u987B\u58F0\u660E\u81F3\u5C11\u4E00\u4E2A\u80FD\u529B\u3002");
    if (capabilities.some((item) => !isCapability(item)))
      throw new Error("\u97F3\u6E90\u63D2\u4EF6\u58F0\u660E\u4E86\u672A\u652F\u6301\u7684\u80FD\u529B\u3002");
    if (typeof manifest.provider !== "string" || !isKnownProvider(manifest.provider)) {
      throw new Error(`\u97F3\u6E90\u63D2\u4EF6\u5FC5\u987B\u58F0\u660E\u53D7\u652F\u6301\u7684 provider\uFF1A${KNOWN_PROVIDERS.join(" / ")}\u3002`);
    }
    if (manifest.config !== void 0 && !isRecord(manifest.config))
      throw new Error("\u97F3\u6E90\u63D2\u4EF6 config \u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
    if (manifest.config && manifest.config.baseUrl !== void 0 && (typeof manifest.config.baseUrl !== "string" || !/^https?:\/\//.test(manifest.config.baseUrl))) {
      throw new Error("\u97F3\u6E90\u63D2\u4EF6 config.baseUrl \u5FC5\u987B\u662F http(s) \u5730\u5740\u3002");
    }
  } else if (Array.isArray(capabilities) && capabilities.some((item) => !isCapability(item))) {
    throw new Error("\u63D2\u4EF6\u58F0\u660E\u4E86\u672A\u652F\u6301\u7684\u80FD\u529B\u3002");
  }
  const base = {
    packageVersion: 1,
    id: manifest.id,
    name: manifest.name.trim(),
    version: manifest.version.trim(),
    hostApiVersion: manifest.hostApiVersion,
    kind,
    ...typeof manifest.description === "string" ? { description: manifest.description.trim() } : {},
    ...Array.isArray(manifest.permissions) && manifest.permissions.every((item) => typeof item === "string") ? { permissions: manifest.permissions } : {}
  };
  if (kind === "music-source") {
    return {
      ...base,
      capabilities: [...new Set(capabilities)],
      provider: manifest.provider,
      ...manifest.config ? { config: manifest.config } : {},
      ...typeof manifest.entry === "string" && isSafePackagePath(manifest.entry) ? { entry: manifest.entry } : {}
    };
  }
  if (kind === "theme") {
    const theme = manifest.theme;
    const entry = theme && typeof theme.entry === "string" ? theme.entry : "theme.json";
    if (!isSafePackagePath(entry)) throw new Error("\u4E3B\u9898\u63D2\u4EF6 theme.entry \u8DEF\u5F84\u975E\u6CD5\u3002");
    return { ...base, capabilities: [], theme: { entry } };
  }
  const font = manifest.font;
  if (!font || typeof font.family !== "string" || !font.family.trim() || typeof font.file !== "string" || !isSafePackagePath(font.file)) {
    throw new Error("\u5B57\u4F53\u63D2\u4EF6\u9700\u8981\u58F0\u660E font.family \u548C font.file\u3002");
  }
  return {
    ...base,
    capabilities: [],
    font: {
      family: font.family.trim(),
      ...typeof font.displayName === "string" && font.displayName.trim() ? { displayName: font.displayName.trim() } : {},
      file: font.file
    }
  };
}
function validatePluginPackage(pkg) {
  const manifest = validatePluginPackageManifest(pkg.manifest);
  if (!pkg.files.some((file) => file.name === "plugin.json"))
    throw new Error("\u63D2\u4EF6\u5305\u5FC5\u987B\u5305\u542B\u6839\u76EE\u5F55 plugin.json\u3002");
  if (pkg.files.length > PLUGIN_ENTRY_LIMIT) throw new Error("\u63D2\u4EF6\u5305\u6587\u4EF6\u6570\u91CF\u8D85\u8FC7\u5B89\u5168\u4E0A\u9650\u3002");
  for (const file of pkg.files) {
    if (!isSafePackagePath(file.name)) throw new Error(`\u63D2\u4EF6\u5305\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\uFF1A${file.name}`);
    if (file.bytes.byteLength > PLUGIN_FILE_SIZE_LIMIT)
      throw new Error(`\u63D2\u4EF6\u5305\u6587\u4EF6\u8FC7\u5927\uFF1A${file.name}`);
  }
  if (manifest.kind === "music-source" && manifest.entry) {
    if (!pkg.files.some((file) => file.name === manifest.entry))
      throw new Error(`\u63D2\u4EF6\u5165\u53E3\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${manifest.entry}`);
  }
  if (manifest.kind === "theme") {
    const entry = manifest.theme.entry;
    if (!pkg.files.some((file) => file.name === entry))
      throw new Error(`\u63D2\u4EF6\u7F3A\u5C11\u4E3B\u9898\u6587\u4EF6\uFF1A${entry}`);
  }
  if (manifest.kind === "font") {
    if (!pkg.files.some((file) => file.name === manifest.font.file))
      throw new Error(`\u63D2\u4EF6\u7F3A\u5C11\u5B57\u4F53\u6587\u4EF6\uFF1A${manifest.font.file}`);
  }
}
var KNOWN_PROVIDERS = ["gdstudio", "netease-api"];
function isKnownProvider(value) {
  return KNOWN_PROVIDERS.includes(value);
}
function isSafePackagePath(value) {
  return value.length > 0 && value.length <= 240 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCapability(value) {
  return typeof value === "string" && PLUGIN_CAPABILITIES.includes(value);
}

// ../../packages/core/src/provider-gdstudio.ts
var GDSTUDIO_DEFAULT_BASE_URL = "https://music-api.gdstudio.xyz/api.php";
var GDSTUDIO_KNOWN_SOURCES = [
  "netease",
  "tencent",
  "kuwo",
  "migu",
  "joox",
  "tidal",
  "qobuz",
  "ytmusic"
];
var QUALITY_BR = {
  standard: [128],
  higher: [320, 192, 128],
  lossless: [740, 320, 192, 128],
  hires: [999, 740, 320, 192, 128]
};
var EXTRA_PREFIX = "gdstudio:";
function readGdStudioMeta(song, pluginId) {
  const extra = song.extra?.[`${EXTRA_PREFIX}${pluginId}`];
  if (!extra || typeof extra.source !== "string" || typeof extra.id !== "string") return null;
  return extra;
}
function createGdStudioMusicPlugin(options) {
  const pluginId = options.pluginId;
  const baseUrl = (options.baseUrl ?? GDSTUDIO_DEFAULT_BASE_URL).replace(/\/$/, "");
  const sources = (options.sources?.length ? options.sources : ["netease"]).filter(
    (source) => typeof source === "string" && source.trim().length > 0
  );
  if (!sources.length) throw new Error("GD Studio \u97F3\u6E90\u63D2\u4EF6\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u6765\u6E90\u3002");
  const timeoutMs = options.requestTimeoutMs ?? 15e3;
  async function request(params) {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`\u97F3\u6E90\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw new Error("\u97F3\u6E90\u63A5\u53E3\u8BF7\u6C42\u8D85\u65F6\u3002");
      throw error instanceof Error ? error : new Error("\u65E0\u6CD5\u8FDE\u63A5\u97F3\u6E90\u63A5\u53E3\u3002");
    } finally {
      clearTimeout(timer);
    }
  }
  function toPluginSong(item, fallbackSource) {
    if (item.id === void 0 || item.name === void 0) return null;
    const source = item.source ?? fallbackSource;
    const artist = (item.artist ?? []).filter((name) => typeof name === "string" && name.trim());
    const meta = {
      source,
      id: String(item.id),
      ...item.url_id === void 0 ? {} : { urlId: String(item.url_id) },
      ...item.lyric_id === void 0 ? {} : { lyricId: String(item.lyric_id) },
      ...item.pic_id === void 0 ? {} : { picId: String(item.pic_id) }
    };
    return {
      remoteId: String(item.id),
      title: item.name,
      artist: artist.length ? artist.join(" / ") : "\u672A\u77E5\u6B4C\u624B",
      ...item.album ? { album: item.album } : {},
      extra: { [`${EXTRA_PREFIX}${pluginId}`]: meta }
    };
  }
  async function searchSource(source, request_) {
    const raw = await request({
      types: "search",
      source,
      name: request_.query,
      count: request_.pageSize,
      pages: request_.page
    });
    const items = (Array.isArray(raw) ? raw : []).map((item) => toPluginSong(item, source)).filter((song) => song !== null);
    return { items, total: items.length, page: request_.page, pageSize: request_.pageSize };
  }
  async function resolveUrl(meta, quality) {
    for (const br of QUALITY_BR[quality]) {
      const raw = await request({
        types: "url",
        source: meta.source,
        id: meta.urlId ?? meta.id,
        br
      });
      const entry = Array.isArray(raw) ? raw[0] : raw;
      if (entry?.url) {
        return {
          url: entry.url,
          quality: br >= 740 ? "lossless" : br >= 320 ? "higher" : "standard"
        };
      }
    }
    throw new Error("\u6B64\u6765\u6E90\u6CA1\u6709\u53EF\u64AD\u653E\u7684\u97F3\u9891\u5730\u5740\u3002");
  }
  return {
    manifest: {
      id: pluginId,
      name: "GD Studio \u591A\u97F3\u6E90",
      version: "1.0.0",
      hostApiVersion: "1",
      capabilities: ["search", "playback", "lyrics"]
    },
    async initialize() {
      return;
    },
    async dispose() {
      return;
    },
    async search(request_) {
      return searchSource(sources[0], request_);
    },
    async searchSource(source, request_) {
      if (!sources.includes(source)) throw new Error(`\u672A\u542F\u7528\u7684\u97F3\u6E90\uFF1A${source}`);
      return searchSource(source, request_);
    },
    async listSources() {
      return sources;
    },
    async resolvePlayback(song, quality) {
      const meta = readGdStudioMeta(song, pluginId);
      if (!meta) throw new Error("\u6B4C\u66F2\u7F3A\u5C11\u97F3\u6E90\u5B9A\u4F4D\u4FE1\u606F\u3002");
      return resolveUrl(meta, quality);
    },
    async getLyrics(song) {
      const meta = readGdStudioMeta(song, pluginId);
      if (!meta) throw new Error("\u6B4C\u66F2\u7F3A\u5C11\u97F3\u6E90\u5B9A\u4F4D\u4FE1\u606F\u3002");
      const raw = await request({
        types: "lyric",
        source: meta.source,
        id: meta.lyricId ?? meta.id
      });
      return {
        lyric: raw.lyric ?? "",
        ...raw.tlyric ? { translatedLyric: raw.tlyric } : {},
        synced: (raw.lyric ?? "").includes("[")
      };
    }
  };
}

// ../../packages/core/src/provider-netease.ts
var NETEASE_API_DEFAULT_BASE_URL = "http://127.0.0.1:3000";
var NeteaseApiError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "NeteaseApiError";
  }
};
var COOKIE_KEY = "netease.cookie";
var USER_KEY = "netease.user";
function createNeteaseAccountMusicPlugin(options) {
  const pluginId = options.pluginId;
  const baseUrl = (options.baseUrl ?? NETEASE_API_DEFAULT_BASE_URL).replace(/\/$/, "");
  const timeoutMs = options.requestTimeoutMs ?? 15e3;
  let context;
  let cookie = "";
  let user = null;
  async function persistSession() {
    if (!context) return;
    await context.storage.set(COOKIE_KEY, cookie);
    await context.storage.set(USER_KEY, user ? JSON.stringify(user) : "");
  }
  async function request(path, init = {}) {
    const url = new URL(`${baseUrl}${path}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      const payload = await response.json();
      if (!response.ok || typeof payload.code === "number" && payload.code !== 200 && payload.code !== 0) {
        throw new NeteaseApiError(
          payload.msg ?? payload.message ?? `\u7F51\u6613\u4E91\u4EE3\u7406\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`,
          payload.code
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof NeteaseApiError) throw error;
      if (error instanceof Error && error.name === "AbortError")
        throw new NeteaseApiError("\u7F51\u6613\u4E91\u4EE3\u7406\u8BF7\u6C42\u8D85\u65F6\u3002");
      throw new NeteaseApiError(error instanceof Error ? error.message : "\u65E0\u6CD5\u8FDE\u63A5\u7F51\u6613\u4E91\u4EE3\u7406\u3002");
    } finally {
      clearTimeout(timer);
    }
  }
  function get(path, query = {}) {
    const search = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)])
    ).toString();
    return request(`${path}${search ? `?${search}` : ""}`);
  }
  function post(path, body) {
    return request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  function toPluginSong(song) {
    if (song.id === void 0 || song.name === void 0)
      throw new NeteaseApiError("\u7F51\u6613\u4E91\u8FD4\u56DE\u4E86\u7F3A\u5C11 ID \u6216\u6807\u9898\u7684\u6B4C\u66F2\u3002");
    return {
      remoteId: String(song.id),
      title: song.name,
      artist: song.ar?.map((artist) => artist.name).filter((name) => Boolean(name)).join(" / ") || "\u672A\u77E5\u6B4C\u624B",
      ...song.al?.name ? { album: song.al.name } : {},
      ...song.al?.picUrl ? { coverUrl: song.al.picUrl } : {},
      ...song.dt === void 0 ? {} : { durationMs: song.dt },
      ...song.fee === void 0 ? {} : { extra: { neteaseFee: song.fee } }
    };
  }
  return {
    manifest: {
      id: pluginId,
      name: "\u7F51\u6613\u4E91\u97F3\u4E50\u8D26\u53F7",
      version: "1.0.0",
      hostApiVersion: "1",
      capabilities: ["account", "playlists", "search", "playback", "lyrics"]
    },
    async initialize(pluginContext) {
      context = pluginContext;
      cookie = await context.storage.get(COOKIE_KEY) ?? "";
      const savedUser = await context.storage.get(USER_KEY);
      if (savedUser) {
        try {
          user = JSON.parse(savedUser);
        } catch {
          user = null;
        }
      }
    },
    async dispose() {
      context = void 0;
      cookie = "";
      user = null;
    },
    async login(request_) {
      const response = request_.method === "phone" ? await post("/login/cellphone", {
        phone: request_.identifier,
        password: request_.password,
        countrycode: request_.countryCode ?? "86"
      }) : await post("/login", { email: request_.identifier, password: request_.password });
      if (!response.profile && !response.account)
        throw new NeteaseApiError("\u7F51\u6613\u4E91\u767B\u5F55\u5931\u8D25\uFF1A\u4EE3\u7406\u6CA1\u6709\u8FD4\u56DE\u8D26\u6237\u4FE1\u606F\u3002");
      user = {
        remoteId: String(response.profile?.userId ?? response.account?.id ?? ""),
        name: response.profile?.nickname ?? "\u7F51\u6613\u4E91\u7528\u6237",
        ...response.profile?.avatarUrl ? { avatarUrl: response.profile.avatarUrl } : {}
      };
      cookie = response.cookie ?? "";
      await persistSession();
      return user;
    },
    async logout() {
      try {
        await get("/logout");
      } finally {
        cookie = "";
        user = null;
        await persistSession();
      }
    },
    async isAuthenticated() {
      if (!cookie) return false;
      try {
        await get("/login/status");
        return true;
      } catch {
        return false;
      }
    },
    async getUser() {
      if (user) return user;
      if (!cookie) return null;
      try {
        const account = await get("/user/account");
        user = {
          remoteId: String(account.profile?.userId ?? ""),
          name: account.profile?.nickname ?? "\u7F51\u6613\u4E91\u7528\u6237",
          ...account.profile?.avatarUrl ? { avatarUrl: account.profile.avatarUrl } : {}
        };
        return user;
      } catch {
        return null;
      }
    },
    async search(request_) {
      const type = request_.type === "playlist" ? 1e3 : request_.type === "album" ? 10 : request_.type === "artist" ? 100 : 1;
      const result = await get("/cloudsearch", {
        keywords: request_.query,
        type,
        limit: request_.pageSize,
        offset: (request_.page - 1) * request_.pageSize
      });
      const items = (result.result?.songs ?? []).map(toPluginSong);
      return {
        items,
        total: result.result?.songCount ?? items.length,
        page: request_.page,
        pageSize: request_.pageSize
      };
    },
    async resolvePlayback(song, quality) {
      const level = quality === "hires" ? "hires" : quality === "lossless" ? "lossless" : quality === "higher" ? "higher" : "standard";
      const response = await get(
        "/song/url/v1",
        { id: song.remoteId, level }
      );
      const resource = (response.data ?? []).find((item) => Boolean(item.url));
      if (!resource?.url) throw new Error("\u7F51\u6613\u4E91\u4EE3\u7406\u65E0\u6CD5\u63D0\u4F9B\u6B64\u6B4C\u66F2\u7684\u64AD\u653E\u5730\u5740\u3002");
      return {
        url: resource.url,
        quality,
        ...resource.time ? { expiresAt: new Date(Date.now() + resource.time).toISOString() } : {}
      };
    },
    async getLyrics(song) {
      const lyric = await get("/lyric", {
        id: song.remoteId
      });
      return {
        lyric: lyric.lrc?.lyric ?? "",
        ...lyric.tlyric?.lyric ? { translatedLyric: lyric.tlyric.lyric } : {},
        synced: (lyric.lrc?.lyric ?? "").includes("[")
      };
    },
    async listUserPlaylists() {
      const currentUser = user ?? await this.getUser?.();
      if (!currentUser) throw new NeteaseApiError("\u5C1A\u672A\u767B\u5F55\u7F51\u6613\u4E91\u8D26\u53F7\u3002");
      const response = await get("/user/playlist", {
        uid: currentUser.remoteId
      });
      return (response.playlist ?? []).flatMap(
        (playlist) => playlist.id === void 0 || playlist.name === void 0 ? [] : [
          {
            remoteId: String(playlist.id),
            title: playlist.name,
            ...playlist.coverImgUrl ? { coverUrl: playlist.coverImgUrl } : {},
            ...playlist.trackCount === void 0 ? {} : { count: playlist.trackCount }
          }
        ]
      );
    },
    async listPlaylistSongs(playlist, page, pageSize) {
      const response = await get(
        "/playlist/track/all",
        { id: playlist.remoteId, limit: pageSize, offset: (page - 1) * pageSize, order: "true" }
      );
      const items = (response.songs ?? []).map(toPluginSong);
      return {
        items,
        total: response.total ?? items.length,
        page,
        pageSize
      };
    }
  };
}

// ../../packages/core/src/theme-tokens.ts
var DEFAULT_THEME_TOKENS = {
  primary: "#6750A4",
  onPrimary: "#FFFFFF",
  primaryContainer: "#EADDFF",
  onPrimaryContainer: "#21005D",
  secondary: "#625B71",
  secondaryContainer: "#E8DEF8",
  onSecondaryContainer: "#1D192B",
  tertiaryContainer: "#FFD8E4",
  onTertiaryContainer: "#31111D",
  surface: "#FFFBFE",
  surfaceContainer: "#F3EDF7",
  surfaceContainerHigh: "#ECE6F0",
  surfaceContainerHighest: "#E6E0E9",
  onSurface: "#1D1B20",
  onSurfaceVariant: "#49454F",
  outline: "#79747E",
  outlineVariant: "#CAC4D0",
  error: "#BA1A1A",
  scrim: "#000000"
};
var THEME_COLOR_TOKEN_KEYS = Object.keys(
  DEFAULT_THEME_TOKENS
);
function isValidColor(value) {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}
function normalizeThemePayload(input, fallbackName) {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("theme.json \u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
  const raw = input;
  const mode = raw.mode === "dark" ? "dark" : "light";
  const colorsInput = typeof raw.colors === "object" && raw.colors !== null ? raw.colors : {};
  const colors = {};
  for (const key of THEME_COLOR_TOKEN_KEYS) {
    const value = colorsInput[key];
    if (value === void 0) continue;
    if (!isValidColor(value))
      throw new Error(`theme.json \u989C\u8272\u503C\u65E0\u6548\uFF1A${key} \u5FC5\u987B\u662F #RGB/#RRGGBB \u5341\u516D\u8FDB\u5236\u989C\u8272\u3002`);
    colors[key] = value.toLowerCase();
  }
  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallbackName,
    mode,
    colors
  };
}
function mergeThemeTokens(payload) {
  if (!payload) return { ...DEFAULT_THEME_TOKENS };
  const merged = { ...DEFAULT_THEME_TOKENS };
  for (const [key, value] of Object.entries(payload.colors)) {
    if (value !== void 0) merged[key] = value;
  }
  return merged;
}

// ../../packages/core/src/declarative.ts
function createMusicSourcePlugin(manifest) {
  if (manifest.kind !== "music-source" || !manifest.provider) throw new Error("\u4E0D\u662F\u97F3\u6E90\u63D2\u4EF6\u6E05\u5355\u3002");
  const config = manifest.config ?? {};
  switch (manifest.provider) {
    case "gdstudio": {
      const sources = Array.isArray(config.sources) ? config.sources.filter(
        (source) => typeof source === "string" && GDSTUDIO_KNOWN_SOURCES.includes(source)
      ) : [];
      return createGdStudioMusicPlugin({
        pluginId: manifest.id,
        ...typeof config.baseUrl === "string" ? { baseUrl: config.baseUrl } : {},
        ...sources.length ? { sources } : {}
      });
    }
    case "netease-api":
      return createNeteaseAccountMusicPlugin({
        pluginId: manifest.id,
        ...typeof config.baseUrl === "string" ? { baseUrl: config.baseUrl } : {}
      });
    default:
      throw new Error(`\u672A\u77E5\u7684\u97F3\u6E90\u5F15\u64CE\uFF1A${manifest.provider}`);
  }
}
function findPackageFile(files, name) {
  return files.find((file) => file.name === name);
}
function readThemePayload(manifest, files) {
  if (manifest.kind !== "theme" || !manifest.theme) throw new Error("\u4E0D\u662F\u4E3B\u9898\u63D2\u4EF6\u5305\u3002");
  const file = findPackageFile(files, manifest.theme.entry);
  if (!file) throw new Error(`\u4E3B\u9898\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${manifest.theme.entry}`);
  const json = JSON.parse(new TextDecoder().decode(file.bytes));
  return normalizeThemePayload(json, manifest.name);
}
function readFontPayload(manifest) {
  if (manifest.kind !== "font" || !manifest.font) throw new Error("\u4E0D\u662F\u5B57\u4F53\u63D2\u4EF6\u5305\u3002");
  return {
    family: manifest.font.family,
    ...manifest.font.displayName ? { displayName: manifest.font.displayName } : {}
  };
}

// ../../packages/core/src/source-aggregator.ts
function normalizeText(value) {
  return value.toLowerCase().replace(/\(\s*feat[^)]*\)/g, "").replace(/\[\s*[^\]]*\]/g, "").replace(/[·・_\-—–—~!@#$%^&*()+,./?;:'"{}<>＝|\\\s]/g, "").replace(/\s+/g, "");
}
function artistTokens(artist) {
  return artist.split(/[/、,，&×xX+]/).map((token) => normalizeText(token)).filter((token) => token.length > 0);
}
function scoreSongMatch(candidate, target) {
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
  const overlap = targetArtists.filter(
    (token) => candidateArtists.some((other) => other.includes(token) || token.includes(other))
  ).length;
  if (targetArtists.length) score += overlap / targetArtists.length * 2;
  const targetAlbum = target.album ? normalizeText(target.album) : "";
  const candidateAlbum = candidate.album ? normalizeText(candidate.album) : "";
  if (targetAlbum && candidateAlbum && targetAlbum === candidateAlbum) score += 0.5;
  return score;
}
var SourceAggregator = class {
  constructor(registry) {
    this.registry = registry;
  }
  enabledSourcePlugins(excludePluginId) {
    return this.registry.list().filter(
      (record) => record.status === "enabled" && record.plugin.manifest.id !== excludePluginId && record.plugin.manifest.capabilities.includes("playback")
    ).map((record) => record.plugin);
  }
  async resolvePlayback(song, quality) {
    const ownRecord = this.registry.get(song.pluginId);
    if (ownRecord && ownRecord.status === "enabled" && ownRecord.plugin.resolvePlayback) {
      try {
        const resource = await ownRecord.plugin.resolvePlayback(song, quality);
        if (resource.url) {
          return { resource, viaPluginId: song.pluginId, fallbackUsed: false };
        }
      } catch {
      }
    }
    return this.resolveWithFallback(song, quality);
  }
  async resolveWithFallback(song, quality) {
    const query = song.artist && song.artist !== "\u672A\u77E5\u6B4C\u624B" ? `${song.title} ${song.artist}` : song.title;
    let lastError = "\u6CA1\u6709\u53EF\u7528\u7684\u97F3\u6E90\u63D2\u4EF6\u3002";
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
              ...match.source ? { viaSource: match.source } : {},
              fallbackUsed: true
            };
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : "\u97F3\u6E90\u89E3\u6790\u5931\u8D25\u3002";
        }
      }
    }
    throw new Error(lastError);
  }
  async findMatches(plugin, target, query) {
    const sources = plugin.listSources && plugin.searchSource ? await safeListSources(plugin) : [void 0];
    if (sources instanceof Error) return sources;
    const collected = [];
    for (const source of sources) {
      try {
        const response = source ? await plugin.searchSource(source, { query, type: "song", page: 1, pageSize: 6 }) : await plugin.search({ query, type: "song", page: 1, pageSize: 6 });
        const pluginId = plugin.manifest.id;
        for (const item of response.items) {
          const unified = toUnifiedFromPlugin(plugin, item);
          const score = scoreSongMatch(unified, target);
          if (score >= 2)
            collected.push({ song: unified, pluginId, ...source ? { source } : {}, score });
        }
        if (collected.length) break;
      } catch (error) {
        return error instanceof Error ? error : new Error("\u97F3\u6E90\u641C\u7D22\u5931\u8D25\u3002");
      }
    }
    return collected.sort((a, b) => b.score - a.score).slice(0, 3);
  }
  async searchAll(request) {
    const items = [];
    const failures = [];
    const plugins = this.enabledSourcePlugins();
    for (const plugin of plugins) {
      try {
        const response = await plugin.search({
          query: request.query,
          type: "song",
          page: request.page,
          pageSize: request.pageSize
        });
        for (const item of response.items) {
          items.push({ song: toUnifiedFromPlugin(plugin, item), pluginId: plugin.manifest.id });
        }
      } catch (error) {
        failures.push(
          `${plugin.manifest.name}: ${error instanceof Error ? error.message : "\u641C\u7D22\u5931\u8D25"}`
        );
      }
    }
    return { items, failures };
  }
};
async function safeListSources(plugin) {
  try {
    const sources = await plugin.listSources();
    return sources.length ? sources : [];
  } catch (error) {
    return error instanceof Error ? error : new Error("\u83B7\u53D6\u97F3\u6E90\u5217\u8868\u5931\u8D25\u3002");
  }
}
function toUnifiedFromPlugin(plugin, item) {
  const sourceId = plugin.manifest.id;
  return {
    pluginId: sourceId,
    sourceId,
    remoteId: item.remoteId,
    key: `${sourceId}:${item.remoteId}`,
    title: item.title,
    artist: item.artist,
    ...item.album === void 0 ? {} : { album: item.album },
    ...item.coverUrl === void 0 ? {} : { coverUrl: item.coverUrl },
    ...item.durationMs === void 0 ? {} : { durationMs: item.durationMs },
    ...item.extra === void 0 ? {} : { extra: item.extra }
  };
}
export {
  DEFAULT_THEME_TOKENS,
  GDSTUDIO_DEFAULT_BASE_URL,
  GDSTUDIO_KNOWN_SOURCES,
  HOST_API_VERSION,
  KNOWN_PROVIDERS,
  NETEASE_API_DEFAULT_BASE_URL,
  NeteaseApiError,
  PLUGIN_CAPABILITIES,
  PLUGIN_ENTRY_LIMIT,
  PLUGIN_FILE_SIZE_LIMIT,
  PLUGIN_KINDS,
  PLUGIN_PACKAGE_VERSION,
  PlayerController,
  PlaylistAggregator,
  PluginRegistry,
  PluginRuntime,
  SourceAggregator,
  THEME_COLOR_TOKEN_KEYS,
  createGdStudioMusicPlugin,
  createMusicSourcePlugin,
  createNeteaseAccountMusicPlugin,
  findPackageFile,
  mergeThemeTokens,
  normalizeThemePayload,
  readFontPayload,
  readGdStudioMeta,
  readThemePayload,
  scoreSongMatch,
  sourceKey,
  toUnifiedPlaylist,
  toUnifiedSong,
  validatePluginPackage,
  validatePluginPackageManifest
};
