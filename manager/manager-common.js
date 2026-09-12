/* =========================================
   IXL KOREA MANAGER
   COMMON UTILITIES
   Asset Management is the canonical UI/UX pattern.
   ========================================= */

(function () {
  'use strict';

  function toManagerUrl(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';

    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }

    return '../' + clean.replace(/^\/+/, '');
  }

  function normalizeManagerUrl(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';

    try {
      const absolute = new URL(toManagerUrl(clean), window.location.href);
      absolute.hash = '';

      if (absolute.pathname.length > 1 && absolute.pathname.endsWith('/')) {
        absolute.pathname = absolute.pathname.slice(0, -1);
      }

      return absolute.href;
    } catch {
      return clean;
    }
  }

  function sameManagerUrl(a, b) {
    const first = normalizeManagerUrl(a);
    const second = normalizeManagerUrl(b);
    return Boolean(first && second && first === second);
  }

  function syncScrollTable({ topScrollId, topInnerId, wrapId, tableId, headerViewportId, headerTableId }) {
    const topScroll = document.getElementById(topScrollId);
    const topInner = document.getElementById(topInnerId);
    const wrap = document.getElementById(wrapId);
    const table = document.getElementById(tableId);
    const headerViewport = headerViewportId ? document.getElementById(headerViewportId) : null;
    const headerTable = headerTableId ? document.getElementById(headerTableId) : null;

    if (!topScroll || !topInner || !wrap || !table) return;

    let syncing = false;

    const syncTo = source => {
      if (syncing) return;
      syncing = true;
      const left = source.scrollLeft;
      if (source !== topScroll) topScroll.scrollLeft = left;
      if (source !== wrap) wrap.scrollLeft = left;
      if (headerViewport && source !== headerViewport) headerViewport.scrollLeft = left;
      syncing = false;
    };

    const update = () => {
      const width = Math.max(
        table.scrollWidth,
        headerTable?.scrollWidth || 0,
        wrap.clientWidth,
        headerViewport?.scrollWidth || 0
      );
      topInner.style.width = `${width}px`;
      syncTo(wrap);
    };

    if (!topScroll.dataset.managerSyncBound) {
      topScroll.addEventListener('scroll', () => syncTo(topScroll));
      wrap.addEventListener('scroll', () => syncTo(wrap));
      if (headerViewport) {
        headerViewport.addEventListener('scroll', () => syncTo(headerViewport));
      }
      window.addEventListener('resize', update);
      topScroll.dataset.managerSyncBound = 'true';
    }

    requestAnimationFrame(update);
  }

  function compareValues(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function createSortableTable(options = {}) {
    const root = typeof options.root === 'string'
      ? document.querySelector(options.root)
      : options.root;

    const keys = Array.isArray(options.keys) ? options.keys : [];
    let key = options.defaultKey || keys[0] || '';
    let direction = options.defaultDirection || 'asc';

    function setIndicators() {
      if (!root) return;
      root.querySelectorAll('[data-sort-key]').forEach(button => {
        const active = button.dataset.sortKey === key;
        button.dataset.sortDirection = active ? direction : '';
        const th = button.closest('th');
        if (th) {
          th.setAttribute(
            'aria-sort',
            active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
          );
        }
      });
    }

    function set(nextKey) {
      if (keys.length && !keys.includes(nextKey)) return;

      if (key === nextKey) {
        direction = direction === 'asc' ? 'desc' : 'asc';
      } else {
        key = nextKey;
        direction = options.defaultDirectionByKey?.[nextKey] || 'asc';
      }

      setIndicators();
      if (typeof options.onChange === 'function') {
        options.onChange({ key, direction });
      }
    }

    function sort(items, getValue) {
      return items.slice().sort((a, b) => {
        const result = compareValues(getValue(a, key), getValue(b, key));
        return direction === 'asc' ? result : -result;
      });
    }

    if (root && !root.dataset.managerSortBound) {
      root.addEventListener('click', event => {
        const button = event.target.closest('[data-sort-key]');
        if (button && root.contains(button)) set(button.dataset.sortKey);
      });
      root.dataset.managerSortBound = 'true';
    }

    setIndicators();

    return {
      set,
      sort,
      updateIndicators: setIndicators,
      getState: () => ({ key, direction })
    };
  }

  function initDomSortableTable(table) {
    if (!table || table.dataset.managerDomSortBound) return;

    const tbody = table.tBodies?.[0];
    if (!tbody) return;

    const buttons = Array.from(table.querySelectorAll('thead [data-sort-key]'));
    if (!buttons.length) return;

    const keys = buttons.map(button => button.dataset.sortKey);
    const controller = createSortableTable({
      root: table,
      keys,
      defaultKey: table.dataset.defaultSortKey || keys[0],
      defaultDirection: table.dataset.defaultSortDirection || 'asc',
      onChange: ({ key, direction }) => {
        const button = table.querySelector(`[data-sort-key="${CSS.escape(key)}"]`);
        const th = button?.closest('th');
        if (!th) return;
        const columnIndex = Array.from(th.parentElement.children).indexOf(th);
        const rows = Array.from(tbody.rows);

        rows.sort((a, b) => {
          const av = a.cells[columnIndex]?.dataset.sortValue ?? a.cells[columnIndex]?.textContent ?? '';
          const bv = b.cells[columnIndex]?.dataset.sortValue ?? b.cells[columnIndex]?.textContent ?? '';
          const result = compareValues(av.trim(), bv.trim());
          return direction === 'asc' ? result : -result;
        });

        rows.forEach(row => tbody.appendChild(row));
      }
    });

    table.dataset.managerDomSortBound = 'true';
    controller.updateIndicators();
  }



  function initCanonicalScrollTable(wrap) {
    if (!wrap || wrap.dataset.managerAutoScrollBound) return;

    // Asset Library already has the canonical split-header implementation.
    if (
      wrap.classList.contains('asset-table-wrap') ||
      wrap.closest('.asset-grid-sticky') ||
      wrap.querySelector('.asset-body-table')
    ) {
      wrap.dataset.managerAutoScrollBound = 'true';
      return;
    }

    const table = wrap.querySelector('table.manager-canonical-table, table.library-table');
    if (!table) return;

    const sourceHead = table.tHead;
    if (!sourceHead) return;

    // Build one sticky unit: top horizontal scrollbar + separate header viewport.
    const sticky = document.createElement('div');
    sticky.className = 'manager-canonical-sticky';

    const top = document.createElement('div');
    top.className = 'manager-auto-top-scroll';
    top.setAttribute('aria-label', 'Horizontal table scroll');

    const inner = document.createElement('div');
    inner.className = 'manager-auto-top-scroll-inner';
    top.appendChild(inner);

    const headerViewport = document.createElement('div');
    headerViewport.className = 'manager-canonical-header-viewport';

    const headerTable = document.createElement('table');
    headerTable.className = `${table.className} manager-canonical-header-table`;
    headerTable.removeAttribute('id');
    headerTable.removeAttribute('data-manager-sortable');
    headerTable.removeAttribute('data-default-sort-key');
    headerTable.removeAttribute('data-default-sort-direction');

    // Preserve colgroup if the source table has one.
    const sourceColgroup = table.querySelector(':scope > colgroup');
    if (sourceColgroup) {
      headerTable.appendChild(sourceColgroup.cloneNode(true));
    }

    const clonedHead = sourceHead.cloneNode(true);
    clonedHead.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    headerTable.appendChild(clonedHead);

    headerViewport.appendChild(headerTable);
    sticky.appendChild(top);
    sticky.appendChild(headerViewport);
    wrap.parentNode.insertBefore(sticky, wrap);

    table.classList.add('manager-canonical-body-table');

    let currentLeft = 0;

    const syncIndicatorState = () => {
      const originalButtons =
        sourceHead.querySelectorAll('[data-sort-key]');
      const clonedButtons =
        clonedHead.querySelectorAll('[data-sort-key]');

      clonedButtons.forEach(clone => {
        const key = clone.dataset.sortKey;
        const original =
          [...originalButtons].find(button => button.dataset.sortKey === key);

        clone.dataset.sortDirection =
          original?.dataset.sortDirection || '';

        const originalTh = original?.closest('th');
        const cloneTh = clone.closest('th');

        if (cloneTh && originalTh) {
          cloneTh.setAttribute(
            'aria-sort',
            originalTh.getAttribute('aria-sort') || 'none'
          );
        }
      });
    };

    const applyHorizontalPosition = () => {
      const maxLeft =
        Math.max(0, table.scrollWidth - wrap.clientWidth);

      currentLeft =
        Math.max(0, Math.min(top.scrollLeft, maxLeft));

      table.style.transform =
        `translateX(${-currentLeft}px)`;

      headerTable.style.transform =
        `translateX(${-currentLeft}px)`;
    };

    const alignColumns = () => {
      // Always measure from a clean, natural table geometry.
      // This prevents widths applied by a previous alignment pass
      // from becoming the input of the next pass.

      table.style.transform = 'translateX(0px)';
      headerTable.style.transform = 'translateX(0px)';

      const sourceCells = sourceHead.rows[0]
        ? [...sourceHead.rows[0].cells]
        : [];

      const cloneCells = clonedHead.rows[0]
        ? [...clonedHead.rows[0].cells]
        : [];

      if (!sourceCells.length) return;

      const resetColgroup = targetTable => {
        const colgroup =
          targetTable.querySelector(':scope > colgroup');

        if (!colgroup) return;

        [...colgroup.children].forEach(col => {
          col.style.removeProperty('width');
          col.style.removeProperty('min-width');
          col.style.removeProperty('max-width');
        });
      };

      // Remove geometry imposed by the previous alignment run.
      resetColgroup(table);
      resetColgroup(headerTable);

      table.style.removeProperty('width');
      table.style.removeProperty('min-width');
      table.style.removeProperty('table-layout');

      headerTable.style.removeProperty('width');
      headerTable.style.removeProperty('min-width');
      headerTable.style.removeProperty('table-layout');

      [...sourceCells, ...cloneCells].forEach(cell => {
        cell.style.removeProperty('width');
        cell.style.removeProperty('min-width');
        cell.style.removeProperty('max-width');
        cell.style.boxSizing = 'border-box';
      });

      const bodyRow =
        table.tBodies?.[0]?.rows?.[0] || null;

      const geometryCells =
        bodyRow && bodyRow.cells.length === sourceCells.length
          ? [...bodyRow.cells]
          : sourceCells;

      if (!geometryCells.length) return;

      // Measure only after the old forced geometry has been removed.
      const widths = geometryCells.map(cell =>
        Math.max(
          1,
          Math.ceil(cell.getBoundingClientRect().width)
        )
      );

      const measuredWidth =
        widths.reduce((sum, width) => sum + width, 0);

      // At this point scrollWidth represents the natural table,
      // not the width imposed by the previous alignment pass.
      const naturalScrollWidth =
        Math.ceil(table.scrollWidth);

      const totalWidth =
        Math.max(
          measuredWidth,
          naturalScrollWidth,
          wrap.clientWidth
        );

      const applyColgroup = targetTable => {
        let colgroup =
          targetTable.querySelector(':scope > colgroup');

        if (!colgroup) {
          colgroup = document.createElement('colgroup');
          targetTable.insertBefore(
            colgroup,
            targetTable.firstChild
          );
        }

        while (colgroup.children.length < widths.length) {
          colgroup.appendChild(document.createElement('col'));
        }

        while (colgroup.children.length > widths.length) {
          colgroup.lastElementChild?.remove();
        }

        [...colgroup.children].forEach((col, index) => {
          const width = widths[index];

          col.style.width = `${width}px`;
          col.style.minWidth = `${width}px`;
          col.style.maxWidth = `${width}px`;
        });
      };

      applyColgroup(table);
      applyColgroup(headerTable);

      table.style.width = `${totalWidth}px`;
      table.style.minWidth = `${totalWidth}px`;
      table.style.tableLayout = 'fixed';

      headerTable.style.width = `${totalWidth}px`;
      headerTable.style.minWidth = `${totalWidth}px`;
      headerTable.style.tableLayout = 'fixed';

      inner.style.width = `${totalWidth}px`;

      currentLeft =
        Math.min(
          currentLeft,
          Math.max(0, totalWidth - wrap.clientWidth)
        );

      top.scrollLeft = currentLeft;

      applyHorizontalPosition();
      syncIndicatorState();
    };

    // Header clone forwards sorting to the real source header.
    clonedHead.addEventListener('click', event => {
      const cloneButton = event.target.closest('[data-sort-key]');
      if (!cloneButton) return;

      event.preventDefault();
      event.stopPropagation();

      const originalButton =
        sourceHead.querySelector(
          `[data-sort-key="${CSS.escape(cloneButton.dataset.sortKey)}"]`
        );

      if (originalButton) {
        originalButton.click();
        requestAnimationFrame(() => {
          alignColumns();
          syncIndicatorState();
        });
      }
    });

    top.addEventListener(
      'scroll',
      applyHorizontalPosition,
      { passive: true }
    );

    window.addEventListener('resize', alignColumns);

    if (window.ResizeObserver) {
      const observer =
        new ResizeObserver(() => requestAnimationFrame(alignColumns));
      observer.observe(wrap);
    }

    const bodyObserver =
      new MutationObserver(() =>
        requestAnimationFrame(alignColumns)
      );

    if (table.tBodies[0]) {
      bodyObserver.observe(
        table.tBodies[0],
        {
          childList: true,
          subtree: true,
          characterData: true
        }
      );
    }

    const mutationObserver =
      new MutationObserver(syncIndicatorState);

    mutationObserver.observe(sourceHead, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sort-direction', 'aria-sort']
    });

    wrap.dataset.managerAutoScrollBound = 'true';
    sticky.dataset.managerCanonicalSticky = 'true';
    sticky.dataset.managerCanonicalFor = wrap.id || '';

    const syncVisibility = () => {
      sticky.hidden = Boolean(wrap.hidden || wrap.closest('[hidden]'));
    };

    const visibilityObserver = new MutationObserver(syncVisibility);
    visibilityObserver.observe(wrap, {
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style']
    });
    let ancestor = wrap.parentElement;
    while (ancestor && ancestor !== document.body) {
      visibilityObserver.observe(ancestor, {
        attributes: true,
        attributeFilter: ['hidden', 'class', 'style']
      });
      ancestor = ancestor.parentElement;
    }

    requestAnimationFrame(() => {
      syncVisibility();
      alignColumns();
      syncIndicatorState();
    });
  }



  /* =========================================
     COMMON MEDIA THUMBNAIL + PREVIEW
     Canonical renderer for Asset / Knowledge / SNS / Queue.
     Add a new media type with:
       IXLManager.media.registerRenderer('kind', { thumbnail, preview })
     ========================================= */

  const managerMediaRenderers = new Map();
  let managerMediaAssetRegistry = null;
  let managerMediaAssetRegistryPromise = null;

  const MANAGER_MEDIA_DEFAULTS = Object.freeze({
    videoThumbnailTime: 1,
    pdfScale: 1.35,
    assetEndpoint: '/api/insights-library?resource=assets',
    assetProxyEndpoint: '/api/insights-library?resource=assetproxy&url='
  });

  function escapeManagerHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getManagerMediaExtension(value) {
    const clean = String(value || '').split('?')[0].split('#')[0];
    const fileName = clean.split('/').pop() || '';
    const dot = fileName.lastIndexOf('.');
    return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  }

  function getManagerYouTubeId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i
    );
    return match ? match[1] : '';
  }

  function getManagerMediaSource(media) {
    if (typeof media === 'string') return String(media || '').trim();

    const storageProvider = String(
      media?.storageProvider ||
      media?.provider ||
      media?.storage?.provider ||
      ''
    ).trim().toLowerCase();

    if (
      storageProvider === 'onedrive' &&
      media?.storageConnection &&
      media?.driveId &&
      media?.itemId
    ) {
      const params = new URLSearchParams({
        action: 'content',
        connection: media.storageConnection,
        driveId: media.driveId,
        itemId: media.itemId
      });
      return `/api/onedrive-assets?${params}`;
    }

    return String(
      media?.sourceUrl ||
      media?.url ||
      media?.asset ||
      media?.path ||
      media?.pathname ||
      media?.mediaFile ||
      ''
    ).trim();
  }

  function getManagerMediaType(media) {
    return String(
      typeof media === 'object'
        ? (media?.mediaType || media?.type || '')
        : ''
    ).trim().toLowerCase();
  }

  function getManagerMediaKind(media, options = {}) {
    const forced = String(options.kind || '').trim().toLowerCase();
    if (forced) return forced;

    const source = getManagerMediaSource(media);
    if (getManagerYouTubeId(source)) return 'youtube';

    const type = getManagerMediaType(media);
    const ext = getManagerMediaExtension(source);

    if (
      ['image', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(type) ||
      ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)
    ) return 'image';

    if (
      ['video', 'mp4', 'mov', 'm4v', 'webm'].includes(type) ||
      ['mp4', 'mov', 'm4v', 'webm'].includes(ext)
    ) return 'video';

    if (type === 'pdf' || type === 'document/pdf' || ext === 'pdf') return 'pdf';

    if (
      ['markdown', 'md', 'txt', 'text'].includes(type) ||
      ['md', 'txt'].includes(ext)
    ) return 'text';

    if (
      ['presentation', 'ppt', 'pptx'].includes(type) ||
      ['ppt', 'pptx'].includes(ext)
    ) return 'presentation';

    if (
      ['document', 'doc', 'docx'].includes(type) ||
      ['doc', 'docx'].includes(ext)
    ) return 'document';

    if (type === 'external' || type === 'link') return 'link';
    return source ? 'file' : 'none';
  }

  function getManagerThumbnailTime(media, options = {}) {
    const candidates = [
      options.thumbnailTime,
      typeof media === 'object' ? media?.thumbnailTime : null,
      MANAGER_MEDIA_DEFAULTS.videoThumbnailTime
    ];

    for (const raw of candidates) {
      if (raw === null || raw === undefined || raw === '') continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) return value;
    }

    return MANAGER_MEDIA_DEFAULTS.videoThumbnailTime;
  }

  async function loadManagerMediaAssets(force = false) {
    if (!force && Array.isArray(managerMediaAssetRegistry)) {
      return managerMediaAssetRegistry;
    }

    if (!force && managerMediaAssetRegistryPromise) {
      return managerMediaAssetRegistryPromise;
    }

    managerMediaAssetRegistryPromise = fetch(MANAGER_MEDIA_DEFAULTS.assetEndpoint, {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(async response => {
        const data = await response.json();
        managerMediaAssetRegistry = response.ok && Array.isArray(data) ? data : [];
        return managerMediaAssetRegistry;
      })
      .catch(() => {
        managerMediaAssetRegistry = [];
        return managerMediaAssetRegistry;
      })
      .finally(() => {
        managerMediaAssetRegistryPromise = null;
      });

    return managerMediaAssetRegistryPromise;
  }

  function setManagerMediaAssets(items) {
    managerMediaAssetRegistry = Array.isArray(items) ? items : [];
    managerMediaAssetRegistryPromise = null;
    return managerMediaAssetRegistry;
  }

  function findManagerMediaAsset(assetKey) {
    const key = String(assetKey || '').trim();
    if (!key || !Array.isArray(managerMediaAssetRegistry)) return null;
    return managerMediaAssetRegistry.find(item => String(item?.key || '').trim() === key) || null;
  }

  function getManagerMediaSourceIdentities(media) {
    const values = [
      typeof media === 'string' ? media : '',
      media?.sourceUrl,
      media?.url,
      media?.pathname,
      media?.path,
      media?.asset,
      media?.mediaFile
    ];

    const identities = new Set();

    values.forEach(value => {
      const raw = String(value || '').trim();
      if (!raw) return;

      const stripped = raw.split('#')[0].split('?')[0].replace(/\\/g, '/');
      identities.add(stripped.toLowerCase());
      identities.add(stripped.replace(/^\.\//, '').replace(/^\//, '').toLowerCase());

      try {
        const parsed = new URL(raw, window.location.origin);
        const pathname = decodeURIComponent(parsed.pathname || '')
          .replace(/\\/g, '/')
          .replace(/^\//, '')
          .toLowerCase();
        if (pathname) identities.add(pathname);
      } catch (error) {}
    });

    return identities;
  }

  function findManagerMediaAssetBySource(media) {
    if (!Array.isArray(managerMediaAssetRegistry)) return null;

    const target = getManagerMediaSourceIdentities(media);
    if (!target.size) return null;

    return managerMediaAssetRegistry.find(item => {
      const candidate = getManagerMediaSourceIdentities(item);
      for (const identity of candidate) {
        if (target.has(identity)) return true;
      }
      return false;
    }) || null;
  }

  async function resolveManagerMedia(media, options = {}) {
    const input = typeof media === 'object' && media ? { ...media } : { url: media };
    const requestedAssetKey = String(input.assetKey || options.assetKey || '').trim();
    const inputSource = getManagerMediaSource(input);

    let registered = requestedAssetKey ? findManagerMediaAsset(requestedAssetKey) : null;

    if (!registered && options.resolveAsset !== false) {
      await loadManagerMediaAssets();
      registered =
        (requestedAssetKey ? findManagerMediaAsset(requestedAssetKey) : null) ||
        findManagerMediaAssetBySource(input);
    }

    const authoritativeAssetKey = String(
      registered?.key ||
      requestedAssetKey ||
      ''
    ).trim();

    const source = String(
      options.sourceUrl ||
      registered?.url ||
      registered?.pathname ||
      registered?.path ||
      registered?.asset ||
      inputSource ||
      ''
    ).trim();

    const registeredThumbnailTime =
      registered?.thumbnailTime === null ||
      registered?.thumbnailTime === undefined ||
      registered?.thumbnailTime === ''
        ? null
        : Number(registered.thumbnailTime);

    const inputThumbnailTime =
      input?.thumbnailTime === null ||
      input?.thumbnailTime === undefined ||
      input?.thumbnailTime === ''
        ? null
        : Number(input.thumbnailTime);

    const authoritativeThumbnailTime =
      options.thumbnailTime !== null &&
      options.thumbnailTime !== undefined &&
      options.thumbnailTime !== ''
        ? Number(options.thumbnailTime)
        : Number.isFinite(registeredThumbnailTime)
          ? registeredThumbnailTime
          : Number.isFinite(inputThumbnailTime)
            ? inputThumbnailTime
            : MANAGER_MEDIA_DEFAULTS.videoThumbnailTime;

    const merged = {
      ...input,
      ...(registered || {}),
      sourceUrl: source,
      url: source,
      assetKey: authoritativeAssetKey,
      thumbnailTime: authoritativeThumbnailTime
    };

    merged.kind = getManagerMediaKind(merged, options);
    merged.thumbnailTime = getManagerThumbnailTime(merged, {
      ...options,
      thumbnailTime: authoritativeThumbnailTime
    });

    return merged;
  }

  function managerMediaElementHtml(media, options = {}) {
    const resolved = typeof media === 'object' && media ? media : { url: media };
    const source = getManagerMediaSource(resolved);
    const kind = getManagerMediaKind(resolved, options);
    const safeSource = escapeManagerHtml(toManagerUrl(source));
    const label = escapeManagerHtml(
      options.alt ||
      resolved?.name ||
      resolved?.fileName ||
      resolved?.title ||
      'Media'
    );

    if (!source || kind === 'none') {
      return options.emptyHtml || '<span class="manager-media-empty">No Media</span>';
    }

    const renderer = managerMediaRenderers.get(kind);
    const rendererMode = options.mode === 'preview' ? 'preview' : 'thumbnail';
    if (renderer && typeof renderer[rendererMode] === 'function') {
      return renderer[rendererMode](resolved, options);
    }

    if (kind === 'image') {
      return `<img src="${safeSource}" alt="${label}">`;
    }

    if (kind === 'video') {
      const time = getManagerThumbnailTime(resolved, options);
      const controls = options.controls ? ' controls' : '';
      return `<video${controls} muted preload="metadata" src="${safeSource}#t=${Number(time)}"></video>`;
    }

    if (kind === 'youtube') {
      const youtubeId = getManagerYouTubeId(source);
      return youtubeId
        ? `<iframe src="https://www.youtube.com/embed/${escapeManagerHtml(youtubeId)}" title="${label}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
        : `<a href="${safeSource}" target="_blank" rel="noopener">View media</a>`;
    }

    if (kind === 'pdf') {
      return `<iframe src="${safeSource}#page=1&view=FitH" title="${label}"></iframe>`;
    }

    return `<a href="${safeSource}" target="_blank" rel="noopener">View media</a>`;
  }


  async function renderManagerPdfThumbnailCanvas(stage, resolved, options = {}) {
    const source = getManagerMediaSource(resolved);
    if (!stage || !source || !window.pdfjsLib) return false;

    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        options.pdfWorkerSrc ||
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const proxyUrl = source.startsWith('blob:')
        ? source
        : `${MANAGER_MEDIA_DEFAULTS.assetProxyEndpoint}${encodeURIComponent(source)}`;

      const pdf = await window.pdfjsLib.getDocument(proxyUrl).promise;
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });

      const maxWidth = Math.max(60, Number(options.thumbnailWidth || stage.clientWidth || 180));
      const maxHeight = Math.max(48, Number(options.thumbnailHeight || stage.clientHeight || 112));
      const scale = Math.min(
        maxWidth / baseViewport.width,
        maxHeight / baseViewport.height
      );

      const viewport = page.getViewport({ scale: Math.max(scale, 0.1) });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.style.display = 'block';
      canvas.style.maxWidth = '100%';
      canvas.style.maxHeight = '100%';
      canvas.style.margin = 'auto';

      stage.replaceChildren(canvas);

      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0]
      }).promise;

      return true;
    } catch (error) {
      console.error('PDF thumbnail could not be rendered:', error);
      return false;
    }
  }

  async function renderManagerMediaThumbnail(target, media, options = {}) {
    const stage = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!stage) return null;

    const resolved = options.resolved === true
      ? media
      : await resolveManagerMedia(media, options);

    const kind = getManagerMediaKind(resolved, options);

    if (kind === 'pdf' && window.pdfjsLib) {
      const rendered = await renderManagerPdfThumbnailCanvas(stage, resolved, options);
      if (rendered) return resolved;
    }

    stage.innerHTML = managerMediaElementHtml(resolved, {
      ...options,
      mode: 'thumbnail',
      controls: false
    });

    return resolved;
  }

  async function renderManagerMediaPreview(target, media, options = {}) {
    const stage = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!stage) return null;

    const resolved = options.resolved === true
      ? media
      : await resolveManagerMedia(media, options);

    const source = getManagerMediaSource(resolved);
    const kind = getManagerMediaKind(resolved, options);

    if (!source || kind === 'none') {
      stage.innerHTML = options.emptyHtml || '<div class="manager-media-empty">No media</div>';
      return resolved;
    }

    const renderer = managerMediaRenderers.get(kind);
    if (renderer && typeof renderer.preview === 'function') {
      const custom = await renderer.preview(resolved, options, stage);
      if (typeof custom === 'string') stage.innerHTML = custom;
      return resolved;
    }

    if (kind === 'pdf' && options.pdfCanvas !== false && window.pdfjsLib) {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          options.pdfWorkerSrc ||
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const proxyUrl = source.startsWith('blob:')
          ? source
          : `${MANAGER_MEDIA_DEFAULTS.assetProxyEndpoint}${encodeURIComponent(source)}`;

        const pdf = await window.pdfjsLib.getDocument(proxyUrl).promise;
        const page = await pdf.getPage(Number(options.pdfPage || 1));
        const viewport = page.getViewport({
          scale: Number(options.pdfScale || MANAGER_MEDIA_DEFAULTS.pdfScale)
        });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        stage.innerHTML = '';
        stage.appendChild(canvas);
        await page.render({ canvasContext: context, viewport }).promise;
        return resolved;
      } catch (error) {
        console.error(error);
      }
    }

    if (kind === 'text' && options.loadText !== false) {
      try {
        const response = await fetch(source, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Text preview could not be loaded.');
        const body = await response.text();
        stage.innerHTML = `<pre>${escapeManagerHtml(body.slice(0, Number(options.maxTextLength || 30000)))}</pre>`;
        return resolved;
      } catch (error) {
        console.error(error);
      }
    }

    stage.innerHTML = managerMediaElementHtml(resolved, {
      ...options,
      mode: 'preview',
      controls: kind === 'video' ? options.controls !== false : false
    });

    if (kind === 'video') {
      const player = stage.querySelector('video');
      const thumbnailTime = getManagerThumbnailTime(resolved, options);

      if (player) {
        const startPlayback = () => {
          try {
            if (thumbnailTime > 0) player.currentTime = thumbnailTime;
          } catch (error) {}

          if (options.autoplay === true) {
            player.play().catch(() => {});
          }
        };

        if (player.readyState >= 1) startPlayback();
        else player.addEventListener('loadedmetadata', startPlayback, { once: true });
      }
    }

    return resolved;
  }

  function ensureManagerMediaViewer() {
    let viewer = document.getElementById('manager-media-viewer');

    if (!document.getElementById('manager-media-viewer-style')) {
      const style = document.createElement('style');
      style.id = 'manager-media-viewer-style';
      style.textContent = `
        [data-manager-media-action="preview"] img,
        [data-manager-media-action="preview"] video,
        [data-manager-media-action="preview"] iframe,
        [data-manager-media-action="preview"] canvas {
          pointer-events: none;
        }

        body.manager-media-viewer-open {
          overflow: hidden;
        }

        .manager-media-viewer {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 24px;
          box-sizing: border-box;
          background: rgba(8, 22, 38, 0.72);
        }

        .manager-media-viewer.open {
          display: flex;
        }

        .manager-media-viewer-dialog {
          width: min(1180px, 96vw);
          height: min(860px, 92vh);
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          overflow: hidden;
          border-radius: 12px;
          background: #fff;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.38);
        }

        .manager-media-viewer-head {
          min-height: 58px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px 10px 18px;
          box-sizing: border-box;
          border-bottom: 1px solid #dfe5ec;
          background: #fff;
        }

        .manager-media-viewer-title {
          min-width: 0;
          flex: 1;
          margin: 0;
          overflow: hidden;
          color: #17324d;
          font-size: 15px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .manager-media-viewer-open-link,
        .manager-media-viewer-close {
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          border: 1px solid #cfd8e3;
          border-radius: 7px;
          background: #fff;
          color: #17324d;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
        }

        .manager-media-viewer-open-link {
          padding: 0 12px;
        }

        .manager-media-viewer-close {
          width: 38px;
          padding: 0;
          font-size: 22px;
          line-height: 1;
        }

        .manager-media-viewer-open-link:hover,
        .manager-media-viewer-close:hover {
          background: #f2f6fa;
        }

        .manager-media-viewer-body {
          min-height: 0;
          overflow: auto;
          display: flex;
          align-items: stretch;
          justify-content: center;
          background: #eef2f6;
        }

        .manager-media-viewer-body > img {
          max-width: 100%;
          max-height: 100%;
          margin: auto;
          object-fit: contain;
        }

        .manager-media-viewer-body > video {
          width: 100%;
          height: 100%;
          background: #000;
          object-fit: contain;
        }

        .manager-media-viewer-body > iframe {
          width: 100%;
          height: 100%;
          min-height: 100%;
          border: 0;
          background: #fff;
        }

        .manager-media-viewer-body > pre {
          width: 100%;
          min-height: 100%;
          margin: 0;
          padding: 28px;
          box-sizing: border-box;
          overflow: auto;
          background: #fff;
          color: #24384d;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .manager-media-viewer-message {
          width: min(720px, calc(100% - 48px));
          margin: auto;
          padding: 28px;
          box-sizing: border-box;
          border-radius: 10px;
          background: #fff;
          color: #44515f;
          text-align: center;
          line-height: 1.6;
        }

        @media (max-width: 760px) {
          .manager-media-viewer {
            padding: 10px;
          }

          .manager-media-viewer-dialog {
            width: 100%;
            height: 94vh;
          }

          .manager-media-viewer-open-link {
            display: none;
          }
        }
      `;
      document.head.appendChild(style);
    }

    if (viewer) return viewer;

    viewer = document.createElement('div');
    viewer.id = 'manager-media-viewer';
    viewer.className = 'manager-media-viewer';
    viewer.setAttribute('aria-hidden', 'true');

    viewer.innerHTML = `
      <div class="manager-media-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="manager-media-viewer-title">
        <div class="manager-media-viewer-head">
          <h3 class="manager-media-viewer-title" id="manager-media-viewer-title">Media Viewer</h3>
          <a class="manager-media-viewer-open-link" data-manager-media-viewer-open target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
          <button type="button" class="manager-media-viewer-close" data-manager-media-viewer-close aria-label="Close media viewer">×</button>
        </div>
        <div class="manager-media-viewer-body" data-manager-media-viewer-body></div>
      </div>
    `;

    const close = () => closeManagerMediaViewer();

    viewer.addEventListener('click', event => {
      if (event.target === viewer || event.target.closest('[data-manager-media-viewer-close]')) {
        close();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && viewer.classList.contains('open')) {
        close();
      }
    });

    document.body.appendChild(viewer);
    return viewer;
  }

  function closeManagerMediaViewer() {
    const viewer = document.getElementById('manager-media-viewer');
    if (!viewer) return;

    const body = viewer.querySelector('[data-manager-media-viewer-body]');
    const player = body?.querySelector('video');

    if (player) {
      try {
        player.pause();
        player.removeAttribute('src');
        player.load();
      } catch (error) {}
    }

    if (body) body.replaceChildren();

    viewer.classList.remove('open');
    viewer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('manager-media-viewer-open');
  }

  function getManagerViewerLabel(media, kind) {
    return String(
      media?.title ||
      media?.label ||
      media?.name ||
      media?.fileName ||
      media?.key ||
      (kind === 'video' ? 'Video' :
       kind === 'pdf' ? 'PDF' :
       kind === 'document' ? 'Document' :
       kind === 'presentation' ? 'Presentation' :
       'Media')
    ).trim();
  }

  function getManagerOfficeViewerUrl(source) {
    const raw = String(source || '').trim();
    if (!raw) return '';

    try {
      const absolute = new URL(toManagerUrl(raw), window.location.href);
      if (!/^https?:$/i.test(absolute.protocol)) return '';
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absolute.href)}`;
    } catch (error) {
      return '';
    }
  }

  async function renderManagerMediaViewerContent(stage, resolved, options = {}) {
    const source = getManagerMediaSource(resolved);
    const kind = getManagerMediaKind(resolved, options);
    const safeSource = escapeManagerHtml(toManagerUrl(source));
    const label = escapeManagerHtml(getManagerViewerLabel(resolved, kind));

    if (!source || kind === 'none') {
      stage.innerHTML = options.emptyHtml || '<div class="manager-media-viewer-message">No media</div>';
      return;
    }

    const renderer = managerMediaRenderers.get(kind);
    if (renderer && typeof renderer.preview === 'function') {
      const custom = await renderer.preview(resolved, {
        ...options,
        viewer: true
      }, stage);
      if (typeof custom === 'string') stage.innerHTML = custom;
      return;
    }

    if (kind === 'image') {
      stage.innerHTML = `<img src="${safeSource}" alt="${label}">`;
      return;
    }

    if (kind === 'video') {
      const time = getManagerThumbnailTime(resolved, options);
      stage.innerHTML = `<video controls autoplay preload="metadata" src="${safeSource}#t=${Number(time)}"></video>`;

      const player = stage.querySelector('video');
      if (player) {
        const startPlayback = () => {
          try {
            if (time > 0 && player.currentTime < time) player.currentTime = time;
          } catch (error) {}
          player.play().catch(() => {});
        };

        if (player.readyState >= 1) startPlayback();
        else player.addEventListener('loadedmetadata', startPlayback, { once: true });
      }
      return;
    }

    if (kind === 'youtube') {
      const youtubeId = getManagerYouTubeId(source);
      stage.innerHTML = youtubeId
        ? `<iframe src="https://www.youtube.com/embed/${escapeManagerHtml(youtubeId)}?autoplay=1" title="${label}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
        : `<div class="manager-media-viewer-message">This video cannot be embedded.</div>`;
      return;
    }

    if (kind === 'pdf') {
      /*
       * Viewer mode intentionally uses the browser PDF viewer, not PDF.js canvas.
       * A canvas only renders one page; the iframe keeps the whole PDF scrollable.
       */
      stage.innerHTML = `<iframe src="${safeSource}#view=FitH" title="${label}"></iframe>`;
      return;
    }

    if (kind === 'text') {
      try {
        const response = await fetch(toManagerUrl(source), { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Text preview could not be loaded.');
        const body = await response.text();
        stage.innerHTML = `<pre>${escapeManagerHtml(body.slice(0, Number(options.maxTextLength || 100000)))}</pre>`;
      } catch (error) {
        console.error(error);
        stage.innerHTML = `<iframe src="${safeSource}" title="${label}"></iframe>`;
      }
      return;
    }

    if (kind === 'document' || kind === 'presentation') {
      const officeViewerUrl = getManagerOfficeViewerUrl(source);
      if (officeViewerUrl) {
        stage.innerHTML = `<iframe src="${escapeManagerHtml(officeViewerUrl)}" title="${label}" allowfullscreen></iframe>`;
      } else {
        stage.innerHTML = `
          <div class="manager-media-viewer-message">
            This document cannot be embedded in the browser from its current source.
            Use “Open in new tab” above to view or download it.
          </div>
        `;
      }
      return;
    }

    if (kind === 'link' || kind === 'file') {
      stage.innerHTML = `<iframe src="${safeSource}" title="${label}"></iframe>`;
      return;
    }

    stage.innerHTML = `<div class="manager-media-viewer-message">Preview is not available for this media type.</div>`;
  }

  async function openManagerMediaViewer(media, options = {}) {
    const resolved = options.resolved === true
      ? media
      : await resolveManagerMedia(media, options);

    const source = getManagerMediaSource(resolved);
    const kind = getManagerMediaKind(resolved, options);
    if (!source || kind === 'none') return resolved;

    const viewer = ensureManagerMediaViewer();
    const body = viewer.querySelector('[data-manager-media-viewer-body]');
    const title = viewer.querySelector('#manager-media-viewer-title');
    const openLink = viewer.querySelector('[data-manager-media-viewer-open]');

    if (title) title.textContent = getManagerViewerLabel(resolved, kind);

    if (openLink) {
      openLink.href = toManagerUrl(source);
      openLink.hidden = kind === 'youtube';
    }

    viewer.classList.add('open');
    viewer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('manager-media-viewer-open');

    if (body) {
      body.innerHTML = '<div class="manager-media-viewer-message">Loading...</div>';
      await renderManagerMediaViewerContent(body, resolved, options);
    }

    viewer.querySelector('[data-manager-media-viewer-close]')?.focus();
    return resolved;
  }

  async function mountManagerMedia(target, media, options = {}) {
    const stage = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!stage) return null;

    const resolved = await resolveManagerMedia(media, options);
    const source = getManagerMediaSource(resolved);
    const kind = getManagerMediaKind(resolved, options);

    if (!source || kind === 'none') {
      if (typeof options.onEmpty === 'function') {
        await options.onEmpty(stage, resolved);
      } else {
        stage.innerHTML = options.emptyHtml || '<div class="manager-media-empty">No media</div>';
      }
      return resolved;
    }

    const buttonClass = String(
      options.buttonClass ||
      'manager-media-interactive'
    );

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = buttonClass;
    trigger.dataset.managerMediaAction = 'preview';
    trigger.setAttribute(
      'aria-label',
      kind === 'video' ? 'Play media' :
      kind === 'pdf' ? 'Open PDF' :
      'View media'
    );

    stage.replaceChildren(trigger);

    if (kind === 'pdf' && window.pdfjsLib) {
      const rendered = await renderManagerPdfThumbnailCanvas(trigger, resolved, options);
      if (!rendered) {
        trigger.innerHTML = managerMediaElementHtml(resolved, {
          ...options,
          mode: 'thumbnail',
          controls: false
        });
      }
    } else {
      trigger.innerHTML = managerMediaElementHtml(resolved, {
        ...options,
        mode: 'thumbnail',
        controls: false
      });
    }

    trigger.addEventListener('click', async () => {
      if (kind === 'pdf') {
        /*
         * PDF skips the IXL modal entirely.
         * Open the actual PDF directly so the browser/Acrobat viewer handles
         * page navigation, thumbnails, zoom, print and download in one step.
         */
        const pdfUrl = toManagerUrl(source);
        const opened = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
        if (!opened) window.location.href = pdfUrl;
        return;
      }

      await openManagerMediaViewer(resolved, {
        ...options,
        resolved: true
      });
    });

    return resolved;
  }

  function registerManagerMediaRenderer(kind, renderer) {
    const key = String(kind || '').trim().toLowerCase();
    if (!key || !renderer) return;
    managerMediaRenderers.set(key, renderer);
  }

  const managerMedia = {
    defaults: MANAGER_MEDIA_DEFAULTS,
    detectKind: getManagerMediaKind,
    getSourceUrl: getManagerMediaSource,
    getThumbnailTime: getManagerThumbnailTime,
    getYouTubeId: getManagerYouTubeId,
    elementHtml: managerMediaElementHtml,
    resolve: resolveManagerMedia,
    loadAssets: loadManagerMediaAssets,
    setAssets: setManagerMediaAssets,
    findAssetByKey: findManagerMediaAsset,
    findAssetBySource: findManagerMediaAssetBySource,
    renderThumbnail: renderManagerMediaThumbnail,
    renderPreview: renderManagerMediaPreview,
    openViewer: openManagerMediaViewer,
    closeViewer: closeManagerMediaViewer,
    mount: mountManagerMedia,
    registerRenderer: registerManagerMediaRenderer
  };



  /* =========================================
     COMMON MANAGER NAVIGATION
     Global menu + navigation primitives.
     Consumers provide destination/state; they do not rebuild navigation behavior.
     ========================================= */

  const MANAGER_NAV_ITEMS = Object.freeze([
    { id: 'dashboard', label: 'Dashboard', href: 'index.html' },
    { id: 'knowledge', label: 'Knowledge', href: 'knowledge.html' },
    { id: 'distribution', label: 'Distribution', href: 'distribution.html' },
    { id: 'community', label: 'Community', href: 'index.html#community' },
    { id: 'education', label: 'Education', href: 'index.html#education' },
    { id: 'business', label: 'Business', href: 'index.html#business' },
    { id: 'analytics', label: 'Analytics', href: 'index.html#analytics' },
    { id: 'system', label: 'System', href: 'index.html#system' },
    { id: 'website', label: 'View Website ↗', href: '../index.html', className: 'website-link' }
  ]);

  function renderManagerNav(root = document) {
    root.querySelectorAll('.manager-nav[data-manager-nav]').forEach(nav => {
      const activeId = String(nav.dataset.managerNav || '').trim().toLowerCase();

      nav.replaceChildren(...MANAGER_NAV_ITEMS.map(item => {
        const link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;

        if (item.className) link.classList.add(item.className);

        if (item.id === activeId) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }

        return link;
      }));
    });
  }

  function getManagerNavigationParams(search = window.location.search) {
    return new URLSearchParams(search || '');
  }

  function buildManagerNavigationUrl(path, params = null, hash = '') {
    const rawPath = String(path || '').trim() || window.location.pathname;
    const url = new URL(rawPath, window.location.href);

    if (params instanceof URLSearchParams) {
      url.search = params.toString();
    } else if (params && typeof params === 'object') {
      const next = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        next.set(key, String(value));
      });
      url.search = next.toString();
    }

    if (hash !== null && hash !== undefined) {
      const cleanHash = String(hash || '').trim();
      url.hash = cleanHash ? (cleanHash.startsWith('#') ? cleanHash : `#${cleanHash}`) : '';
    }

    const sameOrigin = url.origin === window.location.origin;
    return sameOrigin
      ? `${url.pathname.split('/').pop() || ''}${url.search}${url.hash}`
      : url.href;
  }

  function goManagerNavigation(target, options = {}) {
    const url = String(target || '').trim();
    if (!url) return;

    if (options.replace === true) {
      window.location.replace(url);
    } else {
      window.location.href = url;
    }
  }

  function pushManagerView(view, state = {}, hash = '') {
    const managerView = String(view || '').trim();
    if (!managerView) return;

    const nextState = {
      ...(history.state || {}),
      ...state,
      managerView
    };

    const cleanHash = String(hash || '').trim();
    const nextUrl =
      `${window.location.pathname}${window.location.search}` +
      (cleanHash ? (cleanHash.startsWith('#') ? cleanHash : `#${cleanHash}`) : '');

    history.pushState(nextState, '', nextUrl);
  }

  function replaceManagerView(view, state = {}, hash = '') {
    const managerView = String(view || '').trim();
    const nextState = {
      ...(history.state || {}),
      ...state,
      ...(managerView ? { managerView } : {})
    };

    const cleanHash = String(hash || '').trim();
    const nextUrl =
      `${window.location.pathname}${window.location.search}` +
      (cleanHash ? (cleanHash.startsWith('#') ? cleanHash : `#${cleanHash}`) : '');

    history.replaceState(nextState, '', nextUrl);
  }

  function isManagerView(view) {
    return String(history.state?.managerView || history.state?.builderView || '') === String(view || '');
  }

  function backManagerNavigation(fallback = '') {
    if (history.state?.managerView || history.state?.builderView) {
      history.back();
      return true;
    }

    if (fallback) {
      goManagerNavigation(fallback);
      return true;
    }

    return false;
  }

  const managerNavigation = Object.freeze({
    items: MANAGER_NAV_ITEMS,
    render: renderManagerNav,
    getParams: getManagerNavigationParams,
    buildUrl: buildManagerNavigationUrl,
    go: goManagerNavigation,
    replace: target => goManagerNavigation(target, { replace: true }),
    pushView: pushManagerView,
    replaceView: replaceManagerView,
    isView: isManagerView,
    back: backManagerNavigation
  });

  /* =========================================
     COMMON SECOND-SCREEN SHELL
     One runtime structure contract for Builder Review,
     Knowledge Deep-Down, Asset/Usage and governance editors.
     ========================================= */
  function initDetailShell(root) {
    if (!root || root.dataset?.managerDetailShellBound === 'true') return;

    root.classList.add('manager-second-screen-shell');

    const header = root.querySelector(':scope > .manager-detail-header');
    if (header) header.classList.add('manager-second-screen-head');

    const actions = header?.querySelector('.library-actions, .knowledge-detail-actions, .manager-detail-actions');
    if (actions) actions.classList.add('manager-second-screen-actions');

    const layout = root.querySelector(':scope > .manager-detail-layout, :scope > .manager-detail-grid');
    if (layout) layout.classList.add('manager-second-screen-grid');

    const preview = layout?.querySelector('.manager-detail-preview-card');
    if (preview) preview.classList.add('manager-second-screen-preview');

    const content = layout?.querySelector('.manager-detail-form');
    if (content) content.classList.add('manager-second-screen-content');

    root.querySelectorAll('.manager-detail-system-info').forEach(node =>
      node.classList.add('manager-second-screen-system')
    );

    root.querySelectorAll('.manager-detail-actions, .asset-form-actions').forEach(node =>
      node.classList.add('manager-second-screen-form-actions')
    );

    root.dataset.managerDetailShellBound = 'true';
  }

  function initDetailShells(root = document) {
    root.querySelectorAll('.manager-detail-screen, .knowledge-detail-panel').forEach(initDetailShell);
  }

  function initManagerUi(root = document) {
    renderManagerNav(root);
    root.querySelectorAll('table[data-manager-sortable]').forEach(initDomSortableTable);
    root.querySelectorAll('.manager-canonical-table-wrap, .library-table-wrap').forEach(initCanonicalScrollTable);
    initDetailShells(root);
  }

  window.IXLManager = {
    toUrl: toManagerUrl,
    normalizeUrl: normalizeManagerUrl,
    sameUrl: sameManagerUrl,
    syncScrollTable,
    compareValues,
    createSortableTable,
    initCanonicalScrollTable,
    media: managerMedia,
    navigation: managerNavigation,
    initDetailShell,
    initDetailShells,
    initManagerUi
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initManagerUi());
  } else {
    initManagerUi();
  }
})();
