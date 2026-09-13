import { requireManager } from '../lib/manager-auth-utils.js';
import {
  buildPersonalAuthorizeUrl,
  cleanConnectionId,
  createOAuthState,
  exchangePersonalAuthorizationCode,
  getOneDriveAccessToken,
  getOneDriveConnection,
  isConnectionAuthorized,
  readOneDriveConnections,
  resolveConnectionDriveId,
  setStoredRefreshToken,
  verifyOAuthState
} from '../lib/onedrive-auth.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

function appendOAuthStatus(returnPath, status, message = '') {
  const url = new URL(returnPath, 'https://ixlkorea.local');
  url.searchParams.set('onedrive', status);
  if (message) url.searchParams.set('onedriveMessage', message.slice(0, 180));
  return `${url.pathname}${url.search}`;
}

function publicConnection(req, connection) {
  return {
    id: connection.id,
    label: connection.label,
    authType: connection.authType,
    connected: isConnectionAuthorized(req, connection)
  };
}

async function graph(path, token, options = {}) {
  const response = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    redirect: options.redirect || 'follow'
  });

  if (!response.ok) {
    let message = `Microsoft Graph request failed (${response.status}).`;
    try {
      const data = await response.json();
      message = data?.error?.message || message;
    } catch {}
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return response;
}

function stripGraphRootPath(parentPath, driveId) {
  let value = String(parentPath || '').replace(/\\/g, '/');
  const markers = [
    `/drives/${driveId}/root:`,
    '/drive/root:',
    `/drives/${driveId}/root`,
    '/drive/root'
  ];

  for (const marker of markers) {
    const index = value.toLowerCase().indexOf(marker.toLowerCase());
    if (index >= 0) {
      value = value.slice(index + marker.length);
      break;
    }
  }

  return value.replace(/^\/+|\/+$/g, '');
}

