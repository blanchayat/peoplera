async function readJsonSafe(res){
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

function initPulseHistoryAccordion(){
  const btn = document.getElementById('btnPulseRecent');
  const dropdown = document.getElementById('pulseRecentDropdown');
  const body = document.getElementById('pulseRecentBody');
  const list = document.getElementById('pulseHistory');
  if (!btn || !dropdown || !body || !list) return;

  const isOpen = () => dropdown.style.display !== 'none';
  const setOpen = (open) => {
    if (open) {
      dropdown.style.display = 'block';
      const hasItems = list.getAttribute('data-has-items') === '1';
      if (!hasItems) {
        list.innerHTML = '<div style="font-size:12px;color:#6b7280;font-weight:600;line-height:1.65">No recent analyses yet</div>';
      }
      body.style.opacity = '1';
      body.style.maxHeight = Math.max(140, body.scrollHeight) + 'px';
    } else {
      body.style.opacity = '0';
      body.style.maxHeight = '0px';
      window.setTimeout(()=>{
        dropdown.style.display = 'none';
      }, 220);
    }
  };

  window.togglePulseRecent = function(open){
    if (typeof open === 'boolean') return setOpen(open);
    setOpen(!isOpen());
  };

  setOpen(false);

  try{
    window.addEventListener('resize', ()=>{
      if (isOpen()) body.style.maxHeight = Math.max(140, body.scrollHeight) + 'px';
    });
  }catch(e){ /* noop */ }
}

function initPlanActionDelegation(){
  if (window.__planActionDelegationInit) return;
  window.__planActionDelegationInit = true;

  document.addEventListener('click', (e)=>{
    const deleteBtn = e.target?.closest?.('.plan-action-delete');
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const row = deleteBtn.closest('.plan-action-row');
      const keyEnc = row?.getAttribute('data-plan-key') || '';
      const actionEnc = row?.getAttribute('data-action') || '';
      const planKey = decodeURIComponent(keyEnc);
      const actionText = decodeURIComponent(actionEnc);
      deletePlanAction(planKey, actionText);
      return;
    }

    const row = e.target?.closest?.('.plan-action-row');
    if (!row) return;
    const keyEnc = row.getAttribute('data-plan-key') || '';
    const actionEnc = row.getAttribute('data-action') || '';
    const planKey = decodeURIComponent(keyEnc);
    const actionText = decodeURIComponent(actionEnc);
    togglePlanAction(planKey, actionText);
  });
}

function initSidebarCollapse(){
  const root = document.getElementById('app');
  const btn = document.getElementById('sidebarToggle');
  if (!root || !btn) return;

  const apply = (collapsed) => {
    root.classList.toggle('sidebar-collapsed', !!collapsed);
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    try{ localStorage.setItem('peoplera_sidebar_collapsed', collapsed ? '1' : '0'); }catch(e){ /* noop */ }
  };

  const getStored = () => {
    try{ return localStorage.getItem('peoplera_sidebar_collapsed') === '1'; }catch(e){ return false; }
  };

  const setTooltips = () => {
    document.querySelectorAll('.side-nav .nav-item').forEach(el => {
      const label = el.querySelector('.nav-left span:last-child')?.textContent?.trim();
      if (label) el.setAttribute('data-tooltip', label);
    });
  };

  setTooltips();
  apply(getStored());

  btn.addEventListener('click', ()=>{
    apply(!root.classList.contains('sidebar-collapsed'));
  });

  try{
    const mql = window.matchMedia('(max-width: 980px)');
    const onChange = () => {
      if (mql.matches) {
        root.classList.remove('sidebar-collapsed');
        btn.title = 'Collapse sidebar';
      } else {
        apply(getStored());
      }
    };
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if (mql.addListener) mql.addListener(onChange);
    onChange();
  }catch(e){ /* noop */ }
}

function setPulseManualEmployees(list){
  const arr = Array.isArray(list) ? list : [];
  const panel = document.getElementById('pulseManualPanel');
  const listEl = document.getElementById('pulseEmployeeList');
  if (!panel || !listEl) return;

  switchPulseTab('manual');
  listEl.innerHTML = '';
  pulseEmployees = [];

  for (const e of arr) {
    addPulseEmployee(false);
    const idx = pulseEmployees.length - 1;

    const write = (field, value) => {
      const input = listEl.querySelector(`input[data-idx="${idx}"][data-field="${field}"]`);
      if (!input) return;
      input.value = value == null ? '' : String(value);
      updatePulseEmp(input);
    };

    write('name', e?.name || '');
    write('weeklyHours', e?.weeklyHours ?? '');
    write('weekendHours', e?.weekendHours ?? '');
    write('afterHoursMessages', e?.afterHoursMessages ?? '');
    write('sickDays', e?.sickDays ?? '');
    write('lastVacation', e?.lastVacation ?? '');
  }
}

function getPlanActionState(plan){
  const key = String(plan?.key || plan?.title || 'plan');
  window.__planActionState = window.__planActionState || {};
  const state = window.__planActionState[key] || { actions: {} };
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  for (const a of actions) {
    const t = String(a || '').trim();
    if (!t) continue;
    if (!state.actions[t]) state.actions[t] = { selected: true, deleted: false };
  }
  window.__planActionState[key] = state;
  return state;
}

