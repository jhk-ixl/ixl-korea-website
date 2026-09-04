import crypto from 'crypto';

import {
  getCookies
} from '../http/cookies.js';

import {
  safeEqual
} from '../security/crypto.js';

/* =========================================
   MANAGER AUTH / SESSION
   ========================================= */

const MANAGER_SESSION_MS =
  8 * 60 * 60 * 1000;

export function createManagerOAuthState(
  secret
) {
  if (!secret) {
    throw new Error(
      'MANAGER_SESSION_SECRET is not configured.'
    );
  }

  const randomValue =
    crypto
      .randomBytes(32)
      .toString('hex');

  const signature =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(randomValue)
      .digest('hex');

  return `${randomValue}.${signature}`;
}

export function verifyManagerOAuthState(
  state,
  secret
) {
  if (
    !state ||
    !secret
  ) {
    return false;
  }

  const parts =
    String(state).split('.');

  if (parts.length !== 2) {
    return false;
  }

  const [
    randomValue,
    receivedSignature
  ] = parts;

  const expectedSignature =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(randomValue)
      .digest('hex');

  return safeEqual(
    receivedSignature,
    expectedSignature
  );
}

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
            MANAGER_SESSION_MS
        })
      )
      .toString('base64url');

  const signature =
    crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(payload)
      .digest('base64url');

  return `${payload}.${signature}`;
}

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
    String(session).split('.');

  if (parts.length !== 2) {
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
      .digest('base64url');

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
          .toString('utf8')
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

export function requireManager(
  req,
  res
) {
  const manager =
    getAuthenticatedManager(req);

  if (manager.authenticated) {
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
