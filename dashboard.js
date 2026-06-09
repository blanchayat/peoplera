function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function generateActionPlansForEmployee(employeeId){
  const id = String(employeeId || '').trim();
  if (!id) return null;
  const token = (await supabase.auth.getSession()).data?.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const out = await apiFetch('/api/pulse?action=generate_for_employee', {
    method: 'POST',
    accessToken: token,
    body: { employee_id: id }
  });
  return out?.latest_action_plans || null;
}

function normalizeGeneratedPlanSection(s){
  const sec = s || {};
  return {
    title: String(sec.plan_title || '').trim(),
    explanation: String(sec.plan_description || '').trim(),
    projectionNote: String(sec.projected_impact || '').trim(),
    actions: Array.isArray(sec.actions) ? sec.actions.map(a => ({
      text: String(a?.text || '').trim(),
      impacted: Array.isArray(a?.impacted_employees) ? a.impacted_employees.map(x => String(x || '').trim()).filter(Boolean) : []
    })).filter(a => a.text) : []
  };
}

function actionPlansFromLatestActionPlansJson(latestJson){
  const lp = latestJson || null;
  if (!lp || typeof lp !== 'object') return null;
  const employee = lp.employee || {};
  const employeeName = String(employee.name || '').trim();
  const employeeId = String(employee.id || '').trim();
  const weekStart = String(lp.week_start || '').trim();
  const score = Number(lp.burnout_score || 0);

  const thisWeek = normalizeGeneratedPlanSection(lp.this_week);
  const next2 = normalizeGeneratedPlanSection(lp.next_2_weeks);

  const makeKey = (suffix) => `${employeeId || employeeName || 'employee'}:${weekStart || 'week'}:${suffix}`;

  const outPlans = [];
  if (thisWeek && thisWeek.title) {
    outPlans.push({
      key: makeKey('this_week'),
      title: thisWeek.title,
      timeframe: 'This week',
      explanation: thisWeek.explanation,
      projectionNote: thisWeek.projectionNote,
      actions: thisWeek.actions
    });
  }
  if (next2 && next2.title) {
    outPlans.push({
      key: makeKey('next_2_weeks'),
      title: next2.title,
      timeframe: 'Next 2 weeks',
      explanation: next2.explanation,
      projectionNote: next2.projectionNote,
      actions: next2.actions
    });
  }

  return {
    employeeId,
    employeeName,
    score,
    priority_alert: String(lp.priority_alert || '').trim(),
    plans: outPlans
  };
}

function redesignOverviewHrSystemCard(){
  try{
    const tab = document.getElementById('tab-overview');
    if (!tab) return;

    const panels = Array.from(tab.querySelectorAll('.panel'));
    const panel = panels.find(p => {
      const first = p.querySelector('div');
      const txt = String(first?.textContent || '').trim();
      return txt === 'Peoplera works alongside your HR system';
    });
    if (!panel) return;
    if (panel.getAttribute('data-hr-card-redesigned') === '1') return;
    panel.setAttribute('data-hr-card-redesigned', '1');

    panel.style.background = 'linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 60%)';
    panel.style.border = '1px solid #FED7AA';

    // Integration logo badges
    const allSpans = Array.from(panel.querySelectorAll('span'));
    const spanByText = {};
    for (const s of allSpans) {
      const t = String(s.textContent || '').trim();
      if (t) spanByText[t] = s;
    }

    const badgeSpec = {
      Personio: { initial: 'PE', bg: '#EEF2FF', color: '#4F46E5' },
      AFAS: { initial: 'AF', bg: '#FFF7ED', color: '#EA580C' },
      Nmbrs: { initial: 'NM', bg: '#F0FDF4', color: '#16A34A' }
    };

    for (const [name, spec] of Object.entries(badgeSpec)) {
      const el = spanByText[name];
      if (!el) continue;
      el.style.background = '#FFFFFF';
      el.style.border = '1px solid #E7E5E4';
      el.style.borderRadius = '10px';
      el.style.padding = '8px 14px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '8px';
      el.style.fontSize = '13px';
      el.style.fontWeight = '500';
      el.style.color = '#0f172a';

      if (!el.querySelector('[data-initial-avatar="1"]')) {
        el.innerHTML = `
          <span data-initial-avatar="1" style="display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;padding:0 6px;border-radius:8px;background:${escapeHtml(spec.bg)};color:${escapeHtml(spec.color)};font-size:11px;font-weight:800;letter-spacing:0.06em">${escapeHtml(spec.initial)}</span>
          <span style="font-size:13px;font-weight:500;color:#0f172a">${escapeHtml(name)}</span>
        `;
      }
    }

    // Right side CTA
    const ctaTitle = panel.querySelector('div[style*="Connect your HR system"]');
    const ctaBox = ctaTitle ? ctaTitle.closest('div') : null;
    if (ctaBox) {
      ctaBox.style.borderLeft = '3px solid #F97316';
      ctaBox.style.background = '#FFF7ED';
      ctaBox.style.borderRadius = '12px';
      ctaBox.style.border = '1px solid rgba(0,0,0,0.08)';
      ctaBox.style.padding = '10px 12px';

      if (ctaTitle) {
        ctaTitle.style.fontWeight = '500';
        ctaTitle.style.fontSize = '15px';
      }

      const subtitle = ctaBox.querySelector('div[style*="Sync employees automatically"]');
      if (subtitle) {
        subtitle.style.fontSize = '13px';
        subtitle.style.color = '#92400E';
      }

      const btn = ctaBox.querySelector('a');
      if (btn) {
        btn.style.background = '#F97316';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.padding = '8px 16px';
        btn.style.fontSize = '13px';
      }
    }

    // Bottom feature pills
    const pillRows = Array.from(panel.querySelectorAll('div')).filter(d => {
      const s = String(d.getAttribute('style') || '');
      return s.includes('margin-top:10px') && s.includes('display:flex') && s.includes('gap:8px');
    });
    const pillRow = pillRows[pillRows.length - 1] || null;
    if (pillRow) {
      const pills = Array.from(pillRow.querySelectorAll('span'));
      for (const pill of pills) {
        pill.style.background = '#FFFFFF';
        pill.style.border = '1px solid #FED7AA';
        pill.style.color = '#92400E';
        pill.style.fontSize = '12px';
        pill.style.fontWeight = '500';
        pill.style.display = 'inline-flex';
        pill.style.alignItems = 'center';
        pill.style.gap = '8px';
        pill.style.padding = '6px 10px';
        pill.style.borderRadius = '999px';

        if (!pill.querySelector('[data-orange-dot="1"]')) {
          pill.innerHTML = `
            <span data-orange-dot="1" style="width:6px;height:6px;border-radius:999px;background:#F97316;display:inline-block;flex:0 0 auto"></span>
            <span>${escapeHtml(String(pill.textContent || '').trim())}</span>
          `;
        }
      }
    }
  }catch(e){
    console.warn('redesignOverviewHrSystemCard failed:', e);
  }
}

async function loadLatestWeeklyMetricsWithEmployees(){
  const s = (await supabase.auth.getSession()).data?.session;
  if (!s) return { latestWeek: null, rows: [], employeesById: {}, weekSeries: [] };

  const isDemoEmployeeId = (employeeId) => {
    if (!employeeId) return false;
    return employeeId.toString().startsWith('demo-');
  };

  const { data: empRows, error: empErr } = await supabase
    .from('employees')
    .select('id, full_name, email')
    .eq('user_id', s.user.id);
  if (empErr) throw empErr;
  const employees = Array.isArray(empRows) ? empRows : [];
  const empIds = employees.map(e => e.id).filter(Boolean).filter(id => !isDemoEmployeeId(id));
  const employeesById = {};
  for (const e of employees) {
    if (!e?.id) continue;
    employeesById[String(e.id)] = e;
  }
  if (!empIds.length) return { latestWeek: null, rows: [], employeesById, weekSeries: [] };

  const { data: metricsRows, error: metricsErr } = await supabase
    .from('weekly_metrics')
    .select('*')
    .in('employee_id', empIds);
  if (metricsErr) throw metricsErr;

  const all = Array.isArray(metricsRows) ? metricsRows : [];
  const weeks = Array.from(new Set(all.map(r => String(r.week_start || '').trim()).filter(Boolean))).sort();
  const latestWeek = weeks.length ? weeks[weeks.length - 1] : null;
  const rows = latestWeek ? all.filter(r => String(r.week_start || '').trim() === String(latestWeek)) : [];

  const weekSeries = weeks.slice(Math.max(0, weeks.length - 2)).map(wk => {
    const wkRows = all.filter(r => String(r.week_start || '').trim() === String(wk));
    const scores = wkRows.map(m => computeBurnoutScoreFromSignals({
      weeklyHours: Number(m.weekly_hours || 0),
      weekendHours: Number(m.weekend_hours || 0),
      afterHoursMessages: Number(m.after_hours_messages || 0),
      sickDays: Number(m.sick_days || 0),
      overtimeHours: Number(m.overtime_hours || Math.max(0, Number(m.weekly_hours || 0) - 40))
    }));
    const avg = scores.length ? (scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
    return { wk, score: Math.round(avg) };
  });

  return { latestWeek, rows, employeesById, weekSeries };
}

function buildDynamicActionPlansFromMetrics({ latestWeek, rows, employeesById, weekSeries } = {}){
  const outPlans = [];
  const dataRows = Array.isArray(rows) ? rows : [];

  if (!latestWeek || !dataRows.length) {
    return { plans: [], priority: null };
  }

  const scoreByEmpId = {};
  for (const m of dataRows) {
    scoreByEmpId[String(m.employee_id)] = computeBurnoutScoreFromSignals({
      weeklyHours: Number(m.weekly_hours || 0),
      weekendHours: Number(m.weekend_hours || 0),
      afterHoursMessages: Number(m.after_hours_messages || 0),
      sickDays: Number(m.sick_days || 0),
      overtimeHours: Number(m.overtime_hours || Math.max(0, Number(m.weekly_hours || 0) - 40))
    });
  }

  const highest = Object.entries(scoreByEmpId).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0))[0] || null;
  const highestEmpId = highest ? highest[0] : null;
  const highestScore = highest ? Number(highest[1] || 0) : 0;
  const highestEmp = highestEmpId ? employeesById[String(highestEmpId)] : null;
  const highestName = String(highestEmp?.full_name || '').trim() || 'Employee';
  const highestMetrics = highestEmpId ? (dataRows.find(r => String(r.employee_id) === String(highestEmpId)) || null) : null;

  const namesFor = (pred) => {
    const names = [];
    for (const m of dataRows) {
      if (!pred(m)) continue;
      const e = employeesById[String(m.employee_id)] || null;
      const nm = String(e?.full_name || '').trim();
      if (nm) names.push(nm);
    }
    return Array.from(new Set(names));
  };

  const triggeredOvertime = namesFor(m => Number(m.weekly_hours || 0) > 50 || Number(m.overtime_hours || 0) > 10);
  const triggeredWeekend = namesFor(m => Number(m.weekend_hours || 0) > 10);
  const triggeredSick = namesFor(m => Number(m.sick_days || 0) > 2);
  const triggeredAfterHours = namesFor(m => Number(m.after_hours_messages || 0) > 25);

  const anySignals = triggeredOvertime.length || triggeredWeekend.length || triggeredSick.length || triggeredAfterHours.length;
  if (!anySignals) {
    return { plans: [], priority: null };
  }

  const last = Array.isArray(weekSeries) ? weekSeries[weekSeries.length - 1] : null;
  const prev = Array.isArray(weekSeries) ? weekSeries[weekSeries.length - 2] : null;
  const deltaPts = (last && prev) ? (Number(last.score||0) - Number(prev.score||0)) : null;
  const projectionNote = (deltaPts != null && Number.isFinite(deltaPts))
    ? `If current workload continues: risk is projected to ${deltaPts > 0 ? 'increase' : deltaPts < 0 ? 'decrease' : 'stay stable'} by ~${Math.abs(deltaPts)} points next week.`
    : '';

  const buildAction = (text, impactedNames) => {
    const list = Array.isArray(impactedNames) ? impactedNames.filter(Boolean) : [];
    return {
      text,
      impacted: list
    };
  };

  if (triggeredOvertime.length) {
    outPlans.push({
      key: 'overtime',
      title: 'Overtime Reduction Plan',
      timeframe: 'This week',
      explanation: 'Cut overtime for hotspots by removing low-priority work and redistributing load.',
      projectionNote: 'If workload is redistributed, burnout risk projected to drop ~22 points over 2 weeks.',
      actions: [
        buildAction('Reduce overtime immediately: pause non-critical work and cap weekly hours.', triggeredOvertime),
        buildAction('Reassign 10–20% of tasks away from the overtime cohort to lower-risk capacity.', triggeredOvertime),
        buildAction('Add coverage owners for critical work so overtime does not concentrate on one person.', triggeredOvertime)
      ]
    });
  }

  if (triggeredWeekend.length) {
    outPlans.push({
      key: 'weekend',
      title: 'Weekend Work Containment Plan',
      timeframe: 'This week',
      explanation: 'Reduce weekend work by tightening scope and clarifying boundaries for urgent tasks.',
      projectionNote,
      actions: [
        buildAction('Set a no-weekend-work rule unless explicitly approved by the manager on-call.', triggeredWeekend),
        buildAction('Clarify what is truly urgent vs. can wait until Monday; enforce ticketing.', triggeredWeekend),
        buildAction('Shift recurring weekend tasks into weekday rotations with clear owners.', triggeredWeekend)
      ]
    });
  }

  if (triggeredSick.length) {
    outPlans.push({
      key: 'sick',
      title: 'Sick Leave Prevention Plan',
      timeframe: 'This week',
      explanation: 'Early support and workload relief for employees showing elevated sick-day signals.',
      projectionNote,
      actions: [
        buildAction('Check in 1:1 to remove blockers and reduce load for at-risk employees.', triggeredSick),
        buildAction('Encourage time-off planning and set specific recovery days.', triggeredSick),
        buildAction('Ensure coverage planning for high-pressure roles to avoid overload during absences.', triggeredSick)
      ]
    });
  }

  if (triggeredAfterHours.length) {
    outPlans.push({
      key: 'afterhours',
      title: 'After-hours Boundary Plan',
      timeframe: 'Next 2 weeks',
      explanation: 'Reduce after-hours communication and improve recovery time by setting team norms.',
      projectionNote: 'If quiet hours are enforced, after-hours stress signals projected to decrease ~14 points.',
      actions: [
        buildAction('Define quiet hours and discourage non-urgent messaging outside work hours.', triggeredAfterHours),
        buildAction('Batch notifications and introduce async status updates to avoid constant pings.', triggeredAfterHours)
      ]
    });
  }

  let priority = null;
  if (highestEmpId && highestMetrics) {
    let suggestion = 'Reduce workload immediately.';
    let metricLine = '';
    const wh = Number(highestMetrics.weekly_hours || 0);
    const we = Number(highestMetrics.weekend_hours || 0);
    const sick = Number(highestMetrics.sick_days || 0);
    const msg = Number(highestMetrics.after_hours_messages || 0);
    if (wh > 50) {
      suggestion = 'Reduce overtime immediately.';
      metricLine = `Currently at ${Math.round(wh)}h this week.`;
    } else if (we > 10) {
      suggestion = 'Stop weekend work immediately.';
      metricLine = `Weekend hours: ${Math.round(we)}h.`;
    } else if (sick > 2) {
      suggestion = 'Support recovery immediately.';
      metricLine = `Sick days: ${sick}.`;
    } else if (msg > 25) {
      suggestion = 'Set after-hours boundaries immediately.';
      metricLine = `After-hours messages: ${Math.round(msg)}.`;
    }
    priority = `${highestName} (Score: ${Math.round(highestScore)}) — ${suggestion} ${metricLine}`.trim();
  }

  return { plans: outPlans, priority };
}

function planToPlainText(plan){
  const p = plan || {};
  const title = String(p.title || 'Plan').trim();
  const timeframe = String(p.timeframe || '').trim();
  const header = timeframe ? `${title} (${timeframe})` : title;
  const actions = Array.isArray(p.actions) ? p.actions : [];
  const lines = actions.map(a => {
    const txt = String(a?.text || a || '').trim();
    if (!txt) return '';
    return `• ${txt}`;
  }).filter(Boolean);
  return [header, '', ...lines].join('\n');
}

async function copyPlanPlainTextToClipboard(plan){
  const txt = planToPlainText(plan);
  if (!txt) return;
  try{
    await navigator.clipboard.writeText(txt);
    showToast('Plan copied to clipboard ✓');
  }catch(e){
    try{
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Plan copied to clipboard ✓');
    }catch(err){
      showToast('Unable to copy plan', 'error');
    }
  }
}

function openSendPlanModal({ plan, employees } = {}){
  const p = plan || {};
  const emps = Array.isArray(employees) ? employees : [];
  const planTxt = planToPlainText(p);

  const modal = document.createElement('div');
  modal.id = 'sendPlanModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;';

  const options = emps.map(e => {
    const id = escapeHtml(String(e.id || ''));
    const nm = escapeHtml(String(e.full_name || 'Employee'));
    const email = escapeHtml(String(e.email || ''));
    const label = email ? `${nm} (${email})` : nm;
    return `<option value="${id}" data-email="${email}">${label}</option>`;
  }).join('');

  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:18px;width:min(560px,94vw);box-shadow:0 20px 70px rgba(15,23,42,0.25);border:1px solid rgba(0,0,0,0.10)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div style="min-width:0">
          <div style="font-family:'Syne',system-ui;font-weight:900;font-size:16px;color:#0f172a">Send plan</div>
          <div style="margin-top:6px;font-size:12px;color:#64748b;font-weight:700">Select recipients and share the plan via email.</div>
        </div>
        <button type="button" data-close="1" style="width:32px;height:32px;border-radius:12px;border:1px solid rgba(0,0,0,0.12);background:transparent;cursor:pointer;font-weight:900;color:#64748b">×</button>
      </div>

      <div style="margin-top:14px">
        <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-bottom:6px">RECIPIENTS</div>
        <select id="sendPlanRecipients" multiple style="width:100%;min-height:92px;border:1px solid rgba(0,0,0,0.12);border-radius:12px;padding:10px;font-size:13px;font-weight:700;color:#0f172a;box-sizing:border-box">
          ${options}
        </select>
      </div>

      <div style="margin-top:14px">
        <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-bottom:6px">MESSAGE</div>
        <textarea id="sendPlanText" style="width:100%;height:160px;border:1px solid rgba(0,0,0,0.12);border-radius:12px;padding:12px;font-size:13px;color:#0f172a;box-sizing:border-box;resize:vertical">${escapeHtml(planTxt)}</textarea>
      </div>

      <div style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" data-copy="1" style="background:transparent;border:1px solid rgba(0,0,0,0.14);border-radius:12px;padding:10px 12px;font-size:12px;font-weight:900;color:#6b7280;cursor:pointer">Copy to Clipboard</button>
        <button type="button" data-email="1" style="background:linear-gradient(135deg,#FF6B4A,#FFB347);border:none;border-radius:12px;padding:10px 14px;font-size:12px;font-weight:900;color:#fff;cursor:pointer">Send via Email</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', async (e)=>{
    if (e.target === modal || e.target.closest('[data-close="1"]')) {
      modal.remove();
      return;
    }
    if (e.target.closest('[data-copy="1"]')) {
      const txt = modal.querySelector('#sendPlanText')?.value || '';
      try{
        await navigator.clipboard.writeText(txt);
        showToast('Plan copied to clipboard ✓');
      }catch(err){
        showToast('Unable to copy plan', 'error');
      }
      return;
    }
    if (e.target.closest('[data-email="1"]')) {
      const sel = modal.querySelector('#sendPlanRecipients');
      const selected = Array.from(sel?.selectedOptions || []);
      const emails = selected.map(o => (o.getAttribute('data-email') || '')).filter(Boolean);
      const to = emails.join(',');
      const body = modal.querySelector('#sendPlanText')?.value || '';
      const subject = `Action plan: ${String(p.title || 'Strategic Action Plan')}`;
      const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      try{ window.location.href = href; }catch(err){ /* noop */ }
      return;
    }
  });

  document.body.appendChild(modal);
}

async function readJsonSafe(res){
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

function ensureYourTeamCollapsibleIds(){
  try{
    const legacyChevron = document.getElementById('yourTeamChevron');
    const legacyBody = document.getElementById('yourTeamContent');
    // Match both <button> and <div> with onclick or id
    const headerBtn = document.querySelector('button[onclick="toggleYourTeamSection()"]')
      || document.querySelector('div[onclick="toggleYourTeamSection()"]')
      || document.getElementById('yourTeamHeader');

    if (headerBtn) {
      headerBtn.id = 'your-team-header';
      if (headerBtn.hasAttribute('onclick')) {
        headerBtn.removeAttribute('onclick');
        headerBtn.onclick = null;
      }
    }

    if (legacyBody) legacyBody.id = 'your-team-body';
    if (legacyChevron) legacyChevron.id = 'your-team-chevron';

    const body = document.getElementById('your-team-body');
    const chevron = document.getElementById('your-team-chevron');
    if (body) {
      body.style.maxHeight = '9999px';
      body.style.opacity = '1';
      body.style.overflow = 'hidden';
    }
    if (chevron && !chevron.textContent) chevron.textContent = '▲';
  }catch(e){
    // noop
  }
}

function updatePulseLastSynced(ts){
  const el = document.getElementById('pulseLastSynced');
  if (!el) return;
  const valueEl = document.getElementById('pulseLastSyncedValue');
  if (!ts) {
    if (valueEl) valueEl.textContent = '—';
    else el.textContent = 'Last synced: —';
    return;
  }
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) {
    if (valueEl) valueEl.textContent = '—';
    else el.textContent = 'Last synced: —';
    return;
  }
  const s = d.toLocaleString();
  if (valueEl) valueEl.textContent = s;
  else el.textContent = `Last synced: ${s}`;
}

function applyPulseActionButtonsUi({ connected, providerName, lastSyncedTs } = {}){
  const btnTry = document.getElementById('btnTryDemoData');
  const btnClear = document.getElementById('btnClearDemoData');
  const btnAdd = document.getElementById('btnAddEmployee');
  const btnConnect = document.getElementById('btnConnectHrSystem');
  const badge = document.getElementById('pulseConnectedBadge');
  const autoLabel = document.getElementById('pulseAutoUpdatingLabel');
  const syncBtn = document.getElementById('btnIntegrationSyncNow');
  const indicator = document.getElementById('integrationSyncIndicator');

  const activeEmployeesCount = (()=>{
    try{ return Number(employees?.length || 0); }catch(e){ /* noop */ }
    try{
      const n = Number(readJsonLocalStorage('peoplera_active_employees_count', 0));
      return Number.isFinite(n) ? n : 0;
    }catch(e){ /* noop */ }
    return 0;
  })();

  const demoActive = isDemoEmployeesActive();

  // Bind connect button once.
  if (btnConnect && !btnConnect.getAttribute('data-bound')) {
    btnConnect.setAttribute('data-bound', '1');
    btnConnect.addEventListener('click', (e)=>{
      e.preventDefault();
      window.__settingsInitialSubtab = 'integrations';
      try{ switchTab('settings'); }catch(err){ /* noop */ }
      setTimeout(()=>{
        try{ openSettingsSubtab('integrations'); }catch(err){ /* noop */ }
        try{ ensureSettingsIntegrationsUiLoaded(); }catch(err){ /* noop */ }
      }, 50);
    });
  }

  const isConnected = !!connected;

  if (!isConnected) {
    if (btnTry) btnTry.style.display = (activeEmployeesCount === 0 && !demoActive) ? '' : 'none';
    if (btnClear) btnClear.style.display = 'none';
    if (btnConnect) btnConnect.style.display = '';
    if (btnAdd) btnAdd.style.display = '';
    if (badge) badge.style.display = 'none';
    if (autoLabel) autoLabel.style.display = 'none';
    if (syncBtn) syncBtn.style.display = 'none';
    if (indicator) indicator.textContent = '';
    return;
  }

  // Connected state.
  if (btnTry) btnTry.style.display = (activeEmployeesCount === 0 && !demoActive) ? '' : 'none';
  if (btnClear) btnClear.style.display = 'none';
  if (btnAdd) btnAdd.style.display = 'none';
  if (btnConnect) btnConnect.style.display = 'none';

  if (badge) {
    badge.textContent = `✓ ${providerName || 'HR system'} connected`;
    badge.style.display = '';
  }

  if (autoLabel) autoLabel.style.display = '';
  if (syncBtn) syncBtn.style.display = 'inline';
  if (indicator) indicator.textContent = '';
  if (lastSyncedTs) updatePulseLastSynced(lastSyncedTs);
}

function ensureBurnoutMainContainerId(){
  try{
    const existing = document.getElementById('burnout-main-container');
    if (existing) return;
    const legacy = document.getElementById('burnoutMainSections');
    if (legacy) legacy.id = 'burnout-main-container';
  }catch(e){
    // noop
  }
}

function hideBurnoutMainContainer(){
  const mainContainer = document.getElementById('burnout-main-container');
  if (mainContainer) {
    mainContainer.style.display = 'none';
    mainContainer.style.height = '0';
    mainContainer.style.overflow = 'hidden';
    mainContainer.style.margin = '0';
    mainContainer.style.padding = '0';
  }
  try{ window.scrollTo(0, 0); }catch(e){ /* noop */ }
  try{
    const sc = document.querySelector('.main-content, #main-content, .content-area');
    if (sc) sc.scrollTop = 0;
  }catch(e){ /* noop */ }
}

function restoreBurnoutMainContainer(){
  const mainContainer = document.getElementById('burnout-main-container');
  if (mainContainer) {
    mainContainer.style.display = 'block';
    mainContainer.style.height = '';
    mainContainer.style.overflow = '';
    mainContainer.style.margin = '';
    mainContainer.style.padding = '';
  }
}

function toggleEmployeeCardDetails(card){
  if (!card) return;
  const details = card.querySelector('.employee-details');
  const btn = card.querySelector('.show-details-btn');
  if (!details) return;
  const isHidden = details.style.display === 'none' || !details.style.display;
  details.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? 'Hide details ▲' : 'Show details ▼';
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
  const logo = document.getElementById('sidebarLogo');
  const mobileBtn = document.getElementById('mobileSidebarToggle');

  const ensureBackdrop = () => {
    let el = document.getElementById('sidebarBackdrop');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'sidebarBackdrop';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.35);z-index:999;display:none;';
    el.addEventListener('click', ()=>{
      try{ apply(true); }catch(e){ /* noop */ }
    });
    document.body.appendChild(el);
    return el;
  };

  const setBackdropVisible = (visible) => {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    const el = ensureBackdrop();
    if (!isMobile) {
      el.style.display = 'none';
      return;
    }
    el.style.display = visible ? 'block' : 'none';
  };

  const apply = (collapsed) => {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      root.classList.toggle('sidebar-mobile-open', !collapsed);
      try{ setBackdropVisible(!collapsed); }catch(e){ /* noop */ }
      return;
    }

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
    const isCollapsed = root.classList.contains('sidebar-collapsed');
    apply(!isCollapsed);
  });

  if (logo) {
    logo.addEventListener('click', (e)=>{
      e.preventDefault();
      const isCollapsed = root.classList.contains('sidebar-collapsed');
      apply(!isCollapsed);
    });
  }

  if (mobileBtn) {
    mobileBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      apply(false);
    });
  }

  try{
    const mqlDesktop = window.matchMedia('(min-width: 769px)');
    const onChange = () => {
      const isDesktop = mqlDesktop.matches;
      if (isDesktop) {
        root.classList.remove('sidebar-mobile-open');
        setBackdropVisible(false);
        btn.style.display = '';
        apply(getStored());
      } else {
        root.classList.add('sidebar-collapsed');
        root.classList.remove('sidebar-mobile-open');
        setBackdropVisible(false);
      }
    };
    if (mqlDesktop.addEventListener) mqlDesktop.addEventListener('change', onChange);
    else if (mqlDesktop.addListener) mqlDesktop.addListener(onChange);
    onChange();
  }catch(e){ /* noop */ }
}

function navigateTo(page){
  const p = String(page || '').trim();
  if (!p) return;
  if (['overview','pulse','pulse-plans','pulse-hotspots','pulse-insights','pulse-survey','settings'].includes(p)) {
    switchTab(p);
    return;
  }
  showSection(p);
}

