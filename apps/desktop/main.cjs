const { app, BrowserWindow, Menu, ipcMain, net, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const AdmZip = require('adm-zip');

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
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

  window.setMenuBarVisibility(false);
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
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
    filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'aac'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('plugin:extract-files', async (_event, bytes) => {
  const zip = new AdmZip(Buffer.from(bytes));
  const destination = path.join(app.getPath('userData'), 'plugins', `extract-${Date.now()}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/^\.\//, '');
    if (
      entry.isDirectory ||
      !name ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.split('/').includes('..')
    )
      continue;
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
  return destination;
});

ipcMain.on('window:minimize', (event) => windowFromEvent(event)?.minimize());
ipcMain.on('window:toggle-maximize', (event) => {
  const window = windowFromEvent(event);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});
ipcMain.on('window:close', (event) => windowFromEvent(event)?.close());

ipcMain.handle('plugin:read-package', (_event, bytes) => {
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
  const manifestEntry = entries.find(
    (entry) => entry.entryName.replace(/^\.\//, '') === 'plugin.json',
  );
  if (!manifestEntry) throw new Error('插件 ZIP 根目录必须包含 plugin.json。');
  const input = JSON.parse(manifestEntry.getData().toString('utf8'));
  const manifest = input.manifest || input;
  const kind = manifest.kind || 'music-source';
  const capabilities = Array.isArray(manifest.capabilities)
    ? [...new Set(manifest.capabilities)]
    : [];
  const supported = ['search', 'playback', 'lyrics', 'playlists', 'account', 'recommendations'];
  const entry =
    kind === 'theme'
      ? manifest.theme?.entry || 'theme.json'
      : kind === 'font'
        ? manifest.font?.file
        : manifest.entry;
  if (
    manifest.packageVersion !== 1 ||
    !['music-source', 'theme', 'font'].includes(kind) ||
    typeof manifest.id !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(manifest.id) ||
    typeof manifest.name !== 'string' ||
    !manifest.name.trim() ||
    typeof manifest.version !== 'string' ||
    !manifest.version.trim() ||
    String(manifest.hostApiVersion).split('.')[0] !== '1' ||
    !capabilities.every((capability) => supported.includes(capability)) ||
    (entry && !names.includes(entry))
  )
    throw new Error('插件包清单无效或入口文件不存在。');
  const pluginDirectory = path.join(app.getPath('userData'), 'plugins', manifest.id);
  fs.mkdirSync(pluginDirectory, { recursive: true });
  const packagePath = path.join(pluginDirectory, `${manifest.version}.zip`);
  fs.writeFileSync(packagePath, Buffer.from(bytes));
  return {
    id: manifest.id,
    name: manifest.name.trim(),
    version: manifest.version.trim(),
    hostApiVersion: String(manifest.hostApiVersion),
    kind,
    provider: manifest.provider,
    config: manifest.config,
    capabilities,
    description:
      typeof manifest.description === 'string' ? manifest.description.trim() : '未提供插件说明。',
    packageVersion: 1,
    entry: manifest.entry,
    theme: manifest.theme,
    font: manifest.font,
    packagePath,
  };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
