import crypto from 'crypto';


export default async function handler(req, res) {

  /* =========================================
     ONLY GET
     ========================================= */

  if (req.method !== 'GET') {

    res.setHeader(
      'Allow',
      'GET'
    );

    return res
      .status(405)
      .json({
        error: 'Method not allowed.'
      });

  }


  /* =========================================
     ENVIRONMENT VARIABLES
     ========================================= */

  const clientId =
    process.env.MANAGER_GITHUB_CLIENT_ID;

  const sessionSecret =
    process.env.MANAGER_SESSION_SECRET;


  if (!clientId || !sessionSecret) {

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


  /* =========================================
     CREATE OAUTH STATE
     ========================================= */

  const randomValue =
    crypto
      .randomBytes(32)
      .toString('hex');


  const signature =
    crypto
      .createHmac(
        'sha256',
        sessionSecret
      )
      .update(randomValue)
      .digest('hex');


  const state =
    `${randomValue}.${signature}`;


  /* =========================================
     SAVE STATE IN SECURE COOKIE
     ========================================= */

  res.setHeader(
    'Set-Cookie',
    [
      'manager_oauth_state=' +
      encodeURIComponent(state),

      'HttpOnly',

      'Secure',

      'SameSite=Lax',

      'Path=/api',

      'Max-Age=600'
    ].join('; ')
  );


  /* =========================================
     GITHUB CALLBACK
     ========================================= */

  const callbackUrl =
    'https://ixl-korea-website.vercel.app/api/manager-callback';


  /* =========================================
     GITHUB AUTHORIZE URL
     ========================================= */

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
    callbackUrl
  );


  githubAuthorizeUrl.searchParams.set(
    'state',
    state
  );


  githubAuthorizeUrl.searchParams.set(
    'scope',
    'read:user'
  );


  /* =========================================
     REDIRECT TO GITHUB
     ========================================= */

  return res.redirect(
    302,
    githubAuthorizeUrl.toString()
  );

}