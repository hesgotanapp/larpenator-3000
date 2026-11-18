// Runs in the TradeSea window before TradeSea's own code: puts back the tab state (chart layout,
// drawings, chosen account) Larpenator saved last time, the way a browser restores a tab.
const { ipcRenderer } = require('electron');

if (location.origin === 'https://app.tradesea.ai' && window.top === window && sessionStorage.length === 0) {
  const saved = ipcRenderer.sendSync('lvd-ts-tab-state');
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved)) {
      try { sessionStorage.setItem(k, v); } catch (e) { /* storage full — skip that one */ }
    }
  }
}
