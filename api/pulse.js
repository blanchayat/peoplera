const { requireSupabaseAuth } = require('./_auth');
const { callClaudeJson } = require('./_anthropic');

function clampScore(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normalizeLevel(l){
  const v = String(l || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
  return 'critical';
}

function cleanList(arr, max){
  if (!Array.isArray(arr)) return [];
  return arr.map(x=>String(x).slice(0, 220)).filter(Boolean).slice(0, max);
}

function normalizeEmployee(e){
  return {
    name: String(e?.name || '').slice(0, 160) || 'Employee',
    burnoutScore: clampScore(e?.burnoutScore),
    riskLevel: normalizeLevel(e?.riskLevel),
    riskFactors: cleanList(e?.riskFactors, 8),
    recommendations: cleanList(e?.recommendations, 8)
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await requireSupabaseAuth(req);

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const employees = Array.isArray(body.employees) ? body.employees : [];

    if (!employees.length) {
      res.status(400).json({ error: 'employees is required' });
      return;
    }

    const safe = employees
      .map(e=>({
        name: String(e?.name || '').slice(0, 160),
        weeklyHours: Number(e?.weeklyHours || 0),
        weekendHours: Number(e?.weekendHours || 0),
        afterHoursMessages: Number(e?.afterHoursMessages || 0),
        sickDays: Number(e?.sickDays || 0),
        lastVacation: String(e?.lastVacation || '').slice(0, 60)
      }))
      .filter(e=>e.name.trim() !== '')
      .slice(0, 300);

    if (!safe.length) {
      res.status(400).json({ error: 'No valid employee rows found' });
      return;
    }

    const system = 'You are Peoplera Pulse. You are an HR analytics expert focused on burnout prevention. Provide defensible risk scoring and actionable recommendations.';

    const user = `Employee metrics (weekly snapshot):\n${JSON.stringify(safe)}\n\nInstructions:\n- Output one employee object per input employee (match by name).\n- burnoutScore must be 0-100.\n- riskLevel must be low/medium/high/critical.\n- Provide top riskFactors and concrete recommendations for HR intervention.\nReturn JSON exactly matching required schema.`;

    const out = await callClaudeJson({ system, user, schemaName: 'pulse' });

    const outEmployees = Array.isArray(out?.employees) ? out.employees.map(normalizeEmployee) : [];
    if (!outEmployees.length) {
      res.status(502).json({ error: 'AI returned no employees' });
      return;
    }

    res.status(200).json({ employees: outEmployees });
  } catch (err) {
    const status = err?.statusCode || 500;
    res.status(status).json({ error: err?.message || 'Pulse failed' });
  }
};
