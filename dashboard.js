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
  if (!items || items.length === 0) { el.innerHTML = ''; return; }

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

    const { data: pulseData } = await supabase
      .from('pulse_results')
      .select('*')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })
      .limit(5);
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

    const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', {
      day:'2-digit',
      month:'2-digit',
      year:'numeric'
    });

    const settingsEl = document.getElementById('tab-settings');
    if (!settingsEl) return;

    function cancelSubscription(){
      window.open('https://app.lemonsqueezy.com/billing','_blank');
    }

    window.cancelSubscription = cancelSubscription;

    settingsEl.innerHTML = `
      <div style="max-width:700px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div style="padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px">
            <div style="font-size:10px;color:#64748b;font-weight:900">STATUS</div>
            <div style="font-weight:900;margin-top:6px">Early Access</div>
          </div>
          <div style="padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px">
            <div style="font-size:10px;color:#64748b;font-weight:900">MEMBER SINCE</div>
            <div style="font-weight:900;margin-top:6px">${memberSince}</div>
          </div>
        </div>
        <div style="margin-top:16px;font-size:12px;color:#64748b">
          You are part of early access. No billing is active.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
          <div style="padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px">
            <div style="font-size:10px;color:#64748b;font-weight:900">TRIAL ENDS</div>
            <div style="font-weight:900;margin-top:6px">${trialEndDate}</div>
          </div>
          <div style="padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:12px">
            <div style="font-size:10px;color:#64748b;font-weight:900">PLAN</div>
            <div style="font-weight:900;margin-top:6px">Early Access</div>
          </div>
        </div>
        <div style="margin-top:16px">
          <button onclick="cancelSubscription()" style="background:linear-gradient(90deg,#FF6B6B,#FFD93D);color:#0f172a;padding:10px 20px;border:none;border-radius:10px;font-size:12px;cursor:pointer">Cancel subscription</button>
        </div>
      </div>
    `;
  } catch(e) {
    console.warn('loadSettings error:', e);
  }
}

function switchTab(tab){
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
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
    hire: 'Hire',
    board: 'Board',
    pulse: 'People Risk',
    settings: 'Settings'
  };

  document.getElementById('pageTitle').textContent = titleMap[tab] || 'Dashboard';

  if (tab === 'settings') {
    loadSettings();
  }
}

function showSection(section){
  if (['overview','hire','board','pulse','settings'].includes(section)) {
    switchTab(section);
    return;
  }
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

    const planNames = {
      starter: 'Starter',
      growth: 'Growth',
      scale: 'Scale',
      enterprise: 'Enterprise',
      free: 'Free Trial'
    };

    const plan = String(data?.plan || 'starter').toLowerCase();
    const status = String(data?.status || 'active');
    const planName = planNames[plan] || 'Starter';

    const planEl = document.getElementById('currentPlan');
    const statusEl = document.getElementById('planStatus');
    if (planEl) planEl.textContent = planName;
    if (statusEl) statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);

    const sidebarPlanEl = document.getElementById('sidebarPlan');
    if (sidebarPlanEl) {
      sidebarPlanEl.textContent = planName.toUpperCase();
      sidebarPlanEl.style.background =
        plan === 'growth'
          ? 'rgba(99,102,241,0.15)'
          : plan === 'scale'
          ? 'rgba(0,229,160,0.15)'
          : 'rgba(255,107,107,0.15)';
      sidebarPlanEl.style.color =
        plan === 'growth'
          ? '#6366f1'
          : plan === 'scale'
          ? '#00b894'
          : '#FF6B6B';
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
        <div style="font-size:12px;color:#0f172a;opacity:0.7;margin-top:4px">Your subscription is active. Let's get started.</div>
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

let pulseLast = null;
let pulseEmployees = [];

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

function addPulseEmployee() {
  const idx = pulseEmployees.length;
  pulseEmployees.push({});
  const list = document.getElementById('pulseEmployeeList');
  if (!list) return;

  const card = document.createElement('div');
  card.id = `pulseEmp_${idx}`;
  card.style.cssText = 'background:rgba(255,107,107,0.04);border:1px solid rgba(255,107,107,0.15);border-radius:12px;padding:16px;position:relative';
  card.innerHTML = `
    <button onclick="removePulseEmployee(${idx})" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#FF6B6B;font-size:16px;cursor:pointer;font-weight:900">✕</button>
    <div style="font-size:11px;font-weight:900;color:#FF6B6B;margin-bottom:10px;letter-spacing:0.05em">EMPLOYEE ${idx + 1}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
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
  `;
  list.appendChild(card);
}

function updatePulseEmp(input) {
  const idx = Number(input.getAttribute('data-idx'));
  const field = input.getAttribute('data-field');
  if (!Number.isFinite(idx) || !field) return;
  if (!pulseEmployees[idx]) pulseEmployees[idx] = {};
  pulseEmployees[idx][field] = input.value;
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

function getCompanyTrendSeries(maxWeeks = 8){
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
  if (!arr.length) return '<div style="color:#94a3b8;font-size:12px">No trend history yet. Run analysis weekly to build a trend.</div>';
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

function renderPulse(employees){
  const out = document.getElementById('pulseOut');
  if (!out) return;

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
  writeJsonLocalStorage('peoplera_people_risk_prev_company', { score: companyScore, at: new Date().toISOString() });

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

  writeJsonLocalStorage('peoplera_people_risk_prev_employees', nextMap);

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

  out.innerHTML = `
    <div style="display:grid;gap:12px">

      <div style="background:rgba(255,255,255,0.8);border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:14px 16px">
        <div style="font-size:10px;font-weight:900;color:#64748b;letter-spacing:0.08em;margin-bottom:8px">WEEKLY PEOPLE RISK BRIEF</div>
        <div style="font-size:13px;color:#0f172a;font-weight:800;line-height:1.5">${escapeHtml(weeklyBrief)}</div>
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

    addFeed('People Risk', `Generated weekly people risk report for ${mergedEmployees.length} employee(s).`);

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
window.clearHire = clearHire;
window.clearBoard = clearBoard;
window.clearPulse = clearPulse;
window.showSection = showSection;
window.runInterview = runInterview;
window.runROI = runROI;
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
window.closeEmployeeCard = closeEmployeeCard;

boot();