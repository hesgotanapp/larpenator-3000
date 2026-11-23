// TradeSea connection for the auto journal. TradeSea runs in its own Larpenator window (its own
// cookie jar, "persist:tradesea"); you sign in there yourself and Larpenator never sees the password.
// The page asks this module for your accounts and executions using that sign-in, and for a picture
// of the TradeSea chart when a trade closes. Deciding what becomes a journal entry happens in the page.
const { app, BrowserWindow, ipcMain, session, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

const PARTITION = 'persist:tradesea';
const APP_URL = 'https://app.tradesea.ai/trade';
const IDENTITY = 'https://prod-identity.tradesea.ai';
const TRADE_READ = 'https://prod-trade-read.tradesea.ai';
const DISCOVERY = 'https://prod-discovery.tradesea.ai'; // Compass, TradeSea's own journal: finished trades by date

let tsWin = null;
let quitting = false; // Larpenator already saved TradeSea on its way out (see main.js before-quit)
let refreshing = null;
const ses = () => session.fromPartition(PARTITION);
const boundsFile = () => path.join(app.getPath('userData'), 'tradesea-window.json');
// TradeSea keeps your chart layout (drawings included) and chosen account in sessionStorage, which a
// browser tab keeps but a new window starts without. Larpenator keeps a copy here and puts it back
// (tradesea-preload.js) before TradeSea's own code runs, so every open is like reopening your tab.
const sessionFile = () => path.join(app.getPath('userData'), 'tradesea-session.json');

async function saveTabState() {
  if (!tsWin || tsWin.isDestroyed()) return;
  try {
    const json = await tsWin.webContents.executeJavaScript(
      `location.origin === 'https://app.tradesea.ai' && sessionStorage.length ? JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)]))) : ''`
    );
    if (json) fs.writeFileSync(sessionFile(), json);
  } catch (e) { /* page busy or navigating — the next save catches it */ }
}
// Chromium writes storage and cookies to disk in batches; this writes them now, so closing the
// window, quitting, or the laptop sleeping can't lose your sign-in or settings
function flushToDisk() {
  try { ses().flushStorageData(); } catch (e) {}
  try { ses().cookies.flushStore(); } catch (e) {}
}
async function saveTradeSea() {
  await saveTabState();
  flushToDisk();
}

function openWindow(show) {
  if (tsWin && !tsWin.isDestroyed()) {
    if (show) { if (tsWin.isMinimized()) tsWin.restore(); tsWin.show(); tsWin.focus(); }
    return tsWin;
  }
  let bounds = { width: 1500, height: 950 };
  try { bounds = Object.assign(bounds, JSON.parse(fs.readFileSync(boundsFile(), 'utf8'))); } catch (e) { /* first time */ }
  tsWin = new BrowserWindow(Object.assign({}, bounds, {
    show: !!show,
    title: 'TradeSea',
    autoHideMenuBar: true,
    // keeps drawing while behind other windows, so the chart picture is current
    webPreferences: { partition: PARTITION, backgroundThrottling: false, preload: path.join(__dirname, 'tradesea-preload.js') }
  }));
  const saveBounds = () => { try { if (!tsWin.isMinimized() && !tsWin.isMaximized()) fs.writeFileSync(boundsFile(), JSON.stringify(tsWin.getBounds())); } catch (e) {} };
  tsWin.on('resize', saveBounds);
  tsWin.on('move', saveBounds);
  // save everything before the window goes, then let it close
  let closing = false;
  tsWin.on('close', ev => {
    if (closing || quitting) return;
    ev.preventDefault();
    closing = true;
    const w = tsWin;
    saveTradeSea().finally(() => { if (!w.isDestroyed()) w.close(); });
  });
  tsWin.on('closed', () => { tsWin = null; flushToDisk(); });
  tsWin.loadURL(APP_URL);
  return tsWin;
}

// TradeSea's sign-in token lasts about 5 minutes and is renewed with the refresh cookie, the same
// call TradeSea's own page makes. Only one renewal runs at a time, and none while the TradeSea
// window is open (the page renews it itself, and two renewals racing can end the sign-in).
// every TradeSea request gives up after 20 seconds, so a dropped connection (the laptop waking,
// Wi-Fi changing) can't leave the trade checker waiting forever
const REQUEST_TIMEOUT = 20000;
// resolves to fallback if the promise hasn't settled in ms
const within = (p, ms, fallback) => Promise.race([p, new Promise(r => setTimeout(() => r(fallback), ms))]);

async function renewSignIn() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    if (tsWin && !tsWin.isDestroyed() && tsWin.isVisible()) { await new Promise(r => setTimeout(r, 5000)); return; }
    try {
      await ses().fetch(IDENTITY + '/um/v1/login/refresh', { method: 'POST', credentials: 'include', headers: { Origin: 'https://app.tradesea.ai' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
      flushToDisk(); // the renewed cookies are what keeps you signed in next time
    } catch (e) { /* offline — the next request tries again */ }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function getData(url, body) {
  const r = await ses().fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: Object.assign({ Origin: 'https://app.tradesea.ai' }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  });
  if (r.status === 401 || r.status === 403) { const e = new Error('signed out'); e.signedOut = true; throw e; }
  if (!r.ok) throw new Error('TradeSea answered ' + r.status);
  const j = await r.json();
  if (j.s !== 'ok' && j.s !== 'success') throw new Error(j.errmsg || 'TradeSea error');
  return j.d;
}
async function withSignIn(url, body) {
  try { return await getData(url, body); }
  catch (e) {
    if (!e.signedOut) throw e;
    await renewSignIn();
    return getData(url, body);
  }
}

function initTradeSea() {
  ipcMain.on('lvd-ts-tab-state', e => {
    try { e.returnValue = JSON.parse(fs.readFileSync(sessionFile(), 'utf8')); } catch (err) { e.returnValue = null; }
  });
  app.on('before-quit', () => { quitting = true; });
  setInterval(saveTradeSea, 30000);
  ['suspend', 'lock-screen', 'shutdown'].forEach(ev => powerMonitor.on(ev, saveTradeSea));
  ipcMain.handle('lvd-ts-open', () => { openWindow(true); return true; });
  ipcMain.handle('lvd-ts-accounts', async () => {
    try {
      const d = await withSignIn(IDENTITY + '/eum/v2/accountsWithDetails');
      return {
        accounts: (d.accountList || []).map(a => ({
          id: a.id, name: a.name, firm: a.propFirmDisplayName || a.propFirm || '',
          demo: a.propFirm === 'sandbox' || /demo/i.test(a.name || ''),
          created: a.creationTs || null
        }))
      };
    } catch (e) {
      return e.signedOut ? { signedOut: true } : { error: e.message };
    }
  });
  ipcMain.handle('lvd-ts-executions', async (e, accountId, instrument) => {
    if (typeof accountId !== 'string' || !/^[\w:-]+$/.test(String(instrument))) return { error: 'bad request' };
    try {
      const url = TRADE_READ + '/v1/accounts/' + encodeURIComponent(accountId) + '/executions?locale=en-US&maxCount=100&instrument=' + encodeURIComponent(instrument);
      return { executions: await withSignIn(url) };
    } catch (err) {
      return err.signedOut ? { signedOut: true } : { error: err.message };
    }
  });
  // finished trades between two dates (TradeSea allows at most 7 days per request)
  ipcMain.handle('lvd-ts-history', async (e, accountId, from, to) => {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof accountId !== 'string' || !day.test(from) || !day.test(to)) return { error: 'bad request' };
    try {
      const d = await withSignIn(DISCOVERY + '/tradelens/v2/trades', {
        accountIds: [accountId], archivedAccountIds: [], from, to,
        timezoneOffset: new Date().getTimezoneOffset(), useTradingDay: true
      });
      return { trades: (d.tradesList || []).flatMap(x => x.trades || []) };
    } catch (err) {
      return err.signedOut ? { signedOut: true } : { error: err.message };
    }
  });
  // a picture of the TradeSea window as it is right now (null when it isn't open or is minimised)
  ipcMain.handle('lvd-ts-capture', async () => {
    if (!tsWin || tsWin.isDestroyed() || !tsWin.isVisible() || tsWin.isMinimized()) return null;
    try {
      // a window that's partly covered can stall the capture on Windows: keep it painting
      // (stayAwake) and never wait more than 8 seconds for the picture
      let img = await within(tsWin.webContents.capturePage(undefined, { stayAwake: true }), 8000, null);
      if (!img || img.isEmpty()) return null;
      const { width } = img.getSize();
      if (width > 1600) img = img.resize({ width: 1600, quality: 'best' });
      return 'data:image/jpeg;base64,' + img.toJPEG(82).toString('base64');
    } catch (e) { return null; }
  });
}

module.exports = { initTradeSea, saveTradeSea };
