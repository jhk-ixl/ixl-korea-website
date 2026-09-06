import {
  serializeCookie
} from '../lib/http/cookies.js';

import {
  createManagerOAuthState
} from '../lib/manager/auth.js';

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

  const sessionSecret =
    process.env
      .MANAGER_SESSION_SECRET;

  if (
    !clientId ||
    !sessionSecret
  ) {
    console.error(
      'Manager OAuth environment variables are missing.'
    );

    return res
      .status(500)
      .json({
        error:
          'Manager authentication is not configured.'
      });
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
      .json({
        error:
          'Invalid Manager origin.'
      });
  }

  const state =
    createManagerOAuthState(
      sessionSecret
    );

  res.setHeader(
    'Set-Cookie',
    serializeCookie(
      'manager_oauth_state',
      state,
      {
        path: '/api',
        maxAge: 600
      }
    )
  );

  const githubAuthorizeUrl =
    new URL(
      'https://github.com/login/oauth/authorize'
    );

  githubAuthorizeUrl.searchParams.set(
    'client_id',
    clientId
  );

  githubAuthorizeUrl.searchParams.set(
    'redirect_uri',
    managerCallbackUrl
  );

  githubAuthorizeUrl.searchParams.set(
    'state',
    state
  );

  githubAuthorizeUrl.searchParams.set(
    'scope',
    'read:user'
  );

  return res.redirect(
    302,
    githubAuthorizeUrl.toString()
  );
}