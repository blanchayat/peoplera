const { callClaudeJson } = require('./_anthropic');
const Anthropic = require('@anthropic-ai/sdk');

const rateMap = new Map();
function rateLimit(req, res, { max = 10, windowMs = 60000 } = {}){
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const key = `${ip}:${req.url}`;
  const now = Date.now();

  if (!rateMap.has(key)) {
    rateMap.set(key, { count: 1, start: now });
    return false;
  }

  const entry = rateMap.get(key);
  if (now - entry.start > windowMs) {
    rateMap.set(key, { count: 1, start: now });
    return false;
  }

  entry.count++;
  if (entry.count > max) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return true;
  }

  return false;
}

function okCors(req, res, methods){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods || 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

function getAction(req){
  return String(req.query?.action || '').trim().toLowerCase();
}

function cleanList(arr, maxItems){
  if (!Array.isArray(arr)) return [];
  return arr.map(x=>String(x).slice(0, 220)).filter(Boolean).slice(0, maxItems);
}

function normalizePlan(p){
  return {
    day30: cleanList(p?.day30, 18),
    day60: cleanList(p?.day60, 18),
    day90: cleanList(p?.day90, 18),
    resources: cleanList(p?.resources, 12),
    firstWeekChecklist: cleanList(p?.firstWeekChecklist, 18)
  };
}

function clampScore(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normalizeCandidate(c){
  return {
    name: String(c?.name || '').slice(0, 160) || 'Candidate',
    matchScore: clampScore(c?.matchScore),
    recommendation: String(c?.recommendation || '').slice(0, 600),
    strengths: Array.isArray(c?.strengths) ? c.strengths.map(s=>String(s).slice(0, 200)).slice(0, 10) : [],
    weaknesses: Array.isArray(c?.weaknesses) ? c.weaknesses.map(s=>String(s).slice(0, 200)).slice(0, 10) : []
  };
}

async function handleBoard(req, res){
  if (rateLimit(req, res, { max: 10, windowMs: 60000 })) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    const userEmail = user?.email?.toLowerCase();
    if (userEmail) {
      const { data: sub } = await supabaseAdmin.from('subscribers').select('status').eq('email', userEmail).eq('status', 'active').maybeSingle();
      if (!sub) {
        res.status(403).json({ error: 'Active subscription required.' });
        return;
      }
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const emp = body.employee || {};
    const employee = {
      name: String(emp.name || '').trim(),
      role: String(emp.role || '').trim(),
      department: String(emp.department || '').trim(),
      startDate: String(emp.startDate || '').trim()
    };
    const handbookText = String(body.handbookText || '').trim();

    if (!employee.name || !employee.role || !employee.department || !employee.startDate) {
      res.status(400).json({ error: 'employee fields are required (name, role, department, startDate)' });
      return;
    }
    if (handbookText.length < 200) {
      res.status(400).json({ error: 'handbookText must be at least 200 characters' });
      return;
    }

    const system = 'You are Peoplera Board. You are an expert onboarding and enablement lead. Produce specific, measurable tasks. Avoid fluff.';

    const userPrompt = `Employee:\nName: ${employee.name}\nRole: ${employee.role}\nDepartment: ${employee.department}\nStart date: ${employee.startDate}\n\nCompany handbook/docs excerpt:\n${handbookText.slice(0, 20000)}\n\nTask: Generate a personalized checklist onboarding plan. Return JSON exactly matching required schema.`;

    const out = await callClaudeJson({ system, user: userPrompt, schemaName: 'board' });

    const plan = normalizePlan(out?.onboardingPlan || null);
    if (!plan.firstWeekChecklist.length && !plan.day30.length) {
      res.status(502).json({ error: 'AI returned an empty onboarding plan' });
      return;
    }

    res.status(200).json({ onboardingPlan: plan });
  } catch (err) {
    const status = err?.statusCode || 500;
    res.status(status).json({ error: err?.message || 'Board failed' });
  }
}

async function handleHire(req, res){
  if (rateLimit(req, res, { max: 10, windowMs: 60000 })) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (body && body.ping) {
      res.status(200).json({ ok: true });
      return;
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    const userEmail = user?.email?.toLowerCase();
    if (userEmail) {
      const { data: sub } = await supabaseAdmin.from('subscribers').select('status').eq('email', userEmail).eq('status', 'active').maybeSingle();
      if (!sub) {
        res.status(403).json({ error: 'Active subscription required.' });
        return;
      }
    }

    const jobDescription = String(body.jobDescription || '').trim();
    const cvs = Array.isArray(body.cvs) ? body.cvs : [];

    if (!jobDescription) {
      res.status(400).json({ error: 'jobDescription is required' });
      return;
    }
    if (!cvs.length) {
      res.status(400).json({ error: 'At least one CV is required' });
      return;
    }

    const safeCvs = cvs
      .map(c=>({
        filename: String(c?.filename || '').slice(0, 160),
        text: String(c?.text || '').slice(0, 18000)
      }))
      .filter(c=>c.text.trim().length >= 50)
      .slice(0, 12);

    if (!safeCvs.length) {
      res.status(400).json({ error: 'CV text could not be extracted (need at least 50 characters per CV)' });
      return;
    }

    const system = 'You are Peoplera Hire. You are an enterprise HR analyst. You must be fair, rigorous, and avoid bias. Focus on skills and evidence in the CV text.';

    const userPrompt = `Job description:\n${jobDescription}\n\nCandidates (filename + CV text):\n${safeCvs.map((c,i)=>`#${i+1} ${c.filename}\n${c.text}`).join('\n\n')}\n\nTask: Score each candidate 0-100 by match. Provide strengths, weaknesses, and a short recommendation. Return JSON exactly matching the required schema.`;

    const out = await callClaudeJson({ system, user: userPrompt, schemaName: 'hire' });

    const candidates = Array.isArray(out?.candidates) ? out.candidates.map(normalizeCandidate) : [];
    if (!candidates.length) {
      res.status(502).json({ error: 'AI returned no candidates' });
      return;
    }

    res.status(200).json({ candidates });
  } catch (err) {
    const status = err?.statusCode || 500;
    res.status(status).json({ error: err?.message || 'Hire failed' });
  }
}

async function handleInterview(req, res){
  if (okCors(req, res, 'POST,OPTIONS')) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const candidate = body?.candidate;
  const jobDescription = body?.jobDescription;

  if (!candidate || !jobDescription) {
    res.status(400).json({ error: 'Missing candidate or jobDescription' });
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are an expert HR interviewer. Based on this candidate profile and job description, generate 8 targeted interview questions.\n\nCandidate: ${JSON.stringify(candidate)}\nJob Description: ${jobDescription}\n\nFocus on:\n- Probing their weaknesses directly but professionally\n- Verifying their claimed strengths with evidence questions\n- Culture fit and values alignment\n- Role-specific technical or behavioral scenarios\n\nRespond ONLY with valid JSON:\n{\n  "questions": [\n    { "category": "Behavioral|Technical|Culture|Situational", "question": "...", "probes": "what to listen for" }\n  ]\n}`
      }]
    });

    const text = message.content.map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Interview failed' });
  }
}

module.exports = async (req, res) => {
  const action = getAction(req);

  if (action === 'board') return handleBoard(req, res);
  if (action === 'hire') return handleHire(req, res);
  if (action === 'interview') return handleInterview(req, res);

  if (okCors(req, res, 'POST,OPTIONS')) return;
  res.status(400).json({ error: 'Missing or invalid action' });
};
