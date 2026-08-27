import {
  getAuthenticatedManager
} from './_manager-auth-utils.js';


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
        error:
          'Method not allowed.'
      });

  }


  /* =========================================
     CHECK MANAGER SESSION
     ========================================= */

  const manager =
    getAuthenticatedManager(req);


  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );


  /* =========================================
     AUTH NOT CONFIGURED
     ========================================= */

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


  /* =========================================
     NOT AUTHENTICATED
     ========================================= */

  if (
    !manager.authenticated
  ) {

    return res
      .status(401)
      .json({
        authenticated: false
      });

  }


  /* =========================================
     AUTHENTICATED
     ========================================= */

  return res
    .status(200)
    .json({
      authenticated: true,
      login:
        manager.login
    });

}