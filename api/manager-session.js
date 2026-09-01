import {
  getAuthenticatedManager
} from '../lib/manager-auth-utils.js';


export default async function handler(req, res) {

  /* =========================================
     GET
     CHECK MANAGER SESSION
     ========================================= */

  if (req.method === 'GET') {

    const manager =
      getAuthenticatedManager(req);


    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );


    /* -----------------------------------------
       AUTH NOT CONFIGURED
       ----------------------------------------- */

    if (
      manager.reason ===
      'not_configured'
    ) {

      console.error(
        'Manager authentication environment variables are missing.'
      );

      return res
        .status(500)
        .json({
          authenticated: false,
          error:
            'Manager authentication is not configured.'
        });

    }


    /* -----------------------------------------
       NOT AUTHENTICATED
       ----------------------------------------- */

    if (
      !manager.authenticated
    ) {

      return res
        .status(401)
        .json({
          authenticated: false
        });

    }


    /* -----------------------------------------
       AUTHENTICATED
       ----------------------------------------- */

    return res
      .status(200)
      .json({
        authenticated: true,
        login:
          manager.login
      });

  }


  /* =========================================
     POST
     LOGOUT MANAGER
     ========================================= */

  if (req.method === 'POST') {

    res.setHeader(
      'Set-Cookie',
      [
        'manager_session=',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=0'
      ].join('; ')
    );


    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );


    return res
      .status(200)
      .json({
        success: true
      });

  }


  /* =========================================
     METHOD NOT ALLOWED
     ========================================= */

  res.setHeader(
    'Allow',
    'GET, POST'
  );


  return res
    .status(405)
    .json({
      error:
        'Method not allowed.'
    });

}