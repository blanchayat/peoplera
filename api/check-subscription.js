module.exports = async (req, res) => {
  const rateLimit = require('./_rateLimit');
  if (rateLimit(req, res, { max: 20, windowMs: 60000 })) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    );

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const email = String(body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(200).json({ subscribed: false });
    }

    const { data, error } = await supabase
      .from('subscribers')
      .select('email, status, plan, created_at')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(200).json({ subscribed: false });
    }

    const status = data ? data.status : null;
    const subscribed = !!data && String(status || '').toLowerCase() === 'active';

    return res.status(200).json({
  subscribed,
  plan: data ? data.plan : null,
  created_at: data ? data.created_at : null,
  status,
  startDate: data ? data.created_at : null
});
  } catch (err) {
    console.error('Check subscription error:', err);
    return res.status(200).json({ subscribed: false });
  }
};