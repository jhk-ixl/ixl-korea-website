/* =========================================
   COMMON HTTP COOKIE UTILITIES
   ========================================= */

export function parseCookies(cookieHeader = '') {
  const cookies = {};

  String(cookieHeader || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');

      if (index === -1) {
        return;
      }

      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();

      if (!key) {
        return;
      }

      try {
        cookies[decodeURIComponent(key)] =
          decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    });

  return cookies;
}

export function getCookies(req) {
  return parseCookies(
    req?.headers?.cookie || ''
  );
}

export function serializeCookie(
  name,
  value,
  options = {}
) {
  const {
    path = '/',
    httpOnly = true,
    secure = true,
    sameSite = 'Lax',
    maxAge,
    domain
  } = options;

  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(String(value ?? ''))}`
  ];

  if (path) {
    parts.push(`Path=${path}`);
  }

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  if (httpOnly) {
    parts.push('HttpOnly');
  }

  if (secure) {
    parts.push('Secure');
  }

  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  if (Number.isFinite(Number(maxAge))) {
    parts.push(`Max-Age=${Math.trunc(Number(maxAge))}`);
  }

  return parts.join('; ');
}

export function clearCookie(
  name,
  options = {}
) {
  return serializeCookie(
    name,
    '',
    {
      ...options,
      maxAge: 0
    }
  );
}
