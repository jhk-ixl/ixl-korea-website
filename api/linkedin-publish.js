import crypto from "crypto";

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

function getProductionMediaUrl(mediaFile) {

  const baseUrl =
    "https://ixl-korea-website.vercel.app/";

  return new URL(
    mediaFile.replace(/^\/+/, ""),
    baseUrl
  ).toString();
}


async function resolveMediaFile(assetKey, mediaFile) {

  const cleanAssetKey =
    String(assetKey || "").trim();

  const fallbackMediaFile =
    String(mediaFile || "").trim();

  if (!cleanAssetKey) {
    return fallbackMediaFile;
  }

  try {

    const registryResponse =
      await fetch(
        "https://ixl-korea-website.vercel.app/insightscontent/asset-registry.json",
        {
          cache: "no-store"
        }
      );

    if (!registryResponse.ok) {
      throw new Error(
        `Asset Registry HTTP ${registryResponse.status}`
      );
    }

    const registryData =
      await registryResponse.json();

    const assets =
      Array.isArray(registryData)
        ? registryData
        : (
            Array.isArray(registryData?.assets)
              ? registryData.assets
              : []
          );

    const asset =
      assets.find(
        (entry) =>
          String(entry?.key || "").trim() ===
          cleanAssetKey
      );

    if (!asset) {
      throw new Error(
        `Asset Key was not found: ${cleanAssetKey}`
      );
    }

    const resolved =
      String(
        asset.url ||
        asset.pathname ||
        ""
      ).trim();

    if (!resolved) {
      throw new Error(
        `Asset URL is missing for key: ${cleanAssetKey}`
      );
    }

    return resolved;

  } catch (error) {

    console.error(
      "Asset Key resolution failed:",
      cleanAssetKey,
      error
    );

    if (fallbackMediaFile) {
      return fallbackMediaFile;
    }

    throw error;
  }
}


function buildPostText(postText, link) {

  const cleanText =
    String(postText || "").trim();

  const cleanLink =
    String(link || "").trim();

  if (!cleanLink) {
    return cleanText;
  }

  if (
    cleanText.includes(cleanLink)
  ) {
    return cleanText;
  }

  return (
    cleanText +
    "\n\n" +
    cleanLink
  );
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

  const pdfUrl =
  getProductionMediaUrl(
    mediaFile
  );


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

async function publishImagePost(
  accessToken,
  memberId,
  postText,
  mediaFile
) {

  const owner =
    `urn:li:person:${memberId}`;

  /*
   * 1. Get image from production website.
   */

  const imageUrl =
    getProductionMediaUrl(
      mediaFile
    );

  const imageResponse =
    await fetch(imageUrl);


  if (!imageResponse.ok) {

    throw new Error(
      `Image download failed (${imageResponse.status}).`
    );
  }


  const contentType =
    (
      imageResponse.headers.get(
        "content-type"
      ) || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();


  const allowedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/gif"
  ];


  if (
    !allowedImageTypes.includes(
      contentType
    )
  ) {

    throw new Error(
      `Unsupported image type: ${contentType || "unknown"}.`
    );
  }


  const imageBuffer =
    Buffer.from(
      await imageResponse.arrayBuffer()
    );


  /*
   * 2. Initialize LinkedIn image upload.
   */

  const initializeResponse =
    await fetch(
      "https://api.linkedin.com/rest/images?action=initializeUpload",
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
            "2.0.0"
        },

        body:
          JSON.stringify({
            initializeUploadRequest: {
              owner
            }
          })
      }
    );


  const initializeText =
    await initializeResponse.text();


  if (!initializeResponse.ok) {

    console.error(
      "LinkedIn image initialize failed:",
      initializeResponse.status,
      initializeText
    );

    throw new Error(
      `LinkedIn image initialization failed (${initializeResponse.status}).`
    );
  }


  let initializeData;


  try {

    initializeData =
      JSON.parse(
        initializeText
      );

  } catch {

    throw new Error(
      "LinkedIn returned an invalid image initialization response."
    );
  }


  const uploadUrl =
    initializeData?.value?.uploadUrl;

  const imageUrn =
    initializeData?.value?.image;


  if (
    !uploadUrl ||
    !imageUrn
  ) {

    throw new Error(
      "LinkedIn image upload information is missing."
    );
  }


  /*
   * 3. Upload image binary.
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
            contentType
        },

        body:
          imageBuffer
      }
    );


  const uploadText =
    await uploadResponse.text();


  if (!uploadResponse.ok) {

    console.error(
      "LinkedIn image upload failed:",
      uploadResponse.status,
      uploadText
    );

    throw new Error(
      `LinkedIn image upload failed (${uploadResponse.status}).`
    );
  }


  /*
   * 4. Create LinkedIn image post.
   */

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
            "2.0.0"
        },

        body:
          JSON.stringify({

            author:
              owner,

            commentary:
              escapeLinkedInCommentary(
                postText
              ),

            visibility:
              "PUBLIC",

            distribution: {

              feedDistribution:
                "MAIN_FEED",

              targetEntities:
                [],

              thirdPartyDistributionChannels:
                []
            },

            content: {

              media: {

                id:
                  imageUrn
              }
            },

            lifecycleState:
              "PUBLISHED",

            isReshareDisabledByAuthor:
              false
          })
      }
    );


  const postResponseText =
    await postResponse.text();


  if (!postResponse.ok) {

    console.error(
      "LinkedIn image post failed:",
      postResponse.status,
      postResponseText
    );

    throw new Error(
      `LinkedIn image post failed (${postResponse.status}).`
    );
  }


  return (
    postResponse.headers.get(
      "x-restli-id"
    ) || null
  );
}

