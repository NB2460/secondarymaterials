/**
 * lib/admin-auth — gate admin pages behind PODCAST_ADMIN_PASSWORD.
 * Password comes from the x-admin-password header or the ?_pw= query param.
 */

function adminAuth(req, res, next) {
  const pw = process.env.PODCAST_ADMIN_PASSWORD;
  if (!pw) {
    console.error('[admin-auth] PODCAST_ADMIN_PASSWORD not set');
    return res.status(500).send('Server misconfiguration: admin password not set');
  }
  const provided = req.headers['x-admin-password'] || req.query._pw || '';
  if (provided !== pw) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { adminAuth };