function getSelectedPlanActions(plan, max = 6){
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  const state = getPlanActionState(plan);
  const out = [];
  for (const a of actions) {
    const t = String(a || '').trim();
    if (!t) continue;
    const st = state.actions[t] || { selected: true, deleted: false };
    if (st.deleted) continue;
    if (!st.selected) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function togglePlanAction(planKey, actionText){
  try{
    const key = String(planKey || 'plan');
    const t = String(actionText || '').trim();
    if (!t) return;
    window.__planActionState = window.__planActionState || {};
    const state = window.__planActionState[key] || { actions: {} };
    state.actions[t] = state.actions[t] || { selected: true, deleted: false };
    if (state.actions[t].deleted) return;
    state.actions[t].selected = !state.actions[t].selected;
    window.__planActionState[key] = state;
    if (Array.isArray(window.__lastPulseEmployees)) renderPulse(window.__lastPulseEmployees);
  }catch(e){ console.warn('togglePlanAction failed', e); }
}

function deletePlanAction(planKey, actionText){
  try{
    const key = String(planKey || 'plan');
    const t = String(actionText || '').trim();
    if (!t) return;
    const ok = confirm('Remove this action item from the plan?');
    if (!ok) return;
    window.__planActionState = window.__planActionState || {};
    const state = window.__planActionState[key] || { actions: {} };
    state.actions[t] = state.actions[t] || { selected: true, deleted: false };
    state.actions[t].deleted = true;
    state.actions[t].selected = false;
    window.__planActionState[key] = state;
    if (typeof showPulseToast === 'function') showPulseToast('Removed');
    if (Array.isArray(window.__lastPulseEmployees)) renderPulse(window.__lastPulseEmployees);
  }catch(e){ console.warn('deletePlanAction failed', e); }
}

function buildPulseDemoEmployees(){
  return [
    { name: 'Alex Kim', weeklyHours: 68, weekendHours: 10, afterHoursMessages: 28, sickDays: 3, lastVacation: '9 months ago' },
    { name: 'Maya Chen', weeklyHours: 62, weekendHours: 8, afterHoursMessages: 20, sickDays: 2, lastVacation: '7 months ago' },
    { name: 'Omar Hassan', weeklyHours: 54, weekendHours: 4, afterHoursMessages: 12, sickDays: 1, lastVacation: '4 months ago' },
    { name: 'Sofia Rossi', weeklyHours: 48, weekendHours: 2, afterHoursMessages: 8, sickDays: 0, lastVacation: '2 months ago' },
    { name: 'Daniel Weber', weeklyHours: 40, weekendHours: 0, afterHoursMessages: 3, sickDays: 0, lastVacation: '1 month ago' },
    { name: 'Lina Novak', weeklyHours: 36, weekendHours: 0, afterHoursMessages: 1, sickDays: 0, lastVacation: '3 weeks ago' }
  ];
}

function buildDemoTrendSeries(lastScore, weeks = 6){
  const end = Number.isFinite(Number(lastScore)) ? Number(lastScore) : 55;
  const n = Math.max(4, Math.min(8, Number(weeks) || 6));
  const start = Math.max(20, Math.min(80, end + 10));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const noise = (i === n - 1) ? 0 : (Math.sin(i * 1.7) * 2);
    const v = Math.round((start * (1 - t)) + (end * t) + noise);
    out.push(Math.max(0, Math.min(100, v)));
  }
  return out;
}

function setBusy(btn, busyText){
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  return () => {
    btn.disabled = false;
    btn.textContent = old;
  };
}

function showPulseToast(title, detail){
  const existing = document.getElementById('pulseToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'pulseToast';
  toast.style.cssText = 'position:fixed;top:18px;right:18px;z-index:9999;background:rgba(255,255,255,0.92);backdrop-filter:blur(10px);border:1px solid rgba(0,0,0,0.10);border-radius:14px;padding:12px 14px;box-shadow:0 14px 40px rgba(15,23,42,0.12);max-width:320px';
  toast.innerHTML = `
    <div style="font-size:11px;font-weight:900;color:#0f172a">${escapeHtml(title || '')}</div>
    <div style="font-size:12px;color:#64748b;margin-top:2px;font-weight:700;line-height:1.35">${escapeHtml(detail || '')}</div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.35s, transform 0.35s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-4px)';
    setTimeout(() => toast.remove(), 400);
  }, 3400);
}

function updateNavBurnoutBadge(decision){
  const badge = document.getElementById('navBurnoutBadge');
  if (!badge) return;

  const d = decision || window.__lastDecisionEngine || null;
  const score = Number(d?.score);
  const label = String(d?.status?.label || '').trim();

  if (!Number.isFinite(score) || !label) {
    badge.hidden = true;
    badge.textContent = '—';
    badge.style.background = 'rgba(0,0,0,0.03)';
    badge.style.borderColor = 'rgba(0,0,0,0.10)';
    badge.style.color = '#334155';
    return;
  }

  const tone = d?.status?.tone || '#64748b';
  badge.hidden = false;
  badge.textContent = `${Math.round(score)} · ${label}`;
  badge.style.background = `${tone}14`;
  badge.style.borderColor = `${tone}33`;
  badge.style.color = tone;
}

function buildPulseReportXlsx(){
  const XLSX = window.XLSX;
  if (!XLSX || !XLSX.utils) throw new Error('Excel export library not loaded');

  const decision = window.__lastDecisionEngine || null;
  const employees = Array.isArray(window.__lastPulseEmployees) ? window.__lastPulseEmployees : [];
  const plans = Array.isArray(window.__lastActionPlans) ? window.__lastActionPlans : [];

  if (!decision || !employees.length) throw new Error('Run Burnout Intelligence to generate a report first');

  const wb = XLSX.utils.book_new();

  const HEADER_RGB = 'FF6B4A';
  const WHITE_RGB = 'FFFFFF';
  const riskBadge = { critical: 'FF4444', high: 'FF8C00', medium: 'FFD700', low: '4CAF50' };

  const applyHeaderStyle = (ws) => {
    try{
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (!ws[addr]) continue;
        ws[addr].s = ws[addr].s || {};
        ws[addr].s.fill = { patternType: 'solid', fgColor: { rgb: HEADER_RGB } };
        ws[addr].s.font = { bold: true, color: { rgb: WHITE_RGB } };
        ws[addr].s.alignment = { vertical: 'center', horizontal: 'center', wrapText: true };
      }
    }catch(e){ /* noop */ }
  };

  const setFreezeHeader = (ws) => {
    try{
      ws['!sheetViews'] = [{ state: 'frozen', ySplit: 1 }];
    }catch(e){ /* noop */ }
  };

  const styleRiskCell = (ws, r, c, levelText) => {
    try{
      const l = String(levelText || '').toLowerCase();
      const rgb = riskBadge[l];
      if (!rgb) return;
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) return;
      ws[addr].s = ws[addr].s || {};
      ws[addr].s.fill = { patternType: 'solid', fgColor: { rgb } };
      ws[addr].s.font = { bold: true, color: { rgb: WHITE_RGB } };
      ws[addr].s.alignment = { vertical: 'center', horizontal: 'center' };
    }catch(e){ /* noop */ }
  };

  const autoFitCols = (rows, min = 10, max = 70) => {
    const widths = [];
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        const v = row[i] == null ? '' : String(row[i]);
        const len = Math.min(max, Math.max(min, v.length + 2));
        widths[i] = Math.max(widths[i] || min, len);
      }
    }
    return widths.map(wch => ({ wch }));
  };

  const levelLabel = (lvl) => {
    const l = normalizeRiskLevel(lvl);
    return l ? (l.charAt(0).toUpperCase() + l.slice(1)) : '—';
  };

  const companyLevelFromScore = (score) => {
    const s = Number(score);
    if (!Number.isFinite(s)) return '—';
    if (s >= 85) return 'Critical';
    if (s >= 70) return 'High';
    if (s >= 45) return 'Medium';
    return 'Low';
  };

  const trendWord = (arrow) => {
    if (arrow === '↑') return '↑ Increasing';
    if (arrow === '↓') return '↓ Decreasing';
    return '— Stable';
  };

  const norm = {
    name: (e) => String(e?.name || '').trim(),
    weeklyHours: (e) => Number(e?.weeklyHours ?? e?.weekly_hours ?? 0),
    weekendHours: (e) => Number(e?.weekendHours ?? e?.weekend_hours ?? 0),
    afterHours: (e) => Number(e?.afterHoursMessages ?? e?.after_hours_messages ?? 0),
    sickDays: (e) => Number(e?.sickDays ?? e?.sick_days ?? 0),
    lastVacation: (e) => String(e?.lastVacation ?? e?.last_vacation ?? ''),
    burnoutScore: (e) => Number(e?.burnoutScore ?? e?.burnout_score ?? 0),
    riskLevel: (e) => normalizeRiskLevel(e?.riskLevel)
  };

  const prevMap = readJsonLocalStorage('peoplera_people_risk_prev_employees', {});
  const enriched = employees.map(e => {
    const name = norm.name(e) || 'Employee';
    const score = norm.burnoutScore(e);
    const lvl = norm.riskLevel(e);
    const prev = prevMap[String(name).toLowerCase()];
    const arrow = getTrendArrow(score, prev?.score);
    const drivers = (Array.isArray(e?.riskFactors) && e.riskFactors.length)
      ? e.riskFactors.slice(0, 3)
      : computeHeuristicDrivers(e);
    const topDriver = drivers[0] || '—';
    const recommendedAction = computeRecommendedAction(lvl, drivers);
    const logged = getLoggedAction(name);
    return { raw: e, name, score, lvl, arrow, drivers, topDriver, recommendedAction, logged };
  }).sort((a,b)=>(b.score||0)-(a.score||0));

  const totalEmployees = enriched.length;
  const atRiskCount = enriched.filter(e => ['medium','high','critical'].includes(e.lvl)).length;
  const atRiskPct = totalEmployees ? Math.round((atRiskCount / totalEmployees) * 100) : 0;

  const driverCounts = {};
  for (const e of enriched) {
    if (!e.topDriver) continue;
    driverCounts[e.topDriver] = (driverCounts[e.topDriver] || 0) + 1;
  }
  const topRiskDriver = Object.entries(driverCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

  const series = getCompanyTrendSeries(8);
  const last = Number(series?.[series.length - 1] ?? decision.score ?? 0);
  const prev = Number(series?.[series.length - 2] ?? last);
  const arrow = (Array.isArray(series) && series.length >= 2) ? getTrendArrow(last, prev) : '—';

  const reportDate = new Date();
  const reportDateLabel = reportDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const companyRisk = companyLevelFromScore(decision.score);

  const summaryRows = [
    ['Metric', 'Value', 'Status'],
    ['Report Date', reportDateLabel, '—'],
    ['Company Burnout Score', `${Number(decision.score) || 0}/100`, companyRisk],
    ['Risk Level', companyRisk, '—'],
    ['% Employees at Risk', `${atRiskPct}%`, 'Medium + High combined'],
    ['Top Risk Driver', topRiskDriver, '—'],
    ['Risk Trend', trendWord(arrow), '—'],
    ['Sick Leave Risk', String(decision?.sickLeaveRisk?.level || 'Low'), '—'],
    ['Employees Potentially at Sick Leave Risk', Number(decision?.sickLeaveAffected) || 0, 'Next 30 days'],
    ['Estimated Productivity at Risk', `~€${Number(decision?.productivityAtRiskWeekly || 0).toLocaleString()}/week`, '—'],
    ['Sick Leave Exposure', `${Number(decision?.sickLeaveExposureDays || 0)} days`, 'Next 2–4 weeks'],
    ['Total Employees Analyzed', totalEmployees, '—']
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = autoFitCols(summaryRows, 14, 80);
  applyHeaderStyle(wsSummary);
  setFreezeHeader(wsSummary);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const detailRows = [
    ['Employee Name', 'Weekly Hours', 'Weekend Hours', 'After-Hours Messages', 'Sick Days (Last 3mo)', 'Last Vacation', 'Burnout Score', 'Risk Level', 'Top Driver', 'Trend', 'Recommended Action']
  ];
  for (const e of enriched) {
    detailRows.push([
      e.name,
      norm.weeklyHours(e.raw),
      norm.weekendHours(e.raw),
      norm.afterHours(e.raw),
      norm.sickDays(e.raw),
      norm.lastVacation(e.raw),
      e.score,
      levelLabel(e.lvl),
      e.topDriver,
      e.arrow === '→' ? '—' : e.arrow,
      e.recommendedAction
    ]);
  }
  const wsDetails = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetails['!cols'] = autoFitCols(detailRows, 12, 70);
  applyHeaderStyle(wsDetails);
  setFreezeHeader(wsDetails);
  for (let r = 1; r < detailRows.length; r++) styleRiskCell(wsDetails, r, 7, detailRows[r][7]);
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Employee Details');

  const hotspotRows = [
    ['Employee Name', 'Burnout Score', 'Risk Badge', 'Top Driver 1', 'Top Driver 2', 'Top Driver 3', 'Recommended Action', 'Action Taken (Yes/No)']
  ];
  for (const e of enriched.filter(x => ['medium','high','critical'].includes(x.lvl))) {
    hotspotRows.push([
      e.name,
      e.score,
      levelLabel(e.lvl),
      e.drivers?.[0] || '—',
      e.drivers?.[1] || '—',
      e.drivers?.[2] || '—',
      e.recommendedAction,
      e.logged ? 'Yes' : 'No'
    ]);
  }
  const wsHotspots = XLSX.utils.aoa_to_sheet(hotspotRows);
  wsHotspots['!cols'] = autoFitCols(hotspotRows, 12, 70);
  applyHeaderStyle(wsHotspots);
  setFreezeHeader(wsHotspots);
  for (let r = 1; r < hotspotRows.length; r++) styleRiskCell(wsHotspots, r, 2, hotspotRows[r][2]);
  XLSX.utils.book_append_sheet(wb, wsHotspots, 'Team Hotspots');

  const trendRows = [
    ['Week', 'Burnout Score', 'Risk Level', 'Notes']
  ];
  const tSeries = (Array.isArray(series) && series.length) ? series : [Number(decision.score) || 0];
  for (let i = 0; i < tSeries.length; i++) {
    const s = Number(tSeries[i]) || 0;
    const lvl = companyLevelFromScore(s);
    const note = (i > 0) ? trendWord(getTrendArrow(s, tSeries[i - 1])) : '—';
    trendRows.push([`Week ${i + 1}`, s, lvl, note]);
  }
  const wsTrend = XLSX.utils.aoa_to_sheet(trendRows);
  wsTrend['!cols'] = autoFitCols(trendRows, 12, 50);
  applyHeaderStyle(wsTrend);
  setFreezeHeader(wsTrend);
  for (let r = 1; r < trendRows.length; r++) styleRiskCell(wsTrend, r, 2, trendRows[r][2]);
  XLSX.utils.book_append_sheet(wb, wsTrend, 'Burnout Trend');

  const impacted = {
    high: enriched.filter(e => ['high','critical'].includes(e.lvl)).map(e => e.name),
    medium: enriched.filter(e => e.lvl === 'medium').map(e => e.name),
    overtime: enriched.filter(e => norm.weeklyHours(e.raw) >= 55).map(e => e.name),
    sick: enriched.filter(e => norm.sickDays(e.raw) >= 3).map(e => e.name)
  };

  const priorityForPlan = (key) => {
    const k = String(key || '').toLowerCase();
    if (k.includes('recovery') || k.includes('sick') || k.includes('manager')) return 'High';
    if (k.includes('rebalance') || k.includes('productivity')) return 'Medium';
    return 'Medium';
  };

  const impactedForPlan = (planKey) => {
    const k = String(planKey || '').toLowerCase();
    if (k.includes('sick')) return impacted.sick;
    if (k.includes('rebalance') || k.includes('productivity')) return impacted.overtime.length ? impacted.overtime : impacted.medium;
    return impacted.high.length ? impacted.high : impacted.medium;
  };

  const plansRows = [
    ['Plan Name', 'Timeframe', 'Action Item', 'Priority', 'Impacted Employees']
  ];
  for (const p of plans) {
    const planName = String(p?.title || '');
    const timeframe = String(p?.timeframe || '');
    const priority = priorityForPlan(p?.key || p?.title);
    const impactedNames = impactedForPlan(p?.key || p?.title).slice(0, 12).join('; ');
    const actions = Array.isArray(p?.actions) ? p.actions : [];
    for (const a of actions) {
      const t = String(a || '').trim();
      if (!t) continue;
      plansRows.push([planName, timeframe, t, priority, impactedNames]);
    }
  }
  const wsPlans = XLSX.utils.aoa_to_sheet(plansRows);
  wsPlans['!cols'] = autoFitCols(plansRows, 12, 90);
  applyHeaderStyle(wsPlans);
  setFreezeHeader(wsPlans);
  XLSX.utils.book_append_sheet(wb, wsPlans, 'Action Plans');

  const buildInsightsForExport = () => {
    const emps = Array.isArray(employees) ? employees : [];
    const teamSize = emps.length;
    const overHours = emps.filter(e => norm.weeklyHours(e) >= 55).length;
    const highRisk = emps.filter(e => ['high','critical'].includes(normalizeRiskLevel(e?.riskLevel))).length;
    const series = getCompanyTrendSeries(8);
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const delta = (last && prev) ? (last - prev) : null;

    const out = [];
    if (decision?.inputs?.teamSize) {
      const riskWord = decision.status?.label ? `${decision.status.label} risk` : 'risk';
      out.push({ kind: 'TREND', title: `Company burnout score: ${decision.score}/100 (${riskWord})`, detail: 'This is a composite of workload, after-hours load, recovery, and sick leave signals.' });
    }
    if (decision?.sickLeaveRisk?.level) {
      const lvl = decision?.sickLeaveRisk?.level || 'Low';
      const affected = Number(decision?.sickLeaveAffected) || 0;
      const horizon = Number(decision?.sickLeaveHorizonDays) || 30;
      out.push({ kind: 'WARNING', title: `Potential sick leave risk: ${lvl} (next ${horizon} days)`, detail: `${affected} employee(s) potentially at risk. Prioritize workload adjustments and recovery planning.` });
    }
    if (teamSize > 0 && highRisk > 0) {
      out.push({ kind: 'WARNING', title: `${highRisk} ${highRisk === 1 ? 'employee is' : 'employees are'} at high risk`, detail: 'Review hotspots and assign interventions this week.' });
    }
    if (teamSize > 0 && overHours > 0) {
      out.push({ kind: 'WARNING', title: `${overHours} ${overHours === 1 ? 'employee shows' : 'employees show'} overtime signals`, detail: 'Reduce workload or rebalance responsibilities to prevent escalation.' });
    }
    if (delta !== null) {
      const dir = delta > 0 ? 'increased' : 'decreased';
      const magnitude = Math.abs(delta);
      out.push({ kind: 'TREND', title: `Burnout risk ${dir} ${magnitude.toFixed(0)} pts this week`, detail: 'Track the top drivers and validate against team changes.' });
    }
    return out.slice(0, 10);
  };

  const insights = buildInsightsForExport();
  const insightsRows = [
    ['Insight Type (TREND/WARNING)', 'Insight Title', 'Detail', 'Date']
  ];
  const isoDate = new Date().toISOString().slice(0, 10);
  for (const it of insights) {
    insightsRows.push([
      String(it.kind || 'TREND'),
      String(it.title || ''),
      String(it.detail || ''),
      isoDate
    ]);
  }
  const wsInsights = XLSX.utils.aoa_to_sheet(insightsRows);
  wsInsights['!cols'] = autoFitCols(insightsRows, 14, 120);
  applyHeaderStyle(wsInsights);
  setFreezeHeader(wsInsights);
  XLSX.utils.book_append_sheet(wb, wsInsights, 'AI Insights');

  return wb;
}

function exportPulseReportXlsx(){
  const XLSX = window.XLSX;
  if (!XLSX || !XLSX.writeFile) {
    alert('Excel export is not available. Please refresh the page and try again.');
    return;
  }

  try {
    const wb = buildPulseReportXlsx();
    const dt = new Date();
    const stamp = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    XLSX.writeFile(wb, `peoplera-burnout-report-${stamp}.xlsx`);
  } catch (e) {
    alert(e && e.message ? e.message : 'Export failed');
  }
}

async function copyPlanToClipboard(plan){
  const title = String(plan?.title || 'Strategic Action Plan');
  const actions = getSelectedPlanActions(plan, 6).map(a => `- ${String(a || '').trim()}`).filter(Boolean);
  const text = [title, '', ...actions].join('\n');

  try {
    await navigator.clipboard.writeText(text);
    showPulseToast('Copied', 'Plan copied to clipboard.');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showPulseToast('Copied', 'Plan copied to clipboard.');
    } catch {
      alert('Copy failed');
    }
  }
}

function ensureSendPlanModal(){
  if (document.getElementById('sendPlanModal')) return;

  const modal = document.createElement('div');
  modal.id = 'sendPlanModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.45);backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:18px';
  modal.innerHTML = `
    <div style="width:min(560px,92vw);background:rgba(255,255,255,0.96);border:1px solid rgba(0,0,0,0.12);border-radius:18px;box-shadow:0 30px 70px rgba(15,23,42,0.18);padding:16px 16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div style="min-width:0">
          <div style="font-weight:800;color:#111827;font-size:14px">Send plan</div>
          <div id="sendPlanModalSubtitle" style="margin-top:4px;color:#6b7280;font-size:12px;font-weight:600;line-height:1.5"></div>
        </div>
        <button id="sendPlanModalClose" style="background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.12);border-radius:10px;padding:8px 10px;font-size:12px;font-weight:800;cursor:pointer;color:#111827">Close</button>
      </div>

      <div style="margin-top:12px;display:grid;gap:10px">
        <div>
          <div style="font-size:12px;color:#9ca3af;font-weight:700;margin-bottom:6px">Employee</div>
          <select id="sendPlanEmployee" style="width:100%;background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.12);border-radius:12px;padding:10px 12px;font-size:13px;color:#111827;font-weight:600;outline:none"></select>
        </div>
        <div>
          <div style="font-size:12px;color:#9ca3af;font-weight:700;margin-bottom:6px">Email</div>
          <input id="sendPlanEmail" type="email" placeholder="e.g. name@company.com" style="width:100%;background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.12);border-radius:12px;padding:10px 12px;font-size:13px;color:#111827;font-weight:600;outline:none;box-sizing:border-box" />
        </div>
        <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);border-radius:14px;padding:12px">
          <div style="font-size:12px;color:#111827;font-weight:700">This sends a single email to the selected person.</div>
          <div style="margin-top:4px;font-size:12px;color:#6b7280;font-weight:600;line-height:1.55">Use supportive language and focus on workload and recovery. No bulk sending.</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:2px">
          <button id="sendPlanCancel" style="background:transparent;border:1px solid rgba(0,0,0,0.16);border-radius:12px;padding:10px 14px;font-size:12px;font-weight:800;cursor:pointer;color:#6b7280">Cancel</button>
          <button id="sendPlanConfirm" style="background:linear-gradient(90deg,#FF6B6B,#FFD93D);border:none;border-radius:12px;padding:10px 14px;font-size:12px;font-weight:900;cursor:pointer;color:#111827">Send plan</button>
        </div>
        <div id="sendPlanStatus" style="font-size:12px;color:#6b7280;font-weight:600;min-height:16px"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#sendPlanModalClose')?.addEventListener('click', close);
  modal.querySelector('#sendPlanCancel')?.addEventListener('click', close);
}

async function sendPlanToEmployee(plan){
  ensureSendPlanModal();

  const modal = document.getElementById('sendPlanModal');
  const select = document.getElementById('sendPlanEmployee');
  const emailInput = document.getElementById('sendPlanEmail');
  const subtitle = document.getElementById('sendPlanModalSubtitle');
  const status = document.getElementById('sendPlanStatus');
  const confirmBtn = document.getElementById('sendPlanConfirm');

  const employees = Array.isArray(window.__lastPulseEmployees) ? window.__lastPulseEmployees : [];
  const title = String(plan?.title || 'Weekly Workload & Recovery Plan');
  if (!employees.length) {
    alert('No employees found for this report.');
    return;
  }

  select.innerHTML = employees.map((e, i) => `<option value="${i}">${escapeHtml(e?.name || `Employee ${i+1}`)}</option>`).join('');
  if (subtitle) subtitle.textContent = title;
  if (status) status.textContent = '';
  if (emailInput) emailInput.value = '';

  const doSend = async () => {
    const idx = Number(select.value);
    const employee = employees[idx] || employees[0];
    const to = String(emailInput.value || '').trim();
    if (!to) {
      status.textContent = 'Please enter an email address.';
      return;
    }

    const employeeName = String(employee?.name || 'there');
    const actions = getSelectedPlanActions(plan, 4).map(a => String(a || '').trim()).filter(Boolean);
    if (!actions.length) {
      status.textContent = 'This plan has no actions to send.';
      return;
    }

    const subject = 'Weekly Workload & Recovery Plan';
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:620px;margin:0 auto;line-height:1.6">
        <div style="background:#f8fafc;border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:18px">
          <div style="font-size:12px;color:#6b7280;font-weight:700;letter-spacing:0.04em">PEOPLERA — SUPPORTIVE WEEKLY PLAN</div>
          <h2 style="margin:10px 0 0;color:#111827;font-size:18px">${escapeHtml(title)}</h2>
        </div>
        <div style="padding:18px 4px">
          <p style="margin:0;color:#111827;font-weight:600">Hi ${escapeHtml(employeeName)},</p>
          <p style="margin:10px 0 0;color:#374151">Based on your recent workload signals, we recommend the following adjustments for the coming week:</p>
          <ul style="margin:12px 0 0;padding-left:18px;color:#111827">
            ${actions.map(a => `<li style="margin:8px 0">${escapeHtml(a)}</li>`).join('')}
          </ul>
          <p style="margin:12px 0 0;color:#374151">These steps are designed to support performance and well-being. If anything feels unclear, please reply to your manager with what would make this week more sustainable.</p>
          <p style="margin:14px 0 0;color:#6b7280;font-size:12px">This is an advisory plan generated from workplace signals. It is not a medical assessment.</p>
        </div>
      </div>
    `;

    const ok = confirm(`Send this plan to ${employeeName} (${to})?`);
    if (!ok) return;

    const reset = setBusy(confirmBtn, 'Sending…');
    try {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html })
      });
      showPulseToast('Plan sent', `Sent to ${employeeName}.`);
      modal.style.display = 'none';
    } catch (e) {
      status.textContent = 'Send failed. Please try again.';
      console.warn('Plan send failed', e);
    } finally {
      reset();
    }
  };

  confirmBtn.onclick = doSend;
  modal.style.display = 'flex';
}

function pulseDemoCtaHtml(){
  return `
    <div style="margin-bottom:14px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px 14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="min-width:200px">
          <div style="font-size:11px;font-weight:900;color:#334155">Demo analysis generated</div>
          <div style="font-size:12px;color:#64748b;margin-top:3px;font-weight:700;line-height:1.4">This is a sample report based on demo data. Upload your own metrics to generate a real weekly brief.</div>
        </div>
        <button onclick="pulseCtaUploadOwnData()" style="background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.12);border-radius:12px;padding:10px 14px;color:#0f172a;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap">Upload your own data</button>
      </div>
    </div>
  `;

  renderWorkforceInsights();
}

function pulseCtaUploadOwnData(){
  setPulseDemoActive(false);
  switchPulseTab('csv');
  const panel = document.getElementById('pulseCsvPanel');
  if (panel && panel.scrollIntoView) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const card = panel?.querySelector('label');
  if (card) {
    const old = card.style.boxShadow;
    card.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.22)';
    setTimeout(() => { card.style.boxShadow = old; }, 1200);
  }
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function toCsv(rows){
  const esc = (v)=>{
    const s = String(v ?? '');
    if (/[\n\r,\"]/g.test(s)) return '"' + s.replaceAll('"','""') + '"';
    return s;
  };
  return rows.map(r=>r.map(esc).join(',')).join('\n');
}

function download(filename, content, type){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function extractPdfText(file){
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.mjs';

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const c = await page.getTextContent();
    out += c.items.map(i => i.str).join(' ') + '\n';
  }
  return out.trim();
}

function parseCsvText(text){
  const rows = [];
  let row = [];
  let cur = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length){
    const ch = text[i];
    if (inQuotes){
      if (ch === '"' && text[i+1] === '"'){ cur += '"'; i += 2; continue; }
      if (ch === '"'){ inQuotes = false; i++; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"'){ inQuotes = true; i++; continue; }
    if (ch === ','){ row.push(cur); cur = ''; i++; continue; }
    if (ch === '\n'){
      row.push(cur); cur = ''; rows.push(row); row = []; i++; continue;
    }
    if (ch === '\r'){ i++; continue; }
    cur += ch; i++;
  }
  row.push(cur);
  rows.push(row);
  const cleaned = rows.filter(r=>r.some(c=>String(c).trim() !== ''));
  return cleaned;
}

function normalizeKey(s){
  return String(s || '').toLowerCase().trim().replaceAll(/\s+/g,' ');
}

function mapEmployeeRows(csvRows){
  const [headerRaw, ...data] = csvRows;
  const header = headerRaw.map(normalizeKey);

  const idx = {
    name: header.findIndex(h=>h === 'name' || h === 'employee' || h === 'employee name'),
    weeklyHours: header.findIndex(h=>h === 'weekly hours' || h === 'weeklyhours' || h === 'hours'),
    weekendHours: header.findIndex(h=>h === 'weekend hours' || h === 'weekendhours'),
    afterHoursMessages: header.findIndex(h=>h === 'after-hours messages' || h === 'after hours messages' || h === 'afterhours messages' || h === 'afterhoursmessages'),
    sickDays: header.findIndex(h=>h === 'sick days' || h === 'sickdays'),
    lastVacation: header.findIndex(h=>h === 'last vacation' || h === 'lastvacation')
  };

  if (idx.name < 0) throw new Error('CSV must include a name column');

  return data
    .filter(r=>String(r[idx.name] || '').trim() !== '')
    .map(r=>({
      name: String(r[idx.name] || '').trim(),
      weeklyHours: Number(r[idx.weeklyHours] || 0),
      weekendHours: Number(r[idx.weekendHours] || 0),
      afterHoursMessages: Number(r[idx.afterHoursMessages] || 0),
      sickDays: Number(r[idx.sickDays] || 0),
      lastVacation: String(r[idx.lastVacation] || '').trim()
    }));
}

async function apiFetch(path, { method='POST', body=null, accessToken=null } = {}){
  const headers = { 'content-type':'application/json' };

  if (supabase && !accessToken) {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      accessToken = data.session.access_token;
      session = data.session;
    }
  }

  if (accessToken) headers.authorization = 'Bearer ' + accessToken;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : null });
  const data = await readJsonSafe(res);
  if (!res.ok){
    const msg = (data && data.error) ? data.error : ('Request failed: ' + res.status);
    throw new Error(msg);
  }
  return data;
}

function renderHistory(containerId, items, type) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (type === 'pulse') {
    try{
      const countEl = document.getElementById('pulseHistoryCount');
      const c = Array.isArray(items) ? items.length : 0;
      if (countEl) {
        countEl.textContent = String(c);
        countEl.hidden = !(c > 0);
      }

      const list = document.getElementById('pulseHistory');
      if (list) list.setAttribute('data-has-items', c > 0 ? '1' : '0');
    }catch(e){ /* noop */ }
  }

  if (!items || items.length === 0) {
    const emptyCopy = type === 'pulse'
      ? 'Run Burnout Intelligence to generate your first weekly report. Your recent analyses will appear here for quick loading and comparison.'
      : type === 'hire'
      ? 'Analyze candidates to generate your first shortlist. Your recent analyses will appear here for quick review.'
      : type === 'board'
      ? 'Generate your first workforce insights plan. Your recent analyses will appear here here once you run a plan.'
      : 'Run your first analysis to populate history.';
    el.innerHTML = `
      <div style="background:rgba(0,0,0,0.02);border:1px dashed rgba(0,0,0,0.14);border-radius:14px;padding:14px">
        <div style="font-weight:900;color:#0f172a">No recent activity yet</div>
        <div class="small" style="margin-top:6px;color:#64748b;font-weight:700;line-height:1.5">${escapeHtml(emptyCopy)}</div>
      </div>
    `;
    renderAIInsights();
    renderPulseTrend();

    updateNavBurnoutBadge(window.__lastDecisionEngine);
    if (type === 'pulse') {
      const exportBtn = document.getElementById('btnExportPulseXlsx');
      if (exportBtn) exportBtn.disabled = true;
    }
    return;
  }

  const decision = computeDecisionEngine(emps, getCompanyTrendSeries(8));
  window.__lastDecisionEngine = decision;
  if (type === 'pulse') updateNavBurnoutBadge(decision);
  if (type === 'pulse') {
    const exportBtn = document.getElementById('btnExportPulseXlsx');
    if (exportBtn) exportBtn.disabled = false;
  }

  const colorMap = { hire: '#6366f1', board: '#00b894', pulse: '#FF6B6B' };
  const color = colorMap[type];

  window.__historyCache = window.__historyCache || {};
  window.__historyCache[type] = items;

  el.innerHTML = `
    <div style="border-top:1px solid rgba(0,0,0,0.08);padding-top:16px;margin-top:8px">
      <div style="font-size:11px;font-weight:900;color:${color};letter-spacing:0.08em;margin-bottom:10px">🕐 RECENT ANALYSES</div>
      <div style="display:grid;gap:8px">
        ${items.map((item, idx) => {
          const date = new Date(item.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
          let preview = '';
          if (type === 'hire') {
            const count = (item.candidates || []).length;
            const top = item.candidates?.[0];
            preview = `${count} candidate${count>1?'s':''} analyzed${top ? ` · Top: ${top.name} (${top.matchScore}/100)` : ''}`;
          } else if (type === 'board') {
            preview = `${item.employee_name || 'Employee'} · ${item.employee_role || 'Role'}`;
          } else if (type === 'pulse') {
            const at = item.at_risk_count || 0;
            const total = (item.employees || []).length;
            preview = `${total} employees · ${at} at risk`;
          }
          return `
            <div
              style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.07);border-radius:10px;padding:10px 14px;transition:all 0.2s"
              onmouseover="this.style.background='rgba(${type==='hire'?'99,102,241':type==='board'?'0,184,148':'255,107,107'},0.06)';this.style.borderColor='${color}44'"
              onmouseout="this.style.background='rgba(0,0,0,0.02)';this.style.borderColor='rgba(0,0,0,0.07)'">
              <div>
                <div style="font-size:12px;font-weight:700;color:#0f172a">${preview}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:2px">${date}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
                <button onclick="loadHistoryItem('${type}', ${idx})" style="font-size:10px;font-weight:800;color:${color};background:${color}15;border:none;border-radius:6px;padding:5px 10px;cursor:pointer">Load →</button>
                <button onclick="deleteHistoryItem('${type}', ${idx}, '${item.id}')"
                  style="background:none;border:none;padding:2px 6px;font-size:14px;cursor:pointer;color:#94a3b8"
                  onmouseover="this.style.color='#FF6B6B'" onmouseout="this.style.color='#94a3b8'">🗑</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  renderAIInsights();
  renderPulseTrend();
}

async function deleteHistoryItem(type, idx, id) {
  try {
    const tableMap = { hire: 'hire_results', board: 'board_results', pulse: (window.__pulseHistorySource === 'analysis_history' ? 'analysis_history' : 'pulse_results') };
    const historyIdMap = { hire: 'hireHistory', board: 'boardHistory', pulse: 'pulseHistory' };
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s && id) {
      await supabase.from(tableMap[type]).delete().eq('id', id);
    }
    if (window.__historyCache?.[type]) {
      window.__historyCache[type] = window.__historyCache[type].filter((_, i) => i !== idx);
      renderHistory(historyIdMap[type], window.__historyCache[type], type);
    }
  } catch(e) { console.warn('Delete history item failed', e); }
}

function loadHistoryItem(type, idx) {
  const items = window.__historyCache?.[type] || [];
  const item = items[idx];
  if (!item) return;
  if (type === 'hire') renderHireDetail(item.candidates || []);
  else if (type === 'board') renderBoardPlan(item.onboarding_plan);
  else if (type === 'pulse') renderPulse(item.employees || []);
}

async function loadHistory() {
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;

    const { data: hireData } = await supabase
      .from('hire_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (hireData && hireData[0]) {
      renderHireDetail(hireData[0].candidates);
      document.getElementById('statCandidates').textContent = String(hireData[0].candidates.length);
    }
    if (hireData) renderHistory('hireHistory', hireData, 'hire');

    const { data: boardData } = await supabase
      .from('board_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (boardData && boardData[0]) {
      renderBoardPlan(boardData[0].onboarding_plan);
    }
    if (boardData) renderHistory('boardHistory', boardData, 'board');

    const pulseHistory = await loadPulseHistoryFromAnalysisHistory(5);
    const pulseData = pulseHistory && pulseHistory.length ? pulseHistory : (await (async ()=>{
      const { data } = await supabase
        .from('pulse_results')
        .select('*')
        .eq('user_id', s.user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      window.__pulseHistorySource = 'pulse_results';
      return data || [];
    })());

    if (pulseData && pulseData[0]) {
      renderPulse(pulseData[0].employees);
      document.getElementById('statAtRisk').textContent = String(pulseData[0].at_risk_count || 0);

      const atRiskEmps = (pulseData[0].employees || [])
        .filter(e => ['high','critical'].includes(String(e.riskLevel||'').toLowerCase()))
        .slice(0, 3);
      const preview = document.getElementById('atRiskPreview');
      if (preview) {
        if (atRiskEmps.length === 0) {
          preview.innerHTML = '<div style="color:#00b894;font-weight:700">✓ No at-risk employees detected.</div>';
        } else {
          preview.innerHTML = atRiskEmps.map(e => {
            const color = String(e.riskLevel||'').toLowerCase() === 'critical' ? '#ff3b3b' : '#FF6B6B';
            const lvl = String(e.riskLevel||'').toUpperCase();
            return `<div onclick="showSection('pulse')" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:${color}08;border:1px solid ${color}22;border-radius:8px;margin-bottom:6px;cursor:pointer">
              <div style="font-weight:700;font-size:13px">${escapeHtml(e.name||'')}</div>
              <span style="background:${color}22;border:1px solid ${color}44;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:900;color:${color}">${escapeHtml(lvl)}</span>
            </div>`;
          }).join('');
        }
      }
    }
    if (pulseData) renderHistory('pulseHistory', pulseData, 'pulse');
    renderWorkforceInsights();
  } catch(e) { console.warn('Load history failed', e); }
}

async function clearHire(){
  document.getElementById('hireDetail').innerHTML = '';
  document.getElementById('statCandidates').textContent = '0';
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;
    const { data: hireData } = await supabase
      .from('hire_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (hireData) renderHistory('hireHistory', hireData, 'hire');
  } catch(e) { console.warn(e); }
}

async function clearBoard(){
  document.getElementById('boardOut').innerHTML = '';
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;
    const { data: boardData } = await supabase
      .from('board_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (boardData) renderHistory('boardHistory', boardData, 'board');
  } catch(e) { console.warn(e); }
}

async function clearPulse(){
  setPulseDemoActive(false);
  document.getElementById('pulseOut').innerHTML = '';
  document.getElementById('statAtRisk').textContent = '0';
  window.__lastDecisionEngine = null;
  window.__lastActionPlans = null;
  updateNavBurnoutBadge(null);
  const exportBtn = document.getElementById('btnExportPulseXlsx');
  if (exportBtn) exportBtn.disabled = true;
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;
    const pulseData = await loadPulseHistoryFromAnalysisHistory(5);
    if (pulseData && pulseData.length) {
      renderHistory('pulseHistory', pulseData, 'pulse');
    } else {
      const { data } = await supabase
        .from('pulse_results')
        .select('*')
        .eq('user_id', s.user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      window.__pulseHistorySource = 'pulse_results';
      if (data) renderHistory('pulseHistory', data, 'pulse');
    }
  } catch(e) { console.warn(e); }
}

function addFeed(type, message){
  const feed = document.getElementById('feedList') || document.getElementById('feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = `<div class="t">${escapeHtml(type)}</div><div class="m">${escapeHtml(message)}</div>`;
  feed.prepend(el);
}

async function loadSettings(){
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    const u = s?.user || null;

    const userEmail = u?.email || '';
    const createdAt = u?.created_at || new Date().toISOString();

    const memberSince = new Date(createdAt).toLocaleDateString('en-GB', {
      day:'2-digit',
      month:'2-digit',
      year:'numeric'
    });

    const settingsEl = document.getElementById('tab-settings');
    if (!settingsEl) return;

    settingsEl.innerHTML = `
      <div style="max-width:700px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div style="padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px">
            <div style="font-size:10px;color:#64748b;font-weight:900">STATUS</div>
            <div style="font-weight:900;margin-top:6px">Free access</div>
          </div>
          <div style="padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px">
            <div style="font-size:10px;color:#64748b;font-weight:900">MEMBER SINCE</div>
            <div style="font-weight:900;margin-top:6px">${memberSince}</div>
          </div>
        </div>
        <div style="margin-top:16px;font-size:12px;color:#64748b">
          Plan: <strong>Free access</strong> · Billing: <strong>Not active</strong>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
          <div style="padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px">
            <div style="font-size:10px;color:#64748b;font-weight:900">PLAN</div>
            <div style="font-weight:900;margin-top:6px">Free access</div>
          </div>
          <div style="padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px">
            <div style="font-size:10px;color:#64748b;font-weight:900">BILLING</div>
            <div style="font-weight:900;margin-top:6px">Not active</div>
          </div>
        </div>
      </div>
    `;
  } catch(e) {
    console.warn('loadSettings error:', e);
  }
}

async function runPulseDemo(){
  const btn = document.getElementById('btnPulseDemo');
  let msg = document.getElementById('pulseMsg');
  if (!btn) return;
  if (msg) msg.textContent = '';

  try {
    const hasRealPulseHistory = Array.isArray(window.__historyCache?.pulse) && window.__historyCache.pulse.length > 0;
    if (hasRealPulseHistory) {
      const ok = confirm('You already have Burnout Intelligence analyses in this account. Run a demo analysis without overwriting your real data?');
      if (!ok) return;
    }

    const demoEmployees = buildPulseDemoEmployees();
    setPulseManualEmployees(demoEmployees);
    setPulseDemoActive(true);

    document.getElementById('pulseOut').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px">⏳ Running sample analysis…</div>';

    const rows = parseCsvText([
      'name,weekly hours,weekend hours,after-hours messages,sick days,last vacation',
      ...demoEmployees.map(e => `${e.name||''},${e.weeklyHours||0},${e.weekendHours||0},${e.afterHoursMessages||0},${e.sickDays||0},${e.lastVacation||'unknown'}`)
    ].join('\n'));

    const employeesInput = mapEmployeeRows(rows);

    const data = await apiFetch('/api/pulse', {
      method:'POST',
      accessToken: (await supabase.auth.getSession()).data?.session?.access_token,
      body: { employees: employeesInput }
    });

    if (!data || !Array.isArray(data.employees)) throw new Error('Invalid AI response');

    const inputByName = {};
    for (const e of employeesInput) {
      const k = String(e?.name || '').toLowerCase();
      if (k) inputByName[k] = e;
    }

    const mergedEmployees = data.employees.map(e => {
      const k = String(e?.name || '').toLowerCase();
      const metrics = inputByName[k] || {};
      return { ...metrics, ...e };
    });

    const demoCompanyScore = computeCompanyRiskScore(mergedEmployees);
    setPulseDemoActive(true, { series: buildDemoTrendSeries(demoCompanyScore, 6) });

    pulseLast = { ...data, employees: mergedEmployees };
    renderPulse(mergedEmployees);

    renderAIInsights();
    renderPulseTrend();

    showPulseToast('Demo analysis generated', 'This is a sample report based on demo data.');

    if (msg) msg.textContent = 'Sample analysis ready.';
  } catch(err) {
    if (msg) msg.textContent = err && err.message ? err.message : 'Demo failed';
    setPulseDemoActive(false);
  } finally {
    reset();
  }
}

function switchTab(tab){
  document.querySelectorAll('.nav-item').forEach(b => {
    const itemTab = b.getAttribute('data-tab');
    const isActive = itemTab === tab || (tab.startsWith('pulse-') && itemTab === 'pulse');
    b.classList.toggle('active', isActive);
  });

  document.querySelectorAll('.nav-item[data-section]').forEach(b => {
    b.classList.remove('active');
  });

  document.querySelectorAll('.module').forEach(m => {
    m.classList.remove('on');
  });

  const t = document.getElementById('tab-' + tab);
  if (t) t.classList.add('on');

  const titleMap = {
    overview: 'Overview',
    hire: 'Hiring Intelligence',
    board: 'Workforce Insights',
    pulse: 'Burnout Intelligence',
    'pulse-plans': 'Strategic Action Plans',
    'pulse-hotspots': 'Team Hotspots',
    'pulse-insights': 'AI Insights',
    settings: 'Settings'
  };

  document.getElementById('pageTitle').textContent = titleMap[tab] || 'Dashboard';

  if (tab === 'settings') {
    loadSettings();
  }

  if (tab === 'board') {
    renderWorkforceInsights();
  }

  if (tab === 'pulse') {
    updateNavBurnoutBadge(window.__lastDecisionEngine);
    loadPulseData();
  }

  if (['pulse-plans', 'pulse-hotspots', 'pulse-insights'].includes(tab)) {
    updateNavBurnoutBadge(window.__lastDecisionEngine);
  }
}

function showSection(section){
  if (section === 'candidate') {
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    const nav = document.querySelector(`.nav-item[data-section="candidate"]`);
    if (nav) nav.classList.add('active');
    switchTab('hire');
    return;
  }

  if (['overview','hire','board','pulse','pulse-plans','pulse-hotspots','pulse-insights','settings'].includes(section)) {
    switchTab(section);
    return;
  }
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (nav) nav.classList.add('active');

  if (section === 'interview') {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('on'));
    document.getElementById('mod-interview')?.classList.add('on');
    document.getElementById('pageTitle').textContent = 'AI Interview';
  }
}

function riskClass(level){
  const l = String(level || '').toLowerCase();
  if (l === 'low') return 'low';
  if (l === 'medium') return 'medium';
  if (l === 'high') return 'high';
  return 'critical';
}

let supabase = null;
let session = null;

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
};

async function waitForSubscription(email, token, {
  maxAttempts = 8,
  delayMs = 2500
} = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const subRes = await fetch('/api/check-subscription', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ email: String(email || '').toLowerCase() })
      });

      const subData = await readJsonSafe(subRes).catch(() => null);

      if (subRes.ok && subData && subData.subscribed === true) {
        return subData;
      }
    } catch (e) {
      console.warn('waitForSubscription attempt failed:', e);
    }

    if (i < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  return { subscribed: false };
}

function showActivationToast(message = 'Activating your subscription...'){
  let el = document.getElementById('activationToast');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'activationToast';
  el.style.cssText = [
    'position:fixed',
    'top:24px',
    'right:24px',
    'z-index:9999',
    'background:linear-gradient(90deg,#FF6B6B,#FFD93D)',
    'color:#0f172a',
    'padding:14px 18px',
    'border-radius:14px',
    'font-weight:900',
    'font-size:13px',
    'box-shadow:0 12px 36px rgba(255,107,107,0.28)'
  ].join(';');
  el.textContent = message;
  document.body.appendChild(el);
  return el;
}

function hideActivationToast(){
  const el = document.getElementById('activationToast');
  if (el) el.remove();
}

async function initSupabase(){
  if (!window.supabaseLib && window.supabase && typeof window.supabase.createClient === 'function') {
    window.supabaseLib = window.supabase;
  }

  const supabaseLib = window.supabaseLib || window.supabase;
  if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
    throw new Error('Supabase library not loaded');
  }

  const res = await fetch('/api/public-config');
  const data = await readJsonSafe(res);
  if (!res.ok) throw new Error((data && data.error) ? data.error : 'Failed to load config');
  if (!data.supabaseUrl || !data.supabaseAnonKey) throw new Error('CONFIG_MISSING');

  supabase = supabaseLib.createClient(data.supabaseUrl, data.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    }
  });

  window.supabaseClient = supabase;

  const { data: sData } = await supabase.auth.getSession();
  session = sData.session;

  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;

    if (_event === 'SIGNED_OUT') {
      window.__subChecked = false;
      const gate = document.getElementById('gate');
      const app = document.getElementById('app');
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      return;
    }

    if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED' || _event === 'INITIAL_SESSION') {
      window.__subChecked = false;
      await renderAuthState();
    }
  });

  return true;
}

async function loginGoogle(){
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/dashboard.html'
    }
  });
  if (error) throw error;
}

async function logout(){
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function loadUserPlan() {
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s?.user?.email) return;

    const email = String(s.user.email || '').toLowerCase();

    const { data, error } = await supabase
      .from('subscribers')
      .select('plan, status, created_at')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.warn('loadUserPlan error:', error);
      return;
    }

    const planEl = document.getElementById('currentPlan');
    const statusEl = document.getElementById('planStatus');
    if (planEl) planEl.textContent = 'Free access';
    if (statusEl) statusEl.textContent = 'Not active';

    const sidebarPlanEl = document.getElementById('sidebarPlan');
    if (sidebarPlanEl) {
      sidebarPlanEl.textContent = 'FREE ACCESS';
      sidebarPlanEl.style.background = 'rgba(0,0,0,0.06)';
      sidebarPlanEl.style.color = '#0f172a';
    }
  } catch(e) {
    console.warn('loadUserPlan failed:', e);
  }
}

async function renderAuthState(){
  const gate = document.getElementById('gate');
  const app = document.getElementById('app');

  if (!session){
    if (gate) gate.hidden = false;
    if (app) app.hidden = true;
    return;
  }

  if (gate) gate.hidden = true;
  if (app) app.hidden = false;

  if (window.__showWelcome) {
    window.__showWelcome = false;
    setTimeout(() => {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:9999;background:linear-gradient(90deg,#FF6B6B,#FFD93D);border-radius:16px;padding:18px 32px;text-align:center;box-shadow:0 8px 40px rgba(255,107,107,0.4);min-width:320px';
      toast.innerHTML = `
        <div style="font-size:24px;margin-bottom:6px">🎉</div>
        <div style="font-family:'Syne',system-ui;font-weight:900;font-size:16px;color:#0f172a">Welcome to Peoplera!</div>
        <div style="font-size:12px;color:#0f172a;opacity:0.7;margin-top:4px">You're signed in. Let's get started.</div>
      `;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.transition = 'opacity 0.5s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
      }, 4000);
    }, 1000);
  }

  const email = session.user?.email || 'Signed in';
  const userPill = document.getElementById('userPill');
  if (userPill) userPill.textContent = email;

  updateUserProfile();
}

async function checkStatus(){
  const sEl = document.getElementById('supabaseStatus');
  const aEl = document.getElementById('aiStatus');
  if (sEl) sEl.textContent = session ? 'Connected (session active)' : 'Not signed in';
  if (!aEl) return;
  try{
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) { aEl.textContent = 'Not authenticated'; return; }
    const res = await fetch('/api/hire', {
      method:'POST',
      headers:{'content-type':'application/json', 'authorization': 'Bearer ' + token},
      body: JSON.stringify({ ping: true })
    });
    aEl.textContent = res.status !== 500 ? 'Connected' : 'AI endpoint unavailable';
  }catch(err){
    if (aEl) aEl.textContent = (err && err.message) ? err.message : 'AI endpoint unavailable';
  }
}

async function runInterview(){
  const name = document.getElementById('interviewCandidateName')?.value?.trim();
  const weaknesses = document.getElementById('interviewWeaknesses')?.value?.trim();
  const jobDesc = document.getElementById('interviewJobDesc')?.value?.trim();
  const status = document.getElementById('interviewStatus');
  const out = document.getElementById('interviewOut');

  if (!name || !jobDesc) { status.textContent = 'Please fill in candidate name and job description.'; return; }

  status.textContent = 'Generating questions…';
  out.innerHTML = '<div style="color:#64748b;font-size:13px">Analyzing candidate profile…</div>';

  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    const token = s?.access_token || '';

    const res = await fetch('/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ candidate: { name, weaknesses }, jobDescription: jobDesc })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    const questions = data.questions || [];
    const catColors = { Behavioral:'#6366f1', Technical:'#00b894', Culture:'#FFD93D', Situational:'#FF6B6B' };

    out.innerHTML = questions.map((q, i) => {
      const color = catColors[q.category] || '#6366f1';
      return `
        <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:16px;margin-bottom:10px;border-left:3px solid ${color}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="background:${color}18;border:1px solid ${color}33;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:900;color:${color}">${escapeHtml(q.category)}</span>
            <span style="font-size:11px;color:#94a3b8;font-weight:700">Q${i+1}</span>
          </div>
          <div style="font-weight:700;font-size:13px;color:#0f172a;line-height:1.5;margin-bottom:6px">${escapeHtml(q.question)}</div>
          <div style="font-size:11px;color:#64748b;line-height:1.5"><span style="font-weight:800">Listen for:</span> ${escapeHtml(q.probes || '')}</div>
        </div>
      `;
    }).join('');

    status.textContent = `${questions.length} questions generated.`;
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    out.innerHTML = '';
  }
}

function renderAIInsights(){
  const out = document.getElementById('aiInsightsOut');
  if (!out) return;

  const latestEmployees = Array.isArray(window.__lastPulseEmployees)
    ? window.__lastPulseEmployees
    : (Array.isArray(window.__historyCache?.pulse) && window.__historyCache.pulse[0]?.employees)
    ? window.__historyCache.pulse[0].employees
    : [];

  const emps = Array.isArray(latestEmployees) ? latestEmployees : [];
  const overHours = emps.filter(e => Number(e?.weeklyHours || e?.weekly_hours || 0) >= 50).length;
  const highRisk = emps.filter(e => ['high','critical'].includes(String(e?.riskLevel || '').toLowerCase())).length;
  const teamSize = emps.length;

  const series = getCompanyTrendSeries(8);
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = (last && prev) ? (last - prev) : null;

  const decision = computeDecisionEngine(emps, series);
  window.__lastDecisionEngine = decision;

  const insights = [];

  // Primary insight: translate decision-engine signal into business-relevant output.
  if (decision?.inputs?.teamSize) {
    const riskWord = decision.status?.label ? `${decision.status.label} risk` : 'risk';
    insights.push({
      kind: 'trend',
      icon: '🏷️',
      title: `Company burnout score: ${decision.score}/100 (${riskWord})`,
      detail: `${decision.predictionText} Estimated productivity at risk: ~${decision.productivityAtRiskWeekly.toLocaleString()} per week.`
    });
  }

  if (decision?.inputs?.teamSize) {
    const lvl = decision?.sickLeaveRisk?.level || 'Low';
    const affected = Number(decision?.sickLeaveAffected) || 0;
    const horizon = Number(decision?.sickLeaveHorizonDays) || 30;
    insights.push({
      kind: 'warning',
      icon: '🏥',
      title: `Potential sick leave risk: ${lvl} (next ${horizon} days)`,
      detail: affected ? `${affected} employee(s) potentially at risk. Use early interventions and manager check-ins to reduce escalation.` : 'Directional estimate based on current signals. Add sick days + workload metrics for higher confidence.'
    });
  }

  if (teamSize > 0 && highRisk > 0) {
    insights.push({
      kind: 'warning',
      icon: '⚠️',
      title: `${highRisk} ${highRisk === 1 ? 'employee is' : 'employees are'} at high risk`,
      detail: 'Review hotspots and assign interventions this week. Insights are derived from patterns typically tracked in HR systems (e.g., workload, time-off, and sick leave signals).'
    });
  }

  if (teamSize > 0 && overHours > 0) {
    insights.push({
      kind: 'warning',
      icon: '⏱️',
      title: `${overHours} ${overHours === 1 ? 'employee shows' : 'employees show'} overtime signals`,
      detail: 'Consider reducing weekly hours or rotating load across the team.'
    });
  }

  if (delta !== null) {
    const dir = delta > 0 ? 'increased' : 'decreased';
    const magnitude = Math.abs(delta);
    insights.push({
      kind: 'trend',
      icon: delta > 0 ? '📈' : '📉',
      title: `Burnout risk ${dir} ${magnitude.toFixed(0)} pts this week`,
      detail: 'Track the top drivers and validate against team changes.'
    });
  }

  insights.push({
    kind: 'suggestion',
    icon: '🧠',
    title: 'Run a weekly Burnout Intelligence brief',
    detail: 'Standardize 1 action per hotspot to show measurable progress. Works alongside the patterns typically tracked in HR systems.'
  });

  while (insights.length < 3) {
    insights.push({
      kind: 'suggestion',
      icon: '✅',
      title: 'Add more signals to improve accuracy',
      detail: 'Include weekend hours, after-hours messages, and sick days.'
    });
  }

  const palette = {
    warning: { c: '#FF6B6B', bg: 'rgba(255,107,107,0.08)', bd: 'rgba(255,107,107,0.18)' },
    suggestion: { c: '#6366f1', bg: 'rgba(99,102,241,0.07)', bd: 'rgba(99,102,241,0.16)' },
    trend: { c: '#00b894', bg: 'rgba(0,184,148,0.07)', bd: 'rgba(0,184,148,0.16)' }
  };

  const list = insights.slice(0, 5);
  const primary = list[0];

  const renderCard = (it, { primary = false } = {}) => {
    const p = palette[it.kind] || palette.suggestion;
    return `
      <div style="background:${p.bg};border:${primary ? '1.5px' : '1px'} solid ${p.bd};border-radius:16px;padding:${primary ? '16px 16px' : '14px 14px'};display:flex;gap:12px;align-items:flex-start">
        <div style="width:${primary ? '38px' : '34px'};height:${primary ? '38px' : '34px'};border-radius:14px;background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.06);display:grid;place-items:center;flex-shrink:0">${it.icon}</div>
        <div style="min-width:0;flex:1">
          ${primary ? `<div style=\"font-size:12px;font-weight:700;color:${p.c};letter-spacing:0.10em;margin-bottom:6px\">PRIMARY INSIGHT</div>` : ''}
          <div style="font-weight:600;color:#111827;line-height:1.35;font-size:${primary ? '14px' : '13px'}">${escapeHtml(it.title)}</div>
          <div class="small" style="margin-top:6px;color:#6b7280;font-weight:600;line-height:1.65">${escapeHtml(it.detail)}</div>
        </div>
        <div style="flex-shrink:0">
          <span style="background:${p.c}18;border:1px solid ${p.c}33;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:900;color:${p.c};letter-spacing:0.06em">${escapeHtml(it.kind.toUpperCase())}</span>
        </div>
      </div>
    `;
  };

  out.innerHTML = [
    renderCard(primary, { primary: true }),
    ...list.slice(1).map(it => renderCard(it, { primary: false }))
  ].join('');
}

function renderWorkforceInsights(){
  const el = document.getElementById('workforceInsightsOut');
  if (!el) return;

  const latestEmployees = Array.isArray(window.__lastPulseEmployees)
    ? window.__lastPulseEmployees
    : (Array.isArray(window.__historyCache?.pulse) && window.__historyCache.pulse[0]?.employees)
    ? window.__historyCache.pulse[0].employees
    : [];

  const emps = Array.isArray(latestEmployees) ? latestEmployees : [];
  if (!emps.length) {
    el.innerHTML = `
      <div style="background:rgba(0,0,0,0.02);border:1px dashed rgba(0,0,0,0.14);border-radius:14px;padding:14px">
        <div style="font-weight:900;color:#0f172a">No burnout intelligence yet</div>
        <div class="small" style="margin-top:6px;color:#64748b;font-weight:700;line-height:1.5">Run Burnout Intelligence to generate your first workforce snapshot. After each run, this panel summarizes hotspots, workload imbalance, and risk clusters.</div>
      </div>
    `;
    return;
  }

  const level = (l) => {
    const v = String(l || '').toLowerCase();
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
    return 'medium';
  };

  const normHours = (e) => Number(e?.weeklyHours || e?.weekly_hours || 0);
  const normAfter = (e) => Number(e?.afterHoursMessages || e?.after_hours_messages || 0);
  const normSick = (e) => Number(e?.sickDays || e?.sick_days || 0);

  const counts = { low:0, medium:0, high:0, critical:0 };
  for (const e of emps) counts[level(e?.riskLevel)]++;

  const overtime = emps.filter(e => normHours(e) >= 55);
  const afterHours = emps.filter(e => normAfter(e) >= 10);
  const sickSignals = emps.filter(e => normSick(e) >= 3);
  const highCluster = emps.filter(e => ['high','critical'].includes(level(e?.riskLevel)));

  const byDriver = {};
  for (const e of emps) {
    const drivers = Array.isArray(e?.heuristicDrivers) ? e.heuristicDrivers : (Array.isArray(e?.drivers) ? e.drivers : []);
    for (const d of drivers) {
      const k = String(d || '').trim();
      if (!k) continue;
      byDriver[k] = (byDriver[k] || 0) + 1;
    }
  }
  const topDrivers = Object.entries(byDriver).sort((a,b)=>b[1]-a[1]).slice(0, 3);

  const hours = emps.map(normHours).filter(n => Number.isFinite(n) && n > 0);
  const maxH = hours.length ? Math.max(...hours) : 0;
  const minH = hours.length ? Math.min(...hours) : 0;
  const imbalance = (maxH && minH) ? (maxH - minH) : 0;

  const clusterSignals = [
    overtime.length ? `${overtime.length} with overtime (55h+)` : '',
    afterHours.length ? `${afterHours.length} with after-hours activity` : '',
    sickSignals.length ? `${sickSignals.length} with sick-leave signals` : ''
  ].filter(Boolean);
  const clustersText = clusterSignals.length
    ? `Signals: ${clusterSignals.join(' · ')}.`
    : 'No major signal clusters detected beyond baseline levels.';

  const driversText = topDrivers.length
    ? topDrivers.map(([k,v]) => `${escapeHtml(k)} (${v})`).join(' · ')
    : 'Not enough driver data yet — run Burnout Intelligence again after adding more employee signals.';

  const businessImpact = `~${decision.productivityAtRiskWeekly.toLocaleString()} / week at productivity risk · ${decision.sickLeaveExposureDays} sick-leave day(s) exposure (next 2–4 weeks)`;
  const sickLeaveModule = `${escapeHtml(decision?.sickLeaveRisk?.level || 'Low')} potential sick leave risk · ${Number(decision?.sickLeaveAffected) || 0} employee(s) potentially at risk (next ${Number(decision?.sickLeaveHorizonDays) || 30} days)`;
  const nextActions = Array.isArray(decision.actions) ? decision.actions.slice(0, 2) : [];
  const plans = computeStrategicActionPlans(emps, decision);
  const planHighlights = Array.isArray(plans) ? plans.slice(0, 2) : [];

  const burnoutIntel = (() => {
    const score = Number(decision?.score) || 0;
    const riskLabel = escapeHtml(decision?.status?.label || 'Medium');
    const riskTone = String(decision?.status?.tone || '#FF6B6B');

    const series = getCompanyTrendSeries(8);
    const last = Number(series?.[series.length - 1] || score);
    const prev = Number(series?.[series.length - 2] || last);
    const delta = (series && series.length >= 2) ? (last - prev) : 0;
    const dir = Math.abs(delta) < 2 ? 'Stable' : (delta > 0 ? 'Increasing' : 'Decreasing');
    const trendCopy = (series && series.length >= 2)
      ? `${dir} trend (last 2 weeks)`
      : 'Trend unlocked after 2+ Burnout Intelligence runs';

    const top = topDrivers[0]?.[0] ? String(topDrivers[0][0]) : '';
    const topDriverShort = top || 'Not enough driver data yet';
    const topDriverExplain = (() => {
      const t = top.toLowerCase();
      if (!t) return 'Add more signals (hours, after-hours, sick days) for clearer causes.';
      if (t.includes('workload') || t.includes('overload')) return 'Workload intensity is the primary contributor right now.';
      if (t.includes('overtime') || t.includes('hours')) return 'Overtime signals are the primary contributor right now.';
      if (t.includes('after-hours')) return 'After-hours activity is the primary contributor right now.';
      if (t.includes('imbalance')) return 'Work distribution imbalance appears to be the primary contributor.';
      return 'This is the strongest signal across your team this week.';
    })();

    const prediction = String(decision?.predictionText || '').trim() || 'No risk increase expected.';
    const action = String(Array.isArray(decision?.actions) ? decision.actions[0] : '').trim() || 'Maintain current workload balance.';

    return `
      <div style="background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.10em">BURNOUT INTELLIGENCE</div>
            <div style="margin-top:8px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
              <div style="font-family:'Syne',system-ui;font-weight:900;font-size:34px;color:#111827;line-height:1">${escapeHtml(String(score))}</div>
              <div style="font-size:12px;color:#9ca3af;font-weight:700;letter-spacing:0.08em">/100 Burnout Score</div>
              <span style="margin-left:6px;background:${riskTone};border:0;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;color:#ffffff;letter-spacing:0.06em;white-space:nowrap">${riskLabel}</span>
            </div>
          </div>
          <div style="min-width:260px;flex:1;display:grid;gap:10px">
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
              <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:10px">
                <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.10em">TREND</div>
                <div style="margin-top:6px;font-size:13px;color:#111827;font-weight:600;line-height:1.5">${escapeHtml(trendCopy)}</div>
              </div>
              <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:10px">
                <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.10em">TOP DRIVER</div>
                <div style="margin-top:6px;font-size:13px;color:#111827;font-weight:600;line-height:1.5">${escapeHtml(topDriverShort)}</div>
              </div>
            </div>

            <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);border-radius:14px;padding:10px">
              <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.10em">PREDICTION</div>
              <div style="margin-top:6px;font-size:13px;color:#111827;font-weight:600;line-height:1.65">${escapeHtml(prediction)}</div>
              <div style="margin-top:6px;font-size:12px;color:#6b7280;font-weight:600;line-height:1.65">${escapeHtml(topDriverExplain)}</div>
            </div>

            <div style="background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.18);border-radius:14px;padding:10px">
              <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.10em">NEXT ACTION</div>
              <div style="margin-top:6px;font-size:13px;color:#111827;font-weight:600;line-height:1.65">${escapeHtml(action)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  })();

  el.innerHTML = `
    <div style="display:grid;gap:12px">
      ${distBar}

      ${hotspotsList}

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${card('BUSINESS IMPACT', escapeHtml(businessImpact), '#FF6B6B')}
        ${card('RISK PREDICTION', escapeHtml(decision.predictionText), '#6366f1')}
      </div>

      ${burnoutIntel}

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${card('SICK LEAVE RISK', escapeHtml(sickLeaveModule), '#00b894')}
        ${card('TOP DRIVERS', driversText, '#8b5cf6')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${card('BURNOUT HOTSPOTS', escapeHtml(hotspotText), '#FF6B6B')}
        ${card('WORKLOAD IMBALANCE', escapeHtml(imbalanceText), '#6366f1')}
        ${card('HIGH-RISK CLUSTERS', escapeHtml(clustersText), '#00b894')}
      </div>

      ${nextActions.length ? `
        <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:14px">
          <div style="font-size:10px;font-weight:900;color:#0f172a;letter-spacing:0.10em;margin-bottom:8px">NEXT BEST ACTIONS</div>
          <div style="display:grid;gap:8px">
            ${nextActions.map(a => `<div style="font-size:12px;color:#334155;font-weight:800;line-height:1.45">- ${escapeHtml(a)}</div>`).join('')}
          </div>
        </div>
      ` : ''}

      ${planHighlights.length ? `
        <div style="background:rgba(255,255,255,0.6);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div style="font-size:10px;font-weight:900;color:#64748b;letter-spacing:0.10em">STRATEGIC ACTION PLANS</div>
            <div style="font-size:12px;color:#64748b;font-weight:800">Manager-ready plans</div>
          </div>
          <div style="margin-top:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
            ${planHighlights.map(p => `
              <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
                  <div style="font-weight:900;color:#0f172a">${escapeHtml(p.title)}</div>
                  <span style="background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.10);border-radius:999px;padding:4px 10px;font-size:10px;font-weight:900;color:#334155;white-space:nowrap">${escapeHtml(p.timeframe || '')}</span>
                </div>
                <div class="small" style="margin-top:6px;color:#64748b;font-weight:700;line-height:1.45">${escapeHtml(p.explanation || '')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

async function sendWeeklyReport(userEmail, pulseEmployees, atRiskCount){
  if (!userEmail || !pulseEmployees) return;
  const criticalList = pulseEmployees
    .filter(e => ['high','critical'].includes(String(e.riskLevel||'').toLowerCase()))
    .map(e => `<li><strong>${escapeHtml(e.name)}</strong> — Score: ${escapeHtml(e.burnoutScore)}/100 (${escapeHtml(e.riskLevel)})</li>`)
    .join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(90deg,#FF6B6B,#FFD93D);padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#0f172a;margin:0;font-size:22px">📊 Peoplera Weekly Pulse Report</h1>
      </div>
      <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px">
        <p style="color:#334155">Your weekly burnout risk summary is ready.</p>
        <div style="background:#fff;border-radius:8px;padding:16px;margin:16px 0">
          <div style="font-size:32px;font-weight:900;color:${atRiskCount > 0 ? '#FF6B6B' : '#00b894'}">${atRiskCount}</div>
          <div style="color:#64748b;font-size:13px">employees at high or critical risk</div>
        </div>
        ${criticalList ? `<div style="background:#fff;border-left:3px solid #FF6B6B;padding:16px;border-radius:8px"><h3 style="margin:0 0 10px;color:#FF6B6B">⚠ Needs attention</h3><ul style="color:#334155;padding-left:20px">${criticalList}</ul></div>` : '<p style="color:#00b894;font-weight:700">✓ No critical risks detected this week.</p>'}
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">Login to your Peoplera dashboard for full details.</p>
      </div>
    </div>
  `;

  try {
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: userEmail, subject: `Peoplera Weekly Report — ${atRiskCount} at-risk employee${atRiskCount !== 1 ? 's' : ''}`, html })
    });
  } catch(e) { console.warn('Email send failed', e); }
}

let hireLast = null;
let hireCsvRows = [];

async function readCvFiles(files){
  const items = [];
  for (const f of files){
    const name = f.name;
    let text = '';
    if (name.toLowerCase().endsWith('.txt')){
      text = await f.text();
    }else if (name.toLowerCase().endsWith('.pdf')){
      text = await extractPdfText(f);
    }else{
      continue;
    }
    items.push({ filename: name, text });
  }
  return items;
}

function renderHireDetail(candidates){
  const el = document.getElementById('hireDetail');
  el.innerHTML = candidates.map(c => {
    const score = c.matchScore || 0;
    const color = score >= 70 ? '#00e5a0' : score >= 50 ? '#FFD93D' : '#FF6B6B';
    const s = Array.isArray(c.strengths) ? c.strengths : [];
    const w = Array.isArray(c.weaknesses) ? c.weaknesses : [];
    return `
      <div style="background:rgba(99,102,241,0.04);border:1px solid rgba(99,102,241,0.15);border-radius:16px;padding:20px;margin-top:14px;border-left:3px solid ${color}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:10px">
          <div style="font-weight:900;font-size:17px;font-family:'Syne',system-ui">${escapeHtml(c.name || '')}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="font-size:11px;color:#94a3b8;font-weight:700">MATCH SCORE</div>
            <div style="font-family:'Syne',system-ui;font-weight:900;font-size:36px;color:${color};line-height:1">${score}<span style="font-size:14px;opacity:0.5">/100</span></div>
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.08);border-radius:8px;height:8px;margin-bottom:14px;overflow:hidden">
          <div style="height:100%;width:${score}%;background:linear-gradient(90deg,${color}88,${color});border-radius:8px;transition:width 1.2s ease"></div>
        </div>
        <div style="font-size:13px;color:#475569;margin-bottom:12px;line-height:1.6"><span style="color:#0f172a;font-weight:800">Recommendation:</span> ${escapeHtml(c.recommendation || '')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="background:rgba(0,229,160,0.06);border:1px solid rgba(0,229,160,0.15);border-radius:10px;padding:12px">
            <div style="font-size:11px;font-weight:800;color:#00e5a0;margin-bottom:8px;letter-spacing:0.05em">✓ STRENGTHS</div>
            ${s.map(i => `<div style="font-size:12px;color:#334155;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.06)">${escapeHtml(i)}</div>`).join('')}
          </div>
          <div style="background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.15);border-radius:10px;padding:12px">
            <div style="font-size:11px;font-weight:800;color:#FF6B6B;margin-bottom:8px;letter-spacing:0.05em">✗ WEAKNESSES</div>
            ${w.map(i => `<div style="font-size:12px;color:#334155;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.06)">${escapeHtml(i)}</div>`).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function runHire(){
  const btn = document.getElementById('btnHire');
  const reset = setBusy(btn, 'Analyzing…');
  const msg = document.getElementById('hireMsg');
  msg.textContent = '';
  document.getElementById('hireDetail').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px">⏳ Analyzing candidates…</div>';
  try{
    const jobDescription = document.getElementById('jobDesc').value.trim();
    const fileInput = document.getElementById('cvFiles');
    const files = Array.from(fileInput.files || []);
    if (!jobDescription) throw new Error('Job description is required');
    if (files.length === 0) throw new Error('Upload at least one CV');

    const cvs = await readCvFiles(files);
    if (cvs.length === 0) throw new Error('No readable CVs found');

    const data = await apiFetch('/api/hire', {
      method:'POST',
      accessToken: (await supabase.auth.getSession()).data?.session?.access_token,
      body: {
        jobDescription,
        cvs
      }
    });

    if (!data || !data.candidates || !Array.isArray(data.candidates)) throw new Error('Invalid AI response');

    hireLast = data;
    const candidates = data.candidates.slice().sort((a,b)=>(b.matchScore||0)-(a.matchScore||0));
    renderHireDetail(candidates);

    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        const jobDesc = jobDescription;
        const result = data;
        await supabase.from('hire_results').insert({
          user_id: s.user.id,
          job_description: jobDesc,
          candidates: result.candidates
        });
      }
    } catch(e) { console.warn('Save hire result failed', e); }

    document.getElementById('statCandidates').textContent = String(candidates.length);
    addFeed('Hire', `Analyzed ${candidates.length} candidate(s) against the job description.`);

    hireCsvRows = [ ['name','matchScore','recommendation','strengths','weaknesses'] ].concat(
      candidates.map(c=>[
        c.name || '',
        c.matchScore ?? '',
        c.recommendation || '',
        Array.isArray(c.strengths) ? c.strengths.join('; ') : '',
        Array.isArray(c.weaknesses) ? c.weaknesses.join('; ') : ''
      ])
    );
    document.getElementById('btnExportHire').disabled = false;

    msg.textContent = 'Done.';
  }catch(err){
    msg.textContent = err && err.message ? err.message : 'Hire analysis failed';
  }finally{
    reset();
  }
}

let boardLast = null;

function applyBoardTemplate(role, dept, context) {
  const nameEl = document.getElementById('empName');
  const roleEl = document.getElementById('empRole');
  const deptEl = document.getElementById('empDept');
  if (roleEl) roleEl.value = role;
  if (deptEl) deptEl.value = dept;
  if (nameEl && !nameEl.value) nameEl.focus();
  window._boardTemplateContext = context;
}

function toggleHandbook(checkbox) {
  const uploadArea = document.getElementById('handbookUploadArea');
  if (uploadArea) uploadArea.style.display = checkbox.checked ? 'none' : 'block';
}

async function sendBoardToEmployee() {
  const email = document.getElementById('empEmail')?.value?.trim();
  const name = document.getElementById('empName')?.value?.trim();
  const plan = window._lastBoardPlan;
  if (!email) { alert('Please enter employee email first.'); return; }
  if (!plan) { alert('Generate a plan first.'); return; }

  const btn = document.getElementById('btnSendEmployee');
  if (!btn) return;
  const oldText = btn.textContent;
  btn.textContent = 'Sending…';
  btn.disabled = true;

  const firstWeek = Array.isArray(plan.firstWeekChecklist) ? plan.firstWeekChecklist.map((t)=>`<li style="padding:4px 0">${escapeHtml(t)}</li>`).join('') : '';
  const day30 = Array.isArray(plan.day30) ? plan.day30.map((t)=>`<li style="padding:4px 0">${escapeHtml(t)}</li>`).join('') : '';
  const day60 = Array.isArray(plan.day60) ? plan.day60.map((t)=>`<li style="padding:4px 0">${escapeHtml(t)}</li>`).join('') : '';
  const day90 = Array.isArray(plan.day90) ? plan.day90.map((t)=>`<li style="padding:4px 0">${escapeHtml(t)}</li>`).join('') : '';

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(90deg,#FF6B6B,#FFD93D);padding:24px;border-radius:12px 12px 0 0">
        <h1 style="color:#0f172a;margin:0;font-size:20px">👋 Welcome to the team, ${escapeHtml(name || '')}!</h1>
        <p style="color:#0f172a;margin:8px 0 0;opacity:0.8">Your personalized onboarding plan is ready.</p>
      </div>
      <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px">
        <div style="background:#fff;border-left:3px solid #6366f1;border-radius:8px;padding:16px;margin-bottom:12px">
          <h3 style="margin:0 0 10px;color:#6366f1">📋 First Week Checklist</h3>
          <ul style="color:#334155;padding-left:20px">${firstWeek}</ul>
        </div>
        <div style="background:#fff;border-left:3px solid #00b894;border-radius:8px;padding:16px;margin-bottom:12px">
          <h3 style="margin:0 0 10px;color:#00b894">◎ Day 30 Goals</h3>
          <ul style="color:#334155;padding-left:20px">${day30}</ul>
        </div>
        <div style="background:#fff;border-left:3px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:12px">
          <h3 style="margin:0 0 10px;color:#f59e0b">◎ Day 60 Goals</h3>
          <ul style="color:#334155;padding-left:20px">${day60}</ul>
        </div>
        <div style="background:#fff;border-left:3px solid #FF6B6B;border-radius:8px;padding:16px;margin-bottom:12px">
          <h3 style="margin:0 0 10px;color:#FF6B6B">◎ Day 90 Goals</h3>
          <ul style="color:#334155;padding-left:20px">${day90}</ul>
        </div>
        <p style="color:#94a3b8;font-size:12px;margin-top:16px">Sent via Peoplera · The AI platform for people-first companies</p>
      </div>
    </div>
  `;

  try {
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email, subject: `Your onboarding plan is ready, ${name}!`, html })
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error || 'Failed');
    btn.textContent = '✓ Sent!';
    btn.style.background = 'rgba(0,184,148,0.2)';
    setTimeout(() => { btn.textContent = oldText; btn.disabled = false; }, 3000);
  } catch(e) {
    btn.textContent = oldText;
    btn.disabled = false;
    alert('Email failed: ' + e.message);
  }
}

function updateBoardProgress() {
  const checkboxes = document.querySelectorAll('.board-task-check');
  const total = checkboxes.length;
  const done = Array.from(checkboxes).filter(c => c.checked).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar = document.getElementById('boardProgressBar');
  const text = document.getElementById('boardProgressText');
  const progress = document.getElementById('boardProgress');
  if (bar) bar.style.width = pct + '%';
  if (text) text.textContent = `${done} of ${total} tasks completed (${pct}%)`;
  if (progress) progress.style.display = total > 0 ? 'block' : 'none';

  try {
    const checks = Array.from(checkboxes).map((c,i) => ({ idx: i, checked: c.checked }));
    (async ()=>{
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) return;
      const { data: rows } = await supabase
        .from('board_results')
        .select('id')
        .eq('user_id', s.user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastId = rows?.[0]?.id;
      if (!lastId) return;
      await supabase.from('board_results').update({ progress: checks }).eq('id', lastId);
    })().catch(()=>{});
  } catch(e) {}
}

function renderBoardPlan(plan){
  const out = document.getElementById('boardOut');
  if(!plan) return;

  const section = (emoji, title, items, color) => {
    const list = Array.isArray(items) ? items : [];
    return `
      <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:16px;margin-bottom:12px;border-left:3px solid ${color}">
        <div style="font-size:11px;font-weight:900;color:${color};letter-spacing:0.08em;margin-bottom:10px">${emoji} ${title}</div>
        ${list.map((item, idx) => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
            <div style="width:24px;height:24px;background:${color}18;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:${color};flex-shrink:0;margin-top:1px">${idx+1}</div>
            <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;width:100%">
              <input type="checkbox" class="board-task-check" onchange="updateBoardProgress()" style="margin-top:2px;accent-color:#6366f1;flex-shrink:0">
              <span style="font-size:13px;color:#334155;line-height:1.6">${escapeHtml(item)}</span>
            </label>
          </div>
        `).join('')}
      </div>
    `;
  };

  out.innerHTML = `
    <div style="display:grid;gap:4px">
      ${section('📋', 'FIRST WEEK CHECKLIST', plan.firstWeekChecklist, '#6366f1')}
      ${section('◎', 'DAY 30', plan.day30, '#00b894')}
      ${section('◎', 'DAY 60', plan.day60, '#f59e0b')}
      ${section('◎', 'DAY 90', plan.day90, '#FF6B6B')}
      ${section('⊕', 'RESOURCES', plan.resources, '#8b5cf6')}
    </div>
  `;

  window._lastBoardPlan = plan;
  const sendBtn = document.getElementById('btnSendEmployee');
  const empEmail = document.getElementById('empEmail')?.value?.trim();
  if (sendBtn) sendBtn.style.display = empEmail ? 'inline-flex' : 'none';
  updateBoardProgress();
}

async function runBoard(){
  const btn = document.getElementById('btnBoard');
  const reset = setBusy(btn, 'Generating…');
  const msg = document.getElementById('boardMsg');
  msg.textContent = '';
  document.getElementById('boardOut').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px">⏳ Generating onboarding plan…</div>';
  try{
    const name = document.getElementById('empName').value.trim();
    const role = document.getElementById('empRole').value.trim();
    const department = document.getElementById('empDept').value.trim();
    const startDate = document.getElementById('empStart').value;
    const noHandbook = Boolean(document.getElementById('noHandbook')?.checked);
    const file = document.getElementById('handbookFile')?.files?.[0] || null;
    const templateContext = String(window._boardTemplateContext || '').trim();

    if (!name || !role || !department || !startDate) throw new Error('All employee fields are required');
    let handbookText = '';
    if (!noHandbook) {
      if (!file) throw new Error('Upload a handbook PDF (or choose “no handbook”)');
      handbookText = await extractPdfText(file);
      if (!handbookText) throw new Error('Could not extract handbook text');
    }

    const mergedContext = [
      templateContext ? `Role context: ${templateContext}` : '',
      noHandbook ? 'No handbook available. Generate a general best-practice onboarding plan.' : '',
      handbookText
    ].filter(Boolean).join('\n\n');

    const data = await apiFetch('/api/board', {
      method:'POST',
      accessToken: (await supabase.auth.getSession()).data?.session?.access_token,
      body: {
        employee: { name, role, department, startDate },
        handbookText: mergedContext
      }
    });

    const plan = data?.onboardingPlan;
    if (!plan) throw new Error('Invalid AI response');

    boardLast = data;
    renderBoardPlan(plan);

    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        const employeeName = name;
        const employeeRole = role;
        const result = data;
        await supabase.from('board_results').insert({
          user_id: s.user.id,
          employee_name: employeeName,
          employee_role: employeeRole,
          onboarding_plan: result.onboardingPlan
        });
      }
    } catch(e) { console.warn('Save board result failed', e); }

    document.getElementById('statEmployees').textContent = String(Number(document.getElementById('statEmployees').textContent || 0) + 1);
    addFeed('Board', `Generated onboarding plan for ${name} (${role}).`);

    msg.textContent = 'Done.';
  }catch(err){
    msg.textContent = err && err.message ? err.message : 'Board generation failed';
  }finally{
    reset();
  }
}

let pulseLast = null;
let pulseEmployees = [];

let pulseDemoActive = false;
let pulseDemoSeries = null;

function setPulseDemoActive(active, { series = null } = {}){
  pulseDemoActive = Boolean(active);
  pulseDemoSeries = pulseDemoActive ? (Array.isArray(series) ? series : pulseDemoSeries) : null;
  const badge = document.getElementById('pulseDemoBadge');
  if (badge) badge.style.display = pulseDemoActive ? 'inline-flex' : 'none';
}

function switchPulseTab(tab) {
  const manual = document.getElementById('pulseManualPanel');
  const csv = document.getElementById('pulseCsvPanel');
  const btnManual = document.getElementById('pulseTabManual');
  const btnCsv = document.getElementById('pulseTabCsv');
  if (!manual || !csv || !btnManual || !btnCsv) return;

  if (tab === 'manual') {
    manual.style.display = 'block';
    csv.style.display = 'none';
    btnManual.style.background = 'rgba(255,107,107,0.1)';
    btnManual.style.borderColor = '#FF6B6B';
    btnManual.style.color = '#FF6B6B';
    btnCsv.style.background = 'transparent';
    btnCsv.style.borderColor = 'rgba(0,0,0,0.1)';
    btnCsv.style.color = '#64748b';
  } else {
    manual.style.display = 'none';
    csv.style.display = 'block';
    btnCsv.style.background = 'rgba(255,107,107,0.1)';
    btnCsv.style.borderColor = '#FF6B6B';
    btnCsv.style.color = '#FF6B6B';
    btnManual.style.background = 'transparent';
    btnManual.style.borderColor = 'rgba(0,0,0,0.1)';
    btnManual.style.color = '#64748b';
  }
}

function addPulseEmployee(expanded = true) {
  const idx = pulseEmployees.length;
  pulseEmployees.push({});
  const list = document.getElementById('pulseEmployeeList');
  if (!list) return;

  const card = document.createElement('div');
  card.id = `pulseEmp_${idx}`;
  card.style.cssText = 'background:rgba(255,107,107,0.04);border:1px solid rgba(255,107,107,0.15);border-radius:12px;padding:16px;position:relative';
  card.innerHTML = `
    <button onclick="removePulseEmployee(${idx})" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#FF6B6B;font-size:16px;cursor:pointer;font-weight:900">✕</button>
    <button type="button" onclick="togglePulseEmployee(${idx})" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:transparent;border:none;padding:0;margin:0;cursor:pointer;text-align:left">
      <div style="min-width:0">
        <div style="font-size:11px;font-weight:900;color:#FF6B6B;letter-spacing:0.05em">EMPLOYEE ${idx + 1}</div>
        <div id="pulseEmpName_${idx}" style="margin-top:6px;font-size:12px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      </div>
      <div id="pulseEmpChevron_${idx}" aria-hidden="true" style="flex-shrink:0;color:#64748b;font-weight:900;font-size:14px;transition:transform 0.2s ease">▼</div>
    </button>
    <div id="pulseEmpBody_${idx}" style="overflow:hidden;max-height:0;opacity:0;transition:max-height 0.28s ease, opacity 0.18s ease">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
      <div><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">Full name *</div>
        <input data-idx="${idx}" data-field="name" placeholder="e.g. Alex Kim" style="width:100%;background:rgba(0,0,0,0.04);border:1px solid rgba(255,107,107,0.2);border-radius:8px;padding:8px 10px;font-size:12px;color:#0f172a;font-family:'DM Sans',system-ui;outline:none;box-sizing:border-box" oninput="updatePulseEmp(this)"></div>
      <div><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">Weekly hours</div>
        <input data-idx="${idx}" data-field="weeklyHours" type="number" min="0" max="168" placeholder="45" style="width:100%;background:rgba(0,0,0,0.04);border:1px solid rgba(255,107,107,0.2);border-radius:8px;padding:8px 10px;font-size:12px;color:#0f172a;font-family:'DM Sans',system-ui;outline:none;box-sizing:border-box" oninput="updatePulseEmp(this)"></div>
      <div><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">Weekend hours</div>
        <input data-idx="${idx}" data-field="weekendHours" type="number" min="0" placeholder="0" style="width:100%;background:rgba(0,0,0,0.04);border:1px solid rgba(255,107,107,0.2);border-radius:8px;padding:8px 10px;font-size:12px;color:#0f172a;font-family:'DM Sans',system-ui;outline:none;box-sizing:border-box" oninput="updatePulseEmp(this)"></div>
      <div><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">After-hours messages</div>
        <input data-idx="${idx}" data-field="afterHoursMessages" type="number" min="0" placeholder="0" style="width:100%;background:rgba(0,0,0,0.04);border:1px solid rgba(255,107,107,0.2);border-radius:8px;padding:8px 10px;font-size:12px;color:#0f172a;font-family:'DM Sans',system-ui;outline:none;box-sizing:border-box" oninput="updatePulseEmp(this)"></div>
      <div><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">Sick days (last 3mo)</div>
        <input data-idx="${idx}" data-field="sickDays" type="number" min="0" placeholder="0" style="width:100%;background:rgba(0,0,0,0.04);border:1px solid rgba(255,107,107,0.2);border-radius:8px;padding:8px 10px;font-size:12px;color:#0f172a;font-family:'DM Sans',system-ui;outline:none;box-sizing:border-box" oninput="updatePulseEmp(this)"></div>
      <div><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px">Last vacation</div>
        <input data-idx="${idx}" data-field="lastVacation" placeholder="e.g. 3 months ago" style="width:100%;background:rgba(0,0,0,0.04);border:1px solid rgba(255,107,107,0.2);border-radius:8px;padding:8px 10px;font-size:12px;color:#0f172a;font-family:'DM Sans',system-ui;outline:none;box-sizing:border-box" oninput="updatePulseEmp(this)"></div>
      </div>
    </div>
  `;
  list.appendChild(card);

  window.togglePulseEmployee = function(i){
    const body = document.getElementById(`pulseEmpBody_${i}`);
    const chev = document.getElementById(`pulseEmpChevron_${i}`);
    if (!body || !chev) return;
    const open = body.style.maxHeight !== '0px' && body.style.maxHeight !== '';
    if (open) {
      body.style.opacity = '0';
      body.style.maxHeight = '0px';
      chev.textContent = '▼';
    } else {
      body.style.opacity = '1';
      body.style.maxHeight = Math.max(120, body.scrollHeight) + 'px';
      chev.textContent = '▲';
    }
  };

  const nameEl = document.getElementById(`pulseEmpName_${idx}`);
  if (nameEl) nameEl.textContent = '';

  const applyExpanded = (open) => {
    const body = document.getElementById(`pulseEmpBody_${idx}`);
    const chev = document.getElementById(`pulseEmpChevron_${idx}`);
    if (!body || !chev) return;
    if (open) {
      body.style.opacity = '1';
      body.style.maxHeight = Math.max(120, body.scrollHeight) + 'px';
      chev.textContent = '▲';
    } else {
      body.style.opacity = '0';
      body.style.maxHeight = '0px';
      chev.textContent = '▼';
    }
  };

  applyExpanded(Boolean(expanded));
}

function updatePulseEmp(input) {
  const idx = Number(input.getAttribute('data-idx'));
  const field = input.getAttribute('data-field');
  if (!Number.isFinite(idx) || !field) return;
  if (!pulseEmployees[idx]) pulseEmployees[idx] = {};
  pulseEmployees[idx][field] = input.value;

  if (field === 'name') {
    const nameEl = document.getElementById(`pulseEmpName_${idx}`);
    if (nameEl) nameEl.textContent = String(input.value || '').trim();
  }
}

function removePulseEmployee(idx) {
  document.getElementById(`pulseEmp_${idx}`)?.remove();
  pulseEmployees[idx] = null;
}

function downloadPulseTemplate() {
  const csv = 'name,weekly hours,weekend hours,after-hours messages,sick days,last vacation\nAlex Kim,58,8,22,4,8 months ago\nSara Lee,42,2,6,1,2 months ago';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'peoplera-pulse-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeRiskLevel(level){
  const l = String(level || '').toLowerCase();
  if (l === 'low' || l === 'medium' || l === 'high' || l === 'critical') return l;
  return 'medium';
}

function computeCompanyRiskScore(employees){
  const arr = Array.isArray(employees) ? employees : [];
  if (!arr.length) return 0;
  const sum = arr.reduce((acc, e) => acc + (Number(e?.burnoutScore) || 0), 0);
  return Math.round(sum / arr.length);
}

function classifyCompanyRisk(score){
  const s = Number(score);
  if (!Number.isFinite(s)) return { label: '—', tone: '#64748b', bg: 'rgba(100,116,139,0.10)', bd: 'rgba(100,116,139,0.22)' };
  if (s >= 70) return { label: 'High', tone: '#FF6B6B', bg: 'rgba(255,107,107,0.10)', bd: 'rgba(255,107,107,0.22)' };
  if (s >= 45) return { label: 'Medium', tone: '#b45309', bg: 'rgba(255,217,61,0.18)', bd: 'rgba(255,217,61,0.35)' };
  return { label: 'Low', tone: '#00b894', bg: 'rgba(0,184,148,0.10)', bd: 'rgba(0,184,148,0.22)' };
}

function computeDecisionEngine(employees, trendSeries){
  const emps = Array.isArray(employees) ? employees : [];
  const series = Array.isArray(trendSeries) ? trendSeries : [];
  const score = computeCompanyRiskScore(emps);
  const status = classifyCompanyRisk(score);

  const level = (l) => {
    const v = String(l || '').toLowerCase();
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
    return 'medium';
  };
  const high = emps.filter(e => ['high','critical'].includes(level(e?.riskLevel)));
  const medium = emps.filter(e => level(e?.riskLevel) === 'medium');

  const overtime = emps.filter(e => Number(e?.weeklyHours || e?.weekly_hours || 0) >= 55);
  const afterHours = emps.filter(e => Number(e?.afterHoursMessages || e?.after_hours_messages || 0) >= 10);
  const sickSignals = emps.filter(e => Number(e?.sickDays || e?.sick_days || 0) >= 3);

  const sickLeaveAffected = Math.max(sickSignals.length, Math.round(high.length * 0.5));
  const sickLeaveRisk = (() => {
    if (!emps.length) return { level: 'Low', color: '#00b894' };
    const x = (sickSignals.length / emps.length) * 100;
    const y = (high.length / emps.length) * 100;
    const z = (overtime.length / emps.length) * 100;
    const composite = (x * 0.5) + (y * 0.35) + (z * 0.15);
    if (composite >= 22) return { level: 'High', color: '#FF6B6B' };
    if (composite >= 12) return { level: 'Medium', color: '#b45309' };
    return { level: 'Low', color: '#00b894' };
  })();

  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = (Number.isFinite(Number(last)) && Number.isFinite(Number(prev))) ? (Number(last) - Number(prev)) : 0;

  // Business impact — heuristic, intentionally conservative.
  // Assume a generic fully-loaded cost per employee per week and map risk to productivity at-risk.
  const costPerEmployeeWeek = 1500; // currency-neutral ~€/$
  const productivityRiskFactor = Math.min(0.35, Math.max(0, (high.length * 0.22 + medium.length * 0.08) / Math.max(1, emps.length)));
  const productivityAtRiskWeekly = Math.round(costPerEmployeeWeek * emps.length * productivityRiskFactor);
  const sickLeaveExposureDays = Math.round((sickSignals.length * 1.5) + (high.length * 0.5));

  // Risk prediction — project 2 weeks ahead based on recent delta + workload pressure.
  const overtimePct = emps.length ? (overtime.length / emps.length) : 0;
  const projectedDelta = Math.round((delta * 2) + (overtimePct * 12) + (afterHours.length ? 4 : 0));
  const projectedScore = Math.max(0, Math.min(100, score + projectedDelta));
  const predictedPct = Math.max(-25, Math.min(35, Math.round((projectedScore - score))));

  const actions = [];
  if (overtime.length) actions.push(`Reduce workload for the overtime cohort (55h+) by 10–15 hours this week (${overtime.length} impacted).`);
  if (afterHours.length) actions.push(`Set after-hours boundaries (quiet hours) and review on-call load (${afterHours.length} showing after-hours activity).`);
  if (high.length) actions.push(`Run manager 1:1 interventions for high/critical risk employees within 7 days (${high.length} impacted).`);
  if (sickSignals.length) actions.push(`Review sick leave signals and offer support plan (check workload, recovery time) (${sickSignals.length} impacted).`);
  if (!actions.length) actions.push('Maintain weekly monitoring and protect recovery time. Standardize one proactive action per team.');

  const uniqueActions = Array.from(new Set(actions)).slice(0, 4);

  const predictionText = predictedPct === 0
    ? 'Risk is projected to remain stable over the next 2 weeks if conditions stay the same.'
    : predictedPct > 0
    ? `Risk is projected to increase by ~${predictedPct} points over the next 2 weeks if conditions continue.`
    : `Risk is projected to decrease by ~${Math.abs(predictedPct)} points over the next 2 weeks if conditions continue.`;

  return {
    score,
    status,
    productivityAtRiskWeekly,
    sickLeaveExposureDays,
    sickLeaveRisk,
    sickLeaveAffected,
    sickLeaveHorizonDays: 30,
    predictionText,
    projectedScore,
    actions: uniqueActions,
    inputs: {
      teamSize: emps.length,
      highCount: high.length,
      mediumCount: medium.length,
      overtimeCount: overtime.length
    }
  };
}

function computeStrategicActionPlans(employees, decision){
  const emps = Array.isArray(employees) ? employees : [];
  const d = decision || computeDecisionEngine(emps, getCompanyTrendSeries(8));

  const level = (l) => {
    const v = String(l || '').toLowerCase();
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
    return 'medium';
  };

  const high = emps.filter(e => ['high','critical'].includes(level(e?.riskLevel)));
  const medium = emps.filter(e => level(e?.riskLevel) === 'medium');
  const overtime = emps.filter(e => Number(e?.weeklyHours || e?.weekly_hours || 0) >= 55);
  const afterHours = emps.filter(e => Number(e?.afterHoursMessages || e?.after_hours_messages || 0) >= 10);
  const sickSignals = emps.filter(e => Number(e?.sickDays || e?.sick_days || 0) >= 3);

  const hasHotspots = high.length > 0;
  const hasOvertime = overtime.length > 0;
  const hasAfterHours = afterHours.length > 0;
  const hasSick = sickSignals.length > 0;

  const plans = [
    {
      key: 'recovery',
      title: 'Burnout Recovery Plan',
      timeframe: 'This week',
      explanation: hasHotspots
        ? `Stabilize the highest-risk cohort (${high.length} employee(s)) by reducing pressure and creating recovery time.`
        : 'Protect recovery time and prevent hotspots from emerging.',
      actions: [
        hasHotspots ? `Reduce workload for high/critical employees by removing or deferring 1–2 deliverables (${high.length} impacted).` : 'Protect focus time: cap meetings and create 2 recovery blocks per week.',
        hasOvertime ? `Cut overtime in the 55h+ cohort by reassigning tasks (${overtime.length} impacted).` : 'Avoid new scope increases until next weekly check-in.',
        'Confirm priority list with managers: what to pause, what to ship, what to delegate.',
        'Add a short manager check-in cadence (10 minutes) to validate recovery and blockers.'
      ].filter(Boolean).slice(0, 4)
    },
    {
      key: 'productivity',
      title: 'Productivity Protection Plan',
      timeframe: 'Next 2 weeks',
      explanation: `Maintain output while lowering burnout pressure by simplifying scope and stabilizing workload distribution.`,
      actions: [
        'Defer non-critical work: pick 1–2 tasks per team to pause until next cycle.',
        hasAfterHours ? `Introduce quiet hours + async norms to reduce after-hours load (${afterHours.length} impacted).` : 'Standardize an async-first norm to reduce context switching.',
        'Move high-risk work off single points of failure: pair ownership for critical tasks.',
        'Track one metric weekly (burnout score + sick-leave signals) to validate progress.'
      ].filter(Boolean).slice(0, 4)
    },
    {
      key: 'sickleave',
      title: 'Sick Leave Prevention Plan',
      timeframe: 'This week',
      explanation: `Potential sick leave risk is ${escapeHtml(d.sickLeaveRisk?.level || 'Low')} over the next ${Number(d.sickLeaveHorizonDays) || 30} days. Intervene early and document actions.`,
      actions: [
        hasSick ? `Review sick-leave signals and offer support plan (${sickSignals.length} impacted).` : 'Review recovery signals and confirm coverage plan for peak weeks.',
        'Ensure coverage for high-pressure roles: identify backup owners for critical work.',
        'Encourage time-off planning for high-pressure team members (set dates, not intentions).',
        'Flag escalations early: rising sick days + overtime should trigger manager intervention.'
      ].filter(Boolean).slice(0, 4)
    },
    {
      key: 'manager',
      title: 'Manager Coaching Plan',
      timeframe: 'This week',
      explanation: 'Equip managers with a simple 1:1 playbook focused on workload, boundaries, and recovery.',
      actions: [
        'In 1:1s: ask what feels unsustainable, what can be paused, and what support is missing.',
        'Avoid: “just push through” language; focus on scope tradeoffs and resource constraints.',
        hasAfterHours ? 'Watch this week: after-hours patterns, slack escalation, and weekend work.' : 'Watch this week: overload signals (hours, context switching, missed breaks).',
        'Close the loop: pick one action per hotspot and confirm it’s completed next check-in.'
      ].filter(Boolean).slice(0, 4)
    },
    {
      key: 'rebalance',
      title: 'Team Rebalance Plan',
      timeframe: 'Next 2 weeks',
      explanation: hasOvertime || hasHotspots
        ? 'Reduce concentration risk by redistributing workload away from hotspots and overtime clusters.'
        : 'Keep workload distribution stable and prevent new clusters.',
      actions: [
        hasOvertime ? `Shift work from the overtime cohort to lower-risk capacity (${overtime.length} impacted).` : 'Audit workload distribution across roles; identify bottlenecks.',
        (high.length || medium.length) ? `Reassign 10–20% of tasks from elevated-risk employees (${high.length + medium.length} impacted).` : 'Maintain steady load; prevent sudden scope increases.',
        'Add a “coverage map” for critical work: primary + backup owner for each key deliverable.',
        `If current workload continues: ${escapeHtml(d.predictionText)}`
      ].filter(Boolean).slice(0, 4)
    }
  ];

  return plans;
}

function getCompanyTrendSeries(maxWeeks = 8){
  if (pulseDemoActive && Array.isArray(pulseDemoSeries) && pulseDemoSeries.length) {
    return pulseDemoSeries.slice(Math.max(0, pulseDemoSeries.length - maxWeeks));
  }

  const items = window.__historyCache?.pulse || [];
  const sorted = items.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const series = sorted.slice(Math.max(0, sorted.length - maxWeeks)).map(it => {
    const emps = Array.isArray(it.employees) ? it.employees : [];
    return computeCompanyRiskScore(emps);
  });
  return series;
}

function getTrendArrow(current, previous){
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return '—';
  if (c > p + 2) return '↑';
  if (c < p - 2) return '↓';
  return '→';
}

function readJsonLocalStorage(key, fallback){
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function writeJsonLocalStorage(key, value){
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function hashStringDjb2(str){
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

function computeAnalysisFingerprint(type, payload){
  try{
    return `${String(type||'analysis')}::${hashStringDjb2(JSON.stringify(payload || {}))}`;
  }catch(e){
    return `${String(type||'analysis')}::${hashStringDjb2(String(payload || ''))}`;
  }
}

async function insertAnalysisHistory(type, payload){
  try{
    if (pulseDemoActive) return;
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;

    const fingerprint = computeAnalysisFingerprint(type, payload);
    const lastKey = `peoplera_analysis_history_last_fp_${String(type || 'analysis')}`;
    const lastFp = readJsonLocalStorage(lastKey, null);
    if (lastFp && String(lastFp) === String(fingerprint)) return;

    const row = {
      user_id: s.user.id,
      data: {
        type: String(type || 'analysis'),
        fingerprint,
        ...payload
      }
    };
    await supabase.from('analysis_history').insert(row);
    writeJsonLocalStorage(lastKey, fingerprint);
  }catch(e){
    console.warn('Insert analysis history failed', e);
  }
}

async function loadPulseHistoryFromAnalysisHistory(limit = 5){
  try{
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return null;

    let rows = null;
    try{
      const r = await supabase
        .from('analysis_history')
        .select('*')
        .eq('user_id', s.user.id)
        .contains('data', { type: 'pulse' })
        .order('created_at', { ascending: false })
        .limit(limit);
      rows = r?.data || null;
    }catch(e){
      const r = await supabase
        .from('analysis_history')
        .select('*')
        .eq('user_id', s.user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      rows = (r?.data || []).filter(x => String(x?.data?.type || '') === 'pulse');
    }

    const pulseItems = (Array.isArray(rows) ? rows : []).map(r => ({
      id: r.id,
      created_at: r.created_at,
      employees: r?.data?.employees || [],
      at_risk_count: r?.data?.at_risk_count || 0
    }));

    window.__pulseHistorySource = 'analysis_history';
    return pulseItems;
  }catch(e){
    console.warn('Load analysis history failed', e);
    return null;
  }
}

function computeHeuristicDrivers(e){
  const drivers = [];

  const weeklyHours = Number(e?.weeklyHours);
  const afterHours = Number(e?.afterHoursMessages);
  const sickDays = Number(e?.sickDays);
  const lastVacation = String(e?.lastVacation || '').trim();

  if (Number.isFinite(weeklyHours) && weeklyHours >= 50) drivers.push('Workload overload');
  if (Number.isFinite(afterHours) && afterHours >= 10) drivers.push('High after-hours activity');
  if (Number.isFinite(sickDays) && sickDays >= 3) drivers.push('Rising sick leave signals');
  if (!lastVacation || lastVacation.toLowerCase() === 'unknown') drivers.push('Missing vacation / recovery data');
  if (drivers.length === 0) drivers.push('Low recovery');

  return drivers.slice(0, 3);
}

function computeRecommendedAction(level, drivers){
  const l = normalizeRiskLevel(level);
  const ds = Array.isArray(drivers) ? drivers : [];
  if (l === 'critical' || l === 'high') {
    if (ds.includes('Workload overload')) return 'Reduce workload temporarily';
    if (ds.includes('High after-hours activity')) return 'Set after-hours boundaries';
    return 'Schedule 1:1 this week';
  }
  if (l === 'medium') {
    if (ds.includes('Missing vacation / recovery data')) return 'Clarify recovery and time off plan';
    return 'Schedule a check-in and monitor';
  }
  return 'Keep routine check-ins';
}

function logRiskAction(employeeName, actionText){
  if (pulseDemoActive) return;
  const key = 'peoplera_people_risk_actions';
  const store = readJsonLocalStorage(key, {});
  store[String(employeeName || '').toLowerCase()] = {
    action: String(actionText || ''),
    at: new Date().toISOString()
  };
  writeJsonLocalStorage(key, store);
}

function getLoggedAction(employeeName){
  const key = 'peoplera_people_risk_actions';
  const store = readJsonLocalStorage(key, {});
  return store[String(employeeName || '').toLowerCase()] || null;
}

function renderTrendBars(series, accent = '#FF6B6B'){
  const arr = Array.isArray(series) ? series : [];
  if (!arr.length) return '<div style="color:#64748b;font-size:12px;font-weight:700;line-height:1.5">Run weekly analysis to unlock Burnout Intelligence trend tracking. After 2+ runs, you\'ll see direction, stability, and progress over time.</div>';
  const max = Math.max(1, ...arr);
  return `
    <div style="display:flex;align-items:flex-end;gap:6px;height:70px;padding:10px 0">
      ${arr.map((v, i) => {
        const h = Math.max(4, Math.round((v / max) * 70));
        const isLast = i === arr.length - 1;
        return `<div title="Week ${i + 1}: ${v}/100" style="flex:1;min-width:10px;background:${isLast ? accent : 'rgba(255,107,107,0.25)'};height:${h}px;border-radius:6px"></div>`;
      }).join('')}
    </div>
  `;
}

function renderPulseTrend(){
  const el = document.getElementById('pulseTrendOut');
  if (!el) return;

  const series = getCompanyTrendSeries(8);
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const arrow = (series.length >= 2) ? getTrendArrow(last, prev) : '—';

  let badge = { text: 'Not enough data yet', bg: 'rgba(100,116,139,0.12)', bd: 'rgba(100,116,139,0.22)', c: '#64748b' };
  if (arrow === '↑') badge = { text: 'Worsening', bg: 'rgba(255,107,107,0.10)', bd: 'rgba(255,107,107,0.22)', c: '#FF6B6B' };
  if (arrow === '↓') badge = { text: 'Improving', bg: 'rgba(0,184,148,0.10)', bd: 'rgba(0,184,148,0.22)', c: '#00b894' };
  if (arrow === '→') badge = { text: 'Stable', bg: 'rgba(99,102,241,0.08)', bd: 'rgba(99,102,241,0.18)', c: '#6366f1' };

  const lastLabel = Number.isFinite(Number(last)) ? `${Number(last)}/100` : '—';
  const delta = (series.length >= 2) ? (Number(last) - Number(prev)) : null;
  const deltaLabel = (delta === null || !Number.isFinite(delta)) ? '—' : (delta === 0 ? '0' : (delta > 0 ? `+${delta.toFixed(0)}` : `${delta.toFixed(0)}`));

  el.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.08em">COMPANY BURNOUT INTELLIGENCE</div>
        <div style="margin-top:6px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <div style="font-family:'Syne',system-ui;font-weight:900;font-size:28px;color:#0f172a">${escapeHtml(lastLabel)}</div>
          <div style="font-size:12px;font-weight:900;color:${delta > 0 ? '#FF6B6B' : delta < 0 ? '#00b894' : '#64748b'}">${escapeHtml(deltaLabel)} this week</div>
        </div>
      </div>
      <span style="background:${badge.bg};border:1px solid ${badge.bd};border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;color:${badge.c}">${escapeHtml(badge.text)}</span>
    </div>

    <div style="margin-top:12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="font-size:11px;font-weight:900;color:#FF6B6B;letter-spacing:0.08em">8-WEEK TREND</div>
        <div style="font-size:12px;color:#94a3b8;font-weight:800">Direction: <span style="color:${arrow === '↑' ? '#FF6B6B' : arrow === '↓' ? '#00b894' : '#64748b'}">${escapeHtml(arrow)}</span></div>
      </div>
      <div style="margin-top:6px">${renderTrendBars(series)}</div>
    </div>
  `;
}

