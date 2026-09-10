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
