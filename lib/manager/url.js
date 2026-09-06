/* =========================================
   IXL KOREA
   MANAGER URL UTILITIES
   ========================================= */

const ALLOWED_MANAGER_ORIGINS = new Set([
  'https://ixlkorea.co.kr',
  'https://ixl-korea-website.vercel.app'
]);

function getRequestOrigin(req) {
  const forwardedProto =
    String(
      req.headers['x-forwarded-proto'] || ''
    )
      .split(',')[0]
      .trim();

  const forwardedHost =
    String(
      req.headers['x-forwarded-host'] || ''
    )
      .split(',')[0]
      .trim();

  const protocol =
    forwardedProto || 'https';

  const host =
    forwardedHost ||
    String(req.headers.host || '').trim();

  const origin =
    `${protocol}://${host}`;

  if (!ALLOWED_MANAGER_ORIGINS.has(origin)) {
    throw new Error(
      `Unsupported Manager origin: ${origin}`
    );
  }

  return origin;
}

export function getManagerCallbackUrl(
  req
) {
  return (
    getRequestOrigin(req) +
    '/api/manager-callback'
  );
}