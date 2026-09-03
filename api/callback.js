function getOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function parseCookies(header) {
  const result = {};

  String(header || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index === -1) return;

      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();

      if (key) {
        result[key] = decodeURIComponent(value);
      }
    });

  return result;
}

function safeJson(value) {
  // Also escape < so a token/error cannot accidentally terminate the script block.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function renderResult(status, content) {
  const payload = `authorization:github:${status}:${JSON.stringify(content)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>IXL Korea CMS Authentication</title>
</head>
<body>
<p>Completing GitHub sign-in…</p>

<script>
(function () {
  var payload = ${safeJson(payload)};

  function send(message) {
    if (!window.opener) return;

    // Decap replies to the initial "authorizing:github" handshake.
    // Using the received origin keeps the access token scoped
    // to the CMS parent window.
    window.opener.postMessage(payload, message.origin);

    window.removeEventListener('message', send, false);

    setTimeout(function () {
      window.close();
    }, 100);
  }

  window.addEventListener('message', send, false);

  if (window.opener) {
    window.opener.postMessage('authorizing:github', '*');
  }
})();
</script>

</body>
</html>`;
}

export default async function handler(req, res) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const origin = getOrigin(req);

  // Clear the state cookie whether the exchange succeeds or fails.
  res.setHeader(
    'Set-Cookie',
    'ixl_cms_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  );

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (!clientId || !clientSecret) {
      throw new Error('OAuth environment variables are not configured.');
    }

    const url = new URL(req.url, origin);

    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');
    const oauthErrorDescription = url.searchParams.get('error_description');

    if (oauthError) {
      throw new Error(oauthErrorDescription || oauthError);
    }

    if (!code) {
      throw new Error('GitHub did not return an authorization code.');
    }

    const cookies = parseCookies(req.headers.cookie);
    const expectedState = cookies.ixl_cms_oauth_state;

    if (
      !expectedState ||
      !returnedState ||
      expectedState !== returnedState
    ) {
      throw new Error(
        'OAuth state validation failed. Please start the login again.'
      );
    }

    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'IXL-Korea-Decap-CMS'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${origin}/callback`
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(
        tokenData.error_description ||
          tokenData.error ||
          'GitHub token exchange failed.'
      );
    }

    res.statusCode = 200;

    res.end(
      renderResult('success', {
        token: tokenData.access_token,
        provider: 'github'
      })
    );
  } catch (error) {
    res.statusCode = 200;

    res.end(
      renderResult('error', {
        message:
          error && error.message
            ? error.message
            : 'Authentication failed.'
      })
    );
  }
}