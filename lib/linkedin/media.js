import {
  PUBLIC_SITE_BASE_URL
} from './config.js';

import {
  getLinkedInRestHeaders
} from './client.js';

import {
  escapeLinkedInCommentary,
  getDocumentTitle
} from './content.js';

/* =========================================
   LINKEDIN MEDIA PUBLISHING
   ========================================= */

export function getProductionMediaUrl(
  mediaFile
) {
  const clean =
    String(mediaFile || '').trim();

  if (!clean) {
    throw new Error(
      'Media File is required.'
    );
  }

  try {
    const absolute =
      new URL(clean);

    if (
      absolute.protocol === 'http:' ||
      absolute.protocol === 'https:'
    ) {
      return absolute.toString();
    }
  } catch {
    // Relative media path: continue below.
  }

  return new URL(
    clean.replace(/^\/+/, ''),
    PUBLIC_SITE_BASE_URL
  ).toString();
}

async function fetchMedia(
  mediaFile
) {
  const mediaUrl =
    getProductionMediaUrl(
      mediaFile
    );

  const response =
    await fetch(mediaUrl);

  if (!response.ok) {
    throw new Error(
      `Media download failed (${response.status}).`
    );
  }

  return {
    response,
    mediaUrl
  };
}

export async function publishDocumentPost(
  accessToken,
  memberId,
  postText,
  mediaFile
) {
  const owner =
    `urn:li:person:${memberId}`;

  const {
    response: pdfResponse
  } =
    await fetchMedia(mediaFile);

  const contentType =
    pdfResponse.headers.get(
      'content-type'
    ) || '';

  if (
    !contentType
      .toLowerCase()
      .includes('application/pdf')
  ) {
    throw new Error(
      'Media File is not a PDF.'
    );
  }

  const pdfBuffer =
    Buffer.from(
      await pdfResponse.arrayBuffer()
    );

  const initializeResponse =
    await fetch(
      'https://api.linkedin.com/rest/documents?action=initializeUpload',
      {
        method: 'POST',
        headers:
          getLinkedInRestHeaders(
            accessToken,
            {
              'Content-Type':
                'application/json'
            }
          ),
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
      'LinkedIn document initialize failed:',
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
      JSON.parse(
        initializeText
      );
  } catch {
    throw new Error(
      'LinkedIn returned an invalid document initialization response.'
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
      'LinkedIn document upload information is missing.'
    );
  }

  const uploadResponse =
    await fetch(
      uploadUrl,
      {
        method: 'PUT',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/pdf'
        },
        body:
          pdfBuffer
      }
    );

  const uploadText =
    await uploadResponse.text();

  if (!uploadResponse.ok) {
    console.error(
      'LinkedIn document upload failed:',
      uploadResponse.status,
      uploadText
    );

    throw new Error(
      `LinkedIn document upload failed (${uploadResponse.status}).`
    );
  }

  const documentTitle =
    getDocumentTitle(
      mediaFile
    ) || 'Document';

  const postResponse =
    await fetch(
      'https://api.linkedin.com/rest/posts',
      {
        method: 'POST',
        headers:
          getLinkedInRestHeaders(
            accessToken,
            {
              'Content-Type':
                'application/json'
            }
          ),
        body:
          JSON.stringify({
            author:
              owner,
            commentary:
              escapeLinkedInCommentary(
                postText
              ),
            visibility:
              'PUBLIC',
            distribution: {
              feedDistribution:
                'MAIN_FEED',
              targetEntities:
                [],
              thirdPartyDistributionChannels:
                []
            },
            content: {
              media: {
                title:
                  documentTitle,
                id:
                  documentUrn
              }
            },
            lifecycleState:
              'PUBLISHED',
            isReshareDisabledByAuthor:
              false
          })
      }
    );

  const postResponseText =
    await postResponse.text();

  if (!postResponse.ok) {
    console.error(
      'LinkedIn document post failed:',
      postResponse.status,
      postResponseText
    );

    throw new Error(
      `LinkedIn document post failed (${postResponse.status}).`
    );
  }

  return (
    postResponse.headers.get(
      'x-restli-id'
    ) || null
  );
}

