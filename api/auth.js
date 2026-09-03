import crypto from 'crypto';

function getOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export default function handler(req, res) {
  const clientId = process.env.OAUTH_CLIENT_ID;

  if (!clientId) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Missing OAUTH_CLIENT_ID');
    return;
  }

  const origin = getOrigin(req);
  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = `${origin}/callback`;

  // Short-lived CSRF state cookie.
  // HttpOnly keeps it out of page JavaScript.
  res.setHeader(
    'Set-Cookie',
    `ixl_cms_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  const authorize = new URL('https://github.com/login/oauth/authorize');

  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', 'repo,user');
  authorize.searchParams.set('state', state);

  res.statusCode = 302;
  res.setHeader('Location', authorize.toString());
  res.end();
}