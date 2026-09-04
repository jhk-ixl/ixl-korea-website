import {
  clearCookie
} from '../lib/http/cookies.js';

import {
  getAuthenticatedManager
} from '../lib/manager/auth.js';

export default async function handler(
  req,
  res
) {
  if (req.method === 'GET') {
    const manager =
      getAuthenticatedManager(req);

    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );

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
          authenticated:
            false,
          error:
            'Manager authentication is not configured.'
        });
    }

    if (!manager.authenticated) {
      return res
        .status(401)
        .json({
          authenticated:
            false
        });
    }

    return res
      .status(200)
      .json({
        authenticated:
          true,
        login:
          manager.login
      });
  }

  if (req.method === 'POST') {
    res.setHeader(
      'Set-Cookie',
      clearCookie(
        'manager_session',
        {
          path: '/'
        }
      )
    );

    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );

    return res
      .status(200)
      .json({
        success:
          true
      });
  }

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
