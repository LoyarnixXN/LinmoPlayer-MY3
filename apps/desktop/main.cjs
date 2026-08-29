const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('node:path');

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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
