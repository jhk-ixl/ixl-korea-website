const crypto = require("crypto");

const REDIRECT_URI =
  "https://ixl-korea-website.vercel.app/api/linkedin-callback";

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [
          decodeURIComponent(part.slice(0, index)),
          decodeURIComponent(part.slice(index + 1)),
        ];
      })
  );
}

function getEncryptionKey() {
  const secret = process.env.MANAGER_SESSION_SECRET;

  if (!secret) {
    throw new Error("MANAGER_SESSION_SECRET is not configured.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

module.exports = async function handler(req, res) {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(
        `LinkedIn authorization failed: ${
          error_description || error
        }`
      );
    }

    if (!code || !state) {
      return res.status(400).send(
        "Missing LinkedIn authorization code or state."
      );
    }

    const cookies = parseCookies(req.headers.cookie || "");
    const savedState = cookies.linkedin_oauth_state;

    if (!savedState || savedState !== state) {
      return res.status(400).send(
        "LinkedIn OAuth state verification failed."
      );
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).send(
        "LinkedIn OAuth environment variables are not configured."
      );
    }

    const tokenResponse = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("LinkedIn token exchange failed:", tokenData);

      return res.status(500).send(
        "LinkedIn access token could not be obtained."
      );
    }

    const expiresIn = Number(tokenData.expires_in || 5184000);
    const expiresAt = Date.now() + expiresIn * 1000;

    const encryptedToken = encrypt(tokenData.access_token);

    const userInfoResponse = await fetch(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const userInfo = await userInfoResponse.json();

    if (!userInfoResponse.ok || !userInfo.sub) {
      console.error(
        "LinkedIn user info request failed:",
        userInfo
      );

      return res.status(500).send(
        "LinkedIn member information could not be obtained."
      );
    }

    const encryptedMemberId = encrypt(userInfo.sub);

    const secureCookieOptions =
      "HttpOnly; Secure; SameSite=Lax; Path=/";

    res.setHeader("Set-Cookie", [
      `linkedin_access_token=${encryptedToken}; ${secureCookieOptions}; Max-Age=${expiresIn}`,   
      `linkedin_member_id=${encryptedMemberId}; ${secureCookieOptions}; Max-Age=${expiresIn}`,  
      `linkedin_token_expires_at=${expiresAt}; ${secureCookieOptions}; Max-Age=${expiresIn}`,
      `linkedin_oauth_state=; ${secureCookieOptions}; Max-Age=0`,
    ]);

    return res.redirect(
      302,
      "/manager/distribution-queue.html?linkedin=connected"
    );
  } catch (error) {
    console.error("LinkedIn callback error:", error);

    return res.status(500).send(
      "LinkedIn connection failed."
    );
  }
};