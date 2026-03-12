const { requireSupabaseAuth } = require('./_auth');
const { callClaudeJson } = require('./_anthropic');

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // allow ping used by settings page
    if (body && body.ping) {
      res.status(200).json({ ok: true });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or expired session. Please sign out and sign in again.' });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token.length < 10) {
      return res.status(401).json({ error: 'Invalid or expired session. Please sign out and sign in again.' });
    }

    await requireSupabaseAuth(req);

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

    const user = `Job description:\n${jobDescription}\n\nCandidates (filename + CV text):\n${safeCvs.map((c,i)=>`#${i+1} ${c.filename}\n${c.text}`).join('\n\n')}\n\nTask: Score each candidate 0-100 by match. Provide strengths, weaknesses, and a short recommendation. Return JSON exactly matching the required schema.`;

    const out = await callClaudeJson({ system, user, schemaName: 'hire' });

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
};
