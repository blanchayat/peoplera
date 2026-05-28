const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { callClaudeJson } = require('./_anthropic');

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

function getSubAction(req){
  const raw = String(req.query?.action || '').trim();
  if (raw) return raw.toLowerCase();

  const url = String(req.url || '');
  const clean = url.split('?')[0];
  const parts = clean.split('/').filter(Boolean);
  const idx = parts.findIndex(p => p === 'survey');
  const next = idx >= 0 ? parts[idx + 1] : '';
  return String(next || '').toLowerCase();
}

function getSupabaseAdmin(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const e = new Error('Supabase env not configured');
    e.statusCode = 500;
    throw e;
  }
  return createClient(url, key);
}

function safeUuid(u){
  const s = String(u || '').trim();
  if (!s) return null;
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  return ok ? s : null;
}

function parseJsonBody(req){
  if (!req) return {};
  if (typeof req.body === 'string') {
    try{ return JSON.parse(req.body); }catch{ return {}; }
  }
  return req.body || {};
}

function isoWeekNumber(d = new Date()){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

async function validateTokenOrThrow(supabase, token, { includeEmployee = false } = {}){
  const cols = includeEmployee
    ? 'id, used, used_at, expires_at, employee_id, week_number'
    : 'id, used, used_at, expires_at';

  const { data, error } = await supabase
    .from('survey_tokens')
    .select(cols)
    .eq('token', token)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const e = new Error('Invalid token');
    e.statusCode = 401;
    throw e;
  }

  const used = Boolean(data.used) || Boolean(data.used_at);
  const exp = data.expires_at ? new Date(data.expires_at) : null;
  const isExpired = !exp || Number.isNaN(exp.getTime()) ? true : (Date.now() > exp.getTime());
  if (used || isExpired) {
    const e = new Error('Expired token');
    e.statusCode = 401;
    throw e;
  }

  return data;
}

function getWeekSet(){
  const cbiOptions = ['Always', 'Often', 'Sometimes', 'Rarely', 'Never'];
  return [
    {
      type: 'choice',
      text: 'How often do you feel tired?',
      options: cbiOptions
    },
    {
      type: 'choice',
      text: 'How often are you physically exhausted?',
      options: cbiOptions
    },
    {
      type: 'choice',
      text: 'How often are you emotionally exhausted?',
      options: cbiOptions
    },
    {
      type: 'choice',
      text: 'How often do you think: "I can\'t take it anymore"?',
      options: cbiOptions
    },
    {
      type: 'choice',
      text: 'How often do you feel worn out?',
      options: cbiOptions
    }
  ];
}

async function handleQuestions(req, res){
  if (okCors(req, res, 'GET,OPTIONS')) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try{
    const token = safeUuid(req.query?.token);
    if (!token) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const supabase = getSupabaseAdmin();
    await validateTokenOrThrow(supabase, token);
    isoWeekNumber(new Date());

    const questions = getWeekSet().map(q => ({
      text: String(q.text || ''),
      options: q.type === 'choice' ? (Array.isArray(q.options) ? q.options.map(x=>String(x)) : []) : null,
      type: q.type === 'choice' ? 'choice' : 'open'
    }));

    res.status(200).json({ questions });
  }catch(err){
    const status = err?.statusCode || 401;
    res.status(status).json({ error: 'Invalid or expired token' });
  }
}

async function handleValidate(req, res){
  if (okCors(req, res, 'GET,OPTIONS')) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try{
    const token = safeUuid(req.query?.token);
    if (!token) {
      res.status(200).json({ valid: false, expired: true });
      return;
    }

    const supabase = getSupabaseAdmin();
    await validateTokenOrThrow(supabase, token);
    res.status(200).json({ valid: true, expired: false });
  }catch(err){
    res.status(200).json({ valid: false, expired: true });
  }
}

function mapAnswerTextToScore(answerText){
  const t = String(answerText || '').trim().toLowerCase();
  if (!t) return null;

  // CBI scale: Always(100) / Often(75) / Sometimes(50) / Rarely(25) / Never(0)
  const cbiMap = { always: 100, often: 75, sometimes: 50, rarely: 25, never: 0 };
  if (cbiMap[t] !== undefined) return cbiMap[t];

  // Legacy fallback for older answer formats
  const score4 = ['energized','easy','almost always','good'];
  const score3 = ['satisfied','mostly easy','light','steady','balanced'];
  const score2 = ['neutral','somewhat hard','mixed','manageable'];
  const score1 = ['drained','very hard','heavy','overwhelming'];

  const has = (arr) => arr.some(k => t === k || t.includes(k));
  if (has(score4)) return 0;
  if (has(score3)) return 25;
  if (has(score2)) return 50;
  if (has(score1)) return 75;
  return 50;
}

