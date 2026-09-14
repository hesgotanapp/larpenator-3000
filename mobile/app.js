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
    achievements: 'lvd_achievements'
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
  }
  function settingsSnapshot() {
    return { rulebook, goals, weeklyReviews, mistakeTags, checklistCategories, focusRules, focusIndex, milestone, algoPnl };
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
    persistSettings();
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

  const todayDate = new Date();
  const todayStr = toDateStr(todayDate);
  let calYear = todayDate.getFullYear(), calMonth = todayDate.getMonth();
  let reviewWeekStart = startOfWeek(todayDate);
  let activeChecklistCat = 'continuation';
  let editingEntryId = null;
  let editingPremarketId = null;

  // ---------- tabs ----------
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
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
    const col = up ? '#30d68a' : '#ef6a5f';
    const grad = ctx.createLinearGradient(0, 0, 0, cssH);
    grad.addColorStop(0, up ? 'rgba(48,214,138,0.22)' : 'rgba(239,106,95,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.moveTo(pts[0][0], cssH);
    pts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(pts[pts.length - 1][0], cssH); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.shadowColor = up ? 'rgba(48,214,138,0.5)' : 'rgba(239,106,95,0.5)'; ctx.shadowBlur = 6;
    ctx.stroke(); ctx.shadowBlur = 0;
    const last = pts[pts.length - 1];
    ctx.beginPath(); ctx.arc(last[0], last[1], 3, 0, 7); ctx.fillStyle = col; ctx.fill();
  }
  function flameSVG(kind) {
    const base = kind === 'win' ? '#30d68a' : kind === 'loss' ? '#ef6a5f' : '#f0954a';
    return `<svg class="flame" viewBox="0 0 40 54"><path d="M20 2C15 10 8 14 8 26a12 12 0 0 0 24 0c0-5-2.5-8.5-5-11 1 3-1 6-1 6s1-4-2-8c-1.5-2-3-4.5-4-11Z" fill="${base}"/></svg>`;
  }
  function renderDashboard() {
    const s = computeStats(entries);
    const todayEntries = entries.filter(e => e.date === todayStr);
    const todayPnl = todayEntries.reduce((sum, e) => sum + (e.pnl || 0), 0);

    const total = document.getElementById('dash-total');
    total.textContent = (s.totalPnl >= 0 ? '+' : '') + fmtMoney(s.totalPnl);
    total.className = 'term-big ' + (s.totalPnl >= 0 ? 'pos' : 'neg');
    document.getElementById('dash-meta').innerHTML =
      `${entries.length} entries · ${s.wins}W ${s.losses}L ${s.be}BE · today <span class="${todayPnl >= 0 ? 'pos' : 'neg'}">${(todayPnl >= 0 ? '+' : '') + fmtMoneyShort(todayPnl).replace('+', '')}</span>`;
    drawEquitySpark(document.getElementById('dash-spark'), entries);

    document.getElementById('dash-strip').innerHTML = `
      <div class="c"><div class="k">Win rate</div><div class="v">${s.winRate}%</div></div>
      <div class="c"><div class="k">Profit factor</div><div class="v">${isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}</div></div>
      <div class="c"><div class="k">Today</div><div class="v ${todayPnl >= 0 ? 'pos' : 'neg'}">${fmtMoneyShort(todayPnl)}</div></div>`;
    document.getElementById('dash-row2').innerHTML = `
      <div class="b"><div class="k">Avg win</div><div class="v pos">${fmtMoneyShort(s.avgWin)}</div></div>
      <div class="b"><div class="k">Avg loss</div><div class="v neg">${fmtMoneyShort(s.avgLoss)}</div></div>`;

    const streak = currentStreak(entries);
    const runs = longestStreaks(entries);
    const streakEl = document.getElementById('dash-streak');
    if (streak) {
      const glow = streak.kind === 'win' ? '#30d68a' : streak.kind === 'loss' ? '#ef6a5f' : '#f0954a';
      streakEl.style.setProperty('--streak-glow', glow);
      const last7 = [...entries].filter(e => e.result !== 'breakeven').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 7).reverse();
      const pips = last7.map(e => e.result === 'win' ? '◆' : '◇').join('');
      streakEl.innerHTML = `${flameSVG(streak.kind)}
        <div class="txt"><b style="color:${glow};">${streak.count}${streak.kind === 'win' ? 'W' : streak.kind === 'loss' ? 'L' : 'BE'}</b><span>streak · best ${runs.bestWin}W · worst ${runs.bestLoss}L</span></div>
        <div class="pips">${pips}</div>`;
    } else {
      streakEl.innerHTML = `<div class="txt"><span>No trades yet</span></div>`;
    }

    const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 6);
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
  document.getElementById('entries-search').addEventListener('input', (e) => {
    entriesQuery = e.target.value.trim().toLowerCase();
    renderEntriesList();
  });
  function entryCardHTML(e) {
    if (!expandedEntryIds.has(e.id)) {
      return `<div class="tcard-wrap"><div class="tcard-row" data-open="${e.id}">
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
    list.innerHTML = shown.length ? shown.map(entryCardHTML).join('') : `<div class="empty">${entriesQuery ? 'Nothing matches.' : 'No entries yet — tap + to log one.'}</div>`;
    bindEntryCards(list);
  }
  function bindEntryCards(container) {
    container.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => { expandedEntryIds.add(el.dataset.open); renderEntriesList(); }));
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
        <div class="cc-brand">LARPENATOR <span>3000</span></div>
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
      closeSheet();
      showToast(editingEntryId ? 'Entry updated' : 'Entry saved');
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
    const sorted = [...premarketEntries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const list = document.getElementById('premarket-list');
    list.innerHTML = sorted.length ? sorted.map(p => {
      const scenarios = p.scenarios || [];
      return `<div class="row" data-pm="${p.id}" style="flex-direction:column; align-items:flex-start; gap:4px;">
        <div style="display:flex; width:100%; justify-content:space-between;"><span class="rowdate">${fmtDateShort(p.date)}</span><span class="sym">${escapeHtml((scenarios[0] && scenarios[0].label) || p.levels || '')}</span></div>
        ${p.outlook ? `<div style="font-size:12.5px; color:var(--ink-dim); line-height:1.4;">${escapeHtml(p.outlook.slice(0, 90))}</div>` : ''}
      </div>`;
    }).join('') : `<div class="empty">No premarket notes yet — tap + to add one.</div>`;
    list.querySelectorAll('[data-pm]').forEach(row => row.addEventListener('click', () => openPremarketForm(row.dataset.pm)));
  }

  function openPremarketForm(id) {
    editingPremarketId = id || null;
    const p = id ? premarketEntries.find(x => x.id === id) : null;
    const scenarios = p && p.scenarios && p.scenarios.length ? p.scenarios : [{ id: newId(), label: '', body: '' }];
    openSheet(p ? 'Edit Premarket Note' : 'New Premarket Note', `
      <label>Date</label><input type="date" id="pm-date" value="${p ? p.date : todayStr}">
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
      const item = {
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
      closeSheet();
      showToast(editingPremarketId ? 'Note updated' : 'Note saved');
      renderPremarketScreen();
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
      html += `<div class="cal-cell ${cls}"${offset} data-date="${dateStr}">${d}</div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
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
    checklistCategories[activeChecklistCat].push(val);
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
    LvdSync.registerCollection('entries', () => entries, (arr) => { entries = arr; persistEntries(); }, () => { renderDashboard(); renderEntriesList(); renderCalendar(); });
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
      } else {
        authScreen.style.display = 'flex';
        appRoot.style.display = 'none';
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
