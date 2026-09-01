import crypto from 'crypto';

import {
  getCookies,
  safeEqual,
  createManagerSession
} from '../lib/manager-auth-utils.js';


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

  const clientSecret =
    process.env.MANAGER_GITHUB_CLIENT_SECRET;

  const allowedLogin =
    process.env.MANAGER_ALLOWED_GITHUB_LOGIN;

  const sessionSecret =
    process.env.MANAGER_SESSION_SECRET;


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


  /* =========================================
     READ GITHUB RESPONSE
     ========================================= */

  const code =
    typeof req.query.code === 'string'
      ? req.query.code
      : '';

  const returnedState =
    typeof req.query.state === 'string'
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


  /* =========================================
     VERIFY STORED OAUTH STATE
     ========================================= */

  const cookies =
    getCookies(req);

  const storedState =
    cookies.manager_oauth_state || '';


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


  /* =========================================
     VERIFY STATE SIGNATURE
     ========================================= */

  const stateParts =
    returnedState.split('.');


  if (
    stateParts.length !== 2
  ) {

    return res
      .status(403)
      .send(
        'Invalid authentication state.'
      );

  }


  const [
    randomValue,
    receivedSignature
  ] = stateParts;


  const expectedSignature =
    crypto
      .createHmac(
        'sha256',
        sessionSecret
      )
      .update(randomValue)
      .digest('hex');


  if (
    !safeEqual(
      receivedSignature,
      expectedSignature
    )
  ) {

    return res
      .status(403)
      .send(
        'Authentication state verification failed.'
      );

  }


  /* =========================================
     EXCHANGE CODE FOR GITHUB TOKEN
     ========================================= */

  let tokenResponse;


  try {

    tokenResponse =
      await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',

          headers: {
            'Accept':
              'application/json',

            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              client_id:
                clientId,

              client_secret:
                clientSecret,

              code,

              redirect_uri:
                'https://ixl-korea-website.vercel.app/api/manager-callback'
            })
        }
      );

  } catch (error) {

    console.error(
      'GitHub token request error:',
      error
    );

    return res
      .status(502)
      .send(
        'GitHub authentication service could not be reached.'
      );

  }


  if (
    !tokenResponse.ok
  ) {

    console.error(
      'GitHub token request failed:',
      tokenResponse.status
    );

    return res
      .status(502)
      .send(
        'GitHub authentication failed.'
      );

  }


  const tokenData =
    await tokenResponse.json();


  if (
    !tokenData.access_token
  ) {

    console.error(
      'GitHub did not return an access token:',
      tokenData.error ||
      'unknown_error'
    );

    return res
      .status(401)
      .send(
        'GitHub authentication was not authorized.'
      );

  }


  /* =========================================
     GET AUTHENTICATED GITHUB USER
     ========================================= */

  let userResponse;


  try {

    userResponse =
      await fetch(
        'https://api.github.com/user',
        {
          headers: {
            'Accept':
              'application/vnd.github+json',

            'Authorization':
              `Bearer ${tokenData.access_token}`,

            'X-GitHub-Api-Version':
              '2022-11-28',

            'User-Agent':
              'IXL-Korea-Manager'
          }
        }
      );

  } catch (error) {

    console.error(
      'GitHub user request error:',
      error
    );

    return res
      .status(502)
      .send(
        'GitHub user verification service could not be reached.'
      );

  }


  if (
    !userResponse.ok
  ) {

    console.error(
      'GitHub user request failed:',
      userResponse.status
    );

    return res
      .status(502)
      .send(
        'Could not verify GitHub user.'
      );

  }


  const githubUser =
    await userResponse.json();

  const githubLogin =
    String(
      githubUser.login || ''
    );


  /* =========================================
     AUTHORIZE MANAGER ACCOUNT
     ========================================= */

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


  /* =========================================
     CREATE MANAGER SESSION
     ========================================= */

  const session =
    createManagerSession(
      githubLogin,
      sessionSecret
    );


  /* =========================================
     SET SESSION COOKIE
     REMOVE OAUTH STATE COOKIE
     ========================================= */

  res.setHeader(
    'Set-Cookie',
    [
      [
        'manager_session=' +
        encodeURIComponent(
          session
        ),

        'HttpOnly',

        'Secure',

        'SameSite=Lax',

        'Path=/',

        'Max-Age=28800'
      ].join('; '),

      [
        'manager_oauth_state=',

        'HttpOnly',

        'Secure',

        'SameSite=Lax',

        'Path=/api',

        'Max-Age=0'
      ].join('; ')
    ]
  );


  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );


  /* =========================================
     RETURN TO MANAGER
     ========================================= */

  return res.redirect(
    302,
    '/manager/'
  );

}