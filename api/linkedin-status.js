import {
  getLinkedInSession
} from '../lib/linkedin/session.js';

export default async function handler(
  req,
  res
) {
  if (req.method !== 'GET') {
    res.setHeader(
      'Allow',
      'GET'
    );

    return res
      .status(405)
      .json({
        ok: false,
        error:
          'Method not allowed'
      });
  }

  try {
    const session =
      getLinkedInSession(req);

    if (!session.connected) {
      if (
        session.status ===
        'expired'
      ) {
        return res
          .status(200)
          .json({
            ok: true,
            connected:
              false,
            status:
              'expired',
            expiresAt:
              new Date(
                session.expiresAt
              ).toISOString(),
            daysRemaining:
              0,
            message:
              'LinkedIn access token has expired.'
          });
      }

      return res
        .status(200)
        .json({
          ok: true,
          connected:
            false,
          status:
            session.status,
          message:
            session.status ===
              'invalid'
              ? 'LinkedIn session data is invalid. Please reconnect LinkedIn.'
              : 'LinkedIn is not connected.'
        });
    }

    return res
      .status(200)
      .json({
        ok: true,
        connected:
          true,
        status:
          session.status,
        expiresAt:
          new Date(
            session.expiresAt
          ).toISOString(),
        daysRemaining:
          session.daysRemaining,
        reconnectUrl:
          '/api/linkedin-auth'
      });
  } catch (error) {
    console.error(
      'LinkedIn status error:',
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        connected:
          false,
        status:
          'error',
        error:
          'Unable to check LinkedIn connection status.'
      });
  }
}
