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
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET,POST,OPTIONS');
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

async function handlePublicConfig(req, res){
  try {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      res.status(200).json({
        supabaseUrl: supabaseUrl || null,
        supabaseAnonKey: supabaseAnonKey || null,
        error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY'
      });
      return;
    }

    res.status(200).json({ supabaseUrl, supabaseAnonKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load public config' });
  }
}

async function handleEmail(req, res){
  if (okCors(req, res, 'POST,OPTIONS')) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    res.status(500).json({ error: 'Missing RESEND_API_KEY' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const to = body?.to;
  const subject = body?.subject;
  const html = body?.html;

  if (!to || !subject || !html) {
    res.status(400).json({ error: 'Missing to, subject, or html' });
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Peoplera <hello@peoplera.work>', to, subject, html })
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(500).json({ error: data.message || 'Email failed' });
      return;
    }
    res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Email failed' });
  }
}

module.exports = async (req, res) => {
  const action = getAction(req);

  if (action === 'email') {
    if (rateLimit(req, res, { max: 30, windowMs: 60000 })) return;
    return handleEmail(req, res);
  }

  if (action === 'public-config') {
    if (okCors(req, res, 'GET,OPTIONS')) return;
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    return handlePublicConfig(req, res);
  }

  if (okCors(req, res, 'GET,POST,OPTIONS')) return;
  res.status(400).json({ error: 'Missing or invalid action' });
};
