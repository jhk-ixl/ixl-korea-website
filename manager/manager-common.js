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

  async function renderManagerMediaThumbnail(target, media, options = {}) {
    const stage = typeof target === 'string'
      ? document.getElementById(target)
      : target;
    if (!stage) return null;

    const resolved = options.resolved === true
      ? media
      : await resolveManagerMedia(media, options);

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

    const actionLabel = String(
      options.actionLabel ||
      (kind === 'video' ? 'PLAY' : 'VIEW')
    );

    const buttonClass = String(
      options.buttonClass ||
      'manager-media-interactive'
    );

    const actionClass = String(
      options.actionClass ||
      'manager-media-action'
    );

    const thumbnailHtml = managerMediaElementHtml(resolved, {
      ...options,
      mode: 'thumbnail',
      controls: false
    });

    stage.innerHTML = `
      <button type="button" class="${escapeManagerHtml(buttonClass)}" data-manager-media-action="preview">
        ${thumbnailHtml}
        <span class="${escapeManagerHtml(actionClass)}">${escapeManagerHtml(actionLabel)}</span>
      </button>
    `;

    const trigger = stage.querySelector('[data-manager-media-action="preview"]');
    if (trigger) {
      trigger.addEventListener('click', async () => {
        stage.classList.add(options.playingClass || 'is-playing');

        await renderManagerMediaPreview(stage, resolved, {
          ...options,
          resolved: true,
          controls: options.controls !== false,
          autoplay: kind === 'video' ? options.autoplay !== false : false
        });
      });
    }

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
