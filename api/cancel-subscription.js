module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    );

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return res.status(401).json({ error: 'Missing auth token' });
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(token);

    if (userError || !user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const email = String(user.email).trim().toLowerCase();

    const { data: subRow, error: subError } = await supabase
      .from('subscribers')
      .select('email, lemonsqueezy_subscription_id')
      .eq('email', email)
      .maybeSingle();

    if (subError) {
      console.error('Subscriber lookup error:', subError);
      return res.status(500).json({ error: 'Failed to load subscriber record' });
    }

    const subscriptionId = subRow?.lemonsqueezy_subscription_id;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'No Lemon Squeezy subscription id found for this user' });
    }

    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing LEMONSQUEEZY_API_KEY' });
    }

    const cancelRes = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
      },
      body: JSON.stringify({
        data: {
          type: 'subscriptions',
          id: String(subscriptionId),
          attributes: {
            cancelled: true
          }
        }
      })
    });

    const cancelData = await cancelRes.json().catch(() => null);

    if (!cancelRes.ok) {
      console.error('Lemon cancel error:', cancelData);
      return res.status(cancelRes.status).json({
        error: cancelData?.errors?.[0]?.detail || 'Lemon Squeezy cancellation failed'
      });
    }

    await supabase
      .from('subscribers')
      .update({ status: 'cancelled', plan: 'free' })
      .eq('email', email);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return res.status(500).json({ error: 'Cancel subscription failed' });
  }
};