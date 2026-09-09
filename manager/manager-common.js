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



  function ensureCanonicalStickyStyles() {
    if (document.getElementById('manager-native-sticky-table-styles')) return;

    const style = document.createElement('style');
    style.id = 'manager-native-sticky-table-styles';
    style.textContent = `
      .manager-canonical-sticky {
        position: sticky;
        top: 0;
        z-index: 30;
        background: #fff;
      }

      .manager-auto-top-scroll {
        overflow-x: auto;
        overflow-y: hidden;
        height: 18px;
        scrollbar-gutter: stable;
        background: #fff;
      }

      .manager-auto-top-scroll-inner {
        height: 1px;
      }

      .manager-native-sticky-wrap {
        overflow: hidden !important;
      }

      .manager-native-sticky-table {
        border-collapse: separate;
        border-spacing: 0;
      }

      .manager-native-sticky-table thead th {
        position: sticky;
        top: 18px;
        z-index: 20;
        background: #f8fafc;
      }

      .manager-native-sticky-table thead th::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1px;
        height: 1px;
        background: #dbe3ec;
      }
    `;
    document.head.appendChild(style);
  }


  function initCanonicalScrollTable(wrap) {
    if (!wrap || wrap.dataset.managerAutoScrollBound) return;

    // Asset Library has its own split-grid implementation.
    if (
      wrap.classList.contains('asset-table-wrap') ||
      wrap.closest('.asset-grid-sticky') ||
      wrap.querySelector('.asset-body-table')
    ) {
      wrap.dataset.managerAutoScrollBound = 'true';
      return;
    }

    const table = wrap.querySelector(
      'table.manager-canonical-table, table.library-table'
    );
    if (!table || !table.tHead) return;

    ensureCanonicalStickyStyles();

    /*
      Canonical list geometry:
      - ONE real table only (thead + tbody stay together)
      - top horizontal scrollbar drives the table's X transform
      - the real thead is sticky during page scroll
      Because header and rows remain in the same table, columns cannot drift.
    */
    const sticky = document.createElement('div');
    sticky.className = 'manager-canonical-sticky';

    const top = document.createElement('div');
    top.className = 'manager-auto-top-scroll';
    top.setAttribute('aria-label', 'Horizontal table scroll');

    const inner = document.createElement('div');
    inner.className = 'manager-auto-top-scroll-inner';

    top.appendChild(inner);
    sticky.appendChild(top);
    wrap.parentNode.insertBefore(sticky, wrap);

    wrap.classList.add('manager-native-sticky-wrap');
    table.classList.add('manager-native-sticky-table');

    // Remove legacy cloned-header state if this function is re-run on a page
    // that still contains old generated markup.
    const previousHeaderViewport =
      sticky.querySelector('.manager-canonical-header-viewport');
    if (previousHeaderViewport) previousHeaderViewport.remove();

    let currentLeft = 0;

    const getTotalWidth = () =>
      Math.max(
        table.scrollWidth,
        table.getBoundingClientRect().width,
        wrap.clientWidth
      );

    const applyHorizontalPosition = () => {
      const totalWidth = getTotalWidth();
      const maxLeft = Math.max(0, totalWidth - wrap.clientWidth);

      currentLeft = Math.max(
        0,
        Math.min(top.scrollLeft, maxLeft)
      );

      table.style.transform = `translateX(${-currentLeft}px)`;
      table.style.transformOrigin = 'top left';
    };

    const alignTable = () => {
      // Temporarily reset X transform so natural table width is measured.
      table.style.transform = 'translateX(0px)';

      const totalWidth = getTotalWidth();
      inner.style.width = `${totalWidth}px`;

      const maxLeft = Math.max(0, totalWidth - wrap.clientWidth);
      currentLeft = Math.min(currentLeft, maxLeft);

      top.scrollLeft = currentLeft;
      applyHorizontalPosition();
    };

    top.addEventListener(
      'scroll',
      applyHorizontalPosition,
      { passive: true }
    );

    window.addEventListener(
      'resize',
      () => requestAnimationFrame(alignTable)
    );

    if (window.ResizeObserver) {
      const observer =
        new ResizeObserver(() =>
          requestAnimationFrame(alignTable)
        );

      observer.observe(wrap);
      observer.observe(table);
    }

    if (window.MutationObserver) {
      const bodyObserver =
        new MutationObserver(() =>
          requestAnimationFrame(alignTable)
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
    }

    wrap.dataset.managerAutoScrollBound = 'true';
    sticky.dataset.managerCanonicalSticky = 'true';
    sticky.dataset.managerCanonicalFor = wrap.id || '';

    const syncVisibility = () => {
      sticky.hidden = Boolean(
        wrap.hidden ||
        wrap.closest('[hidden]')
      );
    };

    if (window.MutationObserver) {
      const visibilityObserver =
        new MutationObserver(syncVisibility);

      visibilityObserver.observe(
        wrap,
        {
          attributes: true,
          attributeFilter: ['hidden', 'class', 'style']
        }
      );

      let ancestor = wrap.parentElement;

      while (
        ancestor &&
        ancestor !== document.body
      ) {
        visibilityObserver.observe(
          ancestor,
          {
            attributes: true,
            attributeFilter: ['hidden', 'class', 'style']
          }
        );

        ancestor = ancestor.parentElement;
      }
    }

    requestAnimationFrame(() => {
      syncVisibility();
      alignTable();
    });
  }


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
