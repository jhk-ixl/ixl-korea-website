import crypto from 'crypto';

import {
  getCookies
} from '../http/cookies.js';

/* =========================================
   LINKEDIN ENCRYPTED COOKIE SESSION
   ========================================= */

function getEncryptionKey() {
  const secret =
    process.env.MANAGER_SESSION_SECRET;

  if (!secret) {
    throw new Error(
      'MANAGER_SESSION_SECRET is not configured.'
    );
  }

  return crypto
    .createHash('sha256')
    .update(secret)
    .digest();
}

export function encryptLinkedInValue(
  value
) {
  const key =
    getEncryptionKey();

  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      'aes-256-gcm',
      key,
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        String(value),
        'utf8'
      ),
      cipher.final()
    ]);

  const tag =
    cipher.getAuthTag();

  return Buffer
    .concat([
      iv,
      tag,
      encrypted
    ])
    .toString('base64url');
}

export function decryptLinkedInValue(
  value
) {
  const key =
    getEncryptionKey();

  const buffer =
    Buffer.from(
      String(value || ''),
      'base64url'
    );

  if (buffer.length < 29) {
    throw new Error(
      'LinkedIn encrypted session value is invalid.'
    );
  }

  const iv =
    buffer.subarray(0, 12);

  const tag =
    buffer.subarray(12, 28);

  const encrypted =
    buffer.subarray(28);

  const decipher =
    crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      iv
    );

  decipher.setAuthTag(tag);

  return Buffer
    .concat([
      decipher.update(encrypted),
      decipher.final()
    ])
    .toString('utf8');
}

export function getLinkedInSession(
  req
) {
  const cookies =
    getCookies(req);

  const encryptedAccessToken =
    cookies.linkedin_access_token;

  const encryptedMemberId =
    cookies.linkedin_member_id;

  const expiresAtRaw =
    cookies.linkedin_token_expires_at;

  if (
    !encryptedAccessToken ||
    !encryptedMemberId ||
    !expiresAtRaw
  ) {
    return {
      connected: false,
      status: 'disconnected'
    };
  }

  const expiresAt =
    Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt)) {
    return {
      connected: false,
      status: 'invalid'
    };
  }

  let accessToken;
  let memberId;

  try {
    accessToken =
      decryptLinkedInValue(
        encryptedAccessToken
      );

    memberId =
      decryptLinkedInValue(
        encryptedMemberId
      );
  } catch {
    return {
      connected: false,
      status: 'invalid'
    };
  }

  const remainingMs =
    expiresAt - Date.now();

  if (remainingMs <= 0) {
    return {
      connected: false,
      status: 'expired',
      expiresAt,
      daysRemaining: 0
    };
  }

  const daysRemaining =
    Math.ceil(
      remainingMs /
      (1000 * 60 * 60 * 24)
    );

  let status =
    'connected';

  if (daysRemaining <= 7) {
    status = 'critical';
  } else if (daysRemaining <= 14) {
    status = 'warning';
  }

  return {
    connected: true,
    status,
    accessToken,
    memberId,
    expiresAt,
    daysRemaining
  };
}
