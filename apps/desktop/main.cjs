const { app, BrowserWindow, Menu, ipcMain, net, dialog, session, protocol } = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const nodeNet = require('node:net');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const AdmZip = require('adm-zip');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.opus']);
const FOLDER_SCAN_MAX_FILES = 512;
const FOLDER_SCAN_MAX_DEPTH = 6;

// file:// pages refuse plain-http media (URL safety check). A privileged
// scheme lets the renderer stream http sources (e.g. a local proxy) through
// the main process instead.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'linmo-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function handleMediaProtocol(request) {
  const target = new URL(request.url).searchParams.get('url');
  if (!target || !/^https?:\/\//i.test(target))
    return new Response('invalid media target', { status: 400 });
  const range = request.headers.get('range');
  return net
    .fetch(target, { ...(range ? { headers: { range } } : {}), bypassCustomProtocolHandlers: true })
    .then((upstream) => {
      const headers = new Headers();
      for (const key of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'etag',
      ]) {
        const value = upstream.headers.get(key);
        if (value) headers.set(key, value);
      }
      if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes');
      return new Response(upstream.body, { status: upstream.status, headers });
    })
    .catch((error) => new Response(String(error), { status: 502 }));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#FFFBFE',
    title: 'Linmo Player',
    frame: false,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const pushMaximized = () => {
    window.webContents.send('window:maximized', window.isMaximized());
  };
  window.on('maximize', pushMaximized);
  window.on('unmaximize', pushMaximized);
  window.once('ready-to-show', pushMaximized);

  window.setMenuBarVisibility(false);
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function pluginsRoot() {
  return path.join(app.getPath('userData'), 'plugins');
}

function readIntegrityFile(pluginDirectory) {
  const target = path.join(pluginDirectory, 'integrity.json');
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

function writeIntegrityFile(pluginDirectory, record) {
  fs.writeFileSync(path.join(pluginDirectory, 'integrity.json'), JSON.stringify(record, null, 2));
}

function copyDirectorySync(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '.previous-version.json') continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectorySync(from, to);
    else fs.copyFileSync(from, to);
  }
}

function compareVersionStrings(a, b) {
  const pa = String(a)
    .replace(/^v/i, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b)
    .replace(/^v/i, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function assertSafeRelativeName(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').includes('..')
  )
    throw new Error('非法的插件文件路径。');
}

const PLUGIN_PACKAGE_VERSION = 1;
const HOST_API_MAJOR = '1';
const PLUGIN_KINDS = new Set(['music-source', 'theme', 'font']);
const PLUGIN_CAPABILITIES = new Set([
  'search',
  'playback',
  'lyrics',
  'playlists',
  'account',
  'recommendations',
  'favorites',
  'local-files',
]);
const PLUGIN_PERMISSIONS = new Set(['network', 'secure-storage', 'notifications', 'media-library']);
const PLUGIN_PROVIDERS = new Set(['gdstudio', 'netease-api']);
const PLUGIN_VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function isSafePackagePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 240 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.split('/').includes('..')
  );
}