function renderPulse(employees){
  const out = document.getElementById('pulseOut');
  if (!out) return;

  window.__lastPulseEmployees = Array.isArray(employees) ? employees : [];

  const rows = (Array.isArray(employees) ? employees : []).slice().map(e => ({
    ...e,
    riskLevel: normalizeRiskLevel(e?.riskLevel)
  })).sort((a, b) => (Number(b?.burnoutScore) || 0) - (Number(a?.burnoutScore) || 0));

  const companyScore = computeCompanyRiskScore(rows);
  const atRiskCount = rows.filter(e => ['medium','high','critical'].includes(normalizeRiskLevel(e.riskLevel))).length;
  const atRiskPct = rows.length ? Math.round((atRiskCount / rows.length) * 100) : 0;

  const statEl = document.getElementById('statAtRisk');
  if (statEl) {
    const hi = rows.filter(e => ['high','critical'].includes(normalizeRiskLevel(e.riskLevel))).length;
    statEl.textContent = String(hi);
  }

  const prevCompany = readJsonLocalStorage('peoplera_people_risk_prev_company', null);
  const companyTrendArrow = getTrendArrow(companyScore, prevCompany?.score);
  if (!pulseDemoActive) {
    writeJsonLocalStorage('peoplera_people_risk_prev_company', { score: companyScore, at: new Date().toISOString() });
  }

  const prevMap = readJsonLocalStorage('peoplera_people_risk_prev_employees', {});
  const nextMap = {};

  const colorMap = { low:'#00e5a0', medium:'#FFD93D', high:'#FF6B6B', critical:'#ff3b3b' };

  const enriched = rows.map(e => {
    const name = String(e?.name || '').trim() || 'Employee';
    const score = Number(e?.burnoutScore) || 0;
    const prev = prevMap[String(name).toLowerCase()];
    const arrow = getTrendArrow(score, prev?.score);
    nextMap[String(name).toLowerCase()] = { score, at: new Date().toISOString() };

    const lvl = normalizeRiskLevel(e?.riskLevel);
    const drivers = (Array.isArray(e?.riskFactors) && e.riskFactors.length)
      ? e.riskFactors.slice(0, 3)
      : computeHeuristicDrivers(e);
    const topDriver = drivers[0] || '—';
    const recommendedAction = computeRecommendedAction(lvl, drivers);
    const logged = getLoggedAction(name);

    return {
      raw: e,
      name,
      score,
      lvl,
      color: colorMap[lvl] || '#FFD93D',
      arrow,
      drivers,
      topDriver,
      recommendedAction,
      logged
    };
  });

  if (!pulseDemoActive) {
    writeJsonLocalStorage('peoplera_people_risk_prev_employees', nextMap);
  }

  const driverCounts = {};
  for (const e of enriched) {
    if (!e.topDriver) continue;
    driverCounts[e.topDriver] = (driverCounts[e.topDriver] || 0) + 1;
  }
  const topDriver = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const trendSeries = getCompanyTrendSeries(8);
  const prevSeriesValue = trendSeries.length >= 2 ? trendSeries[trendSeries.length - 2] : null;
  const seriesArrow = prevSeriesValue == null ? companyTrendArrow : getTrendArrow(trendSeries[trendSeries.length - 1], prevSeriesValue);

  const high = enriched.filter(e => ['high','critical'].includes(e.lvl));
  const medium = enriched.filter(e => e.lvl === 'medium');
  const low = enriched.filter(e => e.lvl === 'low');

  const rising = enriched.filter(e => e.arrow === '↑' && ['medium','high','critical'].includes(e.lvl));
  const teamHint = high.length
    ? 'Highest concentration in high-risk cohort.'
    : (medium.length ? 'Medium-risk cohort needs attention this week.' : 'No immediate hotspots detected.');

  const weeklyBrief = `${rising.length || high.length || medium.length ? (rising.length ? `${rising.length} employee(s) show rising risk` : `${high.length + medium.length} employee(s) are at elevated risk`) : 'No elevated risk detected'} driven by ${topDriver.toLowerCase()}. ${teamHint}`;

  const decision = computeDecisionEngine(rows, trendSeries);
  window.__lastDecisionEngine = decision;
  updateNavBurnoutBadge(decision);
  const plans = computeStrategicActionPlans(rows, decision);
  window.__lastActionPlans = plans;

  try{
    const fp = Array.isArray(plans) ? plans.map(p=>String(p?.key||p?.title||'')).join('|') : '';
    if (window.__planActionStateFp !== fp) {
      window.__planActionStateFp = fp;
      window.__planActionState = {};
    }
  }catch(e){ /* noop */ }

  const exportBtn = document.getElementById('btnExportPulseXlsx');
  if (exportBtn) exportBtn.disabled = false;

  const totalSickDays = enriched.reduce((acc, e) => acc + (Number(e.raw?.sickDays) || 0), 0);
  const highSick = enriched.filter(e => (Number(e.raw?.sickDays) || 0) >= 3);
  const missingVacation = enriched.filter(e => {
    const v = String(e.raw?.lastVacation || '').trim();
    return !v || v.toLowerCase() === 'unknown';
  });

  const employeeCard = (e) => {
    const actionState = e.logged ? `
      <div style="margin-top:10px;font-size:12px;font-weight:800;color:#00b894">Action logged</div>
    ` : `
      <button onclick="logPeopleRiskAction('${String(e.name).replace(/'/g, "\\'")}', '${String(e.recommendedAction).replace(/'/g, "\\'")}')" style="margin-top:10px;background:${e.color}15;border:1px solid ${e.color}44;border-radius:10px;padding:10px 12px;font-size:12px;font-weight:900;color:${e.color};cursor:pointer;width:100%">Mark as action taken</button>
    `;

    return `
      <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-left:3px solid ${e.color};border-radius:14px;padding:14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div>
            <div style="font-family:'Syne',system-ui;font-weight:900;font-size:14px;color:#0f172a">${escapeHtml(e.name)}</div>
            <div style="margin-top:4px;font-size:12px;color:#64748b">Top driver: <span style="font-weight:800;color:#0f172a">${escapeHtml(e.topDriver)}</span></div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:'Syne',system-ui;font-weight:900;font-size:20px;color:${e.color};line-height:1">${e.score}</div>
            <div style="font-size:10px;color:#94a3b8">/100</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
          <span style="background:${e.color}22;border:1px solid ${e.color}55;border-radius:8px;padding:4px 10px;font-size:10px;font-weight:900;color:${e.color};font-family:'Syne',system-ui;text-transform:uppercase;letter-spacing:0.05em">${e.lvl}</span>
          <div style="font-size:12px;font-weight:900;color:#0f172a">Trend: <span style="color:${e.arrow === '↑' ? '#FF6B6B' : e.arrow === '↓' ? '#00b894' : '#64748b'}">${e.arrow}</span></div>
        </div>
        <div style="margin-top:10px;font-size:12px;color:#64748b;line-height:1.6">
          <div style="font-size:10px;font-weight:900;color:#94a3b8;letter-spacing:0.08em;margin-bottom:6px">DRIVERS</div>
          ${e.drivers.slice(0, 3).map(d => `<span style="display:inline-block;margin:0 6px 6px 0;background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.08);border-radius:999px;padding:3px 10px;font-size:11px;color:#334155;font-weight:800">${escapeHtml(d)}</span>`).join('')}
        </div>
        <div style="margin-top:10px;background:${e.color}0F;border:1px solid ${e.color}22;border-radius:12px;padding:10px 12px">
          <div style="font-size:10px;font-weight:900;color:${e.color};letter-spacing:0.08em;margin-bottom:6px">RECOMMENDED ACTION</div>
          <div style="font-size:12px;font-weight:800;color:#0f172a">${escapeHtml(e.recommendedAction)}</div>
        </div>
        ${actionState}
      </div>
    `;
  };

  window.logPeopleRiskAction = function(name, action){
    logRiskAction(name, action);
    renderPulse(employees);
  };

  const highlightImpacted = (text) => {
    const s = String(text || '');
    const i = s.lastIndexOf('(');
    const j = s.lastIndexOf(')');
    if (i === -1 || j === -1 || j <= i) return escapeHtml(s);
    const before = s.slice(0, i);
    const mid = s.slice(i, j + 1);
    const after = s.slice(j + 1);
    if (!/\bimpacted\b/i.test(mid)) return escapeHtml(s);
    return `${escapeHtml(before)}<span style="font-weight:900;color:rgba(249,115,22,0.92)">${escapeHtml(mid)}</span>${escapeHtml(after)}`;
  };

  const decisionBadgeColor = (() => {
    const lvl = String(decision?.status?.label || '').toLowerCase();
    if (lvl === 'critical' || lvl === 'high') return '#FF6B6B';
    if (lvl === 'medium') return 'rgba(249,115,22,0.92)';
    if (lvl === 'low') return '#00b894';
    return 'rgba(249,115,22,0.92)';
  })();

  out.innerHTML = `
    <div style="display:grid;gap:12px">
      ${pulseDemoActive ? pulseDemoCtaHtml() : ''}

      <div style="background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.08);border-left:3px solid #FF6B6B;border-radius:16px;padding:14px 16px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-size:12px;font-weight:900;color:#9ca3af;letter-spacing:0.10em">DECISION ENGINE</div>
            <div style="margin-top:8px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
              <div style="font-family:'Syne',system-ui;font-weight:900;font-size:52px;line-height:1;background:var(--home-grad2);-webkit-background-clip:text;background-clip:text;color:transparent">${decision.score}/100</div>
              <span style="background:${decisionBadgeColor};border:1px solid ${decisionBadgeColor};border-radius:999px;padding:7px 12px;font-size:12px;font-weight:900;color:#fff">${escapeHtml(decision.status.label)} risk</span>
            </div>
          </div>
          <div style="min-width:240px;flex:1">
            <div style="display:grid;gap:8px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
                <div style="font-size:11px;font-weight:900;color:#FF6B6B;letter-spacing:0.08em">BUSINESS IMPACT</div>
                <div style="font-size:12px;color:#FF6B6B;font-weight:900">~${decision.productivityAtRiskWeekly.toLocaleString()} / week</div>
              </div>
              <div style="font-size:12px;color:#6b7280;font-weight:600;line-height:1.65">Estimated productivity at risk · Sick-leave exposure: <span style="font-weight:700;color:#111827">${decision.sickLeaveExposureDays}</span> day(s) (next 2–4 weeks)</div>
              <div style="font-size:11px;font-weight:900;color:#FF6B6B;letter-spacing:0.08em;margin-top:4px">RISK PREDICTION</div>
              <div style="font-size:12px;color:#6b7280;font-weight:600;line-height:1.65">${escapeHtml(decision.predictionText)}</div>
            </div>
          </div>
        </div>

        <div style="margin-top:12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px">
          <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.10em;margin-bottom:8px">ACTION RECOMMENDATIONS</div>
          <div style="display:grid;gap:10px">
            ${(decision.actions || []).slice(0, 5).map(a => `<div style="font-size:12px;color:#111827;font-weight:600;line-height:1.65;background:linear-gradient(90deg, rgba(255,107,107,0.85) 0 3px, rgba(255,107,107,0.05) 3px 100%);border-radius:10px;padding:8px 10px"><span style="color:#FF6B6B;font-weight:900;margin-right:8px">■</span>${highlightImpacted(a)}</div>`).join('')}
          </div>
          <div style="margin-top:10px;font-size:11px;color:#94a3b8;font-weight:600;line-height:1.65;font-style:italic">Can be applied through your existing HR workflows.</div>
        </div>

        <div style="margin-top:12px;background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.18);border-radius:14px;padding:12px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <div style="font-size:10px;font-weight:900;color:#FF6B6B;letter-spacing:0.10em;margin-bottom:6px">SICK LEAVE RISK PREDICTION</div>
              <div style="font-size:12px;color:#FF6B6B;font-weight:800;line-height:1.45">Potential sick leave risk over the next ${Number(decision?.sickLeaveHorizonDays) || 30} days.</div>
            </div>
            <span style="background:${escapeHtml(decision?.sickLeaveRisk?.color || '#FF6B6B')};border:1px solid ${escapeHtml(decision?.sickLeaveRisk?.color || '#FF6B6B')};border-radius:999px;padding:7px 12px;font-size:12px;font-weight:900;color:#fff">${escapeHtml(decision?.sickLeaveRisk?.level || 'Low')} risk</span>
          </div>
          <div style="margin-top:10px;font-size:14px;color:#111827;font-weight:900">${Number(decision?.sickLeaveAffected) || 0} employee(s) potentially at risk</div>
          <div style="margin-top:6px;font-size:11px;color:#94a3b8;font-weight:600;line-height:1.65;font-style:italic">Directional estimate based on current burnout + workload + sick-leave signals. Use early interventions and manager check-ins to reduce escalation.</div>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.8);border:1px solid rgba(0,0,0,0.08);border-top:3px solid #FF6B6B;border-radius:16px;padding:14px 16px">
        <div style="font-size:13px;font-weight:900;color:#FF6B6B;letter-spacing:0.08em;margin-bottom:8px">WEEKLY BURNOUT INTELLIGENCE BRIEF</div>
        <div style="font-size:13px;color:#111827;font-weight:600;line-height:1.7;background:linear-gradient(90deg, rgba(255,107,107,0.85) 0 3px, rgba(255,107,107,0.05) 3px 100%);border-radius:12px;padding:10px 12px">${escapeHtml(weeklyBrief)}</div>
      </div>

      <div style="background:rgba(255,255,255,0.70);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:14px 16px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="font-size:10px;font-weight:900;color:#64748b;letter-spacing:0.10em">STRATEGIC ACTION PLANS</div>
          <div style="font-size:12px;color:#64748b;font-weight:800">5 plans generated from this analysis</div>
        </div>
        <div style="margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
          ${(Array.isArray(plans) ? plans : []).map(p => `
            <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
                <div style="font-family:'Syne',system-ui;font-weight:900;color:#111827">${escapeHtml(p.title)}</div>
                <span style="background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.10);border-radius:999px;padding:4px 10px;font-size:10px;font-weight:900;color:#334155;white-space:nowrap">${escapeHtml(p.timeframe || '')}</span>
              </div>
              <div class="small" style="margin-top:6px;color:#6b7280;font-weight:600;line-height:1.65">${escapeHtml(p.explanation || '')}</div>
              <div style="margin-top:10px;display:grid;gap:8px">
                ${(Array.isArray(p.actions) ? p.actions : []).filter(Boolean).slice(0, 6).map(a => {
                  const t = String(a || '').trim();
                  const st = (getPlanActionState(p).actions[t] || { selected:true, deleted:false });
                  if (st.deleted) return '';
                  const checked = !!st.selected;
                  const keyEnc = encodeURIComponent(String(p.key || 'plan'));
                  const actionEnc = encodeURIComponent(t);
                  return `
                    <div class="plan-action-row" data-plan-key="${keyEnc}" data-action="${actionEnc}" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;background:${checked ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.65)'};border:1px solid ${checked ? 'rgba(99,102,241,0.18)' : 'rgba(0,0,0,0.10)'};border-radius:12px;padding:10px 10px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.borderColor='${checked ? 'rgba(99,102,241,0.28)' : 'rgba(0,0,0,0.16)'}'" onmouseout="this.style.borderColor='${checked ? 'rgba(99,102,241,0.18)' : 'rgba(0,0,0,0.10)'}'">
                      <div style="display:flex;gap:10px;min-width:0">
                        <div style="width:18px;height:18px;border-radius:6px;border:1.5px solid ${checked ? '#6366f1' : 'rgba(0,0,0,0.22)'};background:${checked ? '#6366f1' : 'transparent'};display:grid;place-items:center;flex-shrink:0;margin-top:1px">
                          ${checked ? '<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M20 6L9 17l-5-5\" stroke=\"#fff\" stroke-width=\"2.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>' : ''}
                        </div>
                        <div style="font-size:12px;color:#111827;font-weight:600;line-height:1.65;min-width:0">${escapeHtml(t)}</div>
                      </div>
                      <button class="plan-action-delete" type="button" title="Remove" style="width:26px;height:26px;border-radius:10px;background:transparent;border:1px solid rgba(0,0,0,0.10);cursor:pointer;display:grid;place-items:center;flex-shrink:0;color:#9ca3af" onmouseover="this.style.borderColor='rgba(0,0,0,0.18)';this.style.color='#6b7280'" onmouseout="this.style.borderColor='rgba(0,0,0,0.10)';this.style.color='#9ca3af'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 7h12M10 7V5h4v2m-6 0v14m8-14v14M9 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
              <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:12px">
                <button onclick="copyPlanToClipboard(window.__lastActionPlans.find(x=>x && x.key===${JSON.stringify(p.key)}))" style="background:transparent;border:1px solid rgba(0,0,0,0.14);border-radius:12px;padding:8px 10px;font-size:12px;font-weight:800;color:#6b7280;cursor:pointer">Copy plan</button>
                <button onclick="sendPlanToEmployee(window.__lastActionPlans.find(x=>x && x.key===${JSON.stringify(p.key)}))" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.22);border-radius:12px;padding:8px 10px;font-size:12px;font-weight:900;color:#6366f1;cursor:pointer">Send plan</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div style="background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.18);border-radius:14px;padding:12px">
          <div style="font-size:10px;font-weight:900;color:#FF6B6B;letter-spacing:0.08em">COMPANY RISK SCORE</div>
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:8px">
            <div style="font-family:'Syne',system-ui;font-weight:900;font-size:28px;color:#FF6B6B">${companyScore}</div>
            <div style="font-size:12px;font-weight:900;color:#0f172a">${companyTrendArrow}</div>
          </div>
        </div>

        <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);border-radius:14px;padding:12px">
          <div style="font-size:10px;font-weight:900;color:#6366f1;letter-spacing:0.08em">% AT RISK</div>
          <div style="font-family:'Syne',system-ui;font-weight:900;font-size:28px;color:#6366f1;margin-top:8px">${atRiskPct}%</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;font-weight:800">Medium + High</div>
        </div>

        <div style="background:rgba(0,184,148,0.06);border:1px solid rgba(0,184,148,0.18);border-radius:14px;padding:12px">
          <div style="font-size:10px;font-weight:900;color:#00b894;letter-spacing:0.08em">TOP RISK DRIVER</div>
          <div style="font-size:13px;font-weight:900;color:#0f172a;margin-top:10px">${escapeHtml(topDriver)}</div>
        </div>

        <div style="background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px">
          <div style="font-size:10px;font-weight:900;color:#64748b;letter-spacing:0.08em">RISK TREND</div>
          <div style="font-size:22px;font-weight:900;color:#0f172a;margin-top:8px">${seriesArrow}</div>
          <div style="font-size:11px;color:#94a3b8;font-weight:800;margin-top:2px">Last weeks</div>
        </div>
      </div>

      <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:14px 16px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-size:11px;font-weight:900;color:#FF6B6B;letter-spacing:0.08em">BURNOUT TREND</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;font-weight:700">4–8 week trend</div>
          </div>
          <div style="font-size:12px;color:#94a3b8;font-weight:800">Score over time</div>
        </div>
        ${renderTrendBars(trendSeries)}
      </div>

      <div style="display:grid;gap:12px">
        <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-top:2px">TEAM HOTSPOTS</div>

        ${high.length ? `
          <div>
            <div style="font-family:'Syne',system-ui;font-weight:900;color:#FF6B6B;margin-bottom:8px">High risk</div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${high.map(employeeCard).join('')}</div>
          </div>
        ` : ''}

        ${medium.length ? `
          <div>
            <div style="font-family:'Syne',system-ui;font-weight:900;color:#FFD93D;margin-bottom:8px">Medium risk</div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${medium.map(employeeCard).join('')}</div>
          </div>
        ` : ''}

        ${low.length ? `
          <div>
            <div style="font-family:'Syne',system-ui;font-weight:900;color:#00b894;margin-bottom:8px">Low risk</div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${low.map(employeeCard).join('')}</div>
          </div>
        ` : ''}
      </div>

      <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:14px 16px">
        <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-bottom:10px">SICK LEAVE SIGNALS</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px">
            <div style="font-size:10px;font-weight:900;color:#94a3b8;letter-spacing:0.08em">TOTAL SICK DAYS</div>
            <div style="font-family:'Syne',system-ui;font-weight:900;font-size:22px;color:#0f172a;margin-top:8px">${totalSickDays}</div>
          </div>
          <div style="background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.18);border-radius:14px;padding:12px">
            <div style="font-size:10px;font-weight:900;color:#FF6B6B;letter-spacing:0.08em">HIGH SICK DAYS (≥3)</div>
            <div style="font-family:'Syne',system-ui;font-weight:900;font-size:22px;color:#FF6B6B;margin-top:8px">${highSick.length}</div>
          </div>
          <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);border-radius:14px;padding:12px">
            <div style="font-size:10px;font-weight:900;color:#6366f1;letter-spacing:0.08em">MISSING VACATION DATA</div>
            <div style="font-family:'Syne',system-ui;font-weight:900;font-size:22px;color:#6366f1;margin-top:8px">${missingVacation.length}</div>
          </div>
        </div>
        ${highSick.length ? `
          <div style="margin-top:12px;font-size:12px;color:#64748b">
            <div style="font-weight:900;color:#0f172a;margin-bottom:6px">Employees with high sick days</div>
            ${highSick.map(e => `<div style="padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.06)"><span style="font-weight:900">${escapeHtml(e.name)}</span> · ${Number(e.raw?.sickDays) || 0} sick day(s)</div>`).join('')}
          </div>
        ` : ''}
        ${missingVacation.length ? `
          <div style="margin-top:12px;font-size:12px;color:#64748b">
            <div style="font-weight:900;color:#0f172a;margin-bottom:6px">Missing vacation data</div>
            ${missingVacation.map(e => `<div style="padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.06)"><span style="font-weight:900">${escapeHtml(e.name)}</span> · lastVacation unknown</div>`).join('')}
          </div>
        ` : ''}
      </div>

    </div>
  `;
}

function showEmployeeCard(el){
  const e = JSON.parse(el.getAttribute('data-employee').replace(/&#39;/g,"'"));
  const lvl = String(e.riskLevel||'medium').toLowerCase();
  const colorMap = { low:'#00e5a0', medium:'#FFD93D', high:'#FF6B6B', critical:'#ff3b3b' };
  const color = colorMap[lvl] || '#FFD93D';
  const score = e.burnoutScore || 0;
  const factors = Array.isArray(e.riskFactors) ? e.riskFactors : [];
  const recs = Array.isArray(e.recommendations) ? e.recommendations : [];

  document.getElementById('employeeCardContent').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-family:'Syne',system-ui;font-weight:900;font-size:22px">${escapeHtml(e.name||'')}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px">Employee Risk Profile</div>
      </div>
      <div style="text-align:center">
        <div style="font-family:'Syne',system-ui;font-weight:900;font-size:42px;color:${color};line-height:1">${score}</div>
        <div style="font-size:10px;color:#94a3b8">/100</div>
      </div>
    </div>
    <div style="background:rgba(0,0,0,0.04);border-radius:8px;height:8px;margin-bottom:16px;overflow:hidden">
      <div style="height:100%;width:${score}%;background:linear-gradient(90deg,${color}66,${color});border-radius:8px"></div>
    </div>
    <div style="margin-bottom:16px">
      <span style="background:${color}22;border:1px solid ${color}55;border-radius:8px;padding:5px 14px;font-size:12px;font-weight:900;color:${color};font-family:'Syne',system-ui;text-transform:uppercase;letter-spacing:0.05em">${lvl} risk</span>
    </div>
    <div style="background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.12);border-radius:12px;padding:14px;margin-bottom:12px">
      <div style="font-size:10px;font-weight:900;color:#FF6B6B;letter-spacing:0.08em;margin-bottom:8px">⚠ RISK FACTORS</div>
      ${factors.map(f=>`<div style="font-size:13px;color:#334155;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.06)">${escapeHtml(f)}</div>`).join('')}
    </div>
    <div style="background:rgba(0,229,160,0.06);border:1px solid rgba(0,229,160,0.12);border-radius:12px;padding:14px">
      <div style="font-size:10px;font-weight:900;color:#00e5a0;letter-spacing:0.08em;margin-bottom:8px">→ RECOMMENDATIONS</div>
      ${recs.map(r=>`<div style="font-size:13px;color:#334155;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.06)">${escapeHtml(r)}</div>`).join('')}
    </div>
  `;
  const modal = document.getElementById('employeeModal');
  modal.style.display = 'flex';
}

function closeEmployeeCard(){
  document.getElementById('employeeModal').style.display = 'none';
}

async function runPulse(){
  setPulseDemoActive(false);
  const btn = document.getElementById('btnPulse');
  const reset = setBusy(btn, 'Analyzing…');
  const msg = document.getElementById('pulseMsg');
  msg.textContent = '';
  document.getElementById('pulseOut').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px">⏳ Analyzing burnout risk…</div>';
  try{
    const isManual = document.getElementById('pulseManualPanel')?.style.display !== 'none';
    let csvText = '';

    if (isManual) {
      const valid = pulseEmployees.filter(e => e && e.name);
      if (valid.length === 0) throw new Error('Please add at least one employee.');
      const header = 'name,weekly hours,weekend hours,after-hours messages,sick days,last vacation';
      const rows = valid.map(e => `${e.name||''},${e.weeklyHours||0},${e.weekendHours||0},${e.afterHoursMessages||0},${e.sickDays||0},${e.lastVacation||'unknown'}`);
      csvText = [header, ...rows].join('\n');
    } else {
      const file = document.getElementById('pulseFile')?.files?.[0] || null;
      if (!file) throw new Error('Please upload a CSV file.');
      csvText = await file.text();
    }

    const rows = parseCsvText(csvText);
    if (rows.length < 2) throw new Error('CSV must include a header row and at least one employee row');

    const employeesInput = mapEmployeeRows(rows);
    if (employeesInput.length === 0) throw new Error('No employee rows found');

    const data = await apiFetch('/api/pulse', {
      method:'POST',
      accessToken: (await supabase.auth.getSession()).data?.session?.access_token,
      body: { employees: employeesInput }
    });

    if (!data || !Array.isArray(data.employees)) throw new Error('Invalid AI response');
    const inputByName = {};
    for (const e of employeesInput) {
      const k = String(e?.name || '').toLowerCase();
      if (k) inputByName[k] = e;
    }

    const mergedEmployees = data.employees.map(e => {
      const k = String(e?.name || '').toLowerCase();
      const metrics = inputByName[k] || {};
      return {
        ...metrics,
        ...e
      };
    });

    pulseLast = { ...data, employees: mergedEmployees };
    renderPulse(mergedEmployees);

    try{
      const result = { ...data, employees: mergedEmployees };
      const atRisk = result.employees.filter(e => ['high','critical'].includes(String(e.riskLevel||'').toLowerCase())).length;
      await insertAnalysisHistory('pulse', {
        employees: result.employees,
        at_risk_count: atRisk
      });
    }catch(e){ /* noop */ }

    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        const result = { ...data, employees: mergedEmployees };
        const atRisk = result.employees.filter(e => ['high','critical'].includes(String(e.riskLevel||'').toLowerCase())).length;
        await supabase.from('pulse_results').insert({
          user_id: s.user.id,
          employees: result.employees,
          at_risk_count: atRisk
        });

        const { data: { session: emailSession } } = await supabase.auth.getSession();
        if (emailSession?.user?.email) {
          await sendWeeklyReport(emailSession.user.email, result.employees, atRisk);
        }
      }
    } catch(e) { console.warn('Save pulse result failed', e); }

    addFeed('Burnout Intelligence', `Generated weekly burnout intelligence report for ${mergedEmployees.length} employee(s).`);

    msg.textContent = 'Done.';
  }catch(err){
    msg.textContent = err && err.message ? err.message : 'Pulse analysis failed';
  }finally{
    reset();
  }
}

function initDrop(dropEl, inputEl, listEl){
  const prevent = (e)=>{ e.preventDefault(); e.stopPropagation(); };
  ['dragenter','dragover'].forEach(ev=>dropEl.addEventListener(ev,(e)=>{prevent(e);dropEl.classList.add('drag');}));
  ['dragleave','drop'].forEach(ev=>dropEl.addEventListener(ev,(e)=>{prevent(e);dropEl.classList.remove('drag');}));
  dropEl.addEventListener('drop',(e)=>{
    const files = Array.from(e.dataTransfer.files || []);
    inputEl.files = e.dataTransfer.files;
    listEl.textContent = files.map(f=>f.name).join(', ');
  });
  inputEl.addEventListener('change',()=>{
    const files = Array.from(inputEl.files || []);
    listEl.textContent = files.map(f=>f.name).join(', ');
  });
}

function wireUi(){
  try {
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn=>{
      btn?.addEventListener?.('click',()=>switchTab(btn.getAttribute('data-tab')));
    });

    initPulseHistoryAccordion();
    initSidebarCollapse();
    initPlanActionDelegation();

    const empEmailInput = document.getElementById('empEmail');
    const sendBtn = document.getElementById('btnSendEmployee');
    if (empEmailInput && sendBtn) {
      sendBtn.style.display = empEmailInput.value.trim() ? 'inline-flex' : 'none';
      empEmailInput.addEventListener('input', function() {
        if (sendBtn) sendBtn.style.display = this.value.trim() ? 'inline-flex' : 'none';
      });
    }

    const gateMsg = document.getElementById('gateMsg');

    const btnLogin = document.getElementById('btnLogin');
    btnLogin?.addEventListener('click', async ()=>{
      if (!btnLogin) return;
      const reset = setBusy(btnLogin, 'Redirecting…');
      if (gateMsg) gateMsg.textContent = '';
      try{
        await loginGoogle();
      }catch(err){
        if (gateMsg) gateMsg.textContent = err && err.message ? err.message : 'Login failed';
        reset();
      }
    });

    const btnLogout = document.getElementById('btnLogout');
    btnLogout?.addEventListener('click', async ()=>{
      if (!btnLogout) return;
      const reset = setBusy(btnLogout, 'Signing out…');
      try{ await logout(); }
      finally{ reset(); }
    });

    document.getElementById('btnExportHire')?.addEventListener('click', ()=>{
      if (!hireCsvRows.length) return;
      download('peoplera-hire-candidates.csv', toCsv(hireCsvRows), 'text/csv');
    });

    document.getElementById('btnDownloadBoard')?.addEventListener('click', ()=>{
      try{
        downloadBoardPdf(boardLast);
      }catch(err){
        const txt = generatePlanPdfText(boardLast);
        if (txt) download('peoplera-onboarding-plan.txt', txt, 'text/plain');
        else alert(err && err.message ? err.message : 'Download failed');
      }
    });

    document.getElementById('btnExportPulseXlsx')?.addEventListener('click', ()=>{
      exportPulseReportXlsx();
    });

    document.getElementById('cvFiles')?.addEventListener('change', function(){
      const names = Array.from(this.files || []).map(f=>f.name).join(', ');
      const _el_cvList = document.getElementById('cvList');
      if (_el_cvList) _el_cvList.textContent = names ? '✓ ' + names : '';
    });
    document.getElementById('handbookFile')?.addEventListener('change', function(){
      const _el_handbookName = document.getElementById('handbookName');
      if (_el_handbookName) _el_handbookName.textContent = this.files?.[0] ? '✓ ' + this.files[0].name : '';
    });
    document.getElementById('pulseFile')?.addEventListener('change', function(){
      const _el_pulseName = document.getElementById('pulseName');
      if (_el_pulseName) _el_pulseName.textContent = this.files?.[0] ? '✓ ' + this.files[0].name : '';
    });

    const cvDrop = document.getElementById('cvDrop');
    const cvFiles = document.getElementById('cvFiles');
    const cvList = document.getElementById('cvList');
    if (cvDrop && cvFiles && cvList) initDrop(cvDrop, cvFiles, cvList);

    addFeed('Security', 'Session-protected dashboard initialized.');
  } catch(e) {
    console.warn('wireUi error:', e);
  }
}

async function boot(){
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('welcome') === '1') {
    window.__showWelcome = true;
  }

  wireUi();

  const gateMsg = document.getElementById('gateMsg');
  if (gateMsg) gateMsg.textContent = 'Loading…';

  try{
    await initSupabase();
    await renderAuthState();

    if (session) {
      await loadHistory();
      await checkStatus();
    }

    if (urlParams.get('welcome') === '1') {
      window.history.replaceState({}, '', '/dashboard.html');
    }
  }catch(err){
    console.error('Dashboard init failed:', err);
    const gate = document.getElementById('gate');
    const app = document.getElementById('app');
    if (gate) gate.hidden = false;
    if (app) app.hidden = true;
    if (gateMsg) gateMsg.textContent = 'Loading…';
  }
}

window.runHire = runHire;
window.runBoard = runBoard;
window.runPulse = runPulse;
window.runPulseDemo = runPulseDemo;
window.clearHire = clearHire;
window.clearBoard = clearBoard;
window.clearPulse = clearPulse;
window.showSection = showSection;
window.runInterview = runInterview;
window.applyBoardTemplate = applyBoardTemplate;
window.toggleHandbook = toggleHandbook;
window.sendBoardToEmployee = sendBoardToEmployee;
window.updateBoardProgress = updateBoardProgress;
window.deleteHistoryItem = deleteHistoryItem;
window.switchPulseTab = switchPulseTab;
window.addPulseEmployee = addPulseEmployee;
window.updatePulseEmp = updatePulseEmp;
window.removePulseEmployee = removePulseEmployee;
window.downloadPulseTemplate = downloadPulseTemplate;
window.loadHistoryItem = loadHistoryItem;
window.showEmployeeCard = showEmployeeCard;

// New Burnout Intelligence functions
let employees = [];
let weeklyData = {};

async function loadPulseData() {
  try {
    const { data: empData, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (empError) throw empError;
    employees = empData || [];

    // Load weekly metrics for current week
    const currentMonday = getCurrentMonday();
    const { data: metricsData, error: metricsError } = await supabase
      .from('weekly_metrics')
      .select('*')
      .eq('employee_id', employees.map(e => e.id))
      .eq('week_start', currentMonday);

    if (metricsError) throw metricsError;
    weeklyData = {};
    (metricsData || []).forEach(m => {
      weeklyData[m.employee_id] = m;
    });

    renderEmployees();
    updateSectionsVisibility();
    if (employees.length > 0) {
      renderWeeklyData();
      await loadAndCalculateScores();
    }
  } catch (error) {
    console.error('Error loading pulse data:', error);
    showToast('Error loading data', 'error');
  }
}

function getCurrentMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function renderEmployees() {
  const list = document.getElementById('employeesList');
  const emptyState = document.getElementById('emptyState');

  if (employees.length === 0) {
    list.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  list.innerHTML = employees.map(emp => `
    <div class="panel" style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <div style="font-weight:900;font-size:16px">${emp.full_name}</div>
          <div style="font-size:13px;color:#64748b">${emp.job_title}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="editEmployee(${emp.id})" style="background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.12);border-radius:6px;padding:6px 10px;font-size:12px;font-weight:800;color:#64748b;cursor:pointer">✏ Edit</button>
          <button onclick="deleteEmployee(${emp.id})" style="background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.2);border-radius:6px;padding:6px 10px;font-size:12px;font-weight:800;color:#FF6B6B;cursor:pointer">✕ Delete</button>
        </div>
      </div>
      <div id="emp-details-${emp.id}" style="display:none;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08)">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;font-size:13px">
          <div><strong>Start Date:</strong> ${formatDate(emp.start_date)}</div>
          <div><strong>Birth Date:</strong> ${emp.birth_date ? formatDate(emp.birth_date) : 'Not set'}</div>
          <div><strong>Last Vacation:</strong> ${emp.last_vacation ? formatDate(emp.last_vacation) : 'Not set'}</div>
        </div>
      </div>
      <button onclick="toggleEmployeeDetails(${emp.id})" style="background:none;border:none;color:#6366f1;font-size:12px;font-weight:800;cursor:pointer;margin-top:8px">Show details ▼</button>
    </div>
  `).join('');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString();
}

function toggleEmployeeDetails(id) {
  const details = document.getElementById(`emp-details-${id}`);
  const btn = details.nextElementSibling;
  const isVisible = details.style.display !== 'none';
  details.style.display = isVisible ? 'none' : 'block';
  btn.textContent = isVisible ? 'Show details ▼' : 'Hide details ▲';
}

function updateSectionsVisibility() {
  const weeklySection = document.getElementById('weeklyDataSection');
  const scoreSection = document.getElementById('scoreSection');

  weeklySection.style.display = employees.length > 0 ? 'block' : 'none';
  scoreSection.style.display = employees.length > 0 ? 'block' : 'none';
}

function renderWeeklyData() {
  const list = document.getElementById('weeklyDataList');
  const weekRange = document.getElementById('weekRange');
  const monday = getCurrentMonday();
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  weekRange.textContent = `${monday} – ${sunday.toISOString().split('T')[0]}`;

  list.innerHTML = employees.map(emp => {
    const data = weeklyData[emp.id] || {};
    return `
      <div class="panel" style="padding:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div>
            <div style="font-weight:900;font-size:14px">${emp.full_name}</div>
            <div style="font-size:12px;color:#64748b">${emp.job_title}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Weekly Hours</label>
            <input type="number" id="hours-${emp.id}" value="${data.weekly_hours || ''}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px" min="0" step="0.5">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Weekend Hours</label>
            <input type="number" id="weekend-${emp.id}" value="${data.weekend_hours || ''}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px" min="0" step="0.5">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">After-hours Messages</label>
            <input type="number" id="messages-${emp.id}" value="${data.after_hours_messages || ''}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px" min="0">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Sick Days</label>
            <input type="number" id="sick-${emp.id}" value="${data.sick_days || ''}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px" min="0" step="0.5">
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function saveWeeklyData() {
  const btn = document.getElementById('btnSaveWeeklyData');
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const monday = getCurrentMonday();
    const updates = [];
    const inserts = [];

    for (const emp of employees) {
      const hours = parseFloat(document.getElementById(`hours-${emp.id}`).value) || 0;
      const weekend = parseFloat(document.getElementById(`weekend-${emp.id}`).value) || 0;
      const messages = parseInt(document.getElementById(`messages-${emp.id}`).value) || 0;
      const sick = parseFloat(document.getElementById(`sick-${emp.id}`).value) || 0;

      const data = {
        employee_id: emp.id,
        week_start: monday,
        weekly_hours: hours,
        weekend_hours: weekend,
        after_hours_messages: messages,
        sick_days: sick,
        overtime_hours: Math.max(0, hours - 40)
      };

      if (weeklyData[emp.id]) {
        updates.push({ ...data, id: weeklyData[emp.id].id });
      } else {
        inserts.push(data);
      }
    }

    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from('weekly_metrics')
        .upsert(updates);
      if (updateError) throw updateError;
    }

    if (inserts.length > 0) {
      const { error: insertError } = await supabase
        .from('weekly_metrics')
        .insert(inserts);
      if (insertError) throw insertError;
    }

    showToast('Weekly data saved successfully!');
    await loadPulseData(); // Refresh data
  } catch (error) {
    console.error('Error saving weekly data:', error);
    showToast('Error saving data', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function loadDemoData() {
  const btn = document.getElementById('btnTryDemoData');
  const originalText = btn.textContent;
  btn.textContent = 'Loading...';
  btn.disabled = true;

  try {
    const demoEmployees = [
      { full_name: 'Alex Kim', job_title: 'Senior Engineer', start_date: '2022-03-15', birth_date: '1990-06-12', last_vacation: getDateMonthsAgo(9) },
      { full_name: 'Maya Chen', job_title: 'Product Designer', start_date: '2021-07-01', birth_date: '1988-11-24', last_vacation: getDateMonthsAgo(6) },
      { full_name: 'Omar Hassan', job_title: 'Marketing Lead', start_date: '2023-01-10', birth_date: '1995-03-08', last_vacation: getDateMonthsAgo(4) },
      { full_name: 'Sara Lee', job_title: 'Operations Manager', start_date: '2020-09-20', birth_date: '1992-08-30', last_vacation: getDateMonthsAgo(2) }
    ];

    const { data: insertedEmps, error: empError } = await supabase
      .from('employees')
      .insert(demoEmployees.map(emp => ({ ...emp, user_id: session.user.id })))
      .select();

    if (empError) throw empError;

    const monday = getCurrentMonday();
    const demoMetrics = [
      { employee_id: insertedEmps[0].id, week_start: monday, weekly_hours: 68, weekend_hours: 10, after_hours_messages: 28, sick_days: 3, overtime_hours: 28 },
      { employee_id: insertedEmps[1].id, week_start: monday, weekly_hours: 62, weekend_hours: 8, after_hours_messages: 20, sick_days: 1, overtime_hours: 22 },
      { employee_id: insertedEmps[2].id, week_start: monday, weekly_hours: 54, weekend_hours: 4, after_hours_messages: 12, sick_days: 0, overtime_hours: 14 },
      { employee_id: insertedEmps[3].id, week_start: monday, weekly_hours: 42, weekend_hours: 0, after_hours_messages: 3, sick_days: 0, overtime_hours: 2 }
    ];

    const { error: metricsError } = await supabase
      .from('weekly_metrics')
      .insert(demoMetrics);

    if (metricsError) throw metricsError;

    showToast('Demo data loaded successfully!');
    await loadPulseData();
  } catch (error) {
    console.error('Error loading demo data:', error);
    showToast('Error loading demo data', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function getDateMonthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().split('T')[0];
}

function showAddEmployeeForm() {
  document.getElementById('addEmployeeForm').style.display = 'block';
  document.getElementById('btnAddEmployee').style.display = 'none';
}

function hideAddEmployeeForm() {
  document.getElementById('addEmployeeForm').style.display = 'none';
  document.getElementById('btnAddEmployee').style.display = 'inline-block';
  // Clear form
  document.getElementById('empFullName').value = '';
  document.getElementById('empJobTitle').value = '';
  document.getElementById('empStartDate').value = '';
  document.getElementById('empBirthDate').value = '';
  document.getElementById('empLastVacation').value = '';
  document.getElementById('formError').style.display = 'none';
}

async function saveEmployee() {
  const btn = document.getElementById('btnSaveEmployee');
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    const fullName = document.getElementById('empFullName').value.trim();
    const jobTitle = document.getElementById('empJobTitle').value.trim();
    const startDate = document.getElementById('empStartDate').value;
    const birthDate = document.getElementById('empBirthDate').value;
    const lastVacation = document.getElementById('empLastVacation').value;

    if (!fullName || !startDate) {
      document.getElementById('formError').textContent = 'Full name and start date are required';
      document.getElementById('formError').style.display = 'block';
      return;
    }

    const { error } = await supabase
      .from('employees')
      .insert({
        user_id: session.user.id,
        full_name: fullName,
        job_title: jobTitle,
        start_date: startDate,
        birth_date: birthDate || null,
        last_vacation: lastVacation || null
      });

    if (error) throw error;

    showToast('Employee added successfully!');
    hideAddEmployeeForm();
    await loadPulseData();
  } catch (error) {
    console.error('Error saving employee:', error);
    document.getElementById('formError').textContent = 'Error saving employee';
    document.getElementById('formError').style.display = 'block';
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function deleteEmployee(id) {
  if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) return;

  try {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) throw error;

    showToast('Employee deleted');
    await loadPulseData();
  } catch (error) {
    console.error('Error deleting employee:', error);
    showToast('Error deleting employee', 'error');
  }
}

function editEmployee(id) {
  // For now, just show a message. Could implement inline editing later
  showToast('Edit functionality coming soon', 'info');
}

async function loadAndCalculateScores() {
  try {
    // Load last 8 weeks of data for trend
    const monday = getCurrentMonday();
    const eightWeeksAgo = new Date(monday);
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const { data: trendData, error: trendError } = await supabase
      .from('weekly_metrics')
      .select('*')
      .eq('employee_id', employees.map(e => e.id))
      .gte('week_start', eightWeeksAgo.toISOString().split('T')[0])
      .order('week_start', { ascending: true });

    if (trendError) throw trendError;

    // Calculate scores for current week
    const currentWeekData = (trendData || []).filter(d => d.week_start === monday);
    const scores = calculateBurnoutScores(currentWeekData);

    // Update UI
    updateScoreCards(scores, currentWeekData);
    renderTrendChart(trendData || []);
  } catch (error) {
    console.error('Error calculating scores:', error);
  }
}

function calculateBurnoutScores(weeklyData) {
  const employeeScores = {};

  weeklyData.forEach(data => {
    const emp = employees.find(e => e.id === data.employee_id);
    if (!emp) return;

    // Weighted formula: weekly_hours (40%), weekend_hours (20%), after_hours_messages (20%), sick_days (20%)
    const hoursScore = Math.min(data.weekly_hours / 60, 1) * 40;
    const weekendScore = Math.min(data.weekend_hours / 20, 1) * 20;
    const messagesScore = Math.min(data.after_hours_messages / 50, 1) * 20;
    const sickScore = Math.min(data.sick_days / 5, 1) * 20;

    const totalScore = Math.round(hoursScore + weekendScore + messagesScore + sickScore);
    employeeScores[emp.id] = totalScore;
  });

  return employeeScores;
}

function updateScoreCards(scores, weeklyData) {
  const scoreValues = Object.values(scores);
  const companyScore = scoreValues.length > 0 ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) : 0;
  const atRiskCount = scoreValues.filter(s => s > 50).length;
  const atRiskPercent = scoreValues.length > 0 ? Math.round((atRiskCount / scoreValues.length) * 100) : 0;

  // Find top risk driver
  const riskDrivers = { hours: 0, weekend: 0, messages: 0, sick: 0 };
  weeklyData.forEach(data => {
    if (data.weekly_hours > 50) riskDrivers.hours++;
    if (data.weekend_hours > 10) riskDrivers.weekend++;
    if (data.after_hours_messages > 25) riskDrivers.messages++;
    if (data.sick_days > 2) riskDrivers.sick++;
  });

  const topDriver = Object.entries(riskDrivers).sort((a, b) => b[1] - a[1])[0];
  const driverNames = { hours: 'Overtime Hours', weekend: 'Weekend Work', messages: 'After-hours Messages', sick: 'Sick Days' };

  document.getElementById('companyScore').textContent = companyScore;
  document.getElementById('riskLevel').textContent = getRiskLevel(companyScore);
  document.getElementById('atRiskPercent').textContent = atRiskPercent;
  document.getElementById('topRiskDriver').textContent = topDriver[1] > 0 ? driverNames[topDriver[0]] : 'None';
  document.getElementById('riskTrend').textContent = '—'; // Would need historical data
}

function getRiskLevel(score) {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Medium';
  return 'Low';
}

function renderTrendChart(trendData) {
  const chart = document.getElementById('trendChart');
  if (!trendData.length) {
    chart.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px">No trend data available</div>';
    return;
  }

  // Group by week and calculate average scores
  const weeklyAverages = {};
  trendData.forEach(data => {
    if (!weeklyAverages[data.week_start]) weeklyAverages[data.week_start] = [];
    const emp = employees.find(e => e.id === data.employee_id);
    if (emp) {
      const score = calculateBurnoutScores([data])[emp.id] || 0;
      weeklyAverages[data.week_start].push(score);
    }
  });

  const weeks = Object.keys(weeklyAverages).sort().slice(-8);
  const bars = weeks.map(week => {
    const scores = weeklyAverages[week];
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const height = Math.max((avgScore / 100) * 100, 10); // Min height of 10px
    const color = avgScore >= 75 ? '#dc2626' : avgScore >= 50 ? '#ea580c' : avgScore >= 25 ? '#f59e0b' : '#10b981';

    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="width:20px;background:${color};border-radius:2px 2px 0 0;min-height:${height}px;max-height:100px;transition:height 0.3s ease" title="Score: ${Math.round(avgScore)}"></div>
        <div style="font-size:10px;color:#64748b;text-align:center">${new Date(week).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
      </div>
    `;
  });

  chart.innerHTML = bars.join('');
}

function generateFullReport() {
  showToast('Full report generation coming soon!', 'info');
}

function showToast(message, type = 'success') {
  // Simple toast implementation
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#fee2e2' : '#d1fae5'};
    color: ${type === 'error' ? '#dc2626' : '#065f46'};
    padding: 12px 16px;
    border-radius: 8px;
    font-weight: 600;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => document.body.removeChild(toast), 3000);
}

// Update user profile in sidebar
function updateUserProfile() {
  if (!session?.user) return;

  const user = session.user;
  const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const email = user.email || '';

  const avatar = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');
  const emailEl = document.getElementById('userEmail');

  if (name) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    avatar.textContent = initials;
    nameEl.textContent = name;
    emailEl.textContent = email;
  } else {
    avatar.textContent = email[0]?.toUpperCase() || '?';
    nameEl.textContent = '';
    emailEl.textContent = email;
  }
}

window.showAddEmployeeForm = showAddEmployeeForm;
window.hideAddEmployeeForm = hideAddEmployeeForm;
window.saveEmployee = saveEmployee;
window.deleteEmployee = deleteEmployee;
window.editEmployee = editEmployee;
window.toggleEmployeeDetails = toggleEmployeeDetails;
window.saveWeeklyData = saveWeeklyData;
window.loadDemoData = loadDemoData;
window.generateFullReport = generateFullReport;
window.closeEmployeeCard = closeEmployeeCard;
window.exportPulseReportXlsx = exportPulseReportXlsx;
window.copyPlanToClipboard = copyPlanToClipboard;
window.sendPlanToEmployee = sendPlanToEmployee;
window.togglePlanAction = togglePlanAction;
window.deletePlanAction = deletePlanAction;

boot();