import {
  PluginRegistry,
  SourceAggregator,
  createMusicSourcePlugin,
  missingPermissions,
} from '../../../packages/core/src/index.ts';

const registry = new PluginRegistry({
  info: (message, details) => console.info(`[linmo:mobile] ${message}`, details ?? ''),
  error: (message, details) => console.error(`[linmo:mobile] ${message}`, details ?? ''),
});
const aggregator = new SourceAggregator(registry);

const plugins = [
  {
    packageVersion: 1,
    id: 'gdstudio-demo',
    name: 'GD Studio',
    version: '1.0.0',
    hostApiVersion: '1',
    kind: 'music-source',
    provider: 'gdstudio',
    capabilities: ['search', 'playback'],
    permissions: ['network'],
    grantedPermissions: ['network'],
    description: '示例声明式音源：映射到宿主内置引擎。',
    enabled: true,
    status: '',
  },
];

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function log(message) {
  const list = qs('#status-list');
  if (!list) return;
  const item = document.createElement('li');
  item.textContent = message;
  list.prepend(item);
}

function storageFor(pluginId) {
  const prefix = `linmo.mobile.pluginStorage.${pluginId}.`;
  return {
    async get(key) {
      return localStorage.getItem(prefix + key);
    },
    async set(key, value) {
      localStorage.setItem(prefix + key, String(value));
    },
    async remove(key) {
      localStorage.removeItem(prefix + key);
    },
  };
}

async function bootPlugins() {
  for (const meta of plugins) {
    if (missingPermissions(meta.permissions, meta.grantedPermissions).length) {
      log(`「${meta.name}」缺少权限授权`);
      continue;
    }
    const plugin = createMusicSourcePlugin(meta);
    const registered = registry.register(plugin);
    if (!registered.ok) {
      log(`注册失败：${registered.error}`);
      continue;
    }
    const enabled = await registry.enable(meta.id, {
      sourceId: meta.id,
      storage: storageFor(meta.id),
      log: (message) => log(`[${meta.id}] ${message}`),
    });
    if (!enabled.ok) {
      log(`启用失败：${enabled.error}`);
      continue;
    }
    meta.status = 'enabled';
    log(`「${meta.name}」已启用`);
  }
}

function bindThemeToggle() {
  const button = qs('#theme-toggle');
  if (!button) return;
  const apply = (mode) => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem('linmo.mobile.theme', mode);
  };
  const initial = localStorage.getItem('linmo.mobile.theme') ?? 'dark';
  apply(initial);
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
  });
}

function bindSearch() {
  const button = qs('#search-open');
  const input = document.createElement('input');
  input.className = 'search-input';
  input.type = 'search';
  input.placeholder = '输入歌曲名…';
  input.setAttribute('aria-label', '搜索歌曲');
  button?.parentElement?.prepend(input);

  qs('#search-open')?.addEventListener('click', async () => {
    const query = input.value.trim();
    if (!query) {
      log('请输入搜索关键词');
      return;
    }
    log(`搜索：${query}`);
    try {
      const result = await aggregator.searchAll({ query, page: 1, pageSize: 10 });
      const first = result.items[0];
      if (!first) {
        log(result.failures.length ? `搜索失败：${result.failures[0]}` : '没有匹配结果');
        return;
      }
      qs('#hero-title').textContent = first.song.title;
      qs('#hero-artist').textContent = `${first.song.artist} · via ${first.pluginId}`;
      log(`命中 ${result.items.length} 条（首个来自 ${first.pluginId}）`);
      const audio = qs('#audio');
      const mini = qs('#mini-player');
      if (audio && first.song.mediaUri) {
        audio.src = first.song.mediaUri;
        mini.hidden = false;
        qs('#mini-title').textContent = first.song.title;
        qs('#mini-artist').textContent = first.song.artist;
        await audio.play().catch(() => log('无法自动播放（浏览器策略或缺少可播放地址）'));
      }
    } catch (error) {
      log(error instanceof Error ? error.message : '搜索异常');
    }
  });
}

function bindPlugins() {
  qs('#plugins-open')?.addEventListener('click', () => {
    for (const meta of plugins) {
      log(`插件：${meta.name} v${meta.version} · ${meta.status || 'unknown'}`);
    }
  });
}

bindThemeToggle();
bindSearch();
bindPlugins();
void bootPlugins();
log('mobile shell ready');
