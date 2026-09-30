(function () {
  // ---------- local cache helpers (mirrors desktop's localStorage schema) ----------
  function loadJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  const SETUP_TYPE_LABELS = { continuation: 'Continuation', reversal: 'Reversal', judas: 'Judas Swing' };
  function setupTypeLabel(t) { return SETUP_TYPE_LABELS[t] || t; }
  const SESSION_LABELS = { asia: 'Asia', london: 'London', ny: 'New York' };
  function sessionLabel(s) { return SESSION_LABELS[s] || s; }
  const KEYS = {
    entries: 'lvd_journal_entries',
    premarket: 'lvd_premarket_entries',
    rulebook: 'lvd_rulebook',
    goals: 'lvd_goals',
    weeklyReviews: 'lvd_weekly_reviews',
    mistakeTags: 'lvd_mistake_tags',
    checklistCategories: 'lvd_checklist_categories',
    focusRules: 'lvd_focus_rules',
    focusIndex: 'lvd_focus_index',
    milestone: 'lvd_milestone',
    algoPnl: 'lvd_algo_pnl',
    achievements: 'lvd_achievements',
    premarketTicks: 'lvd_premarket_ticks'
  };

  let entries = loadJSON(KEYS.entries, []);
  let premarketEntries = loadJSON(KEYS.premarket, []);
  let achievements = loadJSON(KEYS.achievements, []);
  function persistAchievements() { localStorage.setItem(KEYS.achievements, JSON.stringify(achievements)); }
  let rulebook = loadJSON(KEYS.rulebook, { entry: '', exit: '', risk: '', hours: '', notes: '' });
  let goals = loadJSON(KEYS.goals, []);
  let weeklyReviews = loadJSON(KEYS.weeklyReviews, {});
  let mistakeTags = loadJSON(KEYS.mistakeTags, []);
  let checklistCategories = loadJSON(KEYS.checklistCategories, {
    continuation: ['Higher timeframe bias confirmed', 'Key level reacted as expected', 'Risk defined before entry', 'Setup matches the rulebook'],
    reversal: ['Clear reversal candle or pattern confirmed', 'Divergence or exhaustion signal present', 'Key level held or reclaimed', 'Volume confirms the reversal']
  });
  let focusRules = loadJSON(KEYS.focusRules, []);
  let focusIndex = parseInt(localStorage.getItem(KEYS.focusIndex), 10) || 0;
  let milestone = loadJSON(KEYS.milestone, { label: 'Monthly P&L Goal', goal: 10000 });
  let algoPnl = loadJSON(KEYS.algoPnl, {});
  let premarketTicks = loadJSON(KEYS.premarketTicks, {});
  function savePremarketTicks() { localStorage.setItem(KEYS.premarketTicks, JSON.stringify(premarketTicks)); if (window.LvdSync && LvdSync.isSupported) LvdSync.pushSettings(); }

  function persistEntries() { localStorage.setItem(KEYS.entries, JSON.stringify(entries)); }
  function persistPremarket() { localStorage.setItem(KEYS.premarket, JSON.stringify(premarketEntries)); }
  function persistSettings() {
    localStorage.setItem(KEYS.rulebook, JSON.stringify(rulebook));
    localStorage.setItem(KEYS.goals, JSON.stringify(goals));
    localStorage.setItem(KEYS.weeklyReviews, JSON.stringify(weeklyReviews));
    localStorage.setItem(KEYS.mistakeTags, JSON.stringify(mistakeTags));
    localStorage.setItem(KEYS.checklistCategories, JSON.stringify(checklistCategories));
    localStorage.setItem(KEYS.focusRules, JSON.stringify(focusRules));
    localStorage.setItem(KEYS.focusIndex, String(focusIndex));
    localStorage.setItem(KEYS.milestone, JSON.stringify(milestone));
    localStorage.setItem(KEYS.algoPnl, JSON.stringify(algoPnl));
    localStorage.setItem(KEYS.premarketTicks, JSON.stringify(premarketTicks));
  }
  function settingsSnapshot() {
    return { rulebook, goals, weeklyReviews, mistakeTags, checklistCategories, focusRules, focusIndex, milestone, algoPnl, premarketTicks, timeZone: localStorage.getItem(TZ_KEY) || 'device' };
  }
  function applySettingsSnapshot(s) {
    if (s.rulebook) rulebook = s.rulebook;
    if (Array.isArray(s.goals)) goals = s.goals;
    if (s.weeklyReviews) weeklyReviews = s.weeklyReviews;
    if (Array.isArray(s.mistakeTags)) mistakeTags = s.mistakeTags;
    if (s.checklistCategories) checklistCategories = s.checklistCategories;
    if (Array.isArray(s.focusRules)) focusRules = s.focusRules;
    if (typeof s.focusIndex === 'number') focusIndex = s.focusIndex;
    if (s.milestone) milestone = s.milestone;
    if (s.algoPnl) algoPnl = s.algoPnl;
    if (s.premarketTicks && typeof s.premarketTicks === 'object') premarketTicks = s.premarketTicks;
    if (typeof s.timeZone === 'string') { if (s.timeZone === 'device') localStorage.removeItem(TZ_KEY); else localStorage.setItem(TZ_KEY, s.timeZone); setTimeout(() => { checkTradingDay(); renderTimeZoneSetting(); }, 0); }
    persistSettings();
  }


  // ---------- premarket by session: daily ticks + streak ----------
  // premarketTicks = { 'YYYY-MM-DD': { asia: true, london: true, ny: true } }, synced with the settings doc.
  const PM_SESSIONS = ['asia', 'london', 'ny'];
  function premarketTickedOn(dateStr) { const t = premarketTicks[dateStr]; return !!t && PM_SESSIONS.some(s => t[s]); }
  // Days in a row with at least one session ticked, counting back from today. Weekends never break
  // it (they only count if you ticked something), and today only counts once you've ticked it.
  function premarketStreak() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (!premarketTickedOn(toDateStr(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    for (let guard = 0; guard < 3700; guard++) {
      const ticked = premarketTickedOn(toDateStr(d)), wd = d.getDay();
      if (ticked) n++;
      else if (wd !== 0 && wd !== 6) break;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }
  function setPremarketTick(dateStr, sess, on) {
    const t = Object.assign({}, premarketTicks[dateStr] || {});
    if (on) t[sess] = true; else delete t[sess];
    if (Object.keys(t).length) premarketTicks[dateStr] = t; else delete premarketTicks[dateStr];
    savePremarketTicks();
  }
  // the first session on this date without a note, so a new note starts on the right one
  function defaultPmSession(dateStr) {
    const now = new Date();
    let order = PM_SESSIONS.slice();
    if (!dateStr || dateStr === todayStr) order.sort((a, b) => minutesToSessionOpen(a, now) - minutesToSessionOpen(b, now));
    return order.find(s => !premarketEntries.some(p => p.date === dateStr && p.session === s)) || order[0];
  }
  function pmSessionBoxesHTML(dateStr) {
    const t = premarketTicks[dateStr] || {};
    const streak = premarketStreak();
    const logged = s => premarketEntries.some(p => p.date === dateStr && p.session === s);
    return `<div class="pm-sess-head"><span>Premarket by session</span><span class="pm-streak${streak ? ' on' : ''}" title="Days in a row with at least one premarket ticked. Weekends don't break it."><svg viewBox="0 0 40 54" aria-hidden="true"><path d="M20 2C15 10 8 14 8 26a12 12 0 0 0 24 0c0-5-2.5-8.5-5-11 1 3-1 6-1 6s1-4-2-8c-1.5-2-3-4.5-4-11Z" fill="currentColor"/></svg><b>${streak}</b> day${streak === 1 ? '' : 's'}</span></div>
      <div class="pm-boxes">${PM_SESSIONS.map(s => `<button type="button" class="pm-box${t[s] ? ' on' : ''}" data-pmtick="${s}" aria-pressed="${!!t[s]}"><span class="pm-box-chk"><svg viewBox="0 0 12 12"><path d="M2 6.5l2.6 2.5L10 3"/></svg></span><span class="pm-box-name">${SESSION_LABELS[s]}</span><span class="pm-box-sub">${logged(s) ? 'Note logged' : `<span class="pm-log" data-pmlog="${s}">Log note</span>`}</span></button>`).join('')}</div>`;
  }

  // ---------- helpers ----------
  function fmtMoney(n) { n = n || 0; const sign = n < 0 ? '-' : ''; return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  function fmtMoneyShort(n) { n = n || 0; const sign = n < 0 ? '-' : '+'; const a = Math.abs(n); return sign + '$' + (a >= 1000 ? (a / 1000).toFixed(1) + 'k' : Math.round(a)); }
  function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function fmtDateShort(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function fmtDate(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  function startOfWeek(d) { const dt = new Date(d); dt.setDate(dt.getDate() - dt.getDay()); dt.setHours(0, 0, 0, 0); return dt; }
  function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str == null ? '' : String(str); return div.innerHTML; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function computeStats(list) {
    const wins = list.filter(e => e.result === 'win').length;
    const losses = list.filter(e => e.result === 'loss').length;
    const be = list.filter(e => e.result === 'breakeven').length;
    const totalPnl = list.reduce((s, e) => s + (e.pnl || 0), 0);
    const decisive = wins + losses;
    const winRate = decisive ? Math.round((wins / decisive) * 100) : 0;
    const grossWin = list.filter(e => (e.pnl || 0) > 0).reduce((s, e) => s + e.pnl, 0);
    const grossLoss = Math.abs(list.filter(e => (e.pnl || 0) < 0).reduce((s, e) => s + e.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
    const avgWin = wins ? list.filter(e => e.result === 'win').reduce((s, e) => s + (e.pnl || 0), 0) / wins : 0;
    const avgLoss = losses ? list.filter(e => e.result === 'loss').reduce((s, e) => s + (e.pnl || 0), 0) / losses : 0;
    const rulesBrokenCount = list.filter(e => e.rulesBroken).length;
    return { wins, losses, be, totalPnl, winRate, grossWin, grossLoss, profitFactor, avgWin, avgLoss, rulesBrokenCount };
  }
  function currentStreak(list) {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const decisive = sorted.filter(e => e.result !== 'breakeven');
    if (!decisive.length) return null;
    const kind = decisive[0].result;
    let count = 0;
    for (const e of decisive) { if (e.result === kind) count++; else break; }
    return { kind, count };
  }
  function longestStreaks(list) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    let bestWin = 0, bestLoss = 0, run = 0, kind = null;
    for (const e of sorted) {
      if (e.result === 'breakeven') continue;
      if (e.result === kind) run++; else { kind = e.result; run = 1; }
      if (kind === 'win') bestWin = Math.max(bestWin, run); else bestLoss = Math.max(bestLoss, run);
    }
    return { bestWin, bestLoss };
  }
  function compressImage(img, maxW) {
    maxW = maxW || 900;
    const scale = Math.min(1, maxW / img.width);
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.8);
  }
  function getSharedBgPhotos() { try { return JSON.parse(localStorage.getItem('lvd_shared_bg_photos') || '[]'); } catch (e) { return []; } }
  function getLossBgPhotos() { try { return JSON.parse(localStorage.getItem('lvd_loss_bg_photos') || '[]'); } catch (e) { return []; } }
  function photosForEntry(e) {
    if (e.result === 'loss') { const l = getLossBgPhotos(); if (l.length) return l; }
    return getSharedBgPhotos();
  }

  // ---------- decorative trade line chart (mirrors desktop tradeChartSVG) ----------
  function hashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function tradeChartSVG(e) {
    const rng = mulberry32(hashSeed(e.id));
    const n = 22;
    const drift = e.result === 'win' ? 0.62 : e.result === 'loss' ? -0.62 : 0.02;
    let v = 0.45 + (rng() - 0.5) * 0.15;
    const raw = [v];
    for (let i = 1; i < n; i++) { v = Math.max(0.04, Math.min(0.96, v + (rng() - 0.5) * 0.34 + drift / n)); raw.push(v); }
    const lo = Math.min(...raw), hi = Math.max(...raw), range = Math.max(0.001, hi - lo);
    const norm = raw.map(x => (x - lo) / range);
    const W = 176, H = 126, padX = 12, padY = 20;
    const pts = norm.map((val, i) => [padX + (i / (n - 1)) * (W - padX * 2), padY + (1 - val) * (H - padY * 2)]);
    const buyRange = pts.slice(0, Math.ceil(n * 0.6));
    let buyIdx = 0; buyRange.forEach((p, i) => { if (p[1] > buyRange[buyIdx][1]) buyIdx = i; });
    const sellSlice = pts.slice(buyIdx + 1);
    let sellIdx = buyIdx + 1;
    if (sellSlice.length) { let b = 0; sellSlice.forEach((p, i) => { if (p[1] < sellSlice[b][1]) b = i; }); sellIdx = Math.min(buyIdx + 1 + b, n - 1); }
    const uid = 'g' + hashSeed(e.id).toString(36);
    const mk = (pt, label, color) => `<g transform="translate(${pt[0]},${pt[1] - 13})"><rect x="-7" y="-7" width="14" height="14" rx="4" fill="${color}" transform="rotate(45)"></rect><text x="0" y="3" text-anchor="middle" font-family="'Plus Jakarta Sans',sans-serif" font-size="8" font-weight="800" fill="#0a0a0b">${label}</text></g>`;
    return `<svg class="tcard-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="${uid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" filter="url(#${uid})"/>
      ${mk(pts[buyIdx], 'B', '#30d68a')}${mk(pts[sellIdx], 'S', '#ef6a5f')}</svg>`;
  }
  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }


  // ---------- time zone + trading day ----------
  // Your time zone (Settings, synced; defaults to this device's) decides what "today" is. The trading day
  // runs until New York closes when that lands in your morning (about 6-7 AM in Melbourne), so a New York
  // premarket or trade after midnight still counts for the evening before. Elsewhere it turns at midnight.
  const TZ_KEY = 'lvd_timezone';
  const SESSION_MARKETS = { asia: { tz: 'Asia/Tokyo', open: 9 * 60 }, london: { tz: 'Europe/London', open: 8 * 60 }, ny: { tz: 'America/New_York', open: 9 * 60 + 30 } };
  const TZ_CHOICES = [
    ['Australia/Melbourne', 'Melbourne'], ['Australia/Sydney', 'Sydney'], ['Australia/Brisbane', 'Brisbane'], ['Australia/Adelaide', 'Adelaide'],
    ['Australia/Perth', 'Perth'], ['Pacific/Auckland', 'Auckland'], ['Asia/Tokyo', 'Tokyo'], ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Singapore', 'Singapore'],
    ['Asia/Kolkata', 'India'], ['Asia/Dubai', 'Dubai'], ['Africa/Johannesburg', 'Johannesburg'], ['Europe/London', 'London'], ['Europe/Berlin', 'Berlin / Paris'],
    ['America/New_York', 'New York'], ['America/Toronto', 'Toronto'], ['America/Chicago', 'Chicago'], ['America/Denver', 'Denver'], ['America/Los_Angeles', 'Los Angeles'], ['America/Sao_Paulo', 'São Paulo']
  ];
  function deviceTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } }
  function userTimeZone() {
    let tz = null;
    try { tz = localStorage.getItem(TZ_KEY); } catch (e) {}
    if (tz && tz !== 'device') { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch (e) {} }
    return deviceTimeZone();
  }
  function zonedParts(date, tz) {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
    const g = t => (p.find(x => x.type === t) || {}).value;
    return { y: +g('year'), m: +g('month'), d: +g('day'), h: (+g('hour')) % 24, min: +g('minute'), wd: g('weekday') };
  }
  function tzOffsetMin(date, tz) {
    const z = zonedParts(date, tz);
    return Math.round((Date.UTC(z.y, z.m - 1, z.d, z.h, z.min) - Math.floor(date.getTime() / 60000) * 60000) / 60000);
  }
  // when the trading day turns over, in minutes after local midnight (0 = midnight)
  function tradingRolloverMin(now, tz) {
    const nyCloseUtc = 16 * 60 - tzOffsetMin(now, 'America/New_York');
    const local = ((nyCloseUtc + tzOffsetMin(now, tz)) % 1440 + 1440) % 1440;
    return local <= 12 * 60 ? local : 0;
  }
  function tradingDateStr(now) {
    now = now || new Date();
    const tz = userTimeZone();
    const z = zonedParts(new Date(now.getTime() - tradingRolloverMin(now, tz) * 60000), tz);
    return `${z.y}-${String(z.m).padStart(2, '0')}-${String(z.d).padStart(2, '0')}`;
  }
  function dateFromStr(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  // minutes until a session opens in its own market; a session that opened under 90 minutes ago counts as "now"
  function minutesToSessionOpen(sess, now) {
    const m = SESSION_MARKETS[sess], z = zonedParts(now, m.tz);
    let diff = m.open - (z.h * 60 + z.min);
    if (diff < -90) diff += 1440;
    return diff;
  }
  function fmtClock(min) { const h = Math.floor(min / 60), m = min % 60; return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function tzOptionsHTML() {
    const now = new Date(), dev = deviceTimeZone();
    const off = tz => { const o = tzOffsetMin(now, tz), s = o < 0 ? '-' : '+', a = Math.abs(o); return 'UTC' + s + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''); };
    const cur = (() => { try { return localStorage.getItem(TZ_KEY) || 'device'; } catch (e) { return 'device'; } })();
    const devLabel = (TZ_CHOICES.find(c => c[0] === dev) || [dev, dev.split('/').pop().replace(/_/g, ' ')])[1];
    return `<option value="device"${cur === 'device' ? ' selected' : ''}>This device (${devLabel}, ${off(dev)})</option>` +
      TZ_CHOICES.map(([id, name]) => `<option value="${id}"${cur === id ? ' selected' : ''}>${name} (${off(id)})</option>`).join('');
  }
  function tzNoteText() {
    const tz = userTimeZone(), roll = tradingRolloverMin(new Date(), tz);
    const opens = ['asia', 'london', 'ny'].map(s => {
      const m = SESSION_MARKETS[s], now = new Date();
      const utc = m.open - tzOffsetMin(now, m.tz), local = ((utc + tzOffsetMin(now, tz)) % 1440 + 1440) % 1440;
      return `${SESSION_LABELS[s]} ${fmtClock(local)}`;
    }).join(' · ');
    return `Session opens in your time: ${opens}. ` + (roll ? `Your trading day runs until New York closes at ${fmtClock(roll)}, so anything before then counts for the day before.` : 'Your trading day turns over at midnight.');
  }

  let todayStr = tradingDateStr();
  let todayDate = dateFromStr(todayStr);
  let calYear = todayDate.getFullYear(), calMonth = todayDate.getMonth();
  let reviewWeekStart = startOfWeek(todayDate);
  let activeChecklistCat = 'continuation';
  let editingEntryId = null;
  let editingPremarketId = null;

  // ---------- tabs: the same five places as the desktop app ----------
  const TAB_GROUPS = {
    today: [['dashboard', 'Overview'], ['premarket', 'Premarket']],
    journal: [['entries', 'Entries'], ['calendar', 'Calendar']],
    review: [['weekly', 'Weekly review']],
    playbook: [['checklist', 'Checklist']],
    library: [['achievements', 'Achievements'], ['more', 'Account']]
  };
  const SCREEN_GROUP = {};
  Object.entries(TAB_GROUPS).forEach(([g, list]) => list.forEach(([sc]) => { SCREEN_GROUP[sc] = g; }));
  Object.values(TAB_GROUPS).forEach(list => {
    if (list.length < 2) return;
    list.forEach(([sc]) => {
      const screen = document.getElementById('screen-' + sc);
      if (!screen) return;
      const strip = document.createElement('div');
      strip.className = 'subtabs';
      strip.innerHTML = list.map(([t, label]) => `<button type="button" data-goto="${t}" class="${t === sc ? 'on' : ''}">${label}</button>`).join('');
      screen.insertBefore(strip, screen.firstChild);
    });
  });
  document.querySelectorAll('.subtabs [data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.goto)));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(TAB_GROUPS[btn.dataset.tab][0][0]));
  });
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === SCREEN_GROUP[name]));
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    document.getElementById('screens').scrollTop = 0;
    if (name === 'dashboard') renderDashboard();
    if (name === 'entries') renderEntriesList();
    if (name === 'premarket') renderPremarketScreen();
    if (name === 'more') document.getElementById('more-email').textContent = (LvdSync.getUser() || {}).email || '';
    if (name === 'calendar') renderCalendar();
    if (name === 'checklist') renderChecklistScreen();
    if (name === 'weekly') renderWeeklyScreen();
    if (name === 'achievements') renderAchievements();
  }
  document.querySelectorAll('.more-item[data-goto]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.goto));
  });

  // ---------- sheet (modal) ----------
  const sheetBackdrop = document.getElementById('sheet-backdrop');
  const sheet = document.getElementById('sheet');
  function openSheet(title, bodyHtml) {
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-body').innerHTML = bodyHtml;
    sheetBackdrop.classList.add('open');
    sheet.classList.add('open');
  }
  function closeSheet() {
    sheetBackdrop.classList.remove('open');
    sheet.classList.remove('open');
    editingEntryId = null;
    editingPremarketId = null;
    editingAchId = null;
  }
  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  sheetBackdrop.addEventListener('click', closeSheet);

  document.getElementById('fab').addEventListener('click', () => {
    const active = document.querySelector('.screen.active').id.replace('screen-', '');
    if (active === 'premarket') openPremarketForm();
    else if (active === 'achievements') openAchievementForm();
    else openEntryForm();
  });

  // ---------- Dashboard (Terminal layout) ----------
  function drawEquitySpark(canvas, list) {
    const sparkSig = (canvas.clientWidth || 0) + '|' + (canvas.clientHeight || 0) + '|' + (document.documentElement.getAttribute('data-palette') || '') + '|' + list.map(e => e.id + ':' + (e.pnl || 0) + ':' + e.date).join(',');
    if (canvas._sparkSig === sparkSig && canvas._sparkTok) return;
    canvas._sparkSig = sparkSig;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 330, cssH = canvas.clientHeight || 52;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    if (sorted.length < 2) return;
    let cum = 0; const series = [0];
    sorted.forEach(e => { cum += e.pnl || 0; series.push(cum); });
    const lo = Math.min(...series), hi = Math.max(...series), rng = (hi - lo) || 1;
    const pad = 4;
    const pts = series.map((v, i) => [(i / (series.length - 1)) * cssW, pad + (1 - (v - lo) / rng) * (cssH - pad * 2)]);
    const up = series[series.length - 1] >= 0;
    const col = getComputedStyle(document.documentElement).getPropertyValue(up ? '--green' : '--red').trim() || (up ? '#3ddc97' : '#f07167');
    const grad = ctx.createLinearGradient(0, 0, 0, cssH);
    grad.addColorStop(0, col + '38');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    const paint = (p) => {
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cssW * p + 1, cssH); ctx.clip();
    ctx.beginPath(); ctx.moveTo(pts[0][0], cssH);
    pts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(pts[pts.length - 1][0], cssH); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.shadowColor = col + '80'; ctx.shadowBlur = 6;
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();
    if (p >= 1) { const last = pts[pts.length - 1]; ctx.beginPath(); ctx.arc(last[0], last[1], 3, 0, 7); ctx.fillStyle = col; ctx.fill(); }
    };
    const tok = canvas._sparkTok = {};
    if (reduceMotion()) { paint(1); return; }
    const t0 = performance.now();
    const step = now => { const p = Math.min(1, (now - t0) / 1000); paint(1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(step); else sparkAmbient(canvas, tok, ctx, pts, col, paint); };
    requestAnimationFrame(step);
  }
  // looping touches on the sparkline: a light travels along the line, the end dot pings
  function sparkAmbient(canvas, tok, ctx, pts, col, paint) {
    const segs = [0];
    for (let i = 1; i < pts.length; i++) segs.push(segs[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = segs[segs.length - 1] || 1;
    const at = f => {
      const d = Math.max(0, Math.min(1, f)) * total;
      let i = 1; while (i < segs.length - 1 && segs[i] < d) i++;
      const t = (d - segs[i - 1]) / ((segs[i] - segs[i - 1]) || 1);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    };
    const last = pts[pts.length - 1];
    const start = performance.now();
    const frame = now => {
      if (canvas._sparkTok !== tok || !canvas.isConnected) return;
      if (document.hidden || document.documentElement.classList.contains('calm') || !canvas.offsetParent) {
        paint(1); setTimeout(() => requestAnimationFrame(frame), 600); return;
      }
      paint(1);
      const t = (now - start) / 1000;
      // comet: 3.2s run, then a 3.8s rest
      const c = (t % 7) / 3.2;
      if (c < 1) {
        const e = c < .5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
        ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10;
        for (let k = 10; k >= 0; k--) {
          const q = at(e - k * 0.006);
          ctx.globalAlpha = (1 - k / 11) * Math.min(1, c * 8, (1 - c) * 8);
          ctx.beginPath(); ctx.arc(q[0], q[1], k ? 1.6 : 2.4, 0, 7); ctx.fillStyle = k ? col : '#f2fff8'; ctx.fill();
        }
        ctx.restore();
      }
      // end dot ping every 2.6s
      const r = (t % 2.6) / 2.6;
      ctx.save(); ctx.globalAlpha = 0.9 * (1 - r);
      ctx.beginPath(); ctx.arc(last[0], last[1], 3 + r * 9, 0, 7); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function reduceMotion() { if (window.lvdMotion) return window.lvdMotion.reduced(); return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  const countMemory = {};
  function countTo(el, target, key) {
    const show = v => { el.textContent = (v > 0.004 ? '+' : v < -0.004 ? '-' : '') + fmtMoney(Math.abs(v)); };
    const from = key in countMemory ? countMemory[key] : 0;
    countMemory[key] = target;
    if (reduceMotion() || Math.abs(target - from) < 0.005) { show(target); return; }
    const t0 = performance.now();
    const step = now => { const p = Math.min(1, (now - t0) / 900); show(from + (target - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function flameSVG(kind) {
    const base = kind === 'win' ? '#30d68a' : kind === 'loss' ? '#ef6a5f' : '#f0954a';
    return `<svg class="flame" viewBox="0 0 40 54"><path d="M20 2C15 10 8 14 8 26a12 12 0 0 0 24 0c0-5-2.5-8.5-5-11 1 3-1 6-1 6s1-4-2-8c-1.5-2-3-4.5-4-11Z" fill="${base}"/></svg>`;
  }
  let lastStreakSeen = null;
  // tape: the last trades scroll across the top of Today
  function renderTape(list) {
    const tape = document.getElementById('dash-tape'), run = document.getElementById('dash-tape-run');
    const recent = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
    tape.hidden = !recent.length;
    if (!recent.length) { run.innerHTML = ''; return; }
    const item = e => {
      const p = e.pnl || 0, cls = p > 0 ? 'pos' : p < 0 ? 'neg' : 'be';
      const res = e.result === 'breakeven' ? 'BE' : e.result === 'win' ? 'W' : e.result === 'loss' ? 'L' : '';
      return `<span class="tape-item"><span class="t-d">${fmtDateShort(e.date).toUpperCase()}</span><span class="t-s">${escapeHtml(e.symbol || '—')}</span><span class="t-p ${cls}">${res ? res + ' ' : ''}${p > 0 ? '+' : ''}${fmtMoney(p)}</span></span>`;
    };
    let half = recent.map(item);
    while (half.length < 8) half = half.concat(recent.map(item));
    const tapeHTML = half.join('') + half.join('');
    if (run._lvdHTML !== tapeHTML) { run.innerHTML = tapeHTML; run._lvdHTML = tapeHTML; }
    run.style.setProperty('--tape-dur', Math.max(24, half.length * 3.4) + 's');
  }
  function renderDashboard() {
    renderTape(entries);
    const s = computeStats(entries);
    const todayEntries = entries.filter(e => e.date === todayStr);
    const todayPnl = todayEntries.reduce((sum, e) => sum + (e.pnl || 0), 0);
    const monthPrefix = todayStr.slice(0, 7);
    const monthList = entries.filter(e => e.date && e.date.startsWith(monthPrefix));
    const ms = computeStats(monthList);
    const monthName = todayDate.toLocaleDateString(undefined, { month: 'long' });
    const todayPremarket = premarketEntries.find(p => p.date === todayStr);

    const hr = new Date().getHours();
    document.getElementById('dash-greeting').textContent = `Good ${hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'}, Kaine`;
    document.getElementById('dash-subline').textContent = `${todayDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · ${todayEntries.length} trade${todayEntries.length === 1 ? '' : 's'} today`;

    // this month on the equity sparkline, all-time total alongside
    document.getElementById('dash-month-label').textContent = `${monthName} P&L`;
    document.getElementById('dash-alltime').innerHTML = `all time <b class="${s.totalPnl >= 0 ? 'pos' : 'neg'}">${(s.totalPnl >= 0 ? '+' : '') + fmtMoneyShort(s.totalPnl).replace('+', '')}</b>`;
    const total = document.getElementById('dash-total');
    countTo(total, ms.totalPnl, 'month');
    total.className = 'sbig ' + (ms.totalPnl > 0 ? 'pos' : ms.totalPnl < 0 ? 'neg' : '');
    document.getElementById('dash-meta').textContent = `${monthList.length} entries · ${ms.wins}W ${ms.losses}L ${ms.be}BE`;
    drawEquitySpark(document.getElementById('dash-spark'), monthList);
    document.getElementById('dash-strip').innerHTML = `
      <div><div class="k">Win rate</div><div class="v">${ms.winRate}%</div></div>
      <div><div class="k">Profit factor</div><div class="v">${isFinite(ms.profitFactor) ? ms.profitFactor.toFixed(2) : '∞'}</div></div>
      <div><div class="k">Today</div><div class="v ${todayPnl > 0 ? 'pos' : todayPnl < 0 ? 'neg' : ''}">${fmtMoneyShort(todayPnl)}</div></div>`;

    // monthly goal — counts only this calendar month, same as desktop
    const goal = milestone && milestone.goal > 0 ? milestone.goal : 0;
    const pct = goal ? Math.max(0, Math.min(100, (ms.totalPnl / goal) * 100)) : 0;
    document.getElementById('dash-goal').innerHTML = `
      <div class="slbl"><span>${monthName} goal</span></div>
      <div class="smid">${Math.round(pct)}%</div>
      <div class="strack"><i data-w="${pct}"></i></div>
      <div class="ssmall">${fmtMoneyShort(ms.totalPnl).replace('+', '')} / ${fmtMoneyShort(goal).replace('+', '')}</div>`;

    const streak = currentStreak(entries);
    const runs = longestStreaks(entries);
    const streakEl = document.getElementById('dash-streak');
    const grew = !!lastStreakSeen && streak && streak.kind === 'win' && (lastStreakSeen.kind !== 'win' || streak.count > lastStreakSeen.count);
    lastStreakSeen = streak ? { kind: streak.kind, count: streak.count } : null;
    if (streak) {
      const col = streak.kind === 'win' ? 'var(--green)' : streak.kind === 'loss' ? 'var(--red)' : 'var(--amber)';
      const last10 = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 10).reverse();
      streakEl.innerHTML = `
        <div class="slbl"><span>Streak</span>${flameSVG(streak.kind)}</div>
        <div class="smid" style="color:${col};">${streak.count}${streak.kind === 'win' ? 'W' : streak.kind === 'loss' ? 'L' : 'BE'}</div>
        <div class="spips">${last10.map((e, i) => `<i class="${e.result}${grew && i === last10.length - 1 ? ' fresh' : ''}"></i>`).join('')}</div>
        <div class="ssmall">best ${runs.bestWin}W · worst ${runs.bestLoss}L</div>`;
    } else {
      streakEl.innerHTML = `<div class="slbl"><span>Streak</span></div><div class="ssmall">No trades yet</div>`;
    }

    const bar = document.querySelector('#dash-goal .strack i');
    if (bar) requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = bar.dataset.w + '%'; }));
    const focus = focusRules.length ? focusRules[Math.min(focusIndex, focusRules.length - 1)] : '';
    let excerpt = '';
    if (todayPremarket) {
      const sc = (todayPremarket.scenarios || []).find(x => x.label || x.body);
      excerpt = todayPremarket.outlook || (sc ? (sc.label || sc.body) : '') || todayPremarket.levels || '';
      if (excerpt.length > 90) excerpt = excerpt.slice(0, 90) + '…';
    }
    const loggedSessions = PM_SESSIONS.filter(x => premarketEntries.some(p => p.date === todayStr && p.session === x));
    document.getElementById('dash-before').innerHTML = `
      <div class="slbl"><span>Before you trade</span></div>
      <div class="bt-row" ${todayPremarket ? '' : 'data-goto-premarket'}>
        <span class="bt-chk ${todayPremarket ? 'done' : ''}">${todayPremarket ? '✓' : ''}</span>
        <div><div>${todayPremarket ? (loggedSessions.length ? 'Premarket logged · ' + loggedSessions.map(x => SESSION_LABELS[x]).join(', ') : 'Premarket note logged') : 'No premarket note yet — tap to log one'}</div>${excerpt ? `<div class="bt-sub">${escapeHtml(excerpt)}</div>` : ''}</div>
      </div>
      <div class="bt-sessions" id="dash-pm-sessions">${pmSessionBoxesHTML(todayStr)}</div>
      ${focus ? `<div class="bt-focus">“${escapeHtml(focus)}”</div>` : ''}`;
    const gp = document.querySelector('[data-goto-premarket]');
    if (gp) gp.addEventListener('click', () => { switchTab('premarket'); openPremarketForm(); });
    document.getElementById('dash-pm-sessions').addEventListener('click', ev => {
      const log = ev.target.closest('[data-pmlog]');
      if (log) { ev.stopPropagation(); switchTab('premarket'); openPremarketForm(null, log.dataset.pmlog); return; }
      const box = ev.target.closest('[data-pmtick]');
      if (!box) return;
      const sess = box.dataset.pmtick, before = premarketStreak();
      const on = !(premarketTicks[todayStr] && premarketTicks[todayStr][sess]);
      setPremarketTick(todayStr, sess, on);
      if (navigator.vibrate && on) { try { navigator.vibrate(10); } catch (e) {} }
      renderDashboard();
      const nb = document.querySelector(`#dash-pm-sessions [data-pmtick="${sess}"]`);
      if (nb && on) nb.classList.add('just');
      if (premarketStreak() !== before) { const st = document.querySelector('#dash-pm-sessions .pm-streak'); if (st) st.classList.add('bump'); }
    });

    const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5);
    const rec = document.getElementById('dash-recent');
    rec.innerHTML = recent.length ? recent.map(e => `
      <div class="li" data-id="${e.id}">
        <span class="l"><span>${fmtDateShort(e.date)}</span><span class="term-bd ${e.result}">${e.result === 'breakeven' ? 'BE' : e.result === 'win' ? 'W' : 'L'}</span><span class="sym">${escapeHtml(e.symbol || 'Untitled')}</span></span>
        <span class="p ${e.pnl >= 0 ? 'pos' : 'neg'}">${(e.pnl >= 0 ? '+' : '') + fmtMoney(e.pnl)}</span>
      </div>`).join('') : `<div class="empty">No entries yet — tap + to log one.</div>`;
    rec.querySelectorAll('.li[data-id]').forEach(r => r.addEventListener('click', () => openEntryForm(r.dataset.id)));
  }

  // ---------- Entries (expandable trade cards, mirrors desktop) ----------
  let entriesQuery = '';
  const expandedEntryIds = new Set();
  let flashEntryId = null;
  document.getElementById('entries-search').addEventListener('input', (e) => {
    entriesQuery = e.target.value.trim().toLowerCase();
    renderEntriesList();
  });
  function entryCardHTML(e) {
    if (!expandedEntryIds.has(e.id)) {
      return `<div class="tcard-wrap"><div class="tcard-row${e.id === flashEntryId ? ' flash ' + e.result : ''}" data-open="${e.id}">
        <span class="l"><span class="d">${fmtDateShort(e.date)}</span><span class="s">${escapeHtml(e.symbol || 'Untitled trade')}</span></span>
        <span style="display:flex; align-items:center; gap:8px;"><span class="term-bd ${e.result}">${e.result === 'breakeven' ? 'BE' : e.result === 'win' ? 'W' : 'L'}</span><span class="p ${e.pnl >= 0 ? 'pos' : 'neg'}">${(e.pnl >= 0 ? '+' : '') + fmtMoney(e.pnl)}</span></span>
      </div></div>`;
    }
    const photos = photosForEntry(e);
    const idx = photos.length ? ((e.bgPhotoIndex || 0) % photos.length) : 0;
    const bg = photos.length ? `style="background-image:linear-gradient(180deg,rgba(9,9,9,0.15),rgba(9,9,9,0.6) 60%,rgba(9,9,9,0.94)),url('${photos[idx]}')"` : '';
    const rl = e.result === 'breakeven' ? 'Breakeven' : e.result === 'win' ? 'Win' : 'Loss';
    const sign = e.result === 'win' ? '+' : e.result === 'loss' ? '-' : '';
    const blk = (k, v) => v ? `<div class="blk"><div class="bk">${k}</div><div class="bv">${escapeHtml(v)}</div></div>` : '';
    return `<div class="tcard-wrap" data-wrap="${e.id}">
      <div class="tcard ${photos.length ? '' : 'no-photo'}" ${bg}>
        ${tradeChartSVG(e)}
        <div class="tcard-top">
          <div><div class="tcard-sym">${escapeHtml(e.symbol || 'Untitled trade')}</div><div class="tcard-date">${fmtDate(e.date)}${e.rulesBroken ? ' · ⚠' : ''}</div></div>
          <button class="tcard-collapse" data-collapse="${e.id}" type="button">▲</button>
        </div>
        <div class="tcard-body">
          <div class="tcard-pnl ${e.result}">${sign}${fmtMoney(Math.abs(e.pnl))}</div>
          <div class="tcard-result ${e.result}">${rl}</div>
          ${e.setupType ? `<div class="tcard-setup">${setupTypeLabel(e.setupType)}</div>` : ''}
          ${e.session ? `<div class="tcard-setup">${sessionLabel(e.session)} session</div>` : ''}
        </div>
        <div class="tcard-actions">
          <button data-more="${e.id}" type="button">See more</button>
          <button data-edit="${e.id}" type="button">Edit</button>
          <button class="icon" data-clean="${e.id}" type="button" title="Clean view">⤢</button>
        </div>
      </div>
      <div class="tcard-more" id="mmore-${e.id}">
        ${e.brokenRules && e.brokenRules.length ? blk('Rules broken', e.brokenRules.join(', ')) : ''}
        ${e.checklistChecked && e.checklistChecked.length ? blk('Checklist confirmed', e.checklistChecked.join(', ')) : ''}
        ${blk('Emotions', e.emotions)}${blk('What happened', e.happened)}
        ${blk('What went well', e.good)}${blk('What went badly', e.bad)}${blk('Improvements', e.improve)}
        ${e.screenshot ? `<div class="blk"><div class="bk">Screenshot</div><img class="shot" src="${e.screenshot}"></div>` : ''}
      </div>
    </div>`;
  }
  function renderEntriesList() {
    let shown = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    if (entriesQuery) shown = shown.filter(e => [e.date, e.symbol, e.emotions, e.happened, e.good, e.bad, e.improve].join(' ').toLowerCase().includes(entriesQuery));
    const list = document.getElementById('entries-list');
    setTimeout(() => { flashEntryId = null; }, 0);
    list.innerHTML = shown.length ? shown.map(entryCardHTML).join('') : `<div class="empty">${entriesQuery ? 'Nothing matches.' : 'No entries yet — tap + to log one.'}</div>`;
    bindEntryCards(list);
  }
  // tapping a trade offers three choices
  function openEntryChoices(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    openSheet(`${e.symbol || 'Trade'} · ${fmtDateShort(e.date)}`, `
      <div class="choice-list">
        <button class="btn" type="button" data-choice="card">View card</button>
        <button class="btn ghost" type="button" data-choice="full">View full entry</button>
        <button class="btn ghost" type="button" data-choice="edit">Edit entry</button>
      </div>`);
    document.querySelectorAll('#sheet-body [data-choice]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.choice;
      closeSheet();
      if (c === 'card') showCleanCard(id);
      else if (c === 'full') { expandedEntryIds.add(id); renderEntriesList(); const w = document.querySelector('[data-wrap="' + id + '"]'); if (w) w.scrollIntoView({ block: 'start' }); }
      else openEntryForm(id);
    }));
  }
  function bindEntryCards(container) {
    container.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => openEntryChoices(el.dataset.open)));
    container.querySelectorAll('[data-collapse]').forEach(el => el.addEventListener('click', (ev) => { ev.stopPropagation(); expandedEntryIds.delete(el.dataset.collapse); renderEntriesList(); }));
    container.querySelectorAll('[data-more]').forEach(el => el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const panel = document.getElementById('mmore-' + el.dataset.more);
      panel.classList.toggle('open');
      el.textContent = panel.classList.contains('open') ? 'See less' : 'See more';
    }));
    container.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', (ev) => { ev.stopPropagation(); openEntryForm(el.dataset.edit); }));
    container.querySelectorAll('[data-clean]').forEach(el => el.addEventListener('click', (ev) => { ev.stopPropagation(); showCleanCard(el.dataset.clean); }));
  }

  // ---------- clean, screenshottable card ----------
  const cleanCardEl = document.getElementById('cleancard');
  let cleanCardEntryId = null;
  let ccTouchStartX = 0, ccTouchStartY = 0, ccSwiped = false;
  cleanCardEl.addEventListener('touchstart', (ev) => {
    const t = ev.touches[0];
    ccTouchStartX = t.clientX; ccTouchStartY = t.clientY; ccSwiped = false;
  }, { passive: true });
  cleanCardEl.addEventListener('touchend', (ev) => {
    if (!cleanCardEntryId) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - ccTouchStartX, dy = t.clientY - ccTouchStartY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      ccSwiped = true;
      cycleCleanCardPhoto(dx < 0 ? 1 : -1);
    }
  });
  cleanCardEl.addEventListener('click', () => {
    if (ccSwiped) { ccSwiped = false; return; }
    cleanCardEl.classList.remove('open');
    cleanCardEntryId = null;
  });
  function cycleCleanCardPhoto(dir) {
    const e = entries.find(x => x.id === cleanCardEntryId);
    if (!e) return;
    const photos = photosForEntry(e);
    if (photos.length < 2) return;
    setBgPhotoIndex(cleanCardEntryId, (e.bgPhotoIndex || 0) + dir);
    showCleanCard(cleanCardEntryId);
  }
  function setBgPhotoIndex(id, index) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    const photos = photosForEntry(e);
    if (!photos.length) return;
    e.bgPhotoIndex = ((index % photos.length) + photos.length) % photos.length;
    persistEntries();
    renderEntriesList();
    try { if (window.LvdSync) LvdSync.pushCollection('entries'); } catch (err) { console.error(err); }
  }
  function showCleanCard(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    cleanCardEntryId = id;
    const photos = photosForEntry(e);
    const idx = photos.length ? ((e.bgPhotoIndex || 0) % photos.length) : 0;
    const cc = document.getElementById('cleancard-body');
    cc.className = 'cc' + (photos.length ? '' : ' no-photo');
    cc.style.backgroundImage = photos.length
      ? `linear-gradient(180deg,rgba(9,9,9,0.2),rgba(9,9,9,0.62) 55%,rgba(9,9,9,0.96)),url('${photos[idx]}')` : '';
    // size the card to the photo's own shape so nothing is cropped
    cc.style.setProperty('--ar', 16 / 9);
    if (photos.length) {
      const img = new Image();
      img.onload = () => { if (cleanCardEntryId === id && img.naturalWidth && img.naturalHeight) cc.style.setProperty('--ar', Math.min(2.6, Math.max(0.55, img.naturalWidth / img.naturalHeight))); };
      img.src = photos[idx];
    }
    const rl = e.result === 'breakeven' ? 'Breakeven' : e.result === 'win' ? 'Win' : 'Loss';
    const sign = e.result === 'win' ? '+' : e.result === 'loss' ? '-' : '';
    const dots = photos.length > 1
      ? `<div class="cc-dots">${photos.map((_, i) => `<span class="${i === idx ? 'on' : ''}"></span>`).join('')}</div>` : '';
    cc.innerHTML = `
      ${dots}
      ${tradeChartSVG(e).replace('class="tcard-chart"', 'class="cc-chart"')}
      <div class="cc-top">
        <div class="cc-sym">${escapeHtml(e.symbol || 'Untitled trade')}</div>
        <div class="cc-date">${fmtDate(e.date)}</div>
      </div>
      <div class="cc-bot">
        <div class="cc-pnl ${e.result}">${sign}${fmtMoney(Math.abs(e.pnl))}</div>
        <div class="cc-res ${e.result}">${rl}</div>
        ${e.setupType ? `<div class="cc-setup">${setupTypeLabel(e.setupType)}</div>` : ''}
        ${e.session ? `<div class="cc-setup">${sessionLabel(e.session)} session</div>` : ''}
        <div class="cc-brand"><span class="cc-stamp">${stampSVG(false)}</span>LARPENATOR <span>3000</span></div>
      </div>`;
    cleanCardEl.classList.add('open');
  }

  // ---------- Achievements ----------
  let editingAchId = null;
  function renderAchievements() {
    const list = document.getElementById('ach-list');
    const sorted = [...achievements].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
    list.innerHTML = sorted.length ? sorted.map(a => `
      <div class="ach-card" data-ach="${a.id}">
        ${a.screenshot ? `<img class="ach-img" src="${a.screenshot}">` : `<div class="ach-noimg">No screenshot</div>`}
        <div class="ach-body">
          <div class="ach-title">${escapeHtml(a.title || 'Untitled')}</div>
          <div class="ach-date">${a.date ? fmtDateShort(a.date) : ''}</div>
          ${a.description ? `<div class="ach-desc">${escapeHtml(a.description)}</div>` : ''}
          <div class="ach-actions">
            <button data-ach-edit="${a.id}" type="button">Edit</button>
            <button class="danger" data-ach-del="${a.id}" type="button">Delete</button>
          </div>
        </div>
      </div>`).join('') : `<div class="empty">No achievements yet — tap + to add your first win.</div>`;
    list.querySelectorAll('.ach-img').forEach(img => img.addEventListener('click', () => { const src = img.src; showImageFull(src); }));
    list.querySelectorAll('[data-ach-edit]').forEach(el => el.addEventListener('click', () => openAchievementForm(el.dataset.achEdit)));
    list.querySelectorAll('[data-ach-del]').forEach(el => el.addEventListener('click', () => {
      if (!confirm('Delete this achievement?')) return;
      achievements = achievements.filter(x => x.id !== el.dataset.achDel);
      persistAchievements();
      LvdSync.pushCollection('achievements');
      renderAchievements();
    }));
  }
  function showImageFull(src) {
    cleanCardEntryId = null;
    const cc = document.getElementById('cleancard-body');
    cc.className = 'cc no-photo';
    cc.style.backgroundImage = '';
    cc.style.aspectRatio = 'auto';
    cc.innerHTML = `<img src="${src}" style="width:100%; display:block; border-radius:22px;">`;
    cleanCardEl.classList.add('open');
    setTimeout(() => { cc.style.aspectRatio = ''; }, 300);
  }
  function openAchievementForm(id) {
    editingAchId = id || null;
    const a = id ? achievements.find(x => x.id === id) : null;
    openSheet(a ? 'Edit Achievement' : 'New Achievement', `
      <label>Title</label><input type="text" id="ach-title" value="${escapeHtml(a ? a.title : '')}" placeholder="e.g. First payout, Passed the $50k eval">
      <label>Date</label><input type="date" id="ach-date" value="${a ? a.date : todayStr}">
      <label>Notes</label><textarea id="ach-desc">${escapeHtml(a ? a.description : '')}</textarea>
      <label>Screenshot</label>
      <div id="ach-shot-mount"></div>
      <input type="file" id="ach-shot-input" accept="image/*" style="display:none;">
      <div style="display:flex; gap:10px; margin-top:18px;">
        <button class="btn" id="ach-save" type="button">${a ? 'Update' : 'Save'} Achievement</button>
        ${a ? '<button class="btn danger" id="ach-del" type="button">Delete</button>' : ''}
      </div>
    `);
    let shot = a ? (a.screenshot || null) : null;
    function renderShot() {
      const m = document.getElementById('ach-shot-mount');
      if (shot) {
        m.innerHTML = `<div class="shot-preview"><img src="${shot}"><button class="rm" id="ach-shot-rm" type="button">Remove</button></div>`;
        document.getElementById('ach-shot-rm').addEventListener('click', () => { shot = null; renderShot(); });
      } else {
        m.innerHTML = `<div class="shot-zone" id="ach-shot-add">Tap to add a screenshot</div>`;
        document.getElementById('ach-shot-add').addEventListener('click', () => document.getElementById('ach-shot-input').click());
      }
    }
    document.getElementById('ach-shot-input').addEventListener('change', (ev) => {
      const file = ev.target.files[0];
      if (!file || file.type.indexOf('image') !== 0) return;
      const img = new Image(); const rd = new FileReader();
      rd.onload = () => { img.onload = () => { shot = compressImage(img, 1400); renderShot(); }; img.src = rd.result; };
      rd.readAsDataURL(file); ev.target.value = '';
    });
    renderShot();
    document.getElementById('ach-save').addEventListener('click', () => {
      const title = document.getElementById('ach-title').value.trim();
      if (!title) { showToast('Give it a title'); return; }
      const item = {
        id: editingAchId || newId(),
        title, date: document.getElementById('ach-date').value || todayStr,
        description: document.getElementById('ach-desc').value.trim(),
        screenshot: shot,
        createdAt: a ? a.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      if (editingAchId) achievements = achievements.map(x => x.id === editingAchId ? item : x);
      else achievements.push(item);
      persistAchievements();
      LvdSync.pushCollection('achievements');
      closeSheet();
      showToast(editingAchId ? 'Achievement updated' : 'Achievement saved');
      renderAchievements();
    });
    const del = document.getElementById('ach-del');
    if (del) del.addEventListener('click', () => {
      if (!confirm('Delete this achievement?')) return;
      achievements = achievements.filter(x => x.id !== editingAchId);
      persistAchievements();
      LvdSync.pushCollection('achievements');
      closeSheet();
      showToast('Achievement deleted');
      renderAchievements();
    });
  }

  function openEntryForm(id) {
    editingEntryId = id || null;
    const e = id ? entries.find(x => x.id === id) : null;
    const setupType = e ? e.setupType : null;
    const checked = e ? (e.checklistChecked || []) : [];
    openSheet(e ? 'Edit Entry' : 'New Entry', `
      <label>Date</label><input type="date" id="f-date" value="${e ? e.date : todayStr}">
      <label>Symbol</label><input type="text" id="f-symbol" value="${escapeHtml(e ? e.symbol : '')}" placeholder="e.g. ES, EURUSD">
      <label>Result</label>
      <div class="seg" id="f-result">
        <button type="button" class="sel-win${e && e.result === 'win' ? ' on' : ''}" data-r="win">Win</button>
        <button type="button" class="sel-loss${e && e.result === 'loss' ? ' on' : ''}" data-r="loss">Loss</button>
        <button type="button" class="sel-be${e && e.result === 'breakeven' ? ' on' : ''}" data-r="breakeven">BE</button>
      </div>
      <label>P&amp;L</label><input type="number" id="f-pnl" step="0.01" value="${e ? e.pnl : ''}">
      <label>Setup type</label>
      <div class="seg" id="f-setup">
        <button type="button" data-s="continuation"${setupType === 'continuation' ? ' class="on"' : ''}>Continuation</button>
        <button type="button" data-s="reversal"${setupType === 'reversal' ? ' class="on"' : ''}>Reversal</button>
      </div>
      <div class="chip-row" id="f-checklist" style="margin-top:10px;"></div>
      <label>Emotions</label><textarea id="f-emotions">${escapeHtml(e ? e.emotions : '')}</textarea>
      <label>What happened</label><textarea id="f-happened">${escapeHtml(e ? e.happened : '')}</textarea>
      <label>Screenshot</label>
      <div id="f-shot-mount"></div>
      <input type="file" id="f-shot-input" accept="image/*" style="display:none;">
      <div style="display:flex; gap:10px; margin-top:18px;">
        <button class="btn" id="f-save" type="button">${e ? 'Update' : 'Save'} Entry</button>
        ${e ? '<button class="btn danger" id="f-delete" type="button">Delete</button>' : ''}
      </div>
    `);
    let selectedResult = e ? e.result : null;
    let selectedSetup = setupType;
    let selectedChecks = [...checked];
    let currentShot = e ? (e.screenshot || null) : null;
    function renderShot() {
      const mount = document.getElementById('f-shot-mount');
      if (currentShot) {
        mount.innerHTML = `<div class="shot-preview"><img src="${currentShot}"><button class="rm" id="f-shot-rm" type="button">Remove</button></div>`;
        document.getElementById('f-shot-rm').addEventListener('click', () => { currentShot = null; renderShot(); });
      } else {
        mount.innerHTML = `<div class="shot-zone" id="f-shot-add">Tap to add a screenshot</div>`;
        document.getElementById('f-shot-add').addEventListener('click', () => document.getElementById('f-shot-input').click());
      }
    }
    document.getElementById('f-shot-input').addEventListener('change', (ev) => {
      const file = ev.target.files[0];
      if (!file || file.type.indexOf('image') !== 0) return;
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => { img.onload = () => { currentShot = compressImage(img, 1200); renderShot(); }; img.src = reader.result; };
      reader.readAsDataURL(file);
      ev.target.value = '';
    });
    renderShot();
    document.querySelectorAll('#f-result button').forEach(b => b.addEventListener('click', () => {
      selectedResult = b.dataset.r;
      document.querySelectorAll('#f-result button').forEach(x => x.classList.toggle('on', x === b));
    }));
    function renderChecklistChips() {
      const items = selectedSetup ? (checklistCategories[selectedSetup] || []) : [];
      const el = document.getElementById('f-checklist');
      el.innerHTML = items.length ? items.map(item => `<div class="chip${selectedChecks.includes(item) ? ' on' : ''}" data-item="${escapeHtml(item)}">${escapeHtml(item)}</div>`).join('') : (selectedSetup ? '' : '<span style="color:var(--ink-faint); font-size:12.5px;">Pick a setup type to see its checklist.</span>');
      el.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
        const item = c.dataset.item;
        if (selectedChecks.includes(item)) selectedChecks = selectedChecks.filter(x => x !== item);
        else selectedChecks.push(item);
        renderChecklistChips();
      }));
    }
    document.querySelectorAll('#f-setup button').forEach(b => b.addEventListener('click', () => {
      selectedSetup = selectedSetup === b.dataset.s ? null : b.dataset.s;
      selectedChecks = [];
      document.querySelectorAll('#f-setup button').forEach(x => x.classList.toggle('on', x.dataset.s === selectedSetup));
      renderChecklistChips();
    }));
    renderChecklistChips();

    document.getElementById('f-save').addEventListener('click', () => {
      if (!selectedResult) { showToast('Pick a result'); return; }
      const date = document.getElementById('f-date').value;
      if (!date) { showToast('Pick a date'); return; }
      const item = {
        id: editingEntryId || newId(),
        date,
        symbol: document.getElementById('f-symbol').value.trim(),
        result: selectedResult,
        pnl: parseFloat(document.getElementById('f-pnl').value) || 0,
        rulesBroken: e ? !!e.rulesBroken : false,
        brokenRules: e ? (e.brokenRules || []) : [],
        checklistChecked: selectedChecks,
        setupType: selectedSetup,
        premarketLink: e ? e.premarketLink : null,
        emotions: document.getElementById('f-emotions').value.trim(),
        happened: document.getElementById('f-happened').value.trim(),
        good: e ? e.good : '', bad: e ? e.bad : '', improve: e ? e.improve : '',
        screenshot: currentShot,
        bgPhotoIndex: e ? (e.bgPhotoIndex || 0) : 0,
        createdAt: e ? e.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      if (editingEntryId) entries = entries.map(x => x.id === editingEntryId ? item : x);
      else entries.push(item);
      persistEntries();
      LvdSync.pushCollection('entries');
      const wasEditing = !!editingEntryId;
      flashEntryId = item.id;
      closeSheet();
      if (!wasEditing) stampSavedTicket(item); else showToast('Entry updated');
      renderDashboard(); renderEntriesList(); renderCalendar();
    });
    const delBtn = document.getElementById('f-delete');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!confirm('Delete this entry?')) return;
      entries = entries.filter(x => x.id !== editingEntryId);
      persistEntries();
      LvdSync.pushCollection('entries');
      expandedEntryIds.delete(editingEntryId);
      closeSheet();
      showToast('Entry deleted');
      renderDashboard(); renderEntriesList(); renderCalendar();
    });
  }

  // ---------- Premarket ----------
  function renderPremarketScreen() {
    const sorted = [...premarketEntries].sort((a, b) => b.date.localeCompare(a.date) || (PM_SESSIONS.indexOf(a.session) - PM_SESSIONS.indexOf(b.session)) || b.createdAt - a.createdAt);
    const list = document.getElementById('premarket-list');
    list.innerHTML = sorted.length ? sorted.map(p => {
      const scenarios = p.scenarios || [];
      return `<div class="row" data-pm="${p.id}" style="flex-direction:column; align-items:flex-start; gap:4px;">
        <div style="display:flex; width:100%; justify-content:space-between;"><span class="rowdate" style="width:auto">${fmtDateShort(p.date)}${p.session ? ` <span class="pm-sess-badge">${SESSION_LABELS[p.session]}</span>` : ''}</span><span class="sym">${escapeHtml((scenarios[0] && scenarios[0].label) || p.levels || '')}</span></div>
        ${p.outlook ? `<div style="font-size:12.5px; color:var(--ink-dim); line-height:1.4;">${escapeHtml(p.outlook.slice(0, 90))}</div>` : ''}
      </div>`;
    }).join('') : `<div class="empty">No premarket notes yet — tap + to add one.</div>`;
    list.querySelectorAll('[data-pm]').forEach(row => row.addEventListener('click', () => openPremarketForm(row.dataset.pm)));
  }

  function openPremarketForm(id, presetSession) {
    editingPremarketId = id || null;
    const p = id ? premarketEntries.find(x => x.id === id) : null;
    const scenarios = p && p.scenarios && p.scenarios.length ? p.scenarios : [{ id: newId(), label: '', body: '' }];
    openSheet(p ? 'Edit Premarket Note' : 'New Premarket Note', `
      <label>Date</label><input type="date" id="pm-date" value="${p ? p.date : todayStr}">
      <label>Session</label><div class="seg" id="pm-session">${PM_SESSIONS.map(x => `<button type="button" data-sess="${x}">${SESSION_LABELS[x]}</button>`).join('')}</div>
      <label>Key levels</label><input type="text" id="pm-levels" value="${escapeHtml(p ? p.levels : '')}">
      <label>Overview</label><textarea id="pm-overview">${escapeHtml(p ? p.outlook : '')}</textarea>
      <label>Scenarios</label>
      <div id="pm-scenarios"></div>
      <button class="btn ghost small" id="pm-add-scenario" type="button" style="margin-top:6px;">+ Add scenario</button>
      <div style="display:flex; gap:10px; margin-top:18px;">
        <button class="btn" id="pm-save" type="button">${p ? 'Update' : 'Save'} Note</button>
        ${p ? '<button class="btn danger" id="pm-delete" type="button">Delete</button>' : ''}
      </div>
    `);
    let pmSession = p ? (p.session || null) : (presetSession || defaultPmSession(todayStr));
    const paintSession = () => document.querySelectorAll('#pm-session button').forEach(b => b.classList.toggle('on', b.dataset.sess === pmSession));
    document.querySelectorAll('#pm-session button').forEach(b => b.addEventListener('click', () => { pmSession = b.dataset.sess; paintSession(); }));
    paintSession();
    document.getElementById('pm-date').addEventListener('change', ev => { if (!p) { pmSession = defaultPmSession(ev.target.value); paintSession(); } });
    const scenariosEl = document.getElementById('pm-scenarios');
    function addScenarioRow(label, body) {
      const row = document.createElement('div');
      row.style.cssText = 'border:1px solid var(--border); border-radius:10px; padding:10px; margin-bottom:8px; background:var(--surface-2);';
      row.innerHTML = `<input type="text" placeholder="Scenario name" class="pm-s-label" value="${escapeHtml(label || '')}" style="margin-bottom:8px;"><textarea placeholder="What would confirm it?" class="pm-s-body" style="min-height:50px;">${escapeHtml(body || '')}</textarea><button type="button" class="btn ghost small" style="margin-top:8px; width:auto;">Remove</button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      scenariosEl.appendChild(row);
    }
    scenarios.forEach(s => addScenarioRow(s.label, s.body));
    document.getElementById('pm-add-scenario').addEventListener('click', () => addScenarioRow('', ''));

    document.getElementById('pm-save').addEventListener('click', () => {
      const overview = document.getElementById('pm-overview').value.trim();
      const newScenarios = [...scenariosEl.children].map(row => ({
        id: newId(),
        label: row.querySelector('.pm-s-label').value.trim(),
        body: row.querySelector('.pm-s-body').value.trim()
      })).filter(s => s.label || s.body);
      if (!overview && !newScenarios.length) { showToast('Add an overview or a scenario'); return; }
      if (!pmSession) { showToast('Pick which session this note is for'); return; }
      const pmDate = document.getElementById('pm-date').value;
      if (!editingPremarketId && premarketEntries.some(x => x.date === pmDate && x.session === pmSession)
        && !confirm(`You already have a ${SESSION_LABELS[pmSession]} note for ${fmtDateShort(pmDate)}. Save another one?`)) return;
      const item = {
        session: pmSession,
        id: editingPremarketId || newId(),
        date: document.getElementById('pm-date').value,
        levels: document.getElementById('pm-levels').value.trim(),
        outlook: overview,
        scenarios: newScenarios,
        screenshot: p ? p.screenshot : null,
        createdAt: p ? p.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      if (editingPremarketId) premarketEntries = premarketEntries.map(x => x.id === editingPremarketId ? item : x);
      else premarketEntries.push(item);
      persistPremarket();
      LvdSync.pushCollection('premarketEntries');
      setPremarketTick(item.date, item.session, true);
      closeSheet();
      showToast(editingPremarketId ? 'Note updated' : SESSION_LABELS[item.session] + ' premarket saved');
      renderPremarketScreen();
      renderDashboard();
    });
    const delBtn = document.getElementById('pm-delete');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!confirm('Delete this premarket note?')) return;
      premarketEntries = premarketEntries.filter(x => x.id !== editingPremarketId);
      persistPremarket();
      LvdSync.pushCollection('premarketEntries');
      closeSheet();
      showToast('Note deleted');
      renderPremarketScreen();
    });
  }

  // ---------- Calendar ----------
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  document.getElementById('cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
  function renderCalendar() {
    document.getElementById('cal-month-label').textContent = MONTH_NAMES[calMonth] + ' ' + calYear;
    document.getElementById('cal-dow-row').innerHTML = ['S','M','T','W','T','F','S'].map(d => `<span class="cal-dow">${d}</span>`).join('');
    const byDate = {};
    entries.forEach(e => { byDate[e.date] = byDate[e.date] || []; byDate[e.date].push(e); });
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    let html = '';
    let monthPnl = 0, monthTrades = 0, monthWins = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const de = byDate[dateStr] || [];
      const pnl = de.reduce((s, e) => s + (e.pnl || 0), 0);
      de.forEach(e => { monthPnl += (e.pnl || 0); monthTrades++; if (e.result === 'win') monthWins++; });
      const cls = !de.length ? '' : pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '';
      const offset = d === 1 ? ` style="grid-column-start:${firstDay + 1}"` : '';
      html += `<div class="cal-cell ${cls}${dateStr === todayStr ? ' today' : ''}"${offset} data-date="${dateStr}">${d}</div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
    document.querySelectorAll('#cal-grid .cal-cell').forEach((c, i) => c.style.setProperty('--ci', Math.floor(i / 7) + (i % 7)));
    const wr = monthTrades ? Math.round((monthWins / monthTrades) * 100) : 0;
    document.getElementById('cal-monthstat').innerHTML = `
      <div class="ms"><div class="k">Month P&amp;L</div><div class="v ${monthPnl >= 0 ? 'pos' : 'neg'}">${fmtMoneyShort(monthPnl)}</div></div>
      <div class="ms"><div class="k">Trades</div><div class="v">${monthTrades}</div></div>
      <div class="ms"><div class="k">Win rate</div><div class="v">${wr}%</div></div>`;
    document.querySelectorAll('#cal-grid .cal-cell:not(.empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        const de = byDate[cell.dataset.date] || [];
        if (!de.length) return;
        openSheet(fmtDate(cell.dataset.date), de.map(e => `
          <div class="li" data-cal-id="${e.id}" style="display:flex; align-items:center; justify-content:space-between; padding:12px 2px; border-bottom:1px solid var(--border); font-family:var(--font-mono); font-size:12.5px;">
            <span style="display:flex; gap:9px; align-items:center;"><span class="term-bd ${e.result}">${e.result === 'breakeven' ? 'BE' : e.result === 'win' ? 'W' : 'L'}</span>${escapeHtml(e.symbol || 'Untitled')}</span>
            <span class="${e.pnl >= 0 ? 'pos' : 'neg'}" style="color:${e.pnl >= 0 ? 'var(--green)' : 'var(--red)'}; font-weight:700;">${(e.pnl >= 0 ? '+' : '') + fmtMoney(e.pnl)}</span>
          </div>`).join(''));
        document.querySelectorAll('#sheet-body [data-cal-id]').forEach(r => r.addEventListener('click', () => { closeSheet(); openEntryForm(r.dataset.calId); }));
      });
    });
  }

  // ---------- Checklist ----------
  document.querySelectorAll('#checklist-cat-toggle button').forEach(b => b.addEventListener('click', () => {
    activeChecklistCat = b.dataset.cat;
    document.querySelectorAll('#checklist-cat-toggle button').forEach(x => x.classList.toggle('on', x === b));
    renderChecklistScreen();
  }));
  function renderChecklistScreen() {
    const items = checklistCategories[activeChecklistCat] || [];
    const el = document.getElementById('checklist-items');
    el.innerHTML = items.length ? items.map((item, i) => `<div class="row"><span>${escapeHtml(item)}</span><button type="button" data-i="${i}" style="background:none;border:none;color:var(--ink-faint);font-size:18px;">✕</button></div>`).join('') : `<div class="empty">No items yet.</div>`;
    el.querySelectorAll('button[data-i]').forEach(btn => btn.addEventListener('click', () => {
      checklistCategories[activeChecklistCat].splice(parseInt(btn.dataset.i, 10), 1);
      persistSettings();
      LvdSync.pushSettings();
      renderChecklistScreen();
    }));
  }
  document.getElementById('checklist-add-btn').addEventListener('click', () => {
    const input = document.getElementById('checklist-input');
    const val = input.value.trim();
    if (!val) return;
    (checklistCategories[activeChecklistCat] = checklistCategories[activeChecklistCat] || []).push(val);
    persistSettings();
    LvdSync.pushSettings();
    input.value = '';
    renderChecklistScreen();
  });

  // ---------- Weekly Review ----------
  document.getElementById('week-prev').addEventListener('click', () => { reviewWeekStart.setDate(reviewWeekStart.getDate() - 7); renderWeeklyScreen(); });
  document.getElementById('week-next').addEventListener('click', () => { reviewWeekStart.setDate(reviewWeekStart.getDate() + 7); renderWeeklyScreen(); });
  function renderWeeklyScreen() {
    const weekStartStr = toDateStr(reviewWeekStart);
    const weekEnd = new Date(reviewWeekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    document.getElementById('week-label').textContent = `${fmtDateShort(weekStartStr)} – ${fmtDateShort(toDateStr(weekEnd))}`;
    const weekEntries = entries.filter(e => e.date >= weekStartStr && e.date <= toDateStr(weekEnd));
    const s = computeStats(weekEntries);
    document.getElementById('week-stats').innerHTML = `
      <div class="stat"><div class="label">Trades</div><div class="value">${weekEntries.length}</div></div>
      <div class="stat"><div class="label">Week P&amp;L</div><div class="value ${s.totalPnl >= 0 ? 'pos' : 'neg'}">${fmtMoney(s.totalPnl)}</div></div>
    `;
    const saved = weeklyReviews[weekStartStr] || { good: '', bad: '', focus: '' };
    document.getElementById('w-good').value = saved.good;
    document.getElementById('w-bad').value = saved.bad;
    document.getElementById('w-focus').value = saved.focus;
  }
  document.getElementById('week-save-btn').addEventListener('click', () => {
    const weekStartStr = toDateStr(reviewWeekStart);
    weeklyReviews[weekStartStr] = {
      good: document.getElementById('w-good').value.trim(),
      bad: document.getElementById('w-bad').value.trim(),
      focus: document.getElementById('w-focus').value.trim()
    };
    persistSettings();
    LvdSync.pushSettings();
    showToast('Weekly review saved');
  });

  // ---------- launch intro: split reveal ----------
  // ---------- the Larpenator stamp (Inked) ----------
  // One colour (currentColor), tilted, with a rubber-stamp ink texture. small = the icon-size cut (ring + 3K).
  let stampSeq = 0;
  function stampSVG(small) {
    const id = 'lvink' + (stampSeq++);
    const tex = `<defs><filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.3 2.3" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter></defs>`;
    const display = `font-family="'Bricolage Grotesque','Geist',sans-serif" font-weight="800" font-stretch="75%"`;
    let body;
    if (small) {
      body = `<circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="4.5"/><text x="32" y="39" text-anchor="middle" ${display} font-size="20" fill="currentColor">3K</text>`;
    } else {
      const r = 20.6, L = (2 * Math.PI * r * 0.985).toFixed(2);
      body = `<circle cx="32" cy="32" r="29.5" fill="none" stroke="currentColor" stroke-width="2.8"/><circle cx="32" cy="32" r="18.5" fill="none" stroke="currentColor" stroke-width="1.2"/>` +
        `<defs><path id="${id}r" d="M32 ${32 - r} a${r} ${r} 0 1 1 -0.01 0"/></defs><text font-family="'Geist Mono','JetBrains Mono',monospace" font-weight="700" font-size="5.3" fill="currentColor"><textPath href="#${id}r" textLength="${L}" lengthAdjust="spacing">LARPENATOR ✦ TRADING JOURNAL ✦ </textPath></text>` +
        `<text x="32" y="36.8" text-anchor="middle" ${display} font-size="12.5" fill="currentColor">3000</text>`;
    }
    return `<svg class="stamp-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${tex}<g filter="url(#${id})" transform="rotate(-8 32 32)">${body}</g></svg>`;
  }
  // the same stamp drawn onto a canvas (exported images), with speckles knocked out for the ink texture

  // saving a new trade: a ticket pops up and gets stamped
  function stampSavedTicket(entry) {
    if (reduceMotion()) { showToast('Entry saved'); return; }
    const t = document.createElement('div');
    t.className = 'save-ticket';
    const sign = entry.result === 'win' ? '+' : entry.result === 'loss' ? '−' : '';
    t.innerHTML = `<div class="st-top"><span>${fmtDateShort(entry.date)} · ${escapeHtml(entry.symbol || 'Trade')}</span><span>${entry.result === 'breakeven' ? 'BE' : entry.result === 'win' ? 'Win' : entry.result === 'loss' ? 'Loss' : ''}</span></div><div class="st-pnl ${entry.result || ''}">${sign}${fmtMoney(Math.abs(entry.pnl || 0))}</div><span class="st-stamp">${stampSVG(false)}</span>`;
    document.body.appendChild(t);
    const c = 'translate(-50%, -50%)';
    t.animate([{ transform: c + ' scale(.9)', opacity: 0 }, { transform: c + ' scale(1)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    t.querySelector('.st-stamp').animate([
      { transform: 'scale(1.9) rotate(-16deg)', opacity: 0 },
      { transform: 'scale(.95) rotate(-11deg)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1) rotate(-11deg)', opacity: 0.95 }
    ], { duration: 420, delay: 240, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' });
    if (navigator.vibrate) { try { setTimeout(() => navigator.vibrate(12), 480); } catch (e) {} }
    setTimeout(() => {
      t.animate([{ transform: c, opacity: 1 }, { transform: c + ' translateY(24px) scale(.94)', opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' }).onfinish = () => t.remove();
    }, 1250);
  }
  document.getElementById('brand-stamp').innerHTML = stampSVG(false);
  document.getElementById('auth-stamp').innerHTML = stampSVG(false);

  function playIntro() {
    const el = document.getElementById('intro');
    if (!el || el.classList.contains('play')) return;
    const h = new Date().getHours();
    el.querySelector('.intro-brand').innerHTML = `<span class="intro-stamp">${stampSVG(false)}</span>`;
    document.getElementById('intro-greet').innerHTML = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'},<br><span>Kaine</span>`;
    const monthPrefix = todayStr.slice(0, 7);
    const monthList = entries.filter(e => e.date && e.date.startsWith(monthPrefix));
    const monthPnl = monthList.reduce((sum, e) => sum + (e.pnl || 0), 0);
    const bits = [todayDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })];
    if (monthList.length) bits.push(`${todayDate.toLocaleDateString(undefined, { month: 'long' })} ${monthPnl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(monthPnl))}`);
    document.getElementById('intro-sub').textContent = bits.join(' · ');
    el.classList.add('play');
    let done = false;
    const open = () => {
      if (done) return;
      done = true;
      el.classList.add('split');
      document.getElementById('app').classList.add('revealing');
      setTimeout(() => { el.remove(); setTimeout(() => document.getElementById('app').classList.remove('revealing'), 900); }, reduceMotion() ? 60 : 820);
    };
    el.addEventListener('click', open);
    setTimeout(open, reduceMotion() ? 900 : 1650);
  }
  function renderIntroPref() {
    let off = false;
    try { off = localStorage.getItem('lvd_intro_off') === '1'; } catch (e) {}
    document.getElementById('intro-pref-state').textContent = off ? 'Off' : 'On';
  }
  document.getElementById('intro-pref').addEventListener('click', () => {
    try {
      if (localStorage.getItem('lvd_intro_off') === '1') localStorage.removeItem('lvd_intro_off');
      else localStorage.setItem('lvd_intro_off', '1');
    } catch (e) {}
    renderIntroPref();
  });
  renderIntroPref();
  const PALETTES = [['original', 'Original'], ['brass', 'Brass'], ['steel', 'Steel'], ['paper', 'Paper']];
  function renderPalettePref() {
    let cur = 'original';
    try { cur = localStorage.getItem('lvd_palette') || 'original'; } catch (e) {}
    if (cur === 'original') document.documentElement.removeAttribute('data-palette'); else document.documentElement.setAttribute('data-palette', cur);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0f1216');
    document.getElementById('palette-chips').innerHTML = PALETTES.map(([id, name]) => `<button type="button" class="chip${id === cur ? ' on' : ''}" data-pal="${id}">${name}</button>`).join('');
  }
  document.getElementById('palette-chips').addEventListener('click', e => {
    const b = e.target.closest('[data-pal]'); if (!b) return;
    try { if (b.dataset.pal === 'original') localStorage.removeItem('lvd_palette'); else localStorage.setItem('lvd_palette', b.dataset.pal); } catch (err) {}
    renderPalettePref();
    renderDashboard();
  });
  renderPalettePref();
  // the day can turn over while the app sits in the background
  function checkTradingDay() {
    const t = tradingDateStr();
    if (t === todayStr) return;
    todayStr = t; todayDate = dateFromStr(t);
    renderDashboard(); renderCalendar();
  }
  setInterval(checkTradingDay, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTradingDay(); });
  window.addEventListener('focus', checkTradingDay);
  function renderTimeZoneSetting() {
    document.getElementById('tz-select').innerHTML = tzOptionsHTML();
    document.getElementById('tz-note').textContent = tzNoteText();
  }
  document.getElementById('tz-select').addEventListener('change', ev => {
    try { localStorage.setItem(TZ_KEY, ev.target.value); } catch (e) {}
    if (window.LvdSync && LvdSync.isSupported) LvdSync.pushSettings();
    checkTradingDay();
    renderTimeZoneSetting();
    showToast('Time zone set');
  });
  renderTimeZoneSetting();

  function renderMotionPref() {
    const pref = window.lvdMotion ? window.lvdMotion.pref() : 'system';
    const reduces = window.lvdMotion && window.lvdMotion.deviceReduces();
    document.getElementById('motion-pref-state').textContent = pref === 'system' ? 'Follow device' : 'Always play';
    document.getElementById('motion-pref-note').textContent = reduces
      ? (pref === 'system' ? 'Reduce Motion is on in your iPhone settings, so most animations are off. Tap to play them anyway.' : 'Reduce Motion is on in your iPhone settings. Larpenator plays its animations anyway.')
      : 'Tap to switch between always playing animations and following Reduce Motion.';
  }
  document.getElementById('motion-pref').addEventListener('click', () => {
    try { if (window.lvdMotion && window.lvdMotion.pref() !== 'system') localStorage.setItem('lvd_motion', 'system'); else localStorage.removeItem('lvd_motion'); } catch (e) {}
    if (window.lvdMotion) window.lvdMotion.apply();
    renderMotionPref();
  });
  renderMotionPref();
  function renderAmbientPref() {
    let off = false;
    try { off = localStorage.getItem('lvd_ambient_off') === '1'; } catch (e) {}
    document.documentElement.classList.toggle('calm', off);
    document.getElementById('ambient-pref-state').textContent = off ? 'Calm' : 'On';
  }
  document.getElementById('ambient-pref').addEventListener('click', () => {
    try {
      if (localStorage.getItem('lvd_ambient_off') === '1') localStorage.removeItem('lvd_ambient_off');
      else localStorage.setItem('lvd_ambient_off', '1');
    } catch (e) {}
    renderAmbientPref();
  });
  renderAmbientPref();

  // ---------- auth ----------
  const authScreen = document.getElementById('auth-screen');
  const appRoot = document.getElementById('app');
  const authError = document.getElementById('auth-error');
  document.getElementById('auth-signin-btn').addEventListener('click', async () => {
    authError.textContent = '';
    const email = document.getElementById('auth-email').value.trim();
    const pw = document.getElementById('auth-password').value;
    if (!email || !pw) { authError.textContent = 'Enter your email and password.'; return; }
    try { await LvdSync.signIn(email, pw); }
    catch (e) { authError.textContent = e.message || 'Sign in failed'; }
  });
  document.getElementById('auth-signup-btn').addEventListener('click', async () => {
    authError.textContent = '';
    const email = document.getElementById('auth-email').value.trim();
    const pw = document.getElementById('auth-password').value;
    if (!email || !pw) { authError.textContent = 'Enter an email and a password (6+ characters).'; return; }
    try { await LvdSync.signUp(email, pw); showToast('Account created'); }
    catch (e) { authError.textContent = e.message || 'Could not create account'; }
  });
  document.getElementById('more-signout').addEventListener('click', async () => {
    await LvdSync.signOut();
  });

  let syncRegistered = false;
  function registerSyncOnce() {
    if (syncRegistered || !window.LvdSync || !LvdSync.isSupported) return;
    syncRegistered = true;
    let entriesRerenderTimer = null;
    LvdSync.registerCollection('entries', () => entries, (arr) => { entries = arr; persistEntries(); }, () => { clearTimeout(entriesRerenderTimer); entriesRerenderTimer = setTimeout(() => { renderDashboard(); renderEntriesList(); renderCalendar(); }, 150); });
    LvdSync.registerCollection('premarketEntries', () => premarketEntries, (arr) => { premarketEntries = arr; persistPremarket(); }, renderPremarketScreen);
    LvdSync.registerCollection('achievements', () => achievements, (arr) => { achievements = arr; persistAchievements(); }, renderAchievements);
    // background-photo pools (one small doc per photo, keyed on a hash of the data URL)
    const photoDocId = (src) => 'p' + hashSeed(src).toString(36);
    const poolSync = (coll, key) => LvdSync.registerCollection(coll,
      () => { try { return JSON.parse(localStorage.getItem(key) || '[]').map((src, i) => ({ id: photoDocId(src), src, ord: i })); } catch (e) { return []; } },
      (arr) => { const ord = [...arr].filter(x => x && x.src).sort((a, b) => (a.ord || 0) - (b.ord || 0)).map(x => x.src); localStorage.setItem(key, JSON.stringify(ord)); renderEntriesList(); },
      renderEntriesList);
    poolSync('sharedBgPhotos', 'lvd_shared_bg_photos');
    poolSync('lossBgPhotos', 'lvd_loss_bg_photos');
    LvdSync.registerSettings(settingsSnapshot, applySettingsSnapshot, () => { renderChecklistScreen(); renderWeeklyScreen(); });
  }

  if (window.LvdSync && LvdSync.isSupported) {
    LvdSync.onAuthChange(user => {
      if (user) {
        authScreen.style.display = 'none';
        appRoot.style.display = 'flex';
        registerSyncOnce();
        renderDashboard();
        playIntro();
      } else {
        authScreen.style.display = 'flex';
        appRoot.style.display = 'none';
        const intro = document.getElementById('intro');
        if (intro) intro.remove();
      }
    });
    LvdSync.onError((ctx, err) => { console.error('[sync]', ctx, err); });
  } else {
    authError.textContent = 'Cloud sync is unavailable — check your connection and reload.';
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
