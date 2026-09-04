import {
  getLinkedInSession
} from '../lib/linkedin/session.js';

import {
  buildPostText
} from '../lib/linkedin/content.js';

import {
  publishLinkedInTextPost
} from '../lib/linkedin/client.js';

import {
  publishDocumentPost,
  publishImagePost,
  publishVideoPost
} from '../lib/linkedin/media.js';

export default async function handler(
  req,
  res
) {
  try {
    if (req.method !== 'POST') {
      res.setHeader(
        'Allow',
        'POST'
      );

      return res
        .status(405)
        .json({
          error:
            'Method not allowed.'
        });
    }

    const session =
      getLinkedInSession(req);

    if (!session.connected) {
      return res
        .status(401)
        .json({
          error:
            'LinkedIn is not connected. Please reconnect LinkedIn.'
        });
    }

    const postText =
      typeof req.body?.postText ===
        'string'
        ? req.body.postText.trim()
        : '';

    const legacyLink =
      typeof req.body?.link ===
        'string'
        ? req.body.link.trim()
        : '';

    const detailLink =
      typeof req.body?.detailLink ===
        'string'
        ? req.body.detailLink.trim()
        : '';

    const externalLink =
      typeof req.body?.externalLink ===
        'string'
        ? req.body.externalLink.trim()
        : '';

    const mediaType =
      typeof req.body?.mediaType ===
        'string'
        ? req.body.mediaType.trim()
        : 'None';

    const mediaFile =
      typeof req.body?.mediaFile ===
        'string'
        ? req.body.mediaFile.trim()
        : '';

    if (!postText) {
      return res
        .status(400)
        .json({
          error:
            'Post Text is required.'
        });
    }

    const finalPostText =
      buildPostText(
        postText,
        detailLink,
        externalLink,
        legacyLink
      );

    const normalizedMediaType =
      mediaType.toLowerCase();

    let postId;

    if (
      normalizedMediaType ===
      'document'
    ) {
      if (!mediaFile) {
        return res
          .status(400)
          .json({
            error:
              'Media File is required for Document publishing.'
          });
      }

      postId =
        await publishDocumentPost(
          session.accessToken,
          session.memberId,
          finalPostText,
          mediaFile
        );
    } else if (
      normalizedMediaType ===
      'image'
    ) {
      if (!mediaFile) {
        return res
          .status(400)
          .json({
            error:
              'Media File is required for Image publishing.'
          });
      }

      postId =
        await publishImagePost(
          session.accessToken,
          session.memberId,
          finalPostText,
          mediaFile
        );
    } else if (
      normalizedMediaType ===
      'video'
    ) {
      if (!mediaFile) {
        return res
          .status(400)
          .json({
            error:
              'Media File is required for Video publishing.'
          });
      }

      postId =
        await publishVideoPost(
          session.accessToken,
          session.memberId,
          finalPostText,
          mediaFile
        );
    } else if (
      normalizedMediaType ===
        'none' ||
      normalizedMediaType ===
        ''
    ) {
      postId =
        await publishLinkedInTextPost(
          session.accessToken,
          session.memberId,
          finalPostText
        );
    } else {
      return res
        .status(400)
        .json({
          error:
            `Unsupported Media Type: ${mediaType}`
        });
    }

    return res
      .status(200)
      .json({
        success:
          true,
        postId,
        mediaType
      });
  } catch (error) {
    console.error(
      'LinkedIn publish API error:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error?.message ||
          'LinkedIn publish failed.'
      });
  }
}