function isInsideDirectory(rootDir, candidate) {
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(candidate);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

/**
 * Full manifest + package-content validation in the main process.
 * Throws before any plugin directory write when the package is invalid.
 */
function validatePluginPackagePayload(manifestRaw, fileNames) {
  if (typeof manifestRaw !== 'object' || manifestRaw === null || Array.isArray(manifestRaw))
    throw new Error('插件包缺少 plugin.json。');
  const manifest =
    typeof manifestRaw.manifest === 'object' && manifestRaw.manifest !== null
      ? manifestRaw.manifest
      : manifestRaw;
  const kind = manifest.kind === undefined ? 'music-source' : manifest.kind;
  if (!PLUGIN_KINDS.has(kind)) throw new Error(`插件类型无效：${String(kind)}。`);
  if (
    manifest.packageVersion !== PLUGIN_PACKAGE_VERSION ||
    typeof manifest.id !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(manifest.id) ||
    typeof manifest.name !== 'string' ||
    !manifest.name.trim() ||
    typeof manifest.version !== 'string' ||
    !PLUGIN_VERSION_RE.test(manifest.version.trim()) ||
    typeof manifest.hostApiVersion !== 'string' ||
    manifest.hostApiVersion.split('.')[0] !== HOST_API_MAJOR
  ) {
    throw new Error(
      '插件包清单无效：需要 packageVersion=1、合法 ID、名称、语义化版本（x.y.z）和兼容的宿主 API 版本。',
    );
  }

  const fileSet = new Set(fileNames);
  if (kind === 'music-source') {
    const capabilities = manifest.capabilities;
    if (!Array.isArray(capabilities) || capabilities.length === 0)
      throw new Error('音源插件必须声明至少一个能力。');
    if (capabilities.some((item) => !PLUGIN_CAPABILITIES.has(item)))
      throw new Error('音源插件声明了未支持的能力。');
    if (typeof manifest.provider !== 'string' || !PLUGIN_PROVIDERS.has(manifest.provider))
      throw new Error('音源插件必须声明受支持的 provider。');
    if (manifest.config !== undefined) {
      if (
        typeof manifest.config !== 'object' ||
        manifest.config === null ||
        Array.isArray(manifest.config)
      )
        throw new Error('音源插件 config 必须是对象。');
      if (
        manifest.config.baseUrl !== undefined &&
        (typeof manifest.config.baseUrl !== 'string' ||
          !/^https?:\/\//.test(manifest.config.baseUrl))
      )
        throw new Error('音源插件 config.baseUrl 必须是 http(s) 地址。');
    }
    if (manifest.entry !== undefined) {
      if (!isSafePackagePath(manifest.entry)) throw new Error('插件 entry 路径非法。');
      if (!fileSet.has(manifest.entry)) throw new Error(`插件入口文件不存在：${manifest.entry}`);
    }
    if (manifest.service !== undefined) {
      const service = manifest.service;
      if (typeof service !== 'object' || service === null || Array.isArray(service))
        throw new Error('service 必须是对象。');
      if (!isSafePackagePath(service.entry)) throw new Error('service.entry 路径非法。');
      if (!Number.isInteger(service.port) || service.port <= 0 || service.port > 65535)
        throw new Error('service.port 必须是 1-65535 的整数。');
      if (!fileSet.has(service.entry)) throw new Error(`插件缺少服务入口文件：${service.entry}`);
    }
  } else if (
    Array.isArray(manifest.capabilities) &&
    manifest.capabilities.some((item) => !PLUGIN_CAPABILITIES.has(item))
  ) {
    throw new Error('插件声明了未支持的能力。');
  }

  const declaredRaw = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  if (declaredRaw.some((item) => typeof item !== 'string' || !PLUGIN_PERMISSIONS.has(item)))
    throw new Error('插件声明了未支持的权限。');

  if (kind === 'theme') {
    const entry = manifest.theme?.entry ?? 'theme.json';
    if (!isSafePackagePath(entry)) throw new Error('主题插件 theme.entry 路径非法。');
    if (!fileSet.has(entry)) throw new Error(`插件缺少主题文件：${entry}`);
  }

  if (kind === 'font') {
    const font = manifest.font;
    if (
      !font ||
      typeof font.family !== 'string' ||
      !font.family.trim() ||
      typeof font.file !== 'string' ||
      !isSafePackagePath(font.file)
    ) {
      throw new Error('字体插件需要声明 font.family 和 font.file。');
    }
    if (!fileSet.has(font.file)) throw new Error(`插件缺少字体文件：${font.file}`);
  }

  return manifest;
}

async function scanFolderForAudio(directory, depth, collected) {
  if (depth > FOLDER_SCAN_MAX_DEPTH || collected.length >= FOLDER_SCAN_MAX_FILES) return;
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (collected.length >= FOLDER_SCAN_MAX_FILES) return;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanFolderForAudio(full, depth + 1, collected);
    } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      collected.push(full);
    }
  }
}

