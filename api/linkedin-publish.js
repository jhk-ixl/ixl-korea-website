const crypto = require("crypto");

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
    throw new Error(
      "MANAGER_SESSION_SECRET is not configured."
    );
  }

  return crypto
    .createHash("sha256")
    .update(secret)
    .digest();
}

function decrypt(value) {
  const key = getEncryptionKey();

  const buffer =
    Buffer.from(value, "base64url");

  const iv =
    buffer.subarray(0, 12);

  const tag =
    buffer.subarray(12, 28);

  const encrypted =
    buffer.subarray(28);

  const decipher =
    crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      iv
    );

  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

module.exports = async function handler(req, res) {

  try {

    if (req.method !== "POST") {

      res.setHeader(
        "Allow",
        "POST"
      );

      return res.status(405).json({
        error: "Method not allowed.",
      });
    }


    const cookies =
      parseCookies(
        req.headers.cookie || ""
      );


    if (
      !cookies.linkedin_access_token ||
      !cookies.linkedin_member_id
    ) {

      return res.status(401).json({
        error:
          "LinkedIn is not connected. Please reconnect LinkedIn.",
      });
    }


    const accessToken =
      decrypt(
        cookies.linkedin_access_token
      );


    const memberId =
      decrypt(
        cookies.linkedin_member_id
      );


    const postText =
      typeof req.body?.postText === "string"
        ? req.body.postText.trim()
        : "";


    if (!postText) {

      return res.status(400).json({
        error: "Post Text is required.",
      });
    }


    const linkedinResponse =
      await fetch(
        "https://api.linkedin.com/v2/ugcPosts",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",

            "X-Restli-Protocol-Version":
              "2.0.0",
          },

          body:
            JSON.stringify({

              author:
                `urn:li:person:${memberId}`,

              lifecycleState:
                "PUBLISHED",

              specificContent: {

                "com.linkedin.ugc.ShareContent": {

                  shareCommentary: {
                    text: postText,
                  },

                  shareMediaCategory:
                    "NONE",
                },
              },

              visibility: {

                "com.linkedin.ugc.MemberNetworkVisibility":
                  "PUBLIC",
              },
            }),
        }
      );


    const responseText =
      await linkedinResponse.text();


    if (!linkedinResponse.ok) {

      console.error(
        "LinkedIn publish failed:",
        linkedinResponse.status,
        responseText
      );

      return res
        .status(linkedinResponse.status)
        .json({
          error:
            "LinkedIn publish failed.",

          details:
            responseText,
        });
    }


    const postId =
      linkedinResponse.headers.get(
        "x-restli-id"
      ) || null;


    return res.status(200).json({
      success: true,
      postId,
    });


  } catch (error) {

    console.error(
      "LinkedIn publish API error:",
      error
    );


    return res.status(500).json({
      error:
        "LinkedIn publish failed.",
    });

  }

};