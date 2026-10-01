const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('linmoDesktop', {
  platform: process.platform,
  version: process.env.npm_package_version || '0.1.0',
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    onMaximized: (handler) => {
      const listener = (_event, maximized) => handler(Boolean(maximized));
      ipcRenderer.on('window:maximized', listener);
      return () => ipcRenderer.removeListener('window:maximized', listener);
    },
  },
  plugins: {
    install: (bytes) => ipcRenderer.invoke('plugin:install', bytes),
    readFile: (pluginId, fileName) =>
      ipcRenderer.invoke('plugin:read-file', { pluginId, fileName }),
    uninstall: (pluginId) => ipcRenderer.invoke('plugin:uninstall', pluginId),
    verifyIntegrity: (pluginId) => ipcRenderer.invoke('plugin:verify-integrity', pluginId),
    rollback: (pluginId) => ipcRenderer.invoke('plugin:rollback', pluginId),
  },
  net: { fetch: (input) => ipcRenderer.invoke('net:fetch', input) },
  library: {
    pickAudio: () => ipcRenderer.invoke('library:pick-audio'),
    pickFolder: () => ipcRenderer.invoke('library:pick-folder'),
  },
});
