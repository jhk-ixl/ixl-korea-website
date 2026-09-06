import {
  getCookies,
  serializeCookie,
  clearCookie
} from '../lib/http/cookies.js';

import {
  safeEqual
} from '../lib/security/crypto.js';

import {
  createManagerSession,
  verifyManagerOAuthState
} from '../lib/manager/auth.js';

import {
  exchangeGitHubCode,
  getGitHubUser
} from '../lib/oauth/github.js';

import {
  getManagerCallbackUrl
} from '../lib/manager/url.js';

export default async function handler(
  req,
  res
) {
  if (req.method !== 'GET') {
    res.setHeader(
      'Allow',
      'GET'
    );

    return res
      .status(405)
      .json({
        error:
          'Method not allowed.'
      });
  }

  const clientId =
    process.env
      .MANAGER_GITHUB_CLIENT_ID;

  const clientSecret =
    process.env
      .MANAGER_GITHUB_CLIENT_SECRET;

  const allowedLogin =
    process.env
      .MANAGER_ALLOWED_GITHUB_LOGIN;

  const sessionSecret =
    process.env
      .MANAGER_SESSION_SECRET;

  if (
    !clientId ||
    !clientSecret ||
    !allowedLogin ||
    !sessionSecret
  ) {
    console.error(
      'Manager authentication environment variables are missing.'
    );

    return res
      .status(500)
      .send(
        'Manager authentication is not configured.'
      );
  }

  let managerCallbackUrl;

  try {
    managerCallbackUrl =
      getManagerCallbackUrl(req);
  } catch (error) {
    console.error(
      'Invalid Manager origin:',
      error
    );

    return res
      .status(400)
      .send(
        'Invalid Manager origin.'
      );
  }

  const code =
    typeof req.query.code ===
      'string'
      ? req.query.code
      : '';

  const returnedState =
    typeof req.query.state ===
      'string'
      ? req.query.state
      : '';

  if (
    !code ||
    !returnedState
  ) {
    return res
      .status(400)
      .send(
        'Invalid GitHub authentication response.'
      );
  }

  const cookies =
    getCookies(req);

  const storedState =
    cookies.manager_oauth_state ||
    '';

  if (
    !storedState ||
    !safeEqual(
      storedState,
      returnedState
    )
  ) {
    return res
      .status(403)
      .send(
        'Invalid or expired authentication state.'
      );
  }

  if (
    !verifyManagerOAuthState(
      returnedState,
      sessionSecret
    )
  ) {
    return res
      .status(403)
      .send(
        'Authentication state verification failed.'
      );
  }

  let tokenData;

  try {
    tokenData =
      await exchangeGitHubCode({
        clientId,
        clientSecret,
        code,
        redirectUri:
          managerCallbackUrl,
        userAgent:
          'IXL-Korea-Manager'
      });
  } catch (error) {
    console.error(
      'GitHub token request failed:',
      error
    );

    return res
      .status(
        error?.statusCode ||
        502
      )
      .send(
        error?.message ||
        'GitHub authentication failed.'
      );
  }

  let githubUser;

  try {
    githubUser =
      await getGitHubUser({
        accessToken:
          tokenData.access_token,
        userAgent:
          'IXL-Korea-Manager'
      });
  } catch (error) {
    console.error(
      'GitHub user request failed:',
      error
    );

    return res
      .status(
        error?.statusCode ||
        502
      )
      .send(
        error?.message ||
        'Could not verify GitHub user.'
      );
  }

  const githubLogin =
    String(
      githubUser.login || ''
    );

  if (
    githubLogin.toLowerCase() !==
    String(
      allowedLogin
    ).toLowerCase()
  ) {
    console.warn(
      'Unauthorized Manager login attempt:',
      githubLogin
    );

    return res
      .status(403)
      .send(
        'This GitHub account is not authorized to use IXL Korea Manager.'
      );
  }

  const session =
    createManagerSession(
      githubLogin,
      sessionSecret
    );

  res.setHeader(
    'Set-Cookie',
    [
      serializeCookie(
        'manager_session',
        session,
        {
          path: '/',
          maxAge: 28800
        }
      ),
      clearCookie(
        'manager_oauth_state',
        {
          path: '/api'
        }
      )
    ]
  );

  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );

  return res.redirect(
    302,
    '/manager/'
  );
}