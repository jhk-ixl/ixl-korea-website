import {
  getCookies,
  serializeCookie,
  clearCookie
} from '../lib/http/cookies.js';

import {
  safeEqual
} from '../lib/security/crypto.js';

import {
  createManagerOAuthState,
  createManagerSession,
  getAuthenticatedManager,
  verifyManagerOAuthState
} from '../lib/manager/auth.js';

import {
  exchangeGitHubCode,
  getGitHubUser
} from '../lib/oauth/github.js';

import {
  getManagerCallbackUrl
} from '../lib/manager/url.js';

function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow);
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function startManagerOAuth(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');

  const clientId = process.env.MANAGER_GITHUB_CLIENT_ID;
  const sessionSecret = process.env.MANAGER_SESSION_SECRET;

  if (!clientId || !sessionSecret) {
    console.error('Manager OAuth environment variables are missing.');
    return res.status(500).json({ error: 'Manager authentication is not configured.' });
  }

  let managerCallbackUrl;
  try {
    managerCallbackUrl = getManagerCallbackUrl(req);
  } catch (error) {
    console.error('Invalid Manager origin:', error);
    return res.status(400).json({ error: 'Invalid Manager origin.' });
  }

  const state = createManagerOAuthState(sessionSecret);

  res.setHeader(
    'Set-Cookie',
    serializeCookie('manager_oauth_state', state, {
      path: '/api',
      maxAge: 600
    })
  );

  const githubAuthorizeUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthorizeUrl.searchParams.set('client_id', clientId);
  githubAuthorizeUrl.searchParams.set('redirect_uri', managerCallbackUrl);
  githubAuthorizeUrl.searchParams.set('state', state);
  githubAuthorizeUrl.searchParams.set('scope', 'read:user');

  return res.redirect(302, githubAuthorizeUrl.toString());
}

async function handleManagerCallback(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');

  const clientId = process.env.MANAGER_GITHUB_CLIENT_ID;
  const clientSecret = process.env.MANAGER_GITHUB_CLIENT_SECRET;
  const allowedLogin = process.env.MANAGER_ALLOWED_GITHUB_LOGIN;
  const sessionSecret = process.env.MANAGER_SESSION_SECRET;

  if (!clientId || !clientSecret || !allowedLogin || !sessionSecret) {
    console.error('Manager authentication environment variables are missing.');
    return res.status(500).send('Manager authentication is not configured.');
  }

  let managerCallbackUrl;
  try {
    managerCallbackUrl = getManagerCallbackUrl(req);
  } catch (error) {
    console.error('Invalid Manager origin:', error);
    return res.status(400).send('Invalid Manager origin.');
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const returnedState = typeof req.query.state === 'string' ? req.query.state : '';

  if (!code || !returnedState) {
    return res.status(400).send('Invalid GitHub authentication response.');
  }

  const cookies = getCookies(req);
  const storedState = cookies.manager_oauth_state || '';

  if (!storedState || !safeEqual(storedState, returnedState)) {
    return res.status(403).send('Invalid or expired authentication state.');
  }

  if (!verifyManagerOAuthState(returnedState, sessionSecret)) {
    return res.status(403).send('Authentication state verification failed.');
  }

  let tokenData;
  try {
    tokenData = await exchangeGitHubCode({
      clientId,
      clientSecret,
      code,
      redirectUri: managerCallbackUrl,
      userAgent: 'IXL-Korea-Manager'
    });
  } catch (error) {
    console.error('GitHub token request failed:', error);
    return res.status(error?.statusCode || 502).send(error?.message || 'GitHub authentication failed.');
  }

  let githubUser;
  try {
    githubUser = await getGitHubUser({
      accessToken: tokenData.access_token,
      userAgent: 'IXL-Korea-Manager'
    });
  } catch (error) {
    console.error('GitHub user request failed:', error);
    return res.status(error?.statusCode || 502).send(error?.message || 'Could not verify GitHub user.');
  }

  const githubLogin = String(githubUser.login || '');
  if (githubLogin.toLowerCase() !== String(allowedLogin).toLowerCase()) {
    console.warn('Unauthorized Manager login attempt:', githubLogin);
    return res.status(403).send('This GitHub account is not authorized to use IXL Korea Manager.');
  }

  const session = createManagerSession(githubLogin, sessionSecret);

  res.setHeader('Set-Cookie', [
    serializeCookie('manager_session', session, {
      path: '/',
      maxAge: 28800
    }),
    clearCookie('manager_oauth_state', {
      path: '/api'
    })
  ]);
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  return res.redirect(302, '/manager/');
}

async function handleManagerSession(req, res) {
  if (req.method === 'GET') {
    const manager = getAuthenticatedManager(req);
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (manager.reason === 'not_configured') {
      console.error('Manager authentication environment variables are missing.');
      return res.status(500).json({
        authenticated: false,
        error: 'Manager authentication is not configured.'
      });
    }

    if (!manager.authenticated) {
      return res.status(401).json({ authenticated: false });
    }

    return res.status(200).json({
      authenticated: true,
      login: manager.login
    });
  }

  if (req.method === 'POST') {
    res.setHeader(
      'Set-Cookie',
      clearCookie('manager_session', {
        path: '/'
      })
    );
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ success: true });
  }

  return methodNotAllowed(res, 'GET, POST');
}

export default async function handler(req, res) {
  const action = String(req.query?.action || 'auth').toLowerCase();

  if (action === 'callback') return handleManagerCallback(req, res);
  if (action === 'session') return handleManagerSession(req, res);
  if (action === 'auth') return startManagerOAuth(req, res);

  return res.status(400).json({ error: 'Invalid Manager authentication action.' });
}
