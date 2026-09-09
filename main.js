const { app, BrowserWindow, Menu, dialog, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// file:// pages get an opaque origin in modern Chromium, so their localStorage
// is wiped between launches. Serving the app over a privileged custom scheme
// gives it a stable origin whose storage persists under userData.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

let win = null;
let updaterWired = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const boundsFile = () => path.join(app.getPath('userData'), 'window-bounds.json');

function loadBounds() {
  try { return JSON.parse(fs.readFileSync(boundsFile(), 'utf8')); }
  catch (e) { return null; }
}
function saveBounds() {
  if (!win || win.isMinimized()) return;
  try {
    const b = win.isMaximized() ? { maximized: true, ...(loadBounds() || {}) } : { maximized: false, ...win.getBounds() };
    b.maximized = win.isMaximized();
    fs.writeFileSync(boundsFile(), JSON.stringify(b));
  } catch (e) { /* non-fatal */ }
}

function createWindow() {
  const saved = loadBounds();
  win = new BrowserWindow({
    title: 'Larpenator 3000',
    width: saved && saved.width ? saved.width : 1440,
    height: saved && saved.height ? saved.height : 900,
    x: saved && Number.isFinite(saved.x) ? saved.x : undefined,
    y: saved && Number.isFinite(saved.y) ? saved.y : undefined,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#090909',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);
  win.loadURL('app://larpenator/index.html');
  win.once('ready-to-show', () => {
    if (saved && saved.maximized) win.maximize();
    win.show();
  });
  ['resized', 'moved', 'maximize', 'unmaximize'].forEach(ev => win.on(ev, saveBounds));
  win.on('close', saveBounds);
  win.on('closed', () => { win = null; });
}

// Belt-and-braces: periodically snapshot all lvd_ localStorage keys to a JSON
// file in userData, so data survives even a corrupted Chromium profile.
let backupBusy = false;
async function writeAutoBackup() {
  if (!win || win.isDestroyed() || backupBusy) return;
  backupBusy = true;
  try {
    const json = await win.webContents.executeJavaScript(
      `(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('lvd_') === 0) o[k] = localStorage.getItem(k); } return JSON.stringify(o); })()`
    );
    if (json && json.length > 2) {
      const f = path.join(app.getPath('userData'), 'auto-backup.json');
      fs.writeFileSync(f + '.tmp', json);
      fs.renameSync(f + '.tmp', f);
    }
  } catch (e) { /* window busy or closing — try again next tick */ }
  backupBusy = false;
}

function wireAutoBackup() {
  setInterval(writeAutoBackup, 2 * 60 * 1000);
  if (win) win.on('blur', writeAutoBackup);
}

// Lets the renderer read its own on-disk safety-net backup, so it can silently
// recover if localStorage is ever unexpectedly empty at launch (e.g. a storage
// race on first run after an update) instead of showing "start fresh".
ipcMain.handle('lvd-read-auto-backup', () => {
  try {
    return fs.readFileSync(path.join(app.getPath('userData'), 'auto-backup.json'), 'utf8');
  } catch (e) {
    return null;
  }
});

function wireUpdater() {
  if (updaterWired || !app.isPackaged) return;
  updaterWired = true;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', (info) => {
      if (!win) return;
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update ready',
        message: `Larpenator 3000 ${info.version} has been downloaded.`,
        detail: 'Restart the app to apply the update.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0
      }).then(r => { if (r.response === 0) autoUpdater.quitAndInstall(); });
    });
    autoUpdater.on('error', () => { /* offline or no releases yet — stay quiet */ });
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  } catch (e) { /* updater unavailable in dev — fine */ }
}

// Watches ~/Desktop/Larpenator Backgrounds/{Wins,Losses} — dropping an image
// into either folder reads it, hands it to the renderer to compress and add
// to the matching background-photo pool, then moves the file into that
// folder's "Imported" subfolder so it isn't re-processed on the next launch.
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const pendingBgFiles = new Set();

function ensureBgWatchFolders() {
  const root = path.join(app.getPath('desktop'), 'Larpenator Backgrounds');
  const dirs = {
    root,
    win: path.join(root, 'Wins'),
    winImported: path.join(root, 'Wins', 'Imported'),
    loss: path.join(root, 'Losses'),
    lossImported: path.join(root, 'Losses', 'Imported')
  };
  Object.values(dirs).forEach(d => { try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* already exists or no permission — non-fatal */ } });
  return dirs;
}