async function publishVideoPost(
  accessToken,
  memberId,
  postText,
  mediaFile
) {

  const owner =
    `urn:li:person:${memberId}`;

  /*
   * 1. Get video from production website.
   */

  const videoUrl =
    getProductionMediaUrl(
      mediaFile
    );

  const videoResponse =
    await fetch(videoUrl);


  if (!videoResponse.ok) {

    throw new Error(
      `Video download failed (${videoResponse.status}).`
    );
  }


  const contentType =
    (
      videoResponse.headers.get(
        "content-type"
      ) || "video/mp4"
    )
      .split(";")[0]
      .trim();


  const videoBuffer =
    Buffer.from(
      await videoResponse.arrayBuffer()
    );


  const fileSizeBytes =
    videoBuffer.length;


  if (!fileSizeBytes) {

    throw new Error(
      "Video file is empty."
    );
  }


  /*
   * 2. Initialize LinkedIn video upload.
   */

  const initializeResponse =
    await fetch(
      "https://api.linkedin.com/rest/videos?action=initializeUpload",
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
            "2.0.0"
        },

        body:
          JSON.stringify({
            initializeUploadRequest: {

              owner,

              fileSizeBytes,

              uploadCaptions:
                false,

              uploadThumbnail:
                false
            }
          })
      }
    );


  const initializeText =
    await initializeResponse.text();


  if (!initializeResponse.ok) {

    console.error(
      "LinkedIn video initialize failed:",
      initializeResponse.status,
      initializeText
    );

    throw new Error(
      `LinkedIn video initialization failed (${initializeResponse.status}).`
    );
  }


  let initializeData;


  try {

    initializeData =
      JSON.parse(
        initializeText
      );

  } catch {

    throw new Error(
      "LinkedIn returned an invalid video initialization response."
    );
  }


  const videoUrn =
    initializeData?.value?.video;

  const uploadToken =
    initializeData?.value?.uploadToken ?? "";

  const uploadInstructions =
    initializeData?.value?.uploadInstructions;


  if (
    !videoUrn ||
    !Array.isArray(uploadInstructions) ||
    !uploadInstructions.length
  ) {

    throw new Error(
      "LinkedIn video upload information is missing."
    );
  }


  /*
   * 3. Upload all video parts.
   */

  const uploadedPartIds = [];


  for (
    const instruction
    of uploadInstructions
  ) {

    const firstByte =
      Number(
        instruction.firstByte
      );

    const lastByte =
      Math.min(
        Number(
          instruction.lastByte
        ),
        videoBuffer.length - 1
      );


    if (
      !instruction.uploadUrl ||
      !Number.isFinite(firstByte) ||
      !Number.isFinite(lastByte) ||
      firstByte < 0 ||
      lastByte < firstByte
    ) {

      throw new Error(
        "LinkedIn returned invalid video upload instructions."
      );
    }


    const videoPart =
      videoBuffer.subarray(
        firstByte,
        lastByte + 1
      );


    const uploadResponse =
      await fetch(
        instruction.uploadUrl,
        {
          method: "PUT",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              contentType
          },

          body:
            videoPart
        }
      );


    const uploadText =
      await uploadResponse.text();


    if (!uploadResponse.ok) {

      console.error(
        "LinkedIn video part upload failed:",
        uploadResponse.status,
        uploadText
      );

      throw new Error(
        `LinkedIn video upload failed (${uploadResponse.status}).`
      );
    }


    const eTag =
      uploadResponse.headers.get(
        "etag"
      );


    if (!eTag) {

      throw new Error(
        "LinkedIn video upload did not return an ETag."
      );
    }


    uploadedPartIds.push(
      eTag.replace(
        /^"|"$/g,
        ""
      )
    );
  }


  /*
   * 4. Finalize LinkedIn video upload.
   */

  const finalizeResponse =
    await fetch(
      "https://api.linkedin.com/rest/videos?action=finalizeUpload",
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
            "2.0.0"
        },

        body:
          JSON.stringify({
            finalizeUploadRequest: {

              video:
                videoUrn,

              uploadToken,

              uploadedPartIds
            }
          })
      }
    );


  const finalizeText =
    await finalizeResponse.text();


  if (!finalizeResponse.ok) {

    console.error(
      "LinkedIn video finalize failed:",
      finalizeResponse.status,
      finalizeText
    );

    throw new Error(
      `LinkedIn video finalization failed (${finalizeResponse.status}).`
    );
  }


  /*
   * 5. Create LinkedIn video post.
   */

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
            "2.0.0"
        },

        body:
          JSON.stringify({

            author:
              owner,

            commentary:
              escapeLinkedInCommentary(
                postText
              ),

            visibility:
              "PUBLIC",

            distribution: {

              feedDistribution:
                "MAIN_FEED",

              targetEntities:
                [],

              thirdPartyDistributionChannels:
                []
            },

            content: {

              media: {

                id:
                  videoUrn
              }
            },

            lifecycleState:
              "PUBLISHED",

            isReshareDisabledByAuthor:
              false
          })
      }
    );


  const postResponseText =
    await postResponse.text();


  if (!postResponse.ok) {

    console.error(
      "LinkedIn video post failed:",
      postResponse.status,
      postResponseText
    );

    throw new Error(
      `LinkedIn video post failed (${postResponse.status}).`
    );
  }


  return (
    postResponse.headers.get(
      "x-restli-id"
    ) || null
  );
}



