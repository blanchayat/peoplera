const rateMap = new Map();

module.exports = function rateLimit(req, res, { max = 10, windowMs = 60000 } = {}) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const key = `${ip}:${req.url}`;
  const now = Date.now();

  if (!rateMap.has(key)) {
    rateMap.set(key, { count: 1, start: now });
    return false; // not limited
  }

  const entry = rateMap.get(key);
  if (now - entry.start > windowMs) {
    rateMap.set(key, { count: 1, start: now });
    return false;
  }

  entry.count++;
  if (entry.count > max) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return true; // is limited
  }

  return false;
};