function initSidebarNavigation(){
  if (window.__sidebarNavInit) return;
  window.__sidebarNavInit = true;

  try{
    document.querySelectorAll('.sidebar [data-tab], .sidebar [data-section]').forEach(el => {
      if (el.hasAttribute('data-page')) return;
      const tab = el.getAttribute('data-tab');
      const section = el.getAttribute('data-section');
      const page = tab || section;
      if (page) el.setAttribute('data-page', page);
    });

    document.querySelectorAll('.sidebar [data-section][onclick]').forEach(el => {
      try{
        el.removeAttribute('onclick');
        el.onclick = null;
      }catch(e){ /* noop */ }
    });
  }catch(e){ /* noop */ }

  document.addEventListener('click', function(e) {
    const item = e.target.closest('[data-page]');
    if (!item) return;
    if (!item.closest('.sidebar')) return;
    const page = item.dataset.page;
    if (!page) return;
    e.preventDefault();
    try{
      const root = document.getElementById('app');
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
      if (root && isMobile) {
        root.classList.remove('sidebar-mobile-open');
        const backdrop = document.getElementById('sidebarBackdrop');
        if (backdrop) backdrop.style.display = 'none';
      }
    }catch(e2){ /* noop */ }
    navigateTo(page);
  });
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

    if (state.actions[t].selected === true) {
      const employeeId = String(key).split(':')[0];
      ;(async ()=>{
        try{
          const token = (await supabase.auth.getSession()).data?.session?.access_token;
          if (!token) return;
          const employeePlans = (window.__plansEmployeesList || []).find(e => String(e?.id || '') === String(employeeId))?.latest_action_plans || null;
          const score = Number(employeePlans?.burnout_score);
          await apiFetch('/api/pulse?action=record_action_taken', {
            method: 'POST',
            accessToken: token,
            body: {
              employee_id: employeeId,
              action_text: t,
              burnout_score_at_time: Number.isFinite(score) ? score : 0
            }
          });
        }catch(e){ /* noop */ }
      })();
    }
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
    { name: 'Sara Lee', weeklyHours: 74, weekendHours: 16, afterHoursMessages: 42, sickDays: 6, lastVacation: '2026-03-01' },
    { name: 'Alex Kim', weeklyHours: 54, weekendHours: 8, afterHoursMessages: 24, sickDays: 3, lastVacation: '2026-01-06' },
    { name: 'Maya Chen', weeklyHours: 51, weekendHours: 5, afterHoursMessages: 16, sickDays: 2, lastVacation: '2026-02-10' },
    { name: 'Omar Hassan', weeklyHours: 45, weekendHours: 3, afterHoursMessages: 10, sickDays: 1, lastVacation: '2026-03-11' }
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

function setAiBusy(btn, busyText){
  if (!btn) return () => {};
  if (!document.getElementById('aiBusyStyle')) {
    const st = document.createElement('style');
    st.id = 'aiBusyStyle';
    st.textContent = `
      @keyframes peopleraSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .peoplera-btn-spinner { display:inline-block; width:14px; height:14px; border:2px solid currentColor; border-right-color: transparent; border-radius:999px; animation: peopleraSpin 0.9s linear infinite; }
    `;
    document.head.appendChild(st);
  }

  const oldDisabled = btn.disabled;
  const oldOpacity = btn.style.opacity;
  const oldHtml = btn.innerHTML;

  btn.disabled = true;
  btn.style.opacity = '0.7';

  const label = String(busyText || 'Generating...');
  btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:10px;justify-content:center"><span class="peoplera-btn-spinner"></span><span>${escapeHtml(label)}</span></span>`;

  let noteEl = null;
  try{
    noteEl = btn.parentElement?.querySelector?.('[data-ai-wait-note="1"]') || null;
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.setAttribute('data-ai-wait-note', '1');
      noteEl.style.cssText = 'display:none;margin-top:8px;font-size:12px;color:#94a3b8;font-weight:700;';
      noteEl.textContent = 'This usually takes 10–20 seconds…';
      btn.insertAdjacentElement('afterend', noteEl);
    }
  }catch(e){ /* noop */ }

  const t = setTimeout(()=>{
    try{ if (noteEl) noteEl.style.display = 'block'; }catch(e){ /* noop */ }
  }, 3000);

  return () => {
    clearTimeout(t);
    try{ if (noteEl) noteEl.style.display = 'none'; }catch(e){ /* noop */ }
    btn.disabled = oldDisabled;
    btn.style.opacity = oldOpacity;
    btn.innerHTML = oldHtml;
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

  const summaryRows = [
    ['Metric', 'Value'],
    ['Burnout Score', `${Number(decision.score) || 0} / 100`],
    ['Risk Level', `${String(decision?.status?.label || '—')}`],
    ['Sick Leave Risk', `${String(decision?.sickLeaveRisk?.level || 'Low')} · ${Number(decision?.sickLeaveAffected) || 0} employee(s) potentially at risk (next ${Number(decision?.sickLeaveHorizonDays) || 30} days)`],
    ['Estimated Business Impact', `~${Number(decision?.productivityAtRiskWeekly || 0).toLocaleString()} / week at productivity risk · ${Number(decision?.sickLeaveExposureDays || 0)} sick-leave day(s) exposure (next 2–4 weeks)`]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 74 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const norm = {
    weeklyHours: (e) => Number(e?.weeklyHours || e?.weekly_hours || 0),
    afterHours: (e) => Number(e?.afterHoursMessages || e?.after_hours_messages || 0),
    sickDays: (e) => Number(e?.sickDays || e?.sick_days || 0)
  };
  const employeesRows = [
    ['Name', 'Weekly hours', 'Risk level', 'Key flags']
  ];
  for (const e of employees) {
    const weekly = norm.weeklyHours(e);
    const flags = [];
    if (weekly >= 55) flags.push('Overtime (55h+)');
    const lvl = String(e?.riskLevel || '').toLowerCase();
    if (lvl === 'high' || lvl === 'critical') flags.push('High risk');
    if (norm.afterHours(e) >= 10) flags.push('After-hours activity');
    if (norm.sickDays(e) >= 3) flags.push('Sick-leave signal');
    employeesRows.push([
      String(e?.name || ''),
      weekly || 0,
      String(e?.riskLevel || '—'),
      flags.join('; ')
    ]);
  }
  const wsEmployees = XLSX.utils.aoa_to_sheet(employeesRows);
  wsEmployees['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(wb, wsEmployees, 'Employees');

  const plansRows = [
    ['Plan name', 'Description', 'Action items', 'Timeframe']
  ];
  for (const p of plans) {
    const actionLines = (Array.isArray(p?.actions) ? p.actions : []).slice(0, 6).map(a => `- ${String(a || '').trim()}`).filter(Boolean).join('\n');
    plansRows.push([
      String(p?.title || ''),
      String(p?.explanation || ''),
      actionLines,
      String(p?.timeframe || '')
    ]);
  }
  const wsPlans = XLSX.utils.aoa_to_sheet(plansRows);
  wsPlans['!cols'] = [{ wch: 28 }, { wch: 64 }, { wch: 54 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsPlans, 'Action Plans');

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

function copyPlanToClipboard(plan){
  const p = plan || null;
  const title = String(p?.title || 'Action Plan');
  const timeframe = String(p?.timeframe || '').trim();
  const actions = (Array.isArray(p?.actions) ? p.actions : []).map(a => String(a || '').trim()).filter(Boolean);
  const text = [
    title,
    timeframe ? `Timeframe: ${timeframe}` : '',
    '',
    ...actions.map(a => `- ${a}`)
  ].filter(Boolean).join('\n');

  try{
    navigator.clipboard.writeText(text);
    showToast('Plan copied to clipboard');
  }catch(e){
    alert('Copy failed');
  }
}

function sendPlanToEmployee(plan){
  const p = plan || null;
  const planTitle = String(p?.title || 'Action Plan');
  const actions = (Array.isArray(p?.actions) ? p.actions : []).map(a => String(a || '').trim()).filter(Boolean);
  const items = actions.map(a => `- ${a}`).join('\n');

  const modal = document.createElement('div');
  modal.className = 'send-plan-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
      <div style="background:white;border-radius:12px;padding:32px;width:500px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
        <h3 style="margin:0 0 16px;font-size:1.2rem;">Send Plan: ${escapeHtml(planTitle)}</h3>
        <input type="email" placeholder="Send to (email address)" style="width:100%;padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:12px;font-size:0.9rem;box-sizing:border-box;">
        <textarea style="width:100%;height:160px;padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;font-size:0.9rem;box-sizing:border-box;resize:vertical;">${escapeHtml(planTitle)}\n\n${escapeHtml(items)}</textarea>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
          <button type="button" class="close-modal-btn" style="background:transparent;border:1px solid #e0e0e0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;">Close</button>
          <button type="button" class="copy-plan-modal-btn" style="background:#6366f1;border:none;border-radius:8px;padding:8px 14px;font-weight:800;color:white;cursor:pointer;">Copy</button>
        </div>
      </div>
    `;

  document.body.appendChild(modal);

  modal.addEventListener('click', (ev)=>{
    if (ev.target.closest('.close-modal-btn') || ev.target === modal) modal.remove();
    if (ev.target.closest('.copy-plan-modal-btn')) {
      const txt = modal.querySelector('textarea')?.value || '';
      navigator.clipboard.writeText(txt);
      ev.target.textContent = 'Copied!';
    }
  });
}

async function importEmployeesFromCsvRows(importRows){
  const rows = Array.isArray(importRows) ? importRows : [];
  if (!rows.length) {
    showToast('No employees found in CSV', 'error');
    return;
  }

  const toInsertEmployees = rows
    .filter(r => r && r.full_name)
    .map(r => ({
      user_id: session.user.id,
      full_name: r.full_name,
      job_title: r.job_title || null,
      start_date: r.start_date || null,
      birth_date: r.birth_date || null,
      last_vacation: r.last_vacation || null,
      email: r.email || null,
      is_demo: false
    }));

  const { data: inserted, error: empErr } = await supabase
    .from('employees')
    .upsert(toInsertEmployees, { onConflict: 'user_id, full_name' })
    .select();
  if (empErr) throw empErr;

  const monday = getCurrentMonday();
  const metricsPayload = [];

  for (let i = 0; i < inserted.length; i++) {
    const saved = inserted[i];
    const src = rows[i];
    if (!saved?.id || !src?.weekly) continue;
    metricsPayload.push({
      employee_id: saved.id,
      week_start: monday,
      weekly_hours: Number(src.weekly.weekly_hours || 0),
      weekend_hours: Number(src.weekly.weekend_hours || 0),
      after_hours_messages: Number(src.weekly.after_hours_messages || 0),
      sick_days: Number(src.weekly.sick_days || 0),
      overtime_hours: Math.max(0, Number(src.weekly.weekly_hours || 0) - 40)
    });
  }

  if (metricsPayload.length) {
    const { error: wkErr } = await supabase
      .from('weekly_metrics')
      .upsert(metricsPayload);
    if (wkErr) throw wkErr;
  }

  try{ writeJsonLocalStorage('peoplera_has_real_employee_data', true); }catch(e){ /* noop */ }

  showToast(`${inserted.length} employees imported successfully`);
  await loadPulseData();
}

function ensurePulseCsvTemplateLink(){
  const panel = document.getElementById('pulseCsvPanel');
  if (!panel) return;
  if (panel.querySelector('[data-csv-template-link="1"]')) return;

  const label = panel.querySelector('label');
  if (!label) return;

  const link = document.createElement('a');
  link.setAttribute('data-csv-template-link', '1');
  link.href = '#';
  link.textContent = 'Download CSV template';
  link.style.cssText = 'display:inline-block;margin-left:12px;font-size:12px;font-weight:900;color:#64748b;text-decoration:none;border-bottom:1px dashed rgba(100,116,139,0.55);';
  link.addEventListener('mouseenter', ()=>{ link.style.color = '#FF6B6B'; });
  link.addEventListener('mouseleave', ()=>{ link.style.color = '#64748b'; });
  link.addEventListener('click', (e)=>{
    e.preventDefault();
    const csv = [
      'name/naam,job_title/functie,start_date/startdatum,birth_date/geboortedatum,last_vacation/laatste_vakantie,email/emailadres,weekly_hours/werkuren,weekend_hours/weekenduren,after_hours_messages/buiten_uren,sick_days/ziekdagen',
      'Maya Chen,Product Designer,2021-07-01,1988-11-24,2025-02-10,maya.chen@acme.com,62,8,20,1',
      'Omar Hassan,Marketing Lead,2023-01-10,1995-03-08,2025-03-15,omar.hassan@acme.com,54,4,12,0'
    ].join('\n');
    try{ download('peoplera-employee-template.csv', csv, 'text/csv'); }catch(err){ /* noop */ }
  });

  label.appendChild(link);
}

function getDemoEmployeeIdSet(){
  const raw = readJsonLocalStorage('peoplera_demo_employee_ids', []);
  const ids = Array.isArray(raw) ? raw : [];
  return new Set(ids.map(String));
}

function isDemoEmployeesActive(){
  try{
    if (Array.isArray(window.__demoEmployees) && window.__demoEmployees.length > 0) return true;
    if (Array.isArray(employees) && employees.some(e => e?.is_demo === true)) return true;
    return false;
  }catch(e){ return false; }
}

function hasDemoActivatedThisSession(){
  try{
    return sessionStorage.getItem('peoplera_demo_session_active') === '1';
  }catch(e){
    return false;
  }
}

function setDemoActivatedThisSession(active){
  try{
    if (active) sessionStorage.setItem('peoplera_demo_session_active', '1');
    else sessionStorage.removeItem('peoplera_demo_session_active');
  }catch(e){ /* noop */ }
}

function countDemoAndRealEmployees(list){
  const arr = Array.isArray(list) ? list : [];
  let demoCount = 0;
  let realCount = 0;
  for (const e of arr) {
    if (!e) continue;
    if (e.is_demo === true) demoCount++;
    else realCount++;
  }
  return { demoCount, realCount };
}

async function clearDemoData(){
  const btn = document.getElementById('btnClearDemoData');
  const origText = btn ? btn.textContent : '';
  try{
    if (!confirm('Clear demo data?')) return;
    if (btn) {
      btn.textContent = 'Clearing...';
      btn.disabled = true;
    }

    try{
      const s = (await supabase.auth.getSession()).data?.session;
      if (s?.user?.id) {
        const { data: demoRows } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', s.user.id)
          .eq('is_demo', true);

        const ids = (demoRows || []).map(r => r?.id).filter(Boolean);
        if (ids.length) {
          try{ await supabase.from('weekly_metrics').delete().in('employee_id', ids); }catch(e){ /* noop */ }
          try{ await supabase.from('pulse_results').delete().eq('user_id', s.user.id); }catch(e){ /* noop */ }
          await supabase.from('employees').delete().in('id', ids);
        }
      }
    }catch(e){ /* noop */ }

    window.__demoEmployees = [];
    employees = [];
    weeklyData = {};
    window.__lastPulseEmployees = [];
    window.__lastActionPlans = [];
    window.__lastDecisionEngine = null;
    window.__plansEmployeesList = [];
    setDemoActivatedThisSession(false);
    try{ writeJsonLocalStorage('peoplera_active_employees_count', 0); }catch(e){ /* noop */ }
    try{ writeJsonLocalStorage('peoplera_demo_employee_ids', []); }catch(e){ /* noop */ }
    try{ localStorage.removeItem('peoplera_team_hotspots'); }catch(e){ /* noop */ }
    try{ localStorage.removeItem('peoplera_action_plans'); }catch(e){ /* noop */ }
    try{ localStorage.removeItem('peoplera_ai_insights_cache'); }catch(e){ /* noop */ }
    try{ localStorage.removeItem('peoplera_ai_insights'); }catch(e){ /* noop */ }

    try{ hideDemoBanner(); }catch(e){ /* noop */ }
    try{ updateSidebarStatusCard(); }catch(e){ /* noop */ }
    try{ renderEmployees(); }catch(e){ /* noop */ }
    try{ updateSectionsVisibility(); }catch(e){ /* noop */ }
    try{ populateOverviewFromEmployees([]); }catch(e){ /* noop */ }
    try{ applyDemoRealDataUi(); }catch(e){ /* noop */ }
    try{ applyPulseActionButtonsUi({ connected: false }); }catch(e){ /* noop */ }
  }catch(e){
    console.error('clearDemoData error:', e);
    showToast('Unable to clear demo data', 'error');
  }finally{
    if (btn) {
      btn.textContent = origText || 'Clear demo data';
      btn.disabled = false;
    }
  }
}

function applyDemoRealDataUi(){
  const btnTry = document.getElementById('btnTryDemoData');
  const btnClear = document.getElementById('btnClearDemoData');

  if (btnTry && !btnTry.getAttribute('data-bound')) {
    btnTry.setAttribute('data-bound', '1');
    btnTry.addEventListener('click', (e)=>{ e.preventDefault(); loadDemoData(); });
  }

  const demoActive = isDemoEmployeesActive();
  const count = Number(employees?.length || 0);
  // Show "Try demo" only when no employees and demo is not active
  if (btnTry) btnTry.style.display = (count === 0 && !demoActive) ? '' : 'none';
  // Always hide Clear button in toolbar — clearing is only via banner "Reset demo"
  if (btnClear) btnClear.style.display = 'none';
}

function ensureTryDemoButton(){
  try{
    if (document.getElementById('btnTryDemoData')) return;

    const host = document.getElementById('your-team-header')
      || document.getElementById('yourTeamHeader')
      || document.querySelector('#your-team-header')
      || document.querySelector('#yourTeamHeader')
      || document.querySelector('.your-team-header')
      || document.body;

    const wrap = document.createElement('div');
    wrap.setAttribute('data-demo-controls', '1');
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-left:auto;';

    const btnTry = document.createElement('button');
    btnTry.id = 'btnTryDemoData';
    btnTry.type = 'button';
    btnTry.textContent = 'Try Demo';
    btnTry.style.cssText = 'background:#6366f1;color:#fff;border:none;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer;box-shadow:0 10px 26px rgba(99,102,241,0.22);';
    btnTry.addEventListener('click', (e)=>{ e.preventDefault(); loadDemoData(); });

    wrap.appendChild(btnTry);

    if (host && host !== document.body) {
      host.appendChild(wrap);
    } else {
      const app = document.getElementById('app') || document.body;
      wrap.style.cssText += 'margin:14px 0;';
      app.insertAdjacentElement('afterbegin', wrap);
    }
  }catch(e){ /* noop */ }
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

async function apiFetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await apiFetch(url, options);
      return result;
    } catch (err) {
      const msg = String(err?.message || '');
      const isRateLimit = msg.includes('Too many requests') || msg.includes('429');
      if (isRateLimit && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
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
    const tableMap = { hire: 'hire_results', board: 'board_results', pulse: 'pulse_results' };
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

  try{

    if (type === 'pulse') {
      const emps = Array.isArray(item.employees) ? item.employees : [];
      renderPulse(emps);
      window.__lastPulseEmployees = emps;
      const el = document.getElementById('statAtRisk');
      if (el) el.textContent = String(item.at_risk_count || 0);
      try{ renderWorkforceInsights(); }catch(e){ /* noop */ }
      return;
    }
  }catch(e){
    console.warn('loadHistoryItem failed', e);
  }
}

function bindOverviewBurnoutCta(){
  const el = document.getElementById('overviewBurnoutCta');
  if (!el || el.getAttribute('data-bound')) return;
  el.setAttribute('data-bound', '1');
  el.addEventListener('click', (e)=>{
    e.preventDefault();
    try{ switchTab('pulse'); }catch(err){ /* noop */ }
  });
}

function setOverviewTrend(elTrend, elBadge, delta){
  const trendEl = document.getElementById(elTrend);
  const badgeEl = document.getElementById(elBadge);
  if (!trendEl || !badgeEl) return;

  if (!Number.isFinite(delta)) {
    trendEl.textContent = '—';
    return;
  }

  if (delta > 0) {
    trendEl.textContent = `↑ ${Math.abs(delta)}`;
    badgeEl.textContent = 'Up';
    badgeEl.style.background = 'rgba(255,179,71,0.12)';
    badgeEl.style.borderColor = 'rgba(255,179,71,0.28)';
    badgeEl.style.color = '#FFB347';
  } else if (delta < 0) {
    trendEl.textContent = `↓ ${Math.abs(delta)}`;
    badgeEl.textContent = 'Down';
    badgeEl.style.background = 'rgba(0,184,148,0.10)';
    badgeEl.style.borderColor = 'rgba(0,184,148,0.22)';
    badgeEl.style.color = '#00b894';
  } else {
    trendEl.textContent = '—';
    badgeEl.textContent = 'Stable';
    badgeEl.style.background = 'rgba(148,163,184,0.12)';
    badgeEl.style.borderColor = 'rgba(148,163,184,0.22)';
    badgeEl.style.color = '#64748b';
  }
}

function updateOverviewStatTrends({ hireData, pulseData } = {}){
  // At-risk employees: compare last 2 pulse results
  try{
    const cur = pulseData && pulseData[0] ? Number(pulseData[0].at_risk_count || 0) : null;
    const prev = pulseData && pulseData[1] ? Number(pulseData[1].at_risk_count || 0) : null;
    if (cur != null && prev != null) setOverviewTrend('statAtRiskTrend', 'statAtRiskBadge', cur - prev);
  }catch(e){ /* noop */ }
}

async function loadOverviewWeeklyBurnoutSummary(sessionObj){
  const out = document.getElementById('overviewMiniChart');
  const deltaEl = document.getElementById('overviewBurnoutDelta');
  if (!out) return;

  const s = sessionObj || (await supabase.auth.getSession()).data?.session;
  if (!s) return;

  try{ await renderOverviewIntegrationOnboarding(s); }catch(e){ /* noop */ }
  const chartPanel = document.getElementById('overviewWeeklyBurnoutPanel');
  if (chartPanel && chartPanel.style.display === 'none') {
    if (deltaEl) deltaEl.textContent = '—';
    return;
  }

  const { data: empRows, error: empErr } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', s.user.id);
  if (empErr) throw empErr;
  const empIds = (empRows || []).map(r => r.id).filter(Boolean);

  const chartEmpty = document.getElementById('overviewChartEmptyState');

  if (!empIds.length) {
    out.innerHTML = '';
    out.style.display = 'none';
    if (chartEmpty) chartEmpty.style.display = 'block';
    if (deltaEl) deltaEl.textContent = '—';
    return;
  }

  const monday = getCurrentMonday();
  const fiveWeeksAgo = new Date(String(monday) + 'T00:00:00');
  fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - (7 * 4));

  const { data: rows, error: metricsErr } = await supabase
    .from('weekly_metrics')
    .select('*')
    .in('employee_id', empIds)
    .gte('week_start', formatDateYmd(fiveWeeksAgo));
  if (metricsErr) throw metricsErr;

  const buckets = {};
  for (const r of (rows || [])) {
    const wk = String(r.week_start || '').trim();
    if (!wk) continue;
    if (!buckets[wk]) buckets[wk] = [];
    buckets[wk].push(r);
  }

  const weeks = Object.keys(buckets).sort().slice(-5);
  if (!weeks.length) {
    out.innerHTML = '';
    out.style.display = 'none';
    if (chartEmpty) chartEmpty.style.display = 'block';
    if (deltaEl) deltaEl.textContent = '—';
    return;
  }

  // Has data — show chart, hide empty state
  out.style.display = 'flex';
  if (chartEmpty) chartEmpty.style.display = 'none';

  const series = weeks.map(wk => {
    const scores = (buckets[wk] || []).map(m => computeBurnoutScoreFromSignals({
      weeklyHours: Number(m.weekly_hours || 0),
      weekendHours: Number(m.weekend_hours || 0),
      afterHoursMessages: Number(m.after_hours_messages || 0),
      sickDays: Number(m.sick_days || 0),
      overtimeHours: Number(m.overtime_hours || Math.max(0, Number(m.weekly_hours || 0) - 40))
    }));
    const avg = scores.length ? (scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
    return { week: wk, avg: Math.round(avg) };
  });

  const maxVal = Math.max(60, ...series.map(s=>Number(s.avg)||0));
  out.innerHTML = series.map((p, idx) => {
    const h = Math.max(6, Math.round((Number(p.avg || 0) / maxVal) * 64));
    const color = (p.avg >= 80) ? '#FF6B4A' : (p.avg >= 60) ? '#F97316' : (p.avg >= 35) ? '#FFB347' : '#00b894';
    const labelDt = new Date(String(p.week) + 'T00:00:00');
    const label = Number.isNaN(labelDt.getTime())
      ? String(p.week)
      : labelDt.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    return `
      <div style="flex:1;min-width:0">
        <div title="${escapeHtml(label)} · ${escapeHtml(String(p.avg))}/100" style="height:${h}px;background:${color};border-radius:10px 10px 6px 6px;border:1px solid rgba(0,0,0,0.06)"></div>
        <div style="margin-top:6px;font-size:10px;font-weight:800;color:#94a3b8;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(label)}</div>
      </div>
    `;
  }).join('');

  if (deltaEl) {
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    if (last && prev) {
      const delta = Number(last.avg) - Number(prev.avg);
      const sign = delta > 0 ? '↑' : delta < 0 ? '↓' : '—';
      const color = delta > 0 ? '#FF6B4A' : delta < 0 ? '#00b894' : '#64748b';
      deltaEl.style.color = color;
      deltaEl.textContent = `${sign} ${Math.abs(delta)} vs last week`;
    } else {
      deltaEl.textContent = '—';
    }
  }
}


async function loadHistory(){
  try{
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;

    const pulseHistory = await loadPulseHistoryFromPulseResults(5);
    if (pulseHistory && pulseHistory.length) {
      renderHistory('pulseHistory', pulseHistory, 'pulse');
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
  }catch(e){
    console.warn('loadHistory failed', e);
  }
}


async function clearPulse(){
  setPulseDemoActive(false);
  document.getElementById('pulseOut').innerHTML = '';
  document.getElementById('statAtRisk').textContent = '\u2014';
  window.__lastDecisionEngine = null;
  window.__lastActionPlans = null;
  updateNavBurnoutBadge(null);
  const exportBtn = document.getElementById('btnExportPulseXlsx');
  if (exportBtn) exportBtn.disabled = true;
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;
    const pulseData = await loadPulseHistoryFromPulseResults(5);
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

function hideRecentActivitySection(){
  try{
    const feedList = document.getElementById('feedList') || document.getElementById('feed');
    const panel = feedList ? feedList.closest('.panel') : null;
    if (panel) panel.remove();
  }catch(e){ /* noop */ }
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

    const emailEl = document.getElementById('settingsEmail');
    if (emailEl) emailEl.textContent = userEmail || '—';

    const memberSinceEl = document.getElementById('settingsMemberSince');
    if (memberSinceEl) memberSinceEl.textContent = memberSince || '—';

    const avatarEl = document.getElementById('settingsAvatar');
    try{
      const avatarUrl = u?.user_metadata?.avatar_url || u?.user_metadata?.picture || '';
      if (avatarEl && avatarUrl) avatarEl.src = avatarUrl;
    }catch(e){ /* noop */ }

    // Ensure there's a logout button inside Settings (optional safety in case markup is missing)
    const settingsSection = document.getElementById('tab-settings');
    if (settingsSection && !settingsSection.querySelector('#btnLogoutSettings')) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:16px;display:flex;justify-content:flex-end;';
      wrap.innerHTML = `<button id="btnLogoutSettings" type="button" style="background:rgba(255,107,74,0.10);border:1px solid rgba(255,107,74,0.28);border-radius:12px;padding:10px 14px;font-weight:900;color:#FF6B4A;cursor:pointer">Sign Out</button>`;
      settingsSection.appendChild(wrap);

      const btn = wrap.querySelector('#btnLogoutSettings');
      btn?.addEventListener('click', async ()=>{
        const reset = setBusy(btn, 'Signing out…');
        try{ await logout(); }
        finally{ reset(); }
      });
    }

    try{ await ensureSettingsIntegrationsUiLoaded(s); }catch(e){ /* noop */ }
  } catch(e) {
    console.warn('loadSettings error:', e);
  }
}

function formatDdMmYyyyHhMm(dt){
  if (!dt) return '—';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2,'0');
  const min = String(d.getMinutes()).padStart(2,'0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

const INTEGRATION_PROVIDERS = {
  personio: {
    key: 'personio',
    name: 'Personio',
    desc: 'Sync employees and time signals from Personio.',
    docsUrl: 'https://developer.personio.de/docs/getting-started'
  },
  afas: {
    key: 'afas',
    name: 'AFAS',
    desc: 'Connect your AFAS workspace to sync employees.',
    docsUrl: 'https://help.afas.nl/'
  },
  nmbrs: {
    key: 'nmbrs',
    name: 'Nmbrs',
    desc: 'Sync employee profiles from Nmbrs.',
    docsUrl: 'https://support.nmbrs.com/'
  },
  hibob: {
    key: 'hibob',
    name: 'HiBob',
    desc: 'Sync employees and time signals from HiBob.',
    docsUrl: 'https://apidocs.hibob.com/'
  }
};

function humanLastSynced(ts){
  if (!ts) return '—';
  const dt = (ts instanceof Date) ? ts : new Date(ts);
  if (!Number.isFinite(dt.getTime())) return '—';
  const diffMs = Date.now() - dt.getTime();
  if (diffMs >= 0 && diffMs < 2 * 60 * 1000) return 'just now';
  return formatDdMmYyyyHhMm(dt);
}

async function getIntegrationCredentialsForUser(sessionObj){
  const s = sessionObj || (await supabase.auth.getSession()).data?.session;
  if (!s) return [];
  const { data, error } = await supabase
    .from('integration_credentials')
    .select('*')
    .eq('user_id', s.user.id)
    .order('connected_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function setIntegrationCredentialInactive(integrationName, sessionObj){
  const s = sessionObj || (await supabase.auth.getSession()).data?.session;
  if (!s) throw new Error('Not signed in');

  const name = String(integrationName || '').trim();
  if (!name) throw new Error('Missing integration name');

  const { error } = await supabase
    .from('integration_credentials')
    .update({ is_active: false })
    .eq('user_id', s.user.id)
    .eq('integration_name', name)
    .eq('is_active', true);
  if (error) throw error;
}

async function getIntegrationsForUser(sessionObj){
  const s = sessionObj || (await supabase.auth.getSession()).data?.session;
  if (!s) return [];
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', s.user.id);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function getConnectedIntegration(sessionObj){
  const rows = await getIntegrationsForUser(sessionObj);
  return rows.find(r => String(r?.status || '').toLowerCase() === 'connected') || null;
}

function openSettingsSubtab(which){
  const paneProfile = document.getElementById('settingsProfilePane');
  const paneInt = document.getElementById('settingsIntegrationsPane');
  const btnProfile = document.getElementById('btnSettingsTabProfile');
  const btnInt = document.getElementById('btnSettingsTabIntegrations');
  if (!paneProfile || !paneInt || !btnProfile || !btnInt) return;

  const showIntegrations = String(which || '').toLowerCase() === 'integrations';
  paneProfile.style.display = showIntegrations ? 'none' : 'grid';
  paneInt.style.display = showIntegrations ? 'block' : 'none';

  btnProfile.style.background = showIntegrations ? 'transparent' : 'rgba(0,0,0,0.04)';
  btnProfile.style.color = showIntegrations ? '#64748b' : '#0f172a';
  btnInt.style.background = showIntegrations ? 'rgba(0,0,0,0.04)' : 'transparent';
  btnInt.style.color = showIntegrations ? '#0f172a' : '#64748b';
}

async function ensureSettingsIntegrationsUiLoaded(sessionObj){
  const grid = document.getElementById('integrationsGrid');
  if (!grid) return;

  const s = sessionObj || (await supabase.auth.getSession()).data?.session;
  if (!s) return;

  let rows = [];
  try{ rows = await getIntegrationCredentialsForUser(s); }catch(e){ rows = []; }
  const byProvider = {};
  for (const r of (rows || [])) {
    const k = String(r?.integration_name || '').toLowerCase();
    if (k && r?.is_active === true) byProvider[k] = r;
  }

  const card = (p) => {
    const row = byProvider[p.key] || null;
    const isConnected = !!row;
    const lastSynced = row?.connected_at ? humanLastSynced(row.connected_at) : '—';

    let html = '';
    html += `<div data-provider="${escapeHtml(p.key)}" style="background:rgba(255,255,255,0.92);border:1px solid rgba(0,0,0,0.10);border-radius:16px;padding:16px;min-width:0">`;
    html += `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">`;
    html += `<div style="display:flex;gap:12px;min-width:0">`;
    html += `<div style="width:42px;height:42px;border-radius:14px;background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.08);display:grid;place-items:center;font-weight:900;color:#64748b;flex-shrink:0">${escapeHtml(p.name.slice(0,2).toUpperCase())}</div>`;
    html += `<div style="min-width:0">`;
    html += `<div style="font-weight:900;color:#0f172a">${escapeHtml(p.name)}</div>`;
    html += `<div style="margin-top:4px;font-size:12px;color:#64748b;font-weight:700">${escapeHtml(p.desc)}</div>`;
    html += `</div>`;
    html += `</div>`;

    if (isConnected) {
      html += `<span style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.35);color:#16a34a;border-radius:999px;padding:6px 10px;font-size:10px;font-weight:900;white-space:nowrap">Connected ✓</span>`;
    } else {
      html += `<span style="background:rgba(148,163,184,0.10);border:1px solid rgba(148,163,184,0.22);color:#64748b;border-radius:999px;padding:6px 10px;font-size:10px;font-weight:900;white-space:nowrap">Not connected</span>`;
    }
    html += `</div>`;

    if (isConnected) {
      html += `<div style="margin-top:10px;font-size:12px;color:#64748b;font-weight:800">Last synced: ${escapeHtml(lastSynced)}</div>`;
    }

    html += `<div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">`;
    html += `<span style="font-size:12px;color:#94a3b8;font-weight:800">API key required to sync employees</span>`;

    html += `<div style="display:flex;gap:8px">`;
    if (isConnected) {
      html += `<button type="button" class="integration-disconnect-btn" data-provider="${escapeHtml(p.key)}" style="background:transparent;border:1px solid rgba(255,107,107,0.45);border-radius:12px;padding:10px 12px;font-size:12px;font-weight:900;color:#FF6B6B;cursor:pointer">Disconnect</button>`;
    } else {
      html += `<button type="button" class="integration-connect-btn" data-provider="${escapeHtml(p.key)}" style="background:linear-gradient(90deg,#FF6B6B,#FFD93D);border:none;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:900;color:#0f172a;cursor:pointer">Connect</button>`;
    }
    html += `</div>`;
    html += `</div>`;

    html += `</div>`;
    return html;
  };

  const providers = Object.values(INTEGRATION_PROVIDERS);
  grid.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
      ${providers.map(card).join('')}
    </div>
  `;
}

function openIntegrationConnectModal(providerKey, existingRow){
  const pk = String(providerKey || '').toLowerCase();
  const meta = INTEGRATION_PROVIDERS[pk];
  if (!meta) return;

  const row = existingRow || null;
  const tokenVal = String(row?.api_key || '');

  const modal = document.createElement('div');
  modal.setAttribute('data-integration-modal', '1');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;';
  modal.innerHTML = `
    <div style="width:520px;max-width:92vw;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.25);padding:18px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div>
          <div style="font-family:'Syne',system-ui;font-weight:900;font-size:18px;color:#0f172a">Connect ${escapeHtml(meta.name)}</div>
          <div style="margin-top:6px;font-size:12px;color:#64748b;font-weight:700">Enter your API key to sync employee data automatically.</div>
        </div>
        <button type="button" class="integration-modal-close" style="width:34px;height:34px;border-radius:12px;background:transparent;border:1px solid rgba(0,0,0,0.10);cursor:pointer;font-weight:900;color:#64748b">×</button>
      </div>

      <div style="margin-top:14px;display:grid;gap:10px">
        <div>
          <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-bottom:6px">API Key</div>
          <input id="integrationApiKey" type="password" value="${escapeHtml(tokenVal)}" placeholder="Paste your API key here" style="width:100%;padding:10px 12px;border:1px solid rgba(0,0,0,0.14);border-radius:12px;font-size:13px;font-weight:800;color:#0f172a;box-sizing:border-box" />
          <div id="integrationModalError" style="display:none;margin-top:8px;font-size:12px;color:#ef4444;font-weight:800"></div>
        </div>

        <a href="${escapeHtml(meta.docsUrl)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:900;color:#FF6B4A;text-decoration:none">Where do I find my API key? →</a>

        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:6px">
          <button type="button" class="integration-modal-cancel" style="background:transparent;border:1px solid rgba(0,0,0,0.14);border-radius:12px;padding:10px 12px;font-size:12px;font-weight:900;color:#64748b;cursor:pointer">Cancel</button>
          <button type="button" class="integration-save-btn" data-provider="${escapeHtml(pk)}" style="background:#F97316;border:none;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:900;color:#ffffff;cursor:pointer">Save & Connect</button>
        </div>
      </div>
    </div>
  `;

  const onKeyDown = (ev)=>{
    if (ev && ev.key === 'Escape') {
      modal.remove();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  modal.addEventListener('remove', ()=>{
    document.removeEventListener('keydown', onKeyDown);
  });

  modal.addEventListener('click', (e)=>{
    if (e.target === modal || e.target.closest('.integration-modal-close') || e.target.closest('.integration-modal-cancel')) {
      modal.remove();
      return;
    }
  });

  document.body.appendChild(modal);
}

async function saveIntegrationFromModal(providerKey, modalEl){
  const pk = String(providerKey || '').toLowerCase();
  const s = (await supabase.auth.getSession()).data?.session;
  if (!s) throw new Error('Not signed in');

  const apiKey = String(modalEl?.querySelector('#integrationApiKey')?.value || '').trim();
  if (!apiKey) throw new Error('API Key is required');

  const payload = {
    user_id: s.user.id,
    integration_name: pk,
    api_key: apiKey,
    connected_at: new Date().toISOString(),
    is_active: true
  };

  const { error } = await supabase
    .from('integration_credentials')
    .insert(payload);
  if (error) throw error;

  showToast('Integration saved', 'success');
}

async function disconnectIntegration(providerKey){
  const pk = String(providerKey || '').toLowerCase();
  await setIntegrationCredentialInactive(pk);
  showToast('Disconnected', 'success');
}

async function testIntegrationConnection(providerKey){
  const pk = String(providerKey || '').toLowerCase();
  const s = (await supabase.auth.getSession()).data?.session;
  if (!s) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', s.user.id)
    .eq('provider', pk)
    .maybeSingle();
  if (error) throw error;
  const token = String(data?.api_token || '').trim();

  if (pk === 'hibob') {
    if (!token) throw new Error('No API token saved');
    const res = await fetch('https://api.hibob.com/v1/people', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HiBob test failed (${res.status})`);
    return true;
  }

  if (pk === 'afas' || pk === 'nmbrs') {
    throw new Error('Test connection not implemented for this provider yet');
  }

  if (pk === 'manual') {
    return true;
  }

  throw new Error('Unknown provider');
}

async function syncHiBob(userId){
  const s = (await supabase.auth.getSession()).data?.session;
  if (!s) throw new Error('Not signed in');
  const uid = userId || s.user.id;

  const fail = async (err)=>{
    try{
      await supabase
        .from('integrations')
        .update({ status: 'error' })
        .eq('user_id', uid)
        .eq('provider', 'hibob');
    }catch(e){ /* noop */ }
    const msg = err?.message ? String(err.message) : 'HiBob sync failed';
    showToast(msg, 'error');
    throw err;
  };

  try{
    const { data: integration, error: integErr } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', uid)
      .eq('provider', 'hibob')
      .maybeSingle();
    if (integErr) throw integErr;
    const token = String(integration?.api_token || '').trim();
    if (!token) throw new Error('HiBob API token not found');

    const peopleRes = await fetch('https://api.hibob.com/v1/people', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!peopleRes.ok) throw new Error(`HiBob people request failed (${peopleRes.status})`);
    const peopleJson = await peopleRes.json();
    const people = Array.isArray(peopleJson?.employees) ? peopleJson.employees : (Array.isArray(peopleJson) ? peopleJson : []);

    const employeesPayload = people
      .map(p => {
        const email = String(p?.email || p?.work?.email || '').trim();
        const fullName = String(p?.displayName || p?.fullName || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || '').trim();
        const jobTitle = String(p?.title || p?.jobTitle || '').trim();
        const startDate = p?.startDate || p?.employment?.startDate || null;
        if (!email || !fullName) return null;
        return {
          user_id: uid,
          full_name: fullName,
          job_title: jobTitle || null,
          start_date: startDate || null,
          email,
          is_demo: false
        };
      })
      .filter(Boolean);

    if (!employeesPayload.length) throw new Error('No employees returned from HiBob');

    const { data: upsertedEmployees, error: empUpErr } = await supabase
      .from('employees')
      .upsert(employeesPayload, { onConflict: 'email' })
      .select('id, email');
    if (empUpErr) throw empUpErr;

    const employeeIdByEmail = {};
    for (const e of (upsertedEmployees || [])) {
      const em = String(e?.email || '').trim().toLowerCase();
      if (em && e?.id) employeeIdByEmail[em] = e.id;
    }

    const weekStart = getCurrentMonday();
    const metricsPayload = [];
    for (const p of people) {
      const email = String(p?.email || p?.work?.email || '').trim().toLowerCase();
      const empId = employeeIdByEmail[email];
      if (!empId) continue;

      const hibobEmpId = String(p?.id || p?.employeeId || '').trim();
      if (!hibobEmpId) continue;

      let weeklyHours = null;
      try{
        const attRes = await fetch(`https://api.hibob.com/v1/attendances/employees/${encodeURIComponent(hibobEmpId)}/summarized-daily-report`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (attRes.ok) {
          const attJson = await attRes.json();
          const raw = attJson?.totalHours ?? attJson?.total_hours ?? attJson?.hours ?? null;
          const num = raw == null ? null : Number(raw);
          if (Number.isFinite(num)) weeklyHours = num;
        }
      }catch(e){ /* ignore per employee */ }

      if (weeklyHours == null) continue;

      metricsPayload.push({
        employee_id: empId,
        week_start: weekStart,
        weekly_hours: weeklyHours
      });
    }

    if (metricsPayload.length) {
      const { error: wkErr } = await supabase
        .from('weekly_metrics')
        .upsert(metricsPayload);
      if (wkErr) throw wkErr;
    }

    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase
      .from('integrations')
      .update({ last_synced: nowIso, status: 'connected' })
      .eq('user_id', uid)
      .eq('provider', 'hibob');
    if (upErr) throw upErr;

    showToast('HiBob sync completed', 'success');
    try{ await ensureSettingsIntegrationsUiLoaded(s); }catch(e){ /* noop */ }
    try{ await updateBurnoutIntegrationIndicator(); }catch(e){ /* noop */ }
    try{ await loadOverviewWeeklyBurnoutSummary(s); }catch(e){ /* noop */ }
  }catch(err){
    await fail(err);
  }
}

async function renderOverviewIntegrationOnboarding(sessionObj){
  const host = document.getElementById('overviewIntegrationOnboarding');
  const chartPanel = document.getElementById('overviewWeeklyBurnoutPanel');
  if (!host || !chartPanel) return;

  const s = sessionObj || (await supabase.auth.getSession()).data?.session;
  if (!s) return;

  let connected = null;
  try{
    const rows = await getIntegrationCredentialsForUser(s);
    connected = (rows || []).find(r => r && r.is_active === true) || null;
  }catch(e){
    connected = null;
  }

  const { data: empRows, error: empErr } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', s.user.id)
    .limit(1);
  if (empErr) throw empErr;
  const hasEmployees = Array.isArray(empRows) && empRows.length > 0;

  if (hasEmployees) {
    host.innerHTML = '';
    chartPanel.style.display = '';
    return;
  }

  if (connected) {
    host.innerHTML = '';
    chartPanel.style.display = '';
    return;
  }

  chartPanel.style.display = 'none';
  const step1 = false;
  const step2 = false;
  const step3 = false;

  host.innerHTML = `
    <div class="panel" style="padding:16px;border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.86)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900;font-size:14px;color:#0f172a">Get started in 3 steps</div>
          <div style="margin-top:4px;font-size:12px;color:#64748b;font-weight:700">Connect your HR system to begin syncing employees automatically.</div>
        </div>
        <div style="font-size:12px;font-weight:900;color:#64748b">Step 0/3</div>
      </div>

      <div style="margin-top:12px;display:grid;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px;background:rgba(255,255,255,0.8)">
          <div style="font-weight:900;color:#0f172a">1) Connect your HR system (HiBob, AFAS, or Nmbrs)</div>
          <a href="#" id="overviewConnectIntegrationLink" style="font-weight:900;color:#FF6B4A;text-decoration:none">Connect now →</a>
        </div>
        <div style="border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:12px;background:rgba(0,0,0,0.02);color:#94a3b8;font-weight:900">2) Your employees sync automatically</div>
        <div style="border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:12px;background:rgba(0,0,0,0.02);color:#94a3b8;font-weight:900">3) View burnout scores and take action</div>
      </div>
    </div>
  `;

  const link = host.querySelector('#overviewConnectIntegrationLink');
  if (link && !link.getAttribute('data-bound')) {
    link.setAttribute('data-bound', '1');
    link.addEventListener('click', (e)=>{
      e.preventDefault();
      try{ switchTab('settings'); }catch(err){ /* noop */ }
      setTimeout(()=>{
        try{ openSettingsSubtab('integrations'); }catch(err){ /* noop */ }
      }, 50);
    });
  }
}

async function updateBurnoutIntegrationIndicator(){
  const el = document.getElementById('integrationSyncIndicator');
  const btn = document.getElementById('btnIntegrationSyncNow');
  if (!el || !btn) return;

  const s = (await supabase.auth.getSession()).data?.session;
  if (!s) return;

  let connected = null;
  try{
    const rows = await getIntegrationCredentialsForUser(s);
    connected = (rows || []).find(r => r && r.is_active === true) || null;
  }catch(e){
    connected = null;
  }

  if (!connected) {
    btn.style.display = 'none';
    el.textContent = '';
    try{ applyPulseActionButtonsUi({ connected: null }); }catch(e){ /* noop */ }
    return;
  }

  const providerKey = String(connected.integration_name || '').toLowerCase();
  const providerName = INTEGRATION_PROVIDERS[providerKey]?.name || String(connected.integration_name || '');
  btn.style.display = 'inline-flex';
  btn.setAttribute('data-provider', String(providerKey || ''));

  try{
    applyPulseActionButtonsUi({
      connected,
      providerName,
      lastSyncedTs: connected.connected_at || null
    });
  }catch(e){ /* noop */ }
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

    applyHardcodedDemoScores(mergedEmployees);

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

  try{
    ensureBurnoutMainContainerId();
    const mainBurnout = document.getElementById('burnout-main-container') || document.getElementById('burnoutMainSections');
    if (mainBurnout) {
      const hide = (tab === 'pulse-plans' || tab === 'pulse-hotspots' || tab === 'pulse-insights');
      if (hide) {
        document.querySelectorAll('.burnout-section').forEach(el => {
          el.style.display = 'none';
          el.style.height = '0';
          el.style.overflow = 'hidden';
          el.style.margin = '0';
          el.style.padding = '0';
          el.style.border = 'none';
        });
        try{ window.scrollTo(0, 0); }catch(e){ /* noop */ }
      } else {
        document.querySelectorAll('.burnout-section').forEach(el => {
          el.style.display = '';
          el.style.height = '';
          el.style.overflow = '';
          el.style.margin = '';
          el.style.padding = '';
          el.style.border = '';
        });
      }
    }
  }catch(e){ /* noop */ }

  const titleMap = {
    overview: 'Overview',
    pulse: 'Burnout Intelligence',
    'pulse-plans': 'Strategic Action Plans',
    'pulse-hotspots': 'Team Hotspots',
    'pulse-insights': 'AI Insights',
    'pulse-survey': 'Pulse Survey',
    settings: 'Settings'
  };

  document.getElementById('pageTitle').textContent = titleMap[tab] || 'Dashboard';

  if (tab === 'settings') {
    loadSettings();
    try{
      const qs = new URLSearchParams(String(window.location.search || ''));
      const wanted = String(window.__settingsInitialSubtab || qs.get('tab') || 'profile').toLowerCase();
      openSettingsSubtab(wanted === 'integrations' ? 'integrations' : 'profile');
      if (wanted === 'integrations') {
        try{ ensureSettingsIntegrationsUiLoaded(); }catch(err){ /* noop */ }
      }
    }catch(e){
      try{ openSettingsSubtab('profile'); }catch(err){ /* noop */ }
    }
    try{ window.__settingsInitialSubtab = null; }catch(e){ /* noop */ }
  }

  if (tab === 'overview') {
    try{ populateOverviewFromEmployees(employees); }catch(e){ /* noop */ }
    try{
      if (isDemoEmployeesActive()) { showDemoBanner(); populateDemoOverviewChart(); }
      else { loadOverviewWeeklyBurnoutSummary(); }
    }catch(e){ /* noop */ }
  }

  if (tab === 'pulse') {
    updateNavBurnoutBadge(window.__lastDecisionEngine);
    restoreBurnoutMainContainer();
    loadPulseData();
    try{ updateBurnoutIntegrationIndicator(); }catch(e){ /* noop */ }
  }

  if (tab === 'pulse-plans') {
    updateNavBurnoutBadge(window.__lastDecisionEngine);
    ensureDemoDataLoaded().then(() => renderStrategicActionPlansPage());
  }

  if (tab === 'pulse-hotspots') {
    updateNavBurnoutBadge(window.__lastDecisionEngine);
    ensureDemoDataLoaded().then(() => renderTeamHotspotsPage());
  }

  if (tab === 'pulse-insights') {
    updateNavBurnoutBadge(window.__lastDecisionEngine);
    ensureDemoDataLoaded().then(() => renderAIInsightsPage());
  }

  if (tab === 'pulse-survey') {
    try{ loadSurveyResults(); }catch(e){ /* noop */ }
  }

  if (tab === 'pulse-plans' || tab === 'pulse-hotspots' || tab === 'pulse-insights' || tab === 'pulse-survey') {
    try{ window.scrollTo(0, 0); }catch(e){ /* noop */ }
    try{
      const main = document.querySelector('.main-content');
      if (main) main.scrollTop = 0;
    }catch(e){ /* noop */ }
  }
}

function showSection(section){
  if (['overview','pulse','pulse-plans','pulse-hotspots','pulse-insights','pulse-survey','settings'].includes(section)) {
    switchTab(section);
    return;
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
      const subRes = await fetch('/api/subscription?action=check', {
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

  const res = await fetch('/api/utils?action=public-config');
  const data = await readJsonSafe(res);
  if (!res.ok) throw new Error((data && data.error) ? data.error : 'Failed to load config');
  if (!data.supabaseUrl || !data.supabaseAnonKey) throw new Error('CONFIG_MISSING');

  try{
    if (!window.__supabaseFetchLogged && typeof window.fetch === 'function') {
      window.__supabaseFetchLogged = true;
      const supabaseUrl = String(data.supabaseUrl || '').replace(/\/$/, '');
      const origFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input || ''));
        const method = String((init && init.method) || 'GET').toUpperCase();
        const isSupabase = supabaseUrl && String(url || '').startsWith(supabaseUrl);

        if (isSupabase) {
          console.log('[supabase fetch] →', method, url);
        }

        try{
          const resp = await origFetch(input, init);
          if (isSupabase) {
            console.log('[supabase fetch] ←', method, url, 'status:', resp?.status);
          }
          return resp;
        }catch(err){
          if (isSupabase) {
            console.error('[supabase fetch] ✖', method, url, 'error:', err?.message || err);
          }
          throw err;
        }
      };
    }
  }catch(e){ /* noop */ }

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
      // Clear all demo artifacts on sign-out
      try{ localStorage.removeItem('peoplera_team_hotspots'); }catch(e){}
      try{ localStorage.removeItem('peoplera_action_plans'); }catch(e){}
      try{ localStorage.removeItem('peoplera_ai_insights_cache'); }catch(e){}
      try{ localStorage.removeItem('peoplera_ai_insights'); }catch(e){}
      try{ localStorage.removeItem('peoplera_demo_employee_ids'); }catch(e){}
      try{ setDemoActivatedThisSession(false); }catch(e){}
      window.__demoEmployees = [];
      window.__lastPulseEmployees = [];
      window.__lastActionPlans = [];
      window.__lastDecisionEngine = null;
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

  updateUserProfile();

  // Check onboarding + demo banner after auth
  try{
    const empCount = Number(readJsonLocalStorage('peoplera_active_employees_count') || 0);
    if (isDemoEmployeesActive()) {
      showDemoBanner();
      try{ populateOverviewFromEmployees(window.__demoEmployees || employees || []); }catch(e){}
    } else {
      hideDemoBanner();
      // Fresh session without demo active — purge any leftover demo localStorage artifacts
      if (!hasDemoActivatedThisSession()) {
        try{ localStorage.removeItem('peoplera_team_hotspots'); }catch(e){}
        try{ localStorage.removeItem('peoplera_action_plans'); }catch(e){}
        try{ localStorage.removeItem('peoplera_ai_insights_cache'); }catch(e){}
        try{ localStorage.removeItem('peoplera_ai_insights'); }catch(e){}
        try{ localStorage.removeItem('peoplera_demo_employee_ids'); }catch(e){}
      }
      maybeShowOnboarding(empCount);
    }
  }catch(e){}
}

function getEmailUsername(email){
  const e = String(email || '').trim();
  if (!e) return '';
  return String(e.split('@')[0] || '').trim();
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
    const res = await fetch('/api/tools?action=hire', {
      method:'POST',
      headers:{'content-type':'application/json', 'authorization': 'Bearer ' + token},
      body: JSON.stringify({ ping: true })
    });
    aEl.textContent = res.status !== 500 ? 'Connected' : 'AI endpoint unavailable';
  }catch(err){
    if (aEl) aEl.textContent = (err && err.message) ? err.message : 'AI endpoint unavailable';
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

  const series = getCompanyTrendSeries(8);
  const decision = computeDecisionEngine(emps, series);
  window.__lastDecisionEngine = decision;

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

  const distBar = '';

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
  const s = (await supabase.auth.getSession()).data?.session;
  if (!s) return;
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
    await fetch('/api/utils?action=email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token },
      body: JSON.stringify({ to: userEmail, subject: `Peoplera Weekly Report — ${atRiskCount} at-risk employee${atRiskCount !== 1 ? 's' : ''}`, html })
    });
  } catch(e) { console.warn('Email send failed', e); }
}


// sendPulseSurvey — implemented at end of file

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
  if (!manual || !csv || !btnManual || !btnCsv) {
    if (tab === 'csv') {
      openPulseCsvPicker();
    }
    return;
  }

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

async function insertPulseResult(type, payload){
  try{
    if (pulseDemoActive) return;
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;

    const fingerprint = computeAnalysisFingerprint(type, payload);
    const lastKey = `peoplera_pulse_results_last_fp_${String(type || 'analysis')}`;
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
    await supabase.from('pulse_results').insert(row);
    writeJsonLocalStorage(lastKey, fingerprint);
  }catch(e){
    console.warn('Insert analysis history failed', e);
  }
}

async function loadPulseHistoryFromPulseResults(limit = 5){
  try{
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return null;

    const r = await supabase
      .from('pulse_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    const rows = r?.data || [];
    const pulseItems = rows.map(r => ({
      id: r.id,
      created_at: r.created_at,
      employees: r?.data?.employees || r?.employees || [],
      at_risk_count: r?.data?.at_risk_count || r?.at_risk_count || 0
    }));

    window.__pulseHistorySource = 'pulse_results';
    return pulseItems;
  }catch(e){
    console.warn('Load pulse results failed', e);
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
  const reset = setAiBusy(btn, 'Generating...');
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
      await insertPulseResult('pulse', {
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

    try{
      const activeEmployees = Number(readJsonLocalStorage('peoplera_active_employees_count', mergedEmployees.length)) || mergedEmployees.length;
      const atRiskEmployees = mergedEmployees.filter(e => Number(e?.burnoutScore || e?.burnout_score || 0) >= 60).length;
      const atRiskPreview = mergedEmployees
        .slice()
        .sort((a,b)=>(Number(b?.burnoutScore||b?.burnout_score||0) - Number(a?.burnoutScore||a?.burnout_score||0)))
        .filter(e => Number(e?.burnoutScore || e?.burnout_score || 0) >= 60)
        .slice(0, 3)
        .map(e => ({
          name: e?.name || '',
          burnoutScore: Number(e?.burnoutScore || e?.burnout_score || 0),
          riskLevel: e?.riskLevel || e?.risk_level || ''
        }));
      persistOverviewStats({ activeEmployees, atRiskEmployees, atRiskPreview });
    }catch(e){ /* noop */ }

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
    initPulseHistoryAccordion();
    initSidebarCollapse();
    initSidebarNavigation();
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


    document.getElementById('btnExportPulseXlsx')?.addEventListener('click', ()=>{
      exportPulseReportXlsx();
    });

    document.getElementById('pulseFile')?.addEventListener('change', function(){
      const _el_pulseName = document.getElementById('pulseName');
      if (_el_pulseName) _el_pulseName.textContent = this.files?.[0] ? '✓ ' + this.files[0].name : '';

      try{
        const file = this.files?.[0];
        if (!file) return;
        const name = String(file.name || '').toLowerCase();
        if (!name.endsWith('.csv')) return;
        if (!session?.user) return;

        const reader = new FileReader();
        reader.onload = async ()=>{
          try{
            const text = String(reader.result || '');
            const rows = parseCsvText(text);
            if (!rows || rows.length < 2) {
              showToast('CSV appears to be empty', 'error');
              return;
            }
            const importRows = mapEmployeesForImport(rows);
            if (!importRows.length) {
              showToast('No employees found in CSV', 'error');
              return;
            }

            showCsvImportPreviewModal(importRows, async ()=>{
              try{
                await importEmployeesFromCsvRows(importRows);
              }catch(err){
                console.error('CSV import failed:', err);
                showToast('Error importing employees', 'error');
              }
            });
          }catch(err){
            console.error('CSV parse failed:', err);
            showToast('Error parsing CSV', 'error');
          }
        };
        reader.readAsText(file);
      }catch(e){ /* noop */ }
    });

    const cvDrop = document.getElementById('cvDrop');
    const cvFiles = document.getElementById('cvFiles');
    const cvList = document.getElementById('cvList');
    if (cvDrop && cvFiles && cvList) initDrop(cvDrop, cvFiles, cvList);
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
  hideRecentActivitySection();
  ensureYourTeamCollapsibleIds();
  ensureTryDemoButton();
  ensureBurnoutMainContainerId();
  redesignOverviewHrSystemCard();

  const gateMsg = document.getElementById('gateMsg');
  if (gateMsg) gateMsg.textContent = 'Loading…';

  // Show skeleton loading for overview stats on boot
  try{ showSkeletonStats(); }catch(e){ /* noop */ }

  try{
    await initSupabase();
    await renderAuthState();

    if (session) {
      await loadHistory();
      await checkStatus();

      // Check employee count for onboarding
      try{
        const { data: empRows } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1);
        const hasEmployees = (empRows && empRows.length > 0) || isDemoEmployeesActive();
        if (hasEmployees) {
          try{ localStorage.setItem('peoplera_onboarding_done', '1'); }catch(e){}
          hideDemoBanner();
          // Try to populate overview from cached data
          try{
            const cached = readJsonLocalStorage('peoplera_overview_stats');
            if (cached) persistOverviewStats(cached);
          }catch(e){}
        } else {
          maybeShowOnboarding(0);
        }
      }catch(e){ /* noop */ }
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

window.runPulse = runPulse;
window.runPulseDemo = runPulseDemo;
window.clearPulse = clearPulse;
window.showSection = showSection;
window.sendPulseSurvey = sendPulseSurvey;
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

async function ensureDemoDataLoaded(){
  // After reload, demo employees from Supabase lack __demoWeekly.
  // If weeklyData is already populated for at least one employee, skip.
  if (!hasDemoActivatedThisSession()) return;
  const hasWeekly = employees.length > 0 && employees.some(e => e?.id && weeklyData[e.id]);
  if (hasWeekly) return;
  // Need to load demo employees + weekly_metrics from Supabase
  try{
    const s = (await supabase.auth.getSession()).data?.session;
    if (!s?.user?.id) return;
    const { data: empData } = await supabase
      .from('employees').select('*').eq('user_id', s.user.id).order('created_at', { ascending: false });
    if (!Array.isArray(empData) || !empData.length) return;
    const demoRows = empData.filter(e => e?.is_demo === true);
    if (!demoRows.length) return;
    employees = demoRows;
    if (!Array.isArray(window.__demoEmployees) || !window.__demoEmployees.length) {
      window.__demoEmployees = demoRows;
    }
    const ids = demoRows.map(e => e.id).filter(Boolean);
    const { data: metricsData } = await supabase
      .from('weekly_metrics').select('*').in('employee_id', ids).order('week_start', { ascending: false });
    weeklyData = {};
    for (const m of (metricsData || [])) {
      if (!m?.employee_id || weeklyData[m.employee_id]) continue;
      weeklyData[m.employee_id] = m;
    }
    try{ await loadAndCalculateScores(); }catch(e){ /* noop */ }
  }catch(e){ /* noop */ }
}

async function loadPulseData() {
  try {
    try{
      const pulseTab = document.getElementById('tab-pulse');
      const isPulseActive = !!(pulseTab && pulseTab.classList && pulseTab.classList.contains('on'));
      if (!isPulseActive) return;
    }catch(e){ /* noop */ }

    // Show skeleton while loading
    try{ showSkeleton('employeesList', 3); }catch(e){ /* noop */ }

    if (Array.isArray(window.__demoEmployees) && window.__demoEmployees.length
        && window.__demoEmployees.some(e => e?.__demoWeekly)) {
      // In-memory demo shortcut (no reload) — __demoWeekly is present
      employees = window.__demoEmployees;
      weeklyData = {};

      try{
        const monday = getCurrentMonday();
        const rows = [];
        for (const emp of employees) {
          const metrics = emp && emp.__demoWeekly ? emp.__demoWeekly : null;
          if (!emp?.id || !metrics) continue;
          const row = {
            employee_id: emp.id,
            week_start: monday,
            weekly_hours: Number(metrics.weekly_hours || 0),
            weekend_hours: Number(metrics.weekend_hours || 0),
            after_hours_messages: Number(metrics.after_hours_messages || 0),
            sick_days: Number(metrics.sick_days || 0),
            overtime_hours: Number(metrics.overtime_hours || 0)
          };
          weeklyData[emp.id] = row;
          rows.push(row);
        }

        const scores = calculateBurnoutScores(rows);
        updateScoreCards(scores, rows);
        try{ renderTrendChart([{ week_start: getCurrentMonday() }]); }catch(e){ /* noop */ }
      }catch(e){
        // noop
      }

      try{ writeJsonLocalStorage('peoplera_active_employees_count', employees.length); }catch(e){ /* noop */ }
      renderEmployees();
      updateSectionsVisibility();
      try{ applyPulseActionButtonsUi({ connected: false }); }catch(e){ /* noop */ }
      return;
    }

    const { data: empData, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (empError) {
      console.log('Supabase error loading employees:', empError);
      // If table doesn't exist, silently show empty state
      if (empError.message && empError.message.includes('relation') && empError.message.includes('does not exist')) {
        employees = [];
        renderEmployees();
        updateSectionsVisibility();
        return;
      }
      throw empError;
    }
    employees = empData || [];

    // Deduplicate by id
    const seenEmpIds = new Set();
    employees = employees.filter(e => {
      const eid = String(e?.id || '');
      if (!eid || seenEmpIds.has(eid)) return false;
      seenEmpIds.add(eid);
      return true;
    });

    try{
      if (!hasDemoActivatedThisSession()) {
        // Not in a demo session — strip all is_demo rows so demo never leaks
        employees = employees.filter(e => e?.is_demo !== true);
      }
    }catch(e){ /* noop */ }

    // After reload: restore window.__demoEmployees from Supabase-loaded rows
    try{
      if (hasDemoActivatedThisSession() && employees.some(e => e?.is_demo === true)
          && (!Array.isArray(window.__demoEmployees) || !window.__demoEmployees.length)) {
        window.__demoEmployees = employees.filter(e => e?.is_demo === true);
      }
    }catch(e){ /* noop */ }

    try{ writeJsonLocalStorage('peoplera_active_employees_count', employees.length); }catch(e){ /* noop */ }

    // Load weekly metrics (latest row per employee)
    const currentMonday = getCurrentMonday();
    if (employees.length === 0) {
      weeklyData = {};
    } else {
      const isUuid = (v) => {
        const s = String(v || '').trim();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
      };
      const isDemoId = (v) => String(v || '').trim().toLowerCase().startsWith('demo-');

      if ((isDemoEmployeesActive() || employees.some(e => isDemoId(e?.id)))
          && employees.some(e => e?.__demoWeekly)) {
        // In-memory demo path: __demoWeekly is present (no reload)
        weeklyData = {};
        try{
          const rows = [];
          for (const emp of employees) {
            const metrics = emp && emp.__demoWeekly ? emp.__demoWeekly : null;
            if (!emp?.id || !metrics) continue;
            const row = {
              employee_id: emp.id,
              week_start: currentMonday,
              weekly_hours: Number(metrics.weekly_hours || 0),
              weekend_hours: Number(metrics.weekend_hours || 0),
              after_hours_messages: Number(metrics.after_hours_messages || 0),
              sick_days: Number(metrics.sick_days || 0),
              overtime_hours: Number(metrics.overtime_hours || 0)
            };
            weeklyData[emp.id] = row;
            rows.push(row);
          }
        }catch(e){ /* noop */ }
      } else {
        const employeeIds = employees.map(e => e.id);
        const safeIds = employeeIds.filter(isUuid);
        if (!safeIds.length) {
          weeklyData = {};
        } else {
          const { data: metricsData, error: metricsError } = await supabase
            .from('weekly_metrics')
            .select('*')
            .in('employee_id', safeIds)
            .order('week_start', { ascending: false });

          if (metricsError) {
            console.log('Supabase error loading weekly metrics:', metricsError);
            // If table doesn't exist, silently continue with empty metrics
            if (metricsError.message && metricsError.message.includes('relation') && metricsError.message.includes('does not exist')) {
              weeklyData = {};
            } else {
              throw metricsError;
            }
          } else {
            weeklyData = {};
            for (const m of (metricsData || [])) {
              const empId = m?.employee_id;
              if (!empId) continue;
              if (weeklyData[empId]) continue;
              weeklyData[empId] = m;
            }
          }
        }
      }
    }

    renderEmployees();
    updateSectionsVisibility();
    try{ applyDemoRealDataUi(); }catch(e){ /* noop */ }
    try{ ensurePulseCsvTemplateLink(); }catch(e){ /* noop */ }
    try{ updatePulseLastSynced(new Date()); }catch(e){ /* noop */ }
    try{ await updateBurnoutIntegrationIndicator(); }catch(e){ /* noop */ }
    if (employees.length > 0) {
      try {
        await loadAndCalculateScores();
      } catch (scoresError) {
        // Silently ignore score calculation errors - pulse results loading is not critical
        console.log('Scores calculation skipped:', scoresError);
      }
    }
  } catch (error) {
    console.error('loadPulseData error:', error);
  }
}

function getCurrentMonday() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const date = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function formatDateYmd(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const date = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function renderEmployees() {
  try {
    // Deduplicate employees by id (keep first occurrence)
    const seenIds = new Set();
    employees = employees.filter(emp => {
      const id = String(emp?.id || '');
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    const list = document.getElementById('employeesList');
    const emptyState = document.getElementById('emptyState');

    const demoIds = getDemoEmployeeIdSet();

    const belowTeamEmpty = document.getElementById('burnoutBelowTeamEmpty');

    if (employees.length === 0) {
      if (list) list.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      if (belowTeamEmpty) belowTeamEmpty.style.display = 'block';
      try{
        const existing = document.getElementById('generate-report-container');
        if (existing) existing.remove();
      }catch(e){ /* noop */ }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (belowTeamEmpty) belowTeamEmpty.style.display = 'none';

    const monday = getCurrentMonday();
    const weekLabel = formatWeekRangeLabel(monday);

    if (!list) return;

    list.innerHTML = employees.map(emp => `
    <div class="panel employee-card" data-employee-id="${emp.id}" style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px;flex-wrap:wrap">
        <div>
          <div class="employee-name" style="font-weight:900;font-size:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>${escapeHtml(emp.full_name || '')}</span>
            ${(emp.is_demo === true || demoIds.has(String(emp.id))) ? '<span style="background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.22);border-radius:999px;padding:2px 8px;font-size:10px;font-weight:900;color:#64748b;letter-spacing:0.04em">Demo</span>' : ''}
          </div>
          <div class="employee-title" style="font-size:13px;color:#64748b">${escapeHtml(emp.job_title || '')}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button type="button" class="edit-employee-btn" style="background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.12);border-radius:6px;padding:6px 10px;font-size:12px;font-weight:800;color:#64748b;cursor:pointer">Edit</button>
          <button type="button" class="delete-employee-btn" style="background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.2);border-radius:6px;padding:6px 10px;font-size:12px;font-weight:800;color:#FF6B6B;cursor:pointer">Delete</button>
        </div>
      </div>
      <div class="employee-details" style="display:none;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08)">
        <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-bottom:10px">${escapeHtml(weekLabel)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;font-size:13px">
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Start Date</label>
            <input class="emp-start" data-field="start_date" type="date" value="${escapeHtml(String(emp.start_date || '')).slice(0,10)}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Birth Date</label>
            <input class="emp-birth" data-field="birth_date" type="date" value="${escapeHtml(String(emp.birth_date || '')).slice(0,10)}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Last Vacation</label>
            <input class="emp-vac" data-field="last_vacation" type="date" value="${escapeHtml(String(emp.last_vacation || '')).slice(0,10)}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Weekly Hours</label>
            <input class="wk-hours" data-field="weekly_hours" type="number" value="${escapeHtml(String(weeklyData[emp.id]?.weekly_hours ?? ''))}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px" min="0" step="0.5">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Weekend Hours</label>
            <input class="wk-weekend" data-field="weekend_hours" type="number" value="${escapeHtml(String(weeklyData[emp.id]?.weekend_hours ?? ''))}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px" min="0" step="0.5">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">After-hours Messages</label>
            <input class="wk-messages" data-field="after_hours_messages" type="number" value="${escapeHtml(String(weeklyData[emp.id]?.after_hours_messages ?? ''))}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px" min="0" step="1">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:900;color:#64748b;margin-bottom:4px">Sick Days</label>
            <input class="wk-sick" data-field="sick_days" type="number" value="${escapeHtml(String(weeklyData[emp.id]?.sick_days ?? ''))}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;font-size:13px" min="0" step="0.5">
          </div>
          ${emp.email ? `<div><strong>Email:</strong> <a href="mailto:${escapeHtml(emp.email)}" style="color:#6366f1;text-decoration:none">${escapeHtml(emp.email)}</a></div>` : ''}
          ${emp.phone ? `<div><strong>Phone:</strong> ${escapeHtml(emp.phone)}</div>` : ''}
        </div>

        <button type="button" class="save-employee-all-btn" style="margin-top:14px;background:linear-gradient(90deg,#FF6B6B,#FFD93D);border:none;border-radius:10px;padding:10px 14px;font-weight:900;font-size:12px;color:#0f172a;cursor:pointer;width:100%">Save</button>
      </div>
      <button type="button" class="show-details-btn" style="background:none;border:none;color:#6366f1;font-size:12px;font-weight:800;cursor:pointer;margin-top:8px">Show details ▼</button>
    </div>
  `).join('');

  try{
    const legacy = document.querySelector('#yourTeamContent button[onclick="generateFullReport()"]');
    if (legacy && legacy.id !== 'generate-report-btn') {
      const wrap = legacy.closest('div');
      if (wrap) wrap.remove();
    }
  }catch(e){ /* noop */ }

  try{
    const existing = document.getElementById('generate-report-container');
    if (existing) existing.remove();

    const host = document.getElementById('generateReportHost');
    if (!host) return;

    const generateBtn = document.createElement('div');
    generateBtn.id = 'generate-report-container';
    generateBtn.style.cssText = 'text-align: center; margin-top: 24px; padding-bottom: 8px;';
    generateBtn.innerHTML = `
  <button id="generate-report-btn" style="padding: 14px 32px; background: linear-gradient(135deg, #FF6B4A, #FFB347); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 700; cursor: pointer; font-family: inherit;">
    Generate full report
  </button>
`;
    host.innerHTML = '';
    host.appendChild(generateBtn);

    const btn = generateBtn.querySelector('#generate-report-btn');
    if (btn) {
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        const reset = setAiBusy(btn, 'Generating...');
        Promise.resolve()
          .then(()=>generateFullReport())
          .catch(()=>{/* noop */})
          .finally(()=>{ try{ reset(); }catch(e){ /* noop */ } });
      });
    }
  }catch(e){ /* noop */ }

  // Populate Overview stats whenever employees render
  try{ populateOverviewFromEmployees(employees); }catch(e){ /* noop */ }
  try{ if (isDemoEmployeesActive()) showDemoBanner(); }catch(e){ /* noop */ }

  } catch (e) {
    console.error('renderEmployees failed:', e);
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString();
}

function updateSectionsVisibility() {
  const scoreSection = document.getElementById('scoreSection');

  const shouldShow = employees.length > 0;
  scoreSection.style.display = shouldShow ? 'block' : 'none';

  // Auto-expand your team section
  const teamContent = document.getElementById('your-team-body') || document.getElementById('yourTeamContent');
  const teamChevron = document.getElementById('your-team-chevron') || document.getElementById('yourTeamChevron');
  if (teamContent && teamChevron) {
    teamContent.style.maxHeight = '9999px';
    teamContent.style.opacity = '1';
    teamContent.setAttribute('data-collapsed', '0');
    teamChevron.textContent = '▲';
    teamChevron.style.transform = 'rotate(0deg)';
  }
}

function toggleYourTeamSection() {
  const content = document.getElementById('your-team-body') || document.getElementById('yourTeamContent');
  const chevron = document.getElementById('your-team-chevron') || document.getElementById('yourTeamChevron');
  if (!content || !chevron) return;

  const isCollapsed = content.getAttribute('data-collapsed') === '1';
  if (isCollapsed) {
    // Expand
    content.style.maxHeight = '9999px';
    content.style.opacity = '1';
    content.setAttribute('data-collapsed', '0');
    chevron.textContent = '▲';
    chevron.style.transform = 'rotate(0deg)';
  } else {
    // Collapse
    content.style.maxHeight = '0px';
    content.style.opacity = '0';
    content.setAttribute('data-collapsed', '1');
    chevron.textContent = '▼';
    chevron.style.transform = 'rotate(180deg)';
  }
}

try{ window.toggleYourTeamSection = toggleYourTeamSection; }catch(e){ /* noop */ }

function openPulseCsvPicker(){
  const input = document.getElementById('pulseFile');
  if (!input) return;
  try{ input.value = ''; }catch(e){ /* noop */ }
  try{ input.click(); }catch(e){ /* noop */ }
}

function formatWeekRangeLabel(mondayIso){
  const monday = new Date(mondayIso);
  if (!Number.isFinite(monday.getTime())) return '';
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  return `Week of ${fmt(monday)} – ${fmt(sunday)}`;
}

// No-op: demo scores now derive from the real model via computeBurnoutScoreFromSignals.
// Kept as stub so any remaining callers do not throw.
function applyHardcodedDemoScores(list){ return Array.isArray(list) ? list : []; }

let __demoLoadInFlight = false;
async function loadDemoData() {
  if (__demoLoadInFlight) return;
  __demoLoadInFlight = true;

  const btn = document.getElementById('btnTryDemoData');
  const errorEl = document.getElementById('demoError');
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.textContent = 'Loading...';
    btn.disabled = true;
  }
  if (errorEl) errorEl.style.display = 'none';

  try {
    setDemoActivatedThisSession(true);

    const demoSeed = [
      {
        id: 'demo-sara',
        full_name: 'Sara Lee',
        job_title: 'Operations Manager',
        start_date: '2020-09-20',
        birth_date: '1992-08-30',
        last_vacation: '2026-03-01',
        is_demo: true,
        __demoWeekly: { weekly_hours: 74, weekend_hours: 16, after_hours_messages: 42, sick_days: 6, overtime_hours: 34 }
      },
      {
        id: 'demo-alex',
        full_name: 'Alex Kim',
        job_title: 'Senior Engineer',
        start_date: '2022-03-15',
        birth_date: '1990-06-12',
        last_vacation: '2026-01-06',
        is_demo: true,
        __demoWeekly: { weekly_hours: 54, weekend_hours: 8, after_hours_messages: 24, sick_days: 3, overtime_hours: 14 }
      },
      {
        id: 'demo-maya',
        full_name: 'Maya Chen',
        job_title: 'Product Designer',
        start_date: '2021-07-01',
        birth_date: '1988-11-24',
        last_vacation: '2026-02-10',
        is_demo: true,
        __demoWeekly: { weekly_hours: 51, weekend_hours: 5, after_hours_messages: 16, sick_days: 2, overtime_hours: 10 }
      },
      {
        id: 'demo-omar',
        full_name: 'Omar Hassan',
        job_title: 'Marketing Lead',
        start_date: '2023-01-10',
        birth_date: '1995-03-08',
        last_vacation: '2026-03-11',
        is_demo: true,
        __demoWeekly: { weekly_hours: 45, weekend_hours: 3, after_hours_messages: 10, sick_days: 1, overtime_hours: 5 }
      }
    ];

    const s = (await supabase.auth.getSession()).data?.session;
    if (s?.user?.id) {
      const uid = s.user.id;
      const demoNames = demoSeed.map(r => String(r.full_name || '').trim()).filter(Boolean);

      // Step 1: Find ALL rows to delete (by is_demo=true OR matching demo names)
      const { data: byFlag } = await supabase
        .from('employees').select('id').eq('user_id', uid).eq('is_demo', true);
      const { data: byName } = await supabase
        .from('employees').select('id').eq('user_id', uid).in('full_name', demoNames);

      const allIds = [...new Set([
        ...((byFlag || []).map(r => r?.id).filter(Boolean)),
        ...((byName || []).map(r => r?.id).filter(Boolean))
      ])];

      // Step 2: Delete weekly_metrics for those employees, then the employees
      if (allIds.length) {
        const { error: wmDelErr } = await supabase
          .from('weekly_metrics').delete().in('employee_id', allIds);
        if (wmDelErr) throw new Error('Failed to clear demo metrics: ' + (wmDelErr.message || wmDelErr.code));

        const { error: empDelErr } = await supabase
          .from('employees').delete().in('id', allIds);
        if (empDelErr) throw new Error('Failed to clear demo employees: ' + (empDelErr.message || empDelErr.code));
      }

      // Step 3: Insert fresh demo employees
      const toInsertEmployees = demoSeed.map(r => ({
        user_id: uid,
        full_name: r.full_name,
        job_title: r.job_title || null,
        start_date: r.start_date || null,
        birth_date: r.birth_date || null,
        last_vacation: r.last_vacation || null,
        email: null,
        is_demo: true
      }));

      const { data: inserted, error: empErr } = await supabase
        .from('employees')
        .insert(toInsertEmployees)
        .select('id, full_name, job_title, start_date, birth_date, is_demo');
      if (empErr) throw empErr;

      try{
        console.log('[loadDemoData] inserted demo employees:', (inserted || []).map(e => ({ id: e?.id, full_name: e?.full_name })));
      }catch(e){ /* noop */ }

      const insertedByName = {};
      for (const r of (inserted || [])) insertedByName[String(r?.full_name || '').toLowerCase()] = r;

      const weekStart = getCurrentMonday();
      const metricsPayload = [];

      const demoMetrics = [
        {
          employee_id: inserted.find(e => e.full_name === 'Sara Lee').id,
          week_start: weekStart,
          weekly_hours: 74,
          weekend_hours: 16,
          after_hours_messages: 42,
          sick_days: 6,
          overtime_hours: 34
        },
        {
          employee_id: inserted.find(e => e.full_name === 'Alex Kim').id,
          week_start: weekStart,
          weekly_hours: 54,
          weekend_hours: 8,
          after_hours_messages: 24,
          sick_days: 3,
          overtime_hours: 14
        },
        {
          employee_id: inserted.find(e => e.full_name === 'Maya Chen').id,
          week_start: weekStart,
          weekly_hours: 51,
          weekend_hours: 5,
          after_hours_messages: 16,
          sick_days: 2,
          overtime_hours: 10
        },
        {
          employee_id: inserted.find(e => e.full_name === 'Omar Hassan').id,
          week_start: weekStart,
          weekly_hours: 45,
          weekend_hours: 3,
          after_hours_messages: 10,
          sick_days: 1,
          overtime_hours: 5
        }
      ];

      const { error: metricError } = await supabase
        .from('weekly_metrics')
        .insert(demoMetrics);

      if (metricError) {
        console.error('Weekly metrics insert failed:', metricError);
        return;
      }

      const weeksAgoStart = (weeksAgo) => {
        const base = new Date(String(weekStart));
        if (!Number.isFinite(base.getTime())) return weekStart;
        const d = new Date(base);
        d.setDate(d.getDate() - (7 * Number(weeksAgo || 0)));
        return formatDateYmd(d);
      };

      const historicalAverages = [
        { week_start: weeksAgoStart(4), weekly_hours: 58, weekend_hours: 6, after_hours_messages: 18, sick_days: 1 },
        { week_start: weeksAgoStart(3), weekly_hours: 63, weekend_hours: 8, after_hours_messages: 22, sick_days: 2 },
        { week_start: weeksAgoStart(2), weekly_hours: 66, weekend_hours: 9, after_hours_messages: 25, sick_days: 2 },
        { week_start: weeksAgoStart(1), weekly_hours: 70, weekend_hours: 11, after_hours_messages: 30, sick_days: 3 }
      ];

      const insertedIds = (inserted || []).map(r => r?.id).filter(Boolean);
      for (const empId of insertedIds) {
        for (const h of historicalAverages) {
          metricsPayload.push({
            employee_id: empId,
            week_start: h.week_start,
            weekly_hours: Number(h.weekly_hours || 0),
            weekend_hours: Number(h.weekend_hours || 0),
            after_hours_messages: Number(h.after_hours_messages || 0),
            sick_days: Number(h.sick_days || 0),
            overtime_hours: Math.max(0, Number(h.weekly_hours || 0) - 40)
          });
        }
      }

      if (metricsPayload.length) {
        const { error: wkErr } = await supabase.from('weekly_metrics').insert(metricsPayload);
        if (wkErr) throw wkErr;
      }

      await loadAndCalculateScores();

      try{
        const planPayloadByName = {
          'sara lee': {
            score: 92,
            risk: 'CRITICAL',
            priority_alert: '',
            this_week: {
              plan_title: 'Workload Emergency Rebalance',
              plan_description: 'Rapidly reduce sustained overload by pausing non-critical work and adding coverage.',
              projected_impact: 'Risk projected to decrease by ~22 points next week.',
              actions: [
                { text: 'Freeze non-critical operational projects and delegate urgent tasks to a backup owner.', impacted_employees: ['Sara Lee'] },
                { text: 'Remove weekend coverage for the next 2 weeks; rotate coverage across the team.', impacted_employees: ['Sara Lee'] },
                { text: 'Schedule a recovery block and agree on a hard cap for weekly hours until stabilized.', impacted_employees: ['Sara Lee'] }
              ]
            },
            next_2_weeks: {
              plan_title: 'After-hours & Recovery Plan',
              plan_description: 'Reduce after-hours communication and restore recovery time with clear boundaries.',
              projected_impact: 'Risk projected to decrease by ~18 points over 2 weeks.',
              actions: [
                { text: 'Set quiet hours and route after-hours requests through a single escalation channel.', impacted_employees: ['Sara Lee'] },
                { text: 'Plan time off and lock it in calendar to ensure actual recovery.', impacted_employees: ['Sara Lee'] }
              ]
            }
          },
          'alex kim': {
            score: 71,
            risk: 'HIGH',
            priority_alert: '',
            this_week: {
              plan_title: 'Act Now to Prevent Escalation',
              plan_description: 'Overtime is trending up and recovery time is limited. Intervene before risk moves to critical.',
              projected_impact: 'Risk projected to decrease by ~12 points next week.',
              actions: [
                { text: 'Cap weekly hours at 48h and reassign overflow tasks to available team members.', impacted_employees: ['Alex Kim'] },
                { text: 'Schedule a 1:1 this week to discuss workload sustainability and prioritize ruthlessly.', impacted_employees: ['Alex Kim'] }
              ]
            },
            next_2_weeks: {
              plan_title: 'After-hours Boundary Plan',
              plan_description: 'Reduce after-hours communication and schedule a recovery break to prevent escalation.',
              projected_impact: 'Risk projected to decrease by ~10 points over 2 weeks.',
              actions: [
                { text: 'Define quiet hours and discourage non-urgent messaging outside work hours.', impacted_employees: ['Alex Kim'] },
                { text: 'Plan a vacation or long weekend within the next 3 weeks to break the accumulation cycle.', impacted_employees: ['Alex Kim'] }
              ]
            }
          },
          'maya chen': {
            score: 52,
            risk: 'MEDIUM',
            priority_alert: '',
            this_week: {
              plan_title: 'Early Warning: Monitor & Prevent',
              plan_description: 'Workload is elevated but manageable. Take preventive action now to keep risk from climbing.',
              projected_impact: 'Maintain current tier or reduce by ~6 points.',
              actions: [
                { text: 'Review current sprint load and defer any non-essential deliverables to next cycle.', impacted_employees: ['Maya Chen'] },
                { text: 'Confirm upcoming time off is scheduled and protected in the calendar.', impacted_employees: ['Maya Chen'] }
              ]
            },
            next_2_weeks: {
              plan_title: 'Preventive Recovery Plan',
              plan_description: 'Ensure sustainable pace by monitoring hours and planning deliberate recovery time.',
              projected_impact: 'Risk projected to stay stable or decrease by ~5 points.',
              actions: [
                { text: 'Set a soft weekly hours target (under 48h) and check in mid-week.', impacted_employees: ['Maya Chen'] },
                { text: 'Encourage a 3-day weekend or personal day within the next 2 weeks.', impacted_employees: ['Maya Chen'] }
              ]
            }
          },
          'omar hassan': {
            score: 28,
            risk: 'LOW',
            priority_alert: '',
            this_week: {
              plan_title: 'Balanced Workload \u2014 Maintain',
              plan_description: 'Workload is healthy and sustainable. No intervention required \u2014 keep current habits.',
              projected_impact: 'Risk expected to remain low.',
              actions: [
                { text: 'No action needed. Continue current work rhythm and regular check-ins.', impacted_employees: ['Omar Hassan'] },
                { text: 'Optional: light 1:1 to acknowledge good balance and discuss career goals.', impacted_employees: ['Omar Hassan'] }
              ]
            },
            next_2_weeks: {
              plan_title: 'Sustain & Grow',
              plan_description: 'Use this low-risk window for development opportunities and knowledge sharing.',
              projected_impact: 'No change expected \u2014 stable low risk.',
              actions: [
                { text: 'Consider pairing with higher-risk colleagues to share load where possible.', impacted_employees: ['Omar Hassan'] },
                { text: 'Use available bandwidth for learning, mentoring, or process improvements.', impacted_employees: ['Omar Hassan'] }
              ]
            }
          }
        };

        const monday2 = getCurrentMonday();
        for (const emp of (inserted || [])) {
          const key = String(emp?.full_name || '').toLowerCase();
          const p = planPayloadByName[key];
          if (!emp?.id || !p) continue;
          const latest_action_plans = {
            generated_at: new Date().toISOString(),
            week_start: monday2,
            burnout_score: Number(p.score || 0),
            risk_level: String(p.risk || 'LOW'),
            employee: { id: emp.id, name: emp.full_name, role: emp.job_title || '' },
            behavior_profile: null,
            employee_type: 'demo',
            priority_alert: p.priority_alert,
            this_week: p.this_week,
            next_2_weeks: p.next_2_weeks
          };

          const { error: planErr } = await supabase
            .from('employees')
            .update({ latest_action_plans })
            .eq('id', emp.id)
            .eq('user_id', s.user.id);
          if (planErr) throw planErr;
        }
      }catch(e){
        console.warn('Demo plans generation skipped:', e);
      }

      try{ writeJsonLocalStorage('peoplera_demo_employee_ids', (inserted || []).map(e => e?.id).filter(Boolean)); }catch(e){ /* noop */ }

      // Merge Supabase-inserted employees with in-memory demo signals so all pages work
      window.__demoEmployees = (inserted || []).map(emp => {
        const seed = demoSeed.find(d => d.full_name === emp.full_name);
        return { ...emp, __demoWeekly: seed?.__demoWeekly || {}, last_vacation: seed?.last_vacation || '' };
      });
      employees = window.__demoEmployees;
      weeklyData = {};
      try{
        const monday = getCurrentMonday();
        for (const emp of employees) {
          const m = emp.__demoWeekly || {};
          if (!emp?.id) continue;
          weeklyData[emp.id] = {
            employee_id: emp.id,
            week_start: monday,
            weekly_hours: Number(m.weekly_hours || 0),
            weekend_hours: Number(m.weekend_hours || 0),
            after_hours_messages: Number(m.after_hours_messages || 0),
            sick_days: Number(m.sick_days || 0),
            overtime_hours: Number(m.overtime_hours || 0)
          };
        }
      }catch(e){ /* noop */ }
      try{ writeJsonLocalStorage('peoplera_active_employees_count', employees.length); }catch(e){ /* noop */ }
      try{ await loadAndCalculateScores(); }catch(e){ /* noop */ }

      renderEmployees();
      updateSectionsVisibility();
      try{ applyPulseActionButtonsUi({ connected: false }); }catch(e){ /* noop */ }

      // Demo flow: show banner, populate overview, navigate to Overview
      try{ showDemoBanner(); }catch(e){}
      try{ updateSidebarStatusCard(); }catch(e){}
      try{ populateOverviewFromEmployees(employees); }catch(e){}
      try{ populateDemoOverviewChart(); }catch(e){}

      // Pre-render all Burnout Intelligence sub-pages so they're ready immediately
      try{ renderStrategicActionPlansPage(); }catch(e){ /* noop */ }
      try{ renderTeamHotspotsPage(); }catch(e){ /* noop */ }
      try{ renderAIInsightsPage(); }catch(e){ /* noop */ }

      try{ switchTab('overview'); }catch(e){}
      return;
    }

    window.__demoEmployees = demoSeed;
    employees = window.__demoEmployees;
    weeklyData = {};
    try{
      const monday = getCurrentMonday();
      for (const emp of employees) {
        const m = emp.__demoWeekly || {};
        if (!emp?.id) continue;
        weeklyData[emp.id] = {
          employee_id: emp.id,
          week_start: monday,
          weekly_hours: Number(m.weekly_hours || 0),
          weekend_hours: Number(m.weekend_hours || 0),
          after_hours_messages: Number(m.after_hours_messages || 0),
          sick_days: Number(m.sick_days || 0),
          overtime_hours: Number(m.overtime_hours || 0)
        };
      }
    }catch(e){ /* noop */ }
    try{ writeJsonLocalStorage('peoplera_active_employees_count', employees.length); }catch(e){ /* noop */ }
    try{ await loadAndCalculateScores(); }catch(e){ /* noop */ }

    renderEmployees();
    updateSectionsVisibility();
    try{ applyDemoRealDataUi(); }catch(e){ /* noop */ }
    try{ applyPulseActionButtonsUi({ connected: false }); }catch(e){ /* noop */ }

    // Demo flow: show banner, populate overview, navigate to Overview
    try{ showDemoBanner(); }catch(e){}
    try{ updateSidebarStatusCard(); }catch(e){}
    try{ populateOverviewFromEmployees(employees); }catch(e){}
    try{ populateDemoOverviewChart(); }catch(e){}

    // Pre-render all Burnout Intelligence sub-pages so they're ready immediately
    try{ renderStrategicActionPlansPage(); }catch(e){ /* noop */ }
    try{ renderTeamHotspotsPage(); }catch(e){ /* noop */ }
    try{ renderAIInsightsPage(); }catch(e){ /* noop */ }

    try{ switchTab('overview'); }catch(e){}
  } catch (error) {
    console.error('[loadDemoData] failed:', error);
    const errorMessage = error.message || 'Failed to save demo data';
    if (errorEl) {
      errorEl.textContent = errorMessage;
      errorEl.style.display = 'block';
    }
    // Show error banner for critical demo data save failures (employees/weekly_metrics)
    showToast('Error loading demo data', 'error');
  } finally {
    __demoLoadInFlight = false;
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

function getDateMonthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return formatDateYmd(date);
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
  document.getElementById('empEmail').value = '';
  document.getElementById('empPhone').value = '';
  document.getElementById('empStartDate').value = '';
  document.getElementById('empBirthDate').value = '';
  document.getElementById('empLastVacation').value = '';
  document.getElementById('empWeeklyHours').value = '';
  document.getElementById('empWeekendHours').value = '';
  document.getElementById('empAfterHoursMessages').value = '';
  document.getElementById('empSickDays').value = '';
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
    const email = document.getElementById('empEmail').value.trim();
    const phone = document.getElementById('empPhone').value.trim();
    const startDate = document.getElementById('empStartDate').value;
    const birthDate = document.getElementById('empBirthDate').value;
    const lastVacation = document.getElementById('empLastVacation').value;

    const weeklyHours = parseFloat(document.getElementById('empWeeklyHours').value) || 0;
    const weekendHours = parseFloat(document.getElementById('empWeekendHours').value) || 0;
    const afterHoursMessages = parseInt(document.getElementById('empAfterHoursMessages').value) || 0;
    const sickDays = parseFloat(document.getElementById('empSickDays').value) || 0;

    if (!fullName || !startDate) {
      document.getElementById('formError').textContent = 'Full name and start date are required';
      document.getElementById('formError').style.display = 'block';
      return;
    }

    // Check for duplicate full_name under this user
    const { data: existingDup } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('full_name', fullName)
      .limit(1);
    if (existingDup && existingDup.length) {
      document.getElementById('formError').textContent = 'An employee with this name already exists';
      document.getElementById('formError').style.display = 'block';
      return;
    }

    const { data: insertedEmp, error } = await supabase
      .from('employees')
      .insert({
        user_id: session.user.id,
        full_name: fullName,
        job_title: jobTitle,
        email: email || null,
        phone: phone || null,
        start_date: startDate,
        birth_date: birthDate || null,
        last_vacation: lastVacation || null,
        is_demo: false
      })
      .select()
      .single();

    if (error) throw error;

    if (insertedEmp?.id) {
      const monday = getCurrentMonday();
      const payload = {
        employee_id: insertedEmp.id,
        week_start: monday,
        weekly_hours: weeklyHours,
        weekend_hours: weekendHours,
        after_hours_messages: afterHoursMessages,
        sick_days: sickDays,
        overtime_hours: Math.max(0, weeklyHours - 40)
      };
      if (payload.employee_id && payload.employee_id.toString().startsWith('demo-')) return;
      const { error: metricsError } = await supabase
        .from('weekly_metrics')
        .upsert(payload);
      if (metricsError) throw metricsError;
    }

    showToast('Employee added successfully!');
    try{ writeJsonLocalStorage('peoplera_has_real_employee_data', true); }catch(e){ /* noop */ }
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

  if (id && id.toString().startsWith('demo-')) return;

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
    console.error('Error deleting employee (critical):', error);
    // Show error banner for critical employee deletion failures
    showToast('Error deleting employee', 'error');
  }
}

async function loadAndCalculateScores() {
  try {
    if (!employees.length) {
      updateScoreCards({}, []);
      renderTrendChart([]);
      return;
    }

    if (isDemoEmployeesActive()) {
      // Score demo employees through the REAL model (no hardcoded scores)
      const scores = {};
      const rows = [];
      for (const e of employees) {
        if (!e?.id) continue;
        const m = e.__demoWeekly || weeklyData[e.id] || {};
        const row = {
          employee_id: e.id,
          weekly_hours: Number(m.weekly_hours || 0),
          weekend_hours: Number(m.weekend_hours || 0),
          after_hours_messages: Number(m.after_hours_messages || 0),
          sick_days: Number(m.sick_days || 0),
          overtime_hours: Number(m.overtime_hours || 0)
        };
        rows.push(row);
        const score = computeBurnoutScoreFromSignals({
          weeklyHours: row.weekly_hours,
          weekendHours: row.weekend_hours,
          afterHoursMessages: row.after_hours_messages,
          sickDays: row.sick_days,
          overtimeHours: row.overtime_hours,
          lastVacation: String(e.last_vacation || 'unknown')
        });
        scores[e.id] = score;
        e.burnoutScore = score;
        e.burnout_score = score;
        e.riskLevel = classifyEmployeeRiskLevel(score);
        e.risk_level = e.riskLevel.toUpperCase();
      }
      updateScoreCards(scores, rows);
      renderTrendChart([]);
      return;
    }

    // Load ALL weekly_metrics for these employees (one bar per distinct week_start)
    const monday = getCurrentMonday();
    const employeeIds = employees.map(e => e.id).filter(id => !(id && id.toString().startsWith('demo-')));
    if (!employeeIds.length) {
      updateScoreCards({}, []);
      renderTrendChart([]);
      return;
    }
    const { data: trendData, error: trendError } = await supabase
      .from('weekly_metrics')
      .select('*')
      .in('employee_id', employeeIds)
      ;

    if (trendError) throw trendError;

    // Calculate scores for current week
    const currentWeekData = (trendData || []).filter(d => d.week_start === monday);
    const scores = calculateBurnoutScores(currentWeekData);

    // Update UI — pass full trendData so updateScoreCards can compute week-over-week trend
    updateScoreCards(scores, currentWeekData, trendData || []);
    renderTrendChart(trendData || []);
  } catch (error) {
    console.error('Error calculating scores:', error);
  }
}

function calculateBurnoutScores(weeklyData) {
  const employeeScores = {};

  const rows = Array.isArray(weeklyData) ? weeklyData : [];
  rows.forEach(data => {
    if (!data || !data.employee_id) return;
    const emp = employees.find(e => e.id === data.employee_id);
    const employee = emp;
    if (!employee) return null;
    employee.weekly_metrics = employee.weekly_metrics || data;
    if (!employee || !employee.weekly_metrics) return null;
    const metrics = employee.weekly_metrics;

    employeeScores[employee.id] = computeBurnoutScoreFromSignals({
      weeklyHours: Number(metrics?.weekly_hours || 0),
      weekendHours: Number(metrics?.weekend_hours || 0),
      afterHoursMessages: Number(metrics?.after_hours_messages || metrics?.after_hours_message || 0),
      sickDays: Number(metrics?.sick_days || 0),
      overtimeHours: Number(metrics?.overtime_hours || 0),
      lastVacation: String(employee?.last_vacation || 'unknown')
    });
  });

  return employeeScores;
}

function updateScoreCards(scores, weeklyData, allTrendData) {
  const scoreValues = Object.values(scores);
  const companyScore = scoreValues.length > 0 ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) : 0;
  const atRiskCount = scoreValues.filter(s => s >= 60).length;
  const atRiskPercent = scoreValues.length > 0 ? Math.round((atRiskCount / scoreValues.length) * 100) : 0;

  // Find top risk driver
  const riskDrivers = { hours: 0, weekend: 0, messages: 0, sick: 0 };
  const rows = Array.isArray(weeklyData) ? weeklyData : [];
  rows.forEach(data => {
    if (!data) return;
    if (Number(data?.weekly_hours || 0) > 50) riskDrivers.hours++;
    if (Number(data?.weekend_hours || 0) > 10) riskDrivers.weekend++;
    if (Number(data?.after_hours_messages || 0) > 25) riskDrivers.messages++;
    if (Number(data?.sick_days || 0) > 2) riskDrivers.sick++;
  });

  const topDriver = Object.entries(riskDrivers).sort((a, b) => b[1] - a[1])[0];
  const driverNames = { hours: 'Overtime Hours', weekend: 'Weekend Work', messages: 'After-hours Messages', sick: 'Sick Days' };

  document.getElementById('companyScore').textContent = companyScore;
  document.getElementById('riskLevel').textContent = getRiskLevel(companyScore);
  document.getElementById('atRiskPercent').textContent = atRiskPercent;
  document.getElementById('topRiskDriver').textContent = topDriver[1] > 0 ? driverNames[topDriver[0]] : 'None';

  // Compute week-over-week risk trend from full historical data
  let trendText = '—';
  let trendColor = '#64748b';
  try {
    const trend = Array.isArray(allTrendData) ? allTrendData : [];
    if (trend.length > 0) {
      const weekBuckets = {};
      for (const row of trend) {
        const w = row.week_start;
        if (!weekBuckets[w]) weekBuckets[w] = [];
        weekBuckets[w].push(row);
      }
      const sortedWeeks = Object.keys(weekBuckets).sort();
      if (sortedWeeks.length >= 2) {
        const calcAvg = (wk) => {
          const wScores = calculateBurnoutScores(weekBuckets[wk]);
          const vals = Object.values(wScores);
          return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        };
        const lastAvg = calcAvg(sortedWeeks[sortedWeeks.length - 1]);
        const prevAvg = calcAvg(sortedWeeks[sortedWeeks.length - 2]);
        const delta = Math.round(lastAvg - prevAvg);
        if (delta > 0) {
          trendText = `↑ +${delta} pts`;
          trendColor = '#FF4444';
        } else if (delta < 0) {
          trendText = `↓ ${delta} pts`;
          trendColor = '#4CAF50';
        } else {
          trendText = '→ No change';
        }
      }
    }
  } catch (e) { /* noop */ }
  const trendEl = document.getElementById('riskTrend');
  if (trendEl) {
    trendEl.textContent = trendText;
    trendEl.style.color = trendColor;
  }
}

function getRiskLevel(score) {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

// ── Unified Burnout Scoring Model (must stay in sync with api/pulse.js) ──
// Linear/proportional, 6 signals, 0-100. Evidence-based weights:
//   weekly_hours:         max 35 pts — WHO/ILO 2021: ≥55h = serious health risk; EU WTD cap 48h; safe ≤40h
//   after_hours_messages: max 20 pts — continuous connectivity / lack of psychological detachment
//   weekend_hours:        max 15 pts — absence of weekend recovery
//   overtime_hours:       max 10 pts — sustained excess work beyond contract
//   sick_days:            max 10 pts — lagging health indicator
//   vacation_gap:         max 10 pts — cumulative fatigue from no recovery break (saturates 26 wks)
// Total possible: 100
function computeBurnoutScoreFromSignals({ weeklyHours, weekendHours, afterHoursMessages, sickDays, overtimeHours, lastVacation } = {}){
  const wh = Math.max(0, Number(weeklyHours || 0));
  const we = Math.max(0, Number(weekendHours || 0));
  const msg = Math.max(0, Number(afterHoursMessages || 0));
  const sick = Math.max(0, Number(sickDays || 0));
  const ot = Math.max(0, Number(overtimeHours || 0));

  // weekly_hours: 0 pts at ≤40h, linear ramp to 35 pts at 55h, capped at 35
  const hoursScore = wh <= 40 ? 0 : Math.min((wh - 40) / 15, 1) * 35;
  // after_hours_messages: proportional, saturates at 50
  const msgScore = Math.min(msg / 50, 1) * 20;
  // weekend_hours: proportional, saturates at 16h
  const weekendScore = Math.min(we / 16, 1) * 15;
  // overtime_hours: proportional, saturates at 20h
  const otScore = Math.min(ot / 20, 1) * 10;
  // sick_days: proportional, saturates at 5
  const sickScore = Math.min(sick / 5, 1) * 10;

  // vacation_gap: weeks since last vacation, proportional, saturates at 26 weeks
  let vacScore = 0;
  const vacStr = String(lastVacation || '').trim();
  if (vacStr && vacStr.toLowerCase() !== 'unknown') {
    const vacDate = Date.parse(vacStr);
    if (Number.isFinite(vacDate)) {
      const weeksSince = Math.max(0, (Date.now() - vacDate) / (7 * 24 * 60 * 60 * 1000));
      vacScore = Math.min(weeksSince / 26, 1) * 10;
    }
  }

  return Math.min(100, Math.round(hoursScore + msgScore + weekendScore + otScore + sickScore + vacScore));
}

// Risk tiers (must stay in sync with api/pulse.js normalizeRiskLevelFromScore):
// 0-34 LOW, 35-59 MEDIUM, 60-79 HIGH, 80-100 CRITICAL
function classifyEmployeeRiskLevel(score){
  const s = Number(score) || 0;
  if (s >= 80) return 'critical';
  if (s >= 60) return 'high';
  if (s >= 35) return 'medium';
  return 'low';
}

function renderTrendChart(trendData) {
  const chart = document.getElementById('trendChart');
  if (!chart) {
    console.error('renderTrendChart: #trendChart not found');
    return;
  }

  if (isDemoEmployeesActive()) {
    const points = [44, 48, 55, 61, 58, 52, 47, 52].map(n => Math.max(0, Math.min(100, Number(n) || 0)));
    const labels = points.map((_, i) => `Week ${i + 1}`);
    const w = 760;
    const h = 260;
    const padL = 46;
    const padR = 18;
    const padT = 16;
    const padB = 38;
    const innerW = Math.max(10, w - padL - padR);
    const innerH = Math.max(10, h - padT - padB);
    const xFor = (i) => padL + (innerW * (i / Math.max(1, points.length - 1)));
    const yFor = (v) => padT + (innerH * (1 - (v / 100)));

    const pathD = points
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`)
      .join(' ');

    const threshold = 60;
    const yThreshold = yFor(threshold);

    const yTicks = [0, 20, 40, 60, 80, 100];

    chart.style.display = 'block';
    chart.style.height = 'auto';
    chart.style.width = '100%';

    chart.innerHTML = `
      <div style="width:100%">
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="8-Week Burnout Trend">
          <rect x="0" y="0" width="${w}" height="${h}" fill="transparent" />

          ${yTicks.map(t => {
            const y = yFor(t);
            return `
              <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#f0f0f0" stroke-width="1" />
              <text x="${padL - 10}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#94a3b8" font-size="11" font-weight="900">${t}</text>
            `;
          }).join('')}

          <line x1="${padL}" y1="${yThreshold}" x2="${w - padR}" y2="${yThreshold}" stroke="rgba(148,163,184,0.85)" stroke-width="2" stroke-dasharray="6 6" />
          <text x="${padL + 8}" y="${Math.max(padT + 10, yThreshold - 8)}" fill="#64748b" font-size="11" font-weight="900">Risk threshold</text>

          <path d="${pathD}" fill="none" stroke="#F97316" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

          ${points.map((v, i) => {
            const cx = xFor(i);
            const cy = yFor(v);
            return `<circle cx="${cx}" cy="${cy}" r="4" fill="#F97316" />`;
          }).join('')}

          <line x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}" stroke="#e5e7eb" stroke-width="1" />
          <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="#e5e7eb" stroke-width="1" />

          ${labels.map((lbl, i) => {
            const x = xFor(i);
            const y = padT + innerH + 20;
            return `<text x="${x}" y="${y}" text-anchor="middle" fill="#64748b" font-size="10" font-weight="900">${escapeHtml(lbl)}</text>`;
          }).join('')}
        </svg>
      </div>
    `;
    return;
  }

  try{
    const msg = document.getElementById('trendEmptyAfterClear');
    if (msg) msg.remove();
  }catch(e){ /* noop */ }

  try{
    const panel = chart.closest('.panel');
    if (panel) panel.style.display = '';
  }catch(e){ /* noop */ }

  if (!trendData.length) {
    chart.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px;font-weight:800">No data yet. Add employees and enter weekly metrics to see burnout trends.</div>';
    return;
  }

  try{
    const titleEl = chart?.previousElementSibling;
    if (titleEl && typeof titleEl.textContent === 'string' && titleEl.textContent.toLowerCase().includes('burnout')) {
      titleEl.textContent = 'Burnout Trend';
    }
  }catch(e){ /* noop */ }

  // Ensure the chart container can grow (dashboard.html sets a fixed height)
  chart.style.display = 'block';
  chart.style.height = 'auto';
  chart.style.width = '100%';

  const driverNames = {
    hours: 'Overtime Hours',
    weekend: 'Weekend Work',
    messages: 'After-hours Messages',
    sick: 'Sick Days'
  };

  const riskColor = (score) => {
    const s = Number(score) || 0;
    if (s <= 30) return '#4CAF50';
    if (s <= 50) return '#FFD700';
    if (s <= 70) return '#FF8C00';
    return '#FF4444';
  };

  // Group by week
  const weeklyBuckets = {};
  for (const row of trendData) {
    const week = row.week_start;
    if (!weeklyBuckets[week]) weeklyBuckets[week] = [];
    weeklyBuckets[week].push(row);
  }

  const weeks = Object.keys(weeklyBuckets).sort();
  const metaByWeek = {};

  for (const week of weeks) {
    const rows = weeklyBuckets[week] || [];
    const scores = [];
    let atRiskCount = 0;
    const riskDrivers = { hours: 0, weekend: 0, messages: 0, sick: 0 };

    for (const data of rows) {
      const emp = employees.find(e => e.id === data.employee_id);
      if (!emp) continue;
      const score = calculateBurnoutScores([data])[emp.id] || 0;
      scores.push(score);
      if (score > 50) atRiskCount++;

      if (Number(data.weekly_hours || 0) > 50) riskDrivers.hours++;
      if (Number(data.weekend_hours || 0) > 10) riskDrivers.weekend++;
      if (Number(data.after_hours_messages || 0) > 25) riskDrivers.messages++;
      if (Number(data.sick_days || 0) > 2) riskDrivers.sick++;
    }

    const avg = scores.length ? (scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
    const top = Object.entries(riskDrivers).sort((a,b)=>b[1]-a[1])[0];
    const topDriverLabel = top && top[1] > 0 ? (driverNames[top[0]] || 'None') : 'None';

    metaByWeek[week] = {
      week,
      weekLabel: new Date(week).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      score: Math.round(avg),
      atRiskCount,
      topDriver: topDriverLabel
    };
  }

  const last = metaByWeek[weeks[weeks.length - 1]];
  const prev = metaByWeek[weeks[weeks.length - 2]];
  let trendText = '— No change';
  let trendColor = '#94a3b8';
  if (last && prev) {
    const delta = Number(last.score) - Number(prev.score);
    const pct = prev.score ? Math.round((delta / prev.score) * 100) : 0;
    if (delta > 0) {
      trendText = `vs last week: ↑ +${Math.abs(pct)}% higher risk`;
      trendColor = '#FF4444';
    } else if (delta < 0) {
      trendText = `vs last week: ↓ -${Math.abs(pct)}% lower risk`;
      trendColor = '#4CAF50';
    }
  }

  const chartHeight = 220;
  const threshold = 50;
  const thresholdTop = Math.round(((100 - threshold) / 100) * chartHeight);

  const gridLines = Array.from({ length: 11 }, (_, i) => i * 10);
  const gridHtml = gridLines.map(v => {
    const top = Math.round(((100 - v) / 100) * chartHeight);
    return `<div style="position:absolute;left:0;right:0;top:${top}px;border-top:1px solid #f0f0f0;pointer-events:none;z-index:0"></div>`;
  }).join('');

  const yAxisHtml = gridLines.map(v => {
    const top = Math.round(((100 - v) / 100) * chartHeight);
    return `<div style="position:absolute;right:0;top:${top}px;transform:translateY(-50%);color:#94a3b8;font-size:11px;font-weight:900;line-height:1;text-align:right;width:100%">${v}</div>`;
  }).join('');

  const barGapPx = 16;
  const slotCount = Math.max(1, weeks.length);
  const barWidthCss = `min(60px, calc((100% / ${slotCount}) - ${barGapPx}px))`;

  chart.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;width:100%">
      <div style="display:flex;gap:10px;align-items:stretch;width:100%">
        <div style="width:30px;position:relative;min-height:${chartHeight}px;box-sizing:border-box">
          ${yAxisHtml}
        </div>

        <div style="flex:1;min-width:0">
          <div style="width:100%;overflow-x:hidden">
          <div id="trendChartArea" class="burnout-chart-container" style="position:relative;min-height:${chartHeight}px;width:100%;padding-right:30px;box-sizing:border-box">
            ${gridHtml}

            <div style="position:absolute;left:0;right:0;top:${thresholdTop}px;border-top:2px dashed rgba(148,163,184,0.65);pointer-events:none;z-index:1"></div>
            <div style="position:absolute;left:6px;top:${Math.max(0, thresholdTop - 14)}px;font-size:11px;font-weight:900;color:#555;pointer-events:none;z-index:1">Risk threshold</div>

            <div id="trendTooltip" class="chart-tooltip" style="position:absolute;display:none;z-index:1000;min-width:160px;max-width:200px;background:#fff;border-radius:10px;padding:10px 12px;box-shadow:0 8px 22px rgba(15,23,42,0.12);border-left:3px solid #FF4444;color:#0f172a;font-size:12px;line-height:1.35"></div>

            ${weeks.map((week, i) => {
              const m = metaByWeek[week];
              const barH = Math.max(10, Math.round((Number(m?.score || 0) / 100) * chartHeight));
              const barColor = riskColor(m?.score || 0);
              const center = `calc(${((i + 0.5) / slotCount) * 100}% )`;
              return `
                <div class=\"trend-bar\" data-week=\"${escapeHtml(String(week))}\" style=\"position:absolute;left:${center};bottom:0;transform:translateX(-50%);width:${barWidthCss};max-width:60px;height:${barH}px;background:${barColor};border-radius:4px 4px 0 0;transition:transform 0.12s ease, filter 0.12s ease;cursor:default;z-index:2\"></div>
              `;
            }).join('')}
          </div>

          <div style="position:relative;height:18px;margin-top:8px;width:100%">
            ${weeks.map((week, i) => {
              const m = metaByWeek[week];
              const center = `calc(${((i + 0.5) / slotCount) * 100}% )`;
              return `<div style=\"position:absolute;left:${center};top:0;transform:translateX(-50%);width:${barWidthCss};max-width:60px;font-size:10px;color:#64748b;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">${escapeHtml(m?.weekLabel || '')}</div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div id="trendIndicator" style="font-size:11px;font-weight:800;color:#94a3b8;text-align:left">${escapeHtml(trendText)}</div>
      <button id="btnTrendHotspots" type="button" style="align-self:flex-start;background:#FF6B4A;color:#fff;border:none;border-radius:12px;padding:10px 24px;font-weight:900;cursor:pointer">View Team Hotspots →</button>
    </div>
  `;

  chart.__trendWeekMeta = metaByWeek;

  if (!chart.getAttribute('data-trend-bound')) {
    chart.setAttribute('data-trend-bound', '1');
    chart.addEventListener('click', (e)=>{
      const btn = e.target.closest('#btnTrendHotspots');
      if (btn) {
        e.preventDefault();
        try{ switchTab('pulse-hotspots'); }catch(err){ /* noop */ }
      }
    });
    chart.addEventListener('mouseenter', (e) => {
      const bar = e.target.closest('.trend-bar');
      const area = chart.querySelector('#trendChartArea');
      const tip = chart.querySelector('#trendTooltip');
      if (!bar || !area || !tip) return;

      const week = bar.getAttribute('data-week');
      const meta = chart.__trendWeekMeta?.[week];
      if (!meta) return;

      tip.innerHTML = `
        <div style="font-weight:900;margin-bottom:6px">${escapeHtml(meta.weekLabel)}</div>
        <div style="color:#334155"><strong>Burnout score:</strong> ${escapeHtml(String(meta.score))}/100</div>
        <div style="color:#334155"><strong>At-risk:</strong> ${escapeHtml(String(meta.atRiskCount))}</div>
        <div style="color:#334155"><strong>Top driver:</strong> ${escapeHtml(String(meta.topDriver))}</div>
      `;

      const chartContainer = bar.closest('.burnout-chart-container') || area;
      if (!chartContainer) return;

      const barRect = bar.getBoundingClientRect();
      const containerRect = chartContainer.getBoundingClientRect();

      tip.style.position = 'absolute';
      tip.style.pointerEvents = 'none';
      tip.style.display = 'block';

      const areaW = Math.max(0, containerRect.width || 0);
      const barCenterX = (barRect.left - containerRect.left) + (barRect.width / 2);

      // Measure after display:block so offsetWidth/Height is correct
      const tipW = Math.max(160, Math.min(200, Number(tip.offsetWidth || 0) || 180));
      const tipH = Number(tip.offsetHeight || 0) || 0;

      // Place tooltip above the bar
      let top = (barRect.top - containerRect.top - tipH - 10);
      if (top < 6) top = 6;

      // Smart horizontal positioning: if bar is in right half, show tooltip to the left
      const preferLeft = areaW > 0 && barCenterX > (areaW / 2);
      let left;
      if (preferLeft) {
        left = barCenterX - (barRect.width / 2) - 10 - tipW; // left of bar
      } else {
        left = barCenterX + (barRect.width / 2) + 10; // right of bar
      }

      // Clamp within chart bounds
      const pad = 6;
      left = Math.max(pad, Math.min(left, Math.max(pad, areaW - tipW - pad)));

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      tip.style.transform = 'none';

      bar.style.transform = 'translateY(-2px)';
      bar.style.filter = 'brightness(0.98)';
    }, true);

    chart.addEventListener('mouseleave', (e) => {
      const bar = e.target.closest('.trend-bar');
      const tip = chart.querySelector('#trendTooltip');
      if (tip) tip.style.display = 'none';
      if (bar) {
        bar.style.transform = '';
        bar.style.filter = '';
      }
    }, true);
  }
}

function restoreLastPulseEmployeesFromStorage(){
  if (Array.isArray(window.__lastPulseEmployees) && window.__lastPulseEmployees.length) return window.__lastPulseEmployees;
  const hotspots = readJsonLocalStorage('peoplera_team_hotspots', []);
  if (!Array.isArray(hotspots) || hotspots.length === 0) return [];
  const restored = hotspots.map(h => ({
    name: h.name,
    burnoutScore: h.burnoutScore,
    riskLevel: h.riskLevel,
    weeklyHours: h.weeklyHours,
    weekendHours: h.weekendHours,
    afterHoursMessages: h.afterHoursMessages,
    sickDays: h.sickDays
  }));
  window.__lastPulseEmployees = restored;
  return restored;
}

function buildAIInsightsArray(employees, decision){
  const emps = Array.isArray(employees) ? employees : [];
  const overHours = emps.filter(e => Number(e?.weeklyHours || e?.weekly_hours || 0) >= 50).length;
  const highRisk = emps.filter(e => ['high','critical'].includes(String(e?.riskLevel || e?.risk_level || '').toLowerCase())).length;
  const teamSize = emps.length;
  const series = getCompanyTrendSeries(8);
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = (last != null && prev != null) ? (last - prev) : null;
  const insights = [];

  if (decision?.inputs?.teamSize) {
    const riskWord = decision.status?.label ? `${decision.status.label} risk` : 'risk';
    insights.push({ kind: 'trend', icon: '🏷️', title: `Company burnout score: ${decision.score}/100 (${riskWord})`, detail: `${decision.predictionText} Estimated productivity at risk: ~${decision.productivityAtRiskWeekly.toLocaleString()} per week.` });
  }

  if (decision?.inputs?.teamSize) {
    const lvl = decision?.sickLeaveRisk?.level || 'Low';
    const affected = Number(decision?.sickLeaveAffected) || 0;
    const horizon = Number(decision?.sickLeaveHorizonDays) || 30;
    insights.push({ kind: 'warning', icon: '🏥', title: `Potential sick leave risk: ${lvl} (next ${horizon} days)`, detail: affected ? `${affected} employee(s) potentially at risk. Use early interventions and manager check-ins to reduce escalation.` : 'Directional estimate based on current signals. Add sick days + workload metrics for higher confidence.' });
  }

  if (teamSize > 0 && highRisk > 0) {
    insights.push({ kind: 'warning', icon: '⚠️', title: `${highRisk} ${highRisk === 1 ? 'employee is' : 'employees are'} at high risk`, detail: 'Review hotspots and assign interventions this week. Insights are derived from patterns typically tracked in HR systems (e.g., workload, time-off, and sick leave signals).' });
  }

  if (teamSize > 0 && overHours > 0) {
    insights.push({ kind: 'warning', icon: '⏱️', title: `${overHours} ${overHours === 1 ? 'employee shows' : 'employees show'} overtime signals`, detail: 'Consider reducing weekly hours or rotating load across the team.' });
  }

  if (delta !== null) {
    const dir = delta > 0 ? 'increased' : 'decreased';
    const magnitude = Math.abs(delta);
    insights.push({ kind: 'trend', icon: delta > 0 ? '📈' : '📉', title: `Burnout risk ${dir} ${magnitude.toFixed(0)} pts this week`, detail: 'Track the top drivers and validate against team changes.' });
  }

  return insights;
}

function renderStrategicActionPlansPage(){
  hideBurnoutMainContainer();
  const out = document.getElementById('actionPlansContent');
  if (!out) return;

  out.innerHTML = '<div style="text-align:center;padding:40px">'
    + '<div style="font-size:16px;font-weight:900;color:#64748b;margin-bottom:8px">Loading action plans\u2026</div>'
    + '<div style="font-size:13px;color:#94a3b8">Generating AI action plans from weekly metrics.</div>'
    + '</div>';

  (async ()=>{
    try{
      const s = (await supabase.auth.getSession()).data?.session;
      if (!s && !isDemoEmployeesActive()) throw new Error('Not signed in');

      const token = s ? s.access_token : '';
      let blocks = [];

      if (isDemoEmployeesActive()) {
        const demoPlansData = {
          'sara lee': {
            employee: { id: 'demo-sara', name: 'Sara Lee', role: 'Operations Manager' },
            burnout_score: 92, risk_level: 'CRITICAL', week_start: getCurrentMonday(),
            priority_alert: '',
            this_week: {
              plan_title: 'Workload Emergency Rebalance',
              plan_description: 'Rapidly reduce sustained overload by pausing non-critical work and adding coverage.',
              projected_impact: 'Risk projected to decrease by ~22 points next week.',
              actions: [
                { text: 'Freeze non-critical operational projects and delegate urgent tasks to a backup owner.', impacted_employees: ['Sara Lee'] },
                { text: 'Remove weekend coverage for the next 2 weeks; rotate coverage across the team.', impacted_employees: ['Sara Lee'] },
                { text: 'Schedule a recovery block and agree on a hard cap for weekly hours until stabilized.', impacted_employees: ['Sara Lee'] }
              ]
            },
            next_2_weeks: {
              plan_title: 'After-hours & Recovery Plan',
              plan_description: 'Reduce after-hours communication and restore recovery time with clear boundaries.',
              projected_impact: 'Risk projected to decrease by ~18 points over 2 weeks.',
              actions: [
                { text: 'Set quiet hours and route after-hours requests through a single escalation channel.', impacted_employees: ['Sara Lee'] },
                { text: 'Plan time off and lock it in calendar to ensure actual recovery.', impacted_employees: ['Sara Lee'] }
              ]
            }
          },
          'alex kim': {
            employee: { id: 'demo-alex', name: 'Alex Kim', role: 'Senior Engineer' },
            burnout_score: 71, risk_level: 'HIGH', week_start: getCurrentMonday(),
            priority_alert: '',
            this_week: {
              plan_title: 'Act Now to Prevent Escalation',
              plan_description: 'Overtime is trending up and recovery time is limited. Intervene before risk moves to critical.',
              projected_impact: 'Risk projected to decrease by ~12 points next week.',
              actions: [
                { text: 'Cap weekly hours at 48h and reassign overflow tasks to available team members.', impacted_employees: ['Alex Kim'] },
                { text: 'Schedule a 1:1 this week to discuss workload sustainability and prioritize ruthlessly.', impacted_employees: ['Alex Kim'] }
              ]
            },
            next_2_weeks: {
              plan_title: 'After-hours Boundary Plan',
              plan_description: 'Reduce after-hours communication and schedule a recovery break to prevent escalation.',
              projected_impact: 'Risk projected to decrease by ~10 points over 2 weeks.',
              actions: [
                { text: 'Define quiet hours and discourage non-urgent messaging outside work hours.', impacted_employees: ['Alex Kim'] },
                { text: 'Plan a vacation or long weekend within the next 3 weeks to break the accumulation cycle.', impacted_employees: ['Alex Kim'] }
              ]
            }
          },
          'maya chen': {
            employee: { id: 'demo-maya', name: 'Maya Chen', role: 'Product Designer' },
            burnout_score: 52, risk_level: 'MEDIUM', week_start: getCurrentMonday(),
            priority_alert: '',
            this_week: {
              plan_title: 'Early Warning: Monitor & Prevent',
              plan_description: 'Workload is elevated but manageable. Take preventive action now to keep risk from climbing.',
              projected_impact: 'Maintain current tier or reduce by ~6 points.',
              actions: [
                { text: 'Review current sprint load and defer any non-essential deliverables to next cycle.', impacted_employees: ['Maya Chen'] },
                { text: 'Confirm upcoming time off is scheduled and protected in the calendar.', impacted_employees: ['Maya Chen'] }
              ]
            },
            next_2_weeks: {
              plan_title: 'Preventive Recovery Plan',
              plan_description: 'Ensure sustainable pace by monitoring hours and planning deliberate recovery time.',
              projected_impact: 'Risk projected to stay stable or decrease by ~5 points.',
              actions: [
                { text: 'Set a soft weekly hours target (under 48h) and check in mid-week.', impacted_employees: ['Maya Chen'] },
                { text: 'Encourage a 3-day weekend or personal day within the next 2 weeks.', impacted_employees: ['Maya Chen'] }
              ]
            }
          },
          'omar hassan': {
            employee: { id: 'demo-omar', name: 'Omar Hassan', role: 'Marketing Lead' },
            burnout_score: 28, risk_level: 'LOW', week_start: getCurrentMonday(),
            priority_alert: '',
            this_week: {
              plan_title: 'Balanced Workload \u2014 Maintain',
              plan_description: 'Workload is healthy and sustainable. No intervention required \u2014 keep current habits.',
              projected_impact: 'Risk expected to remain low.',
              actions: [
                { text: 'No action needed. Continue current work rhythm and regular check-ins.', impacted_employees: ['Omar Hassan'] },
                { text: 'Optional: light 1:1 to acknowledge good balance and discuss career goals.', impacted_employees: ['Omar Hassan'] }
              ]
            },
            next_2_weeks: {
              plan_title: 'Sustain & Grow',
              plan_description: 'Use this low-risk window for development opportunities and knowledge sharing.',
              projected_impact: 'No change expected \u2014 stable low risk.',
              actions: [
                { text: 'Consider pairing with higher-risk colleagues to share load where possible.', impacted_employees: ['Omar Hassan'] },
                { text: 'Use available bandwidth for learning, mentoring, or process improvements.', impacted_employees: ['Omar Hassan'] }
              ]
            }
          }
        };
        const demoEmps = Array.isArray(window.__demoEmployees) ? window.__demoEmployees : (Array.isArray(employees) ? employees : []);
        for (const emp of demoEmps) {
          const key = String(emp?.full_name || emp?.name || '').toLowerCase();
          const plan = demoPlansData[key];
          if (plan) blocks.push(actionPlansFromLatestActionPlansJson(plan));
        }
        blocks = blocks.filter(Boolean);
      } else {
        const res = await fetch('/api/action-plans', {
          method: 'GET',
          headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer ' + token
          }
        });
        const payload = await readJsonSafe(res);
        if (!res.ok) {
          const msg = (payload && payload.error) ? payload.error : ('Request failed: ' + res.status);
          throw new Error(msg);
        }
        const employeesList = Array.isArray(payload?.employees) ? payload.employees : [];
        blocks = employeesList
          .map(r => actionPlansFromLatestActionPlansJson(r.latest_action_plans))
          .filter(Boolean);
      }

      // Sort by score descending so highest-risk employee is first
      blocks.sort((a,b) => (b.score || 0) - (a.score || 0));

      const allPlans = blocks.flatMap(b => b.plans || []);
      window.__lastActionPlans = allPlans;

      if (!blocks.length || !allPlans.length) {
        out.innerHTML = '<div style="text-align:center;padding:40px">'
          + '<div style="font-size:16px;font-weight:900;color:#64748b;margin-bottom:8px">No action plans yet.</div>'
          + '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">Save weekly metrics and generate a report to see AI plans.</div>'
          + '<button onclick="showSection(\'pulse\')" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:linear-gradient(135deg,rgba(255,107,107,0.08),rgba(255,107,107,0.02));border:1px solid rgba(255,107,107,0.2);border-radius:12px;cursor:pointer;font-weight:900;font-size:12px;color:#FF6B4A;transition:all 0.2s">Enter data \u2192</button>'
          + '</div>';
        return;
      }

      renderActionPlansLayout({ out, blocks });
    }catch(err){
      console.error('Action plans load failed:', err);
      out.innerHTML = '<div style="text-align:center;padding:40px">'
        + '<div style="font-size:16px;font-weight:900;color:#64748b;margin-bottom:8px">Unable to load action plans</div>'
        + '<div style="font-size:13px;color:#94a3b8">Please check your connection and try again.</div>'
        + '</div>';
    }
  })();
}

function renderActionPlansLayout({ out, blocks }){
  if (!out) return;

  const norm = (t) => String(t || '').trim().toLowerCase();

  const riskColor = (score) => {
    if (score >= 80) return '#EF4444';
    if (score >= 60) return '#FFB347';
    if (score >= 35) return '#FBBF24';
    return '#22C55E';
  };
  const riskLabel = (score) => {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 35) return 'MEDIUM';
    return 'LOW';
  };

  const renderPlanCard = (p, borderColor, columnLabel) => {
    const keySafe = escapeHtml(String(p.key || 'plan'));
    const actions = Array.isArray(p.actions) ? p.actions.filter(Boolean).slice(0, 8) : [];

    let html = `<div class="action-plan-card" data-plan-key="${keySafe}" style="background:#fff;border:1px solid rgba(0,0,0,0.08);border-top:3px solid ${escapeHtml(borderColor)};border-radius:14px;padding:16px;box-sizing:border-box;overflow:hidden;min-width:0">`;
    html += `<div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:${escapeHtml(borderColor)};margin-bottom:8px">${escapeHtml(columnLabel)}</div>`;
    html += `<div class="plan-title" style="font-family:'Syne',system-ui;font-weight:900;color:#111827;font-size:15px;line-height:1.3">${escapeHtml(p.title)}</div>`;
    if (p.explanation) {
      html += `<div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.5">${escapeHtml(p.explanation)}</div>`;
    }
    if (p.projectionNote) {
      html += `<div style="margin-top:8px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:10px;padding:8px 10px;font-size:11px;color:#64748b;font-style:italic;line-height:1.5">${escapeHtml(String(p.projectionNote))}</div>`;
    }

    html += '<div style="margin-top:12px;display:grid;gap:8px">';
    for (const a of actions) {
      const text = String(a?.text || a || '').trim();
      if (!text) continue;
      const impacted = Array.isArray(a?.impacted) ? a.impacted.filter(Boolean) : [];
      const st = (getPlanActionState(p).actions[text] || { selected:true, deleted:false });
      if (st.deleted) continue;
      const checked = !!st.selected;
      const planKey = encodeURIComponent(String(p.key || 'plan'));
      const actionEnc = encodeURIComponent(text);
      const completedClass = checked ? '' : 'completed';

      html += `<div class="action-item ${completedClass}" data-plan-key="${planKey}" data-action="${actionEnc}" style="display:flex;align-items:flex-start;gap:8px;border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:10px;cursor:pointer;transition:all 0.15s">`;
      html += `<div class="action-checkbox" style="width:16px;height:16px;border-radius:5px;border:1.5px solid ${checked ? '#6366f1' : 'rgba(0,0,0,0.20)'};background:${checked ? '#6366f1' : 'transparent'};display:grid;place-items:center;flex-shrink:0;margin-top:1px">`;
      html += checked ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
      html += '</div>';
      html += '<div style="flex:1;min-width:0">';
      html += `<div class="action-text action-item-text" style="font-size:12px;color:#111827;font-weight:600;line-height:1.55">${escapeHtml(text)}</div>`;
      if (impacted.length) {
        html += `<div style="margin-top:4px;font-size:11px;color:#64748b;font-weight:700">Impacted: ${escapeHtml(impacted.join(', '))}</div>`;
      }
      html += '</div>';
      html += `<button class="action-delete-btn" type="button" title="Remove" style="width:22px;height:22px;border-radius:8px;background:transparent;border:1px solid rgba(0,0,0,0.08);cursor:pointer;display:grid;place-items:center;flex-shrink:0;color:#9ca3af;font-size:13px">\u00d7</button>`;
      html += '</div>';
    }
    html += '</div>';

    html += '<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px">';
    html += `<button type="button" class="copy-plan-btn" data-plan-key="${keySafe}" style="background:transparent;border:1px solid rgba(0,0,0,0.12);border-radius:10px;padding:8px 10px;font-size:11px;font-weight:800;color:#6b7280;cursor:pointer">Copy plan</button>`;
    html += `<button type="button" class="send-plan-btn" data-plan-key="${keySafe}" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.20);border-radius:10px;padding:8px 10px;font-size:11px;font-weight:900;color:#6366f1;cursor:pointer">Send plan</button>`;
    html += '</div>';

    html += '</div>';
    return html;
  };

  const renderEmployeeView = (block) => {
    const name = block.employeeName || 'Employee';
    const score = Number(block.score || 0);
    const risk = riskLabel(score);
    const color = riskColor(score);
    const thisWeekPlan = (block.plans || []).find(p => norm(p.timeframe) === 'this week');
    const next2Plan = (block.plans || []).find(p => norm(p.timeframe) === 'next 2 weeks' || norm(p.timeframe) === 'next two weeks');

    let html = '';
    // Employee header
    html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">';
    html += `<div style="font-family:'Syne',system-ui;font-weight:900;font-size:18px;color:#0f172a">${escapeHtml(name)}</div>`;
    html += `<div style="font-size:13px;font-weight:900;color:#64748b">\u00b7 Score: ${score}</div>`;
    html += `<span style="font-size:10px;font-weight:900;padding:4px 10px;border-radius:999px;background:${escapeHtml(color)}18;border:1px solid ${escapeHtml(color)}44;color:${escapeHtml(color)};letter-spacing:0.06em">${escapeHtml(risk)}</span>`;
    html += '</div>';

    // Two-column grid
    html += '<div class="action-plans-grid" style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:14px;max-width:100%;box-sizing:border-box">';
    if (thisWeekPlan) {
      html += renderPlanCard(thisWeekPlan, '#FF6B4A', 'This Week');
    } else {
      html += '<div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:32px 16px;text-align:center;color:#94a3b8;font-weight:800;font-size:13px">No plan for this week</div>';
    }
    if (next2Plan) {
      html += renderPlanCard(next2Plan, '#6366f1', 'Next 2 Weeks');
    } else {
      html += '<div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:14px;padding:32px 16px;text-align:center;color:#94a3b8;font-weight:800;font-size:13px">No plan for next 2 weeks</div>';
    }
    html += '</div>';
    return html;
  };

  let pageHtml = '';

  // Priority banner — always the single highest-risk employee (computed dynamically)
  const topBlock = blocks[0];
  if (topBlock) {
    const topName = topBlock.employeeName || 'Employee';
    const topScore = Number(topBlock.score || 0);
    const topAlert = topBlock.priority_alert || ('Priority Action This Week: ' + topName + ' (Score: ' + topScore + ')');
    pageHtml += `<div style="margin-bottom:16px;background:linear-gradient(135deg,#EF4444,#FF6B4A);color:#fff;border-radius:14px;padding:14px 16px;font-weight:900;font-size:14px;line-height:1.5;box-shadow:0 4px 16px rgba(239,68,68,0.18)">${escapeHtml(topAlert)}</div>`;
  }

  // Tab/pill navigation
  pageHtml += '<div class="sap-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px;border-bottom:1px solid rgba(0,0,0,0.06);padding-bottom:14px">';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const name = b.employeeName || 'Employee';
    const score = Number(b.score || 0);
    const color = riskColor(score);
    const isActive = i === 0;
    pageHtml += `<button type="button" class="sap-tab-btn" data-sap-idx="${i}" style="padding:8px 14px;border-radius:999px;font-size:12px;font-weight:900;cursor:pointer;transition:all 0.15s;border:1px solid ${isActive ? escapeHtml(color) + '66' : 'rgba(0,0,0,0.10)'};background:${isActive ? escapeHtml(color) + '14' : 'transparent'};color:${isActive ? escapeHtml(color) : '#64748b'}">${escapeHtml(name)} \u00b7 ${score}</button>`;
  }
  pageHtml += '</div>';

  // Employee content panels
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!(block.plans || []).length) continue;
    pageHtml += `<div class="sap-panel" data-sap-idx="${i}" style="display:${i === 0 ? 'block' : 'none'}">`;
    pageHtml += renderEmployeeView(block);
    pageHtml += '</div>';
  }

  out.innerHTML = pageHtml;

  // Tab click handler
  out.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.sap-tab-btn');
    if (!btn) return;
    const idx = btn.getAttribute('data-sap-idx');
    if (idx == null) return;

    // Update tab styles
    out.querySelectorAll('.sap-tab-btn').forEach((t, i) => {
      const b = blocks[i];
      const sc = Number(b?.score || 0);
      const c = riskColor(sc);
      const active = String(i) === String(idx);
      t.style.border = `1px solid ${active ? c + '66' : 'rgba(0,0,0,0.10)'}`;
      t.style.background = active ? c + '14' : 'transparent';
      t.style.color = active ? c : '#64748b';
    });

    // Show/hide panels
    out.querySelectorAll('.sap-panel').forEach(p => {
      p.style.display = p.getAttribute('data-sap-idx') === String(idx) ? 'block' : 'none';
    });
  });
}


function persistOverviewStats({ activeEmployees, atRiskEmployees, atRiskPreview } = {}){
  try{
    const payload = {
      activeEmployees: Number(activeEmployees || 0),
      atRiskEmployees: Number(atRiskEmployees || 0),
      atRiskPreview: Array.isArray(atRiskPreview) ? atRiskPreview : [],
      at: new Date().toISOString()
    };
    writeJsonLocalStorage('peoplera_overview_stats', payload);
  }catch(e){ /* noop */ }

  const empEl = document.getElementById('statEmployees');
  if (empEl && Number.isFinite(Number(activeEmployees))) empEl.textContent = String(activeEmployees);
  const riskEl = document.getElementById('statAtRisk');
  if (riskEl && Number.isFinite(Number(atRiskEmployees))) riskEl.textContent = String(atRiskEmployees);
}

// Event delegation for action plan interactions and employee details
document.addEventListener('click', function(e) {
  if (e.target.closest('#btnSettingsTabProfile')) {
    e.preventDefault();
    try{ openSettingsSubtab('profile'); }catch(err){ /* noop */ }
    return;
  }

  if (e.target.closest('#btnSettingsTabIntegrations')) {
    e.preventDefault();
    try{ openSettingsSubtab('integrations'); }catch(err){ /* noop */ }
    try{ ensureSettingsIntegrationsUiLoaded(); }catch(err){ /* noop */ }
    return;
  }

  if (e.target.closest('#your-team-header') || e.target.closest('#yourTeamHeader')) {
    // Don't toggle when clicking action buttons inside the header
    if (e.target.closest('#btnAddEmployee') || e.target.closest('#btnTryDemoData') || e.target.closest('#btnClearDemoData') || e.target.closest('#btnConnectHrSystem') || e.target.closest('#btnIntegrationSyncNow')) {
      return;
    }
    e.preventDefault();
    try{ toggleYourTeamSection(); }catch(err){ /* noop */ }
    return;
  }

  if (e.target.closest('[data-demo-cta="csv"]')) {
    e.preventDefault();
    try{ openPulseCsvPicker(); }catch(err){ /* noop */ }
    return;
  }

  if (e.target.closest('.integration-connect-btn')) {
    e.preventDefault();
    const btn = e.target.closest('.integration-connect-btn');
    const pk = btn?.getAttribute('data-provider') || '';
    (async ()=>{
      try{
        const rows = await getIntegrationCredentialsForUser();
        const existing = (rows || []).find(r => String(r?.integration_name || '').toLowerCase() === String(pk).toLowerCase() && r?.is_active === true) || null;
        openIntegrationConnectModal(pk, existing);
      }catch(err){
        showToast(err?.message || 'Unable to open integration', 'error');
      }
    })();
    return;
  }

  if (e.target.closest('.integration-disconnect-btn')) {
    e.preventDefault();
    const btn = e.target.closest('.integration-disconnect-btn');
    const pk = btn?.getAttribute('data-provider') || '';
    ;(async ()=>{
      try{
        await disconnectIntegration(pk);
        await ensureSettingsIntegrationsUiLoaded();
        await updateBurnoutIntegrationIndicator();
        await renderOverviewIntegrationOnboarding();
        try{ updateSidebarStatusCard(); }catch(e){}
      }catch(err){
        showToast(err?.message || 'Disconnect failed', 'error');
      }
    })();
    return;
  }

  if (e.target.closest('.integration-save-btn')) {
    e.preventDefault();
    const btn = e.target.closest('.integration-save-btn');
    const pk = btn?.getAttribute('data-provider') || '';
    const modal = e.target.closest('[data-integration-modal="1"]');
    if (!modal) return;
    ;(async ()=>{
      const reset = setBusy(btn, 'Saving…');
      try{
        const errEl = modal.querySelector('#integrationModalError');
        if (errEl) {
          errEl.textContent = '';
          errEl.style.display = 'none';
        }
        await saveIntegrationFromModal(pk, modal);
        modal.remove();
        await ensureSettingsIntegrationsUiLoaded();
        await updateBurnoutIntegrationIndicator();
        if (pk === 'hibob') {
          await syncHiBob();
        }
        try{ updateSidebarStatusCard(); }catch(e){}
      }catch(err){
        const errEl = modal.querySelector('#integrationModalError');
        if (errEl) {
          errEl.textContent = 'Connection could not be saved. Please try again or contact support.';
          errEl.style.display = '';
        }
      }finally{ reset(); }
    })();
    return;
  }

  if (e.target.closest('.integration-test-btn')) {
    e.preventDefault();
    const btn = e.target.closest('.integration-test-btn');
    const pk = btn?.getAttribute('data-provider') || '';
    ;(async ()=>{
      const reset = setBusy(btn, 'Testing…');
      try{
        await testIntegrationConnection(pk);
        showToast('Connection successful', 'success');
      }catch(err){
        showToast(err?.message || 'Connection failed', 'error');
      }finally{ reset(); }
    })();
    return;
  }

  if (e.target.closest('#btnIntegrationSyncNow')) {
    e.preventDefault();
    const btn = e.target.closest('#btnIntegrationSyncNow');
    const pk = String(btn?.getAttribute('data-provider') || '').toLowerCase();
    ;(async ()=>{
      const reset = setBusy(btn, 'Syncing…');
      try{
        if (pk === 'hibob') {
          await syncHiBob();
        } else {
          showToast('Sync not available for this provider yet', 'error');
        }
      }catch(err){
        showToast(err?.message || 'Sync failed', 'error');
      }finally{ reset(); }
    })();
    return;
  }

  if (e.target.closest('.action-checkbox')) {
    const item = e.target.closest('.action-item');
    if (item) {
      item.classList.toggle('completed');
      // Update localStorage
      const planKey = decodeURIComponent(item.getAttribute('data-plan-key') || '');
      const actionText = decodeURIComponent(item.getAttribute('data-action') || '');
      togglePlanAction(planKey, actionText);
    }
  }

  if (e.target.closest('.action-delete-btn')) {
    const item = e.target.closest('.action-item');
    if (item) {
      item.remove();
      // Update localStorage
      const planKey = decodeURIComponent(item.getAttribute('data-plan-key') || '');
      const actionText = decodeURIComponent(item.getAttribute('data-action') || '');
      deletePlanAction(planKey, actionText);
    }
  }

  if (e.target.closest('.send-plan-btn')) {
    e.preventDefault();
    const card = e.target.closest('.action-plan-card');
    if (!card) return;
    const key = card.getAttribute('data-plan-key') || '';
    const plan = (window.__lastActionPlans || []).find(x => x && String(x.key) === String(key));
    if (!plan) return;
    openSendPlanModal({ plan, employees: window.__plansEmployeesList || [] });
    return;
  }

  if (e.target.closest('.copy-plan-btn')) {
    e.preventDefault();
    const card = e.target.closest('.action-plan-card');
    if (!card) return;
    const key = card.getAttribute('data-plan-key') || '';
    const plan = (window.__lastActionPlans || []).find(x => x && String(x.key) === String(key));
    if (!plan) return;
    copyPlanPlainTextToClipboard(plan);
    return;
  }

  if (e.target.closest('.show-details-btn')) {
    const card = e.target.closest('.employee-card');
    if (card) toggleEmployeeCardDetails(card);
    return;
  }

  if (e.target.closest('.delete-employee-btn')) {
    const card = e.target.closest('.employee-card');
    const employeeId = card?.dataset?.employeeId;
    if (!card || !employeeId) return;
    if (employeeId && employeeId.toString().startsWith('demo-')) return;
    if (!confirm('Delete this employee?')) return;
    supabase.from('employees').delete().eq('id', employeeId).eq('user_id', session?.user?.id).then(() => {
      card.remove();
    });
    return;
  }

  if (e.target.closest('.edit-employee-btn')) {
    const card = e.target.closest('.employee-card');
    if (!card) return;
    const employeeId = card.dataset.employeeId;
    const name = card.querySelector('.employee-name')?.textContent || '';
    const title = card.querySelector('.employee-title')?.textContent || '';
    const details = card.querySelector('.employee-details');
    if (!details) return;
    details.style.display = 'block';
    details.setAttribute('data-orig', details.innerHTML);
    details.innerHTML = `
      <div style="padding:12px 0;display:flex;flex-direction:column;gap:8px;">
        <input class="edit-name" value="${escapeHtml(name)}" placeholder="Full name" style="padding:8px;border:1px solid #e0e0e0;border-radius:6px;">
        <input class="edit-title" value="${escapeHtml(title)}" placeholder="Job title" style="padding:8px;border:1px solid #e0e0e0;border-radius:6px;">
        <div style="display:flex;gap:8px;">
          <button type="button" class="save-edit-btn" data-id="${escapeHtml(employeeId)}" style="padding:6px 16px;background:linear-gradient(135deg,#FF6B4A,#FFB347);color:white;border:none;border-radius:6px;cursor:pointer;">Save</button>
          <button type="button" class="cancel-edit-btn" style="padding:6px 16px;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer;">Cancel</button>
        </div>
      </div>`;
    return;
  }

  if (e.target.closest('.save-edit-btn')) {
    const card = e.target.closest('.employee-card');
    const employeeId = e.target.closest('.save-edit-btn')?.dataset?.id;
    if (!card || !employeeId) return;
    if (employeeId && employeeId.toString().startsWith('demo-')) return;
    const newName = card.querySelector('.edit-name')?.value || '';
    const newTitle = card.querySelector('.edit-title')?.value || '';
    supabase.from('employees').update({ full_name: newName, job_title: newTitle }).eq('id', employeeId).eq('user_id', session?.user?.id).then(() => {
      const nm = card.querySelector('.employee-name');
      const tt = card.querySelector('.employee-title');
      if (nm) nm.textContent = newName;
      if (tt) tt.textContent = newTitle;
      const details = card.querySelector('.employee-details');
      if (details) {
        details.style.display = 'none';
        const orig = details.getAttribute('data-orig');
        if (orig) details.innerHTML = orig;
      }
    });
    return;
  }

  if (e.target.closest('.cancel-edit-btn')) {
    const card = e.target.closest('.employee-card');
    if (!card) return;
    const details = card.querySelector('.employee-details');
    if (!details) return;
    const orig = details.getAttribute('data-orig');
    if (orig) details.innerHTML = orig;
    details.style.display = 'none';
    return;
  }

  if (e.target.closest('.save-employee-all-btn')) {
    const btn = e.target.closest('.save-employee-all-btn');
    const card = e.target.closest('.employee-card');
    const employeeId = card?.dataset?.employeeId;
    if (!btn || !card || !employeeId) return;
    if (employeeId && employeeId.toString().startsWith('demo-')) return;

    const origText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const startDate = card.querySelector('.emp-start')?.value || '';
    const birthDate = card.querySelector('.emp-birth')?.value || '';
    const lastVacation = card.querySelector('.emp-vac')?.value || '';

    const weeklyHours = parseFloat(card.querySelector('.wk-hours')?.value || '') || 0;
    const weekendHours = parseFloat(card.querySelector('.wk-weekend')?.value || '') || 0;
    const afterHoursMessages = parseInt(card.querySelector('.wk-messages')?.value || '') || 0;
    const sickDays = parseFloat(card.querySelector('.wk-sick')?.value || '') || 0;

    if (!startDate) {
      showToast('Start date is required', 'error');
      btn.textContent = origText;
      btn.disabled = false;
      return;
    }

    (async ()=>{
      try{
        const { error: empErr } = await supabase
          .from('employees')
          .update({
            start_date: startDate,
            birth_date: birthDate || null,
            last_vacation: lastVacation || null
          })
          .eq('id', employeeId)
          .eq('user_id', session?.user?.id);
        if (empErr) throw empErr;

        const monday = getCurrentMonday();
        const payload = {
          employee_id: employeeId,
          week_start: monday,
          weekly_hours: weeklyHours,
          weekend_hours: weekendHours,
          after_hours_messages: afterHoursMessages,
          sick_days: sickDays,
          overtime_hours: Math.max(0, weeklyHours - 40)
        };
        if (payload.employee_id && payload.employee_id.toString().startsWith('demo-')) return;
        const { error: wkErr } = await supabase
          .from('weekly_metrics')
          .upsert(payload);
        if (wkErr) throw wkErr;

        showToast('Saved');
        try{ await generateActionPlansForEmployee(employeeId); }catch(e){ /* noop */ }
        await loadPulseData();
      }catch(err){
        console.error('Unified save failed:', err);
        showToast('Error saving data', 'error');
      }finally{
        btn.textContent = origText;
        btn.disabled = false;
      }
    })();

    return;
  }

  if (e.target.closest('.mark-action-btn')) {
    const btn = e.target.closest('.mark-action-btn');
    const card = btn.closest('.hotspot-card');
    if (!btn || !card) return;

    const applyState = (isTaken) => {
      btn.textContent = isTaken ? '✓ Marked as done' : 'Mark as done';
      btn.style.background = '#FFFFFF';
      btn.style.border = `1px solid ${isTaken ? '#BBF7D0' : '#E7E5E4'}`;
      btn.style.borderRadius = '8px';
      btn.style.padding = '10px 12px';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = '900';
      btn.style.color = isTaken ? '#16A34A' : '#64748b';
      btn.style.cursor = 'pointer';
      btn.disabled = false;
      card.style.opacity = isTaken ? '0.6' : '1';
      card.style.transition = 'opacity 0.3s ease';
    };

    // Determine current state from button text
    const wasTaken = btn.textContent.trim().startsWith('✓');
    const next = !wasTaken;

    // Try to persist to localStorage (works for real mode)
    try{
      const hotspots = readJsonLocalStorage('peoplera_team_hotspots', []);
      const arr = Array.isArray(hotspots) ? hotspots : [];
      const name = card.querySelector('.employee-name')?.textContent || '';
      if (arr.length && name) {
        const updated = arr.map(h => {
          if (String(h.name||'') !== String(name||'')) return h;
          return { ...h, actionTaken: next };
        });
        writeJsonLocalStorage('peoplera_team_hotspots', updated);
      }
    }catch(err){ /* noop */ }

    // Always apply visual state (works in demo + real mode)
    applyState(next);
    return;
  }
});

// Add CSS for completed state
const actionPlanStyle = document.createElement('style');
actionPlanStyle.textContent = `
  .action-item.completed {
    opacity: 0.5;
  }
  .action-item.completed .action-text {
    text-decoration: line-through;
  }
`;
document.head.appendChild(actionPlanStyle);

function renderTeamHotspotsPage(){
  hideBurnoutMainContainer();
  const out = document.getElementById('hotspotsContent');
  if (!out) return;

  let hotspots;
  if (isDemoEmployeesActive()) {
    // Score demo employees through the real model
    const demoEmps = Array.isArray(window.__demoEmployees) && window.__demoEmployees.length
      ? window.__demoEmployees : (Array.isArray(employees) ? employees : []);
    for (const e of demoEmps) {
      if (!e) continue;
      const m = e.__demoWeekly || weeklyData[e.id] || {};
      const score = computeBurnoutScoreFromSignals({
        weeklyHours: Number(m.weekly_hours || 0),
        weekendHours: Number(m.weekend_hours || 0),
        afterHoursMessages: Number(m.after_hours_messages || 0),
        sickDays: Number(m.sick_days || 0),
        overtimeHours: Number(m.overtime_hours || 0),
        lastVacation: String(e.last_vacation || 'unknown')
      });
      e.burnoutScore = score;
      e.burnout_score = score;
      e.riskLevel = classifyEmployeeRiskLevel(score);
      e.risk_level = e.riskLevel.toUpperCase();
    }
    hotspots = demoEmps.map(e => {
      const m = e.__demoWeekly || weeklyData[e.id] || {};
      const proxy = {
        weeklyHours: Number(m.weekly_hours || 0),
        afterHoursMessages: Number(m.after_hours_messages || 0),
        sickDays: Number(m.sick_days || 0),
        lastVacation: String(e.last_vacation || 'unknown')
      };
      const drivers = computeHeuristicDrivers(proxy);
      const level = normalizeRiskLevel(e.riskLevel || e.risk_level || 'low');
      return {
        name: String(e.full_name || e.name || '').trim() || 'Employee',
        burnoutScore: Number(e.burnoutScore || e.burnout_score || 0),
        riskLevel: level,
        drivers,
        recommendedAction: computeRecommendedAction(level, drivers),
        weeklyHours: proxy.weeklyHours,
        weekendHours: Number(m.weekend_hours || 0),
        afterHoursMessages: proxy.afterHoursMessages,
        sickDays: proxy.sickDays
      };
    });
  } else {
    const data = readJsonLocalStorage('peoplera_team_hotspots', []);
    hotspots = Array.isArray(data) ? data : [];
  }
  window.__lastPulseEmployees = hotspots.map(h => ({
    name: h.name,
    burnoutScore: h.burnoutScore,
    riskLevel: h.riskLevel,
    weeklyHours: h.weeklyHours,
    weekendHours: h.weekendHours,
    afterHoursMessages: h.afterHoursMessages,
    sickDays: h.sickDays
  }));

  if (!hotspots.length) {
    out.innerHTML = '<div style="text-align:center;padding:0">'
      + '<div style="font-size:16px;font-weight:900;color:#64748b;margin-bottom:8px">Run a burnout analysis to see team hotspots</div>'
      + '<div style="font-size:13px;color:#94a3b8">Team hotspots will appear here after generating a full report.</div>'
      + '</div>';
    return;
  }

  const deriveRecommendedAction = (h) => {
    const name = String(h?.name || '').trim();
    const score = Math.max(0, Math.min(100, Number(h?.burnoutScore) || 0));
    const drivers = Array.isArray(h?.drivers) ? h.drivers.map(d => String(d || '').trim()).filter(Boolean) : [];
    const top = String(drivers[0] || '').toLowerCase();

    // No hardcoded name/score overrides — derive from drivers dynamically

    if (top.includes('after-hours') || top.includes('after hours') || top.includes('messages')) {
      return 'Set after-hours boundaries and reduce non-urgent messaging outside work hours';
    }
    if (top.includes('weekend')) {
      return 'Reduce weekend work by clarifying what is urgent and rotating coverage';
    }
    if (top.includes('sick')) {
      return 'Check in 1:1 and reduce workload to prevent further sick leave escalation';
    }
    if (top.includes('vacation') || top.includes('time off')) {
      return 'Plan time off in the next 2 weeks and ensure coverage for critical work';
    }
    if (top.includes('overtime') || top.includes('weekly hours') || top.includes('hours')) {
      return 'Redistribute workload and cap weekly hours for the next 2 weeks';
    }

    const lvl = normalizeRiskLevel(h?.riskLevel);
    if (lvl === 'critical') return 'Schedule 1:1 this week';
    if (lvl === 'high') return 'Review workload distribution and reduce top drivers this week';
    return 'Monitor signals and take a small action on the top driver this week';
  };

  const renderCardHtml = (h) => {
    const lvl = normalizeRiskLevel(h.riskLevel);
    const color = lvl === 'critical' ? '#ff3b3b' : lvl === 'high' ? '#FF6B6B' : lvl === 'medium' ? '#FFD93D' : '#00e5a0';
    const actionTaken = !!h.actionTaken;
    const cardOpacity = actionTaken ? '0.6' : '1';
    const recommendedActionText = deriveRecommendedAction(h);

    let html = `<div class="hotspot-card" style="background:rgba(255,255,255,0.95);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:18px;opacity:${cardOpacity};transition:opacity 0.3s">`;
    html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">';
    html += '<div>';
    html += `<div class="employee-name" style="font-family:'Syne',system-ui;font-weight:900;color:#111827;font-size:16px">${escapeHtml(h.name)}</div>`;
    html += `<div style="font-size:12px;color:#64748b;margin-top:6px">Top driver: <span style="font-weight:800;color:#0f172a">${escapeHtml((h.drivers || [])[0] || '—')}</span></div>`;
    html += '</div>';
    html += '<div style="text-align:right;flex-shrink:0">';
    html += `<div style="font-family:'Syne',system-ui;font-weight:900;font-size:20px;color:${color};line-height:1">${Number(h.burnoutScore)||0}</div>`;
    html += '<div style="font-size:10px;color:#94a3b8">/100</div>';
    html += '</div>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">';
    html += `<span style="background:${color}22;border:1px solid ${color}55;border-radius:8px;padding:5px 12px;font-size:10px;font-weight:900;color:${color};font-family:'Syne',system-ui;text-transform:uppercase;letter-spacing:0.05em">${escapeHtml(lvl)}</span>`;
    html += '</div>';
    html += '<div style="margin-top:10px;font-size:12px;color:#64748b;line-height:1.6">';
    for (const d of (Array.isArray(h.drivers) ? h.drivers : []).slice(0,3)) {
      html += `<span style="display:inline-block;margin:0 6px 6px 0;background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.08);border-radius:999px;padding:3px 10px;font-size:11px;color:#334155;font-weight:800">${escapeHtml(d)}</span>`;
    }
    html += '</div>';
    html += `<div style="margin-top:10px;background:${color}0F;border:1px solid ${color}22;border-radius:12px;padding:10px 12px">`;
    html += `<div style="font-size:10px;font-weight:900;color:${color};letter-spacing:0.08em;margin-bottom:6px">RECOMMENDED ACTION</div>`;
    html += `<div style="font-size:12px;font-weight:800;color:#0f172a">${escapeHtml(recommendedActionText || h.recommendedAction || '')}</div>`;
    html += '</div>';
    html += `<button type="button" class="mark-action-btn" style="margin-top:10px;background:#FFFFFF;border:1px solid ${actionTaken ? '#BBF7D0' : '#E7E5E4'};border-radius:8px;padding:10px 12px;font-size:12px;font-weight:900;color:${actionTaken ? '#16A34A' : '#64748b'};cursor:pointer;width:100%">${actionTaken ? '✓ Marked as done' : 'Mark as done'}</button>`;
    html += '</div>';
    return html;
  };

  const critical = [];
  const high = [];
  const mediumLow = [];

  for (const h of hotspots) {
    const score = Math.max(0, Math.min(100, Number(h?.burnoutScore) || 0));
    if (score >= 80) critical.push(h);
    else if (score >= 60) high.push(h);
    else mediumLow.push(h);
  }

  const buildCol = ({ title, color, items, emptyText }) => {
    const count = Array.isArray(items) ? items.length : 0;
    let html = '<div style="display:flex;flex-direction:column;gap:12px;min-width:0">';
    html += `<div style="position:sticky;top:0;z-index:2;background:rgba(248,250,252,0.92);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:10px 12px">`;
    html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">`;
    html += `<div style="display:flex;align-items:center;gap:8px;min-width:0">`;
    html += `<span style="width:10px;height:10px;border-radius:999px;background:${color};box-shadow:0 0 0 3px ${color}22;flex-shrink:0"></span>`;
    html += `<div style="font-size:12px;font-weight:900;color:#0f172a;letter-spacing:0.06em">${escapeHtml(title)} · ${count}</div>`;
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;

    if (!count) {
      html += `<div style="border:1px dashed rgba(0,0,0,0.14);border-radius:14px;padding:14px 12px;color:#94a3b8;font-size:12px;font-weight:800">${escapeHtml(emptyText)}</div>`;
    } else {
      for (const h of items) html += renderCardHtml(h);
    }

    html += '</div>';
    return html;
  };

  let html = '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start">';
  html += buildCol({
    title: 'CRITICAL',
    color: '#ff3b3b',
    items: critical,
    emptyText: 'No employees at this level this week ✓'
  });
  html += buildCol({
    title: 'HIGH',
    color: '#F97316',
    items: high,
    emptyText: 'No employees at this level this week ✓'
  });
  html += buildCol({
    title: 'MEDIUM & LOW',
    color: '#00e5a0',
    items: mediumLow,
    emptyText: 'No employees at this level this week ✓'
  });
  html += '</div>';

  out.innerHTML = html;
}

function markTeamHotspotActionTaken(name){
  const key = 'peoplera_team_hotspots';
  const hotspots = readJsonLocalStorage(key, []);
  if (!Array.isArray(hotspots)) return;
  const updated = hotspots.map(h => {
    if (String(h.name || '').toLowerCase() === String(name || '').toLowerCase()) {
      return { ...h, actionTaken: true };
    }
    return h;
  });
  writeJsonLocalStorage(key, updated);
  renderTeamHotspotsPage();
}

function formatTsDdMmYyyyHhMm(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = String(dt.getFullYear());
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

async function loadDynamicInsightsFromSupabase(){
  const s = (await supabase.auth.getSession()).data?.session;
  if (!s) return { insights: [], recommendations: [], updatedAt: new Date() };

  const { data: empRows, error: empErr } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('user_id', s.user.id);
  if (empErr) throw empErr;
  const empMap = {};
  for (const r of (empRows || [])) {
    if (r.id) empMap[r.id] = String(r.full_name || 'Employee').trim();
  }
  const empIds = Object.keys(empMap);
  if (!empIds.length) return { insights: [], recommendations: [], updatedAt: new Date() };
  const teamSize = empIds.length;

  const { data: allRows, error: metricsErr } = await supabase
    .from('weekly_metrics')
    .select('*')
    .in('employee_id', empIds);
  if (metricsErr) throw metricsErr;
  const rows = Array.isArray(allRows) ? allRows : [];
  if (!rows.length) return { insights: [], recommendations: [], updatedAt: new Date() };

  const byWeek = {};
  for (const r of rows) {
    const wk = String(r.week_start || '').trim();
    if (!wk) continue;
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push(r);
  }
  const weeks = Object.keys(byWeek).sort();
  if (!weeks.length) return { insights: [], recommendations: [], updatedAt: new Date() };

  const latestWeek = weeks[weeks.length - 1];
  const latestRows = byWeek[latestWeek] || [];

  const scoreForMetric = (m) => computeBurnoutScoreFromSignals({
    weeklyHours: Number(m.weekly_hours || 0),
    weekendHours: Number(m.weekend_hours || 0),
    afterHoursMessages: Number(m.after_hours_messages || 0),
    sickDays: Number(m.sick_days || 0),
    overtimeHours: Number(m.overtime_hours || Math.max(0, Number(m.weekly_hours || 0) - 40))
  });

  const weekAvgScore = (wk) => {
    const wkRows = byWeek[wk] || [];
    const scores = wkRows.map(scoreForMetric);
    return scores.length ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
  };

  const companyScore = weekAvgScore(latestWeek);
  const riskLabel = getRiskLevel(companyScore);

  // Trend — require at least 2 distinct weeks
  const distinctWeeks = weeks.filter((w, i, arr) => i === 0 || w !== arr[i-1]);
  const hasTrend = distinctWeeks.length >= 2;
  const last3 = distinctWeeks.slice(Math.max(0, distinctWeeks.length - 3));
  const series3 = last3.map(wk => ({ wk, score: weekAvgScore(wk) }));
  const first3 = series3[0]?.score;
  const last3Score = series3[series3.length - 1]?.score;
  const delta3 = (hasTrend && Number.isFinite(first3) && Number.isFinite(last3Score)) ? (last3Score - first3) : null;

  // Employee-level scores + names (latest week)
  const empScored = latestRows.map(m => ({
    id: m.employee_id,
    name: empMap[m.employee_id] || 'Employee',
    score: scoreForMetric(m),
    hours: Number(m.weekly_hours || 0),
    weekendH: Number(m.weekend_hours || 0),
    afterH: Number(m.after_hours_messages || 0),
    sickD: Number(m.sick_days || 0),
    overtime: Number(m.overtime_hours || Math.max(0, Number(m.weekly_hours || 0) - 40))
  }));
  empScored.sort((a,b) => b.score - a.score);

  const criticalEmps = empScored.filter(e => e.score >= 80);
  const highRiskEmps = empScored.filter(e => e.score >= 60);

  // Driver buckets with named employees
  const overHoursEmps = empScored.filter(e => e.hours > 50);
  const overtimeEmps = empScored.filter(e => e.overtime > 10);
  const weekendEmps = empScored.filter(e => e.weekendH > 10);
  const afterHoursEmps = empScored.filter(e => e.afterH > 25);
  const sickEmps = empScored.filter(e => e.sickD > 2);

  const nameList = (arr, limit) => {
    const names = arr.slice(0, limit || 3).map(e => e.name);
    if (arr.length > (limit || 3)) names.push(`+${arr.length - (limit || 3)} more`);
    return names.join(', ');
  };
  const nameWithHours = (arr, field, unit, limit) => {
    const items = arr.slice(0, limit || 3).map(e => `${e.name} (${e[field]}${unit})`);
    if (arr.length > (limit || 3)) items.push(`+${arr.length - (limit || 3)} more`);
    return items.join(', ');
  };

  const insights = [];

  // CRITICAL
  if (companyScore > 70 || criticalEmps.length >= 2) {
    const names = criticalEmps.length ? nameList(criticalEmps, 3) : '';
    insights.push({
      type: 'CRITICAL',
      color: '#EF4444',
      icon: '!',
      title: `Company burnout score: ${companyScore}/100 (${riskLabel} risk)`,
      detail: criticalEmps.length
        ? `${criticalEmps.length} of ${teamSize} employees at critical risk: ${names}. Immediate intervention recommended.`
        : `Team average is critically high. Immediate workload reduction recommended across the team.`
    });
  }

  // WARNING — name the employees
  const driverInsights = [];
  if (overHoursEmps.length) driverInsights.push({ key: 'weekly_hours', count: overHoursEmps.length, text: `${nameWithHours(overHoursEmps, 'hours', 'h', 3)} exceeded 50h weekly hours` });
  if (overtimeEmps.length) driverInsights.push({ key: 'overtime', count: overtimeEmps.length, text: `${nameWithHours(overtimeEmps, 'overtime', 'h', 3)} exceeded overtime threshold` });
  if (weekendEmps.length) driverInsights.push({ key: 'weekend', count: weekendEmps.length, text: `${nameWithHours(weekendEmps, 'weekendH', 'h', 3)} worked >10h on weekends` });
  if (afterHoursEmps.length) driverInsights.push({ key: 'after_hours', count: afterHoursEmps.length, text: `${nameWithHours(afterHoursEmps, 'afterH', '', 3)} sent >25 after-hours messages` });
  if (sickEmps.length) driverInsights.push({ key: 'sick', count: sickEmps.length, text: `${nameWithHours(sickEmps, 'sickD', ' days', 3)} took >2 sick days` });
  driverInsights.sort((a,b) => b.count - a.count);

  if (driverInsights.length || highRiskEmps.length) {
    const topDriver = driverInsights[0];
    const detail = topDriver
      ? `${topDriver.text}. Review drivers and create an action plan to prevent escalation.`
      : `${highRiskEmps.length} of ${teamSize} employees are high risk (score >= 60): ${nameList(highRiskEmps, 3)}.`;
    insights.push({
      type: 'WARNING',
      color: '#FFB347',
      icon: '!',
      title: `Burnout warning signals detected (latest week)`,
      detail
    });
  }

  // TREND — only if ≥2 distinct weeks
  if (hasTrend && delta3 !== null) {
    const dir = delta3 > 0 ? 'increasing' : delta3 < 0 ? 'decreasing' : 'stable';
    const arrow = delta3 > 0 ? '\u2191' : delta3 < 0 ? '\u2193' : '\u2192';
    insights.push({
      type: 'TREND',
      color: '#3B82F6',
      icon: arrow,
      title: `3-week trend: burnout score is ${dir} (${series3.map(x=>x.score).join(' \u2192 ')})`,
      detail: `Trend computed from ${series3.length} weeks of data. Validate changes against staffing shifts and deadlines.`
    });
  } else if (!hasTrend) {
    insights.push({
      type: 'TREND',
      color: '#94a3b8',
      icon: '\u2192',
      title: 'Not enough data for trend',
      detail: 'Add at least 2 weeks of metrics to see trend analysis. Current data covers only 1 week.'
    });
  }

  // POSITIVE
  if (companyScore < 30 || (delta3 !== null && delta3 < 0)) {
    const reason = companyScore < 30
      ? `Latest score is ${companyScore}/100 — low risk across ${teamSize} employees.`
      : `Score improved by ${Math.abs(delta3)} points over the last 3 weeks.`;
    insights.push({
      type: 'POSITIVE',
      color: '#22C55E',
      icon: '\u2713',
      title: 'Positive signal: burnout risk is improving',
      detail: `${reason} Maintain healthy workload distribution and recovery habits.`
    });
  }

  // Recommendations — name the employees
  const recommendations = [];
  for (const d of driverInsights.slice(0, 5)) {
    recommendations.push(d.text);
  }
  if (!recommendations.length) {
    recommendations.push('Keep tracking weekly metrics to maintain high-confidence insights');
    recommendations.push('Review hotspots weekly and validate impact of interventions');
    recommendations.push('Use action plans to systematize manager follow-through');
  }

  return {
    insights,
    recommendations: recommendations.slice(0, 5),
    updatedAt: new Date()
  };
}

function renderAIInsightsPage(){
  hideBurnoutMainContainer();
  const out = document.getElementById('insightsContent');
  if (!out) return;

  // Check localStorage cache first
  const cached = readJsonLocalStorage('peoplera_ai_insights_cache', null);
  const hasData = !!(window.__lastPulseEmployees?.length || employees?.length);

  if (!hasData && !cached && !isDemoEmployeesActive()) {
    out.innerHTML = '<div style="text-align:center;padding:40px">'
      + '<div style="font-size:16px;font-weight:900;color:#64748b;margin-bottom:8px">Run a full burnout analysis first to generate AI insights</div>'
      + '<div style="font-size:13px;color:#94a3b8">AI insights require employee data and weekly metrics. Go to Burnout Intelligence and click "Generate full report".</div>'
      + '</div>';
    return;
  }

  // If we have cached data, render it immediately with generate button
  if (cached || isDemoEmployeesActive()) {
    renderAIInsightsCards(out, cached);
  } else {
    // No cache, show generate prompt
    out.innerHTML = '<div style="text-align:center;padding:40px">'
      + '<div style="font-size:16px;font-weight:900;color:#64748b;margin-bottom:8px">Generate AI-powered insights from your team data</div>'
      + '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">AI will analyze your employee metrics and provide specific, actionable insights.</div>'
      + '<button type="button" id="btnGenerateAIInsights" onclick="generateAIInsights()" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:12px;padding:12px 24px;font-weight:900;font-size:14px;color:#fff;cursor:pointer;box-shadow:0 4px 16px rgba(99,102,241,0.25)">Generate AI Insights</button>'
      + '</div>';
  }
}

function renderAIInsightsCards(out, cached){
  if (!out) return;

  let payload;
  if (isDemoEmployeesActive()) {
    const demoEmps = Array.isArray(window.__demoEmployees) ? window.__demoEmployees : (Array.isArray(employees) ? employees : []);
    const teamSize = demoEmps.length || 4;
    payload = {
      updatedAt: new Date().toISOString(),
      insights: [
        { type: 'CRITICAL', color: '#EF4444', icon: '!', title: `1 employee at critical burnout risk`, detail: `Sara Lee (score: 92, CRITICAL) requires immediate workload intervention. She is working 74h/week with 16h weekend work and 42 after-hours messages. Redistribute tasks and enforce recovery time this week.` },
        { type: 'WARNING', color: '#FFB347', icon: '!', title: 'Alex Kim trending toward critical', detail: 'Alex Kim (score: 71, HIGH) is working 54h/week with limited vacation recovery (last break 5+ months ago). Act now to prevent escalation \u2014 cap hours and plan time off.' },
        { type: 'WARNING', color: '#FFB347', icon: '!', title: 'Maya Chen in early warning zone', detail: 'Maya Chen (score: 52, MEDIUM) has moderate overtime (51h/week) and 16 after-hours messages. Workload is manageable but trending up \u2014 monitor and encourage recovery time.' },
        { type: 'POSITIVE', color: '#22C55E', icon: '\u2713', title: 'Omar Hassan is well-balanced', detail: 'Omar Hassan (score: 28, LOW) has sustainable workload at 45h/week with minimal after-hours activity. Good example of healthy work habits for the team.' },
        { type: 'TREND', color: '#94a3b8', icon: '\u2192', title: 'Clear risk differentiation across the team', detail: `The team shows a full risk spectrum: 1 CRITICAL, 1 HIGH, 1 MEDIUM, 1 LOW. This allows targeted intervention \u2014 focus resources on Sara Lee and Alex Kim while maintaining Omar's balance.` }
      ],
      recommendations: [
        'Immediately cap Sara Lee at 50h this week \u2014 freeze non-critical projects and delegate',
        'Schedule a 1:1 with Alex Kim to discuss workload sustainability and plan vacation',
        'Set a soft hours target for Maya Chen (under 48h) and confirm upcoming time off',
        'Acknowledge Omar Hassan\u2019s balance \u2014 consider him for load-sharing from Sara Lee',
        'Set team-wide after-hours boundaries: no Slack after 7pm, use scheduled sends'
      ]
    };
  } else {
    payload = cached;
  }

  if (!payload) return;

  const insights = Array.isArray(payload?.insights) ? payload.insights : [];
  const recs = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
  const updatedAt = payload?.updatedAt ? new Date(payload.updatedAt) : new Date();

  // Header with generate button and timestamp
  let html = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap">';
  html += `<div style="font-size:14px;font-weight:900;color:#0f172a">${insights.length} insight${insights.length === 1 ? '' : 's'} \u00b7 Last generated: ${formatTsDdMmYyyyHhMm(updatedAt)}</div>`;
  if (!isDemoEmployeesActive()) {
    html += '<button type="button" id="btnGenerateAIInsights" onclick="generateAIInsights()" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.22);border-radius:10px;padding:8px 14px;font-size:12px;font-weight:900;color:#6366f1;cursor:pointer">Regenerate Insights</button>';
  }
  html += '</div>';

  html += '<div style="display:grid;gap:14px">';

  const actionForType = (t) => {
    const type = String(t || '').toUpperCase();
    if (type === 'CRITICAL') return { label: 'View Action Plans \u2192', tab: 'pulse-plans' };
    if (type === 'WARNING') return { label: 'View Team Hotspots \u2192', tab: 'pulse-hotspots' };
    if (type === 'TREND') return null;
    if (type === 'POSITIVE') return null;
    return { label: 'View Report \u2192', tab: 'pulse' };
  };

  for (const i of insights) {
    const type = String(i.type || '').toUpperCase();
    const color = String(i.color || '#64748b');
    const action = actionForType(type);
    const iconText = String(i.icon || '!');

    html += `<div class="ai-insight-row" data-kind="${escapeHtml(type)}" style="background:rgba(255,255,255,0.95);border:1px solid rgba(0,0,0,0.08);border-left:4px solid ${escapeHtml(color)};border-radius:14px;padding:18px;display:grid;gap:8px">`;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += `<div style="width:28px;height:28px;border-radius:8px;background:${escapeHtml(color)}14;border:1px solid ${escapeHtml(color)}33;display:grid;place-items:center;font-size:14px;font-weight:900;color:${escapeHtml(color)}">${escapeHtml(iconText)}</div>`;
    html += `<span style="font-size:10px;font-weight:900;padding:3px 8px;border-radius:999px;background:${escapeHtml(color)}14;color:${escapeHtml(color)};letter-spacing:0.08em">${escapeHtml(type)}</span>`;
    html += '</div>';
    html += `<div style="font-size:11px;color:#94a3b8;font-weight:800;white-space:nowrap">${escapeHtml(formatTsDdMmYyyyHhMm(updatedAt))}</div>`;
    html += '</div>';

    html += `<div style="font-size:15px;font-weight:900;color:#0f172a;line-height:1.4">${escapeHtml(i.title || '')}</div>`;
    html += `<div style="font-size:13px;color:#64748b;line-height:1.6">${escapeHtml(i.detail || '')}</div>`;

    if (action) {
      html += '<div style="display:flex;justify-content:flex-end;margin-top:4px">';
      html += `<button type="button" class="ai-insight-action" data-tab="${escapeHtml(action.tab)}" style="background:transparent;border:1px solid ${escapeHtml(color)}44;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:900;color:${escapeHtml(color)};cursor:pointer;transition:background .15s">${escapeHtml(action.label)}</button>`;
      html += '</div>';
    }
    html += '</div>';
  }

  // Key Recommendations
  if (recs.length) {
    html += '<div style="background:rgba(255,255,255,0.95);border:1px solid rgba(0,0,0,0.08);border-left:4px solid #6366f1;border-radius:14px;padding:18px;margin-top:4px">';
    html += '<div style="font-size:14px;font-weight:900;color:#0f172a;margin-bottom:10px">Key Recommendations</div>';
    html += '<div style="display:grid;gap:8px">';
    for (const r of recs.slice(0, 5)) {
      html += `<div style="font-size:13px;color:#475569;font-weight:600;line-height:1.6;padding-left:12px;border-left:2px solid rgba(99,102,241,0.25)">${escapeHtml(String(r || ''))}</div>`;
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  out.innerHTML = html;

  // Bind CTA actions
  if (!out.getAttribute('data-ai-actions-bound')) {
    out.setAttribute('data-ai-actions-bound', '1');
    out.addEventListener('click', (e)=>{
      const btn = e.target?.closest?.('.ai-insight-action');
      if (!btn) return;
      e.preventDefault();
      const tab = btn.getAttribute('data-tab') || '';
      if (!tab) return;
      try{ switchTab(tab); }catch(err){ /* noop */ }
    });
  }
}

async function generateAIInsights(){
  const out = document.getElementById('insightsContent');
  if (!out) return;
  const btn = document.getElementById('btnGenerateAIInsights');
  if (btn) { btn.textContent = 'Generating\u2026'; btn.disabled = true; }

  try{
    const s = (await supabase.auth.getSession()).data?.session;
    if (!s) throw new Error('Not signed in');

    const emps = window.__lastPulseEmployees || employees || [];
    if (!emps.length) throw new Error('No employee data. Run a full burnout analysis first.');

    const employeeData = emps.map(e => ({
      name: String(e.name || e.full_name || '').trim(),
      burnoutScore: Number(e.burnoutScore || e.burnout_score || 0),
      riskLevel: String(e.riskLevel || e.risk_level || ''),
      weeklyHours: Number(e.weeklyHours || e.weekly_hours || 0),
      weekendHours: Number(e.weekendHours || e.weekend_hours || 0),
      afterHoursMessages: Number(e.afterHoursMessages || e.after_hours_messages || 0),
      sickDays: Number(e.sickDays || e.sick_days || 0)
    })).filter(e => e.name);

    const token = s.access_token;
    const response = await apiFetch('/api/pulse?action=ai_insights', {
      method: 'POST',
      accessToken: token,
      body: { employees: employeeData }
    });

    // Parse Claude response into structured insights
    let insights = [];
    let recommendations = [];

    if (response && Array.isArray(response.insights)) {
      insights = response.insights;
      recommendations = Array.isArray(response.recommendations) ? response.recommendations : [];
    } else {
      // Fallback: generate from local data
      const result = await loadDynamicInsightsFromSupabase();
      insights = result.insights || [];
      recommendations = result.recommendations || [];
    }

    const payload = {
      insights,
      recommendations,
      updatedAt: new Date().toISOString()
    };

    writeJsonLocalStorage('peoplera_ai_insights_cache', payload);
    renderAIInsightsCards(out, payload);
  }catch(err){
    console.error('generateAIInsights failed:', err);
    if (btn) { btn.textContent = 'Generate AI Insights'; btn.disabled = false; }
    showToast(err.message || 'Failed to generate insights', 'error');
  }
}

async function generateFullReport() {
  try {
    if (!employees.length) {
      await loadPulseData();
    }

    if (!employees.length) {
      showToast('No employees available for report', 'error');
      return;
    }

    // DEMO MODE: score via real model, never call Claude API
    if (isDemoEmployeesActive()) {
      const demoEmps = Array.isArray(window.__demoEmployees) ? window.__demoEmployees : employees;
      for (const e of demoEmps) {
        if (!e) continue;
        const m = e.__demoWeekly || {};
        const score = computeBurnoutScoreFromSignals({
          weeklyHours: Number(m.weekly_hours || 0),
          weekendHours: Number(m.weekend_hours || 0),
          afterHoursMessages: Number(m.after_hours_messages || 0),
          sickDays: Number(m.sick_days || 0),
          overtimeHours: Number(m.overtime_hours || 0),
          lastVacation: String(e.last_vacation || 'unknown')
        });
        e.burnoutScore = score;
        e.burnout_score = score;
        e.riskLevel = classifyEmployeeRiskLevel(score);
        e.risk_level = e.riskLevel.toUpperCase();
      }

      const mergedEmployeesScored = demoEmps.map(e => ({
        ...e,
        name: e.full_name || e.name || '',
        burnoutScore: Number(e.burnoutScore || e.burnout_score || 0),
        riskLevel: String(e.riskLevel || e.risk_level || 'low').toLowerCase()
      }));

      window.__lastPulseEmployees = mergedEmployeesScored;
      const decision = computeDecisionEngine(mergedEmployeesScored, getCompanyTrendSeries(8));
      window.__lastDecisionEngine = decision;
      updateNavBurnoutBadge(decision);

      const plans = computeStrategicActionPlans(mergedEmployeesScored, decision);
      window.__lastActionPlans = plans;

      const hotspots = mergedEmployeesScored.map(e => {
        const name = String(e.name || e.full_name || '').trim() || 'Employee';
        const level = normalizeRiskLevel(e.riskLevel || e.risk_level);
        const drivers = Array.isArray(e.signals) && e.signals.length ? e.signals.slice(0, 3) : computeHeuristicDrivers(e);
        return {
          name,
          burnoutScore: Number(e.burnoutScore || 0),
          riskLevel: level,
          drivers,
          recommendedAction: computeRecommendedAction(level, drivers),
          weeklyHours: Number(e.weeklyHours || e.weekly_hours || 0),
          weekendHours: Number(e.weekendHours || e.weekend_hours || 0),
          afterHoursMessages: Number(e.afterHoursMessages || e.after_hours_messages || 0),
          sickDays: Number(e.sickDays || e.sick_days || 0)
        };
      });

      writeJsonLocalStorage('peoplera_action_plans', plans);
      writeJsonLocalStorage('peoplera_team_hotspots', hotspots);

      renderPulse(mergedEmployeesScored);
      renderAIInsights();
      renderPulseTrend();
      renderStrategicActionPlansPage();
      renderTeamHotspotsPage();
      renderAIInsightsPage();

      switchTab('pulse');
      return;
    }

    // REAL MODE: call Claude API
    const rows = employees.map(emp => ({
      name: emp.full_name || '',
      weeklyHours: Number(weeklyData[emp.id]?.weekly_hours || 0),
      weekendHours: Number(weeklyData[emp.id]?.weekend_hours || 0),
      afterHoursMessages: Number(weeklyData[emp.id]?.after_hours_messages || 0),
      sickDays: Number(weeklyData[emp.id]?.sick_days || 0),
      lastVacation: String(emp.last_vacation || 'unknown')
    }));

    try{ await loadAndCalculateScores(); }catch(e){ /* noop */ }

    const token = (await supabase.auth.getSession()).data?.session?.access_token;
    const data = await apiFetchWithRetry('/api/pulse', {
      method: 'POST',
      accessToken: token,
      body: { employees: rows }
    });

    if (!data || !Array.isArray(data.employees)) {
      throw new Error('Invalid AI response');
    }

    const inputByName = {};
    for (const row of rows) {
      inputByName[String(row.name || '').toLowerCase()] = row;
    }

    const mergedEmployees = data.employees.map(e => ({
      ...inputByName[String(e?.name || '').toLowerCase()] || {},
      ...e
    }));

    const mergedEmployeesScored = mergedEmployees.map(e => {
      const score = computeBurnoutScoreFromSignals({
        weeklyHours: Number(e.weeklyHours || e.weekly_hours || 0),
        weekendHours: Number(e.weekendHours || e.weekend_hours || 0),
        afterHoursMessages: Number(e.afterHoursMessages || e.after_hours_messages || 0),
        sickDays: Number(e.sickDays || e.sick_days || 0),
        overtimeHours: Number(e.overtimeHours || e.overtime_hours || Math.max(0, Number(e.weeklyHours || e.weekly_hours || 0) - 40))
      });
      const riskLevel = classifyEmployeeRiskLevel(score);
      return {
        ...e,
        burnoutScore: score,
        riskLevel
      };
    });

    window.__lastPulseEmployees = mergedEmployeesScored;
    const decision = computeDecisionEngine(mergedEmployeesScored, getCompanyTrendSeries(8));
    window.__lastDecisionEngine = decision;
    updateNavBurnoutBadge(decision);

    const plans = computeStrategicActionPlans(mergedEmployeesScored, decision);
    window.__lastActionPlans = plans;

    try{ localStorage.removeItem('peoplera_team_hotspots'); }catch(e){ /* noop */ }
    try{ localStorage.removeItem('peoplera_ai_insights'); }catch(e){ /* noop */ }

    const hotspots = mergedEmployeesScored.map(e => {
      const name = String(e.name || '').trim() || 'Employee';
      const level = normalizeRiskLevel(e.riskLevel || e.risk_level || e.risk);
      const drivers = Array.isArray(e.riskFactors) && e.riskFactors.length ? e.riskFactors.slice(0, 3) : computeHeuristicDrivers(e);
      return {
        name,
        burnoutScore: Number(e.burnoutScore || e.burnout_score || 0),
        riskLevel: level,
        drivers,
        recommendedAction: computeRecommendedAction(level, drivers),
        weeklyHours: Number(e.weeklyHours || e.weekly_hours || 0),
        weekendHours: Number(e.weekendHours || e.weekend_hours || 0),
        afterHoursMessages: Number(e.afterHoursMessages || e.after_hours_messages || 0),
        sickDays: Number(e.sickDays || e.sick_days || 0)
      };
    });

    const insights = buildAIInsightsArray(mergedEmployeesScored, decision);

    writeJsonLocalStorage('peoplera_action_plans', plans);
    writeJsonLocalStorage('peoplera_team_hotspots', hotspots);

    renderPulse(mergedEmployeesScored);
    renderAIInsights();
    renderPulseTrend();
    renderStrategicActionPlansPage();
    renderTeamHotspotsPage();
    renderAIInsightsPage();

    try{ await loadAndCalculateScores(); }catch(e){ /* noop */ }

    try{ sendWeeklyEmailReport(); }catch(e){ console.warn('Auto-email skipped:', e); }

    switchTab('pulse');
    showToast('Report generated.', 'success', {
      actionText: 'View Team Hotspots \u2192',
      onAction: ()=>{ try{ switchTab('pulse-hotspots'); }catch(e){ /* noop */ } }
    });
  } catch (error) {
    console.error('Generate full report failed:', error);
    if (!isDemoEmployeesActive()) {
      showToast('Error generating report', 'error');
      try{ showInlineError('generateReportHost', error.message || 'Report generation failed. Check your connection.', 'generateFullReport'); }catch(e){ /* noop */ }
    }
  }
}

function showToast(message, type = 'success', opts = null) {
  // Simple toast implementation
  const toast = document.createElement('div');
  toast.className = 'notification-banner';
  toast.style.borderLeft = `4px solid ${type === 'error' ? '#FF6B6B' : '#4CAF50'}`;

  const actionText = String(opts?.actionText || '').trim();
  const onAction = (typeof opts?.onAction === 'function') ? opts.onAction : null;

  if (actionText && onAction) {
    toast.innerHTML = `
      <div style="font-weight:900">${escapeHtml(String(message || ''))}</div>
      <a href="#" data-toast-action="1" style="display:inline-block;margin-top:6px;font-weight:900;color:#FF6B4A;text-decoration:none">${escapeHtml(actionText)}</a>
    `;
    toast.addEventListener('click', (e)=>{
      const link = e.target?.closest?.('[data-toast-action="1"]');
      if (!link) return;
      e.preventDefault();
      try{ onAction(); }catch(err){ /* noop */ }
    });
  } else {
    toast.textContent = String(message || '');
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    try{
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-4px)';
    }catch(e){ /* noop */ }
    setTimeout(() => {
      try{ toast.remove(); }catch(e){ /* noop */ }
    }, 320);
  }, 3500);
}

// Update user profile in sidebar
function updateUserProfile() {
  if (!session?.user) return;

  const user = session.user;
  const rawName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const email = user.email || '';

  const name = String(rawName || '').trim() || getEmailUsername(email) || '';
  const avatarInitials = document.getElementById('userAvatar');
  const avatarImg = document.getElementById('userAvatarImg');
  const nameEl = document.getElementById('userFullName');
  const emailEl = document.getElementById('userEmail');
  const profileEl = document.getElementById('userProfile');

  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? String((parts[0][0] || '') + (parts[parts.length - 1][0] || '')).toUpperCase()
    : String((parts[0]?.[0] || email[0] || '?')).toUpperCase();

  // Google profile photo
  const avatarUrl = String(user.user_metadata?.avatar_url || user.user_metadata?.picture || '').trim();
  if (avatarUrl && avatarImg) {
    avatarImg.src = avatarUrl;
    avatarImg.alt = escapeHtml(name || 'User');
    avatarImg.style.display = '';
    if (avatarInitials) avatarInitials.style.display = 'none';
    avatarImg.onerror = () => {
      avatarImg.style.display = 'none';
      if (avatarInitials) { avatarInitials.style.display = ''; avatarInitials.textContent = initials.slice(0, 2); }
    };
  } else {
    if (avatarImg) avatarImg.style.display = 'none';
    if (avatarInitials) { avatarInitials.style.display = ''; avatarInitials.textContent = initials.slice(0, 2); }
  }

  if (nameEl) nameEl.textContent = name || 'Signed in';
  if (emailEl) emailEl.textContent = email || '—';

  if (profileEl && !profileEl.getAttribute('data-settings-bound')) {
    profileEl.setAttribute('data-settings-bound', '1');
    profileEl.addEventListener('click', ()=>{
      try{ switchTab('settings'); }catch(e){ /* noop */ }
    });
  }

  updateSidebarStatusCard();
}

// Sidebar data-status card
function updateSidebarStatusCard(){
  const card = document.getElementById('sidebarStatusCard');
  if (!card) return;

  if (isDemoEmployeesActive()) {
    card.style.display = '';
    card.innerHTML = '<div style="display:flex;align-items:center;gap:7px">'
      + '<span class="sidebar-status-dot" style="background:#FFB347"></span>'
      + '<span class="sidebar-status-label">Viewing demo data</span>'
      + '</div>'
      + '<a class="sidebar-status-link" href="#" onclick="event.preventDefault();try{window.__settingsInitialSubtab=\'integrations\';switchTab(\'settings\')}catch(e){}">Connect your data \u2192</a>';
    return;
  }

  (async ()=>{
    try{
      const s = (await supabase.auth.getSession()).data?.session;
      if (!s) { card.style.display = 'none'; return; }
      const connected = await getConnectedIntegration(s);
      if (connected) {
        const pk = String(connected.provider || connected.integration_name || '').toLowerCase();
        const providerName = INTEGRATION_PROVIDERS[pk]?.name || pk;
        const empCount = Array.isArray(employees) ? employees.filter(e => !e?.is_demo).length : 0;
        const countLabel = empCount > 0 ? (escapeHtml(String(empCount)) + ' employee' + (empCount !== 1 ? 's' : '') + ' synced') : '';
        card.style.display = '';
        card.innerHTML = '<div style="display:flex;align-items:center;gap:7px">'
          + '<span class="sidebar-status-dot" style="background:#22C55E"></span>'
          + '<span class="sidebar-status-label" style="color:#16a34a">Connected \u00b7 ' + escapeHtml(providerName) + '</span>'
          + '</div>'
          + (countLabel ? '<div class="sidebar-status-label" style="margin-top:3px;margin-left:14px">' + countLabel + '</div>' : '');
      } else {
        card.style.display = '';
        card.innerHTML = '<div style="display:flex;align-items:center;gap:7px">'
          + '<span class="sidebar-status-dot" style="background:#c0c5cc"></span>'
          + '<span class="sidebar-status-label">No HR system connected</span>'
          + '</div>'
          + '<a class="sidebar-status-link" href="#" onclick="event.preventDefault();try{window.__settingsInitialSubtab=\'integrations\';switchTab(\'settings\')}catch(e){}">Connect \u2192</a>';
      }
    }catch(e){
      card.style.display = 'none';
    }
  })();
}

// ── Onboarding Wizard ──
function onboardGoStep(step){
  for (let i = 1; i <= 3; i++){
    const el = document.getElementById('onboardStep' + i);
    if (el) el.style.display = (i === step) ? '' : 'none';
  }
}

function skipOnboarding(){
  try{ localStorage.setItem('peoplera_onboarding_done', '1'); }catch(e){}
  const wiz = document.getElementById('onboardingWizard');
  if (wiz) wiz.style.display = 'none';
}

function shouldShowOnboarding(){
  try{
    if (localStorage.getItem('peoplera_onboarding_done') === '1') return false;
  }catch(e){ return false; }
  return true;
}

function maybeShowOnboarding(employeeCount){
  if (employeeCount > 0 || isDemoEmployeesActive()) {
    try{ localStorage.setItem('peoplera_onboarding_done', '1'); }catch(e){}
    return;
  }
  if (!shouldShowOnboarding()) return;
  const wiz = document.getElementById('onboardingWizard');
  if (wiz) wiz.style.display = '';
}

// ── Demo Banner ──
function showDemoBanner(){
  const b = document.getElementById('demoBanner');
  if (b) b.style.display = 'flex';
}

function hideDemoBanner(){
  const b = document.getElementById('demoBanner');
  if (b) b.style.display = 'none';
}

async function resetDemoAndReload(){
  try{
    const s = (await supabase.auth.getSession()).data?.session;
    if (s?.user?.id) {
      const { data: existingDemo } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', s.user.id)
        .eq('is_demo', true);
      const ids = (existingDemo || []).map(r => r?.id).filter(Boolean);
      if (ids.length) {
        try{ await supabase.from('weekly_metrics').delete().in('employee_id', ids); }catch(e){}
        try{ await supabase.from('pulse_results').delete().eq('user_id', s.user.id); }catch(e){}
        await supabase.from('employees').delete().in('id', ids);
      }
    }
  }catch(e){ console.warn('resetDemo:', e); }

  window.__demoEmployees = [];
  employees = [];
  weeklyData = {};
  window.__lastPulseEmployees = [];
  window.__lastActionPlans = [];
  window.__lastDecisionEngine = null;
  window.__plansEmployeesList = [];
  setDemoActivatedThisSession(false);
  try{ writeJsonLocalStorage('peoplera_active_employees_count', 0); }catch(e){}
  try{ writeJsonLocalStorage('peoplera_demo_employee_ids', []); }catch(e){}
  try{ localStorage.removeItem('peoplera_team_hotspots'); }catch(e){}
  try{ localStorage.removeItem('peoplera_action_plans'); }catch(e){}
  try{ localStorage.removeItem('peoplera_ai_insights_cache'); }catch(e){}
  try{ localStorage.removeItem('peoplera_ai_insights'); }catch(e){}

  try{ hideDemoBanner(); }catch(e){}
  try{ updateSidebarStatusCard(); }catch(e){}
  try{ renderEmployees(); }catch(e){}
  try{ updateSectionsVisibility(); }catch(e){}
  try{ populateOverviewFromEmployees([]); }catch(e){}
  try{ applyDemoRealDataUi(); }catch(e){}
  try{ applyPulseActionButtonsUi({ connected: false }); }catch(e){}
}

// ── Overview Stats Population ──
function populateOverviewFromEmployees(empList){
  const list = Array.isArray(empList) ? empList : [];
  const count = list.length;

  const el = (id) => document.getElementById(id);
  const empEl = el('statEmployees');
  if (empEl) empEl.textContent = count > 0 ? String(count) : '\u2014';

  if (!count) return;

  const scores = list.map(e => Number(e.burnoutScore || e.burnout_score || 0)).filter(n => n > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
  const scoreEl = el('statBurnoutScore');
  if (scoreEl) scoreEl.textContent = avgScore > 0 ? String(avgScore) : '—';

  const atRisk = list.filter(e => {
    const s = Number(e.burnoutScore || e.burnout_score || 0);
    return s >= 50;
  });
  const riskEl = el('statAtRisk');
  if (riskEl) riskEl.textContent = String(atRisk.length);

  const hours = list.map(e => {
    const wm = e.__demoWeekly || e.weekly_metrics || e;
    return Number(wm.weekly_hours || wm.weeklyHours || 0);
  }).filter(n => n > 0);
  const avgHours = hours.length ? Math.round(hours.reduce((a,b)=>a+b,0) / hours.length) : 0;
  const hoursEl = el('statAvgHours');
  if (hoursEl) hoursEl.textContent = avgHours > 0 ? String(avgHours) : '—';

  // Burnout score trend text
  const trendEl = el('statBurnoutScoreTrend');
  if (trendEl) {
    if (avgScore >= 80) trendEl.innerHTML = '<span style="color:#FF6B4A;font-weight:900">Critical risk</span>';
    else if (avgScore >= 60) trendEl.innerHTML = '<span style="color:#F97316;font-weight:900">High risk</span>';
    else if (avgScore >= 35) trendEl.innerHTML = '<span style="color:#FFB347;font-weight:900">Medium risk</span>';
    else trendEl.textContent = 'Company average';
  }

  // Top risks
  const sorted = [...list].sort((a,b) => Number(b.burnoutScore||b.burnout_score||0) - Number(a.burnoutScore||a.burnout_score||0));
  const top3 = sorted.filter(e => Number(e.burnoutScore||e.burnout_score||0) >= 50).slice(0, 3);
  const topRisksEl = el('overviewTopRisks');
  const topRisksEmpty = el('overviewTopRisksEmpty');
  const hotspotsLink = el('overviewHotspotsLink');
  if (topRisksEl && top3.length) {
    topRisksEl.innerHTML = top3.map(e => {
      const name = escapeHtml(String(e.full_name || e.name || 'Unknown'));
      const sc = Number(e.burnoutScore || e.burnout_score || 0);
      const color = sc >= 80 ? '#FF6B4A' : sc >= 60 ? '#F97316' : sc >= 35 ? '#FFB347' : '#00e5a0';
      const lvl = sc >= 80 ? 'CRITICAL' : sc >= 60 ? 'HIGH' : sc >= 35 ? 'MEDIUM' : 'LOW';
      const driver = escapeHtml(String(e.topDriver || e.top_driver || 'High workload signals').slice(0, 80));
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:12px;border-left:3px solid ${color}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:900;font-size:13px;color:#0f172a">${name}</div>
          <div style="font-size:11px;color:#64748b;font-weight:700;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${driver}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:'Syne',system-ui;font-weight:900;font-size:20px;color:${color}">${sc}</div>
          <span style="font-size:9px;font-weight:900;padding:2px 6px;border-radius:999px;background:${color};color:#fff">${lvl}</span>
        </div>
      </div>`;
    }).join('');
    if (hotspotsLink) hotspotsLink.style.display = 'inline-block';
  } else {
    if (topRisksEmpty) topRisksEmpty.style.display = 'block';
    if (hotspotsLink) hotspotsLink.style.display = 'none';
  }

  // Also show chart data, hide chart empty state
  const chartEmpty = el('overviewChartEmptyState');
  const miniChart = el('overviewMiniChart');
  if (chartEmpty) chartEmpty.style.display = 'none';
  if (miniChart) miniChart.style.display = 'flex';

  // Integration status - check if connected
  const intEl = el('overviewIntegrationsStatus');
  if (intEl) {
    try{
      const integration = localStorage.getItem('peoplera_connected_integration');
      if (integration) {
        intEl.innerHTML = `<div style="display:flex;align-items:center;gap:6px;background:rgba(0,184,148,0.08);border:1px solid rgba(0,184,148,0.25);border-radius:999px;padding:8px 14px">
          <span style="width:8px;height:8px;border-radius:50%;background:#00b894"></span>
          <span style="font-size:12px;font-weight:800;color:#00b894">${escapeHtml(integration)} connected</span>
        </div>`;
      }
    }catch(e){}
  }
}

function populateDemoOverviewChart(){
  const out = document.getElementById('overviewMiniChart');
  const deltaEl = document.getElementById('overviewBurnoutDelta');
  if (!out) return;

  // Show chart, hide empty state
  out.style.display = 'flex';
  const chartEmpty = document.getElementById('overviewChartEmptyState');
  if (chartEmpty) chartEmpty.style.display = 'none';

  const demoPoints = [
    { week: 'Week 1', avg: 48 },
    { week: 'Week 2', avg: 55 },
    { week: 'Week 3', avg: 61 },
    { week: 'Week 4', avg: 58 },
    { week: 'Week 5', avg: 85 }
  ];

  const maxVal = 100;
  out.innerHTML = demoPoints.map((p) => {
    const h = Math.max(8, Math.round((p.avg / maxVal) * 72));
    const color = p.avg >= 80 ? '#FF6B4A' : p.avg >= 60 ? '#F97316' : p.avg >= 35 ? '#FFB347' : '#00b894';
    return `<div style="flex:1;min-width:0;text-align:center">
      <div style="font-size:11px;font-weight:900;color:${color};margin-bottom:4px">${p.avg}</div>
      <div title="${p.week} · ${p.avg}/100" style="height:${h}px;background:${color};border-radius:10px 10px 6px 6px;border:1px solid rgba(0,0,0,0.06)"></div>
      <div style="margin-top:6px;font-size:10px;font-weight:800;color:#94a3b8">${p.week}</div>
    </div>`;
  }).join('');

  if (deltaEl) {
    const last = demoPoints[demoPoints.length - 1].avg;
    const prev = demoPoints[demoPoints.length - 2].avg;
    const diff = last - prev;
    const sign = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    const color = diff > 0 ? '#FF6B4A' : diff < 0 ? '#00b894' : '#64748b';
    deltaEl.innerHTML = `<span style="color:${color};font-weight:900">${sign} ${Math.abs(diff)} pts</span> vs last week`;
  }
}

// ── Load Survey Results (direct Supabase query) ──
async function loadSurveyResults(){
  try{
    const s = (await supabase.auth.getSession()).data?.session;
    if (!s) return;
    const userId = s.user.id;

    // Determine current week boundaries (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() + mondayOffset);
    const weekStartIso = weekStart.toISOString();

    // Query tokens sent this week
    const { data: tokens } = await supabase
      .from('survey_tokens')
      .select('employee_id, token')
      .eq('user_id', userId)
      .gte('sent_at', weekStartIso);

    const totalSent = (tokens || []).length;

    // Query responses this week
    const { data: responses } = await supabase
      .from('survey_responses')
      .select('*')
      .eq('user_id', userId)
      .gte('submitted_at', weekStartIso);

    const totalResponded = (responses || []).length;
    const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;

    // Update response rate UI
    const rateText = document.getElementById('responseRateText');
    const ratePercent = document.getElementById('responseRatePercent');
    const rateBar = document.getElementById('responseRateBar');
    if (rateText) rateText.textContent = `${totalResponded} of ${totalSent} employees responded`;
    if (ratePercent) ratePercent.textContent = `${responseRate}%`;
    if (rateBar) rateBar.style.width = `${responseRate}%`;

    // Update results content
    const resultsEl = document.getElementById('surveyResultsContent');
    if (!resultsEl) return;

    if (!totalResponded) return; // keep empty state shown in HTML

    // Compute average psych score from responses
    const scores = (responses || []).map(r => Number(r.score || r.psych_score || 0)).filter(v => v > 0);
    const avgPsychScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    let html = '';

    // Avg wellbeing score
    html += `<div class="panel" style="padding:16px;margin-bottom:16px;text-align:center">
      <div style="font-size:12px;font-weight:900;color:#64748b;letter-spacing:0.06em">AVG WELLBEING SCORE</div>
      <div style="font-family:'Syne',system-ui;font-weight:900;font-size:36px;color:${avgPsychScore > 60 ? '#00b894' : avgPsychScore > 40 ? '#F97316' : '#FF6B4A'};margin-top:4px">${avgPsychScore}/100</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:4px">${totalResponded} responses this week</div>
    </div>`;

    // Per-question breakdown from answers field
    const questions = getSurveyQuestions();
    const answerOptions = ['Always', 'Often', 'Sometimes', 'Rarely', 'Never'];
    const breakdown = questions.map((q, idx) => {
      const counts = {};
      answerOptions.forEach(opt => { counts[opt] = 0; });
      (responses || []).forEach(r => {
        const answers = Array.isArray(r.answers) ? r.answers : (typeof r.answers === 'string' ? (() => { try { return JSON.parse(r.answers); } catch(e) { return []; } })() : []);
        const ans = String(answers[idx] || '').trim();
        if (ans && counts.hasOwnProperty(ans)) counts[ans]++;
      });
      return { question: q, counts, options: answerOptions };
    });

    if (breakdown.length) {
      html += `<div style="display:grid;gap:12px;margin-bottom:16px">`;
      breakdown.forEach((q, idx) => {
        const total = Object.values(q.counts).reduce((a, b) => a + b, 0) || 1;
        html += `<div class="panel" style="padding:14px">
          <div style="font-weight:900;font-size:13px;margin-bottom:10px">Q${idx + 1}: ${escapeHtml(q.question)}</div>
          <div style="display:grid;gap:6px">`;
        q.options.forEach(opt => {
          const count = q.counts[opt] || 0;
          const pct = Math.round((count / total) * 100);
          html += `<div style="display:flex;align-items:center;gap:8px">
            <div style="width:100px;font-size:12px;font-weight:700;color:#334155;text-align:right">${escapeHtml(opt)}</div>
            <div style="flex:1;background:rgba(0,0,0,0.04);border-radius:999px;height:8px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#FF6B6B,#FFD93D);border-radius:999px;transition:width 0.5s"></div>
            </div>
            <div style="width:40px;font-size:11px;font-weight:900;color:#64748b">${pct}%</div>
          </div>`;
        });
        html += `</div></div>`;
      });
      html += `</div>`;
    }

    // Employee status — who responded vs pending
    if (totalSent) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, full_name')
        .eq('user_id', userId);

      const empMap = {};
      (emps || []).forEach(e => { empMap[e.id] = e.full_name || 'Employee'; });

      const respondedIds = new Set((responses || []).map(r => r.employee_id));
      const statusList = (tokens || []).map(t => ({
        name: empMap[t.employee_id] || 'Employee',
        responded: respondedIds.has(t.employee_id)
      }));

      // Deduplicate by name
      const seen = new Set();
      const unique = statusList.filter(e => {
        if (seen.has(e.name)) return false;
        seen.add(e.name);
        return true;
      });

      if (unique.length) {
        html += `<div class="panel" style="padding:14px">
          <div style="font-weight:900;font-size:14px;margin-bottom:10px">Employee Status</div>
          <div style="display:grid;gap:6px">`;
        unique.forEach(e => {
          const badge = e.responded
            ? '<span style="background:rgba(22,163,74,0.1);color:#16a34a;font-size:11px;font-weight:900;padding:3px 8px;border-radius:999px">\u2713 Responded</span>'
            : '<span style="background:rgba(148,163,184,0.1);color:#94a3b8;font-size:11px;font-weight:900;padding:3px 8px;border-radius:999px">Pending</span>';
          html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04)">
            <span style="font-weight:700;font-size:13px">${escapeHtml(e.name)}</span>
            ${badge}
          </div>`;
        });
        html += `</div></div>`;
      }
    }

    resultsEl.innerHTML = html;
  }catch(e){
    console.warn('loadSurveyResults:', e);
  }
}

// ── Skeleton Loading Helpers ──
function showSkeleton(containerId, count = 3){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array.from({length: count}, () =>
    `<div class="skeleton skeleton-card" style="width:100%"></div>`
  ).join('');
}

function showSkeletonStats(){
  ['statEmployees','statBurnoutScore','statAtRisk','statAvgHours'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '\u2014';
  });
}

// ── Inline Error with Retry ──
function showInlineError(containerId, message, retryFn){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="inline-error">
    <span style="flex:1">${escapeHtml(message)}</span>
    ${retryFn ? '<button onclick="' + retryFn + '()">Try again</button>' : ''}
  </div>`;
}

// ── PDF Export ──
function exportPdfReport(){
  const container = document.getElementById('printReportContainer');
  const body = document.getElementById('printReportBody');
  const dateEl = document.getElementById('printReportDate');
  if (!container || !body) { showToast('Print container not found', 'error'); return; }

  const now = new Date();
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const empList = Array.isArray(window.__lastPulseEmployees) ? window.__lastPulseEmployees : employees;
  if (!empList.length) { showToast('No employee data to export. Run a report first.', 'error'); return; }

  const scores = empList.map(e => Number(e.burnoutScore || e.burnout_score || 0)).filter(n => n > 0);
  const companyScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
  const atRisk = empList.filter(e => Number(e.burnoutScore || e.burnout_score || 0) >= 60);
  const sorted = [...empList].sort((a,b) => Number(b.burnoutScore||b.burnout_score||0) - Number(a.burnoutScore||a.burnout_score||0));

  const hours = empList.map(e => Number(e.weeklyHours || e.weekly_hours || e.__demoWeekly?.weekly_hours || 0)).filter(n => n > 0);
  const avgH = hours.length ? Math.round(hours.reduce((a,b)=>a+b,0) / hours.length) : 0;

  let html = '';

  // Summary stats
  html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px">
    <div style="text-align:center;padding:16px;border:1px solid #e2e8f0;border-radius:12px">
      <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.06em">EMPLOYEES</div>
      <div style="font-family:'Syne',system-ui;font-weight:900;font-size:28px;color:#0f172a;margin-top:6px">${empList.length}</div>
    </div>
    <div style="text-align:center;padding:16px;border:1px solid #e2e8f0;border-radius:12px">
      <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.06em">BURNOUT SCORE</div>
      <div style="font-family:'Syne',system-ui;font-weight:900;font-size:28px;color:#FF6B4A;margin-top:6px">${companyScore}/100</div>
    </div>
    <div style="text-align:center;padding:16px;border:1px solid #e2e8f0;border-radius:12px">
      <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.06em">AT RISK</div>
      <div style="font-family:'Syne',system-ui;font-weight:900;font-size:28px;color:#F97316;margin-top:6px">${atRisk.length}</div>
    </div>
    <div style="text-align:center;padding:16px;border:1px solid #e2e8f0;border-radius:12px">
      <div style="font-size:11px;font-weight:900;color:#64748b;letter-spacing:0.06em">AVG HOURS</div>
      <div style="font-family:'Syne',system-ui;font-weight:900;font-size:28px;color:#0f172a;margin-top:6px">${avgH}h</div>
    </div>
  </div>`;

  // At-risk table
  if (atRisk.length) {
    html += `<div style="margin-bottom:28px">
      <div style="font-family:'Syne',system-ui;font-weight:900;font-size:18px;margin-bottom:12px">At-Risk Employees</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:2px solid #e2e8f0">
          <th style="text-align:left;padding:8px 12px;font-weight:900;color:#64748b">Name</th>
          <th style="text-align:center;padding:8px 12px;font-weight:900;color:#64748b">Score</th>
          <th style="text-align:center;padding:8px 12px;font-weight:900;color:#64748b">Risk</th>
          <th style="text-align:left;padding:8px 12px;font-weight:900;color:#64748b">Top Driver</th>
        </tr></thead>
        <tbody>${sorted.filter(e => Number(e.burnoutScore||e.burnout_score||0) >= 50).map(e => {
          const sc = Number(e.burnoutScore||e.burnout_score||0);
          const color = sc >= 80 ? '#FF6B4A' : sc >= 60 ? '#F97316' : '#FFB347';
          const tier = sc >= 80 ? 'CRITICAL' : sc >= 60 ? 'HIGH' : 'MEDIUM';
          return `<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:8px 12px;font-weight:700">${escapeHtml(String(e.full_name||e.name||''))}</td>
            <td style="padding:8px 12px;text-align:center;font-weight:900;color:${color}">${sc}</td>
            <td style="padding:8px 12px;text-align:center"><span style="background:${color};color:#fff;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:900">${tier}</span></td>
            <td style="padding:8px 12px;color:#64748b;font-size:12px">${escapeHtml(String(e.topDriver||e.top_driver||'High workload').slice(0,60))}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }

  // Action plans summary
  const plans = window.__lastActionPlans;
  if (plans && plans.length) {
    html += `<div style="margin-bottom:28px">
      <div style="font-family:'Syne',system-ui;font-weight:900;font-size:18px;margin-bottom:12px">Strategic Action Plans Summary</div>
      ${plans.slice(0, 5).map(p => `<div style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px">
        <div style="font-weight:900;font-size:13px">${escapeHtml(String(p.employee?.name || p.name || ''))}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">${escapeHtml(String(p.priority_alert || p.summary || '').slice(0,120))}</div>
      </div>`).join('')}
    </div>`;
  }

  body.innerHTML = html;
  container.style.display = 'block';

  // Mark for print CSS
  document.querySelectorAll('.module').forEach(m => m.classList.remove('print-target'));
  container.classList.add('print-target');

  window.print();

  setTimeout(() => {
    container.style.display = 'none';
    container.classList.remove('print-target');
  }, 1000);
}

// ── Weekly Email Report ──
async function sendWeeklyEmailReport(){
  const btn = document.getElementById('btnSendEmailReport');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '⏳ Sending...'; btn.disabled = true; }

  try{
    const s = (await supabase.auth.getSession()).data?.session;
    if (!s?.user?.email) throw new Error('No email found for your account');
    const token = s.access_token;
    const email = s.user.email;

    const empList = Array.isArray(window.__lastPulseEmployees) ? window.__lastPulseEmployees : employees;
    const scores = empList.map(e => Number(e.burnoutScore || e.burnout_score || 0)).filter(n => n > 0);
    const companyScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
    const atRisk = empList.filter(e => Number(e.burnoutScore || e.burnout_score || 0) >= 60);
    const sorted = [...empList].sort((a,b) => Number(b.burnoutScore||b.burnout_score||0) - Number(a.burnoutScore||a.burnout_score||0));
    const top3 = sorted.filter(e => Number(e.burnoutScore||e.burnout_score||0) >= 60).slice(0, 3);

    const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const top3Html = top3.map(e => {
      const nm = String(e.full_name || e.name || '');
      const sc = Number(e.burnoutScore || e.burnout_score || 0);
      return `<tr><td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #f1f5f9">${nm}</td><td style="padding:8px 12px;text-align:center;font-weight:900;color:#FF6B4A;border-bottom:1px solid #f1f5f9">${sc}/100</td></tr>`;
    }).join('');

    const topAction = top3.length
      ? `Schedule a 1-on-1 with ${String(top3[0].full_name || top3[0].name || '')} this week to discuss workload redistribution.`
      : 'Continue monitoring your team — no critical risks detected.';

    const emailHtml = `
      <div style="max-width:600px;margin:0 auto;font-family:'DM Sans',Arial,sans-serif;color:#0f172a">
        <div style="background:linear-gradient(90deg,#FF6B6B,#FFD93D);padding:24px 32px;border-radius:16px 16px 0 0">
          <div style="font-family:'Syne',Arial;font-weight:900;font-size:20px;color:#0f172a">Peoplera</div>
          <div style="font-size:13px;color:#0f172a;opacity:0.7;margin-top:4px">Weekly Burnout Intelligence Report</div>
        </div>
        <div style="padding:28px 32px;background:#ffffff;border:1px solid #f1f5f9;border-top:none;border-radius:0 0 16px 16px">
          <div style="font-size:14px;color:#64748b;margin-bottom:20px">${today}</div>

          <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
            <div style="flex:1;min-width:120px;text-align:center;padding:16px;background:#fef2f2;border-radius:12px">
              <div style="font-size:11px;font-weight:900;color:#64748b">COMPANY SCORE</div>
              <div style="font-weight:900;font-size:28px;color:#FF6B4A;margin-top:4px">${companyScore}</div>
            </div>
            <div style="flex:1;min-width:120px;text-align:center;padding:16px;background:#fff7ed;border-radius:12px">
              <div style="font-size:11px;font-weight:900;color:#64748b">AT RISK</div>
              <div style="font-weight:900;font-size:28px;color:#F97316;margin-top:4px">${atRisk.length}</div>
            </div>
            <div style="flex:1;min-width:120px;text-align:center;padding:16px;background:#f0fdf4;border-radius:12px">
              <div style="font-size:11px;font-weight:900;color:#64748b">TOTAL</div>
              <div style="font-weight:900;font-size:28px;color:#0f172a;margin-top:4px">${empList.length}</div>
            </div>
          </div>

          ${top3.length ? `<div style="margin-bottom:24px">
            <div style="font-weight:900;font-size:15px;margin-bottom:10px">Top 3 employees needing attention</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead><tr><th style="text-align:left;padding:8px 12px;color:#64748b;font-weight:800;border-bottom:2px solid #e2e8f0">Name</th><th style="text-align:center;padding:8px 12px;color:#64748b;font-weight:800;border-bottom:2px solid #e2e8f0">Score</th></tr></thead>
              <tbody>${top3Html}</tbody>
            </table>
          </div>` : ''}

          <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:24px">
            <div style="font-weight:900;font-size:13px;color:#0f172a;margin-bottom:4px">💡 Recommended action</div>
            <div style="font-size:13px;color:#64748b;line-height:1.5">${topAction}</div>
          </div>

          <div style="text-align:center">
            <a href="https://peoplera.work/dashboard.html" style="display:inline-block;background:linear-gradient(90deg,#FF6B6B,#FFD93D);color:#0f172a;font-weight:900;font-size:14px;padding:12px 28px;border-radius:12px;text-decoration:none">Open Dashboard →</a>
          </div>

          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;text-align:center;font-size:11px;color:#94a3b8">
            Confidential — Peoplera · peoplera.work
          </div>
        </div>
      </div>`;

    const res = await fetch('/api/utils', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token },
      body: JSON.stringify({
        action: 'send_email',
        to: email,
        subject: `Your weekly Peoplera burnout report — ${today}`,
        html: emailHtml
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Email failed (${res.status})`);
    }

    showToast('Report sent to ' + email, 'success');
  }catch(e){
    console.error('sendWeeklyEmailReport:', e);
    showToast(e.message || 'Failed to send email', 'error');
  }finally{
    if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
  }
}

// ── Pulse Survey — CBI Question Bank & Picker ──
const CBI_QUESTION_POOL = [
  { id: 'pb1', text: 'How often do you feel tired?', subscale: 'Personal Burnout', scale: 'frequency' },
  { id: 'pb2', text: 'How often are you physically exhausted?', subscale: 'Personal Burnout', scale: 'frequency' },
  { id: 'pb3', text: 'How often are you emotionally exhausted?', subscale: 'Personal Burnout', scale: 'frequency' },
  { id: 'pb4', text: 'How often do you think: "I can\'t take it anymore"?', subscale: 'Personal Burnout', scale: 'frequency' },
  { id: 'pb5', text: 'How often do you feel worn out?', subscale: 'Personal Burnout', scale: 'frequency' },
  { id: 'pb6', text: 'How often do you feel weak and susceptible to illness?', subscale: 'Personal Burnout', scale: 'frequency' },
  { id: 'wb1', text: 'Is your work emotionally exhausting?', subscale: 'Work-Related Burnout', scale: 'degree' },
  { id: 'wb2', text: 'Do you feel burnt out because of your work?', subscale: 'Work-Related Burnout', scale: 'degree' },
  { id: 'wb3', text: 'Does your work frustrate you?', subscale: 'Work-Related Burnout', scale: 'degree' },
  { id: 'wb4', text: 'Do you feel worn out at the end of the working day?', subscale: 'Work-Related Burnout', scale: 'frequency' },
  { id: 'wb5', text: 'Are you exhausted in the morning at the thought of another day at work?', subscale: 'Work-Related Burnout', scale: 'frequency' },
  { id: 'wb6', text: 'Do you feel that every working hour is tiring for you?', subscale: 'Work-Related Burnout', scale: 'frequency' },
  { id: 'wb7', text: 'Do you have enough energy for family and friends during leisure time?', subscale: 'Work-Related Burnout', scale: 'frequency' },
  { id: 'cb1', text: 'Do you find it hard to work with clients?', subscale: 'Client-Related Burnout', scale: 'degree' },
  { id: 'cb2', text: 'Does it drain your energy to work with clients?', subscale: 'Client-Related Burnout', scale: 'degree' },
  { id: 'cb3', text: 'Do you find it frustrating to work with clients?', subscale: 'Client-Related Burnout', scale: 'degree' },
  { id: 'cb4', text: 'Do you feel that you give more than you get back when you work with clients?', subscale: 'Client-Related Burnout', scale: 'degree' },
  { id: 'cb5', text: 'Are you tired of working with clients?', subscale: 'Client-Related Burnout', scale: 'frequency' },
  { id: 'cb6', text: 'Do you sometimes wonder how long you will be able to continue working with clients?', subscale: 'Client-Related Burnout', scale: 'frequency' }
];

const DEFAULT_SURVEY_QUESTIONS = CBI_QUESTION_POOL.filter(q => q.subscale === 'Personal Burnout').slice(0, 5);

const FREQUENCY_ANSWERS = ['Always', 'Often', 'Sometimes', 'Rarely', 'Never'];
const DEGREE_ANSWERS = ['To a very high degree', 'To a high degree', 'Somewhat', 'To a low degree', 'To a very low degree'];

let __surveySelectedQuestions = [...DEFAULT_SURVEY_QUESTIONS];
let __surveyEditingSelection = null; // temp copy during editing

function getAnswerLabels(scale) {
  return scale === 'degree' ? DEGREE_ANSWERS : FREQUENCY_ANSWERS;
}

async function getSurveyQuestions(){
  try {
    const s = (await supabase.auth.getSession()).data?.session;
    if (!s) return [...DEFAULT_SURVEY_QUESTIONS];

    const { data } = await supabase
      .from('survey_config')
      .select('questions')
      .eq('user_id', s.user.id)
      .maybeSingle();

    if (data && Array.isArray(data.questions) && data.questions.length) {
      __surveySelectedQuestions = data.questions;
      return data.questions;
    }

    // MIGRATION: check localStorage for old format
    const legacy = localStorage.getItem('peoplera_survey_questions');
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed) && parsed.length) {
          const migrated = parsed.map(item => {
            if (typeof item === 'string') {
              const match = CBI_QUESTION_POOL.find(q => q.text === item);
              return match || { id: 'custom_' + Math.random().toString(36).slice(2, 8), text: item, subscale: 'Personal Burnout', scale: 'frequency' };
            }
            return item;
          });
          await supabase.from('survey_config').upsert({
            user_id: s.user.id,
            questions: migrated,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
          localStorage.removeItem('peoplera_survey_questions');
          __surveySelectedQuestions = migrated;
          return migrated;
        }
      } catch(e) { /* noop */ }
    }
  } catch(e) {
    console.warn('getSurveyQuestions:', e);
  }
  __surveySelectedQuestions = [...DEFAULT_SURVEY_QUESTIONS];
  return [...DEFAULT_SURVEY_QUESTIONS];
}

function renderSurveyQuestions(){
  const container = document.getElementById('surveyQuestionsContainer');
  if (!container) return;
  const questions = __surveySelectedQuestions;

  if (!questions.length) {
    container.innerHTML = '<div style="color:#94a3b8;font-size:13px;font-weight:700;padding:16px;text-align:center">No questions selected. Click "Edit questions" to pick from the CBI question bank.</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const text = typeof q === 'string' ? q : (q.text || '');
    const scale = (typeof q === 'object' && q.scale) || 'frequency';
    const answers = getAnswerLabels(scale);

    html += `<div style="background:rgba(255,107,107,0.04);border:1px solid rgba(255,107,107,0.12);border-radius:12px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px">`;
    html += `<div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#FF6B6B,#FFD93D);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#fff;flex-shrink:0">${i + 1}</div>`;
    html += '<div style="flex:1;min-width:0">';
    html += `<div style="font-weight:800;font-size:14px;color:#0f172a">${escapeHtml(text)}</div>`;
    html += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">';
    for (const a of answers) {
      html += `<span style="padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(0,0,0,0.04);color:#64748b;border:1px solid rgba(0,0,0,0.06)">${escapeHtml(a)}</span>`;
    }
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function renderSurveyQuestionPicker(){
  const picker = document.getElementById('surveyQuestionPicker');
  if (!picker) return;

  const selectedIds = new Set((__surveyEditingSelection || []).map(q => q.id));
  const subscales = ['Personal Burnout', 'Work-Related Burnout', 'Client-Related Burnout'];

  const MAX_SURVEY_QUESTIONS = 5;
  const atLimit = selectedIds.size >= MAX_SURVEY_QUESTIONS;

  let html = '';
  html += '<div style="font-weight:900;font-size:15px;color:#0f172a;margin-bottom:4px">Select questions from the CBI question bank</div>';
  html += `<div style="font-size:12px;color:${atLimit ? '#ef4444' : '#94a3b8'};font-weight:700;margin-bottom:12px">${atLimit ? 'Maximum 5 questions \u2014 remove one to add another.' : selectedIds.size + ' of 5 selected'}</div>`;

  for (const subscale of subscales) {
    const items = CBI_QUESTION_POOL.filter(q => q.subscale === subscale);
    html += `<div style="margin-bottom:16px">`;
    html += `<div style="font-weight:900;font-size:13px;color:#6366f1;letter-spacing:0.04em;margin-bottom:8px">${escapeHtml(subscale.toUpperCase())}</div>`;
    if (subscale === 'Client-Related Burnout') {
      html += `<div style="font-size:11px;color:#94a3b8;font-weight:700;margin-bottom:8px;font-style:italic">Only for teams that work directly with clients, customers, or patients.</div>`;
    }
    for (const q of items) {
      const isSelected = selectedIds.has(q.id);
      const bgColor = isSelected ? 'rgba(99,102,241,0.08)' : 'rgba(0,0,0,0.02)';
      const borderColor = isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(0,0,0,0.06)';
      const addDisabled = !isSelected && atLimit;
      const btnLabel = isSelected ? 'Remove' : 'Add';
      const btnStyle = isSelected
        ? 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#ef4444'
        : addDisabled
          ? 'background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.06);color:#cbd5e1;cursor:not-allowed'
          : 'background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);color:#6366f1';
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${bgColor};border:1px solid ${borderColor};border-radius:10px;margin-bottom:6px;transition:all 0.15s">`;
      html += `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;color:#0f172a">${escapeHtml(q.text)}</div><div style="font-size:10px;color:#94a3b8;margin-top:2px;font-weight:700">Scale: ${q.scale === 'degree' ? 'Degree' : 'Frequency'}</div></div>`;
      html += `<button type="button" ${addDisabled ? 'disabled' : ''} onclick="toggleSurveyPoolQuestion('${q.id}')" style="${btnStyle};border-radius:8px;padding:5px 10px;font-size:11px;font-weight:900;cursor:${addDisabled ? 'not-allowed' : 'pointer'};flex-shrink:0;transition:all 0.15s">${btnLabel}</button>`;
      html += '</div>';
    }
    html += '</div>';
  }

  // Selected preview
  const sel = __surveyEditingSelection || [];
  if (sel.length) {
    html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(0,0,0,0.06)">';
    html += `<div style="font-weight:900;font-size:13px;color:#0f172a;margin-bottom:10px">Selected (${sel.length} / ${MAX_SURVEY_QUESTIONS})</div>`;
    html += '<div style="display:grid;gap:6px">';
    for (let i = 0; i < sel.length; i++) {
      const q = sel[i];
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,107,107,0.04);border:1px solid rgba(255,107,107,0.12);border-radius:10px">`;
      html += `<div style="width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#FF6B6B,#FFD93D);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:10px;color:#fff;flex-shrink:0">${i + 1}</div>`;
      html += `<div style="flex:1;font-weight:700;font-size:12px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(q.text)}</div>`;
      html += `<button type="button" onclick="toggleSurveyPoolQuestion('${q.id}')" style="background:none;border:none;font-size:14px;cursor:pointer;color:#94a3b8;padding:2px 6px" title="Remove">&times;</button>`;
      html += '</div>';
    }
    html += '</div></div>';
  }

  picker.innerHTML = html;
}

function toggleSurveyPoolQuestion(qId){
  if (!__surveyEditingSelection) __surveyEditingSelection = [];
  const idx = __surveyEditingSelection.findIndex(q => q.id === qId);
  if (idx >= 0) {
    __surveyEditingSelection.splice(idx, 1);
  } else {
    if (__surveyEditingSelection.length >= 5) return;
    const poolItem = CBI_QUESTION_POOL.find(q => q.id === qId);
    if (poolItem) __surveyEditingSelection.push({ ...poolItem });
  }
  renderSurveyQuestionPicker();
}

function toggleSurveyQuestionsEdit(){
  const btnEdit = document.getElementById('btnEditSurveyQuestions');
  const btnSave = document.getElementById('btnSaveSurveyQuestions');
  const btnCancel = document.getElementById('btnCancelSurveyEdit');
  const picker = document.getElementById('surveyQuestionPicker');
  const container = document.getElementById('surveyQuestionsContainer');
  if (!btnEdit || !btnSave) return;

  // Enter edit mode
  __surveyEditingSelection = __surveySelectedQuestions.map(q => ({ ...q }));
  btnEdit.style.display = 'none';
  btnSave.style.display = '';
  if (btnCancel) btnCancel.style.display = '';
  if (container) container.style.display = 'none';
  if (picker) picker.style.display = 'block';
  renderSurveyQuestionPicker();
}

function cancelSurveyQuestionsEdit(){
  const btnEdit = document.getElementById('btnEditSurveyQuestions');
  const btnSave = document.getElementById('btnSaveSurveyQuestions');
  const btnCancel = document.getElementById('btnCancelSurveyEdit');
  const picker = document.getElementById('surveyQuestionPicker');
  const container = document.getElementById('surveyQuestionsContainer');

  __surveyEditingSelection = null;
  if (btnEdit) btnEdit.style.display = '';
  if (btnSave) btnSave.style.display = 'none';
  if (btnCancel) btnCancel.style.display = 'none';
  if (picker) picker.style.display = 'none';
  if (container) container.style.display = 'grid';
  renderSurveyQuestions();
}

async function saveSurveyQuestions(){
  const questions = __surveyEditingSelection && __surveyEditingSelection.length
    ? __surveyEditingSelection
    : [...DEFAULT_SURVEY_QUESTIONS];

  if (questions.length !== 5) {
    showToast('Please select 5 questions', 'error');
    return;
  }

  try {
    const s = (await supabase.auth.getSession()).data?.session;
    if (!s) throw new Error('Not authenticated');

    const { error } = await supabase.from('survey_config').upsert({
      user_id: s.user.id,
      questions: questions,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (error) throw error;
  } catch(e) {
    console.error('saveSurveyQuestions:', e);
    showToast(e.message || 'Failed to save questions', 'error');
    return;
  }

  __surveySelectedQuestions = questions;
  __surveyEditingSelection = null;

  const btnEdit = document.getElementById('btnEditSurveyQuestions');
  const btnSave = document.getElementById('btnSaveSurveyQuestions');
  const btnCancel = document.getElementById('btnCancelSurveyEdit');
  const picker = document.getElementById('surveyQuestionPicker');
  const container = document.getElementById('surveyQuestionsContainer');

  if (btnSave) btnSave.style.display = 'none';
  if (btnCancel) btnCancel.style.display = 'none';
  if (btnEdit) btnEdit.style.display = '';
  if (picker) picker.style.display = 'none';
  if (container) container.style.display = 'grid';
  renderSurveyQuestions();
  showToast('Survey questions saved', 'success');
}

// Load survey config on page init
async function initSurveyQuestions(){
  await getSurveyQuestions();
  renderSurveyQuestions();
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => initSurveyQuestions(), 100);
});

// ── Pulse Survey — Send survey emails ──
async function sendPulseSurvey(){
  const btn = document.getElementById('btnSendSurvey');
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

  try{
    const s = (await supabase.auth.getSession()).data?.session;
    if (!s) throw new Error('Not authenticated');
    const token = s.access_token;

    // Get employees with email
    const { data: emps } = await supabase
      .from('employees')
      .select('id, full_name, email')
      .eq('user_id', s.user.id);

    const withEmail = (emps || []).filter(e => e.email && e.email.includes('@'));
    if (!withEmail.length) {
      showToast('No employees have email addresses. Add emails first.', 'error');
      return;
    }

    // Generate tokens and send
    const customQuestions = __surveySelectedQuestions.length ? __surveySelectedQuestions : await getSurveyQuestions();
    let sentCount = 0;
    for (const emp of withEmail) {
      const surveyToken = crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now().toString(36));
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // Store token with custom questions
      await supabase.from('survey_tokens').upsert({
        employee_id: emp.id,
        token: surveyToken,
        sent_at: new Date().toISOString(),
        expires_at: expiresAt,
        user_id: s.user.id,
        questions: customQuestions
      }, { onConflict: 'employee_id,token' });

      // Send email
      const surveyUrl = `${window.location.origin}/survey/?token=${surveyToken}`;
      const emailHtml = `
        <div style="max-width:520px;margin:0 auto;font-family:'DM Sans',Arial,sans-serif">
          <div style="background:linear-gradient(90deg,#FF6B6B,#FFD93D);padding:20px 24px;border-radius:14px 14px 0 0">
            <div style="font-weight:900;font-size:18px;color:#0f172a">Peoplera Pulse Check</div>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #f1f5f9;border-top:none;border-radius:0 0 14px 14px">
            <p style="color:#334155;line-height:1.6">Hi ${escapeHtml(emp.full_name || '')},</p>
            <p style="color:#64748b;line-height:1.6">Your team uses Peoplera to understand wellbeing. This anonymous 5-question check takes about 2 minutes.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${surveyUrl}" style="display:inline-block;background:linear-gradient(90deg,#FF6B6B,#FFD93D);color:#0f172a;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:15px">Take the survey →</a>
            </div>
            <p style="font-size:12px;color:#94a3b8;text-align:center">This link expires in 7 days. Your answers are anonymous.</p>
          </div>
        </div>`;

      try{
        await fetch('/api/utils', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token },
          body: JSON.stringify({
            action: 'send_email',
            to: emp.email,
            subject: 'Peoplera Pulse Check — How are you doing?',
            html: emailHtml
          })
        });
        sentCount++;
      }catch(emailErr){
        console.warn('Survey email failed for', emp.email, emailErr);
      }
    }

    const confirmMsg = `Survey sent to ${sentCount} employee${sentCount !== 1 ? 's' : ''}`;
    showToast(confirmMsg, 'success');

    // Show inline confirmation
    const confirmEl = document.getElementById('surveyConfirmation');
    if (confirmEl) {
      confirmEl.textContent = `✅ ${confirmMsg}. Unique survey links have been emailed.`;
      confirmEl.style.display = 'block';
    }

    // Update response rate UI
    const rateText = document.getElementById('responseRateText');
    if (rateText) rateText.textContent = `0 of ${withEmail.length} employees responded`;

  }catch(e){
    console.error('sendPulseSurvey:', e);
    showToast(e.message || 'Failed to send surveys', 'error');
  }finally{
    if (btn) { btn.textContent = originalText; btn.disabled = false; }
  }
}

window.showAddEmployeeForm = showAddEmployeeForm;
window.hideAddEmployeeForm = hideAddEmployeeForm;
window.saveEmployee = saveEmployee;
window.deleteEmployee = deleteEmployee;
window.loadDemoData = loadDemoData;
window.generateFullReport = generateFullReport;
window.closeEmployeeCard = closeEmployeeCard;
window.exportPulseReportXlsx = exportPulseReportXlsx;
window.copyPlanToClipboard = copyPlanToClipboard;
window.sendPlanToEmployee = sendPlanToEmployee;
window.togglePlanAction = togglePlanAction;
window.deletePlanAction = deletePlanAction;
window.onboardGoStep = onboardGoStep;
window.skipOnboarding = skipOnboarding;
window.resetDemoAndReload = resetDemoAndReload;
window.exportPdfReport = exportPdfReport;
window.sendWeeklyEmailReport = sendWeeklyEmailReport;
window.sendPulseSurvey = sendPulseSurvey;
window.loadSurveyResults = loadSurveyResults;
window.generateAIInsights = generateAIInsights;
window.toggleSurveyQuestionsEdit = toggleSurveyQuestionsEdit;
window.cancelSurveyQuestionsEdit = cancelSurveyQuestionsEdit;
window.saveSurveyQuestions = saveSurveyQuestions;
window.renderSurveyQuestions = renderSurveyQuestions;
window.toggleSurveyPoolQuestion = toggleSurveyPoolQuestion;

boot();