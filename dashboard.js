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
      .limit(1);
    if (hireData && hireData[0]) {
      renderHireDetail(hireData[0].candidates);
      document.getElementById('statCandidates').textContent = String(hireData[0].candidates.length);
    }

    // Load last board result
    const { data: boardData } = await supabase
      .from('board_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (boardData && boardData[0]) {
      renderBoardPlan(boardData[0].onboarding_plan);
    }

    // Load last pulse result
    const { data: pulseData } = await supabase
      .from('pulse_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (pulseData && pulseData[0]) {
      renderPulse(pulseData[0].employees);
      document.getElementById('statAtRisk').textContent = String(pulseData[0].at_risk_count || 0);
    }
  } catch(e) { console.warn('Load history failed', e); }
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
  document.querySelectorAll('.module').forEach(m=>m.classList.remove('on'));
  const t = document.getElementById('tab-' + tab);
  if (t) t.classList.add('on');
  const titleMap = { overview:'Overview', hire:'Hire', board:'Board', pulse:'Pulse', settings:'Settings' };
  document.getElementById('pageTitle').textContent = titleMap[tab] || 'Dashboard';
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
  const res = await fetch('/api/public-config');
  const data = await readJsonSafe(res);
  if (!res.ok) throw new Error((data && data.error) ? data.error : 'Failed to load config');
  if (!data.supabaseUrl || !data.supabaseAnonKey) throw new Error('CONFIG_MISSING');
  supabase = window.supabase.createClient(data.supabaseUrl, data.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
  });

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

function renderHireTable(candidates){
  const table = document.getElementById('hireTable');
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  candidates.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml(c.matchScore)}</td>
      <td>${escapeHtml(c.recommendation || '')}</td>
    `;
    tbody.appendChild(tr);
  });
  table.hidden = false;
}

function renderHireDetail(candidates){
  const el = document.getElementById('hireDetail');
  el.innerHTML = candidates.map(c=>{
    const s = Array.isArray(c.strengths) ? c.strengths : [];
    const w = Array.isArray(c.weaknesses) ? c.weaknesses : [];
    return `
      <div class="panel" style="padding:12px;border-radius:14px;margin-top:10px;background:rgba(255,255,255,.03)">
        <div style="font-weight:1000">${escapeHtml(c.name || '')} — ${escapeHtml(c.matchScore)}/100</div>
        <div class="small" style="margin-top:6px"><span style="color:var(--text);font-weight:900">Recommendation:</span> ${escapeHtml(c.recommendation || '')}</div>
        <div class="small" style="margin-top:6px"><span style="color:var(--text);font-weight:900">Strengths:</span> ${escapeHtml(s.join(' • '))}</div>
        <div class="small" style="margin-top:6px"><span style="color:var(--text);font-weight:900">Weaknesses:</span> ${escapeHtml(w.join(' • '))}</div>
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
    renderHireTable(candidates);
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
  const section = (title, items)=>{
    const list = Array.isArray(items) ? items : [];
    return `
      <div style="margin-top:12px">
        <div style="font-weight:1000;color:var(--text)">${escapeHtml(title)}</div>
        <div class="small" style="margin-top:6px;display:grid;gap:6px">
          ${list.map(i=>`<div class="feed-item" style="margin:0">${escapeHtml(i)}</div>`).join('')}
        </div>
      </div>
    `;
  };

  out.innerHTML = `
    ${section('First week checklist', plan.firstWeekChecklist)}
    ${section('30 days', plan.day30)}
    ${section('60 days', plan.day60)}
    ${section('90 days', plan.day90)}
    ${section('Resources', plan.resources)}
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
  document.getElementById('statAtRisk').textContent = String(atRisk);

  out.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Score</th>
          <th>Level</th>
          <th>Top factors</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(e=>{
          const factors = Array.isArray(e.riskFactors) ? e.riskFactors.slice(0,3).join('; ') : '';
          const lvl = String(e.riskLevel || 'critical').toLowerCase();
          return `
            <tr>
              <td>${escapeHtml(e.name || '')}</td>
              <td>${escapeHtml(e.burnoutScore)}</td>
              <td><span class="risk ${riskClass(lvl)}">${escapeHtml(lvl)}</span></td>
              <td>${escapeHtml(factors)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function runPulse(){
  const btn = document.getElementById('btnPulse');
  const reset = setBusy(btn, 'Analyzing…');
  const msg = document.getElementById('pulseMsg');
  msg.textContent = '';
  try{
    const file = document.getElementById('pulseCsv').files?.[0] || null;
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
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click',()=>switchTab(btn.getAttribute('data-tab')));
  });

  document.getElementById('btnLogin').addEventListener('click', async ()=>{
    const b = document.getElementById('btnLogin');
    const reset = setBusy(b, 'Redirecting…');
    document.getElementById('gateMsg').textContent = '';
    try{
      await loginGoogle();
    }catch(err){
      document.getElementById('gateMsg').textContent = err && err.message ? err.message : 'Login failed';
      reset();
    }
  });

  document.getElementById('btnLogout').addEventListener('click', async ()=>{
    const b = document.getElementById('btnLogout');
    const reset = setBusy(b, 'Signing out…');
    try{ await logout(); }
    finally{ reset(); }
  });

  document.getElementById('btnHire').addEventListener('click', runHire);
  document.getElementById('btnExportHire').addEventListener('click', ()=>{
    if (!hireCsvRows.length) return;
    download('peoplera-hire-candidates.csv', toCsv(hireCsvRows), 'text/csv');
  });

  document.getElementById('btnBoard').addEventListener('click', runBoard);
  document.getElementById('btnDownloadBoard').addEventListener('click', ()=>{
    try{
      downloadBoardPdf(boardLast);
    }catch(err){
      const txt = generatePlanPdfText(boardLast);
      if (txt) download('peoplera-onboarding-plan.txt', txt, 'text/plain');
      else alert(err && err.message ? err.message : 'Download failed');
    }
  });

  document.getElementById('btnPulse').addEventListener('click', runPulse);

  initDrop(document.getElementById('cvDrop'), document.getElementById('cvFiles'), document.getElementById('cvList'));

  // Initialize feed with a couple of realistic events
  addFeed('Security', 'Session-protected dashboard initialized.');
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

boot();
