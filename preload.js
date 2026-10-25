const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('larpenatorDesktop', {
  isDesktop: true,
  platform: process.platform,
  readAutoBackup: () => ipcRenderer.invoke('lvd-read-auto-backup'),
  econCalendar: () => ipcRenderer.invoke('lvd-econ-calendar'),
  flushStorage: () => ipcRenderer.send('lvd-flush-storage'),
  // your wallpapers and card backgrounds (OneDriveLarpenatorLarpenator media)
  media: {
    list: () => ipcRenderer.invoke('lvd-media-list'),
    openFolder: which => ipcRenderer.invoke('lvd-media-open', which)
  },
  // desk widget (always-on-top panel)
  widget: {
    toggle: () => ipcRenderer.send('widget-toggle'),
    ping: () => ipcRenderer.send('widget-ping'),
    call: (fn, args) => ipcRenderer.invoke('widget-call', fn, args),
    prefs: () => ipcRenderer.invoke('widget-get-prefs'),
    close: () => ipcRenderer.send('widget-close'),
    collapse: on => ipcRenderer.send('widget-collapse', on),
    pin: on => ipcRenderer.send('widget-pin', on),
    opacity: v => ipcRenderer.send('widget-opacity', v),
    openInApp: noteId => ipcRenderer.send('widget-open-in-app', noteId),
    onRefresh: cb => ipcRenderer.on('widget-refresh', () => cb()),
    onCollapsed: cb => ipcRenderer.on('widget-collapsed', (e, on) => cb(on))
  }
});
