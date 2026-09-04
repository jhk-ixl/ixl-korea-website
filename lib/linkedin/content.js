/* =========================================
   LINKEDIN CONTENT UTILITIES
   ========================================= */

export function escapeLinkedInCommentary(
  text
) {
  return String(text || '').replace(
    /([\\{}@\[\]()<>#*_~])/g,
    '\\$1'
  );
}

export function getDocumentTitle(
  mediaFile
) {
  const fileName =
    String(mediaFile || '')
      .split('/')
      .pop()
      .split('?')[0];

  try {
    return decodeURIComponent(fileName)
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  } catch {
    return fileName
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  }
}

function normalizeComparableUrl(
  value
) {
  const clean =
    String(value || '').trim();

  if (!clean) {
    return '';
  }

  try {
    const url =
      new URL(clean);

    url.hash = '';

    if (
      url.pathname.length > 1 &&
      url.pathname.endsWith('/')
    ) {
      url.pathname =
        url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return clean;
  }
}

export function buildPostText(
  postText,
  detailLink,
  externalLink,
  legacyLink = ''
) {
  const cleanText =
    String(postText || '').trim();

  const cleanDetailLink =
    String(
      detailLink ||
      legacyLink ||
      ''
    ).trim();

  const cleanExternalLink =
    String(
      externalLink || ''
    ).trim();

  const detailKey =
    normalizeComparableUrl(
      cleanDetailLink
    );

  const externalKey =
    normalizeComparableUrl(
      cleanExternalLink
    );

  const parts = [cleanText];

  if (
    cleanDetailLink &&
    !cleanText.includes(
      cleanDetailLink
    )
  ) {
    parts.push(
      cleanDetailLink
    );
  }

  if (
    cleanExternalLink &&
    externalKey !== detailKey &&
    !cleanText.includes(
      cleanExternalLink
    )
  ) {
    parts.push(
      cleanExternalLink
    );
  }

  return parts
    .filter(Boolean)
    .join('\n\n');
}
