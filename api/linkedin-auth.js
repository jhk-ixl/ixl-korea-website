import {
  randomHex
} from '../lib/security/crypto.js';

import {
  serializeCookie
} from '../lib/http/cookies.js';

import {
  LINKEDIN_REDIRECT_URI
} from '../lib/linkedin/config.js';

export default async function handler(
  req,
  res
) {
  const clientId =
    process.env.LINKEDIN_CLIENT_ID;

  if (!clientId) {
    return res
      .status(500)
      .json({
        error:
          'LINKEDIN_CLIENT_ID is not configured.'
      });
  }

  const state =
    randomHex(24);

  res.setHeader(
    'Set-Cookie',
    serializeCookie(
      'linkedin_oauth_state',
      state,
      {
        path: '/',
        maxAge: 600
      }
    )
  );

  const params =
    new URLSearchParams({
      response_type:
        'code',
      client_id:
        clientId,
      redirect_uri:
        LINKEDIN_REDIRECT_URI,
      state,
      scope:
        'openid profile w_member_social'
    });

  const authorizationUrl =
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;

  return res.redirect(
    302,
    authorizationUrl
  );
}
