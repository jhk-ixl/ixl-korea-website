import crypto from 'crypto';


/* =========================================
   COOKIE PARSER
   ========================================= */

export function getCookies(req) {

  const cookieHeader =
    req.headers.cookie || '';

  const cookies = {};

  cookieHeader
    .split(';')
    .forEach(item => {

      const index =
        item.indexOf('=');

      if (index === -1) {
        return;
      }

      const key =
        item
          .slice(0, index)
          .trim();

      const value =
        item
          .slice(index + 1)
          .trim();

      if (!key) {
        return;
      }

      try {

        cookies[key] =
          decodeURIComponent(value);

      } catch {

        cookies[key] =
          value;

      }

    });


  return cookies;

}


/* =========================================
   TIMING-SAFE STRING COMPARE
   ========================================= */

export function safeEqual(a, b) {

  const bufferA =
    Buffer.from(
      String(a)
    );

  const bufferB =
    Buffer.from(
      String(b)
    );


  if (
    bufferA.length !==
    bufferB.length
  ) {

    return false;

  }


  return crypto.timingSafeEqual(
    bufferA,
    bufferB
  );

}


/* =========================================
   CREATE MANAGER SESSION
   8 HOURS
   ========================================= */

export function createManagerSession(
  login,
  secret
) {

  const payload =
    Buffer
      .from(
        JSON.stringify({
          login,
          exp:
            Date.now() +
            (8 * 60 * 60 * 1000)
        })
      )
      .toString(
        'base64url'
      );


  const signature =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(payload)
      .digest(
        'base64url'
      );


  return (
    payload +
    '.' +
    signature
  );

}


/* =========================================
   VERIFY MANAGER SESSION
   ========================================= */

export function verifyManagerSession(
  session,
  secret
) {

  if (
    !session ||
    !secret
  ) {

    return null;

  }


  const parts =
    String(session)
      .split('.');


  if (
    parts.length !== 2
  ) {

    return null;

  }


  const [
    payload,
    receivedSignature
  ] = parts;


  const expectedSignature =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(payload)
      .digest(
        'base64url'
      );


  if (
    !safeEqual(
      receivedSignature,
      expectedSignature
    )
  ) {

    return null;

  }


  let data;


  try {

    data =
      JSON.parse(
        Buffer
          .from(
            payload,
            'base64url'
          )
          .toString(
            'utf8'
          )
      );

  } catch {

    return null;

  }


  if (
    !data ||
    !data.login ||
    !data.exp
  ) {

    return null;

  }


  if (
    Date.now() >
    Number(data.exp)
  ) {

    return null;

  }


  return data;

}


/* =========================================
   GET AUTHENTICATED MANAGER
   ========================================= */

export function getAuthenticatedManager(
  req
) {

  const sessionSecret =
    process.env
      .MANAGER_SESSION_SECRET;

  const allowedLogin =
    process.env
      .MANAGER_ALLOWED_GITHUB_LOGIN;


  if (
    !sessionSecret ||
    !allowedLogin
  ) {

    return {
      authenticated: false,
      reason:
        'not_configured'
    };

  }


  const cookies =
    getCookies(req);


  const session =
    verifyManagerSession(
      cookies.manager_session,
      sessionSecret
    );


  if (!session) {

    return {
      authenticated: false,
      reason:
        'invalid_session'
    };

  }


  if (
    String(
      session.login
    ).toLowerCase() !==
    String(
      allowedLogin
    ).toLowerCase()
  ) {

    return {
      authenticated: false,
      reason:
        'not_authorized'
    };

  }


  return {
    authenticated: true,
    login:
      session.login
  };

}


/* =========================================
   REQUIRE AUTHENTICATED MANAGER
   FOR SERVER APIs
   ========================================= */

export function requireManager(
  req,
  res
) {

  const manager =
    getAuthenticatedManager(
      req
    );


  if (
    manager.authenticated
  ) {

    return manager;

  }


  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );


  if (
    manager.reason ===
    'not_configured'
  ) {

    res
      .status(500)
      .json({
        error:
          'Manager authentication is not configured.'
      });

  } else {

    res
      .status(401)
      .json({
        error:
          'Manager authentication required.'
      });

  }


  return null;

}