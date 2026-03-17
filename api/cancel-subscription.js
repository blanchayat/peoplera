module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    const userEmail = user?.email?.toLowerCase();
    if (!userEmail) return res.status(401).json({ error: 'User not found' });

    await supabase.from('subscribers').update({ status: 'cancelled' }).eq('email', userEmail);

    return res.status(200).json({ ok: true });
  } catch(err) {
    return res.status(500).json({ error: err.message || 'Cancel failed' });
  }
};
