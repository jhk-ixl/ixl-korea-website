(() => {
  'use strict';

  const API_LIBRARY = '/api/insights-library';
  const API_UPLOAD = '/api/insights-upload';
  const API_ONEDRIVE = '/api/onedrive-assets';
  const DEFAULT_VIDEO_THUMBNAIL_TIME = 1;

  let allAssets = [];
  let registryAssets = [];
  let usageMappings = [];
  let uploadObjectUrl = '';
  let selectedOneDriveItem = null;
  let oneDriveConnections = [];
  let oneDriveConnectionId = '';
  let oneDriveConnectionLabel = '';
  let oneDriveDriveId = '';
  let oneDriveStack = [];
  let assetSorter = null;
  let usageSorter = null;

  const $ = id => document.getElementById(id);

  function setAssetDetailActive(active) {
    document
      .querySelector('main.asset-manager')
      ?.classList.toggle(
        'detail-active',
        Boolean(active)
      );
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function getFileName(pathname) {
    const parts = String(pathname || '').split('/');
    return parts[parts.length - 1] || pathname || '';
  }

  function getFolder(pathname) {
    const parts = String(pathname || '').split('/');
    if (parts.length <= 1) return 'root';
    return parts.slice(0, -1).join('/');
  }

  function getExtension(pathname) {
    const fileName = getFileName(pathname);
    const dot = fileName.lastIndexOf('.');
    return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
  }

  function getFileType(pathname) {
    const ext = getExtension(pathname);
    return ext ? ext.toUpperCase() : 'FILE';
  }

  function formatUploadedDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createAssetKey(value) {
    return String(value || '')
      .split('/')
      .pop()
      .replace(/\.[^.]+$/, '')
      .replace(/-[A-Za-z0-9]{20,}$/, '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function isVideoType(value) {
    return ['video', 'mp4', 'webm'].includes(String(value || '').toLowerCase());
  }

  function getStorageProvider(asset) {
    return String(asset?.storageProvider || (asset?.driveId && asset?.itemId ? 'onedrive' : 'vercel')).toLowerCase();
  }

  function getOneDriveContentUrl(asset) {
    if (!asset?.storageConnection || !asset?.driveId || !asset?.itemId) return '';
    const params = new URLSearchParams({
      action: 'content',
      connection: asset.storageConnection,
      driveId: asset.driveId,
      itemId: asset.itemId
    });
    return `${API_ONEDRIVE}?${params}`;
  }

  function getOneDriveConnectionLabel(connectionId) {
    const id = String(connectionId || '').trim();
    return oneDriveConnections.find(item => item.id === id)?.label || id || 'OneDrive';
  }

  async function loadOneDriveConnections() {
    const select = $('onedrive-storage-connection');
    try {
      const response = await fetch(`${API_ONEDRIVE}?action=connections`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load OneDrive connections.');
      oneDriveConnections = Array.isArray(data.connections) ? data.connections : [];

      if (select) {
        const previous = select.value || oneDriveConnectionId;
        select.innerHTML = oneDriveConnections.length
          ? oneDriveConnections.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join('')
          : '<option value="">No OneDrive connections configured</option>';
        if (previous && oneDriveConnections.some(item => item.id === previous)) select.value = previous;
        oneDriveConnectionId = select.value || '';
        oneDriveConnectionLabel = getOneDriveConnectionLabel(oneDriveConnectionId);
      }
      return oneDriveConnections;
    } catch (error) {
      oneDriveConnections = [];
      oneDriveConnectionId = '';
      oneDriveConnectionLabel = '';
      if (select) select.innerHTML = '<option value="">OneDrive unavailable</option>';
      throw error;
    }
  }

  function getPreviewKind(asset) {
    return window.IXLManager?.media
      ? IXLManager.media.detectKind({
          ...asset,
          url: getAssetSourceUrl(asset)
        })
      : 'file';
  }

  function getAssetSourceUrl(asset) {
    if (getStorageProvider(asset) === 'onedrive') return getOneDriveContentUrl(asset);
    return String(asset?.url || asset?.path || asset?.pathname || '').trim();
  }

  function getThumbnailTime(asset) {
    return window.IXLManager?.media
      ? IXLManager.media.getThumbnailTime(asset, {
          thumbnailTime: asset?.thumbnailTime
        })
      : DEFAULT_VIDEO_THUMBNAIL_TIME;
  }

  function getAssetProxyUrl(url) {
    return `${API_LIBRARY}?resource=assetproxy&url=${encodeURIComponent(url)}`;
  }

  function getRegistryIndex(asset) {
    const url = String(asset?.url || '');
    const pathname = String(asset?.pathname || '');
    const provider = getStorageProvider(asset);

    return registryAssets.findIndex(item => {
      if (asset?.key && item.key === asset.key) return true;

      if (provider === 'onedrive') {
        if (getStorageProvider(item) !== 'onedrive') return false;
        if (!asset?.storageConnection || item.storageConnection !== asset.storageConnection) return false;
        if (asset?.driveId && asset?.itemId && item.driveId === asset.driveId && item.itemId === asset.itemId) return true;
        if (asset?.relativePath && item.relativePath === asset.relativePath) return true;
        return false;
      }

      return (item.url && item.url === url) || (item.pathname && item.pathname === pathname);
    });
  }

  function getRegistryItem(asset) {
    const index = getRegistryIndex(asset);
    return index >= 0 ? registryAssets[index] : null;
  }

  function findRegistryByKey(key) {
    return registryAssets.find(item => item.key === key) || null;
  }

  function clearUploadObjectUrl() {
    if (uploadObjectUrl) {
      URL.revokeObjectURL(uploadObjectUrl);
      uploadObjectUrl = '';
    }
  }

  async function renderPreview(target, asset, options = {}) {
    const stage = typeof target === 'string' ? $(target) : target;
    if (!stage) return;

    if (!window.IXLManager?.media) {
      stage.innerHTML = '<div class="asset-preview-empty">Common media preview is unavailable.</div>';
      return;
    }

    stage.innerHTML = '<div class="asset-preview-empty">Loading preview...</div>';

    const sourceUrl = options.sourceUrl || getAssetSourceUrl(asset);
    if (!sourceUrl) {
      stage.innerHTML = '<div class="asset-preview-empty">No preview source is available.</div>';
      return;
    }

    try {
      await IXLManager.media.renderPreview(stage, {
        ...asset,
        url: sourceUrl,
        thumbnailTime: options.thumbnailTime ?? asset?.thumbnailTime
      }, {
        ...options,
        kind: options.kind || undefined,
        controls: true,
        pdfCanvas: true,
        loadText: true,
        emptyHtml: '<div class="asset-preview-empty">No preview source is available.</div>'
      });
    } catch (error) {
      console.error(error);
      stage.innerHTML = '<div class="asset-preview-empty">Preview could not be loaded. Use Open to view the asset.</div>';
    }
  }

  function renderFolderFilter() {
    const select = $('asset-folder-filter');
    const currentValue = select.value;
    const folders = [
      ...new Set([
        ...allAssets.map(asset => getFolder(asset.pathname)),
        ...registryAssets.map(asset => asset.folder || getFolder(asset.pathname))
      ].filter(Boolean))
    ].sort();

    select.innerHTML = '<option value="all">All Folders</option>';

    folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder;
      option.textContent = folder;
      select.appendChild(option);
    });

    if (folders.includes(currentValue)) select.value = currentValue;
  }


  const DEFAULT_UPLOAD_FOLDERS = [
    'companyprofile',
    'insights',
    'articles',
    'documents',
    'presentations',
    'images'
  ];

  function normalizeAssetFolderName(value) {
    return String(value || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\/{2,}/g, '/');
  }

  function isValidAssetFolderName(value) {
    const folder = normalizeAssetFolderName(value);
    if (!folder || folder.length > 120) return false;
    return folder.split('/').every(part => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part));
  }

  function getUploadFolderOptions() {
    return [
      ...new Set([
        ...DEFAULT_UPLOAD_FOLDERS,
        ...allAssets.map(asset => getFolder(asset.pathname)),
        ...registryAssets.map(asset => asset.folder || getFolder(asset.pathname))
      ].map(normalizeAssetFolderName).filter(Boolean))
    ].sort((a, b) => a.localeCompare(b));
  }

  function renderUploadFolderSelect(preferredFolder = '') {
    const select = $('asset-upload-folder');
    if (!select) return;

    const current = normalizeAssetFolderName(preferredFolder || select.value);
    const folders = getUploadFolderOptions();

    select.innerHTML = '';
    folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder;
      option.textContent = folder;
      select.appendChild(option);
    });

    if (current && !folders.includes(current)) {
      const option = document.createElement('option');
      option.value = current;
      option.textContent = current;
      select.appendChild(option);
    }

    select.value = current && [...select.options].some(option => option.value === current)
      ? current
      : (folders.includes('companyprofile') ? 'companyprofile' : (folders[0] || ''));
  }

  function openNewFolderEditor() {
    const editor = $('asset-new-folder-editor');
    const input = $('asset-new-folder-name');
    if (!editor || !input) return;
    editor.hidden = false;
    input.value = '';
    requestAnimationFrame(() => input.focus());
  }

  function closeNewFolderEditor() {
    const editor = $('asset-new-folder-editor');
    const input = $('asset-new-folder-name');
    if (editor) editor.hidden = true;
    if (input) input.value = '';
  }

  function createUploadFolderOption() {
    const input = $('asset-new-folder-name');
    const folder = normalizeAssetFolderName(input?.value);

    if (!isValidAssetFolderName(folder)) {
      alert('Enter a valid folder name. Use letters, numbers, hyphens, underscores, periods, or nested paths such as campaigns/2026.');
      input?.focus();
      return;
    }

    renderUploadFolderSelect(folder);
    closeNewFolderEditor();
  }

  function updateTopScroller() {
    if (!window.IXLManager) return;
    IXLManager.syncScrollTable({
      topScrollId: 'asset-top-scroll',
      topInnerId: 'asset-top-scroll-content',
      wrapId: 'asset-table-wrap',
      tableId: 'asset-table',
      headerViewportId: 'asset-header-viewport',
      headerTableId: 'asset-header-table'
    });
  }

  function updateUsageScroller() {
    if (!window.IXLManager) return;
    IXLManager.syncScrollTable({
      topScrollId: 'usage-top-scroll',
      topInnerId: 'usage-top-scroll-content',
      wrapId: 'usage-table-wrap',
      tableId: 'usage-table',
      headerViewportId: 'usage-header-viewport',
      headerTableId: 'usage-header-table'
    });
  }

  function setupScrollSync() {
    updateTopScroller();
    updateUsageScroller();
  }

  function getAssetSortValue(asset, key) {
    const pathname = String(asset?.pathname || '');
    const registryItem = getRegistryItem(asset);
    const fileName = getFileName(pathname);
    const assetKey = registryItem?.key || createAssetKey(fileName);

    switch (key) {
      case 'file': return fileName.toLowerCase();
      case 'key': return String(assetKey || '').toLowerCase();
      case 'folder': return getFolder(pathname).toLowerCase();
      case 'type': return getFileType(pathname).toLowerCase();
      case 'size': return Number(asset?.size || 0);
      case 'uploaded': {
        const value = new Date(asset?.uploadedAt || 0).getTime();
        return Number.isFinite(value) ? value : 0;
      }
      default: return '';
    }
  }

  function renderAssets() {
    const tbody = $('asset-table-body');
    const empty = $('library-empty');
    if (!tbody || !empty) return;

    const search = String($('asset-search')?.value || '').trim().toLowerCase();
    const folder = String($('asset-folder-filter')?.value || 'all');

    const filtered = allAssets
      .filter(asset => {
        const pathname = String(asset.pathname || '');
        const registryItem = getRegistryItem(asset);
        const key = registryItem?.key || createAssetKey(getFileName(pathname));
        const description = String(registryItem?.description || '');

        const matchesSearch =
          !search ||
          pathname.toLowerCase().includes(search) ||
          key.toLowerCase().includes(search) ||
          description.toLowerCase().includes(search);

        const matchesFolder = folder === 'all' || getFolder(pathname) === folder;
        return matchesSearch && matchesFolder;
      });

    const sorted = assetSorter
      ? assetSorter.sort(filtered, getAssetSortValue)
      : filtered;

    if ($('asset-count')) $('asset-count').textContent = sorted.length;
    tbody.innerHTML = '';

    sorted.forEach(asset => {
      const row = document.createElement('tr');
      const pathname = asset.pathname || '';
      const fileName = getFileName(pathname);
      const folderName = getFolder(pathname);
      const provider = getStorageProvider(asset);
      const registryItem = getRegistryItem(asset);
      const storageLabel = provider === 'onedrive'
        ? getOneDriveConnectionLabel(asset.storageConnection || registryItem?.storageConnection)
        : 'Vercel';
      const viewUrl = getAssetSourceUrl(asset);
      const downloadUrl = viewUrl;
      const assetKey = registryItem?.key || createAssetKey(fileName);

      const duplicateBlobAssets = allAssets.filter(otherAsset => {
        if (otherAsset === asset) return false;
        const otherRegistryItem = getRegistryItem(otherAsset);
        const otherKey = otherRegistryItem?.key || createAssetKey(getFileName(otherAsset.pathname));
        return otherKey === assetKey;
      });

      const hasBlobKeyDuplicate = !registryItem && duplicateBlobAssets.length > 0;

      const registryButton = registryItem
        ? `<a class="library-button" href="asset-library.html?edit=${encodeURIComponent(registryItem.key)}">Edit</a>`
        : hasBlobKeyDuplicate
          ? `<button type="button" class="library-button" data-duplicate-key="${escapeHtml(assetKey)}">Duplicate Key</button>`
          : `<button type="button" class="library-button primary" data-register-path="${escapeHtml(pathname)}">Register</button>`;

      row.innerHTML = `
        <td title="${escapeHtml(fileName)}">${escapeHtml(fileName)} <span class="asset-storage-badge">${escapeHtml(storageLabel)}</span></td>
        <td><code title="${escapeHtml(assetKey)}">${escapeHtml(assetKey)}</code></td>
        <td>${escapeHtml(folderName)}</td>
        <td>${escapeHtml(getFileType(pathname))}</td>
        <td>${escapeHtml(formatFileSize(asset.size))}</td>
        <td>${escapeHtml(formatUploadedDate(asset.uploadedAt))}</td>
        <td>${viewUrl ? `<a href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener noreferrer">View</a>` : ''}</td>
        <td>${registryButton}</td>
        <td>${downloadUrl ? `<a href="${escapeHtml(downloadUrl)}">Download</a>` : ''}</td>
        <td>${provider === 'vercel' && viewUrl ? `<button type="button" class="library-button" data-copy-url="${escapeHtml(viewUrl)}">Copy URL</button>` : ''}</td>
        <td>${provider === 'vercel' && viewUrl ? `<button type="button" class="library-button" data-delete-url="${escapeHtml(viewUrl)}" data-delete-name="${escapeHtml(fileName)}">Delete</button>` : ''}</td>
      `;

      tbody.appendChild(row);
    });

    empty.style.display = sorted.length ? 'none' : 'block';
    empty.textContent = allAssets.length ? 'No matching assets.' : 'No assets found.';
    requestAnimationFrame(updateTopScroller);
  }

  async function copyAssetUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      alert('URL copied.');
    } catch (error) {
      console.error(error);
      alert('Could not copy URL.');
    }
  }

  async function loadRegistry() {
    const response = await fetch(`${API_LIBRARY}?resource=assets`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load Asset Registry.');
    registryAssets = Array.isArray(data) ? data : [];
    window.IXLManager?.media?.setAssets(registryAssets);
  }

  async function loadUsageMappings() {
    const response = await fetch(`${API_LIBRARY}?resource=usage`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load Asset Usage.');
    usageMappings = Array.isArray(data) ? data : [];
  }

  function getUsageSortValue(entry, key) {
    const usage = entry.usage || {};
    switch (key) {
      case 'usageKey': return String(usage.usageKey || '').toLowerCase();
      case 'page': return String(usage.page || '').toLowerCase();
      case 'label': return String(usage.label || '').toLowerCase();
      case 'assetKey': return String(usage.assetKey || '').toLowerCase();
      default: return '';
    }
  }

  function renderUsageMappings() {
    const tbody = $('usage-table-body');
    const empty = $('usage-empty');
    if (!tbody || !empty) return;

    tbody.innerHTML = '';

    const indexed = usageMappings.map((usage, index) => ({ usage, index }));
    const rows = usageSorter ? usageSorter.sort(indexed, getUsageSortValue) : indexed;

    rows.forEach(({ usage, index }) => {
      const asset = findRegistryByKey(usage.assetKey);
      const row = document.createElement('tr');

      row.innerHTML = `
        <td><code>${escapeHtml(usage.usageKey || '')}</code></td>
        <td>${escapeHtml(usage.page || '')}</td>
        <td>${escapeHtml(usage.label || '')}</td>
        <td><code>${escapeHtml(usage.assetKey || '')}</code></td>
        <td>${asset?.url ? `<a href="${escapeHtml(asset.url)}" target="_blank" rel="noopener noreferrer">View</a>` : '<span class="asset-missing">Missing Asset</span>'}</td>
        <td><button type="button" class="library-button" data-edit-usage="${index}">Edit</button></td>
        <td><button type="button" class="library-button" data-delete-usage="${index}">Delete</button></td>
      `;

      tbody.appendChild(row);
    });

    empty.style.display = rows.length ? 'none' : 'block';
    empty.textContent = rows.length ? '' : 'No usage mappings yet.';
    requestAnimationFrame(updateUsageScroller);
  }

  function populateUsageAssetSelect(selectedKey = '') {
    const select = $('usage-asset-key-select');
    select.innerHTML = '';

    if (!registryAssets.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No registered assets available';
      select.appendChild(option);
      return;
    }

    registryAssets
      .slice()
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .forEach(asset => {
        const option = document.createElement('option');
        option.value = asset.key;
        option.textContent = `${asset.key} ??${asset.fileName || asset.name || asset.pathname || ''}`;
        select.appendChild(option);
      });

    if (selectedKey && registryAssets.some(item => item.key === selectedKey)) {
      select.value = selectedKey;
    }
  }

  function renderUsageLinkedAsset() {
    const selectedKey = $('usage-asset-key-select')?.value || '';
    const asset = findRegistryByKey(selectedKey);

    const preview = $('usage-edit-preview');
    const note = $('usage-edit-preview-note');
    const open = $('usage-edit-open');
    const download = $('usage-edit-download');

    if (!asset) {
      if (preview) preview.innerHTML = '<div class="asset-preview-empty">Select an Asset Key to preview the linked Asset.</div>';
      if (note) note.textContent = '';
      ['usage-info-key','usage-info-file','usage-info-folder','usage-info-type','usage-info-size','usage-info-uploaded','usage-info-path','usage-info-url']
        .forEach(id => { if ($(id)) $(id).textContent = '—'; });
      if (open) {
        open.hidden = true;
        open.removeAttribute('href');
      }
      if (download) {
        download.hidden = true;
        download.removeAttribute('href');
      }
      return;
    }

    renderPreview('usage-edit-preview', asset);

    if (note) {
      note.textContent =
        `${asset.type || getFileType(asset.pathname)} · ${formatFileSize(asset.size)} · ${asset.folder || getFolder(asset.pathname)}`;
    }

    $('usage-info-key').textContent = asset.key || '—';
    $('usage-info-file').textContent = asset.fileName || asset.name || '—';
    $('usage-info-folder').textContent = asset.folder || getFolder(asset.pathname) || '—';
    $('usage-info-type').textContent = asset.type || getFileType(asset.pathname) || '—';
    $('usage-info-size').textContent = formatFileSize(asset.size) || '—';
    $('usage-info-uploaded').textContent = formatUploadedDate(asset.uploadedAt) || '—';
    $('usage-info-path').textContent = asset.pathname || '—';
    $('usage-info-url').textContent = asset.url || '—';

    if (open) {
      if (asset.url) {
        open.hidden = false;
        open.href = asset.url;
      } else {
        open.hidden = true;
        open.removeAttribute('href');
      }
    }

    if (download) {
      const href = asset.downloadUrl || asset.url || '';
      if (href) {
        download.hidden = false;
        download.href = href;
      } else {
        download.hidden = true;
        download.removeAttribute('href');
      }
    }
  }

  function openUsageModal(index = null) {
    setAssetDetailActive(true);
    const title = $('usage-modal-title');
    const subtitle = $('usage-edit-subtitle');
    const editIndex = $('usage-edit-index');

    $('asset-list-mode').hidden = true;
    $('asset-usage-mode').hidden = true;
    $('asset-edit-mode').hidden = true;
    $('usage-edit-mode').hidden = false;

    $('asset-library-nav')?.classList.remove('active');
    $('asset-usage-nav')?.classList.add('active');

    if (index === null) {
      title.textContent = 'Add Usage';
      subtitle.textContent = 'Select the linked Asset and create a new Usage Mapping.';
      editIndex.value = '';
      $('usage-key-input').value = '';
      $('usage-page-input').value = '';
      $('usage-label-input').value = '';
      populateUsageAssetSelect('');
    } else {
      const usage = usageMappings[index];
      if (!usage) {
        alert('Usage mapping was not found.');
        return;
      }

      title.textContent = usage.label || usage.usageKey || 'Edit Usage';
      subtitle.textContent = 'Review the linked Asset and edit this Usage Mapping.';
      editIndex.value = String(index);
      $('usage-key-input').value = usage.usageKey || '';
      $('usage-page-input').value = usage.page || '';
      $('usage-label-input').value = usage.label || '';
      populateUsageAssetSelect(usage.assetKey || '');
    }

    renderUsageLinkedAsset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeUsageModal() {
    setAssetDetailActive(false);
    $('usage-edit-mode').hidden = true;
    $('asset-list-mode').hidden = true;
    $('asset-edit-mode').hidden = true;
    $('asset-usage-mode').hidden = false;
    $('asset-library-nav')?.classList.remove('active');
    $('asset-usage-nav')?.classList.add('active');
    renderUsageMappings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveUsageMapping() {
    const button = $('usage-save-button');
    const editIndexValue = $('usage-edit-index').value;
    const usageKey = createAssetKey($('usage-key-input').value);
    const page = $('usage-page-input').value.trim();
    const label = $('usage-label-input').value.trim();
    const assetKey = $('usage-asset-key-select').value;

    if (!usageKey) return alert('Usage Key is required.');
    if (!page) return alert('Page / Function is required.');
    if (!assetKey) return alert('Please select a registered Asset Key.');
    if (!findRegistryByKey(assetKey)) return alert(`Asset Key "${assetKey}" is not registered.`);

    const isEdit = editIndexValue !== '';
    const payload = { usageKey, page, label, assetKey };
    if (isEdit) payload.index = Number(editIndexValue);

    try {
      button.disabled = true;
      button.textContent = 'Saving...';

      const response = await fetch(`${API_LIBRARY}?resource=usage`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 && data.duplicate) {
          throw new Error(`Usage Key "${usageKey}" already exists.`);
        }
        throw new Error(data.error || 'Failed to save Asset Usage.');
      }

      if (isEdit) usageMappings[data.index] = data.item;
      else usageMappings.push(data.item);

      closeUsageModal();
      renderUsageMappings();
      alert(isEdit ? 'Usage mapping updated.' : 'Usage mapping added.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Failed to save Asset Usage.');
    } finally {
      button.disabled = false;
      button.textContent = 'Save Usage';
    }
  }

  async function deleteUsageMapping(index) {
    const usage = usageMappings[index];
    if (!usage) return alert('Usage mapping was not found.');

    const confirmed = confirm(
      `Delete this usage mapping?\n\n${usage.usageKey}\n${usage.page || ''}\nAsset Key: ${usage.assetKey || ''}`
    );
    if (!confirmed) return;

    const response = await fetch(`${API_LIBRARY}?resource=usage`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ index })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete Asset Usage.');

    await loadUsageMappings();
    renderUsageMappings();
  }

  async function loadAssets() {
    const empty = $('library-empty');
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = 'Loading assets...';
    }

    try {
      const [blobResponse] = await Promise.all([
        fetch(API_UPLOAD, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store'
        }),
        loadRegistry(),
        loadUsageMappings()
      ]);

      const data = await blobResponse.json();
      if (!blobResponse.ok) throw new Error(data.error || 'Failed to load assets.');

      const blobAssets = Array.isArray(data.blobs) ? data.blobs.map(item => ({ ...item, storageProvider: 'vercel' })) : [];
      const externalRegistered = registryAssets
        .filter(item => getStorageProvider(item) === 'onedrive')
        .map(item => ({ ...item, pathname: item.pathname || item.name || item.fileName || item.key }));
      allAssets = [...blobAssets, ...externalRegistered];

      if ($('asset-count')) $('asset-count').textContent = allAssets.length;
      renderFolderFilter();
      renderAssets();
      renderUsageMappings();
    } catch (error) {
      console.error(error);
      if (empty) {
        empty.style.display = 'block';
        empty.textContent = error.message || 'Failed to load assets.';
      }
      throw error;
    }
  }

  async function postAsset(payload, options = {}) {
    const response = await fetch(`${API_LIBRARY}?resource=assets`, {
      method: options.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return { response, data };
  }

  function getNextAvailableAssetKey(baseKey) {
    const cleanBase = createAssetKey(baseKey) || 'asset';
    const used = new Set(registryAssets.map(item => String(item.key || '').trim()).filter(Boolean));
    if (!used.has(cleanBase)) return cleanBase;

    let number = 2;
    while (used.has(`${cleanBase}-${number}`)) number += 1;
    return `${cleanBase}-${number}`;
  }

  function chooseDuplicateRegistryAction(key) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'asset-modal';
      overlay.innerHTML = `
        <div class="asset-modal-card">
          <div class="asset-panel-head">
            <div>
              <span class="section-eyebrow">DUPLICATE ASSET KEY</span>
              <h3 style="margin:6px 0 0;">${escapeHtml(key)}</h3>
              <p style="margin-top:8px;">Choose how this file should be registered.</p>
            </div>
          </div>
          <div class="asset-form-actions" style="margin-top:22px;">
            <button type="button" class="library-button" data-choice="cancel">Cancel</button>
            <button type="button" class="library-button" data-choice="add">Add with New Key</button>
            <button type="button" class="library-button primary" data-choice="update">Update Existing Key</button>
          </div>
        </div>`;

      const finish = choice => {
        overlay.remove();
        resolve(choice);
      };

      overlay.addEventListener('click', event => {
        if (event.target === overlay) return finish('cancel');
        const button = event.target.closest('[data-choice]');
        if (button) finish(button.dataset.choice);
      });

      document.body.appendChild(overlay);
    });
  }

  async function deleteUploadedBlobQuietly(asset) {
    const url = String(asset?.url || '').trim();
    if (!url) return;

    try {
      await fetch(API_UPLOAD, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ url })
      });
    } catch (error) {
      console.error('Failed to roll back uploaded Blob:', error);
    }
  }

  async function registerAsset(asset, explicit = {}) {
    const fileName = getFileName(asset.pathname);
    const requestedKey = createAssetKey(explicit.key || fileName);
    if (!requestedKey) throw new Error('A valid Asset Key is required.');

    const type = String(explicit.type || getFileType(asset.pathname).toLowerCase()).toLowerCase();
    const buildPayload = key => ({
      key,
      name: explicit.name || fileName,
      fileName,
      description: explicit.description || '',
      folder: getFolder(asset.pathname),
      pathname: asset.pathname || '',
      url: asset.url || '',
      downloadUrl: asset.downloadUrl || asset.url || '',
      storageProvider: explicit.storageProvider || asset.storageProvider || 'vercel',
      storageConnection: explicit.storageConnection || asset.storageConnection || '',
      relativePath: explicit.relativePath || asset.relativePath || '',
      driveId: explicit.driveId || asset.driveId || '',
      itemId: explicit.itemId || asset.itemId || '',
      webUrl: explicit.webUrl || asset.webUrl || '',
      parentItemId: explicit.parentItemId || asset.parentItemId || '',
      type,
      size: Number(asset.size || 0),
      uploadedAt: asset.uploadedAt || '',
      thumbnailTime: isVideoType(type)
        ? (explicit.thumbnailTime ?? DEFAULT_VIDEO_THUMBNAIL_TIME)
        : null
    });

    let payload = buildPayload(requestedKey);
    let { response, data } = await postAsset(payload);

    if (response.status === 409 && data.duplicate) {
      const existing = data.existingItem || {};
      const action = await chooseDuplicateRegistryAction(requestedKey);

      if (action === 'cancel') return null;

      if (action === 'add') {
        const newKey = getNextAvailableAssetKey(requestedKey);
        payload = buildPayload(newKey);
        ({ response, data } = await postAsset(payload));
      }

      if (action === 'update') {
        const affectedUsages = usageMappings.filter(usage => usage.assetKey === existing.key);
        let confirmUsageKeyChange = false;

        if (affectedUsages.length) {
          const usageList = affectedUsages
            .map(usage => `• ${usage.usageKey}${usage.page ? ` — ${usage.page}` : ''}`)
            .join('\n');

          const confirmed = confirm(
            `Asset Key "${existing.key}" is used by ${affectedUsages.length} Usage mapping(s):

${usageList}

UPDATE will make all of these usages point to the new file. Continue?`
          );
          if (!confirmed) return null;
          confirmUsageKeyChange = true;
        }

        ({ response, data } = await postAsset({
          ...payload,
          uploadedAt: existing.uploadedAt || payload.uploadedAt,
          index: data.existingIndex,
          confirmUsageKeyChange
        }, { method: 'PATCH' }));
      }
    }

    if (!response.ok) throw new Error(data.error || 'Failed to register asset.');
    return data.item || payload;
  }

  function resetUploadForm() {
    const selectedFolder = normalizeAssetFolderName($('asset-upload-folder')?.value);
    const selectedConnection = $('onedrive-storage-connection')?.value || oneDriveConnectionId;
    clearUploadObjectUrl();
    $('asset-upload-form').reset();
    renderUploadFolderSelect(selectedFolder);
    if (selectedConnection && $('onedrive-storage-connection')) {
      $('onedrive-storage-connection').value = selectedConnection;
      oneDriveConnectionId = selectedConnection;
      oneDriveConnectionLabel = getOneDriveConnectionLabel(selectedConnection);
    }
    closeNewFolderEditor();
    $('asset-upload-thumbnail-time').value = String(DEFAULT_VIDEO_THUMBNAIL_TIME);
    $('asset-upload-thumbnail-field').hidden = true;
    $('upload-preview').innerHTML = '<div class="asset-preview-empty">Choose a file to preview.</div>';
    $('upload-preview-note').textContent = '';
    $('asset-upload-key').value = '';
    selectedOneDriveItem = null;
    renderSelectedOneDriveItem();
    syncAssetSourceUI();
  }

  async function handleUploadFileChange() {
    clearUploadObjectUrl();

    const file = $('asset-upload-file').files[0];
    if (!file) {
      resetUploadForm();
      return;
    }

    $('asset-upload-key').value = createAssetKey(file.name);

    const ext = getExtension(file.name);
    const type = ext || file.type;
    const kind = getPreviewKind({ type, pathname: file.name });
    const video = kind === 'video';

    $('asset-upload-thumbnail-field').hidden = !video;
    if (video) $('asset-upload-thumbnail-time').value = String(DEFAULT_VIDEO_THUMBNAIL_TIME);

    uploadObjectUrl = URL.createObjectURL(file);

    await renderPreview('upload-preview', {
      type,
      pathname: file.name,
      url: uploadObjectUrl,
      name: file.name,
      thumbnailTime: DEFAULT_VIDEO_THUMBNAIL_TIME
    }, {
      sourceUrl: uploadObjectUrl,
      kind,
      thumbnailTime: DEFAULT_VIDEO_THUMBNAIL_TIME
    });

    $('upload-preview-note').textContent =
      `${file.name} · ${formatFileSize(file.size)} · ${getFileType(file.name)}`;
  }

  function getAssetSourceChoice() {
    return document.querySelector('input[name="asset-source"]:checked')?.value || 'pc';
  }

  function clearOneDriveSelection() {
    selectedOneDriveItem = null;
    oneDriveDriveId = '';
    oneDriveStack = [];
    renderSelectedOneDriveItem();
  }

  function syncAssetSourceUI() {
    const source = getAssetSourceChoice();
    const pc = $('asset-pc-fields');
    const od = $('asset-onedrive-fields');
    if (pc) pc.hidden = source !== 'pc';
    if (od) od.hidden = source !== 'onedrive';
    const file = $('asset-upload-file');
    if (file) file.required = source === 'pc';
    const button = $('asset-upload-button');
    if (button) button.textContent = source === 'pc' ? 'Upload & Register' : 'Register';
    if (source === 'onedrive') {
      const select = $('onedrive-storage-connection');
      if (select?.value) {
        oneDriveConnectionId = select.value;
        oneDriveConnectionLabel = getOneDriveConnectionLabel(oneDriveConnectionId);
      }
      renderSelectedOneDriveItem();
    }
  }

  function renderSelectedOneDriveItem() {
    const host = $('onedrive-selected-file');
    if (!host) return;
    if (!selectedOneDriveItem) {
      host.textContent = 'No OneDrive file selected.';
      return;
    }
    const connectionLabel = getOneDriveConnectionLabel(selectedOneDriveItem.storageConnection);
    host.innerHTML = `<strong>${escapeHtml(selectedOneDriveItem.name)}</strong><br>` +
      `${escapeHtml(connectionLabel)} · ${escapeHtml(selectedOneDriveItem.relativePath || selectedOneDriveItem.parentPath || 'OneDrive')} · ${formatFileSize(selectedOneDriveItem.size)}`;
  }

  async function loadOneDriveFolder(itemId = '') {
    const list = $('onedrive-browser-list');
    if (list) list.innerHTML = '<div class="onedrive-browser-empty">Loading...</div>';
    if (!oneDriveConnectionId) throw new Error('Please select a OneDrive storage connection first.');

    const params = new URLSearchParams({
      action: 'children',
      connection: oneDriveConnectionId
    });
    if (oneDriveDriveId) params.set('driveId', oneDriveDriveId);
    if (itemId) params.set('itemId', itemId);

    const response = await fetch(`${API_ONEDRIVE}?${params}`, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to browse OneDrive.');

    oneDriveDriveId = data.driveId || oneDriveDriveId;
    oneDriveConnectionId = data.storageConnection || oneDriveConnectionId;
    oneDriveConnectionLabel = data.connectionLabel || getOneDriveConnectionLabel(oneDriveConnectionId);
    const items = Array.isArray(data.items) ? data.items : [];

    const breadcrumb = oneDriveStack.length
      ? `${oneDriveConnectionLabel} / ${oneDriveStack.map(x => x.name).join(' / ')}`
      : oneDriveConnectionLabel;
    $('onedrive-browser-path').textContent = breadcrumb;
    $('onedrive-browser-connection').textContent = `${oneDriveConnectionLabel} — read-only browse and register. No upload, move, rename or folder creation.`;
    $('onedrive-browser-up').disabled = !oneDriveStack.length;

    if (!items.length) {
      list.innerHTML = '<div class="onedrive-browser-empty">This folder is empty.</div>';
      return;
    }

    list.innerHTML = items
      .sort((a,b) => Number(b.isFolder) - Number(a.isFolder) || String(a.name).localeCompare(String(b.name)))
      .map(item => `<button type="button" class="onedrive-browser-row" data-od-id="${escapeHtml(item.id)}" data-od-folder="${item.isFolder ? '1' : '0'}">
        <span class="onedrive-browser-name">${item.isFolder ? '▰ ' : ''}${escapeHtml(item.name)}</span>
        <span class="onedrive-browser-meta">${item.isFolder ? 'Folder' : escapeHtml(getFileType(item.name))}</span>
        <span class="onedrive-browser-meta onedrive-size">${item.isFolder ? `${item.childCount || 0} items` : formatFileSize(item.size)}</span>
      </button>`).join('');

    list.querySelectorAll('[data-od-id]').forEach(button => {
      button.addEventListener('click', async () => {
        const item = items.find(x => x.id === button.dataset.odId);
        if (!item) return;
        if (item.isFolder) {
          oneDriveStack.push({ id: item.id, name: item.name });
          await loadOneDriveFolder(item.id);
          return;
        }

        selectedOneDriveItem = {
          ...item,
          driveId: oneDriveDriveId,
          storageConnection: oneDriveConnectionId,
          parentItemId: item.parentId || oneDriveStack.at(-1)?.id || '',
          relativePath: item.relativePath || `/${[...oneDriveStack.map(x => x.name), item.name].join('/')}`
        };

        $('asset-upload-key').value = createAssetKey(item.name);
        renderSelectedOneDriveItem();
        const source = getOneDriveContentUrl(selectedOneDriveItem);
        await renderPreview('upload-preview', {
          ...selectedOneDriveItem,
          pathname: selectedOneDriveItem.relativePath,
          url: source,
          type: getExtension(selectedOneDriveItem.name)
        }, { sourceUrl: source });
        $('upload-preview-note').textContent = `${oneDriveConnectionLabel} · ${item.name} · ${formatFileSize(item.size)}`;
        $('onedrive-browser-modal').hidden = true;
      });
    });
  }

  async function openOneDriveBrowser() {
    const select = $('onedrive-storage-connection');
    if (!oneDriveConnections.length) await loadOneDriveConnections();
    oneDriveConnectionId = select?.value || oneDriveConnectionId || oneDriveConnections[0]?.id || '';
    if (!oneDriveConnectionId) return alert('No OneDrive storage connection is configured.');
    oneDriveConnectionLabel = getOneDriveConnectionLabel(oneDriveConnectionId);
    oneDriveDriveId = '';
    oneDriveStack = [];
    $('onedrive-browser-modal').hidden = false;
    try {
      await loadOneDriveFolder();
    } catch (error) {
      $('onedrive-browser-modal').hidden = true;
      alert(error.message || 'OneDrive could not be opened.');
    }
  }

  async function registerSelectedOneDriveAsset() {
    const item = selectedOneDriveItem;
    if (!item) return alert('Please select a OneDrive file first.');
    if (!item.storageConnection) return alert('The selected OneDrive file has no storage connection. Please select it again.');
    if (!item.relativePath) return alert('The selected OneDrive file has no relative path. Please select it again.');

    const key = createAssetKey($('asset-upload-key').value || item.name);
    if (!key) return alert('A valid Asset Key is required.');
    const ext = getExtension(item.name);
    const registryPath = item.relativePath.replace(/^\/+/, '');

    const registered = await registerAsset({
      pathname: registryPath,
      url: '',
      downloadUrl: '',
      storageProvider: 'onedrive',
      storageConnection: item.storageConnection,
      relativePath: item.relativePath,
      driveId: item.driveId,
      itemId: item.id,
      webUrl: item.webUrl || '',
      parentItemId: item.parentItemId || '',
      size: item.size,
      uploadedAt: item.lastModifiedDateTime || ''
    }, {
      key,
      name: item.name,
      description: $('asset-upload-description').value.trim(),
      type: ext,
      storageProvider: 'onedrive',
      storageConnection: item.storageConnection,
      relativePath: item.relativePath,
      driveId: item.driveId,
      itemId: item.id,
      webUrl: item.webUrl || '',
      parentItemId: item.parentItemId || ''
    });

    if (!registered) return;
    alert(`OneDrive asset registered.\n\nStorage: ${getOneDriveConnectionLabel(item.storageConnection)}\nKey: ${registered.key || key}`);
    clearOneDriveSelection();
    resetUploadForm();
    location.href = 'asset-library.html';
  }

  async function uploadAndRegister(event) {
    event.preventDefault();

    if (getAssetSourceChoice() === 'onedrive') {
      try {
        const button = $('asset-upload-button');
        button.disabled = true;
        button.textContent = 'Registering...';
        await registerSelectedOneDriveAsset();
      } catch (error) {
        console.error(error);
        alert(error.message || 'OneDrive asset registration failed.');
      } finally {
        const button = $('asset-upload-button');
        button.disabled = false;
        syncAssetSourceUI();
      }
      return;
    }

    const file = $('asset-upload-file').files[0];
    const folder = normalizeAssetFolderName($('asset-upload-folder').value);
    const button = $('asset-upload-button');
    if (!file) return alert('Please select a file first.');
    if (!isValidAssetFolderName(folder)) return alert('Please select or create a valid folder.');

    const key = createAssetKey($('asset-upload-key').value || file.name);
    if (!key) return alert('A valid Asset Key is required.');

    const ext = getExtension(file.name);
    const isVideo = ['mp4', 'webm'].includes(ext);
    const thumbnailTimeRaw = $('asset-upload-thumbnail-time').value;
    const thumbnailTime = isVideo ? Number(thumbnailTimeRaw) : null;

    if (isVideo && (!Number.isFinite(thumbnailTime) || thumbnailTime < 0)) {
      return alert('Thumbnail Time must be 0 or greater.');
    }

    let uploadedAsset = null;
    let registered = null;

    try {
      button.disabled = true;
      button.textContent = 'Uploading...';

      if (!window.vercelBlobUpload) throw new Error('Blob upload module is not loaded.');

      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const pathname = `${folder}/${safeFileName}`;

      const uploaded = await window.vercelBlobUpload(pathname, file, {
        access: 'public',
        handleUploadUrl: API_UPLOAD
      });

      uploadedAsset = {
        pathname: uploaded.pathname || pathname,
        url: uploaded.url || '',
        downloadUrl: uploaded.downloadUrl || uploaded.url || '',
        size: file.size,
        uploadedAt: new Date().toISOString()
      };

      button.textContent = 'Registering...';

      registered = await registerAsset(uploadedAsset, {
        key,
        name: file.name,
        description: $('asset-upload-description').value.trim(),
        type: ext,
        thumbnailTime: isVideo ? thumbnailTime : null
      });

      if (!registered) {
        await deleteUploadedBlobQuietly(uploadedAsset);
        uploadedAsset = null;
        return;
      }

      alert(`Upload and registration completed.

Key: ${registered.key || key}`);
      resetUploadForm();
      location.href = 'asset-library.html';
    } catch (error) {
      console.error(error);
      if (uploadedAsset && !registered) await deleteUploadedBlobQuietly(uploadedAsset);
      alert(error.message || 'Upload failed.');
    } finally {
      button.disabled = false;
      button.textContent = 'Upload & Register';
    }
  }

  function showPanel(id) {
    ['asset-upload-panel', 'repository-asset-panel'].forEach(panelId => {
      const panel = $(panelId);
      if (panel) panel.hidden = panelId !== id;
    });
  }

  function closePanel(id) {
    const panel = $(id);
    if (panel) panel.hidden = true;
  }

  function updateRepositoryKeyFromPath() {
    const path = $('repository-asset-path').value.trim();
    $('repository-asset-key').value = createAssetKey(getFileName(path));
  }

  async function registerRepositoryAsset(event) {
    event.preventDefault();

    const pathInput = $('repository-asset-path');
    const typeSelect = $('repository-asset-type');
    const button = $('repository-asset-register');
    const pathname = String(pathInput.value || '').trim().replace(/^\/+/, '');

    if (!pathname) return alert('Repository asset path is required.');

    const fileName = getFileName(pathname);
    const key = createAssetKey($('repository-asset-key').value || fileName);
    if (!key) return alert('A valid Asset Key is required.');

    const type = typeSelect.value;
    const url = '/' + pathname;

    try {
      button.disabled = true;
      button.textContent = 'Registering...';

      const { response, data } = await postAsset({
        key,
        name: fileName,
        fileName,
        description: $('repository-asset-description').value.trim(),
        folder: pathname.includes('/') ? pathname.split('/').slice(0, -1).join('/') : '',
        pathname,
        url,
        downloadUrl: url,
        type,
        uploadedAt: new Date().toISOString(),
        thumbnailTime: isVideoType(type) ? DEFAULT_VIDEO_THUMBNAIL_TIME : null
      });

      if (!response.ok) throw new Error(data.error || 'Repository asset could not be registered.');

      alert(`Repository asset registered.\n\nKey: ${data.item?.key || key}`);
      $('repository-asset-form').reset();
      await loadAssets();
      $('repository-asset-panel').hidden = true;
    } catch (error) {
      console.error(error);
      alert(error.message || 'Repository asset registration failed.');
    } finally {
      button.disabled = false;
      button.textContent = 'Register Repository Asset';
    }
  }

  function renderEditMode(item, index) {
    setAssetDetailActive(true);
    $('asset-list-mode').hidden = true;
    $('asset-usage-mode').hidden = true;
    $('asset-edit-mode').hidden = false;
    $('asset-library-nav')?.classList.add('active');
    $('asset-usage-nav')?.classList.remove('active');

    $('asset-edit-index').value = String(index);
    $('asset-edit-title').textContent = item.key || 'Asset';
    $('asset-edit-subtitle').textContent = item.description || item.fileName || item.pathname || '';
    $('asset-edit-key').value = item.key || '';
    $('asset-edit-name').value = item.name || item.fileName || '';
    $('asset-edit-description').value = item.description || '';

    const video = isVideoType(item.type) || getPreviewKind(item) === 'video';
    $('asset-edit-thumbnail-field').hidden = !video;
    $('asset-edit-thumbnail-time').value = video ? String(getThumbnailTime(item)) : '';

    $('asset-info-file').textContent = item.fileName || item.name || '';
    $('asset-info-folder').textContent = item.folder || getFolder(item.pathname);
    $('asset-info-type').textContent = item.type || getFileType(item.pathname);
    $('asset-info-size').textContent = formatFileSize(item.size);
    $('asset-info-uploaded').textContent = formatUploadedDate(item.uploadedAt);
    $('asset-info-updated').textContent = formatUploadedDate(item.updatedAt);
    $('asset-info-path').textContent = item.pathname || '';
    $('asset-info-url').textContent = item.url || '';

    const open = $('asset-edit-open');
    const download = $('asset-edit-download');

    if (item.url) {
      open.hidden = false;
      open.href = item.url;
    } else {
      open.hidden = true;
      open.removeAttribute('href');
    }

    if (item.downloadUrl || item.url) {
      download.hidden = false;
      download.href = item.downloadUrl || item.url;
    } else {
      download.hidden = true;
      download.removeAttribute('href');
    }

    renderPreview('asset-edit-preview', item);
    $('asset-edit-preview-note').textContent =
      `${item.type || getFileType(item.pathname)} · ${formatFileSize(item.size)} · ${item.folder || getFolder(item.pathname)}`;
  }

  async function initMode() {
    setAssetDetailActive(false);
    const params = new URLSearchParams(location.search);
    const editKey = params.get('edit');
    const mode = params.get('mode') || 'library';

    $('asset-list-mode').hidden = true;
    $('asset-usage-mode').hidden = true;
    $('asset-edit-mode').hidden = true;
    $('usage-edit-mode').hidden = true;
    $('asset-library-nav')?.classList.remove('active');
    $('asset-usage-nav')?.classList.remove('active');

    if (editKey) {
      await Promise.all([loadRegistry(), loadUsageMappings()]);
      const index = registryAssets.findIndex(item => item.key === editKey);
      if (index < 0) {
        alert(`Asset Key "${editKey}" was not found.`);
        location.href = 'asset-library.html';
        return;
      }
      renderEditMode(registryAssets[index], index);
      return;
    }

    await loadAssets();

    if (mode === 'usage') {
      $('asset-usage-mode').hidden = false;
      $('asset-usage-nav')?.classList.add('active');
      renderUsageMappings();
      return;
    }

    $('asset-list-mode').hidden = false;
    $('asset-library-nav')?.classList.add('active');

    const filterBar = document.querySelector('#asset-list-mode > .asset-filter-bar');
    const gridSticky = document.getElementById('asset-grid-sticky');
    const tableSection = document.querySelector('#asset-list-mode > .asset-table-section');

    if (mode === 'upload') {
      showPanel('asset-upload-panel');
      if (filterBar) filterBar.hidden = true;
      if (gridSticky) gridSticky.hidden = true;
      if (tableSection) tableSection.hidden = true;
    } else {
      closePanel('asset-upload-panel');
      if (filterBar) filterBar.hidden = false;
      if (gridSticky) gridSticky.hidden = false;
      if (tableSection) tableSection.hidden = false;
    }

    requestAnimationFrame(updateTopScroller);
  }

  async function saveEditedAsset(event) {
    event.preventDefault();

    const index = Number($('asset-edit-index').value);
    const item = registryAssets[index];
    if (!item) return alert('Registry item was not found.');

    const key = createAssetKey($('asset-edit-key').value);
    if (!key) return alert('A valid Asset Key is required.');

    const description = $('asset-edit-description').value.trim();
    const name = $('asset-edit-name').value.trim() || item.fileName || item.name || '';

    const video = isVideoType(item.type) || getPreviewKind(item) === 'video';
    let thumbnailTime = item.thumbnailTime;

    if (video) {
      thumbnailTime = Number($('asset-edit-thumbnail-time').value);
      if (!Number.isFinite(thumbnailTime) || thumbnailTime < 0) {
        return alert('Thumbnail Time must be 0 or greater.');
      }
    } else {
      thumbnailTime = null;
    }

    const affectedUsages = usageMappings.filter(usage => usage.assetKey === item.key);
    let confirmUsageKeyChange = false;

    if (key !== item.key && affectedUsages.length) {
      const usageList = affectedUsages
        .map(usage => `• ${usage.usageKey}${usage.page ? ` — ${usage.page}` : ''}`)
        .join('\n');

      const confirmed = confirm(
        `Asset Key "${item.key}" is used by ${affectedUsages.length} Usage mapping(s):\n\n${usageList}\n\nChange the Asset Key to "${key}" and update all of these Usage mappings automatically?`
      );

      if (!confirmed) return;
      confirmUsageKeyChange = true;
    }

    const button = $('asset-edit-save');

    try {
      button.disabled = true;
      button.textContent = 'Saving...';

      let { response, data } = await postAsset({
        ...item,
        key,
        name,
        description,
        thumbnailTime,
        index,
        confirmUsageKeyChange
      }, { method: 'PATCH' });

      if (response.status === 409 && data.usageConflict) {
        const confirmed = confirm(`${data.error}\n\nUpdate all affected Usage mappings to "${key}" and continue?`);
        if (!confirmed) return;

        ({ response, data } = await postAsset({
          ...item,
          key,
          name,
          description,
          thumbnailTime,
          index,
          confirmUsageKeyChange: true
        }, { method: 'PATCH' }));
      }

      if (response.status === 409 && data.duplicate) {
        throw new Error('That Asset Key is already used by another asset.');
      }

      if (!response.ok) throw new Error(data.error || 'Failed to update Asset Registry.');

      const affectedCount = Number(data.affectedUsageCount || 0);
      alert(
        `Asset updated.\n\n${data.item?.key || key}` +
        (affectedCount ? `\n\n${affectedCount} Usage mapping(s) updated automatically.` : '')
      );

      location.href = `asset-library.html?edit=${encodeURIComponent(data.item?.key || key)}`;
    } catch (error) {
      console.error(error);
      alert(error.message || 'Failed to update Asset Registry.');
    } finally {
      button.disabled = false;
      button.textContent = 'Save Changes';
    }
  }

  function closeDuplicateModal() {
    $('duplicate-modal').hidden = true;
    $('duplicate-modal-list').innerHTML = '';
  }

  function showDuplicateModal(key) {
    const modal = $('duplicate-modal');
    const keyLabel = $('duplicate-modal-key');
    const list = $('duplicate-modal-list');

    const matches = allAssets.filter(asset => {
      const registryItem = getRegistryItem(asset);
      const candidateKey = registryItem?.key || createAssetKey(getFileName(asset.pathname));
      return candidateKey === key;
    });

    keyLabel.textContent = `Key: ${key}`;
    list.innerHTML = '';

    matches.forEach(asset => {
      const fileName = getFileName(asset.pathname);
      const card = document.createElement('div');
      card.className = 'asset-duplicate-item';

      card.innerHTML = `
        <div>
          <strong>${escapeHtml(fileName)}</strong>
          <div class="asset-duplicate-meta">
            <span>Folder: <strong>${escapeHtml(getFolder(asset.pathname))}</strong></span>
            <span>Size: <strong>${escapeHtml(formatFileSize(asset.size))}</strong></span>
            <span>Type: <strong>${escapeHtml(getFileType(asset.pathname))}</strong></span>
          </div>
        </div>
        <div class="asset-duplicate-actions">
          ${asset.url ? `<a href="${escapeHtml(asset.url)}" target="_blank" rel="noopener noreferrer" class="library-button">View</a>` : ''}
          <button type="button" class="library-button primary" data-use-duplicate-path="${escapeHtml(asset.pathname || '')}">Use This</button>
        </div>
      `;

      list.appendChild(card);
    });

    modal.hidden = false;
  }

  async function deleteBlobAsset(button) {
    const url = button.dataset.deleteUrl;
    const fileName = button.dataset.deleteName;

    const registryIndex = registryAssets.findIndex(item => item.url === url);
    if (registryIndex >= 0) {
      alert(
        'This file is registered in Asset Registry.\n\nUpdate or remove the Registry reference before deleting the Blob file.'
      );
      return;
    }

    if (!confirm(`Delete this asset?\n\n${fileName}`)) return;

    try {
      button.disabled = true;
      button.textContent = 'Deleting...';

      const response = await fetch(API_UPLOAD, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete asset.');

      alert('Asset deleted.');
      await loadAssets();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Failed to delete asset.');
    } finally {
      button.disabled = false;
      button.textContent = 'Delete';
    }
  }

  function bindEvents() {
    if (window.IXLManager) {
      assetSorter = IXLManager.createSortableTable({
        root: '#asset-header-table',
        keys: ['file', 'key', 'folder', 'type', 'size', 'uploaded'],
        defaultKey: 'uploaded',
        defaultDirection: 'desc',
        defaultDirectionByKey: { uploaded: 'desc' },
        onChange: renderAssets
      });

      usageSorter = IXLManager.createSortableTable({
        root: '#usage-header-table',
        keys: ['usageKey', 'page', 'label', 'assetKey'],
        defaultKey: 'usageKey',
        defaultDirection: 'asc',
        onChange: renderUsageMappings
      });
    }

    setupScrollSync();

    $('asset-search')?.addEventListener('input', renderAssets);
    $('asset-folder-filter')?.addEventListener('change', renderAssets);

    $('repository-toggle')?.addEventListener('click', () => showPanel('repository-asset-panel'));

    document.querySelectorAll('[data-close-panel]').forEach(button => {
      button.addEventListener('click', () => closePanel(button.dataset.closePanel));
    });

    $('asset-upload-file')?.addEventListener('change', handleUploadFileChange);
    document.querySelectorAll('input[name="asset-source"]').forEach(input => input.addEventListener('change', async () => {
      syncAssetSourceUI();
      if (getAssetSourceChoice() === 'onedrive' && !oneDriveConnections.length) {
        try { await loadOneDriveConnections(); }
        catch (error) { console.error(error); alert(error.message || 'OneDrive connections could not be loaded.'); }
      }
    }));
    $('onedrive-storage-connection')?.addEventListener('change', event => {
      oneDriveConnectionId = event.target.value || '';
      oneDriveConnectionLabel = getOneDriveConnectionLabel(oneDriveConnectionId);
      clearOneDriveSelection();
      $('asset-upload-key').value = '';
      $('upload-preview').innerHTML = '<div class="asset-preview-empty">Choose a OneDrive file to preview.</div>';
      $('upload-preview-note').textContent = '';
    });
    $('onedrive-browse-button')?.addEventListener('click', openOneDriveBrowser);
    $('onedrive-browser-close')?.addEventListener('click', () => { $('onedrive-browser-modal').hidden = true; });
    $('onedrive-browser-up')?.addEventListener('click', async () => {
      if (!oneDriveStack.length) return;
      oneDriveStack.pop();
      await loadOneDriveFolder(oneDriveStack.at(-1)?.id || '');
    });
    $('asset-upload-form')?.addEventListener('submit', uploadAndRegister);
    $('[data-reset-upload]')?.addEventListener('click', resetUploadForm);
    $('asset-new-folder-button')?.addEventListener('click', openNewFolderEditor);
    $('asset-new-folder-create')?.addEventListener('click', createUploadFolderOption);
    $('asset-new-folder-cancel')?.addEventListener('click', closeNewFolderEditor);
    $('asset-new-folder-name')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        createUploadFolderOption();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNewFolderEditor();
      }
    });

    $('repository-asset-path')?.addEventListener('input', updateRepositoryKeyFromPath);
    $('repository-asset-form')?.addEventListener('submit', registerRepositoryAsset);

    $('usage-add-button')?.addEventListener('click', () => openUsageModal(null));
    $('usage-modal-cancel')?.addEventListener('click', closeUsageModal);
    $('usage-edit-cancel-bottom')?.addEventListener('click', closeUsageModal);
    $('usage-edit-form')?.addEventListener('submit', event => {
      event.preventDefault();
      saveUsageMapping();
    });
    $('usage-asset-key-select')?.addEventListener('change', renderUsageLinkedAsset);

    $('usage-table-body')?.addEventListener('click', async event => {
      const editButton = event.target.closest('[data-edit-usage]');
      if (editButton) {
        openUsageModal(Number(editButton.dataset.editUsage));
        return;
      }

      const deleteButton = event.target.closest('[data-delete-usage]');
      if (!deleteButton) return;

      try {
        deleteButton.disabled = true;
        await deleteUsageMapping(Number(deleteButton.dataset.deleteUsage));
      } catch (error) {
        console.error(error);
        alert(error.message || 'Failed to delete Asset Usage.');
      } finally {
        deleteButton.disabled = false;
      }
    });

    $('asset-table-body')?.addEventListener('click', async event => {
      const copyButton = event.target.closest('[data-copy-url]');
      if (copyButton) return copyAssetUrl(copyButton.dataset.copyUrl);

      const duplicateButton = event.target.closest('[data-duplicate-key]');
      if (duplicateButton) return showDuplicateModal(duplicateButton.dataset.duplicateKey);

      const registerButton = event.target.closest('[data-register-path]');
      if (registerButton) {
        const asset = allAssets.find(item => item.pathname === registerButton.dataset.registerPath);
        if (!asset) return alert('Asset was not found.');

        try {
          registerButton.disabled = true;
          const registered = await registerAsset(asset);
          if (registered) {
            alert(`Asset registered.\n\nKey: ${registered.key}`);
            await loadAssets();
          }
        } catch (error) {
          console.error(error);
          alert(error.message || 'Failed to register asset.');
        } finally {
          registerButton.disabled = false;
        }
        return;
      }

      const deleteButton = event.target.closest('[data-delete-url]');
      if (deleteButton) await deleteBlobAsset(deleteButton);
    });

    $('duplicate-modal-close')?.addEventListener('click', closeDuplicateModal);
    $('duplicate-modal')?.addEventListener('click', event => {
      if (event.target.id === 'duplicate-modal') closeDuplicateModal();
    });

    $('duplicate-modal-list')?.addEventListener('click', async event => {
      const useButton = event.target.closest('[data-use-duplicate-path]');
      if (!useButton) return;

      const asset = allAssets.find(item => item.pathname === useButton.dataset.useDuplicatePath);
      if (!asset) return alert('Asset was not found.');

      closeDuplicateModal();

      try {
        const registered = await registerAsset(asset);
        if (registered) {
          alert(`Asset registered.\n\nKey: ${registered.key}`);
          await loadAssets();
        }
      } catch (error) {
        console.error(error);
        alert(error.message || 'Failed to register asset.');
      }
    });

    $('asset-edit-form')?.addEventListener('submit', saveEditedAsset);
    $('asset-edit-back')?.addEventListener('click', () => {
      location.href = 'asset-library.html';
    });
    $('asset-edit-cancel')?.addEventListener('click', () => {
      location.href = 'asset-library.html';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();

    try {
      await initMode();
      updateTopScroller();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Asset Management could not be loaded.');
    }
  });
})();