function buildRelativePath(item, driveId) {
  const parent = stripGraphRootPath(item?.parentReference?.path, driveId);
  const name = String(item?.name || '').replace(/^\/+|\/+$/g, '');
  return `/${[parent, name].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
}

function normalizeItem(item, driveId, storageConnection) {
  return {
    id: item.id || '',
    driveId: driveId || '',
    storageConnection: storageConnection || '',
    name: item.name || '',
    size: Number(item.size || 0),
    webUrl: item.webUrl || '',
    mimeType: item.file?.mimeType || '',
    isFolder: Boolean(item.folder),
    childCount: Number(item.folder?.childCount || 0),
    parentId: item.parentReference?.id || '',
    parentPath: item.parentReference?.path || '',
    relativePath: buildRelativePath(item, driveId),
    lastModifiedDateTime: item.lastModifiedDateTime || ''
  };
}

function getBaseName(value) {
  const name = String(value || '').trim();
  return name.replace(/\.[^.]+$/, '');
}

function getCaptionLanguage(fileName, videoBaseName) {
  const stem = getBaseName(fileName);
  const suffix = stem.slice(videoBaseName.length).replace(/^[._-]+/, '').toLowerCase();
  const map = { en: 'en', eng: 'en', english: 'en', ko: 'ko', kor: 'ko', korean: 'ko', kr: 'ko', ja: 'ja', jp: 'ja', japanese: 'ja', zh: 'zh', cn: 'zh', chinese: 'zh' };
  return map[suffix] || suffix || 'en';
}

function isMatchingCaption(fileName, videoName) {
  if (!/\.vtt$/i.test(String(fileName || ''))) return false;
  const videoBase = getBaseName(videoName).toLowerCase();
  const captionBase = getBaseName(fileName).toLowerCase();
  return captionBase === videoBase || captionBase.startsWith(`${videoBase}.`) || captionBase.startsWith(`${videoBase}-`) || captionBase.startsWith(`${videoBase}_`);
}

async function getContext(connectionId, req, res) {
  const connection = getOneDriveConnection(connectionId);
  const token = await getOneDriveAccessToken(connection, req, res);
  const driveId = await resolveConnectionDriveId(connection, token, graph);
  return { connection, token, driveId };
}

function requireDriveMatch(requestedDriveId, configuredDriveId) {
  if (requestedDriveId && requestedDriveId !== configuredDriveId) {
    const error = new Error('The requested driveId does not belong to the selected storageConnection.');
    error.statusCode = 403;
    throw error;
  }
}

function encodePath(relativePath) {
  const normalized = String(relativePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return '';
  return normalized.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function handleOAuthStart(req, res) {
  const connectionId = String(req.query?.connection || '').trim();
  const returnPath = String(req.query?.return || '/manager/asset-library.html?mode=upload').trim();
  const connection = getOneDriveConnection(connectionId);
  const state = createOAuthState(connection.id, returnPath);
  return res.redirect(302, buildPersonalAuthorizeUrl(connection, state));
}

async function handleOAuthCallback(req, res) {
  const providerError = String(req.query?.error || '').trim();
  const providerDescription = String(req.query?.error_description || '').trim();
  const state = verifyOAuthState(req.query?.state);
  const connection = getOneDriveConnection(state.connectionId);

  if (providerError) {
    return res.redirect(302, appendOAuthStatus(state.returnPath, 'error', providerDescription || providerError));
  }

  const code = String(req.query?.code || '').trim();
  if (!code) {
    return res.redirect(302, appendOAuthStatus(state.returnPath, 'error', 'Microsoft did not return an authorization code.'));
  }

  const token = await exchangePersonalAuthorizationCode(connection, code);
  if (!token.refresh_token) {
    return res.redirect(302, appendOAuthStatus(state.returnPath, 'error', 'Microsoft did not return a refresh token. Reconnect and consent again.'));
  }

  setStoredRefreshToken(res, connection.id, token.refresh_token);
  return res.redirect(302, appendOAuthStatus(state.returnPath, 'connected'));
}

export default async function handler(req, res) {
  try {
    await requireManager(req, res);
    if (res.headersSent) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

    const action = String(req.query?.action || 'connections').toLowerCase();

    if (action === 'auth') return handleOAuthStart(req, res);
    if (action === 'callback') return handleOAuthCallback(req, res);

    if (action === 'connections') {
      const connections = readOneDriveConnections().map(connection => publicConnection(req, connection));
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ connections });
    }

    const storageConnection = cleanConnectionId(req.query?.connection || req.query?.storageConnection);
    const { connection, token, driveId } = await getContext(storageConnection, req, res);
    requireDriveMatch(String(req.query?.driveId || '').trim(), driveId);

    if (action === 'children') {
      const requestedItemId = String(req.query?.itemId || '').trim();
      const endpoint = requestedItemId
        ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(requestedItemId)}/children?$select=id,name,size,webUrl,file,folder,parentReference,lastModifiedDateTime&$top=200`
        : `/drives/${encodeURIComponent(driveId)}/root/children?$select=id,name,size,webUrl,file,folder,parentReference,lastModifiedDateTime&$top=200`;
      const response = await graph(endpoint, token);
      const data = await response.json();
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({
        storageConnection: connection.id,
        connectionLabel: connection.label,
        driveId,
        parentItemId: requestedItemId,
        items: (data.value || []).map(item => normalizeItem(item, driveId, connection.id))
      });
    }

    if (action === 'captions') {
      const itemId = String(req.query?.itemId || '').trim();
      let parentItemId = String(req.query?.parentItemId || '').trim();
      let videoName = String(req.query?.videoName || '').trim();

      if ((!parentItemId || !videoName) && itemId) {
        const itemResponse = await graph(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,parentReference`, token);
        const item = await itemResponse.json();
        parentItemId = parentItemId || item.parentReference?.id || '';
        videoName = videoName || item.name || '';
      }

      if (!parentItemId || !videoName) return res.status(400).json({ error: 'parentItemId and videoName are required for caption lookup.' });

      const response = await graph(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children?$select=id,name,size,webUrl,file,parentReference,lastModifiedDateTime&$top=200`, token);
      const data = await response.json();
      const videoBaseName = getBaseName(videoName);
      const tracks = (data.value || []).filter(item => item.file && isMatchingCaption(item.name, videoName)).map((item, index) => ({
        kind: 'subtitles',
        label: getCaptionLanguage(item.name, videoBaseName).toUpperCase(),
        srclang: getCaptionLanguage(item.name, videoBaseName),
        default: index === 0,
        storageProvider: 'onedrive',
        storageConnection: connection.id,
        driveId,
        itemId: item.id || '',
        name: item.name || '',
        relativePath: buildRelativePath(item, driveId)
      }));
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ tracks });
    }

    if (action === 'item' || action === 'resolve') {
      const itemId = String(req.query?.itemId || '').trim();
      if (!itemId) return res.status(400).json({ error: 'itemId is required.' });
      const response = await graph(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,size,webUrl,file,folder,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl`, token);
      const item = await response.json();
      const result = normalizeItem(item, driveId, connection.id);
      result.downloadUrl = item['@microsoft.graph.downloadUrl'] || '';
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(result);
    }

    if (action === 'resolve-path') {
      const relativePath = String(req.query?.relativePath || '').trim();
      const encoded = encodePath(relativePath);
      if (!encoded) return res.status(400).json({ error: 'relativePath is required.' });
      const response = await graph(`/drives/${encodeURIComponent(driveId)}/root:/${encoded}?$select=id,name,size,webUrl,file,folder,parentReference,lastModifiedDateTime`, token);
      const item = await response.json();
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(normalizeItem(item, driveId, connection.id));
    }

    if (action === 'content') {
      const itemId = String(req.query?.itemId || '').trim();
      if (!itemId) return res.status(400).json({ error: 'itemId is required.' });
      const response = await graph(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,@microsoft.graph.downloadUrl`, token);
      const item = await response.json();
      const url = item['@microsoft.graph.downloadUrl'] || '';
      if (!url) return res.status(404).json({ error: 'OneDrive content URL is unavailable.' });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.redirect(302, url);
    }

    if (action === 'thumbnail') {
      const itemId = String(req.query?.itemId || '').trim();
      if (!itemId) return res.status(400).json({ error: 'itemId is required.' });
      const response = await graph(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/thumbnails?$select=large,medium,small`, token);
      const data = await response.json();
      const set = data.value?.[0] || {};
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ url: set.large?.url || set.medium?.url || set.small?.url || '' });
    }

    return res.status(400).json({ error: 'Invalid OneDrive action.' });
  } catch (error) {
    console.error('OneDrive API:', error);

    const action = String(req.query?.action || '').toLowerCase();
    if (action === 'callback') {
      return res.status(error.statusCode || 500).send(`OneDrive connection failed: ${String(error.message || 'Unknown error')}`);
    }

    const payload = { error: error.message || 'OneDrive request failed.' };
    if (error.code === 'ONEDRIVE_AUTH_REQUIRED') payload.code = error.code;
    return res.status(error.statusCode || 500).json(payload);
  }
}
