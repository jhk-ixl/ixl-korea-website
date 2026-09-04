/* =========================================
   COMMON GITHUB OAUTH CLIENT
   ========================================= */

export async function exchangeGitHubCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  userAgent = 'IXL-Korea'
}) {
  if (
    !clientId ||
    !clientSecret ||
    !code ||
    !redirectUri
  ) {
    throw new Error(
      'GitHub OAuth token exchange parameters are incomplete.'
    );
  }

  let response;

  try {
    response =
      await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': userAgent
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri
          })
        }
      );
  } catch (error) {
    const wrapped =
      new Error(
        'GitHub authentication service could not be reached.'
      );

    wrapped.cause = error;
    wrapped.statusCode = 502;
    throw wrapped;
  }

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (
    !response.ok ||
    !data.access_token
  ) {
    const error =
      new Error(
        data.error_description ||
        data.error ||
        'GitHub token exchange failed.'
      );

    error.statusCode =
      response.ok ? 401 : 502;

    throw error;
  }

  return data;
}

export async function getGitHubUser({
  accessToken,
  userAgent = 'IXL-Korea-Manager'
}) {
  if (!accessToken) {
    throw new Error(
      'GitHub access token is required.'
    );
  }

  let response;

  try {
    response =
      await fetch(
        'https://api.github.com/user',
        {
          headers: {
            'Accept':
              'application/vnd.github+json',
            'Authorization':
              `Bearer ${accessToken}`,
            'X-GitHub-Api-Version':
              '2022-11-28',
            'User-Agent':
              userAgent
          }
        }
      );
  } catch (error) {
    const wrapped =
      new Error(
        'GitHub user verification service could not be reached.'
      );

    wrapped.cause = error;
    wrapped.statusCode = 502;
    throw wrapped;
  }

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (
    !response.ok ||
    !data.login
  ) {
    const error =
      new Error(
        'Could not verify GitHub user.'
      );

    error.statusCode = 502;
    throw error;
  }

  return data;
}