export default async function handler(req, res) {

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

    const link =
      typeof req.body?.link === "string"
        ? req.body.link.trim()
        : "";

    const mediaType =
      typeof req.body?.mediaType === "string"
        ? req.body.mediaType.trim()
        : "None";


    const mediaFile =
      typeof req.body?.mediaFile === "string"
        ? req.body.mediaFile.trim()
        : "";


    const assetKey =
      typeof req.body?.assetKey === "string"
        ? req.body.assetKey.trim()
        : "";

    const resolvedMediaFile =
      await resolveMediaFile(
        assetKey,
        mediaFile
      );


    if (!postText) {

      return res.status(400).json({
        error:
          "Post Text is required.",
      });
    }

    const finalPostText =
    buildPostText(
      postText,
      link
    );

let postId;


const normalizedMediaType =
  mediaType.toLowerCase();


if (
  normalizedMediaType ===
  "document"
) {

  if (!resolvedMediaFile) {

    return res.status(400).json({
      error:
        "Media File is required for Document publishing."
    });
  }


  postId =
    await publishDocumentPost(
      accessToken,
      memberId,
      finalPostText,
      resolvedMediaFile
    );


} else if (
  normalizedMediaType ===
  "image"
) {

  if (!resolvedMediaFile) {

    return res.status(400).json({
      error:
        "Media File is required for Image publishing."
    });
  }


  postId =
    await publishImagePost(
      accessToken,
      memberId,
      finalPostText,
      resolvedMediaFile
    );


} else if (
  normalizedMediaType ===
  "video"
) {

  if (!resolvedMediaFile) {

    return res.status(400).json({
      error:
        "Media File is required for Video publishing."
    });
  }


  postId =
    await publishVideoPost(
      accessToken,
      memberId,
      finalPostText,
      resolvedMediaFile
    );


} else if (
  normalizedMediaType ===
  "none" ||
  normalizedMediaType ===
  ""
) {

  /*
   * Keep the already-tested
   * Text publishing flow.
   */

  postId =
    await publishTextPost(
      accessToken,
      memberId,
      finalPostText
    );


} else {

  return res.status(400).json({
    error:
      `Unsupported Media Type: ${mediaType}`
  });
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