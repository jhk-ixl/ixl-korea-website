import {
  LINKEDIN_REDIRECT_URI,
  LINKEDIN_VERSION
} from './config.js';

/* =========================================
   LINKEDIN API CLIENT
   ========================================= */

export function getLinkedInRestHeaders(
  accessToken,
  extra = {}
) {
  return {
    Authorization:
      `Bearer ${accessToken}`,
    'LinkedIn-Version':
      LINKEDIN_VERSION,
    'X-Restli-Protocol-Version':
      '2.0.0',
    ...extra
  };
}

export async function exchangeLinkedInCode({
  code,
  clientId,
  clientSecret
}) {
  const response =
    await fetch(
      'https://www.linkedin.com/oauth/v2/accessToken',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body:
          new URLSearchParams({
            grant_type:
              'authorization_code',
            code,
            redirect_uri:
              LINKEDIN_REDIRECT_URI,
            client_id:
              clientId,
            client_secret:
              clientSecret
          })
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

  if (
    !response.ok ||
    !data.access_token
  ) {
    console.error(
      'LinkedIn token exchange failed:',
      data
    );

    throw new Error(
      'LinkedIn access token could not be obtained.'
    );
  }

  return data;
}

export async function getLinkedInUserInfo(
  accessToken
) {
  const response =
    await fetch(
      'https://api.linkedin.com/v2/userinfo',
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

  if (
    !response.ok ||
    !data.sub
  ) {
    console.error(
      'LinkedIn user info request failed:',
      data
    );

    throw new Error(
      'LinkedIn member information could not be obtained.'
    );
  }

  return data;
}

export async function publishLinkedInTextPost(
  accessToken,
  memberId,
  postText
) {
  const response =
    await fetch(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json',
          'X-Restli-Protocol-Version':
            '2.0.0'
        },
        body:
          JSON.stringify({
            author:
              `urn:li:person:${memberId}`,
            lifecycleState:
              'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                  text:
                    postText
                },
                shareMediaCategory:
                  'NONE'
              }
            },
            visibility: {
              'com.linkedin.ugc.MemberNetworkVisibility':
                'PUBLIC'
            }
          })
      }
    );

  const responseText =
    await response.text();

  if (!response.ok) {
    console.error(
      'LinkedIn text publish failed:',
      response.status,
      responseText
    );

    throw new Error(
      `LinkedIn text publish failed (${response.status}).`
    );
  }

  return (
    response.headers.get(
      'x-restli-id'
    ) || null
  );
}
