/*
 * Compatibility facade.
 *
 * Existing APIs can keep importing from:
 *   ../lib/manager-auth-utils.js
 *
 * New code should import from the focused
 * common modules directly.
 */

export {
  getCookies
} from './http/cookies.js';

export {
  safeEqual
} from './security/crypto.js';

export {
  createManagerSession,
  verifyManagerSession,
  getAuthenticatedManager,
  requireManager
} from './manager/auth.js';
