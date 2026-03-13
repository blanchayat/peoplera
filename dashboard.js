async function readJsonSafe(res){
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t }; }
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
  // Minimal CSV parser supporting quoted values.
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

  // Refresh session if needed
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
  if (!el || !items || items.length === 0) return;
  
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
            <div onclick="loadHistoryItem('${type}', ${idx})" 
              style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.07);border-radius:10px;padding:10px 14px;cursor:pointer;transition:all 0.2s"
              onmouseover="this.style.background='rgba(${type==='hire'?'99,102,241':type==='board'?'0,184,148':'255,107,107'},0.06)';this.style.borderColor='${color}44'"
              onmouseout="this.style.background='rgba(0,0,0,0.02)';this.style.borderColor='rgba(0,0,0,0.07)'">
              <div>
                <div style="font-size:12px;font-weight:700;color:#0f172a">${preview}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:2px">${date}</div>
              </div>
              <div style="font-size:10px;font-weight:800;color:${color};background:${color}15;border-radius:6px;padding:3px 8px">Load →</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
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

    // Load last hire result
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

    // Load last board result
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

    // Load last pulse result
    const { data: pulseData } = await supabase
      .from('pulse_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (pulseData && pulseData[0]) {
      renderPulse(pulseData[0].employees);
      document.getElementById('statAtRisk').textContent = String(pulseData[0].at_risk_count || 0);
    }
    if (pulseData) renderHistory('pulseHistory', pulseData, 'pulse');
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
  document.getElementById('pulseOut').innerHTML = '';
  document.getElementById('statAtRisk').textContent = '0';
  // Reload history after clearing view
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;
    const { data: pulseData } = await supabase
      .from('pulse_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (pulseData) renderHistory('pulseHistory', pulseData, 'pulse');
  } catch(e) { console.warn(e); }
}

function addFeed(type, message){
  const feed = document.getElementById('feed');
  const el = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = `<div class="t">${escapeHtml(type)}</div><div class="m">${escapeHtml(message)}</div>`;
  feed.prepend(el);
}

