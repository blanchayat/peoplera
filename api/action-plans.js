async function getSupabaseAdminClient(){
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const err = new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    err.statusCode = 500;
    throw err;
  }
  return createClient(url, key);
}

function okCorsFallback(req, res, methods){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = async (req, res) => {
  try{
    if (okCorsFallback(req, res, 'GET,OPTIONS')) return;

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr) throw userErr;
    const user = userData?.user;
    if (!user?.id) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    const { data: empRows, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, job_title, latest_action_plans, is_demo')
      .eq('user_id', user.id)
      .neq('is_demo', true)
      .order('created_at', { ascending: false });

    if (empErr) {
      const msg = String(empErr?.message || 'Failed to query employees');
      if (msg.includes('does not exist') && msg.includes('employees')) {
        res.status(500).json({
          error: 'Supabase table "employees" does not exist. Run the database migrations / SQL setup in Supabase.',
          details: msg
        });
        return;
      }
      if (msg.includes('latest_action_plans') && (msg.includes('does not exist') || msg.includes('column'))) {
        res.status(500).json({
          error: 'Missing column employees.latest_action_plans. Run supabase_action_plans.sql in Supabase SQL editor.',
          details: msg
        });
        return;
      }
      throw empErr;
    }

    res.status(200).json({ employees: empRows || [] });
  }catch(err){
    console.error('action-plans route error:', err);
    res.status(err?.statusCode || 500).json({
      error: err?.message || 'Failed to load action plans',
      details: String(err?.message || err || ''),
      stack: err?.stack
    });
  }
};
