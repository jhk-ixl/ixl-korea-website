function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");

        if (index === -1) {
          return [decodeURIComponent(part), ""];
        }

        return [
          decodeURIComponent(part.slice(0, index)),
          decodeURIComponent(part.slice(index + 1)),
        ];
      })
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const cookies = parseCookies(req.headers.cookie || "");

    const accessToken = cookies.linkedin_access_token;
    const expiresAtRaw = cookies.linkedin_token_expires_at;

    if (!accessToken || !expiresAtRaw) {
      return res.status(200).json({
        ok: true,
        connected: false,
        status: "disconnected",
        message: "LinkedIn is not connected.",
      });
    }

    const expiresAt = Number(expiresAtRaw);

    if (!Number.isFinite(expiresAt)) {
      return res.status(200).json({
        ok: true,
        connected: false,
        status: "invalid",
        message: "LinkedIn token expiration information is invalid.",
      });
    }

    const now = Date.now();
    const remainingMs = expiresAt - now;

    if (remainingMs <= 0) {
      return res.status(200).json({
        ok: true,
        connected: false,
        status: "expired",
        expiresAt: new Date(expiresAt).toISOString(),
        daysRemaining: 0,
        message: "LinkedIn access token has expired.",
      });
    }

    const daysRemaining = Math.ceil(
      remainingMs / (1000 * 60 * 60 * 24)
    );

    let status = "connected";

    if (daysRemaining <= 7) {
      status = "critical";
    } else if (daysRemaining <= 14) {
      status = "warning";
    }

    return res.status(200).json({
      ok: true,
      connected: true,
      status,
      expiresAt: new Date(expiresAt).toISOString(),
      daysRemaining,
      reconnectUrl: "/api/linkedin-auth",
    });
  } catch (error) {
    console.error("LinkedIn status error:", error);

    return res.status(500).json({
      ok: false,
      connected: false,
      status: "error",
      error: "Unable to check LinkedIn connection status.",
    });
  }
};