import { requireManager } from '../lib/manager-auth-utils.js';
import {
  buildPersonalAuthorizeUrl,
  createOAuthState,
  getOneDriveConnection
} from '../lib/onedrive-auth.js';

export default async function handler(req, res) {
  try {
    await requireManager(req, res);
    if (res.headersSent) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

    const connectionId = String(req.query?.connection || '').trim();
    const returnPath = String(req.query?.return || '/manager/asset-library.html?mode=upload').trim();
    const connection = getOneDriveConnection(connectionId);
    const state = createOAuthState(connection.id, returnPath);
    return res.redirect(302, buildPersonalAuthorizeUrl(connection, state));
  } catch (error) {
    console.error('OneDrive auth start:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'OneDrive sign-in could not be started.' });
  }
}
