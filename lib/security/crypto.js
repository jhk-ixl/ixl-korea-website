import crypto from 'crypto';

/* =========================================
   COMMON SECURITY UTILITIES
   ========================================= */

export function safeEqual(a, b) {
  const bufferA =
    Buffer.from(String(a ?? ''));

  const bufferB =
    Buffer.from(String(b ?? ''));

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    bufferA,
    bufferB
  );
}

export function randomHex(bytes = 24) {
  return crypto
    .randomBytes(bytes)
    .toString('hex');
}
