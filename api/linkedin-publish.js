const crypto = require("crypto");

const LINKEDIN_VERSION = "202608";

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

function escapeLinkedInCommentary(text) {
  return text.replace(
    /([\\{}@\[\]()<>#*_~])/g,
    "\\$1"
  );
}


function getDocumentTitle(mediaFile) {

  const fileName =
    mediaFile
      .split("/")
      .pop()
      .split("?")[0];

  return decodeURIComponent(fileName)
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}


async function publishTextPost(
  accessToken,
  memberId,
  postText
) {

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
      "LinkedIn text publish failed:",
      linkedinResponse.status,
      responseText
    );

    throw new Error(
      `LinkedIn text publish failed (${linkedinResponse.status}).`
    );
  }


  return (
    linkedinResponse.headers.get(
      "x-restli-id"
    ) || null
  );
}


async function publishDocumentPost(
  accessToken,
  memberId,
  postText,
  mediaFile
) {

  const owner =
    `urn:li:person:${memberId}`;


  /*
   * 1. Get the PDF from the
   *    production website.
   */

  const baseUrl =
    "https://ixl-korea-website.vercel.app/";

  const pdfUrl =
    new URL(
      mediaFile.replace(/^\/+/, ""),
      baseUrl
    ).toString();


  const pdfResponse =
    await fetch(pdfUrl);


  if (!pdfResponse.ok) {

    throw new Error(
      `PDF download failed (${pdfResponse.status}).`
    );
  }


  const contentType =
    pdfResponse.headers.get(
      "content-type"
    ) || "";


  if (
    !contentType
      .toLowerCase()
      .includes("application/pdf")
  ) {

    throw new Error(
      "Media File is not a PDF."
    );
  }


  const pdfBuffer =
    Buffer.from(
      await pdfResponse.arrayBuffer()
    );


  /*
   * 2. Initialize LinkedIn
   *    Document upload.
   */

  const initializeResponse =
    await fetch(
      "https://api.linkedin.com/rest/documents?action=initializeUpload",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",

          "LinkedIn-Version":
            LINKEDIN_VERSION,

          "X-Restli-Protocol-Version":
            "2.0.0",
        },

        body:
          JSON.stringify({
            initializeUploadRequest: {
              owner,
            },
          }),
      }
    );


  const initializeText =
    await initializeResponse.text();


  if (!initializeResponse.ok) {

    console.error(
      "LinkedIn document initialize failed:",
      initializeResponse.status,
      initializeText
    );

    throw new Error(
      `LinkedIn document initialization failed (${initializeResponse.status}).`
    );
  }


  let initializeData;


  try {

    initializeData =
      JSON.parse(initializeText);

  } catch {

    throw new Error(
      "LinkedIn returned an invalid document initialization response."
    );
  }


  const uploadUrl =
    initializeData?.value?.uploadUrl;

  const documentUrn =
    initializeData?.value?.document;


  if (
    !uploadUrl ||
    !documentUrn
  ) {

    throw new Error(
      "LinkedIn document upload information is missing."
    );
  }


  /*
   * 3. Upload the PDF binary
   *    to LinkedIn.
   */

  const uploadResponse =
    await fetch(
      uploadUrl,
      {
        method: "PUT",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/pdf",
        },

        body:
          pdfBuffer,
      }
    );


  const uploadText =
    await uploadResponse.text();


  if (!uploadResponse.ok) {

    console.error(
      "LinkedIn document upload failed:",
      uploadResponse.status,
      uploadText
    );

    throw new Error(
      `LinkedIn document upload failed (${uploadResponse.status}).`
    );
  }


  /*
   * 4. Create the LinkedIn
   *    post with the Document.
   */

  const documentTitle =
    getDocumentTitle(mediaFile) ||
    "Document";

  console.log(
    "LinkedIn document commentary:",
    postText
  );  


  const postResponse =
    await fetch(
      "https://api.linkedin.com/rest/posts",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",

          "LinkedIn-Version":
            LINKEDIN_VERSION,

          "X-Restli-Protocol-Version":
            "2.0.0",
        },

        body:
          JSON.stringify({

            author:
              owner,

            commentary:
              escapeLinkedInCommentary(postText),

            visibility:
              "PUBLIC",

            distribution: {

              feedDistribution:
                "MAIN_FEED",

              targetEntities:
                [],

              thirdPartyDistributionChannels:
                [],
            },

            content: {

              media: {

                title:
                  documentTitle,

                id:
                  documentUrn,
              },
            },

            lifecycleState:
              "PUBLISHED",

            isReshareDisabledByAuthor:
              false,
          }),
      }
    );


  const postResponseText =
    await postResponse.text();


  if (!postResponse.ok) {

    console.error(
      "LinkedIn document post failed:",
      postResponse.status,
      postResponseText
    );

    throw new Error(
      `LinkedIn document post failed (${postResponse.status}).`
    );
  }


  return (
    postResponse.headers.get(
      "x-restli-id"
    ) || null
  );
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


    const mediaType =
      typeof req.body?.mediaType === "string"
        ? req.body.mediaType.trim()
        : "None";


    const mediaFile =
      typeof req.body?.mediaFile === "string"
        ? req.body.mediaFile.trim()
        : "";


    if (!postText) {

      return res.status(400).json({
        error:
          "Post Text is required.",
      });
    }


    let postId;


    if (
      mediaType.toLowerCase() ===
      "document"
    ) {

      if (!mediaFile) {

        return res.status(400).json({
          error:
            "Media File is required for Document publishing.",
        });
      }


      postId =
        await publishDocumentPost(
          accessToken,
          memberId,
          postText,
          mediaFile
        );

    } else {

      /*
       * Keep the already-tested
       * Text-only publishing flow.
       */

      postId =
        await publishTextPost(
          accessToken,
          memberId,
          postText
        );
    }


    return res.status(200).json({
      success: true,
      postId,
      mediaType,
    });


  } catch (error) {

    console.error(
      "LinkedIn publish API error:",
      error
    );


    return res.status(500).json({
      error:
        error.message ||
        "LinkedIn publish failed.",
    });

  }

};