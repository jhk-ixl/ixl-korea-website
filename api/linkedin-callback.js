import {
  getCookies,
  serializeCookie,
  clearCookie
} from '../lib/http/cookies.js';

import {
  safeEqual
} from '../lib/security/crypto.js';

import {
  LINKEDIN_CONNECTED_REDIRECT
} from '../lib/linkedin/config.js';

import {
  encryptLinkedInValue
} from '../lib/linkedin/session.js';

import {
  exchangeLinkedInCode,
  getLinkedInUserInfo
} from '../lib/linkedin/client.js';

export default async function handler(
  req,
  res
) {
  try {
    const {
      code,
      state,
      error,
      error_description:
        errorDescription
    } = req.query;

    if (error) {
      return res
        .status(400)
        .send(
          `LinkedIn authorization failed: ${
            errorDescription ||
            error
          }`
        );
    }

    if (
      !code ||
      !state
    ) {
      return res
        .status(400)
        .send(
          'Missing LinkedIn authorization code or state.'
        );
    }

    const cookies =
      getCookies(req);

    const savedState =
      cookies.linkedin_oauth_state;

    if (
      !savedState ||
      !safeEqual(
        savedState,
        state
      )
    ) {
      return res
        .status(400)
        .send(
          'LinkedIn OAuth state verification failed.'
        );
    }

    const clientId =
      process.env.LINKEDIN_CLIENT_ID;

    const clientSecret =
      process.env
        .LINKEDIN_CLIENT_SECRET;

    if (
      !clientId ||
      !clientSecret
    ) {
      return res
        .status(500)
        .send(
          'LinkedIn OAuth environment variables are not configured.'
        );
    }

    const tokenData =
      await exchangeLinkedInCode({
        code,
        clientId,
        clientSecret
      });

    const expiresIn =
      Number(
        tokenData.expires_in ||
        5184000
      );

    const expiresAt =
      Date.now() +
      expiresIn * 1000;

    const userInfo =
      await getLinkedInUserInfo(
        tokenData.access_token
      );

    const encryptedToken =
      encryptLinkedInValue(
        tokenData.access_token
      );

    const encryptedMemberId =
      encryptLinkedInValue(
        userInfo.sub
      );

    res.setHeader(
      'Set-Cookie',
      [
        serializeCookie(
          'linkedin_access_token',
          encryptedToken,
          {
            path: '/',
            maxAge:
              expiresIn
          }
        ),
        serializeCookie(
          'linkedin_member_id',
          encryptedMemberId,
          {
            path: '/',
            maxAge:
              expiresIn
          }
        ),
        serializeCookie(
          'linkedin_token_expires_at',
          expiresAt,
          {
            path: '/',
            maxAge:
              expiresIn
          }
        ),
        clearCookie(
          'linkedin_oauth_state',
          {
            path: '/'
          }
        )
      ]
    );

    return res.redirect(
      302,
      LINKEDIN_CONNECTED_REDIRECT
    );
  } catch (error) {
    console.error(
      'LinkedIn callback error:',
      error
    );

    return res
      .status(500)
      .send(
        'LinkedIn connection failed.'
      );
  }
}
