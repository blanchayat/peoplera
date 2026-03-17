const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const signature = req.headers['x-signature'];
  
  const body = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  
  if (hmac !== signature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  console.log('WEBHOOK EVENT:', JSON.stringify(event, null, 2));
  const eventName = event.meta?.event_name;
  const email = event.data?.attributes?.user_email;
  const status = event.data?.attributes?.status;
  const productName = event.data?.attributes?.product_name || 'Starter';

  if (!email) return res.status(200).json({ ok: true });

  if (['subscription_created', 'subscription_updated', 'order_created', 'subscription_payment_success'].includes(eventName)) {
    let plan = 'starter';
    if (productName.toLowerCase().includes('growth')) plan = 'growth';
    else if (productName.toLowerCase().includes('scale')) plan = 'scale';
    else if (productName.toLowerCase().includes('enterprise')) plan = 'enterprise';

    await supabase.from('subscribers').upsert({
      email,
      plan,
      status: 'active',
      updated_at: new Date().toISOString()
    }, { onConflict: 'email' });
  }

  if (eventName === 'subscription_cancelled') {
    await supabase.from('subscribers').upsert({
      email,
      plan: 'free',
      status: 'cancelled',
      updated_at: new Date().toISOString()
    }, { onConflict: 'email' });
  }

  return res.status(200).json({ ok: true });
};
