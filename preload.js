const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('larpenatorDesktop', {
  isDesktop: true,
  platform: process.platform
});