ipcMain.handle('net:fetch', async (_event, input) => {
  if (!input || typeof input.url !== 'string' || !/^https?:\/\//i.test(input.url))
    throw new Error('仅支持 http(s) 网络请求。');
  const request = net.request(input.url);
  if (input.method) request.method = String(input.method).toUpperCase();
  for (const [key, value] of Object.entries(input.headers || {}))
    request.setHeader(key, String(value));
  if (input.body) request.write(String(input.body));
  return await new Promise((resolve, reject) => {
    request.on('error', reject);
    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('base64'),
        }),
      );
      response.on('error', reject);
    });
    request.end();
  });
});

ipcMain.handle('library:pick-audio', async (event) => {
  const result = await dialog.showOpenDialog(windowFromEvent(event), {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'aac', 'opus'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('library:pick-folder', async (event) => {
  const window = windowFromEvent(event);
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return [];
  const collected = [];
  await scanFolderForAudio(result.filePaths[0], 0, collected);
  return collected;
});

/**
 * Install a declarative plugin ZIP: validate archive safety + full manifest
 * in the main process BEFORE any write, stage files, then publish to
 * userData/plugins/<id>/. Records sha256 integrity and keeps one backup.
 */
ipcMain.handle('plugin:install', (_event, bytes) => {
  const zip = new AdmZip(Buffer.from(bytes));
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (entries.length > 128) throw new Error('插件包文件数量超过安全上限。');
  const names = entries.map((entry) => entry.entryName.replace(/^\.\//, '').replace(/\/$/, ''));
  if (
    names.some(
      (name) =>
        !name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..'),
    )
  )
    throw new Error('插件包包含非法路径。');
  for (const entry of entries)
    if (entry.getData().byteLength > 64 * 1024 * 1024)
      throw new Error(`插件包文件过大：${entry.entryName}`);
  const manifestEntry = entries.find(
    (entry) => entry.entryName.replace(/^\.\//, '') === 'plugin.json',
  );
  if (!manifestEntry) throw new Error('插件 ZIP 根目录必须包含 plugin.json。');

  // Full validation before touching disk (id/version/kind/permissions/service/theme/font).
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  const resolved = validatePluginPackagePayload(manifest, names);
  const version = String(resolved.version).trim();
  if (!PLUGIN_VERSION_RE.test(version)) throw new Error('插件包清单无效：版本号格式非法。');
  const zipName = `${version}.zip`;

  const pluginDirectory = path.join(pluginsRoot(), resolved.id);
  if (!isInsideDirectory(pluginsRoot(), pluginDirectory)) throw new Error('插件安装路径非法。');
  const zipPath = path.join(pluginDirectory, zipName);
  if (!isInsideDirectory(pluginDirectory, zipPath)) throw new Error('插件包保存路径非法。');

  const checksum = crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  const previousIntegrity = readIntegrityFile(pluginDirectory);

  // Stage into a temp directory under pluginsRoot, then publish atomically.
  const staging = path.join(
    pluginsRoot(),
    `.staging-${resolved.id}-${crypto.randomBytes(6).toString('hex')}`,
  );
  const stagingFiles = path.join(staging, 'files');
  try {
    fs.mkdirSync(stagingFiles, { recursive: true });
    fs.writeFileSync(path.join(staging, zipName), Buffer.from(bytes));
    for (const entry of entries) {
      const name = entry.entryName.replace(/^\.\//, '');
      const target = path.join(stagingFiles, name);
      if (!isInsideDirectory(stagingFiles, target))
        throw new Error(`插件包包含非法路径：${entry.entryName}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.getData());
    }
    writeIntegrityFile(staging, {
      pluginId: resolved.id,
      version,
      checksum,
      algorithm: 'sha256',
      installedAt: new Date().toISOString(),
      fileName: zipName,
    });

    fs.mkdirSync(pluginDirectory, { recursive: true });
    const filesDirectory = path.join(pluginDirectory, 'files');
    if (fs.existsSync(filesDirectory)) {
      const backupDirectory = path.join(pluginDirectory, 'backup');
      fs.rmSync(backupDirectory, { recursive: true, force: true });
      fs.mkdirSync(backupDirectory, { recursive: true });
      copyDirectorySync(filesDirectory, backupDirectory);
      if (previousIntegrity)
        fs.writeFileSync(
          path.join(backupDirectory, '.previous-version.json'),
          JSON.stringify({
            version: previousIntegrity.version,
            fileName: previousIntegrity.fileName,
          }),
        );
    }
    fs.rmSync(filesDirectory, { recursive: true, force: true });
    fs.renameSync(stagingFiles, filesDirectory);
    fs.copyFileSync(path.join(staging, zipName), zipPath);
    fs.copyFileSync(
      path.join(staging, 'integrity.json'),
      path.join(pluginDirectory, 'integrity.json'),
    );
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  return {
    manifest,
    fileNames: names,
    filesDirectory: path.join(pluginDirectory, 'files'),
    integrity: {
      checksum,
      version,
      previousVersion: previousIntegrity?.version ?? null,
      direction:
        previousIntegrity && compareVersionStrings(previousIntegrity.version, version) > 0
          ? 'downgrade'
          : previousIntegrity
            ? 'upgrade'
            : 'install',
    },
  };
});

ipcMain.handle('plugin:verify-integrity', (_event, pluginId) => {
  const id = String(pluginId ?? '');
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) throw new Error('插件 ID 非法。');
  const pluginDirectory = path.join(pluginsRoot(), id);
  const record = readIntegrityFile(pluginDirectory);
  if (!record) return { ok: false, error: '未找到完整性记录。' };
  const zipPath = path.join(pluginDirectory, record.fileName);
  if (!fs.existsSync(zipPath)) return { ok: false, error: '插件包文件缺失。' };
  const actual = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  if (actual !== record.checksum) return { ok: false, error: '完整性校验失败：插件包已被修改。' };
  return { ok: true, version: record.version, checksum: record.checksum };
});

ipcMain.handle('plugin:rollback', (_event, pluginId) => {
  const id = String(pluginId ?? '');
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) throw new Error('插件 ID 非法。');
  const pluginDirectory = path.join(pluginsRoot(), id);
  const record = readIntegrityFile(pluginDirectory);
  const backupDirectory = path.join(pluginDirectory, 'backup');
  if (!fs.existsSync(backupDirectory)) throw new Error('没有可回滚的历史版本。');
  let previousMeta = null;
  const metaPath = path.join(backupDirectory, '.previous-version.json');
  if (fs.existsSync(metaPath)) {
    try {
      previousMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      previousMeta = null;
    }
  }
  const filesDirectory = path.join(pluginDirectory, 'files');
  fs.rmSync(filesDirectory, { recursive: true, force: true });
  fs.mkdirSync(filesDirectory, { recursive: true });
  copyDirectorySync(backupDirectory, filesDirectory);
  fs.rmSync(path.join(filesDirectory, '.previous-version.json'), { force: true });
  const rolledVersion = previousMeta?.version ?? 'unknown';
  const rolledFile = previousMeta?.fileName ?? record?.fileName ?? '';
  const rolledZip =
    rolledFile && fs.existsSync(path.join(pluginDirectory, rolledFile))
      ? fs.readFileSync(path.join(pluginDirectory, rolledFile))
      : null;
  if (rolledZip) {
    writeIntegrityFile(pluginDirectory, {
      pluginId: id,
      version: rolledVersion,
      checksum: crypto.createHash('sha256').update(rolledZip).digest('hex'),
      algorithm: 'sha256',
      installedAt: new Date().toISOString(),
      fileName: rolledFile,
    });
  }
  fs.rmSync(backupDirectory, { recursive: true, force: true });
  return { ok: true, version: rolledVersion };
});

ipcMain.handle('plugin:read-file', async (_event, input) => {
  const pluginId = String(input?.pluginId ?? '');
  assertSafeRelativeName(pluginId);
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(pluginId)) throw new Error('插件 ID 非法。');
  const fileName = String(input?.fileName ?? '');
  assertSafeRelativeName(fileName);
  const target = path.join(pluginsRoot(), pluginId, 'files', fileName);
  const buffer = await fsp.readFile(target);
  return buffer.toString('base64');
});

ipcMain.handle('plugin:uninstall', async (_event, pluginId) => {
  const id = String(pluginId ?? '');
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) throw new Error('插件 ID 非法。');
  stopPluginService(id);
  await fsp.rm(path.join(pluginsRoot(), id), { recursive: true, force: true });
  return true;
});

/* ---------------- bundled plugin services ----------------
 * Plugins may ship a Node service (e.g. a self-hosted API proxy). The host
 * runs it with its own runtime (ELECTRON_RUN_AS_NODE) while the plugin is
 * enabled — no system Node installation is required. */

const runningServices = new Map(); // pluginId -> child process

function stopPluginService(pluginId) {
  const child = runningServices.get(pluginId);
  if (!child) return;
  runningServices.delete(pluginId);
  try {
    child.kill();
  } catch {
    /* already gone */
  }
}

function stopAllServices() {
  for (const child of runningServices.values()) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  runningServices.clear();
}

function probePort(port) {
  return new Promise((resolve) => {
    const socket = nodeNet.connect(port, '127.0.0.1');
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    setTimeout(() => done(false), 600);
  });
}

ipcMain.handle('plugin:start-service', async (_event, input) => {
  const pluginId = String(input?.pluginId ?? '');
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(pluginId)) throw new Error('插件 ID 非法。');
  const entry = String(input?.entry ?? '');
  if (!entry || entry.startsWith('/') || entry.includes('\\') || entry.split('/').includes('..'))
    throw new Error('服务入口路径非法。');
  const port = Number(input?.port ?? 0);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('服务端口非法。');
  if (runningServices.has(pluginId)) return { ok: true, alreadyRunning: true };
  const script = path.join(pluginsRoot(), pluginId, 'files', entry);
  if (!fs.existsSync(script)) throw new Error('服务入口文件不存在。');
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port) },
    stdio: 'ignore',
    windowsHide: true,
  });
  runningServices.set(pluginId, child);
  child.on('exit', () => runningServices.delete(pluginId));
  // Wait briefly for the port so the first request does not race the startup.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await probePort(port)) return { ok: true, ready: true };
    if (!runningServices.has(pluginId)) return { ok: false, error: '服务进程提前退出。' };
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return { ok: true, ready: false };
});

ipcMain.handle('plugin:stop-service', (_event, pluginId) => {
  stopPluginService(String(pluginId ?? ''));
  return true;
});

app.on('before-quit', stopAllServices);
app.on('window-all-closed', () => {
  stopAllServices();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('window:minimize', (event) => windowFromEvent(event)?.minimize());
ipcMain.on('window:toggle-maximize', (event) => {
  const window = windowFromEvent(event);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});
ipcMain.on('window:close', (event) => windowFromEvent(event)?.close());

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('linmo-media', handleMediaProtocol);
  // Keep loopback/lan addresses (self-hosted NeteaseCloudMusicApi proxy) off the
  // system proxy; external sources keep following the system configuration.
  session.defaultSession
    .setProxy({ mode: 'system', proxyBypassRules: '<local>' })
    .catch(() => undefined);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
