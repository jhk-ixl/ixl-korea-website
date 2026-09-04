/* =========================================
   COMMON HTTP REQUEST UTILITIES
   ========================================= */

export function getRequestOrigin(req) {
  const proto =
    req?.headers?.['x-forwarded-proto'] ||
    'https';

  const host =
    req?.headers?.['x-forwarded-host'] ||
    req?.headers?.host;

  if (!host) {
    throw new Error(
      'Request host could not be determined.'
    );
  }

  return `${proto}://${host}`;
}
