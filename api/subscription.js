module.exports = async (req, res) => {
  const rawUrl = String(req.url || '');
  const url = new URL(rawUrl, 'http://localhost');
  const action = String(url.searchParams.get('action') || '').trim().toLowerCase();

  const checkout = async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

      const plan = String(body.plan || '').toLowerCase();
      const billingCycle = String(body.billingCycle || 'monthly').toLowerCase();
      const email = String(body.email || '').trim().toLowerCase();

      if (!email) {
        return res.status(400).json({ error: 'Missing email' });
      }

      const STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;
      const API_KEY = process.env.LEMONSQUEEZY_API_KEY;

      if (!STORE_ID || !API_KEY) {
        return res.status(500).json({ error: 'Missing Lemon Squeezy env vars' });
      }

      const VARIANTS = {
        starter: {
          monthly: process.env.LEMONSQUEEZY_STARTER_MONTHLY_VARIANT_ID,
          annual: process.env.LEMONSQUEEZY_STARTER_ANNUAL_VARIANT_ID
        },
        growth: {
          monthly: process.env.LEMONSQUEEZY_GROWTH_MONTHLY_VARIANT_ID,
          annual: process.env.LEMONSQUEEZY_GROWTH_ANNUAL_VARIANT_ID
        },
        scale: {
          monthly: process.env.LEMONSQUEEZY_SCALE_MONTHLY_VARIANT_ID,
          annual: process.env.LEMONSQUEEZY_SCALE_ANNUAL_VARIANT_ID
        }
      };

      if (!VARIANTS[plan]) {
        return res.status(400).json({ error: 'Invalid plan' });
      }
      if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
        return res.status(400).json({ error: 'Invalid billingCycle' });
      }

      const variantId = VARIANTS[plan][billingCycle];
      if (!variantId) {
        return res.status(500).json({ error: 'Missing variant id for selected plan' });
      }

      const origin = req.headers['x-forwarded-proto']
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `https://${req.headers.host}`;

      const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: {
                email,
                custom: {
                  email,
                  plan,
                  billingCycle
                }
              },
              product_options: {
                redirect_url: `${origin}/dashboard.html?checkout=success`
              },
              checkout_options: {
                embed: false,
                media: true,
                logo: true
              }
            },
            relationships: {
              store: {
                data: {
                  type: 'stores',
                  id: String(STORE_ID)
                }
              },
              variant: {
                data: {
                  type: 'variants',
                  id: String(variantId)
                }
              }
            }
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Lemon checkout error:', data);
        return res.status(500).json({
          error: data?.errors?.[0]?.detail || 'Checkout failed'
        });
      }

      const outUrl = data?.data?.attributes?.url;
      if (!outUrl) {
        return res.status(500).json({ error: 'Checkout URL not returned' });
      }

      return res.status(200).json({ url: outUrl });
    } catch (err) {
      console.error('Checkout error:', err);
      return res.status(500).json({ error: 'Checkout failed' });
    }
  };

  const check = async () => {
    const rateLimit = require('./_rateLimit');
    if (rateLimit(req, res, { max: 20, windowMs: 60000 })) return;

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const email = String(body.email || '').trim().toLowerCase();

      return res.status(200).json({
        subscribed: true,
        plan: 'early-access',
        created_at: null,
        status: 'active',
        startDate: null,
        email: email || null,
        pricingDisabled: true,
        message: 'Early access is currently free. Pricing is coming soon.'
      });
    } catch (err) {
      console.error('Check subscription error:', err);
      return res.status(200).json({
        subscribed: true,
        plan: 'early-access',
        created_at: null,
        status: 'active',
        startDate: null,
        pricingDisabled: true,
        message: 'Early access is currently free. Pricing is coming soon.'
      });
    }
  };

  const cancel = async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      return res.status(200).json({
        ok: true,
        cancelled: false,
        pricingDisabled: true,
        message: 'Pricing is currently disabled. There is no active paid subscription to cancel.'
      });
    } catch (err) {
      console.error('Cancel subscription error:', err);
      return res.status(500).json({ error: 'Cancel subscription unavailable' });
    }
  };

  if (action === 'checkout') return checkout();
  if (action === 'check') return check();
  if (action === 'cancel') return cancel();

  return res.status(400).json({ error: 'Missing or invalid action. Use ?action=checkout|check|cancel' });
};
