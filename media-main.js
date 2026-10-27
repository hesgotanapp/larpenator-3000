// Your own media for the app: wallpapers for the Liquid looks and backgrounds (pictures or short
// videos) for trade cards. They live outside the app — in OneDrive when you have it, so every PC
// you sign in on gets them — and are served to the page as app://larpenator/user-media/<folder>/<file>.
const { app, ipcMain, shell, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const FOLDERS = { cards: 'Card backgrounds', walls: 'Wallpapers' };
const PICTURE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const VIDEO = new Set(['.mp4', '.webm', '.mov', '.m4v']);

// every place media can live, most preferred first
function mediaRoots() {
  const roots = [];
  const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer || path.join(os.homedir(), 'OneDrive');
  try { if (fs.statSync(oneDrive).isDirectory()) roots.push(path.join(oneDrive, 'Larpenator', 'Larpenator media')); } catch (e) { /* no OneDrive */ }
  roots.push(path.join(app.getPath('userData'), 'media'));
  return roots;
}
function ensureFolders() {
  const root = mediaRoots()[0];
  Object.values(FOLDERS).forEach(f => { try { fs.mkdirSync(path.join(root, f), { recursive: true }); } catch (e) { /* no permission — non-fatal */ } });
  return root;
}

function listFolder(folder) {
  const seen = new Map();
  mediaRoots().forEach(root => {
    let names = [];
    try { names = fs.readdirSync(path.join(root, folder)); } catch (e) { return; }
    names.forEach(name => {
      const ext = path.extname(name).toLowerCase();
      if (!PICTURE.has(ext) && !VIDEO.has(ext)) return;
      if (name.startsWith('.') || seen.has(name.toLowerCase())) return;
      seen.set(name.toLowerCase(), {
        name,
        label: path.basename(name, ext),
        kind: VIDEO.has(ext) ? 'video' : 'picture',
        url: 'app://larpenator/user-media/' + encodeURIComponent(folder) + '/' + encodeURIComponent(name)
      });
    });
  });
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// app://larpenator/user-media/<folder>/<file> → the file on disk (only inside the media folders)
function resolveMediaPath(pathname) {
  const parts = pathname.replace(/^\/user-media\//, '').split('/').map(decodeURIComponent);
  if (parts.length !== 2 || !Object.values(FOLDERS).includes(parts[0])) return null;
  for (const root of mediaRoots()) {
    const dir = path.join(root, parts[0]);
    const file = path.normalize(path.join(dir, parts[1]));
    if (!file.startsWith(dir + path.sep)) continue;
    try { if (fs.statSync(file).isFile()) return file; } catch (e) { /* try the next root */ }
  }
  return null;
}

// videos need byte-range answers (the player asks for pieces of the file as it plays)
const TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
function serveMediaFile(file, request) {
  const { Readable } = require('stream');
  const size = fs.statSync(file).size;
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (range) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : size - 1;
    start = Math.max(0, Math.min(start, size - 1)); end = Math.max(start, Math.min(end, size - 1));
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Accept-Ranges': 'bytes' }
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
}

function initMedia() {
  ensureFolders();
  ipcMain.handle('lvd-media-list', () => ({ cards: listFolder(FOLDERS.cards), wallpapers: listFolder(FOLDERS.walls) }));
  ipcMain.handle('lvd-media-open', (e, which) => {
    const root = ensureFolders();
    return shell.openPath(path.join(root, which === 'walls' ? FOLDERS.walls : FOLDERS.cards));
  });
  // pick videos/pictures anywhere on the PC and copy them into the card backgrounds folder
  ipcMain.handle('lvd-media-add-cards', async e => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const noDot = set => [...set].map(x => x.slice(1));
    const r = await dialog.showOpenDialog(win, {
      title: 'Add trade card backgrounds',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos and pictures', extensions: [...noDot(VIDEO), ...noDot(PICTURE)] }, { name: 'Videos', extensions: noDot(VIDEO) }, { name: 'Pictures', extensions: noDot(PICTURE) }]
    });
    if (r.canceled || !r.filePaths.length) return { added: [] };
    const dir = path.join(ensureFolders(), FOLDERS.cards);
    const added = [];
    for (const src of r.filePaths) {
      const ext = path.extname(src).toLowerCase();
      if (!VIDEO.has(ext) && !PICTURE.has(ext)) continue;
      const base = path.basename(src, path.extname(src));
      let name = base + ext, n = 2;
      while (fs.existsSync(path.join(dir, name))) name = base + ' (' + (n++) + ')' + ext;
      await fs.promises.copyFile(src, path.join(dir, name));
      added.push(name);
    }
    return { added };
  });
  // ---- syncing between PCs (the page does the cloud side, see mediaSync in index.html) ----
  // copies that came from the cloud land in the app's own folder, never in OneDrive, so they
  // can't collide with a OneDrive copy that is still on its way
  const cacheDir = folder => path.join(app.getPath('userData'), 'media', folder);
  const safe = (folder, name) => Object.values(FOLDERS).includes(folder) && typeof name === 'string' && name && path.basename(name) === name;
  ipcMain.handle('lvd-media-files', () => {
    const out = [];
    let roots = 0;
    Object.values(FOLDERS).forEach(folder => {
      const seen = new Set();
      mediaRoots().forEach(root => {
        let names;
        try { names = fs.readdirSync(path.join(root, folder)); roots++; } catch (e) { return; }
        names.forEach(name => {
          const ext = path.extname(name).toLowerCase();
          if ((!PICTURE.has(ext) && !VIDEO.has(ext)) || name.startsWith('.') || seen.has(name.toLowerCase())) return;
          try {
            const st = fs.statSync(path.join(root, folder, name));
            if (!st.isFile()) return;
            seen.add(name.toLowerCase());
            out.push({ folder, name, size: st.size, mtime: st.mtimeMs });
          } catch (e) { /* vanished meanwhile */ }
        });
      });
    });
    return { files: out, readable: roots > 0 };
  });
  ipcMain.handle('lvd-media-read', (e, folder, name) => {
    if (!safe(folder, name)) return null;
    const file = resolveMediaPath('/user-media/' + encodeURIComponent(folder) + '/' + encodeURIComponent(name));
    return file ? fs.promises.readFile(file) : null;
  });
  ipcMain.handle('lvd-media-write', async (e, folder, name, bytes) => {
    if (!safe(folder, name) || !bytes) return false;
    const dir = cacheDir(folder);
    await fs.promises.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, '.' + name + '.part');
    await fs.promises.writeFile(tmp, Buffer.from(bytes));
    await fs.promises.rename(tmp, path.join(dir, name));
    return true;
  });
  // removed on another PC: every copy here goes to the Recycle Bin
  ipcMain.handle('lvd-media-trash', async (e, folder, name) => {
    if (!safe(folder, name)) return false;
    for (const root of mediaRoots()) {
      const file = path.join(root, folder, name);
      try { if (fs.statSync(file).isFile()) await shell.trashItem(file); } catch (err) { /* not here */ }
    }
    return true;
  });
  // removing one sends it to the Recycle Bin (never a hard delete)
  ipcMain.handle('lvd-media-remove-card', async (e, name) => {
    const file = resolveMediaPath('/user-media/' + encodeURIComponent(FOLDERS.cards) + '/' + encodeURIComponent(String(name || '')));
    if (!file) return false;
    await shell.trashItem(file);
    return true;
  });
}

module.exports = { initMedia, resolveMediaPath, serveMediaFile, mediaRoots, FOLDERS };
