const { app, BrowserWindow, Menu, ipcMain, net, dialog, session, protocol } = require('electron');
const path = require('node:path');
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
 * Install a declarative plugin ZIP: validate archive safety, persist the
 * package under userData/plugins/<id>/ and extract data files next to it.
 * The renderer performs the contract-level manifest validation via core.
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
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  const resolved = manifest.manifest || manifest;
  if (typeof resolved.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(resolved.id))
    throw new Error('插件包清单无效：ID 不合法。');
  const version = String(resolved.version ?? '').trim();
  if (!version) throw new Error('插件包清单无效：缺少版本。');

  const pluginDirectory = path.join(pluginsRoot(), resolved.id);
  fs.mkdirSync(pluginDirectory, { recursive: true });
  fs.writeFileSync(path.join(pluginDirectory, `${version}.zip`), Buffer.from(bytes));
  const filesDirectory = path.join(pluginDirectory, 'files');
  fs.rmSync(filesDirectory, { recursive: true, force: true });
  fs.mkdirSync(filesDirectory, { recursive: true });
  for (const entry of entries) {
    const name = entry.entryName.replace(/^\.\//, '');
    const target = path.join(filesDirectory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
  return { manifest, fileNames: names, filesDirectory };
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
  await fsp.rm(path.join(pluginsRoot(), id), { recursive: true, force: true });
  return true;
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
