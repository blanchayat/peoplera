const Stripe = require('stripe');

const PRICES = {
  starter: { monthly: 49, annual: Math.round(49 * 12 * 0.8) },
  growth: { monthly: 99, annual: Math.round(99 * 12 * 0.8) },
  scale: { monthly: 199, annual: Math.round(199 * 12 * 0.8) }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (!key) {
      res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });
      return;
    }

    const stripe = new Stripe(key, { apiVersion: '2024-04-10' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const plan = String(body.plan || '').toLowerCase();
    const billingCycle = String(body.billingCycle || 'monthly').toLowerCase();

    if (!PRICES[plan]) {
      res.status(400).json({ error: 'Invalid plan' });
      return;
    }
    if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
      res.status(400).json({ error: 'Invalid billingCycle' });
      return;
    }

    const amount = PRICES[plan][billingCycle];
    const interval = billingCycle === 'monthly' ? 'month' : 'year';
    const origin = (req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://${req.headers.host}` : `https://${req.headers.host}`);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      success_url: origin + '/dashboard.html?checkout=success',
      cancel_url: origin + '/pricing.html?checkout=cancel',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Peoplera ${plan.charAt(0).toUpperCase() + plan.slice(1)}`
          },
          unit_amount: amount * 100,
          recurring: { interval }
        }
      }],
      allow_promotion_codes: true
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Checkout failed' });
  }
};
