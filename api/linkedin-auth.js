const crypto = require("crypto");

module.exports = async function handler(req, res) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({
      error: "LINKEDIN_CLIENT_ID is not configured."
    });
  }

  const redirectUri =
    "https://ixl-korea-website.vercel.app/api/linkedin-callback";

  // OAuth CSRF protection
  const state = crypto.randomBytes(24).toString("hex");

  res.setHeader(
    "Set-Cookie",
    `linkedin_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
  );

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "w_member_social"
  });

  const authorizationUrl =
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;

  return res.redirect(302, authorizationUrl);
};