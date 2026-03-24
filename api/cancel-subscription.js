module.exports = async (req, res) => {
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