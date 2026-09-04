import {
  getCookies,
  clearCookie
} from '../lib/http/cookies.js';

import {
  getRequestOrigin
} from '../lib/http/request.js';

import {
  safeEqual
} from '../lib/security/crypto.js';

import {
  exchangeGitHubCode
} from '../lib/oauth/github.js';

function safeJson(value) {
  return JSON
    .stringify(value)
    .replace(/</g, '\\u003c');
}

function renderResult(
  status,
  content
) {
  const payload =
    `authorization:github:${status}:${JSON.stringify(content)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>IXL Korea CMS Authentication</title>
</head>
<body>
<p>Completing GitHub sign-in...</p>

<script>
(function () {
  var payload = ${safeJson(payload)};

  function send(message) {
    if (!window.opener) return;

    window.opener.postMessage(
      payload,
      message.origin
    );

    window.removeEventListener(
      'message',
      send,
      false
    );

    setTimeout(function () {
      window.close();
    }, 100);
  }

  window.addEventListener(
    'message',
    send,
    false
  );

  if (window.opener) {
    window.opener.postMessage(
      'authorizing:github',
      '*'
    );
  }
})();
</script>

</body>
</html>`;
}

export default async function handler(
  req,
  res
) {
  const clientId =
    process.env.OAUTH_CLIENT_ID;

  const clientSecret =
    process.env.OAUTH_CLIENT_SECRET;

  const origin =
    getRequestOrigin(req);

  res.setHeader(
    'Set-Cookie',
    clearCookie(
      'ixl_cms_oauth_state',
      {
        path: '/'
      }
    )
  );

  res.setHeader(
    'Content-Type',
    'text/html; charset=utf-8'
  );

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  try {
    if (
      !clientId ||
      !clientSecret
    ) {
      throw new Error(
        'OAuth environment variables are not configured.'
      );
    }

    const url =
      new URL(
        req.url,
        origin
      );

    const code =
      url.searchParams.get(
        'code'
      );

    const returnedState =
      url.searchParams.get(
        'state'
      );

    const oauthError =
      url.searchParams.get(
        'error'
      );

    const oauthErrorDescription =
      url.searchParams.get(
        'error_description'
      );

    if (oauthError) {
      throw new Error(
        oauthErrorDescription ||
        oauthError
      );
    }

    if (!code) {
      throw new Error(
        'GitHub did not return an authorization code.'
      );
    }

    const cookies =
      getCookies(req);

    const expectedState =
      cookies.ixl_cms_oauth_state;

    if (
      !expectedState ||
      !returnedState ||
      !safeEqual(
        expectedState,
        returnedState
      )
    ) {
      throw new Error(
        'OAuth state validation failed. Please start the login again.'
      );
    }

    const tokenData =
      await exchangeGitHubCode({
        clientId,
        clientSecret,
        code,
        redirectUri:
          `${origin}/callback`,
        userAgent:
          'IXL-Korea-Decap-CMS'
      });

    res.statusCode = 200;

    res.end(
      renderResult(
        'success',
        {
          token:
            tokenData.access_token,
          provider:
            'github'
        }
      )
    );
  } catch (error) {
    res.statusCode = 200;

    res.end(
      renderResult(
        'error',
        {
          message:
            error?.message ||
            'Authentication failed.'
        }
      )
    );
  }
}