function switchTab(tab){
  document.querySelectorAll('.nav-item').forEach(b=>{
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.nav-item[data-section]').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.module').forEach(m=>m.classList.remove('on'));
  const t = document.getElementById('tab-' + tab);
  if (t) t.classList.add('on');
  const titleMap = { overview:'Overview', hire:'Hire', board:'Board', pulse:'Pulse', settings:'Settings' };
  document.getElementById('pageTitle').textContent = titleMap[tab] || 'Dashboard';
}

function showSection(section){
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (nav) nav.classList.add('active');

  if (section === 'interview') {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('on'));
    document.getElementById('mod-interview')?.classList.add('on');
    document.getElementById('pageTitle').textContent = 'Interview';
  }
  if (section === 'roi') {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('on'));
    document.getElementById('mod-roi')?.classList.add('on');
    document.getElementById('pageTitle').textContent = 'ROI Calculator';
    runROI();
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

async function initSupabase(){
  if (!window.supabaseLib && window.supabase && typeof window.supabase.createClient === 'function') {
    window.supabaseLib = window.supabase;
  }
  const supabaseLib = window.supabaseLib || window.supabase;
  const res = await fetch('/api/public-config');
  const data = await readJsonSafe(res);
  if (!res.ok) throw new Error((data && data.error) ? data.error : 'Failed to load config');
  if (!data.supabaseUrl || !data.supabaseAnonKey) throw new Error('CONFIG_MISSING');
  supabase = supabaseLib.createClient(data.supabaseUrl, data.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
  });

  window.supabase = supabase;
  window.supabaseClient = supabase;

  const { data: sData } = await supabase.auth.getSession();
  session = sData.session;

  supabase.auth.onAuthStateChange((_event, newSession)=>{
    session = newSession;
    renderAuthState();
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

function renderAuthState(){
  const gate = document.getElementById('gate');
  const app = document.getElementById('app');
  if (!session){
    gate.hidden = false;
    app.hidden = true;
    return;
  }
  gate.hidden = true;
  app.hidden = false;

  const email = session.user && session.user.email ? session.user.email : 'Signed in';
  document.getElementById('userPill').textContent = email;
}

async function checkStatus(){
  const sEl = document.getElementById('supabaseStatus');
  const aEl = document.getElementById('aiStatus');
  sEl.textContent = session ? 'Connected (session active)' : 'Not signed in';

  try{
    const data = await apiFetch('/api/hire', { method:'POST', body:{ ping:true }, accessToken: (await supabase.auth.getSession()).data?.session?.access_token });
    aEl.textContent = data && data.ok ? 'Connected' : 'Connected';
  }catch(err){
    aEl.textContent = (err && err.message) ? err.message : 'AI endpoint unavailable';
  }
}

// ── INTERVIEW ──────────────────────────────────────────
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

// ── ROI CALCULATOR ─────────────────────────────────────
async function runROI(){
  const candidatesAnalyzed = Number(document.getElementById('roiCandidates')?.value || 0);
  const onboardingPlansGenerated = Number(document.getElementById('roiPlans')?.value || 0);
  const employeesMonitored = Number(document.getElementById('roiEmployees')?.value || 0);
  const avgSalary = Number(document.getElementById('roiSalary')?.value || 60000);
  const planCost = Number(document.getElementById('roiPlanCost')?.value || 99);
  const out = document.getElementById('roiOut');

  out.innerHTML = '<div style="color:#64748b;font-size:13px">Calculating…</div>';

  try {
    const res = await fetch('/api/roi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidatesAnalyzed, onboardingPlansGenerated, employeesMonitored, planCost, avgSalary })
    });
    const d = await res.json();

    const fmt = (n) => '$' + Number(n || 0).toLocaleString();
    const roiColor = d.roi >= 100 ? '#00b894' : d.roi >= 0 ? '#FFD93D' : '#FF6B6B';

    out.innerHTML = `
      <div style="background:rgba(0,184,148,0.06);border:1px solid rgba(0,184,148,0.2);border-radius:16px;padding:24px;margin-bottom:12px;text-align:center">
        <div style="font-size:11px;font-weight:900;color:#00b894;letter-spacing:0.08em;margin-bottom:8px">ESTIMATED MONTHLY ROI</div>
        <div style="font-family:'Syne',system-ui;font-weight:900;font-size:52px;color:${roiColor};line-height:1">${d.roi}%</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px">Total value: ${fmt(d.totalValue)} vs ${fmt(planCost)} plan cost</div>
      </div>

      <div style="display:grid;gap:8px">
        <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.07);border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;color:#334155">🎯 Bad hire cost prevented</div>
          <div style="font-weight:900;font-size:14px;color:#00b894">${fmt(d.badHireCostPrevented)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.07);border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;color:#334155">📋 Onboarding time saved</div>
          <div style="font-weight:900;font-size:14px;color:#6366f1">${fmt(d.onboardingTimeSaved)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.07);border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;color:#334155">🔥 Burnout prevention value</div>
          <div style="font-weight:900;font-size:14px;color:#FF6B6B">${fmt(d.burnoutPreventionValue)}</div>
        </div>
        <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.07);border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;color:#334155">⏱ HR time saved</div>
          <div style="font-weight:900;font-size:14px;color:#FFD93D">${fmt(d.hrTimeSaved)}</div>
        </div>
      </div>

      <div style="margin-top:12px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:12px;color:#64748b">Share this with your CFO 👇</div>
        <div style="font-family:'Syne',system-ui;font-weight:900;font-size:15px;color:#0f172a;margin-top:6px">
          "Peoplera delivers ${fmt(d.totalValue)}/mo in value for just ${fmt(planCost)}/mo"
        </div>
      </div>
    `;
  } catch(e) {
    out.innerHTML = '<div style="color:#FF6B6B;font-size:13px">Error: ' + e.message + '</div>';
  }
}

// ── EMAIL WEEKLY REPORT ────────────────────────────────
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

// Hire
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

    // Save hire result to Supabase
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

    // stats + feed
    document.getElementById('statCandidates').textContent = String(candidates.length);
    addFeed('Hire', `Analyzed ${candidates.length} candidate(s) against the job description.`);

    // export
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

// Board
let boardLast = null;

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
            <div style="font-size:13px;color:#334155;line-height:1.6">${escapeHtml(item)}</div>
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
}

async function runBoard(){
  const btn = document.getElementById('btnBoard');
  const reset = setBusy(btn, 'Generating…');
  const msg = document.getElementById('boardMsg');
  msg.textContent = '';
  try{
    const name = document.getElementById('empName').value.trim();
    const role = document.getElementById('empRole').value.trim();
    const department = document.getElementById('empDept').value.trim();
    const startDate = document.getElementById('empStart').value;
    const file = document.getElementById('handbookFile').files?.[0] || null;

    if (!name || !role || !department || !startDate) throw new Error('All employee fields are required');
    if (!file) throw new Error('Upload a handbook PDF');

    const handbookText = await extractPdfText(file);
    if (!handbookText) throw new Error('Could not extract handbook text');

    const data = await apiFetch('/api/board', {
      method:'POST',
      accessToken: (await supabase.auth.getSession()).data?.session?.access_token,
      body: {
        employee: { name, role, department, startDate },
        handbookText
      }
    });

    const plan = data?.onboardingPlan;
    if (!plan) throw new Error('Invalid AI response');

    boardLast = data;
    renderBoardPlan(plan);

    // Save board result to Supabase
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

    document.getElementById('btnDownloadBoard').disabled = false;

    document.getElementById('statEmployees').textContent = String(Number(document.getElementById('statEmployees').textContent || 0) + 1);
    addFeed('Board', `Generated onboarding plan for ${name} (${role}).`);

    msg.textContent = 'Done.';
  }catch(err){
    msg.textContent = err && err.message ? err.message : 'Board generation failed';
  }finally{
    reset();
  }
}

function generatePlanPdfText(data){
  const p = data?.onboardingPlan;
  if (!p) return '';
  const lines = [];
  lines.push('Peoplera — Onboarding Plan');
  lines.push('');
  const sec = (title, items)=>{
    lines.push(title);
    const arr = Array.isArray(items) ? items : [];
    for (const it of arr) lines.push(' - ' + it);
    lines.push('');
  };
  sec('First week checklist', p.firstWeekChecklist);
  sec('Day 30', p.day30);
  sec('Day 60', p.day60);
  sec('Day 90', p.day90);
  sec('Resources', p.resources);
  return lines.join('\n');
}

function downloadBoardPdf(data){
  const p = data?.onboardingPlan;
  if (!p) throw new Error('No onboarding plan to download');
  const jspdf = window.jspdf;
  if (!jspdf || !jspdf.jsPDF) throw new Error('PDF library not loaded');

  const doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 52;
  let y = 64;

  const title = 'Peoplera — 30-60-90 Onboarding Plan';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text('Generated by Peoplera Board', margin, y);
  doc.setTextColor(0);
  y += 22;

  const section = (name, items)=>{
    const arr = Array.isArray(items) ? items : [];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    y += 10;
    if (y > 760){ doc.addPage(); y = 64; }
    doc.text(name, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    for (const it of arr){
      const line = '- ' + String(it);
      const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
      for (const w of wrapped){
        if (y > 770){ doc.addPage(); y = 64; }
        doc.text(w, margin, y);
        y += 14;
      }
    }
  };

  section('First week checklist', p.firstWeekChecklist);
  section('30 days', p.day30);
  section('60 days', p.day60);
  section('90 days', p.day90);
  section('Resources', p.resources);

  doc.save('peoplera-onboarding-plan.pdf');
}

// Pulse
let pulseLast = null;

function renderPulse(employees){
  const out = document.getElementById('pulseOut');
  const rows = employees.slice().sort((a,b)=>(b.burnoutScore||0)-(a.burnoutScore||0));
  const atRisk = rows.filter(e=>['high','critical'].includes(String(e.riskLevel||'').toLowerCase())).length;
  const statEl = document.getElementById('statAtRisk');
  if(statEl) statEl.textContent = String(atRisk);

  const colorMap = { low:'#00e5a0', medium:'#FFD93D', high:'#FF6B6B', critical:'#ff3b3b' };
  const fontMap = { low:'Syne', medium:'Syne', high:'Syne', critical:'Syne' };

  out.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid rgba(0,0,0,0.08)">
            <th style="text-align:left;padding:10px 12px;font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:0.08em">NAME</th>
            <th style="text-align:center;padding:10px 12px;font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:0.08em">SCORE</th>
            <th style="text-align:center;padding:10px 12px;font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:0.08em">LEVEL</th>
            <th style="text-align:left;padding:10px 12px;font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:0.08em">TOP FACTORS</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((e,idx) => {
            const lvl = String(e.riskLevel||'medium').toLowerCase();
            const color = colorMap[lvl] || '#FFD93D';
            const score = e.burnoutScore || 0;
            const factors = Array.isArray(e.riskFactors) ? e.riskFactors : [];
            const recs = Array.isArray(e.recommendations) ? e.recommendations : [];
            const dataAttr = `data-employee='${JSON.stringify(e).replace(/'/g,"&#39;")}'`;
            return `
              <tr style="border-bottom:1px solid rgba(0,0,0,0.06);transition:background 0.2s" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='transparent'">
                <td style="padding:14px 12px">
                  <span ${dataAttr} onclick="showEmployeeCard(this)" style="font-weight:800;font-family:'Syne',system-ui;cursor:pointer;color:#0f172a;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);text-underline-offset:3px">${escapeHtml(e.name||'')}</span>
                </td>
                <td style="padding:14px 12px;text-align:center">
                  <div style="display:inline-flex;flex-direction:column;align-items:center;gap:4px">
                    <span style="font-family:'Syne',system-ui;font-weight:900;font-size:20px;color:${color}">${score}</span>
                    <div style="width:48px;height:4px;background:rgba(0,0,0,0.08);border-radius:4px;overflow:hidden">
                      <div style="height:100%;width:${score}%;background:${color};border-radius:4px"></div>
                    </div>
                  </div>
                </td>
                <td style="padding:14px 12px;text-align:center">
                  <span style="background:${color}22;border:1px solid ${color}55;border-radius:8px;padding:4px 12px;font-size:11px;font-weight:900;color:${color};font-family:'Syne',system-ui;text-transform:uppercase;letter-spacing:0.05em">${lvl}</span>
                </td>
                <td style="padding:14px 12px;color:#64748b;line-height:1.5">${factors.slice(0,2).map(f=>escapeHtml(f)).join(' · ')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Employee detail modal -->
    <div id="employeeModal" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);align-items:center;justify-content:center" onclick="if(event.target===this)closeEmployeeCard()">
      <div id="employeeCard" style="background:#ffffff;border:1px solid rgba(0,0,0,0.1);border-radius:20px;padding:28px;width:min(480px,92vw);position:relative;box-shadow:0 32px 80px rgba(0,0,0,0.5)">
        <button onclick="closeEmployeeCard()" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.08);border:none;border-radius:8px;width:30px;height:30px;color:#0f172a;font-size:16px;cursor:pointer">✕</button>
        <div id="employeeCardContent"></div>
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
      ${factors.map(f=>`<div style=\"font-size:13px;color:#334155;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.06)\">${escapeHtml(f)}</div>`).join('')}
    </div>
    <div style="background:rgba(0,229,160,0.06);border:1px solid rgba(0,229,160,0.12);border-radius:12px;padding:14px">
      <div style="font-size:10px;font-weight:900;color:#00e5a0;letter-spacing:0.08em;margin-bottom:8px">→ RECOMMENDATIONS</div>
      ${recs.map(r=>`<div style=\"font-size:13px;color:#334155;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.06)\">${escapeHtml(r)}</div>`).join('')}
    </div>
  `;
  const modal = document.getElementById('employeeModal');
  modal.style.display = 'flex';
}

function closeEmployeeCard(){
  document.getElementById('employeeModal').style.display = 'none';
}

async function runPulse(){
  const btn = document.getElementById('btnPulse');
  const reset = setBusy(btn, 'Analyzing…');
  const msg = document.getElementById('pulseMsg');
  msg.textContent = '';
  try{
    const file = document.getElementById('pulseFile').files?.[0] || null;
    if (!file) throw new Error('Upload a CSV');
    const text = await file.text();
    const rows = parseCsvText(text);
    if (rows.length < 2) throw new Error('CSV must include a header row and at least one employee row');

    const employeesInput = mapEmployeeRows(rows);
    if (employeesInput.length === 0) throw new Error('No employee rows found');

    const data = await apiFetch('/api/pulse', {
      method:'POST',
      accessToken: (await supabase.auth.getSession()).data?.session?.access_token,
      body: { employees: employeesInput }
    });

    if (!data || !Array.isArray(data.employees)) throw new Error('Invalid AI response');
    pulseLast = data;
    renderPulse(data.employees);

    // Save pulse result to Supabase
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        const result = data;
        const atRisk = result.employees.filter(e => ['high','critical'].includes(String(e.riskLevel||'').toLowerCase())).length;
        await supabase.from('pulse_results').insert({
          user_id: s.user.id,
          employees: result.employees,
          at_risk_count: atRisk
        });

        // Send weekly report email
        const { data: { session: emailSession } } = await supabase.auth.getSession();
        if (emailSession?.user?.email) {
          await sendWeeklyReport(emailSession.user.email, result.employees, atRisk);
        }
      }
    } catch(e) { console.warn('Save pulse result failed', e); }

    addFeed('Pulse', `Generated weekly burnout report for ${data.employees.length} employee(s).`);

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

    // Initialize feed with a couple of realistic events
    addFeed('Security', 'Session-protected dashboard initialized.');
  } catch(e) {
    console.warn('wireUi error:', e);
  }
}

async function boot(){
  wireUi();

  // Default gate state: show a calm loading message and avoid surfacing config details.
  const gateMsg = document.getElementById('gateMsg');
  if (gateMsg) gateMsg.textContent = 'Loading…';

  try{
    await initSupabase();
    renderAuthState();
    await loadHistory();
    await checkStatus();
  }catch(err){
    // Avoid showing raw init/config errors in UI.
    console.error('Dashboard init failed:', err);
    document.getElementById('gate').hidden = false;
    document.getElementById('app').hidden = true;
    const msg = (err && err.message) ? String(err.message) : '';
    if (msg === 'CONFIG_MISSING'){
      document.getElementById('gateMsg').textContent = 'Loading…';
    }else{
      document.getElementById('gateMsg').textContent = 'Loading…';
    }
  }
}

window.runHire = runHire;
window.runBoard = runBoard;
window.runPulse = runPulse;
window.clearHire = clearHire;
window.clearBoard = clearBoard;
window.clearPulse = clearPulse;
window.showSection = showSection;
window.runInterview = runInterview;
window.runROI = runROI;
window.loadHistoryItem = loadHistoryItem;
window.showEmployeeCard = showEmployeeCard;
window.closeEmployeeCard = closeEmployeeCard;

boot();
