import crypto from 'node:crypto';

const TOKEN_ENDPOINT_PERSONAL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const AUTHORIZE_ENDPOINT_PERSONAL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const GRAPH_SCOPE = 'offline_access Files.Read User.Read';

function env(name) {
  return String(process.env[name] || '').trim();
}

export function cleanConnectionId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function readOneDriveConnections() {
  const raw = env('MS_ONEDRIVE_CONNECTIONS_JSON');
  if (!raw) {
    const error = new Error('OneDrive is not configured. Set MS_ONEDRIVE_CONNECTIONS_JSON in Vercel.');
    error.statusCode = 503;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const error = new Error('MS_ONEDRIVE_CONNECTIONS_JSON is not valid JSON.');
    error.statusCode = 503;
    throw error;
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    const error = new Error('MS_ONEDRIVE_CONNECTIONS_JSON must contain at least one connection.');
    error.statusCode = 503;
    throw error;
  }

  const seen = new Set();
  return parsed.map((item, index) => {
    const id = cleanConnectionId(item?.id || item?.connectionId);
    const label = String(item?.label || item?.name || id || `OneDrive ${index + 1}`).trim();
    const authType = String(item?.authType || item?.type || 'personal').trim().toLowerCase();
    const clientId = String(item?.clientId || env('MS_GRAPH_CLIENT_ID') || '').trim();
    const clientSecret = String(item?.clientSecret || env('MS_GRAPH_CLIENT_SECRET') || '').trim();
    const tenantId = String(item?.tenantId || '').trim();
    const driveId = String(item?.driveId || '').trim();
    const userId = String(item?.userId || '').trim();

    if (!id || seen.has(id) || !clientId || !clientSecret) {
      const error = new Error(`Invalid OneDrive connection at index ${index}. Each connection needs a unique id and usable client credentials (connection-specific or MS_GRAPH_CLIENT_ID/MS_GRAPH_CLIENT_SECRET).`);
      error.statusCode = 503;
      throw error;
    }

    if (authType === 'business' && (!tenantId || (!driveId && !userId))) {
      const error = new Error(`Invalid business OneDrive connection at index ${index}. tenantId and either driveId or userId are required.`);
      error.statusCode = 503;
      throw error;
    }

    if (!['personal', 'business'].includes(authType)) {
      const error = new Error(`Unsupported OneDrive authType "${authType}" at index ${index}. Use "personal" or "business".`);
      error.statusCode = 503;
      throw error;
    }

    seen.add(id);
    return { id, label, authType, clientId, clientSecret, tenantId, driveId, userId };
  });
}

export function getOneDriveConnection(connectionId) {
  const id = cleanConnectionId(connectionId);
  if (!id) {
    const error = new Error('storageConnection is required.');
    error.statusCode = 400;
    throw error;
  }
  const connection = readOneDriveConnections().find(item => item.id === id);
  if (!connection) {
    const error = new Error(`Unknown OneDrive storage connection: ${id}`);
    error.statusCode = 404;
    throw error;
  }
  return connection;
}

function parseCookies(req) {
  const raw = String(req?.headers?.cookie || '');
  const result = {};
  raw.split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  });
  return result;
}

