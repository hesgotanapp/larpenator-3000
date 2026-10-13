// Desk widget: a small always-on-top panel with notes and the trade checklist.
// It has no data of its own — every read and write goes through the main window's
// page (window.__lvdWidgetApi), so notes stay in one place and keep syncing.
const { BrowserWindow, ipcMain, screen, globalShortcut, app } = require('electron');
const path = require('path');
const fs = require('fs');

const COLLAPSED = { width: 236, height: 46 };
const MIN = { width: 270, height: 220 };
let widget = null;
let getMain = () => null;
let state = null; // { x, y, width, height, open, collapsed, pinned, opacity }

const stateFile = () => path.join(app.getPath('userData'), 'widget-state.json');
function loadState() {
  try { return Object.assign({ open: false, collapsed: false, pinned: true, opacity: 1 }, JSON.parse(fs.readFileSync(stateFile(), 'utf8'))); }
  catch (e) { return { open: false, collapsed: false, pinned: true, opacity: 1 }; }
}
function saveState() { try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch (e) { /* non-fatal */ } }

// keep the panel on a visible screen (a monitor may have been unplugged since last time)
function onScreen(b) {
  const area = screen.getDisplayMatching({ x: b.x, y: b.y, width: b.width, height: b.height }).workArea;
  const visible = b.x < area.x + area.width - 60 && b.x + b.width > area.x + 60 && b.y >= area.y - 10 && b.y < area.y + area.height - 40;
  if (visible) return b;
  const p = screen.getPrimaryDisplay().workArea;
  return { x: p.x + p.width - b.width - 24, y: p.y + 24, width: b.width, height: b.height };
}

function rememberBounds() {
  if (!widget || widget.isDestroyed() || state.collapsed) return;
  const b = widget.getBounds();
  Object.assign(state, { x: b.x, y: b.y, width: b.width, height: b.height });
  saveState();
}

function applyCollapsed() {
  if (!widget || widget.isDestroyed()) return;
  if (state.collapsed) {
    const b = widget.getBounds();
    widget.setResizable(false);
    widget.setMinimumSize(COLLAPSED.width, COLLAPSED.height);
    widget.setBounds({ x: b.x + b.width - COLLAPSED.width, y: b.y, width: COLLAPSED.width, height: COLLAPSED.height });
  } else {
    const cur = widget.getBounds();
    const w = state.width || 340, h = state.height || 540;
    widget.setMinimumSize(MIN.width, MIN.height);
    widget.setResizable(true);
    widget.setBounds(onScreen({ x: cur.x + cur.width - w, y: cur.y, width: w, height: h }));
  }
  widget.webContents.send('widget-collapsed', state.collapsed);
}

function openWidget() {
  if (widget && !widget.isDestroyed()) { widget.showInactive(); widget.moveTop(); return; }
  const p = screen.getPrimaryDisplay().workArea;
  const w = state.width || 340, h = state.height || 540;
  const b = onScreen({ x: Number.isFinite(state.x) ? state.x : p.x + p.width - w - 24, y: Number.isFinite(state.y) ? state.y : p.y + 24, width: w, height: h });
  widget = new BrowserWindow({
    ...b,
    minWidth: MIN.width, minHeight: MIN.height,
    frame: false, resizable: true, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, show: false, title: 'Larpenator Desk',
    backgroundColor: '#0c0d0e',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: true }
  });
  widget.setAlwaysOnTop(!!state.pinned, 'screen-saver');
  widget.setVisibleOnAllWorkspaces(true);
  widget.setOpacity(Math.min(1, Math.max(0.35, state.opacity || 1)));
  widget.loadURL('app://larpenator/widget.html');
  widget.once('ready-to-show', () => {
    widget.showInactive();
    if (state.collapsed) applyCollapsed();
  });
  ['moved', 'resized'].forEach(ev => widget.on(ev, rememberBounds));
  widget.on('move', () => { if (state.collapsed && widget) { const b = widget.getBounds(); state.x = b.x + b.width - (state.width || 340); state.y = b.y; saveState(); } });
  // closed by the user some other way (Alt+F4): don't reopen it next launch.
  // (destroy() — used when Larpenator itself closes — doesn't fire 'close', so that keeps it open.)
  widget.on('close', () => { rememberBounds(); state.open = false; saveState(); });
  widget.on('closed', () => { widget = null; });
  state.open = true; saveState();
}

function closeWidget(remember = true) {
  if (widget && !widget.isDestroyed()) { rememberBounds(); widget.destroy(); }
  widget = null;
  if (remember) { state.open = false; saveState(); }
}

function toggleWidget() { if (widget && !widget.isDestroyed() && widget.isVisible()) closeWidget(); else openWidget(); }

function callMain(fn, args) {
  const main = getMain();
  if (!main || main.isDestroyed()) return Promise.resolve(null);
  const expr = `(() => { const api = window.__lvdWidgetApi; return api && typeof api[${JSON.stringify(fn)}] === 'function' ? api[${JSON.stringify(fn)}](...${JSON.stringify(args || [])}) : null; })()`;
  return main.webContents.executeJavaScript(expr).catch(() => null);
}

function initWidget(getMainWindow) {
  getMain = getMainWindow;
  state = loadState();

  ipcMain.handle('widget-call', (e, fn, args) => callMain(String(fn), Array.isArray(args) ? args : []));
  ipcMain.handle('widget-get-prefs', () => ({ collapsed: !!state.collapsed, pinned: !!state.pinned, opacity: state.opacity || 1 }));
  ipcMain.on('widget-toggle', toggleWidget);
  ipcMain.on('widget-close', () => closeWidget());
  ipcMain.on('widget-collapse', (e, on) => { rememberBounds(); state.collapsed = !!on; saveState(); applyCollapsed(); });
  ipcMain.on('widget-pin', (e, on) => { state.pinned = !!on; saveState(); if (widget) widget.setAlwaysOnTop(state.pinned, 'screen-saver'); });
  ipcMain.on('widget-opacity', (e, v) => { state.opacity = Math.min(1, Math.max(0.35, +v || 1)); saveState(); if (widget) widget.setOpacity(state.opacity); });
  // the main page changed notes / checklist / theme: tell the panel to refresh
  ipcMain.on('widget-ping', () => { if (widget && !widget.isDestroyed()) widget.webContents.send('widget-refresh'); });
  ipcMain.on('widget-open-in-app', (e, noteId) => {
    const main = getMain(); if (!main || main.isDestroyed()) return;
    if (main.isMinimized()) main.restore();
    main.show(); main.focus();
    if (noteId) callMain('openNote', [noteId]);
  });

  try { globalShortcut.register('CommandOrControl+Alt+L', toggleWidget); } catch (e) { /* taken by another app — the in-app button still works */ }
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (e) {} });
}

// reopen the panel on launch if it was open when the app last closed
function restoreWidget() { if (state && state.open) openWidget(); }

module.exports = { initWidget, restoreWidget, closeWidget };
