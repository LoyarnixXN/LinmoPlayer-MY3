const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('linmoDesktop', {
  platform: process.platform,
  version: process.env.npm_package_version || '0.1.0',
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  plugins: {
    readPackage: (bytes) => ipcRenderer.invoke('plugin:read-package', bytes),
    extractFiles: (bytes) => ipcRenderer.invoke('plugin:extract-files', bytes),
  },
  net: { fetch: (input) => ipcRenderer.invoke('net:fetch', input) },
  library: { pickAudio: () => ipcRenderer.invoke('library:pick-audio') },
});