export async function publishImagePost(
  accessToken,
  memberId,
  postText,
  mediaFile
) {
  const owner =
    `urn:li:person:${memberId}`;

  const {
    response: imageResponse
  } =
    await fetchMedia(mediaFile);

  const contentType =
    (
      imageResponse.headers.get(
        'content-type'
      ) || ''
    )
      .split(';')[0]
      .trim()
      .toLowerCase();

  const allowedImageTypes = [
    'image/jpeg',
    'image/png',
    'image/gif'
  ];

  if (
    !allowedImageTypes.includes(
      contentType
    )
  ) {
    throw new Error(
      `Unsupported image type: ${contentType || 'unknown'}.`
    );
  }

  const imageBuffer =
    Buffer.from(
      await imageResponse.arrayBuffer()
    );

  const initializeResponse =
    await fetch(
      'https://api.linkedin.com/rest/images?action=initializeUpload',
      {
        method: 'POST',
        headers:
          getLinkedInRestHeaders(
            accessToken,
            {
              'Content-Type':
                'application/json'
            }
          ),
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
      'LinkedIn image initialize failed:',
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
      'LinkedIn returned an invalid image initialization response.'
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
      'LinkedIn image upload information is missing.'
    );
  }

  const uploadResponse =
    await fetch(
      uploadUrl,
      {
        method: 'PUT',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
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
      'LinkedIn image upload failed:',
      uploadResponse.status,
      uploadText
    );

    throw new Error(
      `LinkedIn image upload failed (${uploadResponse.status}).`
    );
  }

  const postResponse =
    await fetch(
      'https://api.linkedin.com/rest/posts',
      {
        method: 'POST',
        headers:
          getLinkedInRestHeaders(
            accessToken,
            {
              'Content-Type':
                'application/json'
            }
          ),
        body:
          JSON.stringify({
            author:
              owner,
            commentary:
              escapeLinkedInCommentary(
                postText
              ),
            visibility:
              'PUBLIC',
            distribution: {
              feedDistribution:
                'MAIN_FEED',
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
              'PUBLISHED',
            isReshareDisabledByAuthor:
              false
          })
      }
    );

  const postResponseText =
    await postResponse.text();

  if (!postResponse.ok) {
    console.error(
      'LinkedIn image post failed:',
      postResponse.status,
      postResponseText
    );

    throw new Error(
      `LinkedIn image post failed (${postResponse.status}).`
    );
  }

  return (
    postResponse.headers.get(
      'x-restli-id'
    ) || null
  );
}

export async function publishVideoPost(
  accessToken,
  memberId,
  postText,
  mediaFile
) {
  const owner =
    `urn:li:person:${memberId}`;

  const {
    response: videoResponse
  } =
    await fetchMedia(mediaFile);

  const contentType =
    (
      videoResponse.headers.get(
        'content-type'
      ) || 'video/mp4'
    )
      .split(';')[0]
      .trim();

  const videoBuffer =
    Buffer.from(
      await videoResponse.arrayBuffer()
    );

  const fileSizeBytes =
    videoBuffer.length;

  if (!fileSizeBytes) {
    throw new Error(
      'Video file is empty.'
    );
  }

  const initializeResponse =
    await fetch(
      'https://api.linkedin.com/rest/videos?action=initializeUpload',
      {
        method: 'POST',
        headers:
          getLinkedInRestHeaders(
            accessToken,
            {
              'Content-Type':
                'application/json'
            }
          ),
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
      'LinkedIn video initialize failed:',
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
      'LinkedIn returned an invalid video initialization response.'
    );
  }

  const videoUrn =
    initializeData?.value?.video;

  const uploadToken =
    initializeData?.value?.uploadToken ??
    '';

  const uploadInstructions =
    initializeData?.value?.uploadInstructions;

  if (
    !videoUrn ||
    !Array.isArray(
      uploadInstructions
    ) ||
    !uploadInstructions.length
  ) {
    throw new Error(
      'LinkedIn video upload information is missing.'
    );
  }

  const uploadedPartIds =
    [];

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
        'LinkedIn returned invalid video upload instructions.'
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
          method: 'PUT',
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
            'Content-Type':
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
        'LinkedIn video part upload failed:',
        uploadResponse.status,
        uploadText
      );

      throw new Error(
        `LinkedIn video upload failed (${uploadResponse.status}).`
      );
    }

    const eTag =
      uploadResponse.headers.get(
        'etag'
      );

    if (!eTag) {
      throw new Error(
        'LinkedIn video upload did not return an ETag.'
      );
    }

    uploadedPartIds.push(
      eTag.replace(
        /^"|"$/g,
        ''
      )
    );
  }

  const finalizeResponse =
    await fetch(
      'https://api.linkedin.com/rest/videos?action=finalizeUpload',
      {
        method: 'POST',
        headers:
          getLinkedInRestHeaders(
            accessToken,
            {
              'Content-Type':
                'application/json'
            }
          ),
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
      'LinkedIn video finalize failed:',
      finalizeResponse.status,
      finalizeText
    );

    throw new Error(
      `LinkedIn video finalization failed (${finalizeResponse.status}).`
    );
  }

  const postResponse =
    await fetch(
      'https://api.linkedin.com/rest/posts',
      {
        method: 'POST',
        headers:
          getLinkedInRestHeaders(
            accessToken,
            {
              'Content-Type':
                'application/json'
            }
          ),
        body:
          JSON.stringify({
            author:
              owner,
            commentary:
              escapeLinkedInCommentary(
                postText
              ),
            visibility:
              'PUBLIC',
            distribution: {
              feedDistribution:
                'MAIN_FEED',
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
              'PUBLISHED',
            isReshareDisabledByAuthor:
              false
          })
      }
    );

  const postResponseText =
    await postResponse.text();

  if (!postResponse.ok) {
    console.error(
      'LinkedIn video post failed:',
      postResponse.status,
      postResponseText
    );

    throw new Error(
      `LinkedIn video post failed (${postResponse.status}).`
    );
  }

  return (
    postResponse.headers.get(
      'x-restli-id'
    ) || null
  );
}