function computePsychScore(scoreParts){
  const vals = scoreParts.map(v => Number(v || 0));
  const avg = vals.length ? vals.reduce((a,b)=>a+b, 0) / vals.length : 0;
  return Math.round(Math.max(0, Math.min(100, avg)));
}

async function classifyWord(word){
  const w = String(word || '').trim().slice(0, 40);
  const system = 'You classify single words into psychological signals for a workplace wellbeing survey.';
  const user = `Classify this single word as a psychological signal. Return only valid JSON, no markdown:\n{ sentiment: positive|neutral|negative, energy: high|medium|low,\n  burnout_signal: none|mild|strong, suppressed_neutral: true|false }\nWord: ${JSON.stringify(w)}`;

  const out = await callClaudeJson({ system, user, schemaName: 'survey_word' });
  const sentiment = String(out?.sentiment || '').toLowerCase();
  const energy = String(out?.energy || '').toLowerCase();
  const burnout = String(out?.burnout_signal || '').toLowerCase();
  const suppressed = Boolean(out?.suppressed_neutral);

  const sentOk = ['positive','neutral','negative'].includes(sentiment) ? sentiment : 'neutral';
  const energyOk = ['high','medium','low'].includes(energy) ? energy : 'medium';
  const burnoutOk = ['none','mild','strong'].includes(burnout) ? burnout : 'none';

  return { sentiment: sentOk, energy: energyOk, burnout_signal: burnoutOk, suppressed_neutral: suppressed };
}

function scoreFromWordClassification(cls){
  const sentiment = String(cls?.sentiment || 'neutral').toLowerCase();
  const burnout = String(cls?.burnout_signal || 'none').toLowerCase();
  const suppressed = Boolean(cls?.suppressed_neutral);

  let score;
  if (sentiment === 'positive') score = 4;
  else if (sentiment === 'neutral') score = 2;
  else score = 1;

  if (burnout === 'strong') score = 1;
  if (suppressed) score = 1.5;

  return score;
}

async function handleSubmit(req, res){
  if (okCors(req, res, 'POST,OPTIONS')) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try{
    const body = parseJsonBody(req);
    const token = safeUuid(body?.token);
    const answers = Array.isArray(body?.answers) ? body.answers.map(a => String(a || '').trim()) : [];

    if (!token) {
      res.status(400).json({ error: 'token is required' });
      return;
    }
    if (answers.length !== 5) {
      res.status(400).json({ error: 'answers must be an array of 5 strings' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const tokRow = await validateTokenOrThrow(supabase, token, { includeEmployee: true });

    const scores = [];
    for (let i = 0; i < 5; i++){
      const s = mapAnswerTextToScore(answers[i]);
      if (s == null) {
        res.status(400).json({ error: 'Invalid choice answer' });
        return;
      }
      scores.push(s);
    }

    const openWord = '';
    const cls = { sentiment: 'neutral', energy: 'medium', burnout_signal: 'none', suppressed_neutral: false };

    const psych_score = computePsychScore(scores);
    const submittedAt = new Date().toISOString();
    const week_number = Number(tokRow.week_number || 0) || isoWeekNumber(new Date());

    const respPayload = {
      token_id: tokRow.id,
      week_number,
      answers,
      psych_score,
      open_word: openWord,
      open_word_sentiment: cls.sentiment,
      open_word_burnout_signal: cls.burnout_signal,
      suppressed_neutral: Boolean(cls.suppressed_neutral),
      submitted_at: submittedAt
    };

    const { error: respErr } = await supabase
      .from('survey_responses')
      .insert(respPayload);
    if (respErr) throw respErr;

    const wordPayload = {
      week_number,
      word: openWord,
      sentiment: cls.sentiment,
      burnout_signal: cls.burnout_signal,
      suppressed_neutral: Boolean(cls.suppressed_neutral),
      created_at: submittedAt
    };

    const { error: wordErr } = await supabase
      .from('survey_word_log')
      .insert(wordPayload);
    if (wordErr) throw wordErr;

    const { error: tokErr } = await supabase
      .from('survey_tokens')
      .update({ used: true, used_at: submittedAt })
      .eq('id', tokRow.id);
    if (tokErr) throw tokErr;

    res.status(200).json({ success: true });
  }catch(err){
    const status = err?.statusCode || 500;
    res.status(status).json({ error: err?.message || 'Submit failed' });
  }
}

function addHours(dt, hours){
  const d = new Date(dt);
  d.setHours(d.getHours() + hours);
  return d;
}

function ymdhms(d){
  const x = new Date(d);
  return x.toISOString();
}

function safeSendType(v){
  const s = String(v || '').toLowerCase();
  if (s === 'monday' || s === 'friday') return s;
  return 'monday';
}

function buildEmailHtml({ surveyUrl, weekNumber } = {}){
  const url = String(surveyUrl || '#');
  return `
    <div style="font-family:DM Sans,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6;color:#0f172a">
      <div style="max-width:560px;margin:0 auto;padding:18px">
        <div style="font-family:DM Serif Display,serif;font-size:22px;">Weekly check-in</div>
        <div style="margin-top:6px;color:#64748b;font-weight:700;font-size:13px">Anonymous · Week ${String(weekNumber || '')}</div>

        <div style="margin-top:16px;background:#fff;border:1px solid #E7E5E4;border-radius:18px;padding:16px">
          <div style="font-weight:900">It takes under 30 seconds.</div>
          <div style="margin-top:6px;color:#64748b;font-weight:700;font-size:13px">Your individual answers are never shared.</div>
          <a href="${url}" style="display:inline-block;margin-top:12px;background:#F97316;color:#111827;text-decoration:none;font-weight:900;padding:12px 16px;border-radius:14px">Start survey</a>
          <div style="margin-top:10px;color:#94a3b8;font-weight:700;font-size:12px">This link expires in 48 hours.</div>
        </div>
      </div>
    </div>
  `;
}

async function sendEmail({ to, subject, html }){
  const base = process.env.PUBLIC_BASE_URL || '';
  const url = base ? `${base.replace(/\/$/, '')}/api/utils?action=email` : '/api/utils?action=email';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html })
  });
  if (!res.ok) {
    let msg = `Email failed (${res.status})`;
    try{
      const j = await res.json();
      msg = j?.error || msg;
    }catch(e){ /* noop */ }
    throw new Error(msg);
  }
  return true;
}

