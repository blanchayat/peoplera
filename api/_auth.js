const { createRemoteJWKSet, jwtVerify } = require('jose');

let jwksCache = new Map();

function getSupabaseProjectRefFromUrl(supabaseUrl) {
  try {
    const u = new URL(supabaseUrl);
    const host = u.host; // <ref>.supabase.co
    const ref = host.split('.')[0];
    return ref || null;
  } catch {
    return null;
  }
}

function getJwks(supabaseUrl) {
  const ref = getSupabaseProjectRefFromUrl(supabaseUrl);
  if (!ref) return null;
  const jwksUrl = `https://${ref}.supabase.co/auth/v1/certs`;
  if (!jwksCache.has(jwksUrl)) {
    jwksCache.set(jwksUrl, createRemoteJWKSet(new URL(jwksUrl)));
  }
  return jwksCache.get(jwksUrl);
}

async function requireSupabaseAuth(req) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  if (!supabaseUrl) {
    const e = new Error('SUPABASE_URL not configured');
    e.statusCode = 500;
    throw e;
  }

  const auth = req.headers.authorization || '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    const e = new Error('Missing Authorization header');
    e.statusCode = 401;
    throw e;
  }

  const token = auth.slice(7).trim();
  if (!token) {
    const e = new Error('Missing bearer token');
    e.statusCode = 401;
    throw e;
  }

  const jwks = getJwks(supabaseUrl);
  if (!jwks) {
    const e = new Error('Unable to resolve Supabase JWKS');
    e.statusCode = 500;
    throw e;
  }

  const audience = 'authenticated';
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience
    });
    return payload;
  } catch (err) {
    const e = new Error('Invalid or expired session');
    e.statusCode = 401;
    throw e;
  }
}

module.exports = {
  requireSupabaseAuth
};