function importBgFile(filePath, kind, importedDir) {
  if (pendingBgFiles.has(filePath)) return;
  pendingBgFiles.add(filePath);
  let lastSize = -1;
  const poll = () => {
    fs.stat(filePath, (err, stats) => {
      if (err) { pendingBgFiles.delete(filePath); return; } // moved/deleted before we got to it
      if (!stats.isFile()) { pendingBgFiles.delete(filePath); return; }
      if (stats.size > 0 && stats.size === lastSize) {
        // size stable across two checks — the copy/write has finished
        fs.readFile(filePath, (readErr, buf) => {
          pendingBgFiles.delete(filePath);
          if (readErr) return;
          const ext = path.extname(filePath).toLowerCase();
          const mime = MIME_BY_EXT[ext] || 'image/jpeg';
          const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
          if (win && !win.isDestroyed()) {
            win.webContents.executeJavaScript(
              `window.__lvdImportBgPhoto && window.__lvdImportBgPhoto(${JSON.stringify(kind)}, ${JSON.stringify(dataUrl)})`
            ).catch(() => {});
          }
          fs.rename(filePath, path.join(importedDir, path.basename(filePath)), () => {});
        });
      } else {
        lastSize = stats.size;
        setTimeout(poll, 400);
      }
    });
  };
  poll();
}

function watchBgFolder(dir, importedDir, kind) {
  try {
    fs.watch(dir, (eventType, filename) => {
      if (!filename) return;
      const full = path.join(dir, filename);
      if (path.dirname(full) !== dir) return; // ignore events bubbling from the Imported subfolder
      const ext = path.extname(filename).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) return;
      fs.stat(full, (err, stats) => {
        if (err || !stats.isFile()) return;
        importBgFile(full, kind, importedDir);
      });
    });
  } catch (e) { /* folder missing or watch unsupported — non-fatal */ }
}

function wireBgFolderWatchers() {
  const dirs = ensureBgWatchFolders();
  watchBgFolder(dirs.win, dirs.winImported, 'win');
  watchBgFolder(dirs.loss, dirs.lossImported, 'loss');
}

function registerAppProtocol() {
  const appRoot = path.join(__dirname, 'app');
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const file = path.normalize(path.join(appRoot, rel));
    if (!file.startsWith(appRoot)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// Persistence self-test: `LVD_PERSIST_TEST=write|read electron .` writes/reads a
// localStorage marker and prints the result to stdout, then quits.
function runPersistTest() {
  const mode = process.env.LVD_PERSIST_TEST;
  if (!mode || !win) return false;
  win.webContents.once('did-finish-load', async () => {
    try {
      if (mode === 'dump') {
        const dump = await win.webContents.executeJavaScript(`JSON.stringify(Object.keys(localStorage).map(k => k + '=' + String(localStorage.getItem(k)).length + 'ch'))`);
        console.log('PERSIST_TEST_DUMP:' + dump);
        console.log('PERSIST_TEST_USERDATA:' + app.getPath('userData'));
        console.log('PERSIST_TEST_URL:' + win.webContents.getURL());
      } else if (mode === 'write') {
        await win.webContents.executeJavaScript(`localStorage.setItem('lvd_persist_probe', 'alive-' + '${Date.now()}')`);
        const v = await win.webContents.executeJavaScript(`localStorage.getItem('lvd_persist_probe')`);
        console.log('PERSIST_TEST_WROTE:' + v);
      } else {
        const v = await win.webContents.executeJavaScript(`localStorage.getItem('lvd_persist_probe')`);
        console.log('PERSIST_TEST_READ:' + (v || 'MISSING'));
        await win.webContents.executeJavaScript(`localStorage.removeItem('lvd_persist_probe')`);
      }
    } catch (e) {
      console.log('PERSIST_TEST_ERROR:' + e.message);
    }
    app.exit(0);
  });
  return true;
}

app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();
  runPersistTest();
  wireUpdater();
  wireAutoBackup();
  wireBgFolderWatchers();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