async function handleSendEmails(req, res){
  if (okCors(req, res, 'POST,OPTIONS')) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try{
    const body = parseJsonBody(req);
    const sendType = safeSendType(body?.send_type);

    const supabase = getSupabaseAdmin();

    const { data: emps, error: empErr } = await supabase
      .from('employees')
      .select('id, email')
      .neq('email', null);
    if (empErr) throw empErr;

    const employees = Array.isArray(emps) ? emps.filter(e => e && e.id && e.email) : [];
    if (!employees.length) {
      res.status(200).json({ success: true, sent: 0 });
      return;
    }

    const weekNumber = isoWeekNumber(new Date());
    const sentAt = new Date();
    const expiresAt = addHours(sentAt, 48);

    const tokenRows = employees.map(e => ({
      employee_id: e.id,
      token: null,
      week_number: weekNumber,
      send_type: sendType,
      sent_at: ymdhms(sentAt),
      expires_at: ymdhms(expiresAt),
      used: false
    }));

    const crypto = globalThis.crypto || require('crypto').webcrypto;
    const uuidv4 = () => {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const hex = [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    };

    for (const r of tokenRows) r.token = uuidv4();

    const { data: inserted, error: insErr } = await supabase
      .from('survey_tokens')
      .insert(tokenRows)
      .select('token');
    if (insErr) throw insErr;

    const insertedRows = Array.isArray(inserted) ? inserted : [];
    const tokens = insertedRows.map(r => String(r?.token || '').trim()).filter(Boolean);

    const baseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const sent = [];

    for (let i = 0; i < employees.length; i++){
      const email = String(employees[i].email || '').trim();
      const tok = String(tokens[i] || '').trim();
      if (!email || !tok) continue;

      const surveyUrl = `${baseUrl}/survey/?token=${encodeURIComponent(tok)}`;
      const html = buildEmailHtml({ surveyUrl, weekNumber });
      const subject = 'Peoplera · Weekly check-in (anonymous)';
      await sendEmail({ to: email, subject, html });
      sent.push(email);
    }

    res.status(200).json({ success: true, sent: sent.length });
  }catch(err){
    res.status(500).json({ error: err?.message || 'send-emails failed' });
  }
}

function loadTemplate(){
  const p = path.join(process.cwd(), 'emails', 'survey-checkin.html');
  return fs.readFileSync(p, 'utf8');
}

function escapeHtml(s){
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTemplate(tpl, { firstName, token }){
  const name = String(firstName || '').trim() || 'there';
  const tok = String(token || '').trim();
  return String(tpl)
    .replace(/\{\{\s*firstName\s*\}\}/g, escapeHtml(name))
    .replace(/\{\{\s*token\s*\}\}/g, encodeURIComponent(tok));
}

async function handleSendEmailsBatch(req, res){
  if (okCors(req, res, 'POST,OPTIONS')) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try{
    const body = parseJsonBody(req);
    const tokens = Array.isArray(body?.tokens) ? body.tokens : [];
    if (!tokens.length) {
      res.status(400).json({ error: 'tokens is required' });
      return;
    }

    const template = loadTemplate();
    const supabase = getSupabaseAdmin();

    let sent = 0;
    let failed = 0;

    for (const row of tokens.slice(0, 1000)) {
      const employeeId = safeUuid(row?.employeeId);
      const tok = safeUuid(row?.token);
      const firstName = String(row?.firstName || '').trim();
      const email = String(row?.email || '').trim();

      if (!employeeId || !tok || !email) {
        failed++;
        continue;
      }

      try{
        const html = renderTemplate(template, { firstName, token: tok });
        const subject = 'Peoplera · Weekly check-in';
        await sendEmail({ to: email, subject, html });

        const nowIso = new Date().toISOString();
        const { error: upErr } = await supabase
          .from('survey_tokens')
          .update({ sent_at: nowIso })
          .eq('token', tok);
        if (upErr) throw upErr;

        sent++;
      }catch(e){
        failed++;
      }
    }

    res.status(200).json({ sent, failed });
  }catch(err){
    res.status(500).json({ error: err?.message || 'send-emails failed' });
  }
}

async function handleResults(req, res){
  if (okCors(req, res, 'GET,OPTIONS')) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try{
    const supabase = getSupabaseAdmin();
    const weekNumber = Number(req.query?.week) || isoWeekNumber(new Date());

    // Get all tokens for this week
    const { data: tokens, error: tokErr } = await supabase
      .from('survey_tokens')
      .select('id, employee_id, used, token, week_number')
      .eq('week_number', weekNumber);
    if (tokErr) throw tokErr;

    const tokenList = Array.isArray(tokens) ? tokens : [];
    const totalSent = tokenList.length;
    const responded = tokenList.filter(t => Boolean(t.used));

    // Get responses for this week
    const { data: responses, error: respErr } = await supabase
      .from('survey_responses')
      .select('token_id, psych_score, answers, open_word, open_word_sentiment, open_word_burnout_signal, submitted_at')
      .eq('week_number', weekNumber);
    if (respErr) throw respErr;

    const respList = Array.isArray(responses) ? responses : [];
    const avgScore = respList.length
      ? Math.round(respList.reduce((s, r) => s + Number(r.psych_score || 0), 0) / respList.length)
      : 0;

    // Per-question breakdown
    const questions = getWeekSet();
    const breakdown = questions.map((q, idx) => {
      const counts = {};
      for (const r of respList) {
        const ans = Array.isArray(r.answers) ? String(r.answers[idx] || '') : '';
        if (ans) counts[ans] = (counts[ans] || 0) + 1;
      }
      return { question: q.text, options: q.options || [], counts };
    });

    // Word cloud
    const words = respList.map(r => ({
      word: r.open_word,
      sentiment: r.open_word_sentiment,
      burnout_signal: r.open_word_burnout_signal
    })).filter(w => w.word);

    // Employee status
    const employeeIds = [...new Set(tokenList.map(t => t.employee_id).filter(Boolean))];
    const respondedIds = new Set(responded.map(t => t.employee_id).filter(Boolean));

    let employeeStatus = [];
    if (employeeIds.length) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, full_name')
        .in('id', employeeIds);
      employeeStatus = (emps || []).map(e => ({
        id: e.id,
        name: e.full_name || '',
        responded: respondedIds.has(e.id)
      }));
    }

    res.status(200).json({
      week: weekNumber,
      total_sent: totalSent,
      total_responded: responded.length,
      response_rate: totalSent ? Math.round((responded.length / totalSent) * 100) : 0,
      avg_psych_score: avgScore,
      breakdown,
      words,
      employee_status: employeeStatus
    });
  }catch(err){
    res.status(500).json({ error: err?.message || 'Results failed' });
  }
}

module.exports = async (req, res) => {
  const action = getSubAction(req);

  if (action === 'questions') return handleQuestions(req, res);
  if (action === 'validate') return handleValidate(req, res);
  if (action === 'submit') return handleSubmit(req, res);
  if (action === 'send-emails') return handleSendEmails(req, res);
  if (action === 'send-emails-batch') return handleSendEmailsBatch(req, res);
  if (action === 'results') return handleResults(req, res);

  if (okCors(req, res, 'GET,POST,OPTIONS')) return;
  res.status(404).json({ error: 'Not found' });
};
