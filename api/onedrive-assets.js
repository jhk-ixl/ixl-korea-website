import { Readable } from 'node:stream';
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


function copyUpstreamHeader(response, res, name) {
  const value = response.headers.get(name);
  if (value) res.setHeader(name, value);
}

async function pipeFetchBody(response, res) {
  if (!response.body) return res.end();
  const stream = Readable.fromWeb(response.body);
  stream.on('error', error => {
    console.error('OneDrive content stream:', error);
    if (!res.headersSent) res.status(502).json({ error: 'OneDrive content stream failed.' });
    else res.destroy(error);
  });
  stream.pipe(res);
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


function isVideoItem(item) {
  if (!item?.file) return false;
  const mimeType = String(item.file?.mimeType || '').toLowerCase();
  const name = String(item.name || '');
  return mimeType.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(name);
}

function buildCaptionTracks(folderItems, videoItem, driveId, storageConnection) {
  if (!videoItem?.name) return [];
  const videoBaseName = getBaseName(videoItem.name);

  return (folderItems || [])
    .filter(item => item?.file && isMatchingCaption(item.name, videoItem.name))
    .map((item, index) => {
      const language = getCaptionLanguage(item.name, videoBaseName);
      return {
        kind: 'subtitles',
        label: language.toUpperCase(),
        srclang: language,
        default: index === 0,
        storageProvider: 'onedrive',
        storageConnection,
        driveId,
        itemId: item.id || '',
        name: item.name || '',
        relativePath: buildRelativePath(item, driveId)
      };
    });
}

function getContentTypeFromName(fileName) {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.vtt')) return 'text/vtt; charset=utf-8';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (name.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return '';
}

function isInlineBrowserType(fileName) {
  return /\.(pdf|vtt|jpe?g|png|gif|webp|svg|mp4|m4v|mov|webm|txt|md)$/i.test(String(fileName || ''));
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
      const folderItems = Array.isArray(data.value) ? data.value : [];
      const items = folderItems.map(item => {
        const normalized = normalizeItem(item, driveId, connection.id);
        if (isVideoItem(item)) {
          normalized.tracks = buildCaptionTracks(folderItems, item, driveId, connection.id);
        }
        return normalized;
      });

      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({
        storageConnection: connection.id,
        connectionLabel: connection.label,
        driveId,
        parentItemId: requestedItemId,
        items
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
      const tracks = buildCaptionTracks(
        Array.isArray(data.value) ? data.value : [],
        { name: videoName },
        driveId,
        connection.id
      );
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
      res.setHeader('X-IXL-Video-Debug-1', 'content-request-received');
      res.setHeader('X-IXL-Video-Debug-Request-Range', String(req.headers?.range || 'NONE'));

      const itemId = String(req.query?.itemId || '').trim();
      if (!itemId) return res.status(400).json({ error: 'itemId is required.' });

      // Stream the file through Microsoft Graph's canonical /content endpoint.
      // Do not depend on @microsoft.graph.downloadUrl being present in driveItem
      // metadata: that instance annotation is short-lived and can be omitted by
      // some OneDrive/Graph contexts. fetch() follows Graph's pre-authenticated
      // redirect server-side, keeping the browser on this stable same-origin URL.
      // Forward Range so native video can load metadata and seek progressively.
      const upstreamHeaders = { Authorization: `Bearer ${token}` };
      const range = String(req.headers?.range || '').trim();
      if (range) upstreamHeaders.Range = range;

      res.setHeader('X-IXL-Video-Debug-2', 'graph-content-request-start');

      const upstream = await fetch(
        `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
        {
          method: 'GET',
          headers: upstreamHeaders,
          redirect: 'follow'
        }
      );

      res.setHeader('X-IXL-Video-Debug-3', `graph-status-${upstream.status}`);
      res.setHeader('X-IXL-Video-Debug-Upstream-Type', upstream.headers.get('content-type') || 'NONE');
      res.setHeader('X-IXL-Video-Debug-Upstream-Length', upstream.headers.get('content-length') || 'NONE');
      res.setHeader('X-IXL-Video-Debug-Upstream-Range', upstream.headers.get('content-range') || 'NONE');
      res.setHeader('X-IXL-Video-Debug-Upstream-Accept-Ranges', upstream.headers.get('accept-ranges') || 'NONE');

      if (!upstream.ok && upstream.status !== 206) {
        const error = new Error(`OneDrive content request failed (${upstream.status}).`);
        error.statusCode = upstream.status;
        throw error;
      }

      res.status(upstream.status);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');

      copyUpstreamHeader(upstream, res, 'content-length');
      copyUpstreamHeader(upstream, res, 'content-range');
      copyUpstreamHeader(upstream, res, 'etag');
      copyUpstreamHeader(upstream, res, 'last-modified');

      const requestedName = String(req.query?.name || '').trim();
      const namedContentType = getContentTypeFromName(requestedName);
      let contentType = namedContentType || upstream.headers.get('content-type') || '';
      if (contentType) res.setHeader('Content-Type', contentType);

      res.setHeader('X-IXL-Video-Debug-4', 'stream-pipe-start');
      res.setHeader('X-IXL-Video-Debug-Final-Type', String(res.getHeader('Content-Type') || 'NONE'));
      res.setHeader('X-IXL-Video-Debug-Final-Status', String(res.statusCode || 'NONE'));

      return pipeFetchBody(upstream, res);
    }

    if (action === 'thumbnail') {
      const itemId = String(req.query?.itemId || '').trim();
      if (!itemId) return res.status(400).json({ error: 'itemId is required.' });

      // Keep thumbnails behind the same-origin IXL Korea endpoint. The Microsoft
      // thumbnail URL is temporary and should never become a client-side source of truth.
      const response = await graph(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/thumbnails`, token);
      const data = await response.json();
      const set = data.value?.[0] || {};
      const thumbnailUrl = set.large?.url || set.medium?.url || set.small?.url || '';
      if (!thumbnailUrl) return res.status(404).json({ error: 'OneDrive thumbnail is unavailable.' });

      const upstream = await fetch(thumbnailUrl, { redirect: 'follow' });
      if (!upstream.ok) {
        return res.status(upstream.status || 502).json({ error: 'OneDrive thumbnail could not be loaded.' });
      }

      res.status(upstream.status || 200);
      copyUpstreamHeader(upstream, res, 'content-type');
      copyUpstreamHeader(upstream, res, 'content-length');
      copyUpstreamHeader(upstream, res, 'etag');
      res.setHeader('Cache-Control', 'private, max-age=300');
      return pipeFetchBody(upstream, res);
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
