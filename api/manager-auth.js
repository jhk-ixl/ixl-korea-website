import {
  serializeCookie
} from '../lib/http/cookies.js';

import {
  createManagerOAuthState
} from '../lib/manager/auth.js';

const MANAGER_CALLBACK_URL =
  'https://ixl-korea-website.vercel.app/api/manager-callback';

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
    MANAGER_CALLBACK_URL
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
