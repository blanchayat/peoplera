const { callClaudeJson } = require('./_anthropic');

function clampInt(n, min, max){
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function safeText(s, max = 220){
  return String(s || '').slice(0, max);
}

function parseIsoDate(d){
  const t = Date.parse(String(d || ''));
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

function diffWeeks(a, b){
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function avg(arr){
  const xs = Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
  if (!xs.length) return 0;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function trendFrom4Weeks(last4){
  const xs = Array.isArray(last4) ? last4.map(Number).filter(Number.isFinite) : [];
  if (xs.length < 4) return 'stable';
  const prev2 = (xs[0] + xs[1]) / 2;
  const last2 = (xs[2] + xs[3]) / 2;
  const delta = last2 - prev2;
  if (delta >= 2) return 'increasing';
  if (delta <= -2) return 'decreasing';
  return 'stable';
}

function computeConsecutiveHighWeeks(weeksDesc){
  const rows = Array.isArray(weeksDesc) ? weeksDesc : [];
  let count = 0;
  for (const r of rows) {
    const wh = Number(r.weekly_hours || 0);
    if (wh > 50) count++;
    else break;
  }
  return count;
}

function deriveEmployeeType(profile, { weekendHoursThisWeek = 0, previousBurnoutScore = null } = {}){
  const p = profile || {};
  const avgH = Number(p.avg_weekly_hours_last4 || 0);
  const sick12 = Number(p.sick_days_last12w || 0);
  const weeksSinceVac = Number(p.weeks_since_last_vacation || 0);
  const afterAvg = Number(p.afterhours_messages_avg || 0);
  const consecutiveHigh = Number(p.consecutive_high_weeks || 0);
  const hoursTrend = String(p.hours_trend || 'stable');

  if (avgH > 55 && sick12 === 0 && weeksSinceVac > 16) return 'silent_overachiever';
  if (avgH <= 50 && Number(weekendHoursThisWeek || 0) > 3 && afterAvg > 10) return 'boundary_eroder';
  if (hoursTrend === 'increasing' && consecutiveHigh >= 3) return 'slow_burn';
  if (avgH < 35 && afterAvg < 2) return 'disengaged';
  if (hoursTrend === 'decreasing' && Number(previousBurnoutScore || 0) > 60) return 'recovering';
  return 'balanced';
}

function employeeTypeDescription(type){
  const t = String(type || '').toLowerCase();
  if (t === 'silent_overachiever') return 'High sustained hours with no sick days and long time since vacation — risk may be hidden until it breaks.';
  if (t === 'boundary_eroder') return 'Workload may look normal, but boundaries are eroding via weekend work and after-hours messaging.';
  if (t === 'slow_burn') return 'Burnout is building gradually through an increasing workload and repeated high-load weeks.';
  if (t === 'disengaged') return 'Low workload and low engagement signals — could indicate disengagement, underutilization, or withdrawal.';
  if (t === 'recovering') return 'Load is decreasing after a high-burnout period — maintain recovery and prevent relapse.';
  return 'No dominant pattern detected — maintain balance and monitor for changes.';
}

function normalizePlanJson(out){
  const normalizeActions = (xs) => {
    if (!Array.isArray(xs)) return [];
    return xs
      .map(a => ({
        text: safeText(a?.text, 240),
        impacted_employees: Array.isArray(a?.impacted_employees) ? a.impacted_employees.map(x => safeText(x, 120)).filter(Boolean).slice(0, 12) : []
      }))
      .filter(a => a.text);
  };

  const normSection = (s) => ({
    plan_title: safeText(s?.plan_title, 160),
    plan_description: safeText(s?.plan_description, 520),
    projected_impact: safeText(s?.projected_impact, 240),
    actions: normalizeActions(s?.actions)
  });

  return {
    priority_alert: safeText(out?.priority_alert, 240),
    this_week: normSection(out?.this_week || {}),
    next_2_weeks: normSection(out?.next_2_weeks || {})
  };
}

async function getSupabaseAdminClient(){
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const e = new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    e.statusCode = 500;
    throw e;
  }
  return createClient(url, key);
}

function requireCronSecret(req){
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  const got = String(req.headers['x-cron-secret'] || '');
  return got === required;
}

function computeBurnoutScoreFromSignalsServer({ weeklyHours, weekendHours, afterHoursMessages, sickDays } = {}){
  const wh = Math.max(0, Number(weeklyHours || 0));
  const we = Math.max(0, Number(weekendHours || 0));
  const msg = Math.max(0, Number(afterHoursMessages || 0));
  const sick = Math.max(0, Number(sickDays || 0));

  const hoursScore = Math.min(wh / 60, 1) * 40;
  const weekendScore = Math.min(we / 20, 1) * 20;
  const messagesScore = Math.min(msg / 50, 1) * 20;
  const sickScore = Math.min(sick / 5, 1) * 20;
  return Math.min(100, Math.round(hoursScore + weekendScore + messagesScore + sickScore));
}

function normalizeRiskLevelFromScore(score){
  const s = clampInt(score, 0, 100);
  if (s >= 75) return 'HIGH';
  if (s >= 50) return 'MEDIUM';
  return 'LOW';
}

async function computeProfileForEmployee(supabaseAdmin, employeeId){
  const { data: emp, error: empErr } = await supabaseAdmin
    .from('employees')
    .select('id, full_name, job_title, last_vacation')
    .eq('id', employeeId)
    .maybeSingle();
  if (empErr) throw empErr;
  if (!emp) {
    const e = new Error('Employee not found');
    e.statusCode = 404;
    throw e;
  }

  const { data: metrics, error: mErr } = await supabaseAdmin
    .from('weekly_metrics')
    .select('week_start, weekly_hours, weekend_hours, after_hours_messages, sick_days')
    .eq('employee_id', employeeId)
    .order('week_start', { ascending: false })
    .limit(12);
  if (mErr) throw mErr;

  const rows = Array.isArray(metrics) ? metrics : [];
  const last4 = rows.slice(0, 4).reverse();
  const last4Hours = last4.map(r => Number(r.weekly_hours || 0));
  const last4After = last4.map(r => Number(r.after_hours_messages || 0));

  const hours_trend = trendFrom4Weeks(last4Hours);
  const weekendLast4 = last4.map(r => Number(r.weekend_hours || 0));
  const weekend_work_trend = trendFrom4Weeks(weekendLast4);
  const afterhours_messages_avg = avg(last4After);
  const sick_days_last12w = rows.reduce((s, r) => s + Number(r.sick_days || 0), 0);

  const now = new Date();
  const lastVac = parseIsoDate(emp.last_vacation);
  const weeks_since_last_vacation = lastVac ? Math.max(0, diffWeeks(now, lastVac)) : null;

  const consecutive_high_weeks = computeConsecutiveHighWeeks(rows);

  const profile = {
    avg_weekly_hours_last4: avg(last4Hours),
    hours_trend,
    sick_days_last12w,
    weeks_since_last_vacation,
    weekend_work_trend,
    afterhours_messages_avg,
    consecutive_high_weeks
  };

  const weekendHoursThisWeek = rows[0] ? Number(rows[0].weekend_hours || 0) : 0;
  const previousRow = rows[1] || null;
  const previousBurnoutScore = previousRow ? computeBurnoutScoreFromSignalsServer({
    weeklyHours: Number(previousRow.weekly_hours || 0),
    weekendHours: Number(previousRow.weekend_hours || 0),
    afterHoursMessages: Number(previousRow.after_hours_messages || 0),
    sickDays: Number(previousRow.sick_days || 0)
  }) : null;

  const employee_type = deriveEmployeeType(profile, { weekendHoursThisWeek, previousBurnoutScore });

  return { employee: emp, metricsRows: rows, profile, employee_type, weekendHoursThisWeek };
}

async function generatePlansForEmployee(supabaseAdmin, employeeId){
  const computed = await computeProfileForEmployee(supabaseAdmin, employeeId);
  const { employee, metricsRows, profile, employee_type, weekendHoursThisWeek } = computed;

  const latest = metricsRows[0] || null;
  if (!latest) {
    const e = new Error('No weekly metrics found for employee');
    e.statusCode = 400;
    throw e;
  }

  const score = computeBurnoutScoreFromSignalsServer({
    weeklyHours: Number(latest.weekly_hours || 0),
    weekendHours: Number(latest.weekend_hours || 0),
    afterHoursMessages: Number(latest.after_hours_messages || 0),
    sickDays: Number(latest.sick_days || 0)
  });
  const risk = normalizeRiskLevelFromScore(score);

  const last4 = metricsRows.slice(0, 4).reverse();
  const last4Hours = last4.map(r => clampInt(r.weekly_hours || 0, 0, 120));
  const padHours = (arr) => {
    const xs = Array.isArray(arr) ? arr.slice(-4) : [];
    while (xs.length < 4) xs.unshift(xs[0] ?? 0);
    return xs;
  };
  const weeklyHoursLast4 = padHours(last4Hours);

  const system = "You are an occupational psychologist advisor integrated into an HR platform. You generate manager action plans based on employee burnout signals.\n\nUse the Job Demands-Resources (JD-R) model framework.\nPlans must be specific, non-generic, and actionable by a manager within 1-2 weeks. Never suggest generic advice like 'have a 1:1' or 'reduce workload' without specific context.\n\nAlways output exactly this JSON structure:\n{\n  priority_alert: string (one sentence, specific to this person),\n  this_week: {\n    plan_title: string,\n    plan_description: string,\n    projected_impact: string,\n    actions: [{ text: string, impacted_employees: [string] }]\n  },\n  next_2_weeks: {\n    plan_title: string,\n    plan_description: string,\n    projected_impact: string,\n    actions: [{ text: string, impacted_employees: [string] }]\n  }\n}";

  const userPrompt = `Generate action plans for this employee:\n\nName: ${safeText(employee.full_name, 160)}\nRole: ${safeText(employee.job_title, 120)}\nEmployee type: ${employee_type}\nBurnout score: ${score}/100\nRisk level: ${risk}\n\nWeekly hours (last 4 weeks): [${weeklyHoursLast4.join(', ')}]\nHours trend: ${profile.hours_trend}\nWeekend hours this week: ${clampInt(weekendHoursThisWeek, 0, 80)}\nAfter-hours messages this week: ${clampInt(latest.after_hours_messages || 0, 0, 999)}\nSick days last 12 weeks: ${clampInt(profile.sick_days_last12w || 0, 0, 999)}\nWeeks since last vacation: ${profile.weeks_since_last_vacation == null ? 'unknown' : clampInt(profile.weeks_since_last_vacation, 0, 999)}\nConsecutive high-load weeks: ${clampInt(profile.consecutive_high_weeks || 0, 0, 52)}\n\nKey insight: ${employeeTypeDescription(employee_type)}\n\nGenerate two distinct plans targeting different root causes.\nThis week plan should address the most urgent signal.\nNext 2 weeks plan should address the underlying structural cause.\nBe specific to this person's exact numbers and pattern.`;

  const out = await callClaudeJson({ system, user: userPrompt, schemaName: 'action_plans' });
  const plans = normalizePlanJson(out);

  const latest_action_plans = {
    generated_at: new Date().toISOString(),
    week_start: latest.week_start,
    burnout_score: score,
    risk_level: risk,
    employee: {
      id: employee.id,
      name: safeText(employee.full_name, 160),
      role: safeText(employee.job_title, 120)
    },
    behavior_profile: profile,
    employee_type,
    priority_alert: plans.priority_alert,
    this_week: plans.this_week,
    next_2_weeks: plans.next_2_weeks
  };

  const { error: upErr } = await supabaseAdmin
    .from('employees')
    .update({ behavior_profile: profile, employee_type, latest_action_plans })
    .eq('id', employeeId);
  if (upErr) throw upErr;

  return { employee_id: employeeId, latest_action_plans };
}

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
    recommendations: cleanList(e?.recommendations, 8),
    benchmark: String(e?.benchmark || '').slice(0, 220)
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Cron-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  const action = String(req.query?.action || '').trim().toLowerCase();

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (action === 'generate_for_employee') {
      console.log('generate_for_employee called with body:', JSON.stringify(req.body));
      console.log('ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);
      console.log('SUPABASE_URL present:', !!process.env.SUPABASE_URL);
      try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });
        const employee_id = String(body.employee_id || body.employeeId || body.id || '').trim();
        if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });

        if (employee_id && String(employee_id).startsWith('demo-')) {
          const emp = String(employee_id);

          if (emp === 'demo-sara') {
            return res.status(200).json({
              priority_alert: 'Priority Action This Week: Sara Lee (Score: 92) — Reduce extreme workload and weekend work immediately.',
              this_week: {
                plan_title: 'Workload Emergency Rebalance',
                plan_description: 'Rapidly reduce sustained overload by pausing non-critical work and adding coverage.',
                projected_impact: 'Risk projected to decrease by ~22 points next week.',
                actions: [
                  { text: 'Freeze non-critical operational projects and delegate urgent tasks to a backup owner.', impacted_employees: ['Sara Lee'] },
                  { text: 'Remove weekend coverage from Sara for the next 2 weeks; rotate on-call/coverage across the team.', impacted_employees: ['Sara Lee'] },
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
            });
          }

          if (emp === 'demo-alex') {
            return res.status(200).json({
              priority_alert: 'Priority Action This Week: Alex Kim (Score: 88) — Reduce overtime immediately. Currently at 72h this week.',
              this_week: {
                plan_title: 'Overtime Reduction Plan',
                plan_description: 'Cut overtime for hotspots by removing low-priority work and redistributing load.',
                projected_impact: 'Risk projected to decrease by ~19 points next week.',
                actions: [
                  { text: 'Reduce overtime immediately: pause non-critical work and cap weekly hours.', impacted_employees: ['Alex Kim', 'Omar Hassan', 'Maya Chen'] },
                  { text: 'Reassign 10-20% of tasks away from the overtime cohort to lower-risk capacity.', impacted_employees: ['Alex Kim', 'Omar Hassan', 'Maya Chen'] },
                  { text: 'Add coverage owners for critical work so overtime does not concentrate on one person.', impacted_employees: ['Alex Kim', 'Omar Hassan', 'Maya Chen'] }
                ]
              },
              next_2_weeks: {
                plan_title: 'After-hours Boundary Plan',
                plan_description: 'Reduce after-hours communication and improve recovery time by setting team norms.',
                projected_impact: 'Risk projected to decrease by ~19 points next week.',
                actions: [
                  { text: 'Define quiet hours and discourage non-urgent messaging outside work hours.', impacted_employees: ['Alex Kim'] },
                  { text: 'Batch notifications and introduce async status updates to avoid constant pings.', impacted_employees: ['Alex Kim'] }
                ]
              }
            });
          }

          if (emp === 'demo-maya') {
            return res.status(200).json({
              priority_alert: 'Priority Action This Week: Maya Chen (Score: 84) — Reduce overload and restore recovery time.',
              this_week: {
                plan_title: 'Weekend Work Boundary Plan',
                actions: [
                  { text: 'Block weekends in calendar and communicate no-response policy to team.', impacted_employees: ['Maya Chen'] },
                  { text: 'Audit recurring weekend tasks and reassign to weekday schedule.', impacted_employees: ['Maya Chen'] }
                ]
              },
              next_2_weeks: {
                plan_title: 'After-hours Communication Reduction',
                actions: [
                  { text: 'Set auto-responder for after-hours messages.', impacted_employees: ['Maya Chen'] },
                  { text: 'Introduce async-first communication norms for the team.', impacted_employees: ['Maya Chen'] }
                ]
              }
            });
          }

          if (emp === 'demo-omar') {
            return res.status(200).json({
              priority_alert: 'Priority Action This Week: Omar Hassan (Score: 77) — Reduce workload and protect focus time.',
              this_week: {
                plan_title: 'Workload Rebalance Plan',
                actions: [
                  { text: 'De-scope non-critical design requests and move lower-priority work out of this sprint.', impacted_employees: ['Omar Hassan'] },
                  { text: 'Add protected focus blocks and route urgent requests through a single triage channel.', impacted_employees: ['Omar Hassan'] }
                ]
              },
              next_2_weeks: {
                plan_title: 'Recovery & Boundary Plan',
                actions: [
                  { text: 'Reduce after-hours messaging by setting response-time expectations and quiet hours.', impacted_employees: ['Omar Hassan'] },
                  { text: 'Encourage a short recovery break and plan next vacation scheduling.', impacted_employees: ['Omar Hassan'] }
                ]
              }
            });
          }

          return res.status(200).json({
            priority_alert: 'Demo employee detected. No Claude call was performed.',
            this_week: { plan_title: 'Demo Plan', actions: [] },
            next_2_weeks: { plan_title: 'Demo Plan', actions: [] }
          });
        }

        const supabaseAdmin = await getSupabaseAdminClient();
        const out = await generatePlansForEmployee(supabaseAdmin, employee_id);
        return res.status(200).json(out);
      } catch (err) {
        console.error('generate_for_employee error:', err);
        return res.status(500).json({ error: err.message, stack: err.stack });
      }
    }

    if (action === 'refresh_weekly') {
      if (!requireCronSecret(req)) return res.status(401).json({ error: 'Invalid cron secret' });
      const supabaseAdmin = await getSupabaseAdminClient();

      const { data: latestRow, error: latestErr } = await supabaseAdmin
        .from('weekly_metrics')
        .select('week_start')
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestErr) throw latestErr;
      const latestWeek = latestRow?.week_start || null;
      if (!latestWeek) return res.status(200).json({ refreshed: 0, latestWeek: null });

      const { data: empRows, error: empErr } = await supabaseAdmin
        .from('weekly_metrics')
        .select('employee_id')
        .eq('week_start', latestWeek);
      if (empErr) throw empErr;

      const ids = Array.from(new Set((empRows || []).map(r => String(r.employee_id || '')).filter(Boolean)));
      let refreshed = 0;
      const results = [];
      for (const id of ids) {
        try {
          await generatePlansForEmployee(supabaseAdmin, id);
          results.push({ employee_id: id, ok: true });
          refreshed++;
        } catch (e) {
          results.push({ employee_id: id, ok: false, error: String(e?.message || 'Failed') });
        }
      }

      return res.status(200).json({ refreshed, latestWeek, results });
    }

    if (action === 'record_action_taken') {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });
      const employee_id = String(body.employee_id || '').trim();
      const action_text = safeText(body.action_text, 520).trim();
      const burnout_score_at_time = clampInt(body.burnout_score_at_time, 0, 100);
      if (!employee_id || !action_text) return res.status(400).json({ error: 'employee_id and action_text are required' });

      const supabaseAdmin = await getSupabaseAdminClient();
      const { error } = await supabaseAdmin
        .from('action_plan_events')
        .insert({ employee_id, action_text, burnout_score_at_time, taken_at: new Date().toISOString() });
      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    // AI Insights: Claude generates specific insights from employee data
    if (action === 'ai_insights') {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });

      const employeeData = Array.isArray(body.employees) ? body.employees : [];
      if (!employeeData.length) return res.status(400).json({ error: 'employees data required' });

      const system = 'You are Peoplera AI Insights — an HR burnout analytics expert. Analyze the employee data and return specific, actionable insights with real employee names and exact numbers. Be concrete and prescriptive.';
      const userPrompt = `Employee burnout data:\n${JSON.stringify(employeeData)}\n\nReturn a JSON object with:\n- "insights": array of 4-5 objects, each with: "type" (CRITICAL/WARNING/TREND/POSITIVE), "color" (hex), "icon" (single char: ! or arrow), "title" (specific with names and numbers), "detail" (2-3 sentences with concrete recommendations)\n- "recommendations": array of 5 strings — specific actionable steps naming employees\n\nRules:\n- Always name specific employees with their exact numbers\n- CRITICAL = score >=75, WARNING = concerning patterns, TREND = week-over-week changes, POSITIVE = improvements\n- Be prescriptive: "Cap Sara Lee at 50h this week" not "Consider reducing workload"`;

      try {
        const out = await callClaudeJson({ system, user: userPrompt, schemaName: 'ai_insights' });
        return res.status(200).json(out || { insights: [], recommendations: [] });
      } catch (aiErr) {
        return res.status(502).json({ error: aiErr?.message || 'AI generation failed' });
      }
    }

    // Default: existing Pulse behavior (unchanged)
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

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

    const system = 'You are Peoplera Pulse. You are an HR analytics expert focused on burnout prevention. Provide defensible risk scoring and actionable recommendations. Also include a "benchmark" field for each employee: compare their burnoutScore to industry average of 35. State if they are above or below average and by how much.';

    const userPrompt = `Employee metrics (weekly snapshot):\n${JSON.stringify(safe)}\n\nInstructions:\n- Output one employee object per input employee (match by name).\n- burnoutScore must be 0-100.\n- riskLevel must be low/medium/high/critical.\n- Provide top riskFactors and concrete recommendations for HR intervention.\nReturn JSON exactly matching required schema.`;

    const out = await callClaudeJson({ system, user: userPrompt, schemaName: 'pulse' });

    const outEmployees = Array.isArray(out?.employees) ? out.employees.map(normalizeEmployee) : [];
    if (!outEmployees.length) {
      res.status(502).json({ error: 'AI returned no employees' });
      return;
    }

    res.status(200).json({ employees: outEmployees });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
};
