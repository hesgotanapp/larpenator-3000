(function () {
  // ---------- local cache helpers (mirrors desktop's localStorage schema) ----------
  function loadJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
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
    algoPnl: 'lvd_algo_pnl'
  };

  let entries = loadJSON(KEYS.entries, []);
  let premarketEntries = loadJSON(KEYS.premarket, []);
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
  function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function fmtDateShort(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function startOfWeek(d) { const dt = new Date(d); dt.setDate(dt.getDate() - dt.getDay()); dt.setHours(0, 0, 0, 0); return dt; }
  function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str == null ? '' : String(str); return div.innerHTML; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function computeStats(list) {
    const wins = list.filter(e => e.result === 'win').length;
    const losses = list.filter(e => e.result === 'loss').length;
    const be = list.filter(e => e.result === 'breakeven').length;
    const totalPnl = list.reduce((s, e) => s + (e.pnl || 0), 0);
    const winRate = list.length ? Math.round((wins / list.length) * 100) : 0;
    return { wins, losses, be, totalPnl, winRate };
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
  }
  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  sheetBackdrop.addEventListener('click', closeSheet);

  document.getElementById('fab').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    if (activeTab === 'premarket') openPremarketForm();
    else openEntryForm();
  });

  // ---------- Dashboard ----------
  function renderDashboard() {
    const s = computeStats(entries);
    const todayEntries = entries.filter(e => e.date === todayStr);
    const todayPnl = todayEntries.reduce((sum, e) => sum + (e.pnl || 0), 0);
    document.getElementById('dash-stats').innerHTML = `
      <div class="stat"><div class="label">Total P&amp;L</div><div class="value ${s.totalPnl >= 0 ? 'pos' : 'neg'}">${fmtMoney(s.totalPnl)}</div></div>
      <div class="stat"><div class="label">Today's P&amp;L</div><div class="value ${todayPnl >= 0 ? 'pos' : 'neg'}">${fmtMoney(todayPnl)}</div></div>
      <div class="stat"><div class="label">Win rate</div><div class="value">${s.winRate}%</div></div>
      <div class="stat"><div class="label">Entries</div><div class="value">${entries.length}</div></div>
    `;
    const streak = currentStreak(entries);
    const streakHtml = streak
      ? `<div style="font-family:var(--font-mono); font-size:34px; font-weight:700; color:${streak.kind === 'win' ? 'var(--green)' : streak.kind === 'loss' ? 'var(--red)' : 'var(--amber)'};">${streak.count}${streak.kind === 'win' ? 'W' : streak.kind === 'loss' ? 'L' : 'BE'}</div>`
      : `<div class="empty">No trades yet.</div>`;
    document.getElementById('dash-streak').innerHTML = streakHtml;
    const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 8);
    document.getElementById('dash-recent').innerHTML = recent.length ? recent.map(entryRow).join('') : `<div class="empty">No entries logged yet.</div>`;
    bindEntryRows(document.getElementById('dash-recent'));
  }

  function entryRow(e) {
    return `<div class="row" data-id="${e.id}">
      <div class="rowl">
        <span class="rowdate">${fmtDateShort(e.date)}</span>
        <span class="badge ${e.result}">${e.result === 'breakeven' ? 'BE' : e.result}</span>
        <span class="sym">${escapeHtml(e.symbol || '')}</span>
      </div>
      <span class="pnl ${e.pnl >= 0 ? 'pos' : 'neg'}">${fmtMoney(e.pnl)}</span>
    </div>`;
  }
  function bindEntryRows(container) {
    container.querySelectorAll('.row[data-id]').forEach(row => {
      row.addEventListener('click', () => openEntryForm(row.dataset.id));
    });
  }

  // ---------- Entries ----------
  let entriesQuery = '';
  document.getElementById('entries-search').addEventListener('input', (e) => {
    entriesQuery = e.target.value.trim().toLowerCase();
    renderEntriesList();
  });
  function renderEntriesList() {
    let shown = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    if (entriesQuery) {
      shown = shown.filter(e => [e.date, e.symbol, e.emotions, e.happened].join(' ').toLowerCase().includes(entriesQuery));
    }
    const list = document.getElementById('entries-list');
    list.innerHTML = shown.length ? shown.map(entryRow).join('') : `<div class="empty">${entriesQuery ? 'Nothing matches.' : 'No entries yet — tap + to log one.'}</div>`;
    bindEntryRows(list);
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
      <div style="display:flex; gap:10px; margin-top:18px;">
        <button class="btn" id="f-save" type="button">${e ? 'Update' : 'Save'} Entry</button>
        ${e ? '<button class="btn danger" id="f-delete" type="button">Delete</button>' : ''}
      </div>
    `);
    let selectedResult = e ? e.result : null;
    let selectedSetup = setupType;
    let selectedChecks = [...checked];
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
        screenshot: e ? e.screenshot : null,
        createdAt: e ? e.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      if (editingEntryId) entries = entries.map(x => x.id === editingEntryId ? item : x);
      else entries.push(item);
      persistEntries();
      LvdSync.pushCollection('entries');
      closeSheet();
      showToast(editingEntryId ? 'Entry updated' : 'Entry saved');
      renderDashboard(); renderEntriesList();
    });
    const delBtn = document.getElementById('f-delete');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!confirm('Delete this entry?')) return;
      entries = entries.filter(x => x.id !== editingEntryId);
      persistEntries();
      LvdSync.pushCollection('entries');
      closeSheet();
      showToast('Entry deleted');
      renderDashboard(); renderEntriesList();
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
    document.getElementById('cal-dow-row').innerHTML = ['S','M','T','W','T','F','S'].map(d => `<div class="cal-dow">${d}</div>`).join('');
    const byDate = {};
    entries.forEach(e => { byDate[e.date] = byDate[e.date] || []; byDate[e.date].push(e); });
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEntries = byDate[dateStr] || [];
      const pnl = dayEntries.reduce((s, e) => s + (e.pnl || 0), 0);
      const cls = !dayEntries.length ? '' : pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '';
      html += `<div class="cal-cell ${cls}" data-date="${dateStr}"><div class="d">${d}</div></div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
    document.querySelectorAll('#cal-grid .cal-cell:not(.empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.dataset.date;
        const dayEntries = byDate[dateStr] || [];
        const card = document.getElementById('cal-day-card');
        if (!dayEntries.length) { card.style.display = 'none'; return; }
        card.style.display = 'block';
        document.getElementById('cal-day-title').textContent = fmtDateShort(dateStr);
        document.getElementById('cal-day-entries').innerHTML = dayEntries.map(entryRow).join('');
        bindEntryRows(document.getElementById('cal-day-entries'));
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
