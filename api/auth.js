import {
  randomHex
} from '../lib/security/crypto.js';

import {
  serializeCookie
} from '../lib/http/cookies.js';

import {
  getRequestOrigin
} from '../lib/http/request.js';

export default function handler(
  req,
  res
) {
  const clientId =
    process.env.OAUTH_CLIENT_ID;

  if (!clientId) {
    res.statusCode = 500;
    res.setHeader(
      'Content-Type',
      'text/plain; charset=utf-8'
    );
    res.end(
      'Missing OAUTH_CLIENT_ID'
    );
    return;
  }

  const origin =
    getRequestOrigin(req);

  const state =
    randomHex(24);

  const redirectUri =
    `${origin}/callback`;

  res.setHeader(
    'Set-Cookie',
    serializeCookie(
      'ixl_cms_oauth_state',
      state,
      {
        path: '/',
        maxAge: 600
      }
    )
  );

  const authorize =
    new URL(
      'https://github.com/login/oauth/authorize'
    );

  authorize.searchParams.set(
    'client_id',
    clientId
  );

  authorize.searchParams.set(
    'redirect_uri',
    redirectUri
  );

  authorize.searchParams.set(
    'scope',
    'repo,user'
  );

  authorize.searchParams.set(
    'state',
    state
  );

  res.statusCode = 302;
  res.setHeader(
    'Location',
    authorize.toString()
  );
  res.end();
}
