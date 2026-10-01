(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/net.js
  function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  }
  function decodeResponse(response) {
    return new Response(base64ToArrayBuffer(response.body), {
      status: response.status,
      headers: response.headers
    });
  }
  function isGet(init) {
    return !init?.method || init.method.toUpperCase() === "GET";
  }
  async function proxiedRequest(input, init = {}) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url || !/^https?:\/\//i.test(url)) return nativeFetch(input, init);
    const desktop = window.linmoDesktop;
    if (!desktop?.net?.fetch) return nativeFetch(input, init);
    const headers = {};
    const source = init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : void 0);
    if (source) new Headers(source).forEach((value, key) => headers[key] = value);
    const request = desktop.net.fetch({
      url,
      ...init.method ? { method: init.method } : {},
      ...Object.keys(headers).length ? { headers } : {},
      ...init.body ? { body: init.body } : {}
    });
    const signal = init.signal;
    if (!signal) {
      return request.then((response) => decodeResponse(response));
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(new DOMException("The request was aborted.", "AbortError"));
      };
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
      request.then(
        (response) => {
          cleanup();
          resolve(decodeResponse(response));
        },
        (error) => {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      );
    });
  }
  var nativeFetch, RETRYABLE_PATTERN;
  var init_net = __esm({
    "src/net.js"() {
      nativeFetch = window.fetch.bind(window);
      RETRYABLE_PATTERN = /ERR_CONNECTION|ERR_SOCKET|ERR_EMPTY|ERR_TIMED_OUT|ERR_NETWORK/i;
      window.fetch = async function proxiedFetch(input, init = {}) {
        try {
          return await proxiedRequest(input, init);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (isGet(init) && RETRYABLE_PATTERN.test(message)) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            return proxiedRequest(input, init);
          }
          throw error;
        }
      };
    }
  });

  // ../../packages/core/src/audio-engine.ts
  var init_audio_engine = __esm({
    "../../packages/core/src/audio-engine.ts"() {
      "use strict";
    }
  });

  // ../../packages/core/src/models.ts
  var init_models = __esm({
    "../../packages/core/src/models.ts"() {
      "use strict";
    }
  });

  // ../../packages/core/src/plugin-contract.ts
  var HOST_API_VERSION, PLUGIN_CAPABILITIES;
  var init_plugin_contract = __esm({
    "../../packages/core/src/plugin-contract.ts"() {
      "use strict";
      HOST_API_VERSION = "1";
      PLUGIN_CAPABILITIES = [
        "search",
        "playback",
        "lyrics",
        "playlists",
        "account",
        "recommendations"
      ];
    }
  });

  // ../../packages/core/src/playlist-aggregator.ts
  var init_playlist_aggregator = __esm({
    "../../packages/core/src/playlist-aggregator.ts"() {
      "use strict";
      init_plugin_contract();
    }
  });

  // ../../packages/core/src/plugin-registry.ts
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
  var noopLogger, PluginRegistry;
  var init_plugin_registry = __esm({
    "../../packages/core/src/plugin-registry.ts"() {
      "use strict";
      init_plugin_contract();
      noopLogger = {
        info: () => void 0,
        error: () => void 0
      };
      PluginRegistry = class {
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
    }
  });

  // ../../packages/core/src/plugin-runtime.ts
  var init_plugin_runtime = __esm({
    "../../packages/core/src/plugin-runtime.ts"() {
      "use strict";
    }
  });

  // ../../packages/core/src/plugin-package.ts
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
  var PLUGIN_PACKAGE_VERSION, PLUGIN_FILE_SIZE_LIMIT, PLUGIN_KINDS, KNOWN_PROVIDERS;
  var init_plugin_package = __esm({
    "../../packages/core/src/plugin-package.ts"() {
      "use strict";
      init_plugin_contract();
      PLUGIN_PACKAGE_VERSION = 1;
      PLUGIN_FILE_SIZE_LIMIT = 64 * 1024 * 1024;
      PLUGIN_KINDS = ["music-source", "theme", "font"];
      KNOWN_PROVIDERS = ["gdstudio", "netease-api"];
    }
  });

  // ../../packages/core/src/provider-gdstudio.ts
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
    async function requestText(params) {
      const url = new URL(baseUrl);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`\u97F3\u6E90\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
        return (await response.text()).trim().replace(/^"|"$/g, "");
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
      },
      async getCover(song) {
        const meta = readGdStudioMeta(song, pluginId);
        const picId = meta?.picId;
        if (!picId) return null;
        const cacheKey = `${meta.source}:${picId}`;
        const cached = picCache.get(cacheKey);
        if (cached !== void 0) return cached;
        const raw = await requestText({
          types: "pic",
          source: meta.source,
          id: picId,
          size: 300
        });
        let cover = null;
        if (raw.startsWith("{")) {
          try {
            cover = JSON.parse(raw).url ?? null;
          } catch {
            cover = null;
          }
        } else if (/^https?:\/\//.test(raw)) {
          cover = raw;
        }
        picCache.set(cacheKey, cover);
        return cover;
      }
    };
  }
  var GDSTUDIO_DEFAULT_BASE_URL, GDSTUDIO_KNOWN_SOURCES, QUALITY_BR, EXTRA_PREFIX, picCache;
  var init_provider_gdstudio = __esm({
    "../../packages/core/src/provider-gdstudio.ts"() {
      "use strict";
      GDSTUDIO_DEFAULT_BASE_URL = "https://music-api.gdstudio.xyz/api.php";
      GDSTUDIO_KNOWN_SOURCES = [
        "netease",
        "tencent",
        "kuwo",
        "migu",
        "joox",
        "tidal",
        "qobuz",
        "ytmusic"
      ];
      QUALITY_BR = {
        standard: [128],
        higher: [320, 192, 128],
        lossless: [740, 320, 192, 128],
        hires: [999, 740, 320, 192, 128]
      };
      EXTRA_PREFIX = "gdstudio:";
      picCache = /* @__PURE__ */ new Map();
    }
  });

  // ../../packages/core/src/provider-netease.ts
  function createNeteaseAccountMusicPlugin(options) {
    const pluginId = options.pluginId;
    const baseUrl = (options.baseUrl ?? NETEASE_API_DEFAULT_BASE_URL).replace(/\/$/, "");
    const timeoutMs = options.requestTimeoutMs ?? 15e3;
    let context;
    let cookie = "";
    let user = null;
    let qrUnikey = "";
    async function persistSession() {
      if (!context) return;
      await context.storage.set(COOKIE_KEY, cookie);
      await context.storage.set(USER_KEY, user ? JSON.stringify(user) : "");
    }
    async function request(path, init = {}, { skipCodeCheck = false } = {}) {
      const url = new URL(`${baseUrl}${path}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = new Headers(init.headers);
        if (cookie) headers.set("cookie", cookie);
        const response = await fetch(url, { ...init, headers, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !skipCodeCheck && typeof payload.code === "number" && payload.code !== 200 && payload.code !== 0) {
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
    function get(path, query = {}, options2 = {}) {
      const search = new URLSearchParams(
        Object.entries(query).map(([key, value]) => [key, String(value)])
      ).toString();
      return request(`${path}${search ? `?${search}` : ""}`, {}, options2);
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
        capabilities: ["account", "playlists", "search", "playback", "lyrics", "recommendations"]
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
      async qrLoginStart() {
        const keyResponse = await get(
          "/login/qr/key",
          { timestamp: Date.now() }
        );
        const unikey = keyResponse.data?.unikey ?? keyResponse.unikey;
        if (!unikey) throw new NeteaseApiError("\u83B7\u53D6\u626B\u7801\u767B\u5F55\u5BC6\u94A5\u5931\u8D25\u3002");
        qrUnikey = unikey;
        const createResponse = await get(
          "/login/qr/create",
          { key: unikey, qrimg: "true", timestamp: Date.now() }
        );
        const qrUrl = createResponse.data?.qrurl;
        const qrDataUri = createResponse.data?.qrimg;
        if (!qrDataUri && !qrUrl) throw new NeteaseApiError("\u83B7\u53D6\u767B\u5F55\u4E8C\u7EF4\u7801\u5931\u8D25\u3002");
        return { ...qrDataUri ? { qrDataUri } : {}, ...qrUrl ? { qrUrl } : {} };
      },
      async qrLoginCheck() {
        if (!qrUnikey) throw new NeteaseApiError("\u8BF7\u5148\u83B7\u53D6\u767B\u5F55\u4E8C\u7EF4\u7801\u3002");
        const response = await get("/login/qr/check", { key: qrUnikey, timestamp: Date.now() }, { skipCodeCheck: true });
        const stateCode = response.data?.code ?? response.code;
        if (stateCode === 803) {
          cookie = response.cookie ?? "";
          if (!cookie) throw new NeteaseApiError("\u626B\u7801\u5DF2\u786E\u8BA4\uFF0C\u4F46\u4EE3\u7406\u6CA1\u6709\u8FD4\u56DE\u767B\u5F55\u51ED\u636E\u3002");
          user = null;
          const refreshed = await this.getUser?.();
          await persistSession();
          return { state: "authorized", ...refreshed ? { user: refreshed } : {} };
        }
        if (stateCode === 800) return { state: "expired" };
        if (stateCode === 802) return { state: "scanned" };
        return { state: "waiting" };
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
      async getCover(song) {
        return song.coverUrl ?? null;
      },
      async getRecommendations() {
        const currentUser = user ?? await this.getUser?.();
        if (!currentUser) throw new NeteaseApiError("\u5C1A\u672A\u767B\u5F55\u7F51\u6613\u4E91\u8D26\u53F7\u3002");
        const response = await get(
          "/recommend/songs"
        );
        return (response.data?.dailySongs ?? []).filter((song) => song.id !== void 0 && song.name !== void 0).map(toPluginSong);
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
  var NETEASE_API_DEFAULT_BASE_URL, NeteaseApiError, COOKIE_KEY, USER_KEY;
  var init_provider_netease = __esm({
    "../../packages/core/src/provider-netease.ts"() {
      "use strict";
      NETEASE_API_DEFAULT_BASE_URL = "http://127.0.0.1:3000";
      NeteaseApiError = class extends Error {
        constructor(message, code) {
          super(message);
          this.code = code;
          this.name = "NeteaseApiError";
        }
      };
      COOKIE_KEY = "netease.cookie";
      USER_KEY = "netease.user";
    }
  });

  // ../../packages/core/src/theme-tokens.ts
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
  var DEFAULT_THEME_TOKENS, THEME_COLOR_TOKEN_KEYS;
  var init_theme_tokens = __esm({
    "../../packages/core/src/theme-tokens.ts"() {
      "use strict";
      DEFAULT_THEME_TOKENS = {
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
      THEME_COLOR_TOKEN_KEYS = Object.keys(
        DEFAULT_THEME_TOKENS
      );
    }
  });

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
  var init_declarative = __esm({
    "../../packages/core/src/declarative.ts"() {
      "use strict";
      init_provider_gdstudio();
      init_provider_netease();
      init_theme_tokens();
    }
  });

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
  var SourceAggregator;
  var init_source_aggregator = __esm({
    "../../packages/core/src/source-aggregator.ts"() {
      "use strict";
      SourceAggregator = class {
        constructor(registry2) {
          this.registry = registry2;
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
    }
  });

  // ../../packages/core/src/storage.ts
  var init_storage = __esm({
    "../../packages/core/src/storage.ts"() {
      "use strict";
    }
  });

  // ../../packages/core/src/index.ts
  var init_src = __esm({
    "../../packages/core/src/index.ts"() {
      "use strict";
      init_audio_engine();
      init_models();
      init_playlist_aggregator();
      init_plugin_contract();
      init_plugin_registry();
      init_plugin_runtime();
      init_plugin_package();
      init_provider_gdstudio();
      init_provider_netease();
      init_declarative();
      init_source_aggregator();
      init_theme_tokens();
      init_storage();
    }
  });

  // src/state.js
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
    }
  }
  function subscribe(topic, handler) {
    if (!listeners.has(topic)) listeners.set(topic, /* @__PURE__ */ new Set());
    listeners.get(topic).add(handler);
  }
  function publish(topic) {
    const set = listeners.get(topic);
    if (!set) return;
    for (const handler of set) handler();
  }
  function patchSettings(patch) {
    Object.assign(state.settings, patch);
    persisters.preferences();
    publish("settings");
  }
  function installedPlugin(id) {
    return state.plugins.find((plugin) => plugin.id === id) ?? null;
  }
  function enabledSourcePlugins() {
    return state.plugins.filter(
      (plugin) => plugin.enabled && plugin.kind === "music-source" && plugin.status !== "error"
    );
  }
  function enabledAccountPlugin() {
    return state.plugins.find(
      (plugin) => plugin.enabled && plugin.kind === "music-source" && plugin.capabilities.includes("account")
    ) ?? null;
  }
  var PREFIX, listeners, PLAYBACK_MODES, QUALITIES, state, playbackMemory, persisters;
  var init_state = __esm({
    "src/state.js"() {
      PREFIX = "linmo.";
      listeners = /* @__PURE__ */ new Map();
      PLAYBACK_MODES = ["sequence", "repeat-all", "shuffle", "repeat-one"];
      QUALITIES = [
        ["standard", "\u6807\u51C6 128k"],
        ["higher", "\u8F83\u9AD8 320k"],
        ["lossless", "\u65E0\u635F"],
        ["hires", "Hi-Res"]
      ];
      state = {
        page: "home",
        libraryTab: "songs",
        libraryPlaylistKey: null,
        songs: load("library", []).filter((song) => typeof song?.mediaUri === "string"),
        playlists: load("playlists", []).filter((playlist) => Array.isArray(playlist?.songs)),
        remotePlaylists: load("remote-playlists", []),
        recents: load("recents", []),
        plugins: load("plugins", []),
        searchResults: [],
        searchFailures: [],
        searchQuery: "",
        searchSource: "all",
        searchLoading: false,
        searchSearched: false,
        recommendations: [],
        recommendationsLoading: false,
        account: null,
        accountPluginId: null,
        currentSong: null,
        queue: [],
        queueIndex: -1,
        playerStatus: "idle",
        playerError: null,
        resolvedVia: null,
        // { pluginId, source, fallbackUsed }
        isPlaying: false,
        nowPlayingOpen: false,
        lyrics: null,
        // { lines, synced, translated, plain, songKey, loading, error }
        settings: Object.assign(
          {
            mode: "light",
            themeId: "",
            fontId: "",
            quality: "higher",
            autoplayNext: true,
            backgroundPlayback: true,
            playbackMode: "sequence",
            volume: 0.8,
            muted: false,
            onboardingDone: false,
            notifyOnTrackChange: true
          },
          load("preferences", {})
        )
      };
      if (!PLAYBACK_MODES.includes(state.settings.playbackMode)) state.settings.playbackMode = "sequence";
      if (!QUALITIES.some(([id]) => id === state.settings.quality)) state.settings.quality = "higher";
      playbackMemory = load("playback-memory", {});
      persisters = {
        library: () => save("library", state.songs),
        playlists: () => save("playlists", state.playlists),
        remotePlaylists: () => save("remote-playlists", state.remotePlaylists),
        recents: () => save("recents", state.recents.slice(0, 30)),
        plugins: () => save("plugins", state.plugins),
        preferences: () => save("preferences", state.settings),
        playbackMemory: () => save("playback-memory", playbackMemory)
      };
    }
  });

  // src/core-bridge.js
  var core_bridge_exports = {};
  __export(core_bridge_exports, {
    accountLogin: () => accountLogin,
    accountLogout: () => accountLogout,
    aggregator: () => aggregator,
    bootPlugins: () => bootPlugins,
    disablePlugin: () => disablePlugin,
    enablePlugin: () => enablePlugin,
    fetchCover: () => fetchCover,
    fetchLyrics: () => fetchLyrics,
    fetchRecommendations: () => fetchRecommendations,
    localMediaUrl: () => localMediaUrl,
    qrLoginCheck: () => qrLoginCheck,
    qrLoginStart: () => qrLoginStart,
    refreshAccount: () => refreshAccount,
    registry: () => registry,
    resolvePlayback: () => resolvePlayback,
    searchAll: () => searchAll,
    syncRemotePlaylists: () => syncRemotePlaylists,
    toUnified: () => toUnified,
    uninstallPlugin: () => uninstallPlugin
  });
  function pluginStorage(pluginId) {
    const prefix = `linmo.pluginStorage.${pluginId}.`;
    return {
      async get(key) {
        return localStorage.getItem(prefix + key);
      },
      async set(key, value) {
        localStorage.setItem(prefix + key, String(value));
      },
      async remove(key) {
        localStorage.removeItem(prefix + key);
      }
    };
  }
  async function startPlugin(meta) {
    if (meta.kind !== "music-source") return { ok: true };
    try {
      const plugin = createMusicSourcePlugin(manifestOf(meta));
      const registered = registry.register(plugin);
      if (!registered.ok) throw new Error(registered.error);
      const enabled = await registry.enable(meta.id, {
        sourceId: meta.id,
        storage: pluginStorage(meta.id),
        log: (message, details) => console.info(`[linmo:${meta.id}] ${message}`, details ?? "")
      });
      if (!enabled.ok) throw new Error(enabled.error);
      meta.status = "enabled";
      meta.lastError = "";
      return { ok: true };
    } catch (error) {
      meta.status = "error";
      meta.lastError = error instanceof Error ? error.message : "\u63D2\u4EF6\u521D\u59CB\u5316\u5931\u8D25\u3002";
      return { ok: false, error: meta.lastError };
    }
  }
  function manifestOf(meta) {
    const { id, name, version, hostApiVersion, kind, provider, config, capabilities } = meta;
    return { id, name, version, hostApiVersion, kind, provider, config, capabilities };
  }
  async function enablePlugin(pluginId) {
    const meta = installedPlugin(pluginId);
    if (!meta) return { ok: false, error: "\u63D2\u4EF6\u4E0D\u5B58\u5728\u3002" };
    meta.enabled = true;
    const result = await startPlugin(meta);
    persisters.plugins();
    publish("plugins");
    return result;
  }
  async function disablePlugin(pluginId) {
    const meta = installedPlugin(pluginId);
    if (!meta) return { ok: false, error: "\u63D2\u4EF6\u4E0D\u5B58\u5728\u3002" };
    meta.enabled = false;
    meta.status = "";
    if (meta.kind === "music-source") {
      await registry.disable(pluginId).catch(() => void 0);
      registry.unregister(pluginId);
    }
    persisters.plugins();
    publish("plugins");
    return { ok: true };
  }
  async function bootPlugins() {
    for (const meta of state.plugins) {
      if (meta.enabled && meta.kind === "music-source") await startPlugin(meta);
    }
    publish("plugins");
  }
  async function uninstallPlugin(pluginId) {
    await disablePlugin(pluginId);
    state.plugins = state.plugins.filter((plugin) => plugin.id !== pluginId);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`linmo.pluginStorage.${pluginId}.`)) localStorage.removeItem(key);
    }
    try {
      await window.linmoDesktop?.plugins?.uninstall?.(pluginId);
    } catch {
    }
    persisters.plugins();
    publish("plugins");
  }
  function searchAll(query) {
    return aggregator.searchAll({ query, page: 1, pageSize: 30 });
  }
  async function resolvePlayback(song) {
    const quality = state.settings.quality;
    if (song.mediaUri) return { url: localMediaUrl(song), viaPluginId: "local", fallbackUsed: false };
    const resolved = await aggregator.resolvePlayback(song, quality);
    return {
      url: mediaPlaybackUrl(resolved.resource.url),
      viaPluginId: resolved.viaPluginId,
      viaSource: resolved.viaSource,
      fallbackUsed: resolved.fallbackUsed
    };
  }
  function mediaPlaybackUrl(url) {
    return /^http:\/\//i.test(url) ? `linmo-media://stream?url=${encodeURIComponent(url)}` : url;
  }
  function localMediaUrl(song) {
    return `file:///${String(song.mediaUri).replaceAll("\\", "/")}`;
  }
  function friendlyNetError(message) {
    const text = String(message);
    if (/ERR_CONNECTION_REFUSED/i.test(text))
      return "\u65E0\u6CD5\u8FDE\u63A5\u5230\u97F3\u6E90\u4EE3\u7406\u670D\u52A1\uFF1A\u8BF7\u786E\u8BA4\u4EE3\u7406\u5DF2\u542F\u52A8\uFF08\u7F51\u6613\u4E91\u9ED8\u8BA4\u7AEF\u53E3 3000\uFF09\uFF0C\u670D\u52A1\u5730\u5740\u53EF\u5728\u63D2\u4EF6\u4E2D\u5FC3\u4FEE\u6539\u3002";
    if (/ERR_CONNECTION_RESET|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED/i.test(text))
      return "\u7F51\u7EDC\u8FDE\u63A5\u4E0D\u53EF\u7528\u6216\u88AB\u91CD\u7F6E\uFF1A\u8BF7\u68C0\u67E5\u7F51\u7EDC\u4E0E\u4EE3\u7406\u8BBE\u7F6E\u540E\u91CD\u8BD5\u3002";
    if (/ERR_TIMED_OUT|AbortError|超时/i.test(text)) return "\u8FDE\u63A5\u8D85\u65F6\uFF1A\u4EE3\u7406\u670D\u52A1\u54CD\u5E94\u8FC7\u6162\u6216\u4E0D\u53EF\u8FBE\u3002";
    if (/ERR_NAME_NOT_RESOLVED/i.test(text)) return "\u57DF\u540D\u65E0\u6CD5\u89E3\u6790\uFF1A\u8BF7\u68C0\u67E5\u670D\u52A1\u5730\u5740\u662F\u5426\u6B63\u786E\u3002";
    return text;
  }
  async function callPlugin(pluginId, capability, operation) {
    const record = registry.get(pluginId);
    if (!record || record.status === "disabled")
      return { ok: false, error: `\u63D2\u4EF6 ${pluginId} \u672A\u542F\u7528\u3002` };
    if (!record.plugin.manifest.capabilities?.includes(capability))
      return { ok: false, error: `\u63D2\u4EF6 ${pluginId} \u672A\u58F0\u660E ${capability} \u80FD\u529B\u3002` };
    try {
      return { ok: true, value: await operation(record.plugin) };
    } catch (error) {
      return {
        ok: false,
        error: friendlyNetError(error instanceof Error ? error.message : "\u63D2\u4EF6\u8C03\u7528\u5931\u8D25\u3002")
      };
    }
  }
  async function fetchLyrics(song) {
    if (song.mediaUri || !song.pluginId) return { ok: false, error: "\u672C\u5730\u6B4C\u66F2\u6682\u65E0\u6B4C\u8BCD\u3002" };
    return callPlugin(song.pluginId, "lyrics", (plugin) => plugin.getLyrics(song));
  }
  async function fetchCover(song) {
    if (!song) return null;
    if (song.coverUrl) return song.coverUrl;
    if (coverCache.has(song.key)) return coverCache.get(song.key);
    const nextRetry = coverRetryAt.get(song.key) ?? 0;
    if (Date.now() < nextRetry) return null;
    if (coverInflight.has(song.key)) return coverInflight.get(song.key);
    const promise = (async () => {
      if (song.mediaUri || !song.pluginId) return null;
      const record = registry.get(song.pluginId);
      const plugin = record?.plugin;
      if (!plugin?.getCover) return null;
      try {
        return await plugin.getCover(song) ?? null;
      } catch {
        coverRetryAt.set(song.key, Date.now() + 15e3);
        return null;
      }
    })();
    coverInflight.set(song.key, promise);
    const url = await promise;
    coverInflight.delete(song.key);
    if (!coverRetryAt.has(song.key)) coverCache.set(song.key, url);
    return url;
  }
  async function accountLogin(payload) {
    const plugin = enabledAccountPlugin();
    if (!plugin) return { ok: false, error: "\u6CA1\u6709\u5DF2\u542F\u7528\u7684\u8D26\u53F7\u7C7B\u97F3\u6E90\u63D2\u4EF6\u3002" };
    const result = await callPlugin(plugin.id, "account", (instance) => instance.login(payload));
    if (!result.ok) return { ok: false, error: result.error };
    await refreshAccount();
    return { ok: true };
  }
  async function qrLoginStart() {
    const plugin = enabledAccountPlugin();
    if (!plugin) return { ok: false, error: "\u6CA1\u6709\u5DF2\u542F\u7528\u7684\u8D26\u53F7\u7C7B\u97F3\u6E90\u63D2\u4EF6\u3002" };
    return callPlugin(plugin.id, "account", (instance) => instance.qrLoginStart());
  }
  async function qrLoginCheck() {
    const plugin = enabledAccountPlugin();
    if (!plugin) return { ok: false, error: "\u6CA1\u6709\u5DF2\u542F\u7528\u7684\u8D26\u53F7\u7C7B\u97F3\u6E90\u63D2\u4EF6\u3002" };
    return callPlugin(plugin.id, "account", (instance) => instance.qrLoginCheck());
  }
  async function accountLogout() {
    const plugin = enabledAccountPlugin();
    if (!plugin) return;
    await callPlugin(plugin.id, "account", (instance) => instance.logout());
    state.account = null;
    state.remotePlaylists = [];
    state.recommendations = [];
    persisters.remotePlaylists();
    publish("account");
    publish("remote-playlists");
  }
  async function refreshAccount() {
    const plugin = enabledAccountPlugin();
    state.accountPluginId = plugin?.id ?? null;
    if (!plugin) {
      state.account = null;
      publish("account");
      return;
    }
    const result = await callPlugin(plugin.id, "account", (instance) => instance.getUser());
    state.account = result.ok ? result.value : null;
    publish("account");
  }
  async function syncRemotePlaylists() {
    const plugin = enabledAccountPlugin();
    if (!plugin) return { ok: false, error: "\u6CA1\u6709\u5DF2\u542F\u7528\u7684\u8D26\u53F7\u7C7B\u97F3\u6E90\u63D2\u4EF6\u3002" };
    const result = await callPlugin(
      plugin.id,
      "playlists",
      (instance) => instance.listUserPlaylists()
    );
    if (!result.ok) return { ok: false, error: result.error };
    const synced = [];
    for (const remote of result.value.slice(0, 40)) {
      const playlist = {
        key: `${plugin.id}:${remote.remoteId}`,
        pluginId: plugin.id,
        sourceId: plugin.id,
        remoteId: remote.remoteId,
        title: remote.title,
        ...remote.coverUrl ? { coverUrl: remote.coverUrl } : {},
        ...remote.count === void 0 ? {} : { count: remote.count },
        songs: [],
        syncedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const songs = await callPlugin(
        plugin.id,
        "playlists",
        (instance) => instance.listPlaylistSongs(remote, 1, 100)
      );
      if (songs.ok) {
        playlist.songs = songs.value.items.map((item) => toUnified(plugin.id, item));
      }
      synced.push(playlist);
    }
    state.remotePlaylists = synced;
    persisters.remotePlaylists();
    publish("remote-playlists");
    return { ok: true, count: synced.length };
  }
  async function fetchRecommendations() {
    const plugin = enabledAccountPlugin();
    if (!plugin || !plugin.capabilities.includes("recommendations")) {
      state.recommendations = [];
      publish("recommendations");
      return;
    }
    state.recommendationsLoading = true;
    publish("recommendations");
    const result = await callPlugin(
      plugin.id,
      "recommendations",
      (instance) => instance.getRecommendations()
    );
    state.recommendationsLoading = false;
    state.recommendations = result.ok ? result.value.map((song) => toUnified(plugin.id, song)) : [];
    publish("recommendations");
  }
  function toUnified(pluginId, pluginSong) {
    return {
      pluginId,
      sourceId: pluginId,
      remoteId: pluginSong.remoteId,
      key: `${pluginId}:${pluginSong.remoteId}`,
      title: pluginSong.title,
      artist: pluginSong.artist,
      ...pluginSong.album === void 0 ? {} : { album: pluginSong.album },
      ...pluginSong.coverUrl === void 0 ? {} : { coverUrl: pluginSong.coverUrl },
      ...pluginSong.durationMs === void 0 ? {} : { durationMs: pluginSong.durationMs },
      ...pluginSong.extra === void 0 ? {} : { extra: pluginSong.extra }
    };
  }
  var registry, aggregator, coverCache, coverInflight, coverRetryAt;
  var init_core_bridge = __esm({
    "src/core-bridge.js"() {
      init_net();
      init_src();
      init_state();
      registry = new PluginRegistry({
        info: (message, details) => console.info(`[linmo] ${message}`, details ?? ""),
        error: (message, details) => console.error(`[linmo] ${message}`, details ?? "")
      });
      aggregator = new SourceAggregator(registry);
      coverCache = /* @__PURE__ */ new Map();
      coverInflight = /* @__PURE__ */ new Map();
      coverRetryAt = /* @__PURE__ */ new Map();
    }
  });

  // src/icons.js
  function icon(name, extra = "") {
    return `<svg class="ui-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name] ?? iconPaths.music}</svg>`;
  }
  var iconPaths;
  var init_icons = __esm({
    "src/icons.js"() {
      iconPaths = {
        home: '<path d="m4 10.5 8-6.5 8 6.5V19a1 1 0 0 1-1 1h-5v-5.5h-4V20H5a1 1 0 0 1-1-1Z"/>',
        search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
        library: '<path d="M5 4.5v15"/><path d="M9 5.5a2 2 0 0 1 2-2h7.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H11a2 2 0 0 0-2 2"/><path d="M9.5 18.5h10"/>',
        plugins: '<path d="m12 2.8 2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5Z"/>',
        settings: '<path fill="currentColor" stroke="none" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58ZM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6Z"/>',
        music: '<path d="M9 18.5V5.5l10-2.2v13"/><circle cx="6.5" cy="18.5" r="2.8"/><circle cx="16.5" cy="16.3" r="2.8"/>',
        play: '<path d="M8.2 5.2a.8.8 0 0 1 1.22-.68l10.4 6.8a.8.8 0 0 1 0 1.34l-10.4 6.8a.8.8 0 0 1-1.22-.68Z" fill="currentColor" stroke="none"/>',
        pause: '<path d="M7.5 5.5v13M16.5 5.5v13"/>',
        previous: '<path d="M16.5 6.5 10 12l6.5 5.5Z" fill="currentColor" stroke="none"/><path d="M7 6v12"/>',
        next: '<path d="m7.5 6.5 6.5 5.5-6.5 5.5Z" fill="currentColor" stroke="none"/><path d="M17 6v12"/>',
        volume: '<path d="M4 10v4h3l4.5 3.5v-11L7 10Z"/><path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10"/>',
        volumeMute: '<path d="M4 10v4h3l4.5 3.5v-11L7 10Z"/><path d="m16 10 4 4M20 10l-4 4"/>',
        shuffle: '<path d="M4 7h2.8c4.2 0 6.2 10 10.4 10H20M17 5l3 2-3 2M4 17h2.8c1.4 0 2.5-1.3 3.4-2.8M15.6 9.6c.9-1.5 2-2.6 3.6-2.6M17 15l3 2-3 2"/>',
        repeat: '<path d="m17 3.5 3 3-3 3M20 6.5H8a4 4 0 0 0-4 4v1M7 20.5l-3-3 3-3M4 17.5h12a4 4 0 0 0 4-4v-1"/>',
        repeatOne: '<path d="m17 3.5 3 3-3 3M20 6.5H8a4 4 0 0 0-4 4v1M7 20.5l-3-3 3-3M4 17.5h12a4 4 0 0 0 4-4v-1"/><path d="M12 10.2v5M10.4 11.4 12 10.2"/>',
        list: '<path d="M5 6.5h14M5 12h14M5 17.5h9"/>',
        queueAdd: '<path d="M3 6h13M3 11h13M3 16h8M18 10v8M14 14h8"/>',
        playlistAdd: '<path d="M3 6h12M3 11h12M3 16h7M17 11v8M13 15h8"/>',
        minimize: '<path d="M5 12h14"/>',
        maximize: '<rect x="5.5" y="5.5" width="13" height="13" rx="1"/>',
        restore: '<rect x="4.5" y="8" width="11" height="11" rx="1"/><path d="M8 5.5h11v11"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
        arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
        arrowRight: '<path d="m5 12h14M13 6l6 6-6 6"/>',
        chevronRight: '<path d="m9 5 7 7-7 7"/>',
        chevronDown: '<path d="m5 9 7 7 7-7"/>',
        check: '<path d="m4.5 12.5 5 5L19.5 7"/>',
        more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
        folder: '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/>',
        file: '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z"/><path d="M13.5 3.5v5h5"/>',
        palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.7 1.9-1.7 0-.8-.5-1.2-.5-2 0-1 .8-1.7 1.9-1.7h1.5a3.6 3.6 0 0 0 3.7-3.6c0-4.4-3.9-8-8.5-8Z"/><circle cx="7.6" cy="11.2" r="1.1"/><circle cx="10.3" cy="7.4" r="1.1"/><circle cx="14.8" cy="7.6" r="1.1"/>',
        font: '<path d="M5 19 11 5h2l6 14M7.6 14.5h8.8"/>',
        moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
        person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
        login: '<path d="M14 5.5H6.5v13H14M10 12h10M17 8.5l3 3.5-3 3.5"/>',
        logout: '<path d="M10 5.5h7.5v13H10M4 12h10M11 8.5 14 12l-3 3.5"/>',
        refresh: '<path d="M20 5.5v5h-5M4 18.5v-5h5M5 13.5a7 7 0 0 0 12.4 3.1L20 12M4 12l2.6-4.6A7 7 0 0 1 19 10.5"/>',
        delete: '<path d="M5.5 7h13M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M7 7l.8 11.4a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7M10.2 10.5v6M13.8 10.5v6"/>',
        edit: '<path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5Z"/><path d="m14.5 7 3 3"/>',
        add: '<path d="M12 5v14M5 12h14"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        lyrics: '<path d="M4 5.5h16v11H9l-5 4Z"/><path d="M8 9.5h8M8 12.5h5"/>',
        sync: '<path d="M20 5.5v5h-5M4 18.5v-5h5M5 13.5a7 7 0 0 0 12.4 3.1L20 12M4 12l2.6-4.6A7 7 0 0 1 19 10.5"/>',
        error: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V13"/><circle cx="12" cy="16.2" r="1.1" fill="currentColor" stroke="none"/>',
        info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>',
        expand: '<path d="m7 9.5 5-5 5 5M7 14.5l5 5 5-5"/>',
        download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
        queue: '<path d="M4 6h12M4 10.5h12M4 15h7M17 11v8.5M13.5 15.5 20.5 15"/>',
        history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.5"/>',
        drag: '<circle cx="9" cy="7" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.4" fill="currentColor" stroke="none"/>',
        skip: '<path d="M5 5.5 11.5 12 5 18.5Z" fill="currentColor" stroke="none"/><path d="M13 5.5 19.5 12 13 18.5Z" fill="currentColor" stroke="none"/>'
      };
    }
  });

  // src/ui.js
  var ui_exports = {};
  __export(ui_exports, {
    confirmDialog: () => confirmDialog,
    coverMarkup: () => coverMarkup,
    escapeHtml: () => escapeHtml,
    formatTime: () => formatTime,
    installImageErrorFallback: () => installImageErrorFallback,
    installRipple: () => installRipple,
    openDialog: () => openDialog,
    qs: () => qs,
    qsa: () => qsa,
    setBusy: () => setBusy,
    snackbar: () => snackbar
  });
  function qs(selector, root = document) {
    return root.querySelector(selector);
  }
  function qsa(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>'"]/g,
      (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]
    );
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const padded = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${padded}`;
  }
  function coverMarkup(song, size = "") {
    const url = song?.coverUrl;
    const classes = `cover ${size}`.trim();
    const glyph = icon("music");
    if (url)
      return `<span class="${classes} cover-image"><span class="cover-glyph">${glyph}</span><img src="${escapeHtml(
        url
      )}" alt="" loading="lazy"/></span>`;
    return `<span class="${classes} cover-fallback">${glyph}</span>`;
  }
  function installImageErrorFallback() {
    document.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        if (target instanceof HTMLImageElement) target.remove();
      },
      true
    );
  }
  function installRipple() {
    document.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target.closest(".ripple") : null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const diameter = Math.max(rect.width, rect.height) * 2;
      const span = document.createElement("span");
      span.className = "ripple-wave";
      span.style.width = `${diameter}px`;
      span.style.height = `${diameter}px`;
      span.style.left = `${event.clientX - rect.left - diameter / 2}px`;
      span.style.top = `${event.clientY - rect.top - diameter / 2}px`;
      target.appendChild(span);
      window.setTimeout(() => span.remove(), 650);
    });
  }
  function snackbar(message, action) {
    let layer = qs("#snackbar-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "snackbar-layer";
      document.body.appendChild(layer);
    }
    layer.innerHTML = `<div class="snackbar" role="status"><span>${escapeHtml(message)}</span>${action ? `<button type="button" class="snackbar-action text-button">${escapeHtml(action.label)}</button>` : ""}</div>`;
    if (action) qs(".snackbar-action", layer)?.addEventListener("click", () => action.run());
    window.clearTimeout(snackbarTimer);
    snackbarTimer = window.setTimeout(() => {
      const current = qs(".snackbar", layer);
      if (current) {
        current.classList.add("is-leaving");
        window.setTimeout(() => layer.innerHTML = "", 200);
      }
    }, 3600);
  }
  function openDialog({
    eyebrow,
    title,
    body,
    confirmLabel = "\u786E\u5B9A",
    cancelLabel,
    danger,
    pickSelector,
    onOpen
  }) {
    return new Promise((resolve) => {
      const layer = document.createElement("div");
      layer.className = "dialog-layer";
      layer.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      ${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
      <h2>${escapeHtml(title)}</h2>
      <div class="dialog-body">${body}</div>
      <div class="dialog-actions">
        ${cancelLabel ? `<button type="button" class="text-button" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>` : ""}
        <button type="button" class="${danger ? "danger-button" : "filled-button"}" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;
      const close = (value) => {
        layer.classList.add("is-leaving");
        window.setTimeout(() => layer.remove(), 180);
        document.removeEventListener("keydown", onKey, true);
        resolve(value);
      };
      const onKey = (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close(null);
        }
      };
      layer.addEventListener("click", (event) => {
        if (event.target === layer) close(null);
      });
      if (pickSelector)
        layer.addEventListener("click", (event) => {
          const picked = event.target instanceof Element ? event.target.closest(pickSelector) : null;
          if (picked) close(picked);
        });
      qs("[data-dialog-confirm]", layer).addEventListener("click", () => close(layer));
      qs("[data-dialog-cancel]", layer)?.addEventListener("click", () => close(null));
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(layer);
      onOpen?.(layer);
      const focusable = qs("input, textarea, select", layer) ?? qs("[data-dialog-confirm]", layer);
      focusable?.focus();
    });
  }
  async function confirmDialog(title, body, confirmLabel = "\u5220\u9664") {
    return Boolean(
      await openDialog({ title, body, confirmLabel, cancelLabel: "\u53D6\u6D88", danger: true })
    );
  }
  function setBusy(bar, busy) {
    if (!bar) return;
    bar.hidden = !busy;
  }
  var snackbarTimer;
  var init_ui = __esm({
    "src/ui.js"() {
      init_icons();
      snackbarTimer = 0;
    }
  });

  // src/theme.js
  var theme_exports = {};
  __export(theme_exports, {
    applyAppearance: () => applyAppearance,
    applyFontPluginSelection: () => applyFontPluginSelection,
    applyThemePlugin: () => applyThemePlugin,
    installedFontPlugins: () => installedFontPlugins,
    installedThemePlugins: () => installedThemePlugins,
    setMode: () => setMode
  });
  function tokenToCustomProperty(token) {
    return `--m3-${token.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
  }
  function base64ToArrayBuffer2(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  }
  async function readPluginFile(pluginId, fileName) {
    const base64 = await window.linmoDesktop.plugins.readFile(pluginId, fileName);
    return base64ToArrayBuffer2(base64);
  }
  async function applyFontPlugin() {
    const root = document.documentElement;
    const fontId = state.settings.fontId;
    const stale = document.querySelectorAll("style[data-linmo-font]");
    stale.forEach((node) => node.remove());
    root.style.setProperty("--app-font", DEFAULT_FONT_STACK);
    if (!fontId) return;
    const meta = installedPlugin(fontId);
    if (!meta?.font) return;
    try {
      const buffer = await readPluginFile(fontId, meta.font.file);
      const face = new FontFace(meta.font.family, buffer);
      await face.load();
      document.fonts.add(face);
      root.style.setProperty("--app-font", `'${meta.font.family}', ${DEFAULT_FONT_STACK}`);
    } catch (error) {
      snackbar(`\u5B57\u4F53\u52A0\u8F7D\u5931\u8D25\uFF1A${error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF"}`);
    }
  }
  async function applyAppearance() {
    const root = document.documentElement;
    const { mode, themeId } = state.settings;
    const base = mode === "dark" ? DARK_TOKENS : DEFAULT_THEME_TOKENS;
    let tokens = { ...base };
    if (themeId) {
      const meta = installedPlugin(themeId);
      if (meta?.theme?.entry) {
        try {
          const buffer = await readPluginFile(themeId, meta.theme.entry);
          const payload = normalizeThemePayload(
            JSON.parse(new TextDecoder().decode(buffer)),
            meta.name
          );
          tokens = mergeThemeTokens({ ...payload, colors: { ...base, ...payload.colors } });
        } catch (error) {
          snackbar(`\u4E3B\u9898\u5E94\u7528\u5931\u8D25\uFF1A${error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF"}`);
          patchSettings({ themeId: "" });
        }
      } else {
        patchSettings({ themeId: "" });
      }
    }
    for (const [token, value] of Object.entries(tokens))
      root.style.setProperty(tokenToCustomProperty(token), value);
    root.dataset.mode = mode;
    await applyFontPlugin();
    publish("theme");
  }
  async function applyThemePlugin(pluginId) {
    const meta = installedPlugin(pluginId);
    let mode = state.settings.mode;
    if (meta?.theme?.entry) {
      try {
        const buffer = await readPluginFile(pluginId, meta.theme.entry);
        const payload = normalizeThemePayload(
          JSON.parse(new TextDecoder().decode(buffer)),
          meta.name
        );
        mode = payload.mode;
      } catch {
      }
    }
    patchSettings({ themeId: pluginId, mode });
    await applyAppearance();
  }
  async function applyFontPluginSelection(pluginId) {
    patchSettings({ fontId: pluginId });
    await applyAppearance();
  }
  async function setMode(mode) {
    patchSettings({ mode, themeId: "" });
    await applyAppearance();
  }
  var DARK_TOKENS, DEFAULT_FONT_STACK, installedThemePlugins, installedFontPlugins;
  var init_theme = __esm({
    "src/theme.js"() {
      init_src();
      init_state();
      init_ui();
      DARK_TOKENS = {
        primary: "#D0BCFF",
        onPrimary: "#381E72",
        primaryContainer: "#4F378B",
        onPrimaryContainer: "#EADDFF",
        secondary: "#CCC2DC",
        secondaryContainer: "#4A4458",
        onSecondaryContainer: "#E8DEF8",
        tertiaryContainer: "#633B48",
        onTertiaryContainer: "#FFD8E4",
        surface: "#141218",
        surfaceContainer: "#211F26",
        surfaceContainerHigh: "#2B2930",
        surfaceContainerHighest: "#36343B",
        onSurface: "#E6E0E9",
        onSurfaceVariant: "#CAC4D0",
        outline: "#938F99",
        outlineVariant: "#49454F",
        error: "#F2B8B5",
        scrim: "#000000"
      };
      DEFAULT_FONT_STACK = "'MiSans', 'MiSans VF', 'Google Sans', 'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', system-ui, sans-serif";
      installedThemePlugins = () => state.plugins.filter((plugin) => plugin.kind === "theme");
      installedFontPlugins = () => state.plugins.filter((plugin) => plugin.kind === "font");
    }
  });

  // src/lrc.js
  function parseLrc(text) {
    const lines = [];
    for (const rawLine of String(text ?? "").split(/\r?\n/)) {
      TIME_TAG.lastIndex = 0;
      const stamps = [];
      let match;
      let lastIndex = 0;
      while (match = TIME_TAG.exec(rawLine)) {
        if (match.index !== lastIndex) break;
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fraction = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
        stamps.push((minutes * 60 + seconds) * 1e3 + fraction);
        lastIndex = TIME_TAG.lastIndex;
      }
      if (!stamps.length) continue;
      const content = rawLine.slice(lastIndex).trim();
      for (const timeMs of stamps) lines.push({ timeMs, text: content });
    }
    lines.sort((a, b) => a.timeMs - b.timeMs);
    return lines;
  }
  function activeLineIndex(lines, timeMs) {
    let index = -1;
    for (let cursor = 0; cursor < lines.length; cursor += 1) {
      if (lines[cursor].timeMs <= timeMs + 120) index = cursor;
      else break;
    }
    return index;
  }
  function isLrc(text) {
    TIME_TAG.lastIndex = 0;
    return TIME_TAG.test(String(text ?? ""));
  }
  var TIME_TAG;
  var init_lrc = __esm({
    "src/lrc.js"() {
      TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    }
  });

  // src/player.js
  var player_exports = {};
  __export(player_exports, {
    player: () => player,
    registerRecent: () => registerRecent,
    requestNotificationPermission: () => requestNotificationPermission
  });
  function clampVolume(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }
  function statusLabel(status) {
    return status;
  }
  function setStatus(status, error = null) {
    state.playerStatus = status;
    state.playerError = error;
    publish("player");
  }
  function setSong(song, queue = state.queue, index = -1) {
    state.currentSong = song;
    state.queue = queue;
    state.queueIndex = index;
    state.resolvedVia = null;
    pendingSeekSeconds = 0;
    publish("player");
    void primeLyrics(song);
    void updateMediaSession(song);
  }
  function savedPositionSeconds(songKey) {
    const entry = playbackMemory[songKey];
    if (!entry || !Number.isFinite(entry.positionMs)) return 0;
    return Math.max(0, entry.positionMs / 1e3);
  }
  function rememberPlayback(force = false) {
    const song = state.currentSong;
    if (!song?.key) return;
    const now = Date.now();
    if (!force && now - lastMemorySaveAt < 5e3) return;
    lastMemorySaveAt = now;
    const duration = audio.duration;
    const position = audio.currentTime;
    if (!Number.isFinite(position)) return;
    if (Number.isFinite(duration) && duration > 0 && position >= duration - 2) {
      delete playbackMemory[song.key];
    } else {
      playbackMemory[song.key] = {
        positionMs: Math.round(position * 1e3),
        durationMs: Number.isFinite(duration) ? Math.round(duration * 1e3) : void 0,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    persisters.playbackMemory();
  }
  function applyPendingSeek() {
    if (pendingSeekSeconds <= 0) return;
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const target = Math.min(pendingSeekSeconds, Math.max(0, duration - 1));
    if (target > 1) {
      try {
        audio.currentTime = target;
      } catch {
      }
    }
    pendingSeekSeconds = 0;
  }
  async function notifyTrackChange(song) {
    if (!state.settings.notifyOnTrackChange) return;
    if (!song || lastNotifiedKey === song.key) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    lastNotifiedKey = song.key;
    let iconUrl = "";
    if (song.coverUrl) iconUrl = song.coverUrl;
    else {
      const resolved = await fetchCover(song);
      if (resolved) iconUrl = resolved;
    }
    try {
      new Notification(song.title, {
        body: song.artist + (song.album ? ` \xB7 ${song.album}` : ""),
        ...iconUrl ? { icon: iconUrl } : {},
        silent: true
      });
    } catch {
    }
  }
  async function updateMediaSession(song) {
    if (!("mediaSession" in navigator)) return;
    if (!song) {
      navigator.mediaSession.metadata = null;
      return;
    }
    let artwork = [];
    const coverUrl = song.coverUrl ?? await fetchCover(song);
    if (coverUrl) {
      artwork = [
        { src: coverUrl, sizes: "512x512", type: "image/jpeg" },
        { src: coverUrl, sizes: "256x256", type: "image/jpeg" }
      ];
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        ...song.album ? { album: song.album } : {},
        ...artwork.length ? { artwork } : {}
      });
    } catch {
    }
  }
  function bindMediaSessionHandlers() {
    if (!("mediaSession" in navigator)) return;
    const set = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
      }
    };
    set("play", () => void audio.play().catch(() => void 0));
    set("pause", () => audio.pause());
    set("previoustrack", () => player.previous());
    set("nexttrack", () => player.next());
    set("seekto", (details) => {
      if (typeof details.seekTime === "number" && Number.isFinite(details.seekTime))
        audio.currentTime = Math.max(0, details.seekTime);
    });
    set("seekbackward", (details) => {
      const offset = details?.seekOffset ?? 10;
      audio.currentTime = Math.max(0, audio.currentTime - offset);
    });
    set("seekforward", (details) => {
      const offset = details?.seekOffset ?? 10;
      const duration = audio.duration;
      const next = audio.currentTime + offset;
      audio.currentTime = Number.isFinite(duration) ? Math.min(duration, next) : next;
    });
  }
  function syncMediaSessionPosition() {
    if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setPositionState !== "function")
      return;
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, duration)
      });
    } catch {
    }
  }
  function requestNotificationPermission() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => void 0);
    }
  }
  function registerRecent(song) {
    if (!song) return;
    if (song.pluginId === "local" && !song.mediaUri) return;
    state.recents = [
      { ...song, playedAt: (/* @__PURE__ */ new Date()).toISOString() },
      ...state.recents.filter((item) => item.key !== song.key)
    ].slice(0, 30);
    persisters.recents();
    publish("recents");
  }
  async function primeLyrics(song) {
    if (!song || song.mediaUri) return;
    if (lyricsCache.has(song.key)) {
      state.lyrics = { ...lyricsCache.get(song.key), songKey: song.key };
      publish("lyrics");
      return;
    }
    state.lyrics = { loading: true, songKey: song.key, lines: [], synced: false, plain: "" };
    publish("lyrics");
    const result = await fetchLyrics(song);
    if (state.currentSong?.key !== song.key) return;
    let payload;
    if (result.ok && (result.value.lyric ?? "").trim()) {
      const lyricText = result.value.lyric ?? "";
      const translated = result.value.translatedLyric ?? "";
      const synced = Boolean(result.value.synced) && isLrc(lyricText);
      payload = {
        loading: false,
        lines: synced ? parseLrc(lyricText) : [],
        synced,
        plain: synced ? "" : lyricText,
        translatedLines: synced && translated ? parseLrc(translated) : [],
        translatedPlain: synced ? "" : translated,
        error: ""
      };
    } else {
      payload = {
        loading: false,
        lines: [],
        synced: false,
        plain: "",
        translatedLines: [],
        translatedPlain: "",
        error: result.ok ? "\u8FD9\u9996\u6B4C\u66F2\u6682\u65F6\u6CA1\u6709\u6B4C\u8BCD\u3002" : result.error
      };
    }
    lyricsCache.set(song.key, payload);
    state.lyrics = { ...payload, songKey: song.key };
    publish("lyrics");
  }
  async function playResolved(song, index) {
    const token = ++resolveToken;
    setStatus("loading");
    try {
      const resolved = await resolvePlayback(song);
      if (token !== resolveToken) return;
      state.resolvedVia = resolved.viaPluginId ? {
        pluginId: resolved.viaPluginId,
        ...resolved.viaSource ? { source: resolved.viaSource } : {},
        fallbackUsed: Boolean(resolved.fallbackUsed)
      } : null;
      audio.src = resolved.url;
      pendingSeekSeconds = savedPositionSeconds(song.key);
      if (pendingSeekSeconds > 0) {
        const resumeAt = pendingSeekSeconds;
        audio.addEventListener(
          "loadedmetadata",
          () => {
            if (token === resolveToken && pendingSeekSeconds === resumeAt) applyPendingSeek();
          },
          { once: true }
        );
      }
      await audio.play();
      if (resolved.fallbackUsed) {
        const viaName = state.resolvedVia?.source ? `${state.resolvedVia.pluginId} \xB7 ${state.resolvedVia.source}` : state.resolvedVia?.pluginId;
        snackbar(`\u539F\u97F3\u6E90\u4E0D\u53EF\u7528\uFF0C\u5DF2\u4ECE ${viaName} \u8865\u5168\u64AD\u653E`);
      }
      registerRecent(song);
      void notifyTrackChange(song);
    } catch (error) {
      if (token !== resolveToken) return;
      audio.removeAttribute("src");
      setStatus("error", error instanceof Error ? error.message : "\u64AD\u653E\u5730\u5740\u89E3\u6790\u5931\u8D25\u3002");
      snackbar(state.playerError ?? "\u64AD\u653E\u5931\u8D25");
    }
  }
  var audio, lastVolume, resolveToken, lastMemorySaveAt, pendingSeekSeconds, lastNotifiedKey, lyricsCache, player;
  var init_player = __esm({
    "src/player.js"() {
      init_state();
      init_core_bridge();
      init_lrc();
      init_ui();
      audio = new Audio();
      audio.preload = "metadata";
      audio.volume = clampVolume(state.settings.volume);
      audio.muted = Boolean(state.settings.muted);
      lastVolume = audio.volume > 0 ? audio.volume : 0.8;
      resolveToken = 0;
      lastMemorySaveAt = 0;
      pendingSeekSeconds = 0;
      lastNotifiedKey = "";
      lyricsCache = /* @__PURE__ */ new Map();
      player = {
        audio,
        statusLabel,
        /** Start playing `list` at `index` (defaults to first). */
        playContext(list, index = 0) {
          const song = list[index];
          if (!song) return;
          setSong(song, list, index);
          if (song.mediaUri) {
            setStatus("loading");
            audio.src = localMediaUrl(song);
            pendingSeekSeconds = savedPositionSeconds(song.key);
            const resumeAt = pendingSeekSeconds;
            if (resumeAt > 0) {
              audio.addEventListener(
                "loadedmetadata",
                () => {
                  if (state.currentSong?.key === song.key && pendingSeekSeconds === resumeAt)
                    applyPendingSeek();
                },
                { once: true }
              );
            }
            audio.play().catch(() => setStatus("error", "\u65E0\u6CD5\u64AD\u653E\u672C\u5730\u6587\u4EF6\u3002"));
            registerRecent(song);
            void notifyTrackChange(song);
          } else {
            void playResolved(song, index);
          }
          publish("queue");
        },
        playSongAt(index) {
          this.playContext(state.queue, index);
        },
        async toggle() {
          if (!state.currentSong) return;
          if (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.05)
            audio.currentTime = 0;
          if (audio.paused) await audio.play().catch(() => void 0);
          else audio.pause();
        },
        seekFraction(fraction) {
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
          audio.currentTime = Math.max(0, Math.min(audio.duration, fraction * audio.duration));
        },
        seekBy(seconds) {
          if (!state.currentSong) return;
          audio.currentTime = Math.max(0, audio.currentTime + seconds);
        },
        setVolume(value) {
          const volume = clampVolume(value);
          audio.volume = volume;
          audio.muted = false;
          if (volume > 0) lastVolume = volume;
          patchSettings({ volume, muted: false });
        },
        toggleMute() {
          if (audio.muted || audio.volume === 0) {
            audio.muted = false;
            audio.volume = lastVolume > 0 ? lastVolume : 0.8;
            patchSettings({ volume: audio.volume, muted: false });
          } else {
            patchSettings({ volume: audio.volume, muted: true });
            audio.muted = true;
          }
        },
        cycleMode() {
          const index = PLAYBACK_MODES.indexOf(state.settings.playbackMode);
          patchSettings({ playbackMode: PLAYBACK_MODES[(index + 1) % PLAYBACK_MODES.length] });
        },
        modeMeta() {
          return {
            sequence: { label: "\u987A\u5E8F\u64AD\u653E", icon: "list" },
            "repeat-all": { label: "\u5217\u8868\u5FAA\u73AF", icon: "repeat" },
            shuffle: { label: "\u968F\u673A\u64AD\u653E", icon: "shuffle" },
            "repeat-one": { label: "\u5355\u66F2\u5FAA\u73AF", icon: "repeatOne" }
          }[state.settings.playbackMode];
        },
        previous() {
          if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
          }
          this.step(-1);
        },
        next() {
          this.step(1);
        },
        step(direction) {
          const { queue, queueIndex } = state;
          if (!queue.length) return;
          const mode = state.settings.playbackMode;
          if (mode === "shuffle") {
            const candidates = queue.map((_, index) => index).filter((index) => index !== queueIndex);
            const target2 = candidates[Math.floor(Math.random() * candidates.length)] ?? queueIndex;
            this.playSongAt(target2);
            return;
          }
          let target = queueIndex + direction;
          if (mode === "repeat-all") target = (target + queue.length) % queue.length;
          if (target < 0 || target >= queue.length) {
            if (state.currentSong) audio.currentTime = 0;
            return;
          }
          this.playSongAt(target);
        }
      };
      audio.addEventListener("play", () => {
        state.isPlaying = true;
        publish("player");
      });
      audio.addEventListener("pause", () => {
        state.isPlaying = false;
        rememberPlayback(true);
        publish("player");
      });
      audio.addEventListener("playing", () => setStatus("playing"));
      audio.addEventListener("pause", () => {
        if (state.playerStatus === "playing" || state.playerStatus === "loading") setStatus("paused");
      });
      audio.addEventListener("timeupdate", () => {
        rememberPlayback(false);
        syncMediaSessionPosition();
        publish("player-time");
      });
      audio.addEventListener("loadedmetadata", () => {
        applyPendingSeek();
        syncMediaSessionPosition();
        if (state.currentSong && !state.currentSong.durationMs) {
          state.queue[state.queueIndex] = {
            ...state.currentSong,
            durationMs: Math.round(audio.duration * 1e3)
          };
          state.currentSong = state.queue[state.queueIndex];
        }
        publish("player-time");
      });
      audio.addEventListener("ended", () => {
        rememberPlayback(true);
        const mode = state.settings.playbackMode;
        if (mode === "repeat-one") {
          audio.currentTime = 0;
          delete playbackMemory[state.currentSong?.key ?? ""];
          persisters.playbackMemory();
          void audio.play().catch(() => void 0);
          return;
        }
        if (state.settings.autoplayNext && state.queue.length) {
          const index = state.queueIndex;
          if (mode === "repeat-all" || index < state.queue.length - 1) {
            player.step(1);
            return;
          }
        }
        state.isPlaying = false;
        setStatus("paused");
        publish("player");
      });
      audio.addEventListener("error", () => {
        if (!state.currentSong || !audio.src) return;
        setStatus("error", "\u97F3\u9891\u52A0\u8F7D\u5931\u8D25\uFF0C\u53EF\u80FD\u662F\u7F51\u7EDC\u6216\u97F3\u6E90\u95EE\u9898\u3002");
        snackbar(state.playerError);
      });
      window.addEventListener("blur", () => {
        if (!state.settings.backgroundPlayback && state.isPlaying) audio.pause();
      });
      window.addEventListener("beforeunload", () => rememberPlayback(true));
      bindMediaSessionHandlers();
    }
  });

  // src/dialogs.js
  var dialogs_exports = {};
  __export(dialogs_exports, {
    createPlaylistDialog: () => createPlaylistDialog,
    loginDialog: () => loginDialog,
    renamePlaylistDialog: () => renamePlaylistDialog
  });
  function nextPlaylistId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  async function createPlaylistDialog() {
    const layer = await openDialog({
      eyebrow: "LOCAL PLAYLIST",
      title: "\u65B0\u5EFA\u6B4C\u5355",
      body: `<label class="field"><span>\u6B4C\u5355\u540D\u79F0</span>
      <input type="text" id="playlist-name" maxlength="60" placeholder="\u4F8B\u5982\uFF1A\u6DF1\u591C\u9A7E\u8F66" /></label>`,
      confirmLabel: "\u521B\u5EFA",
      cancelLabel: "\u53D6\u6D88"
    });
    if (!layer) return null;
    const name = String(qs("#playlist-name", layer)?.value ?? "").trim();
    if (!name) return null;
    const playlist = {
      id: nextPlaylistId(),
      name,
      songs: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    state.playlists = [...state.playlists, playlist];
    persisters.playlists();
    publish("playlists");
    snackbar(`\u5DF2\u521B\u5EFA\u6B4C\u5355\u300C${name}\u300D`);
    return playlist;
  }
  async function renamePlaylistDialog(playlistId) {
    const playlist = state.playlists.find((item) => String(item.id) === String(playlistId));
    if (!playlist) return;
    const layer = await openDialog({
      eyebrow: "LOCAL PLAYLIST",
      title: "\u91CD\u547D\u540D\u6B4C\u5355",
      body: `<label class="field"><span>\u6B4C\u5355\u540D\u79F0</span>
      <input type="text" id="playlist-name" maxlength="60" value="${playlist.name.replace(/"/g, "&quot;")}" /></label>`,
      confirmLabel: "\u4FDD\u5B58",
      cancelLabel: "\u53D6\u6D88"
    });
    if (!layer) return;
    const name = String(qs("#playlist-name", layer)?.value ?? "").trim();
    if (!name || name === playlist.name) return;
    playlist.name = name;
    playlist.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    persisters.playlists();
    publish("playlists");
  }
  function loginDialogBody() {
    return `<div class="segmented login-tabs" role="tablist" aria-label="\u767B\u5F55\u65B9\u5F0F">
      <button type="button" class="segment is-selected" data-login-tab="qr">\u626B\u7801\u767B\u5F55</button>
      <button type="button" class="segment" data-login-tab="password">\u8D26\u53F7\u5BC6\u7801</button>
    </div>
    <div class="login-panel is-selected" data-login-panel="qr">
      <div class="qr-stage" id="qr-stage"><span class="spinner"></span></div>
      <p class="qr-status" id="qr-status">\u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801\u2026</p>
      <button type="button" class="text-button" id="qr-refresh" hidden>${icon("refresh", "button-icon")}\u5237\u65B0\u4E8C\u7EF4\u7801</button>
      <p class="field-hint">${QR_HINT}</p>
    </div>
    <div class="login-panel" data-login-panel="password">
      <div class="field"><span>\u767B\u5F55\u65B9\u5F0F</span>
        <select id="login-method">
          <option value="phone">\u624B\u673A\u53F7</option>
          <option value="email">\u90AE\u7BB1</option>
        </select></div>
      <div class="field-row" id="login-identifier-row">
        <label class="field country-field" id="login-country-wrap"><span>\u56FD\u5BB6\u7801</span>
          <input type="text" id="login-country" value="86" inputmode="numeric" /></label>
        <label class="field"><span id="login-identifier-label">\u624B\u673A\u53F7</span>
          <input type="text" id="login-identifier" placeholder="\u624B\u673A\u53F7" autocomplete="username" /></label>
      </div>
      <label class="field"><span>\u5BC6\u7801</span>
        <input type="password" id="login-password" placeholder="\u5BC6\u7801" autocomplete="current-password" /></label>
      <button type="button" class="filled-button" id="login-submit">${icon("login", "button-icon")}\u767B\u5F55</button>
    </div>`;
  }
  function switchLoginTab(layer, tab) {
    qs('[data-login-tab="qr"]', layer)?.classList.toggle("is-selected", tab === "qr");
    qs('[data-login-tab="password"]', layer)?.classList.toggle("is-selected", tab === "password");
    qs('[data-login-panel="qr"]', layer)?.classList.toggle("is-selected", tab === "qr");
    qs('[data-login-panel="password"]', layer)?.classList.toggle("is-selected", tab === "password");
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function runQrFlow(layer) {
    const token = ++qrFlowToken;
    const alive = () => layer.isConnected && token === qrFlowToken;
    const stage = qs("#qr-stage", layer);
    const status = qs("#qr-status", layer);
    const refresh = qs("#qr-refresh", layer);
    if (!stage || !status) return;
    const setStatus2 = (text) => status.textContent = text;
    refresh.hidden = true;
    stage.innerHTML = '<span class="spinner"></span>';
    setStatus2("\u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801\u2026");
    const start = await qrLoginStart();
    if (!alive()) return;
    if (!start.ok) {
      stage.innerHTML = `<span class="qr-fail">${icon("error")}</span>`;
      setStatus2(start.error);
      refresh.hidden = false;
      return;
    }
    stage.innerHTML = start.value.qrDataUri ? `<img src="${escapeHtml(start.value.qrDataUri)}" alt="\u767B\u5F55\u4E8C\u7EF4\u7801"/>` : `<a class="qr-link" href="${escapeHtml(start.value.qrUrl ?? "")}" target="_blank">${escapeHtml(start.value.qrUrl ?? "")}</a>`;
    setStatus2("\u8BF7\u4F7F\u7528\u5BF9\u5E94\u97F3\u4E50 App \u626B\u4E00\u626B");
    while (alive()) {
      await sleep(2e3);
      if (!alive()) return;
      let poll;
      try {
        poll = await qrLoginCheck();
      } catch {
        continue;
      }
      if (!alive()) return;
      if (!poll.ok) {
        setStatus2(poll.error);
        refresh.hidden = false;
        return;
      }
      if (poll.value.state === "scanned") setStatus2("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4");
      else if (poll.value.state === "expired") {
        setStatus2("\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
        refresh.hidden = false;
        return;
      } else if (poll.value.state === "authorized") {
        setStatus2("\u767B\u5F55\u6210\u529F");
        await refreshAccount();
        void fetchRecommendations();
        snackbar(state.account ? `\u767B\u5F55\u6210\u529F\uFF1A${state.account.name}` : "\u767B\u5F55\u6210\u529F");
        qs("[data-dialog-confirm]", layer)?.click();
        return;
      }
    }
  }
  async function loginDialog() {
    const wire = (layer) => {
      if (!layer) {
        qrFlowToken += 1;
        return;
      }
      layer.querySelectorAll("[data-login-tab]").forEach(
        (tab) => tab.addEventListener("click", () => {
          const tabId = tab.dataset.loginTab;
          switchLoginTab(layer, tabId);
          if (tabId === "qr") void runQrFlow(layer);
          else qrFlowToken += 1;
        })
      );
      qs("#qr-refresh", layer)?.addEventListener("click", () => void runQrFlow(layer));
      qs("#login-method", layer)?.addEventListener("change", (event) => {
        const isPhone = event.target.value === "phone";
        qs("#login-country-wrap", layer).hidden = !isPhone;
        qs("#login-identifier-label", layer).textContent = isPhone ? "\u624B\u673A\u53F7" : "\u90AE\u7BB1";
        qs("#login-identifier", layer).placeholder = isPhone ? "\u624B\u673A\u53F7" : "\u90AE\u7BB1\u5730\u5740";
      });
      qs("#login-submit", layer)?.addEventListener("click", async () => {
        const method = qs("#login-method", layer)?.value ?? "phone";
        const identifier = String(qs("#login-identifier", layer)?.value ?? "").trim();
        const password = String(qs("#login-password", layer)?.value ?? "");
        const countryCode = String(qs("#login-country", layer)?.value ?? "86").trim();
        if (!identifier || !password) {
          snackbar("\u8BF7\u586B\u5199\u8D26\u53F7\u548C\u5BC6\u7801");
          return;
        }
        snackbar("\u6B63\u5728\u767B\u5F55\u2026");
        const result = await accountLogin({
          method,
          identifier,
          password,
          ...method === "phone" ? { countryCode } : {}
        });
        if (result.ok) {
          snackbar("\u767B\u5F55\u6210\u529F");
          qrFlowToken += 1;
          qs("[data-dialog-confirm]", layer)?.click();
        } else snackbar(result.error);
      });
      void runQrFlow(layer);
    };
    const layerPromise = openDialog({
      eyebrow: "PLUGIN ACCOUNT",
      title: "\u767B\u5F55\u8D26\u53F7",
      body: loginDialogBody(),
      confirmLabel: "\u5173\u95ED",
      cancelLabel: "",
      onOpen: wire
    });
    return layerPromise;
  }
  var QR_HINT, qrFlowToken;
  var init_dialogs = __esm({
    "src/dialogs.js"() {
      init_state();
      init_core_bridge();
      init_ui();
      init_icons();
      QR_HINT = "\u9700\u8981\u5DF2\u542F\u7528\u8D26\u53F7\u7C7B\u63D2\u4EF6\uFF0C\u4E14\u5176\u670D\u52A1\u5730\u5740\u6307\u5411\u53EF\u7528\u7684\u4EE3\u7406\u670D\u52A1\uFF08\u53EF\u5728\u63D2\u4EF6\u4E2D\u5FC3\u4FEE\u6539\uFF09\u3002";
      qrFlowToken = 0;
    }
  });

  // src/views-main.js
  var views_main_exports = {};
  __export(views_main_exports, {
    addToPlaylistFlow: () => addToPlaylistFlow,
    bindSongRows: () => bindSongRows,
    enqueue: () => enqueue,
    hydrateCovers: () => hydrateCovers,
    importAudioFiles: () => importAudioFiles,
    importAudioFolder: () => importAudioFolder,
    renderHome: () => renderHome,
    renderLibrary: () => renderLibrary,
    renderSearch: () => renderSearch,
    runSearch: () => runSearch,
    songRow: () => songRow,
    sourceName: () => sourceName
  });
  function sourceName(pluginId) {
    if (pluginId === "local") return "\u672C\u5730";
    return installedPlugin(pluginId)?.name ?? pluginId;
  }
  function hydrateCovers(container, list, rowAttr = "data-row-index") {
    if (!container) return;
    qsa(`[${rowAttr}]`, container).forEach((row) => {
      const song = list[Number(row.getAttribute(rowAttr))];
      if (!song || song.coverUrl) return;
      const coverEl = row.querySelector(".cover");
      if (!coverEl || coverEl.dataset.hydratedKey === song.key) return;
      coverEl.dataset.hydratedKey = song.key;
      const apply = (url) => {
        if (!url || !coverEl.isConnected) return false;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        img.onerror = () => img.remove();
        coverEl.classList.add("cover-image");
        coverEl.appendChild(img);
        return true;
      };
      coverHydrationChain = coverHydrationChain.then(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (await (async () => apply(await fetchCover(song)))()) return;
        await new Promise((resolve) => setTimeout(resolve, 16e3));
        apply(await fetchCover(song));
      });
    });
  }
  function songRow(song, list, index, options = {}) {
    const active = state.currentSong?.key === song.key;
    const badge = song.mediaUri ? "\u672C\u5730" : sourceName(song.pluginId);
    const duration = song.durationMs ? formatTime(song.durationMs / 1e3) : "";
    const actions = options.removable ? `<button type="button" class="row-action ripple" data-row-remove="${index}" aria-label="\u4ECE\u6B4C\u5355\u79FB\u9664">${icon("delete")}</button>` : `<button type="button" class="row-action ripple" data-row-queue="${index}" aria-label="\u52A0\u5165\u961F\u5217">${icon("queueAdd")}</button>
       <button type="button" class="row-action ripple" data-row-playlist="${index}" aria-label="\u52A0\u5165\u6B4C\u5355">${icon("playlistAdd")}</button>`;
    return `<div class="song-row ripple ${active ? "is-active" : ""}" role="button" tabindex="0" data-row-index="${index}">
    ${coverMarkup(song, "small")}
    <span class="song-copy">
      <span class="song-title">${escapeHtml(song.title)}</span>
      <span class="song-artist">${escapeHtml(song.artist)}${song.album ? ` \xB7 ${escapeHtml(song.album)}` : ""}</span>
    </span>
    <span class="song-badge">${escapeHtml(badge)}</span>
    <span class="song-duration">${duration}</span>
    ${actions}
  </div>`;
  }
  function bindSongRows(container, list, { onRemove } = {}) {
    const listEl = container.classList?.contains("song-list") ? container : qs(".song-list", container);
    listEl?.addEventListener("click", (event) => {
      const row = event.target instanceof Element ? event.target.closest("[data-row-index]") : null;
      if (!row) return;
      const index = Number(row.dataset.rowIndex);
      if (event.target instanceof Element && event.target.closest("[data-row-playlist]")) {
        void addToPlaylistFlow(list[index]);
        return;
      }
      if (event.target instanceof Element && event.target.closest("[data-row-queue]")) {
        enqueue(list[index]);
        return;
      }
      if (onRemove && event.target instanceof Element && event.target.closest("[data-row-remove]")) {
        onRemove(index);
        return;
      }
      player.playContext(list, index);
    });
  }
  function enqueue(song) {
    if (!song) return;
    if (state.queue.some((item) => item.key === song.key)) {
      snackbar("\u5DF2\u5728\u64AD\u653E\u961F\u5217\u4E2D");
      return;
    }
    const index = state.queueIndex >= 0 ? state.queueIndex : -1;
    state.queue.splice(index + 1, 0, song);
    publish("queue");
    snackbar(`\u5DF2\u52A0\u5165\u961F\u5217\uFF1A${song.title}`);
  }
  async function importAudioFiles() {
    const desktop = window.linmoDesktop;
    const paths = desktop?.library?.pickAudio ? await desktop.library.pickAudio() : [];
    addLocalPaths(paths);
  }
  async function importAudioFolder() {
    const desktop = window.linmoDesktop;
    const paths = desktop?.library?.pickFolder ? await desktop.library.pickFolder() : [];
    if (paths.length) snackbar(`\u6587\u4EF6\u5939\u626B\u63CF\u5B8C\u6210\uFF0C\u53D1\u73B0 ${paths.length} \u4E2A\u97F3\u9891\u6587\u4EF6`);
    addLocalPaths(paths);
  }
  function addLocalPaths(paths) {
    if (!paths?.length) return;
    const known = new Set(state.songs.map((song) => song.remoteId));
    const added = paths.filter((path) => !known.has(path)).map((path) => ({
      key: `local:${path}`,
      pluginId: "local",
      sourceId: "local",
      remoteId: path,
      title: path.split(/[\\/]/).pop().replace(/\.[^/.]+$/, ""),
      artist: "\u672C\u5730\u6587\u4EF6",
      mediaUri: path,
      format: (path.split(".").pop() ?? "").toUpperCase()
    }));
    if (!added.length) {
      snackbar("\u6240\u9009\u6587\u4EF6\u5DF2\u5728\u97F3\u4E50\u5E93\u4E2D");
      return;
    }
    state.songs = [...state.songs, ...added];
    persisters.library();
    publish("songs");
    if (!state.currentSong) player.playContext(state.songs, state.songs.indexOf(added[0]));
    snackbar(`\u5DF2\u5BFC\u5165 ${added.length} \u9996\u672C\u5730\u97F3\u4E50`);
  }
  async function runSearch(query) {
    const trimmed = query.trim();
    state.searchQuery = trimmed;
    state.searchSearched = Boolean(trimmed);
    if (!trimmed) {
      state.searchResults = [];
      state.searchFailures = [];
      state.searchLoading = false;
      publish("search");
      return;
    }
    if (!enabledSourcePlugins().length) {
      state.searchResults = [];
      state.searchFailures = ["\u6CA1\u6709\u5DF2\u542F\u7528\u7684\u97F3\u6E90\u63D2\u4EF6\uFF1A\u8BF7\u5148\u5728\u63D2\u4EF6\u4E2D\u5FC3\u5BFC\u5165\u5E76\u542F\u7528\u97F3\u6E90\u63D2\u4EF6\u3002"];
      state.searchLoading = false;
      publish("search");
      return;
    }
    state.searchLoading = true;
    publish("search");
    try {
      const { items, failures } = await searchAll(trimmed);
      state.searchResults = items;
      state.searchFailures = failures;
    } catch (error) {
      state.searchResults = [];
      state.searchFailures = [error instanceof Error ? error.message : "\u641C\u7D22\u5931\u8D25"];
    }
    state.searchLoading = false;
    publish("search");
  }
  function searchResultList() {
    if (state.searchSource === "all") return state.searchResults.map((item) => item.song);
    return state.searchResults.filter((item) => item.pluginId === state.searchSource).map((item) => item.song);
  }
  function renderSearch() {
    const root = qs("#page-search");
    if (!root) return;
    const results = searchResultList();
    const sourceIds = [...new Set(state.searchResults.map((item) => item.pluginId))];
    const chips = [
      `<button type="button" class="filter-chip ${state.searchSource === "all" ? "is-selected" : ""}" data-search-source="all">\u5168\u90E8</button>`,
      ...sourceIds.map(
        (id) => `<button type="button" class="filter-chip ${state.searchSource === id ? "is-selected" : ""}" data-search-source="${escapeHtml(id)}">${escapeHtml(sourceName(id))}</button>`
      )
    ].join("");
    let body;
    if (!state.searchSearched) {
      body = `<div class="empty-state">${icon("search", "empty-icon")}<h2>\u641C\u7D22\u5728\u7EBF\u97F3\u4E50</h2><p>\u8F93\u5165\u6B4C\u540D\u3001\u6B4C\u624B\u6216\u4E13\u8F91\uFF0C\u5DF2\u542F\u7528\u7684\u97F3\u6E90\u63D2\u4EF6\u4F1A\u540C\u65F6\u641C\u7D22\u3002</p></div>`;
    } else if (state.searchLoading) {
      body = `<div class="empty-state"><span class="spinner"></span><h2>\u6B63\u5728\u641C\u7D22\u2026</h2><p>\u5DF2\u5728\u6240\u6709\u542F\u7528\u7684\u97F3\u6E90\u4E2D\u67E5\u627E\u300C${escapeHtml(state.searchQuery)}\u300D\u3002</p></div>`;
    } else if (!results.length) {
      body = `<div class="empty-state">${icon("error", "empty-icon")}<h2>\u6CA1\u6709\u627E\u5230\u7ED3\u679C</h2><p>${state.searchFailures.length ? escapeHtml(state.searchFailures.join("\uFF1B")) : `\u6CA1\u6709\u97F3\u6E90\u8FD4\u56DE\u300C${escapeHtml(state.searchQuery)}\u300D\u7684\u7ED3\u679C\u3002`}</p></div>`;
    } else {
      body = `<div class="section-heading"><h3>\u627E\u5230 ${results.length} \u9996</h3><span class="muted">\u70B9\u51FB\u64AD\u653E\uFF0C\u961F\u5217\u5C06\u8DDF\u968F\u6B64\u7ED3\u679C\u5217\u8868</span></div><div class="song-list">${results.map((song, index) => songRow(song, results, index)).join("")}</div>`;
    }
    qs("#search-results", root).innerHTML = body;
    qs("#search-chips", root).innerHTML = chips;
    qs("#search-chips", root).hidden = !sourceIds.length;
    qsaBind(root);
    bindSongRows(root, results);
    hydrateCovers(root, results);
  }
  function qsaBind(root) {
    root.querySelectorAll("[data-search-source]").forEach(
      (chip) => chip.addEventListener("click", () => {
        state.searchSource = chip.dataset.searchSource;
        renderSearch();
      })
    );
  }
  function greeting() {
    const hour = (/* @__PURE__ */ new Date()).getHours();
    if (hour < 5) return "\u591C\u6DF1\u4E86";
    if (hour < 11) return "\u65E9\u4E0A\u597D";
    if (hour < 14) return "\u4E2D\u5348\u597D";
    if (hour < 18) return "\u4E0B\u5348\u597D";
    return "\u665A\u4E0A\u597D";
  }
  function renderHome() {
    const root = qs("#page-home");
    if (!root) return;
    const stats = [
      `${state.songs.length} \u9996\u672C\u5730\u97F3\u4E50`,
      `${state.playlists.length} \u4E2A\u672C\u5730\u6B4C\u5355`,
      `${state.plugins.filter((plugin) => plugin.enabled).length} \u4E2A\u542F\u7528\u63D2\u4EF6`
    ].join(" \xB7 ");
    const quick = `<div class="quick-actions">
    <button type="button" class="tonal-button ripple" id="home-import">${icon("add", "button-icon")}\u5BFC\u5165\u97F3\u4E50</button>
    <button type="button" class="tonal-button ripple" id="home-folder">${icon("folder", "button-icon")}\u5BFC\u5165\u6587\u4EF6\u5939</button>
    <button type="button" class="tonal-button ripple" id="home-shuffle" ${state.songs.length ? "" : "disabled"}>${icon("shuffle", "button-icon")}\u968F\u673A\u64AD\u653E\u5168\u90E8</button>
  </div>`;
    const recents = state.recents.length ? `<div class="section-heading"><h3>\u6700\u8FD1\u64AD\u653E</h3></div><div class="recent-grid">${state.recents.slice(0, 8).map(
      (song, index) => `<div class="recent-card ripple" role="button" tabindex="0" data-recent-index="${index}">${coverMarkup(
        song
      )}<span class="recent-title">${escapeHtml(song.title)}</span><span class="recent-artist">${escapeHtml(
        song.artist
      )}</span></div>`
    ).join("")}</div>` : "";
    const recommendations = state.recommendations.length ? `<div class="section-heading"><h3>\u6BCF\u65E5\u63A8\u8350</h3><span class="muted">\u6765\u81EA\u7F51\u6613\u4E91\u8D26\u53F7</span></div><div class="song-list" id="home-recommend-list">${state.recommendations.slice(0, 10).map((song, index) => songRow(song, state.recommendations, index)).join("")}</div>` : "";
    const library = state.songs.length ? `<div class="section-heading"><h3>\u672C\u5730\u97F3\u4E50</h3><button type="button" class="text-button" data-nav-library>\u67E5\u770B\u5168\u90E8</button></div><div class="song-list" id="home-local-list">${state.songs.slice(0, 6).map((song, index) => songRow(song, state.songs, index)).join("")}</div>` : `<div class="empty-state">${icon("music", "empty-icon")}<h2>\u5F00\u59CB\u4F7F\u7528 Linmo Player</h2><p>\u5BFC\u5165\u672C\u5730\u97F3\u9891\u6587\u4EF6\uFF0C\u6216\u542F\u7528\u97F3\u6E90\u63D2\u4EF6\u540E\u5728\u7EBF\u641C\u7D22\u64AD\u653E\u3002</p></div>`;
    root.innerHTML = `<div class="hero">
      <div class="hero-copy">
        <div class="eyebrow">LINMO PLAYER</div>
        <h2>${greeting()}</h2>
        <p>${stats}</p>
        ${quick}
      </div>
      <div class="hero-orb" aria-hidden="true"><span></span></div>
    </div>
    ${recents}${recommendations}${library}`;
    qs("#home-import", root)?.addEventListener("click", () => void importAudioFiles());
    qs("#home-folder", root)?.addEventListener("click", () => void importAudioFolder());
    qs("#home-shuffle", root)?.addEventListener("click", () => {
      if (!state.songs.length) return;
      const shuffled = [...state.songs].sort(() => Math.random() - 0.5);
      player.playContext(shuffled, 0);
    });
    root.querySelector("[data-nav-library]")?.addEventListener(
      "click",
      () => window.dispatchEvent(new CustomEvent("linmo:navigate", { detail: "library" }))
    );
    root.querySelectorAll("[data-recent-index]").forEach(
      (card) => card.addEventListener("click", () => {
        const index = Number(card.dataset.recentIndex);
        player.playContext(state.recents.slice(0, 8), index);
      })
    );
    const recommendList = qs("#home-recommend-list", root);
    if (recommendList) {
      bindSongRows(recommendList, state.recommendations);
      hydrateCovers(recommendList, state.recommendations);
    }
    const localList = qs("#home-local-list", root);
    if (localList) {
      bindSongRows(localList, state.songs);
      hydrateCovers(localList, state.songs);
    }
    hydrateCovers(root, state.recents.slice(0, 8), "data-recent-index");
  }
  function renderLibrary() {
    const root = qs("#page-library");
    if (!root) return;
    if (state.libraryPlaylistKey) {
      renderPlaylistDetail(root);
      return;
    }
    const tabs = LIBRARY_TABS.map(
      ([id, label]) => `<button type="button" class="filter-chip ${state.libraryTab === id ? "is-selected" : ""}" data-library-tab="${id}">${label}</button>`
    ).join("");
    let body = "";
    if (state.libraryTab === "songs") body = renderSongsTab();
    else if (state.libraryTab === "albums") body = renderGroupTab("album", "\u672A\u77E5\u4E13\u8F91");
    else if (state.libraryTab === "artists") body = renderGroupTab("artist", "\u672A\u77E5\u6B4C\u624B");
    else body = renderPlaylistsTab();
    root.innerHTML = `<div class="section-heading"><h3>\u97F3\u4E50\u5E93</h3><div class="heading-actions">
      <button type="button" class="text-button" id="library-import">${icon("add", "button-icon")}\u5BFC\u5165</button>
      <button type="button" class="text-button" id="library-folder">${icon("folder", "button-icon")}\u6587\u4EF6\u5939</button>
    </div></div>
    <div class="filter-row">${tabs}</div>${body}`;
    qs("#library-import", root)?.addEventListener("click", () => void importAudioFiles());
    qs("#library-folder", root)?.addEventListener("click", () => void importAudioFolder());
    root.querySelectorAll("[data-library-tab]").forEach(
      (chip) => chip.addEventListener("click", () => {
        state.libraryTab = chip.dataset.libraryTab;
        state.libraryPlaylistKey = null;
        renderLibrary();
      })
    );
    if (state.libraryTab === "songs") {
      bindSongRows(root, state.songs);
      hydrateCovers(root, state.songs);
    }
    bindLibraryGroups(root);
    bindPlaylistsTab(root);
  }
  function renderSongsTab() {
    if (!state.songs.length)
      return `<div class="empty-state">${icon("music", "empty-icon")}<h2>\u97F3\u4E50\u5E93\u8FD8\u662F\u7A7A\u7684</h2><p>\u5BFC\u5165\u672C\u5730\u97F3\u9891\u6587\u4EF6\u540E\u5C06\u5728\u6B64\u663E\u793A\uFF0C\u652F\u6301 MP3\u3001FLAC\u3001M4A \u7B49\u683C\u5F0F\u3002</p></div>`;
    const formats = [...new Set(state.songs.map((song) => song.format).filter(Boolean))].join(" \xB7 ");
    return `<div class="library-stats"><div class="library-stat"><strong>${state.songs.length}</strong><span>\u66F2\u76EE</span></div><div class="library-stat"><strong>${formats || "\u2014"}</strong><span>\u683C\u5F0F</span></div></div><div class="song-list">${state.songs.map((song, index) => songRow(song, state.songs, index)).join("")}</div>`;
  }
  function renderGroupTab(field, fallbackLabel) {
    if (!state.songs.length)
      return `<div class="empty-state">${icon("library", "empty-icon")}<h2>\u6682\u65E0\u5185\u5BB9</h2><p>\u5BFC\u5165\u672C\u5730\u97F3\u4E50\u540E\u5373\u53EF\u6309${field === "album" ? "\u4E13\u8F91" : "\u6B4C\u624B"}\u6D4F\u89C8\u3002</p></div>`;
    const groups = /* @__PURE__ */ new Map();
    state.songs.forEach((song) => {
      const label = (field === "album" ? song.album : song.artist) || fallbackLabel;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(song);
    });
    return [...groups.entries()].map(
      ([label, songs]) => `<section class="library-group"><div class="library-group-heading"><h4>${escapeHtml(label)}</h4><span>${songs.length} \u9996</span></div><div class="song-list collapsed">${songs.slice(0, 4).map((song, index) => songRow(song, songs, index)).join("")}</div>${songs.length > 4 ? `<button type="button" class="text-button group-expand" data-group-label="${escapeHtml(label)}">\u5C55\u5F00\u5168\u90E8 ${songs.length} \u9996</button>` : ""}</section>`
    ).join("");
  }
  function bindLibraryGroups(root) {
    const expanded = /* @__PURE__ */ new Set();
    const field = state.libraryTab === "albums" ? "album" : "artist";
    const fallback = field === "album" ? "\u672A\u77E5\u4E13\u8F91" : "\u672A\u77E5\u6B4C\u624B";
    root.querySelectorAll(".library-group").forEach((group) => {
      const label = group.querySelector("h4")?.textContent ?? "";
      const songs = state.songs.filter(
        (song) => ((field === "album" ? song.album : song.artist) || fallback) === label
      );
      const list = qs(".song-list", group);
      if (!list) return;
      bindSongRows(list, songs);
      hydrateCovers(list, songs);
      const button = qs(".group-expand", group);
      if (!button) return;
      button.addEventListener("click", () => {
        if (expanded.has(label)) {
          expanded.delete(label);
          list.innerHTML = songs.slice(0, 4).map((song, index) => songRow(song, songs, index)).join("");
          button.textContent = `\u5C55\u5F00\u5168\u90E8 ${songs.length} \u9996`;
        } else {
          expanded.add(label);
          list.innerHTML = songs.map((song, index) => songRow(song, songs, index)).join("");
          button.textContent = "\u6536\u8D77";
        }
        bindSongRows(list, songs);
        hydrateCovers(list, songs);
      });
    });
  }
  function renderPlaylistsTab() {
    const localCards = state.playlists.map(
      (playlist) => `<div class="playlist-card ripple" role="button" tabindex="0" data-playlist-open="local:${playlist.id}">
        <span class="playlist-cover">${icon("music")}</span>
        <span class="playlist-copy"><strong>${escapeHtml(playlist.name)}</strong><span>${playlist.songs.length} \u9996 \xB7 \u672C\u5730\u6B4C\u5355</span></span>
      </div>`
    ).join("");
    const remoteCards = state.remotePlaylists.map(
      (playlist) => `<div class="playlist-card ripple" role="button" tabindex="0" data-playlist-open="remote:${escapeHtml(playlist.key)}">
        ${playlist.coverUrl ? `<span class="playlist-cover playlist-cover-image"><img src="${escapeHtml(playlist.coverUrl)}" alt="" loading="lazy"/></span>` : `<span class="playlist-cover">${icon("music")}</span>`}
        <span class="playlist-copy"><strong>${escapeHtml(playlist.title)}</strong><span>${playlist.count ?? playlist.songs.length ?? 0} \u9996 \xB7 ${escapeHtml(sourceName(playlist.pluginId))}</span></span>
      </div>`
    ).join("");
    const accountHint = !enabledSourcePlugins().some(
      (plugin) => plugin.capabilities.includes("account")
    ) ? `<div class="inline-note">\u767B\u5F55\u7F51\u6613\u4E91\u8D26\u53F7\u63D2\u4EF6\u540E\uFF0C\u53EF\u540C\u6B65\u8FDC\u7A0B\u6B4C\u5355\u5230\u6B64\u5904\u3002</div>` : "";
    return `<div class="section-heading"><h4 class="subheading">\u672C\u5730\u6B4C\u5355</h4><button type="button" class="text-button" id="playlist-create">${icon("add", "button-icon")}\u65B0\u5EFA\u6B4C\u5355</button></div>
    ${localCards ? `<div class="playlist-grid">${localCards}</div>` : `<div class="inline-note">\u8FD8\u6CA1\u6709\u672C\u5730\u6B4C\u5355\uFF0C\u70B9\u51FB\u300C\u65B0\u5EFA\u6B4C\u5355\u300D\u521B\u5EFA\u4E00\u4E2A\u3002</div>`}
    <div class="section-heading"><h4 class="subheading">\u8FDC\u7A0B\u6B4C\u5355</h4><button type="button" class="text-button" id="playlist-sync">${icon("sync", "button-icon")}\u540C\u6B65\u6B4C\u5355</button></div>
    ${accountHint}
    ${remoteCards ? `<div class="playlist-grid">${remoteCards}</div>` : ""}`;
  }
  function bindPlaylistsTab(root) {
    qs("#playlist-create", root)?.addEventListener(
      "click",
      () => window.dispatchEvent(new CustomEvent("linmo:create-playlist"))
    );
    qs("#playlist-sync", root)?.addEventListener("click", async () => {
      const { syncRemotePlaylists: syncRemotePlaylists2 } = await Promise.resolve().then(() => (init_core_bridge(), core_bridge_exports));
      snackbar("\u6B63\u5728\u540C\u6B65\u8FDC\u7A0B\u6B4C\u5355\u2026");
      const result = await syncRemotePlaylists2();
      if (result.ok) snackbar(`\u5DF2\u540C\u6B65 ${result.count} \u4E2A\u8FDC\u7A0B\u6B4C\u5355`);
      else snackbar(result.error);
    });
    root.querySelectorAll("[data-playlist-open]").forEach(
      (card) => card.addEventListener("click", () => {
        state.libraryPlaylistKey = card.dataset.playlistOpen;
        renderLibrary();
      })
    );
  }
  function renderPlaylistDetail(root) {
    const [scope, id] = state.libraryPlaylistKey.split(/:(.+)/);
    const playlist = scope === "local" ? state.playlists.find((item) => String(item.id) === id) : state.remotePlaylists.find((item) => item.key === id);
    if (!playlist) {
      state.libraryPlaylistKey = null;
      renderLibrary();
      return;
    }
    const isLocal = scope === "local";
    const songs = playlist.songs ?? [];
    root.innerHTML = `<div class="playlist-hero">
      <span class="playlist-cover large">${icon("music")}</span>
      <div class="playlist-hero-copy">
        <div class="eyebrow">${isLocal ? "\u672C\u5730\u6B4C\u5355" : `\u8FDC\u7A0B\u6B4C\u5355 \xB7 ${escapeHtml(sourceName(playlist.pluginId))}`}</div>
        <h2>${escapeHtml(playlist.title)}</h2>
        <p>${songs.length} \u9996</p>
        <div class="heading-actions">
          <button type="button" class="filled-button ripple" id="playlist-play" ${songs.length ? "" : "disabled"}>${icon("play", "button-icon")}\u64AD\u653E\u5168\u90E8</button>
          ${isLocal ? `<button type="button" class="tonal-button ripple" id="playlist-rename">${icon("edit", "button-icon")}\u91CD\u547D\u540D</button>` : ""}
          ${isLocal ? `<button type="button" class="text-button danger-text" id="playlist-delete">${icon("delete", "button-icon")}\u5220\u9664\u6B4C\u5355</button>` : ""}
        </div>
      </div>
    </div>
    ${songs.length ? `<div class="song-list">${songs.map((song, index) => songRow(song, songs, index, { removable: isLocal })).join("")}</div>` : `<div class="empty-state">${icon("playlistAdd", "empty-icon")}<h2>\u6B4C\u5355\u8FD8\u662F\u7A7A\u7684</h2><p>\u5728\u4EFB\u610F\u6B4C\u66F2\u4E0A\u70B9\u51FB\u300C\u52A0\u5165\u6B4C\u5355\u300D\uFF0C\u5373\u53EF\u628A\u5728\u7EBF\u6216\u672C\u5730\u6B4C\u66F2\u6536\u8FDB\u8FD9\u91CC\u3002</p></div>`}`;
    qs("#playlist-play", root)?.addEventListener("click", () => player.playContext(songs, 0));
    qs("#playlist-rename", root)?.addEventListener(
      "click",
      () => window.dispatchEvent(new CustomEvent("linmo:rename-playlist", { detail: playlist.id }))
    );
    qs("#playlist-delete", root)?.addEventListener("click", async () => {
      const { confirmDialog: confirmDialog2 } = await Promise.resolve().then(() => (init_ui(), ui_exports));
      const confirmed = await confirmDialog2(
        "\u5220\u9664\u6B4C\u5355",
        `\u786E\u5B9A\u5220\u9664\u6B4C\u5355\u300C${escapeHtml(playlist.name)}\u300D\uFF1F\u6B4C\u66F2\u672C\u8EAB\u4E0D\u4F1A\u53D7\u5F71\u54CD\u3002`
      );
      if (!confirmed) return;
      state.playlists = state.playlists.filter((item) => String(item.id) !== String(playlist.id));
      persisters.playlists();
      state.libraryPlaylistKey = null;
      publish("playlists");
    });
    hydrateCovers(root, songs);
    bindSongRows(root, songs, {
      onRemove: (index) => {
        playlist.songs.splice(index, 1);
        persisters.playlists();
        publish("playlists");
      }
    });
  }
  async function addToPlaylistFlow(song) {
    if (!song) return;
    const options = state.playlists.map(
      (playlist) => `<button type="button" class="list-option" data-pick="${playlist.id}">${icon("music", "button-icon")}<span>${escapeHtml(playlist.name)}</span><small>${playlist.songs.length} \u9996</small></button>`
    ).join("");
    const picked = await openDialog({
      title: "\u52A0\u5165\u6B4C\u5355",
      body: `<div class="option-list">
        <button type="button" class="list-option accent" data-pick="__new__">${icon("add", "button-icon")}<span>\u65B0\u5EFA\u6B4C\u5355</span></button>
        ${options}
      </div>`,
      confirmLabel: "\u5173\u95ED",
      cancelLabel: "",
      pickSelector: "[data-pick]"
    });
    if (!picked) return;
    const value = picked.dataset.pick;
    if (value === "__new__") {
      const { createPlaylistDialog: createPlaylistDialog2 } = await Promise.resolve().then(() => (init_dialogs(), dialogs_exports));
      const playlist = await createPlaylistDialog2();
      if (playlist) appendToPlaylist(playlist, song);
    } else {
      const playlist = state.playlists.find((item) => String(item.id) === value);
      if (playlist) appendToPlaylist(playlist, song);
    }
  }
  function appendToPlaylist(playlist, song) {
    if (playlist.songs.some((item) => item.key === song.key)) {
      snackbar("\u6B4C\u66F2\u5DF2\u5728\u6B4C\u5355\u4E2D");
      return;
    }
    playlist.songs.push(song);
    playlist.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    persisters.playlists();
    publish("playlists");
    snackbar(`\u5DF2\u52A0\u5165\u300C${playlist.name}\u300D`);
  }
  var coverHydrationChain, LIBRARY_TABS;
  var init_views_main = __esm({
    "src/views-main.js"() {
      init_state();
      init_player();
      init_core_bridge();
      init_icons();
      init_ui();
      coverHydrationChain = Promise.resolve();
      LIBRARY_TABS = [
        ["songs", "\u6B4C\u66F2"],
        ["albums", "\u4E13\u8F91"],
        ["artists", "\u6B4C\u624B"],
        ["playlists", "\u6B4C\u5355"]
      ];
    }
  });

  // src/onboarding.js
  var onboarding_exports = {};
  __export(onboarding_exports, {
    initOnboarding: () => initOnboarding,
    onboardingDone: () => onboardingDone,
    startOnboarding: () => startOnboarding
  });
  function onboardingDone() {
    return state.settings.onboardingDone === true;
  }
  function startOnboarding(force = false) {
    if (onboardingDone() && !force) return;
    step = 0;
    render();
  }
  function render() {
    const root = qs("#onboarding");
    if (!root) return;
    root.hidden = false;
    root.classList.add("is-open");
    const current = steps[step];
    root.innerHTML = `<div class="onboarding-card" role="dialog" aria-modal="true" aria-label="\u65B0\u624B\u5F15\u5BFC">
      <div class="onboarding-icon">${icon(current.icon)}</div>
      <div class="eyebrow">${step + 1} / ${steps.length}</div>
      <h2>${current.title}</h2>
      <p>${current.body}</p>
      <div class="onboarding-dots">${steps.map(
      (_, index) => `<span class="onboarding-dot ${index === step ? "is-active" : ""}"></span>`
    ).join("")}</div>
      <div class="onboarding-actions">
        <button type="button" class="filled-button ripple" id="onboarding-primary">${current.action} ${icon(step === steps.length - 1 ? "check" : "arrowRight", "button-icon")}</button>
        <button type="button" class="text-button" id="onboarding-skip">\u8DF3\u8FC7</button>
      </div>
    </div>`;
    qs("#onboarding-primary", root).addEventListener("click", async (event) => {
      const button = event.currentTarget;
      if (step === 0) {
        const { importAudioFiles: importAudioFiles2 } = await Promise.resolve().then(() => (init_views_main(), views_main_exports));
        button.disabled = true;
        await importAudioFiles2();
        button.disabled = false;
      }
      if (step === steps.length - 1) finish();
      else {
        step += 1;
        render();
      }
    });
    qs("#onboarding-skip", root).addEventListener("click", finish);
  }
  function finish() {
    patchSettings({ onboardingDone: true });
    const root = qs("#onboarding");
    if (!root) return;
    root.classList.remove("is-open");
    window.setTimeout(() => {
      root.hidden = true;
      root.innerHTML = "";
    }, 260);
  }
  function initOnboarding() {
    if (overlayBound) return;
    overlayBound = true;
    startOnboarding();
  }
  var steps, step, overlayBound;
  var init_onboarding = __esm({
    "src/onboarding.js"() {
      init_state();
      init_icons();
      init_ui();
      steps = [
        {
          icon: "music",
          title: "\u5BFC\u5165\u672C\u5730\u97F3\u4E50",
          body: "\u9009\u62E9\u7535\u8111\u4E2D\u7684\u97F3\u9891\u6587\u4EF6\u6216\u6574\u4E2A\u6587\u4EF6\u5939\uFF0C\u652F\u6301 MP3\u3001FLAC\u3001M4A\u3001WAV \u7B49\u683C\u5F0F\u3002",
          action: "\u5BFC\u5165\u97F3\u4E50"
        },
        {
          icon: "play",
          title: "\u64AD\u653E\u4E0E\u63A7\u5236",
          body: "\u70B9\u51FB\u4EFB\u610F\u6B4C\u66F2\u5F00\u59CB\u64AD\u653E\uFF1B\u5E95\u90E8\u64AD\u653E\u5668\u53EF\u4EE5\u6682\u505C\u3001\u5207\u6362\u3001\u62D6\u52A8\u8FDB\u5EA6\u548C\u8C03\u8282\u97F3\u91CF\u3002",
          action: "\u4E0B\u4E00\u6B65"
        },
        {
          icon: "plugins",
          title: "\u7528\u63D2\u4EF6\u6269\u5C55\u64AD\u653E\u5668",
          body: "\u5728\u63D2\u4EF6\u4E2D\u5FC3\u5BFC\u5165\u58F0\u660E\u5F0F\u63D2\u4EF6 ZIP\uFF1A\u63A5\u5165\u5728\u7EBF\u97F3\u6E90\u3001\u767B\u5F55\u7F51\u6613\u4E91\u3001\u66F4\u6362\u4E3B\u9898\u4E0E\u5B57\u4F53\u3002",
          action: "\u5F00\u59CB\u4F7F\u7528"
        }
      ];
      step = 0;
      overlayBound = false;
    }
  });

  // src/app.js
  init_net();
  init_src();
  init_state();
  init_core_bridge();
  init_theme();
  init_player();
  init_views_main();

  // src/views-manage.js
  init_state();
  init_core_bridge();
  init_theme();
  init_icons();
  init_ui();
  var KIND_LABELS = { "music-source": "\u97F3\u6E90", theme: "\u4E3B\u9898", font: "\u5B57\u4F53" };
  var KIND_ICONS = { "music-source": "plugins", theme: "palette", font: "font" };
  var CAPABILITY_LABELS = {
    search: "\u641C\u7D22",
    playback: "\u64AD\u653E",
    lyrics: "\u6B4C\u8BCD",
    playlists: "\u6B4C\u5355",
    account: "\u8D26\u53F7",
    recommendations: "\u63A8\u8350"
  };
  function renderPlugins() {
    const root = qs("#page-plugins");
    if (!root) return;
    const plugins = state.plugins;
    const cards = plugins.map((plugin) => {
      const caps = plugin.capabilities.map(
        (capability) => `<span class="cap-chip">${CAPABILITY_LABELS[capability] ?? capability}</span>`
      ).join("");
      const kindBadge = `<span class="kind-badge kind-${plugin.kind}">${KIND_LABELS[plugin.kind] ?? plugin.kind}</span>${plugin.builtin ? '<span class="kind-badge kind-builtin">\u5185\u7F6E</span>' : ""}`;
      const defaultBaseUrl = plugin.provider === "netease-api" ? "http://127.0.0.1:3000" : "https://music-api.gdstudio.xyz/api.php";
      const configNote = plugin.kind === "music-source" ? `<div class="plugin-config-row">
              <input type="text" data-plugin-baseurl-input="${escapeHtml(plugin.id)}" value="${escapeHtml(
        typeof plugin.config?.baseUrl === "string" ? plugin.config.baseUrl : defaultBaseUrl
      )}" aria-label="\u4EE3\u7406\u670D\u52A1\u5730\u5740" spellcheck="false"/>
              <button type="button" class="text-button" data-plugin-baseurl-save="${escapeHtml(plugin.id)}">\u4FDD\u5B58\u5730\u5740</button>
            </div>` : "";
      const errorNote = plugin.status === "error" && plugin.lastError ? `<span class="plugin-error">${icon("error", "row-icon")}${escapeHtml(plugin.lastError)}</span>` : "";
      let kindAction = "";
      if (plugin.kind === "theme")
        kindAction = state.settings.themeId === plugin.id ? `<button type="button" class="tonal-button ripple small" data-plugin-theme="${escapeHtml(plugin.id)}" disabled>${icon("check", "button-icon")}\u4F7F\u7528\u4E2D</button>` : `<button type="button" class="tonal-button ripple small" data-plugin-theme="${escapeHtml(plugin.id)}">${icon("palette", "button-icon")}\u5E94\u7528\u4E3B\u9898</button>`;
      else if (plugin.kind === "font")
        kindAction = state.settings.fontId === plugin.id ? `<button type="button" class="tonal-button ripple small" data-plugin-font="${escapeHtml(plugin.id)}" disabled>${icon("check", "button-icon")}\u4F7F\u7528\u4E2D</button>` : `<button type="button" class="tonal-button ripple small" data-plugin-font="${escapeHtml(plugin.id)}">${icon("font", "button-icon")}\u5E94\u7528\u5B57\u4F53</button>`;
      return `<article class="plugin-card">
        <div class="plugin-head">
          <span class="plugin-icon">${icon(KIND_ICONS[plugin.kind] ?? "plugins")}</span>
          <div class="plugin-title">
            <strong>${escapeHtml(plugin.name)}</strong>
            <small>v${escapeHtml(plugin.version)} \xB7 ${kindBadge}</small>
          </div>
          <label class="m3-switch" aria-label="${plugin.enabled ? "\u505C\u7528\u63D2\u4EF6" : "\u542F\u7528\u63D2\u4EF6"}">
            <input type="checkbox" data-plugin-toggle="${escapeHtml(plugin.id)}" ${plugin.enabled ? "checked" : ""}/>
            <span class="track"><span class="thumb"></span></span>
          </label>
        </div>
        <p class="plugin-description">${escapeHtml(plugin.description || "\u672A\u63D0\u4F9B\u63D2\u4EF6\u8BF4\u660E\u3002")}</p>
        <div class="plugin-caps">${caps}</div>
        ${configNote}${errorNote}
        <div class="plugin-actions">
          ${kindAction}
          ${plugin.builtin ? "" : `<button type="button" class="text-button danger-text" data-plugin-uninstall="${escapeHtml(plugin.id)}">${icon("delete", "button-icon")}\u5378\u8F7D</button>`}
        </div>
      </article>`;
    }).join("");
    root.innerHTML = `<div class="section-heading"><h3>\u63D2\u4EF6\u4E2D\u5FC3</h3>
      <button type="button" class="filled-button ripple" id="plugin-import">${icon("download", "button-icon")}\u5BFC\u5165\u63D2\u4EF6 ZIP</button>
    </div>
    <div class="inline-note">\u63D2\u4EF6\u662F\u5305\u542B plugin.json \u7684\u58F0\u660E\u5F0F ZIP \u5305\uFF1A\u97F3\u6E90\u63D2\u4EF6\u6620\u5C04\u5230\u5BBF\u4E3B\u5185\u7F6E\u5F15\u64CE\uFF0C\u4E3B\u9898\u4E0E\u5B57\u4F53\u63D2\u4EF6\u53EA\u643A\u5E26\u6570\u636E\u6587\u4EF6\uFF0C\u5BBF\u4E3B\u4E0D\u4F1A\u6267\u884C\u5305\u5185\u4EE3\u7801\u3002</div>
    ${plugins.length ? `<div class="plugin-grid">${cards}</div>` : `<div class="empty-state">${icon("plugins", "empty-icon")}<h2>\u8FD8\u6CA1\u6709\u5B89\u88C5\u63D2\u4EF6</h2><p>\u5BFC\u5165\u63D2\u4EF6 ZIP \u540E\uFF0C\u53EF\u5728\u6B64\u542F\u7528\u97F3\u6E90\u3001\u5E94\u7528\u4E3B\u9898\u4E0E\u5B57\u4F53\u3002\u6253\u5305\u547D\u4EE4\u89C1\u9879\u76EE README\u3002</p></div>`}`;
    qs("#plugin-import", root)?.addEventListener("click", () => qs("#plugin-files")?.click());
    root.querySelectorAll("[data-plugin-toggle]").forEach(
      (input) => input.addEventListener("change", () => {
        void togglePlugin(input.dataset.pluginToggle, input.checked);
      })
    );
    root.querySelectorAll("[data-plugin-theme]").forEach(
      (button) => button.addEventListener("click", () => {
        void applyThemePlugin(button.dataset.pluginTheme);
      })
    );
    root.querySelectorAll("[data-plugin-font]").forEach(
      (button) => button.addEventListener("click", () => {
        void applyFontPluginSelection(button.dataset.pluginFont);
      })
    );
    root.querySelectorAll("[data-plugin-baseurl-save]").forEach(
      (button) => button.addEventListener("click", () => {
        const pluginId = button.dataset.pluginBaseurlSave;
        const input = root.querySelector(`[data-plugin-baseurl-input="${CSS.escape(pluginId)}"]`);
        if (input) void saveBaseUrl(pluginId, input.value);
      })
    );
    root.querySelectorAll("[data-plugin-uninstall]").forEach(
      (button) => button.addEventListener("click", () => {
        void uninstallFlow(button.dataset.pluginUninstall);
      })
    );
  }
  async function saveBaseUrl(pluginId, value) {
    const meta = state.plugins.find((plugin) => plugin.id === pluginId);
    if (!meta) return;
    const url = String(value ?? "").trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(url)) {
      snackbar("\u670D\u52A1\u5730\u5740\u5FC5\u987B\u662F http(s) \u5730\u5740\u3002");
      return;
    }
    if (url === meta.config?.baseUrl) return;
    const wasEnabled = meta.enabled;
    if (wasEnabled) await disablePlugin(pluginId);
    meta.config = { ...meta.config ?? {}, baseUrl: url };
    persisters.plugins();
    if (wasEnabled) await enablePlugin(pluginId);
    publish("plugins");
    snackbar(`\u300C${meta.name}\u300D\u670D\u52A1\u5730\u5740\u5DF2\u66F4\u65B0`);
  }
  async function togglePlugin(pluginId, nextEnabled) {
    const meta = state.plugins.find((plugin) => plugin.id === pluginId);
    if (!meta) return;
    if (nextEnabled) {
      const result = await enablePlugin(pluginId);
      if (!result.ok) {
        snackbar(`\u542F\u7528\u5931\u8D25\uFF1A${result.error}`);
        publish("plugins");
        return;
      }
      if (meta.kind === "music-source") snackbar(`\u5DF2\u542F\u7528\u300C${meta.name}\u300D`);
    } else {
      await disablePlugin(pluginId);
      if (state.settings.themeId === pluginId || state.settings.fontId === pluginId) {
        const { applyAppearance: applyAppearance2 } = await Promise.resolve().then(() => (init_theme(), theme_exports));
        patchSettings({
          ...state.settings.themeId === pluginId ? { themeId: "" } : {},
          ...state.settings.fontId === pluginId ? { fontId: "" } : {}
        });
        await applyAppearance2();
      }
    }
    publish("plugins");
    publish("account");
  }
  async function uninstallFlow(pluginId) {
    const meta = state.plugins.find((plugin) => plugin.id === pluginId);
    if (!meta) return;
    const confirmed = await confirmDialog(
      "\u5378\u8F7D\u63D2\u4EF6",
      `\u786E\u5B9A\u5378\u8F7D\u300C${escapeHtml(meta.name)}\u300D\uFF1F\u63D2\u4EF6\u7684\u672C\u5730\u6570\u636E\u4E0E\u6587\u4EF6\u5C06\u88AB\u5220\u9664\u3002`,
      "\u5378\u8F7D"
    );
    if (!confirmed) return;
    await uninstallPlugin(pluginId);
    snackbar(`\u5DF2\u5378\u8F7D\u300C${meta.name}\u300D`);
  }
  var MODE_OPTIONS = [
    ["light", "\u6D45\u8272", "sun"],
    ["dark", "\u6DF1\u8272", "moon"]
  ];
  function renderSettings() {
    const root = qs("#page-settings");
    if (!root) return;
    const { settings } = state;
    const themeOptions = [
      `<option value="" ${settings.themeId ? "" : "selected"}>\u9ED8\u8BA4\uFF08\u8DDF\u968F\u660E\u6697\u6A21\u5F0F\uFF09</option>`,
      ...state.plugins.filter((plugin) => plugin.kind === "theme").map(
        (plugin) => `<option value="${escapeHtml(plugin.id)}" ${settings.themeId === plugin.id ? "selected" : ""}>${escapeHtml(plugin.name)}</option>`
      )
    ].join("");
    const fontOptions = [
      `<option value="" ${settings.fontId ? "" : "selected"}>\u7CFB\u7EDF\u9ED8\u8BA4</option>`,
      ...state.plugins.filter((plugin) => plugin.kind === "font").map(
        (plugin) => `<option value="${escapeHtml(plugin.id)}" ${settings.fontId === plugin.id ? "selected" : ""}>${escapeHtml(plugin.font?.displayName ?? plugin.name)}</option>`
      )
    ].join("");
    root.innerHTML = `<div class="section-heading"><h3>\u8BBE\u7F6E</h3></div>
    <section class="settings-group">
      <h4>${icon("palette", "row-icon")}\u5916\u89C2</h4>
      <div class="settings-option">
        <span><strong>\u660E\u6697\u6A21\u5F0F</strong><p>\u4E3B\u9898\u63D2\u4EF6\u4F1A\u81EA\u5E26\u660E\u6697\u6A21\u5F0F\uFF0C\u5207\u6362\u540E\u56DE\u5230\u9ED8\u8BA4\u914D\u8272\u3002</p></span>
        <div class="segmented" role="radiogroup" aria-label="\u660E\u6697\u6A21\u5F0F">
          ${MODE_OPTIONS.map(
      ([value, label, iconKey]) => `<button type="button" class="segment ${settings.mode === value ? "is-selected" : ""}" data-mode="${value}">${icon(iconKey, "button-icon")}${label}</button>`
    ).join("")}
        </div>
      </div>
      <div class="settings-option"><span><strong>\u4E3B\u9898\u63D2\u4EF6</strong><p>\u5E94\u7528\u63D2\u4EF6\u4E2D\u5FC3\u5BFC\u5165\u7684\u4E3B\u9898\u5305\u3002</p></span>
        <select class="settings-select" id="setting-theme" aria-label="\u4E3B\u9898\u63D2\u4EF6">${themeOptions}</select></div>
      <div class="settings-option"><span><strong>\u5B57\u4F53\u63D2\u4EF6</strong><p>\u4F7F\u7528\u5B57\u4F53\u63D2\u4EF6\u63D0\u4F9B\u7684\u5B57\u4F53\u6E32\u67D3\u754C\u9762\u3002</p></span>
        <select class="settings-select" id="setting-font" aria-label="\u5B57\u4F53\u63D2\u4EF6">${fontOptions}</select></div>
    </section>
    <section class="settings-group">
      <h4>${icon("music", "row-icon")}\u64AD\u653E</h4>
      <div class="settings-option"><span><strong>\u97F3\u8D28\u504F\u597D</strong><p>\u5728\u7EBF\u64AD\u653E\u7684\u97F3\u8D28\u6863\u4F4D\uFF0C\u97F3\u6E90\u4E0D\u53EF\u7528\u65F6\u81EA\u52A8\u964D\u7EA7\u6216\u591A\u6E90\u8865\u5168\u3002</p></span>
        <select class="settings-select" id="setting-quality" aria-label="\u97F3\u8D28\u504F\u597D">
          ${QUALITIES.map(([value, label]) => `<option value="${value}" ${settings.quality === value ? "selected" : ""}>${label}</option>`).join("")}
        </select></div>
      <div class="settings-option"><span><strong>\u64AD\u653E\u65B9\u5F0F</strong><p>\u987A\u5E8F\u3001\u5FAA\u73AF\u6216\u968F\u673A\u3002</p></span>
        <select class="settings-select" id="setting-playback-mode" aria-label="\u64AD\u653E\u65B9\u5F0F">
          ${PLAYBACK_MODES.map(
      (value) => `<option value="${value}" ${settings.playbackMode === value ? "selected" : ""}>${{ sequence: "\u987A\u5E8F\u64AD\u653E", "repeat-all": "\u5217\u8868\u5FAA\u73AF", shuffle: "\u968F\u673A\u64AD\u653E", "repeat-one": "\u5355\u66F2\u5FAA\u73AF" }[value]}</option>`
    ).join("")}
        </select></div>
      <div class="settings-option"><span><strong>\u81EA\u52A8\u64AD\u653E\u4E0B\u4E00\u9996</strong><p>\u5F53\u524D\u66F2\u76EE\u7ED3\u675F\u540E\u81EA\u52A8\u7EE7\u7EED\u3002</p></span>
        <label class="m3-switch"><input type="checkbox" data-setting-toggle="autoplayNext" ${settings.autoplayNext ? "checked" : ""}/><span class="track"><span class="thumb"></span></span></label></div>
      <div class="settings-option"><span><strong>\u540E\u53F0\u64AD\u653E</strong><p>\u7A97\u53E3\u5931\u7126\u65F6\u7EE7\u7EED\u64AD\u653E\u3002</p></span>
        <label class="m3-switch"><input type="checkbox" data-setting-toggle="backgroundPlayback" ${settings.backgroundPlayback ? "checked" : ""}/><span class="track"><span class="thumb"></span></span></label></div>
      <div class="settings-option"><span><strong>\u5207\u6B4C\u684C\u9762\u901A\u77E5</strong><p>\u64AD\u653E\u65B0\u6B4C\u66F2\u65F6\u663E\u793A\u7CFB\u7EDF\u901A\u77E5\u3002</p></span>
        <label class="m3-switch"><input type="checkbox" data-setting-toggle="notifyOnTrackChange" ${settings.notifyOnTrackChange ? "checked" : ""}/><span class="track"><span class="thumb"></span></span></label></div>
    </section>
    <section class="settings-group">
      <h4>${icon("file", "row-icon")}\u6570\u636E</h4>
      <div class="settings-option"><span><strong>\u672C\u5730\u66F2\u5E93</strong><p>${state.songs.length} \u9996\u672C\u5730\u97F3\u4E50\uFF0C\u8DEF\u5F84\u6301\u4E45\u4FDD\u5B58\u5728\u672C\u673A\u3002</p></span>
        <button type="button" class="text-button danger-text" id="setting-clear-library">\u6E05\u7A7A</button></div>
      <div class="settings-option"><span><strong>\u6700\u8FD1\u64AD\u653E</strong><p>${state.recents.length} \u6761\u8BB0\u5F55\u3002</p></span>
        <button type="button" class="text-button danger-text" id="setting-clear-recents">\u6E05\u7A7A</button></div>
      <div class="settings-option"><span><strong>\u65B0\u624B\u5F15\u5BFC</strong><p>\u91CD\u65B0\u67E5\u770B\u4E09\u6B65\u5F15\u5BFC\u3002</p></span>
        <button type="button" class="tonal-button ripple" id="setting-onboarding">\u91CD\u65B0\u67E5\u770B</button></div>
    </section>
    <section class="settings-group">
      <h4>${icon("info", "row-icon")}\u5173\u4E8E</h4>
      <div class="settings-option"><span><strong>Linmo Player</strong><p>Electron \u684C\u9762\u7AEF \xB7 \u58F0\u660E\u5F0F\u63D2\u4EF6\u67B6\u6784 \xB7 \u7248\u672C ${escapeHtml(window.linmoDesktop?.version ?? "0.1.0")}</p></span></div>
    </section>`;
    root.querySelectorAll("[data-mode]").forEach(
      (button) => button.addEventListener("click", async () => {
        const { setMode: setMode2 } = await Promise.resolve().then(() => (init_theme(), theme_exports));
        await setMode2(button.dataset.mode);
      })
    );
    qs("#setting-theme", root)?.addEventListener("change", async (event) => {
      const { applyThemePlugin: applyThemePlugin2 } = await Promise.resolve().then(() => (init_theme(), theme_exports));
      if (event.target.value) await applyThemePlugin2(event.target.value);
      else {
        patchSettings({ themeId: "" });
        const { applyAppearance: applyAppearance2 } = await Promise.resolve().then(() => (init_theme(), theme_exports));
        await applyAppearance2();
      }
    });
    qs("#setting-font", root)?.addEventListener("change", async (event) => {
      const { applyFontPluginSelection: applyFontPluginSelection2 } = await Promise.resolve().then(() => (init_theme(), theme_exports));
      await applyFontPluginSelection2(event.target.value);
    });
    qs("#setting-quality", root)?.addEventListener(
      "change",
      (event) => patchSettings({ quality: event.target.value })
    );
    qs("#setting-playback-mode", root)?.addEventListener(
      "change",
      (event) => patchSettings({ playbackMode: event.target.value })
    );
    root.querySelectorAll("[data-setting-toggle]").forEach(
      (input) => input.addEventListener("change", () => {
        patchSettings({ [input.dataset.settingToggle]: input.checked });
        if (input.dataset.settingToggle === "notifyOnTrackChange" && input.checked) {
          void Promise.resolve().then(() => (init_player(), player_exports)).then((module) => module.requestNotificationPermission());
        }
      })
    );
    qs("#setting-clear-library", root)?.addEventListener("click", async () => {
      const confirmed = await confirmDialog(
        "\u6E05\u7A7A\u672C\u5730\u66F2\u5E93",
        "\u5C06\u4ECE\u97F3\u4E50\u5E93\u79FB\u9664\u5168\u90E8\u672C\u5730\u66F2\u76EE\uFF08\u4E0D\u5220\u9664\u78C1\u76D8\u4E0A\u7684\u97F3\u9891\u6587\u4EF6\uFF09\u3002",
        "\u6E05\u7A7A"
      );
      if (!confirmed) return;
      state.songs = [];
      persisters.library();
      publish("songs");
      snackbar("\u672C\u5730\u66F2\u5E93\u5DF2\u6E05\u7A7A");
    });
    qs("#setting-clear-recents", root)?.addEventListener("click", () => {
      state.recents = [];
      persisters.recents();
      publish("recents");
      snackbar("\u6700\u8FD1\u64AD\u653E\u5DF2\u6E05\u7A7A");
    });
    qs("#setting-onboarding", root)?.addEventListener("click", async () => {
      const { startOnboarding: startOnboarding2 } = await Promise.resolve().then(() => (init_onboarding(), onboarding_exports));
      startOnboarding2(true);
    });
  }

  // src/views-player.js
  init_state();
  init_player();
  init_core_bridge();
  init_icons();
  init_ui();
  init_lrc();
  var miniDragging = false;
  var npDragging = false;
  var activeLyricIndex = -2;
  var lyricsHoldUntil = 0;
  function modeIcon() {
    return player.modeMeta().icon;
  }
  function modeLabel() {
    return player.modeMeta().label;
  }
  function renderMiniPlayer() {
    const root = qs("#mini-player");
    if (!root) return;
    const song = state.currentSong;
    const muted = player.audio.muted || player.audio.volume === 0;
    const canPrev = Boolean(song && (player.audio.currentTime > 3 || state.queueIndex > 0));
    const canNext = Boolean(song && state.queueIndex < state.queue.length - 1);
    const duration = Number.isFinite(player.audio.duration) ? player.audio.duration : 0;
    root.innerHTML = `<input id="mini-progress" class="mini-progress-top" type="range" min="0" max="1000" step="1" value="0" aria-label="\u64AD\u653E\u8FDB\u5EA6" ${song ? "" : "disabled"} />
    <button type="button" class="mini-info" id="mini-open" aria-label="\u6253\u5F00\u64AD\u653E\u9875" ${song ? "" : "disabled"}>
      ${coverMarkup(song, "small")}
      <span class="mini-copy">
        <strong>${song ? escapeHtml(song.title) : "\u672A\u9009\u62E9\u6B4C\u66F2"}</strong>
        <small>${song ? `${escapeHtml(song.artist)}${song.album ? ` \xB7 ${escapeHtml(song.album)}` : ""}` : "\u5BFC\u5165\u6216\u641C\u7D22\u97F3\u4E50\u540E\u5F00\u59CB\u64AD\u653E"}</small>
      </span>
    </button>
    <div class="mini-transport">
      <span class="mini-time" id="mini-current">0:00</span>
      <div class="mini-controls">
        <button type="button" class="player-control ripple" data-mini-action="previous" aria-label="\u4E0A\u4E00\u9996" ${canPrev ? "" : "disabled"}>${icon("previous")}</button>
        <button type="button" class="play-button ripple ${state.isPlaying ? "is-playing" : ""}" data-mini-action="toggle" aria-label="${state.isPlaying ? "\u6682\u505C" : "\u64AD\u653E"}" ${song ? "" : "disabled"}>${icon(state.isPlaying ? "pause" : "play", "player-icon")}</button>
        <button type="button" class="player-control ripple" data-mini-action="next" aria-label="\u4E0B\u4E00\u9996" ${canNext ? "" : "disabled"}>${icon("next")}</button>
      </div>
      <span class="mini-time is-right" id="mini-duration">${duration ? formatTime(duration) : "0:00"}</span>
    </div>
    <div class="mini-extra">
      <button type="button" class="player-control ripple mode-control ${state.settings.playbackMode !== "sequence" ? "is-active" : ""}" data-mini-action="mode" aria-label="\u64AD\u653E\u65B9\u5F0F\uFF1A${modeLabel()}" title="\u64AD\u653E\u65B9\u5F0F\uFF1A${modeLabel()}">${icon(modeIcon())}</button>
      <button type="button" class="player-control ripple" data-mini-action="mute" aria-label="${muted ? "\u53D6\u6D88\u9759\u97F3" : "\u9759\u97F3"}">${icon(muted ? "volumeMute" : "volume")}</button>
      <input class="m3-slider volume-slider" type="range" min="0" max="100" step="1" value="${Math.round((muted ? 0 : player.audio.volume) * 100)}" aria-label="\u97F3\u91CF" />
    </div>`;
    root.querySelector('[data-mini-action="toggle"]')?.addEventListener("click", () => void player.toggle());
    root.querySelector('[data-mini-action="mode"]')?.addEventListener("click", () => player.cycleMode());
    root.querySelector('[data-mini-action="previous"]')?.addEventListener("click", () => player.previous());
    root.querySelector('[data-mini-action="next"]')?.addEventListener("click", () => player.next());
    root.querySelector('[data-mini-action="mute"]')?.addEventListener("click", () => player.toggleMute());
    qs("#mini-open", root)?.addEventListener("click", () => setNowPlayingOpen(true));
    const miniProgress = qs("#mini-progress", root);
    miniProgress?.addEventListener("pointerdown", () => miniDragging = true);
    miniProgress?.addEventListener("pointerup", () => miniDragging = false);
    miniProgress?.addEventListener(
      "input",
      (event) => player.seekFraction(Number(event.target.value) / 1e3)
    );
    const volume = qs(".volume-slider", root);
    volume?.addEventListener("input", (event) => player.setVolume(Number(event.target.value) / 100));
    updateProgressUI();
  }
  function setNowPlayingOpen(open) {
    state.nowPlayingOpen = open;
    const overlay = qs("#now-playing");
    if (!overlay) return;
    overlay.classList.toggle("is-open", open);
    overlay.setAttribute("aria-hidden", String(!open));
    if (open) renderNowPlaying();
  }
  function renderNowPlaying() {
    const overlay = qs("#now-playing");
    if (!overlay) return;
    const song = state.currentSong;
    const via = state.resolvedVia;
    const coverUrl = song?.coverUrl ?? null;
    overlay.style.setProperty("--np-cover-image", coverUrl ? `url("${coverUrl}")` : "none");
    const coverEl = qs("#np-cover", overlay);
    coverEl.innerHTML = song ? coverMarkup(song, "large") : coverMarkup(null, "large");
    if (song && !song.coverUrl) {
      void (async () => {
        const url = await fetchCover(song);
        if (!url || state.currentSong?.key !== song.key) return;
        overlay.style.setProperty("--np-cover-image", `url("${url}")`);
        const el = qs("#np-cover .cover", overlay) ?? qs("#np-cover", overlay);
        if (!el) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.onerror = () => img.remove();
        el.classList.add("cover-image");
        el.appendChild(img);
      })();
    }
    qs("#np-title", overlay).textContent = song?.title ?? "\u672A\u9009\u62E9\u6B4C\u66F2";
    qs("#np-artist", overlay).textContent = song ? `${song.artist}${song.album ? ` \xB7 ${song.album}` : ""}` : "\u5BFC\u5165\u6216\u641C\u7D22\u97F3\u4E50\u540E\u5F00\u59CB\u64AD\u653E";
    const viaNode = qs("#np-via", overlay);
    if (via && !song?.mediaUri) {
      viaNode.hidden = false;
      viaNode.innerHTML = `${icon("info", "row-icon")}${via.fallbackUsed ? "\u5DF2\u591A\u6E90\u8865\u5168 \xB7 " : "\u6765\u6E90\uFF1A"}${escapeHtml(
        via.pluginId
      )}${via.source ? ` \xB7 ${escapeHtml(via.source)}` : ""}`;
    } else if (song?.mediaUri) {
      viaNode.hidden = false;
      viaNode.textContent = "\u672C\u5730\u6587\u4EF6";
    } else {
      viaNode.hidden = true;
    }
    renderNpControls();
    renderLyricsTab();
    renderQueueTab();
  }
  function renderNpControls() {
    const overlay = qs("#now-playing");
    if (!overlay) return;
    const muted = player.audio.muted || player.audio.volume === 0;
    const canPrev = Boolean(
      state.currentSong && (player.audio.currentTime > 3 || state.queueIndex > 0)
    );
    const canNext = Boolean(state.currentSong && state.queueIndex < state.queue.length - 1);
    const mode = qs("#np-mode", overlay);
    if (mode) {
      mode.innerHTML = icon(modeIcon());
      mode.classList.toggle("is-active", state.settings.playbackMode !== "sequence");
      mode.setAttribute("aria-label", `\u64AD\u653E\u65B9\u5F0F\uFF1A${modeLabel()}`);
    }
    const prev = qs("#np-previous", overlay);
    if (prev) prev.disabled = !canPrev;
    const play = qs("#np-play", overlay);
    if (play) {
      play.innerHTML = icon(state.isPlaying ? "pause" : "play", "player-icon");
      play.classList.toggle("is-playing", state.isPlaying);
      play.setAttribute("aria-label", state.isPlaying ? "\u6682\u505C" : "\u64AD\u653E");
    }
    const next = qs("#np-next", overlay);
    if (next) next.disabled = !canNext;
    const mute = qs("#np-mute", overlay);
    if (mute) {
      mute.innerHTML = icon(muted ? "volumeMute" : "volume");
      mute.setAttribute("aria-label", muted ? "\u53D6\u6D88\u9759\u97F3" : "\u9759\u97F3");
    }
    const volume = qs("#np-volume", overlay);
    if (volume && document.activeElement !== volume)
      volume.value = String(Math.round((muted ? 0 : player.audio.volume) * 100));
  }
  function renderLyricsTab() {
    const container = qs("#np-lyrics");
    if (!container) return;
    const lyrics = state.lyrics;
    activeLyricIndex = -2;
    if (!state.currentSong || state.currentSong.mediaUri) {
      container.innerHTML = `<div class="lyrics-empty">\u672C\u5730\u6B4C\u66F2\u6682\u65E0\u6B4C\u8BCD\u670D\u52A1\u3002</div>`;
      return;
    }
    if (!lyrics || lyrics.songKey !== state.currentSong.key) {
      container.innerHTML = `<div class="lyrics-empty">\u6B4C\u8BCD\u5C1A\u672A\u52A0\u8F7D\u3002</div>`;
      return;
    }
    if (lyrics.loading) {
      container.innerHTML = `<div class="lyrics-empty"><span class="spinner"></span>\u6B63\u5728\u83B7\u53D6\u6B4C\u8BCD\u2026</div>`;
      return;
    }
    if (lyrics.error || !lyrics.lines.length && !lyrics.plain) {
      container.innerHTML = `<div class="lyrics-empty">${escapeHtml(lyrics.error || "\u8FD9\u9996\u6B4C\u66F2\u6682\u65F6\u6CA1\u6709\u6B4C\u8BCD\u3002")}</div>`;
      return;
    }
    if (lyrics.synced) {
      const translated = new Map(lyrics.translatedLines.map((line) => [line.timeMs, line.text]));
      container.innerHTML = lyrics.lines.map(
        (line, index) => `<div class="lyrics-line" data-line="${index}"><span>${escapeHtml(line.text || "\xB7 \xB7 \xB7")}</span>${translated.has(line.timeMs) ? `<small>${escapeHtml(translated.get(line.timeMs))}</small>` : ""}</div>`
      ).join("");
    } else {
      container.innerHTML = `<div class="lyrics-plain">${escapeHtml(lyrics.plain)}${lyrics.translatedPlain ? `

\u2014\u2014 \u7FFB\u8BD1 \u2014\u2014
${escapeHtml(lyrics.translatedPlain)}` : ""}</div>`;
    }
  }
  function renderQueueTab() {
    const container = qs("#np-queue");
    if (!container) return;
    if (!state.queue.length) {
      container.innerHTML = `<div class="lyrics-empty">\u64AD\u653E\u961F\u5217\u4E3A\u7A7A\u3002</div>`;
      return;
    }
    container.innerHTML = state.queue.map(
      (song, index) => `<button type="button" class="queue-row ${index === state.queueIndex ? "is-active" : ""}" data-queue-index="${index}">
          <span class="queue-index">${index === state.queueIndex ? icon("play", "row-icon") : index + 1}</span>
          <span class="queue-copy"><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist)}</small></span>
        </button>`
    ).join("");
    container.querySelectorAll("[data-queue-index]").forEach(
      (row) => row.addEventListener("click", () => player.playSongAt(Number(row.dataset.queueIndex)))
    );
  }
  function updateProgressUI() {
    const audio2 = player.audio;
    const fraction = Number.isFinite(audio2.duration) && audio2.duration > 0 ? audio2.currentTime / audio2.duration : 0;
    const miniRoot = qs("#mini-player");
    if (miniRoot) miniRoot.style.setProperty("--progress", `${Math.round(fraction * 100)}%`);
    const mini = qs("#mini-progress");
    if (mini && !miniDragging && document.activeElement !== mini)
      mini.value = String(Math.round(fraction * 1e3));
    const miniCurrent = qs("#mini-current");
    const miniDuration = qs("#mini-duration");
    if (miniCurrent) miniCurrent.textContent = formatTime(audio2.currentTime);
    if (miniDuration)
      miniDuration.textContent = Number.isFinite(audio2.duration) ? formatTime(audio2.duration) : "0:00";
    const np = qs("#np-progress");
    if (np && !npDragging && document.activeElement !== np)
      np.value = String(Math.round(fraction * 1e3));
    const npCurrent = qs("#np-current");
    const npDuration = qs("#np-duration");
    if (npCurrent) npCurrent.textContent = formatTime(audio2.currentTime);
    if (npDuration)
      npDuration.textContent = Number.isFinite(audio2.duration) ? formatTime(audio2.duration) : "0:00";
  }
  function updateLyricsHighlight() {
    if (!state.nowPlayingOpen) return;
    const lyrics = state.lyrics;
    const container = qs("#np-lyrics");
    if (!lyrics?.synced || !container) return;
    const index = activeLineIndex(lyrics.lines, player.audio.currentTime * 1e3);
    if (index === activeLyricIndex) return;
    activeLyricIndex = index;
    qsa(".lyrics-line", container).forEach((node) => {
      const isActive = Number(node.dataset.line) === index;
      node.classList.toggle("is-active", isActive);
      if (isActive && Date.now() > lyricsHoldUntil)
        node.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  function initPlayerView() {
    const overlay = qs("#now-playing");
    if (!overlay) return;
    qs("#np-close", overlay)?.addEventListener("click", () => setNowPlayingOpen(false));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.nowPlayingOpen) setNowPlayingOpen(false);
    });
    qs("#np-play", overlay)?.addEventListener("click", () => void player.toggle());
    qs("#np-mode", overlay)?.addEventListener("click", () => {
      player.cycleMode();
      renderNpControls();
    });
    qs("#np-previous", overlay)?.addEventListener("click", () => player.previous());
    qs("#np-next", overlay)?.addEventListener("click", () => player.next());
    qs("#np-mute", overlay)?.addEventListener("click", () => {
      player.toggleMute();
      renderNpControls();
    });
    const npProgress = qs("#np-progress", overlay);
    npProgress?.addEventListener("pointerdown", () => npDragging = true);
    npProgress?.addEventListener("pointerup", () => npDragging = false);
    npProgress?.addEventListener(
      "input",
      (event) => player.seekFraction(Number(event.target.value) / 1e3)
    );
    qs("#np-volume", overlay)?.addEventListener("input", (event) => {
      player.setVolume(Number(event.target.value) / 100);
      renderNpControls();
    });
    qs("#np-tab-lyrics", overlay)?.addEventListener("click", () => switchNpTab("lyrics"));
    qs("#np-tab-queue", overlay)?.addEventListener("click", () => switchNpTab("queue"));
    const lyricsContainer = qs("#np-lyrics", overlay);
    lyricsContainer?.addEventListener("wheel", () => lyricsHoldUntil = Date.now() + 4e3, {
      passive: true
    });
    lyricsContainer?.addEventListener("click", (event) => {
      const line = event.target instanceof Element ? event.target.closest("[data-line]") : null;
      if (!line || !state.lyrics?.synced) return;
      const timeMs = state.lyrics.lines[Number(line.dataset.line)]?.timeMs;
      if (timeMs !== void 0)
        player.seekFraction(timeMs / 1e3 / Math.max(player.audio.duration, 1e-3));
    });
    subscribe("player", () => {
      renderMiniPlayer();
      if (state.nowPlayingOpen) renderNowPlaying();
    });
    subscribe("player-time", () => {
      updateProgressUI();
      updateLyricsHighlight();
    });
    subscribe("lyrics", renderLyricsTab);
    subscribe("queue", renderQueueTab);
    subscribe("theme", () => renderMiniPlayer());
  }
  function switchNpTab(tab) {
    const overlay = qs("#now-playing");
    if (!overlay) return;
    qs("#np-tab-lyrics", overlay)?.classList.toggle("is-selected", tab === "lyrics");
    qs("#np-tab-queue", overlay)?.classList.toggle("is-selected", tab === "queue");
    qs("#np-lyrics", overlay)?.classList.toggle("is-selected", tab === "lyrics");
    qs("#np-queue", overlay)?.classList.toggle("is-selected", tab === "queue");
  }

  // src/app.js
  init_onboarding();
  init_dialogs();
  init_ui();
  init_icons();
  var PAGE_TITLES = {
    home: "\u9996\u9875",
    search: "\u5728\u7EBF\u641C\u7D22",
    library: "\u97F3\u4E50\u5E93",
    plugins: "\u63D2\u4EF6\u4E2D\u5FC3",
    settings: "\u8BBE\u7F6E"
  };
  function renderActivePage() {
    switch (state.page) {
      case "home":
        renderHome();
        break;
      case "search":
        renderSearch();
        break;
      case "library":
        renderLibrary();
        break;
      case "plugins":
        renderPlugins();
        break;
      case "settings":
        renderSettings();
        break;
    }
  }
  function setPage(page) {
    if (!PAGE_TITLES[page]) return;
    state.page = page;
    qsa(".nav-item").forEach(
      (item) => item.classList.toggle("is-active", item.dataset.page === page)
    );
    qsa(".page").forEach((section) => {
      const active = section.id === `page-${page}`;
      section.classList.toggle("is-active", active);
      if (active) {
        section.classList.remove("page-enter");
        void section.offsetWidth;
        section.classList.add("page-enter");
      }
    });
    qs("#page-title").textContent = PAGE_TITLES[page];
    closeAccountMenu();
    renderActivePage();
    if (page === "search") qs("#search-input")?.focus();
  }
  function renderAccount() {
    const avatar = qs("#account-avatar");
    if (!avatar) return;
    const account = state.account;
    avatar.innerHTML = account?.avatarUrl ? `<img src="${escapeHtml(account.avatarUrl)}" alt=""/>` : icon("person");
    avatar.classList.toggle("has-account", Boolean(account));
    const menu = qs("#account-menu");
    if (menu && !menu.hidden) fillAccountMenu();
  }
  function fillAccountMenu() {
    const menu = qs("#account-menu");
    if (!menu) return;
    const account = state.account;
    const hasAccountPlugin = state.plugins.some(
      (plugin) => plugin.enabled && plugin.kind === "music-source" && plugin.capabilities.includes("account")
    );
    const subtitle = account ? `${escapeHtml(installedPlugin(state.accountPluginId)?.name ?? "\u63D2\u4EF6\u8D26\u53F7")} \xB7 \u5DF2\u8FDE\u63A5` : hasAccountPlugin ? "\u767B\u5F55\u540E\u540C\u6B65\u8D26\u53F7\u5185\u5BB9" : "\u542F\u7528\u8D26\u53F7\u7C7B\u63D2\u4EF6\u540E\u53EF\u767B\u5F55";
    menu.innerHTML = `<div class="account-header">
      <span class="account-avatar-large">${account?.avatarUrl ? `<img src="${escapeHtml(account.avatarUrl)}" alt=""/>` : icon("person")}</span>
      <span><strong>${account ? escapeHtml(account.name) : "\u672A\u767B\u5F55"}</strong>
      <small>${subtitle}</small></span>
    </div>
    <div class="account-actions">
      ${account ? `<button type="button" class="list-option" data-account-action="sync">${icon("sync", "button-icon")}<span>\u540C\u6B65\u8FDC\u7A0B\u6B4C\u5355</span></button>
             <button type="button" class="list-option" data-account-action="logout">${icon("logout", "button-icon")}<span>\u9000\u51FA\u767B\u5F55</span></button>` : `<button type="button" class="list-option" data-account-action="login" ${hasAccountPlugin ? "" : "disabled"}>${icon("login", "button-icon")}<span>\u767B\u5F55\u8D26\u53F7</span></button>`}
    </div>
    `;
    menu.querySelectorAll("[data-account-action]").forEach(
      (button) => button.addEventListener("click", async () => {
        closeAccountMenu();
        const action = button.dataset.accountAction;
        if (action === "login") await loginDialog();
        else if (action === "logout") {
          await accountLogout();
          snackbar("\u5DF2\u9000\u51FA\u767B\u5F55");
        } else if (action === "sync") {
          snackbar("\u6B63\u5728\u540C\u6B65\u8FDC\u7A0B\u6B4C\u5355\u2026");
          const result = await syncRemotePlaylists();
          if (result.ok) {
            snackbar(`\u5DF2\u540C\u6B65 ${result.count} \u4E2A\u8FDC\u7A0B\u6B4C\u5355`);
            setPage("library");
            state.libraryTab = "playlists";
            renderActivePage();
          } else snackbar(result.error);
        }
      })
    );
  }
  function toggleAccountMenu() {
    const menu = qs("#account-menu");
    if (!menu) return;
    if (menu.hidden) {
      fillAccountMenu();
      menu.hidden = false;
      menu.classList.add("is-open");
      qs("#account-avatar")?.setAttribute("aria-expanded", "true");
    } else closeAccountMenu();
  }
  function closeAccountMenu() {
    const menu = qs("#account-menu");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menu.classList.remove("is-open");
    qs("#account-avatar")?.setAttribute("aria-expanded", "false");
  }
  async function importPluginZip(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const installed = await window.linmoDesktop.plugins.install(bytes);
      const manifest = validatePluginPackageManifest(installed.manifest);
      if (manifest.kind === "theme" && !installed.fileNames.includes(manifest.theme.entry))
        throw new Error(`\u63D2\u4EF6\u7F3A\u5C11\u4E3B\u9898\u6587\u4EF6\uFF1A${manifest.theme.entry}`);
      if (manifest.kind === "font" && !installed.fileNames.includes(manifest.font.file))
        throw new Error(`\u63D2\u4EF6\u7F3A\u5C11\u5B57\u4F53\u6587\u4EF6\uFF1A${manifest.font.file}`);
      const meta = { ...manifest, enabled: false, status: "" };
      state.plugins = [...state.plugins.filter((plugin) => plugin.id !== meta.id), meta];
      persisters.plugins();
      publish("plugins");
      snackbar(`\u5DF2\u5B89\u88C5\u300C${meta.name}\u300D\uFF0C\u53EF\u5728\u5217\u8868\u4E2D\u542F\u7528`);
    } catch (error) {
      snackbar(error instanceof Error ? error.message : "\u63D2\u4EF6 ZIP \u65E0\u6CD5\u8BFB\u53D6\u3002");
    }
  }
  function updateMaximizeIcon(maximized) {
    const next = typeof maximized === "boolean" ? maximized : window.outerWidth >= window.screen.availWidth - 8 && window.outerHeight >= window.screen.availHeight - 8;
    for (const id of ["#window-maximize", "#np-maximize"]) {
      const button = qs(id);
      if (!button) continue;
      button.innerHTML = icon(next ? "restore" : "maximize");
      button.setAttribute("aria-label", next ? "\u8FD8\u539F" : "\u6700\u5927\u5316");
    }
  }
  function updateThemeToggleIcon() {
    const button = qs("#theme-toggle");
    if (!button) return;
    const dark = state.settings.mode === "dark";
    button.innerHTML = icon(dark ? "sun" : "moon");
    button.setAttribute("aria-label", dark ? "\u5207\u6362\u5230\u6D45\u8272\u6A21\u5F0F" : "\u5207\u6362\u5230\u6DF1\u8272\u6A21\u5F0F");
  }
  function bindShell() {
    installImageErrorFallback();
    qsa("[data-icon]").forEach((element) => {
      element.innerHTML = icon(element.dataset.icon || "music");
    });
    qsa(".nav-item").forEach(
      (item) => item.addEventListener("click", () => setPage(item.dataset.page))
    );
    qs("#window-minimize")?.addEventListener("click", () => window.linmoDesktop?.window?.minimize());
    qs("#window-maximize")?.addEventListener(
      "click",
      () => window.linmoDesktop?.window?.toggleMaximize()
    );
    qs("#window-close")?.addEventListener("click", () => window.linmoDesktop?.window?.close());
    qs("#np-minimize")?.addEventListener("click", () => window.linmoDesktop?.window?.minimize());
    qs("#np-maximize")?.addEventListener(
      "click",
      () => window.linmoDesktop?.window?.toggleMaximize()
    );
    qs("#np-close-window")?.addEventListener("click", () => window.linmoDesktop?.window?.close());
    window.linmoDesktop?.window?.onMaximized?.(updateMaximizeIcon);
    window.addEventListener("resize", () => updateMaximizeIcon());
    updateMaximizeIcon();
    updateThemeToggleIcon();
    subscribe("theme", updateThemeToggleIcon);
    qs("#account-avatar")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleAccountMenu();
    });
    document.addEventListener("click", (event) => {
      const wrap = qs(".account-wrap");
      if (wrap && event.target instanceof Element && !wrap.contains(event.target)) closeAccountMenu();
    });
    qs("#theme-toggle")?.addEventListener(
      "click",
      () => setMode(state.settings.mode === "dark" ? "light" : "dark")
    );
    const searchInput = qs("#search-input");
    searchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void runSearch(searchInput.value);
    });
    qs("#search-submit")?.addEventListener("click", () => void runSearch(searchInput?.value ?? ""));
    qs("#plugin-files")?.addEventListener("change", (event) => {
      const files = event.target.files;
      if (files?.length) [...files].forEach((file) => void importPluginZip(file));
      event.target.value = "";
    });
    window.addEventListener("linmo:navigate", (event) => setPage(event.detail));
    window.addEventListener("linmo:create-playlist", () => void createPlaylistDialog());
    window.addEventListener(
      "linmo:rename-playlist",
      (event) => void renamePlaylistDialog(event.detail)
    );
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]'))
        return;
      if (event.code === "Space") {
        event.preventDefault();
        void player.toggle();
      } else if (event.key === "ArrowLeft") player.seekBy(-5);
      else if (event.key === "ArrowRight") player.seekBy(5);
      else if (event.key.toLowerCase() === "m") player.toggleMute();
      else if (event.key.toLowerCase() === "n") player.next();
      else if (event.key.toLowerCase() === "p") player.previous();
    });
  }
  var BUILTIN_NETEASE_ID = "linmo.netease";
  function seedBuiltinPlugins() {
    if (state.plugins.some((plugin) => plugin.id === BUILTIN_NETEASE_ID)) return;
    state.plugins = [
      ...state.plugins,
      {
        packageVersion: 1,
        id: BUILTIN_NETEASE_ID,
        name: "\u7F51\u6613\u4E91\u97F3\u4E50",
        version: "1.0.0",
        hostApiVersion: "1",
        kind: "music-source",
        provider: "netease-api",
        config: { baseUrl: "http://127.0.0.1:3000" },
        capabilities: ["account", "playlists", "search", "playback", "lyrics", "recommendations"],
        description: "\u5185\u7F6E\u7F51\u6613\u4E91\u97F3\u6E90\uFF1A\u626B\u7801\u767B\u5F55\u3001\u641C\u7D22\u64AD\u653E\u3001\u6B4C\u8BCD\u3001\u8D26\u53F7\u6B4C\u5355\u4E0E\u6BCF\u65E5\u63A8\u8350\u3002\u9700\u8981\u8FD0\u884C NeteaseCloudMusicApi \u4EE3\u7406\uFF0C\u670D\u52A1\u5730\u5740\u53EF\u5728\u4E0B\u65B9\u4FEE\u6539\u3002",
        enabled: true,
        status: "",
        builtin: true
      }
    ];
    persisters.plugins();
  }
  async function boot() {
    installRipple();
    bindShell();
    initPlayerView();
    renderMiniPlayer();
    renderAccount();
    setPage("home");
    const topics = [
      "songs",
      "playlists",
      "remote-playlists",
      "recents",
      "recommendations",
      "plugins",
      "search",
      "settings",
      "account"
    ];
    topics.forEach((topic) => subscribe(topic, renderActivePage));
    subscribe("account", renderAccount);
    seedBuiltinPlugins();
    await applyAppearance();
    await bootPlugins();
    await refreshAccount();
    if (state.account) void fetchRecommendations();
    if (state.settings.notifyOnTrackChange) requestNotificationPermission();
    initOnboarding();
  }
  void boot();
})();
