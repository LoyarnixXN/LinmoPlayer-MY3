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
    install: (bytes) => ipcRenderer.invoke('plugin:install', bytes),
    readFile: (pluginId, fileName) =>
      ipcRenderer.invoke('plugin:read-file', { pluginId, fileName }),
    uninstall: (pluginId) => ipcRenderer.invoke('plugin:uninstall', pluginId),
    startService: (input) => ipcRenderer.invoke('plugin:start-service', input),
    stopService: (pluginId) => ipcRenderer.invoke('plugin:stop-service', pluginId),
  },
  net: { fetch: (input) => ipcRenderer.invoke('net:fetch', input) },
  library: {
    pickAudio: () => ipcRenderer.invoke('library:pick-audio'),
    pickFolder: () => ipcRenderer.invoke('library:pick-folder'),
  },
});
