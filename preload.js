const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('larpenatorDesktop', {
  isDesktop: true,
  platform: process.platform,
  readAutoBackup: () => ipcRenderer.invoke('lvd-read-auto-backup')
});
