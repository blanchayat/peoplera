const { callClaudeJson } = require('./_anthropic');

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

module.exports = async (req, res) => {
  const rateLimit = require('./_rateLimit');
  if (rateLimit(req, res, { max: 10, windowMs: 60000 })) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Auth check — accept any Bearer token
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Subscriber check
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    const userEmail = user?.email?.toLowerCase();
    if (userEmail) {
      const { data: sub } = await supabaseAdmin.from('subscribers').select('status').eq('email', userEmail).eq('status', 'active').maybeSingle();
      if (!sub) {
        return res.status(403).json({ error: 'Active subscription required.' });
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
};
