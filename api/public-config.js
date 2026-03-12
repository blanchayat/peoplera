module.exports = async (req, res) => {
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
};
