module.exports = async (req, res) => {
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