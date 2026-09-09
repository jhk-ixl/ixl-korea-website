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

    // Asset Library already owns its split header/body scroll system.
    if (
      wrap.classList.contains('asset-table-wrap') ||
      wrap.closest('.asset-grid-sticky') ||
      wrap.querySelector('.asset-body-table')
    ) {
      wrap.dataset.managerAutoScrollBound = 'true';
      return;
    }

    const table = wrap.querySelector('table.manager-canonical-table');
    if (!table) return;

    let top = wrap.previousElementSibling;
    if (!top || !top.classList.contains('manager-auto-top-scroll')) {
      top = document.createElement('div');
      top.className = 'manager-auto-top-scroll';
      top.setAttribute('aria-label', 'Horizontal table scroll');

      const inner = document.createElement('div');
      inner.className = 'manager-auto-top-scroll-inner';
      top.appendChild(inner);

      wrap.parentNode.insertBefore(top, wrap);
    }

    const inner = top.querySelector('.manager-auto-top-scroll-inner');

    const applyHorizontalPosition = () => {
      const maxLeft = Math.max(0, table.scrollWidth - wrap.clientWidth);
      const left = Math.min(top.scrollLeft, maxLeft);
      table.style.setProperty('--manager-table-x', `${-left}px`);
    };

    const update = () => {
      if (!inner) return;
      inner.style.width = `${Math.max(table.scrollWidth, wrap.clientWidth)}px`;
      applyHorizontalPosition();
    };

    top.addEventListener('scroll', applyHorizontalPosition, { passive: true });
    window.addEventListener('resize', update);

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(update);
      observer.observe(table);
      observer.observe(wrap);
    }

    wrap.dataset.managerAutoScrollBound = 'true';
    table.dataset.managerCanonicalFrozen = 'true';

    requestAnimationFrame(update);
  }

  function initManagerUi(root = document) {
    root.querySelectorAll('table[data-manager-sortable]').forEach(initDomSortableTable);
    root.querySelectorAll('.manager-canonical-table-wrap').forEach(initCanonicalScrollTable);
  }

  window.IXLManager = {
    toUrl: toManagerUrl,
    normalizeUrl: normalizeManagerUrl,
    sameUrl: sameManagerUrl,
    syncScrollTable,
    compareValues,
    createSortableTable,
    initCanonicalScrollTable,
    initManagerUi
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initManagerUi());
  } else {
    initManagerUi();
  }
})();
