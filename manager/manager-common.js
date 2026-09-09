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

    const table = wrap.querySelector('table.manager-canonical-table');
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
      // Temporarily clear translation for stable measurement.
      table.style.transform = 'translateX(0px)';
      headerTable.style.transform = 'translateX(0px)';

      const sourceCells = sourceHead.rows[0]
        ? [...sourceHead.rows[0].cells]
        : [];
      const cloneCells = clonedHead.rows[0]
        ? [...clonedHead.rows[0].cells]
        : [];

      const widths = sourceCells.map(cell => {
        const rect = cell.getBoundingClientRect();
        return Math.max(1, rect.width);
      });

      const totalWidth =
        Math.max(
          table.scrollWidth,
          widths.reduce((sum, width) => sum + width, 0),
          wrap.clientWidth
        );

      table.style.width = `${totalWidth}px`;
      table.style.minWidth = `${totalWidth}px`;
      headerTable.style.width = `${totalWidth}px`;
      headerTable.style.minWidth = `${totalWidth}px`;

      cloneCells.forEach((cell, index) => {
        if (!widths[index]) return;
        cell.style.width = `${widths[index]}px`;
        cell.style.minWidth = `${widths[index]}px`;
        cell.style.maxWidth = `${widths[index]}px`;
        cell.style.boxSizing = 'border-box';
      });

      inner.style.width = `${totalWidth}px`;

      top.scrollLeft = Math.min(currentLeft, Math.max(0, totalWidth - wrap.clientWidth));
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
      observer.observe(table);
      observer.observe(wrap);
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

    requestAnimationFrame(() => {
      alignColumns();
      syncIndicatorState();
    });
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
