import { requireManager } from '../lib/manager-auth-utils.js';
import {
  exchangePersonalAuthorizationCode,
  getOneDriveConnection,
  setStoredRefreshToken,
  verifyOAuthState
} from '../lib/onedrive-auth.js';

function appendStatus(returnPath, status, message = '') {
  const url = new URL(returnPath, 'https://ixlkorea.local');
  url.searchParams.set('onedrive', status);
  if (message) url.searchParams.set('onedriveMessage', message.slice(0, 180));
  return `${url.pathname}${url.search}`;
}

export default async function handler(req, res) {
  try {
    await requireManager(req, res);
    if (res.headersSent) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

    const providerError = String(req.query?.error || '').trim();
    const providerDescription = String(req.query?.error_description || '').trim();
    const state = verifyOAuthState(req.query?.state);
    const connection = getOneDriveConnection(state.connectionId);

    if (providerError) {
      return res.redirect(302, appendStatus(state.returnPath, 'error', providerDescription || providerError));
    }

    const code = String(req.query?.code || '').trim();
    if (!code) return res.redirect(302, appendStatus(state.returnPath, 'error', 'Microsoft did not return an authorization code.'));

    const token = await exchangePersonalAuthorizationCode(connection, code);
    if (!token.refresh_token) {
      return res.redirect(302, appendStatus(state.returnPath, 'error', 'Microsoft did not return a refresh token. Reconnect and consent again.'));
    }

    setStoredRefreshToken(res, connection.id, token.refresh_token);
    return res.redirect(302, appendStatus(state.returnPath, 'connected'));
  } catch (error) {
    console.error('OneDrive OAuth callback:', error);
    return res.status(error.statusCode || 500).send(`OneDrive connection failed: ${String(error.message || 'Unknown error')}`);
  }
}