function tokenKey() {
  const raw = env('MS_ONEDRIVE_TOKEN_KEY');
  if (!raw || raw.length < 24) {
    const error = new Error('MS_ONEDRIVE_TOKEN_KEY is missing or too short. Use a strong random secret in Vercel.');
    error.statusCode = 503;
    throw error;
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptText(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptText(payload) {
  try {
    const data = Buffer.from(String(payload || ''), 'base64url');
    if (data.length < 29) return '';
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function refreshCookieName(connectionId) {
  return `ixl_od_${cleanConnectionId(connectionId)}`;
}

export function getStoredRefreshToken(req, connectionId) {
  const value = parseCookies(req)[refreshCookieName(connectionId)] || '';
  return value ? decryptText(value) : '';
}

export function setStoredRefreshToken(res, connectionId, refreshToken) {
  const encrypted = encryptText(refreshToken);
  const cookie = `${refreshCookieName(connectionId)}=${encodeURIComponent(encrypted)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=7776000`;
  const current = res.getHeader('Set-Cookie');
  const values = Array.isArray(current) ? current : (current ? [current] : []);
  res.setHeader('Set-Cookie', [...values, cookie]);
}

export function clearStoredRefreshToken(res, connectionId) {
  const cookie = `${refreshCookieName(connectionId)}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  const current = res.getHeader('Set-Cookie');
  const values = Array.isArray(current) ? current : (current ? [current] : []);
  res.setHeader('Set-Cookie', [...values, cookie]);
}

export function isConnectionAuthorized(req, connection) {
  if (connection.authType === 'business') return true;
  return Boolean(getStoredRefreshToken(req, connection.id));
}

export function getConfiguredRedirectUri() {
  const value = env('MS_ONEDRIVE_REDIRECT_URI');
  if (!value) {
    const error = new Error('MS_ONEDRIVE_REDIRECT_URI is not configured in Vercel.');
    error.statusCode = 503;
    throw error;
  }
  return value;
}

function stateSecret() {
  return tokenKey();
}

export function createOAuthState(connectionId, returnPath = '/manager/asset-library.html?mode=upload') {
  const safeReturn = String(returnPath || '').startsWith('/manager/')
    ? String(returnPath)
    : '/manager/asset-library.html?mode=upload';
  const payload = Buffer.from(JSON.stringify({
    connectionId: cleanConnectionId(connectionId),
    returnPath: safeReturn,
    issuedAt: Date.now()
  }), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) throw Object.assign(new Error('Invalid OAuth state.'), { statusCode: 400 });
  const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw Object.assign(new Error('Invalid OAuth state signature.'), { statusCode: 400 });
  }
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!data?.connectionId || !data?.issuedAt || Date.now() - Number(data.issuedAt) > 10 * 60 * 1000) {
    throw Object.assign(new Error('OAuth state has expired.'), { statusCode: 400 });
  }
  if (!String(data.returnPath || '').startsWith('/manager/')) data.returnPath = '/manager/asset-library.html?mode=upload';
  return data;
}

export function buildPersonalAuthorizeUrl(connection, state) {
  if (connection.authType !== 'personal') {
    const error = new Error('OAuth sign-in is only used for personal OneDrive connections.');
    error.statusCode = 400;
    throw error;
  }
  const params = new URLSearchParams({
    client_id: connection.clientId,
    response_type: 'code',
    redirect_uri: getConfiguredRedirectUri(),
    response_mode: 'query',
    scope: GRAPH_SCOPE,
    state,
    prompt: 'select_account'
  });
  return `${AUTHORIZE_ENDPOINT_PERSONAL}?${params}`;
}

async function tokenRequest(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || 'Microsoft OAuth token request failed.');
    error.statusCode = response.status || 502;
    throw error;
  }
  return data;
}

export async function exchangePersonalAuthorizationCode(connection, code) {
  const body = new URLSearchParams({
    client_id: connection.clientId,
    client_secret: connection.clientSecret,
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: getConfiguredRedirectUri(),
    scope: GRAPH_SCOPE
  });
  return tokenRequest(TOKEN_ENDPOINT_PERSONAL, body);
}

async function refreshPersonalAccessToken(connection, req, res) {
  const refreshToken = getStoredRefreshToken(req, connection.id);
  if (!refreshToken) {
    const error = new Error(`OneDrive connection "${connection.label}" is not signed in.`);
    error.statusCode = 401;
    error.code = 'ONEDRIVE_AUTH_REQUIRED';
    throw error;
  }

  const body = new URLSearchParams({
    client_id: connection.clientId,
    client_secret: connection.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: GRAPH_SCOPE
  });
  const data = await tokenRequest(TOKEN_ENDPOINT_PERSONAL, body);
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    setStoredRefreshToken(res, connection.id, data.refresh_token);
  }
  return data.access_token;
}

async function getBusinessAccessToken(connection) {
  const body = new URLSearchParams({
    client_id: connection.clientId,
    client_secret: connection.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const url = `https://login.microsoftonline.com/${encodeURIComponent(connection.tenantId)}/oauth2/v2.0/token`;
  const data = await tokenRequest(url, body);
  return data.access_token;
}

export async function getOneDriveAccessToken(connection, req, res) {
  return connection.authType === 'personal'
    ? refreshPersonalAccessToken(connection, req, res)
    : getBusinessAccessToken(connection);
}

export async function resolveConnectionDriveId(connection, token, graphFetch) {
  if (connection.driveId) return connection.driveId;
  if (connection.authType === 'personal') {
    const response = await graphFetch('/me/drive?$select=id,name,webUrl', token);
    const drive = await response.json();
    if (!drive?.id) throw Object.assign(new Error(`No OneDrive drive could be resolved for ${connection.label}.`), { statusCode: 404 });
    return drive.id;
  }
  const user = encodeURIComponent(connection.userId);
  const response = await graphFetch(`/users/${user}/drive?$select=id,name,webUrl`, token);
  const drive = await response.json();
  if (!drive?.id) throw Object.assign(new Error(`No OneDrive drive could be resolved for ${connection.label}.`), { statusCode: 404 });
  return drive.id;
}
