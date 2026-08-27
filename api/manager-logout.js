export default async function handler(req, res) {

  /* =========================================
     ONLY POST
     ========================================= */

  if (req.method !== 'POST') {

    res.setHeader(
      'Allow',
      'POST'
    );

    return res
      .status(405)
      .json({
        error:
          'Method not allowed.'
      });

  }


  /* =========================================
     REMOVE MANAGER SESSION COOKIE
     ========================================= */

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


  /* =========================================
     RESPONSE
     ========================================= */

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