// TradeSea connection for the auto journal. TradeSea runs in its own Larpenator window (its own
// cookie jar, "persist:tradesea"); you sign in there yourself and Larpenator never sees the password.
// The page asks this module for your accounts and executions using that sign-in, and for a picture
// of the TradeSea chart when a trade closes. Deciding what becomes a journal entry happens in the page.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const PARTITION = 'persist:tradesea';
const APP_URL = 'https://app.tradesea.ai/trade';
const IDENTITY = 'https://prod-identity.tradesea.ai';
const TRADE_READ = 'https://prod-trade-read.tradesea.ai';
const DISCOVERY = 'https://prod-discovery.tradesea.ai'; // Compass, TradeSea's own journal: finished trades by date

let tsWin = null;
let refreshing = null;
const ses = () => session.fromPartition(PARTITION);
const boundsFile = () => path.join(app.getPath('userData'), 'tradesea-window.json');

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
    webPreferences: { partition: PARTITION, backgroundThrottling: false }
  }));
  const saveBounds = () => { try { if (!tsWin.isMinimized() && !tsWin.isMaximized()) fs.writeFileSync(boundsFile(), JSON.stringify(tsWin.getBounds())); } catch (e) {} };
  tsWin.on('resize', saveBounds);
  tsWin.on('move', saveBounds);
  tsWin.on('closed', () => { tsWin = null; });
  tsWin.loadURL(APP_URL);
  return tsWin;
}

// TradeSea's page renews its own sign-in when it loads, so an expired sign-in gets one quiet
// page load in a hidden window before we give up and ask you to sign in again
function renewSignIn() {
  if (refreshing) return refreshing;
  refreshing = new Promise(resolve => {
    const already = tsWin && !tsWin.isDestroyed();
    const w = already ? tsWin : openWindow(false);
    if (already) w.webContents.reload();
    setTimeout(() => { if (!already && w && !w.isDestroyed() && !w.isVisible()) w.destroy(); resolve(); }, 15000);
  }).finally(() => { refreshing = null; });
  return refreshing;
}

async function getData(url, body) {
  const r = await ses().fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: Object.assign({ Origin: 'https://app.tradesea.ai' }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
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
      let img = await tsWin.webContents.capturePage();
      if (img.isEmpty()) return null;
      const { width } = img.getSize();
      if (width > 1600) img = img.resize({ width: 1600, quality: 'best' });
      return 'data:image/jpeg;base64,' + img.toJPEG(82).toString('base64');
    } catch (e) { return null; }
  });
}

module.exports = { initTradeSea };
