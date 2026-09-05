/* =========================================
   IXL KOREA MANAGER
   COMMON UTILITIES
   ========================================= */

(function () {

  'use strict';


  function toManagerUrl(value) {

    const clean =
      String(value || '').trim();

    if (!clean) {
      return '';
    }


    if (
      clean.startsWith('http://') ||
      clean.startsWith('https://')
    ) {
      return clean;
    }


    return (
      '../' +
      clean.replace(/^\/+/, '')
    );

  }


  function normalizeManagerUrl(value) {

    const clean =
      String(value || '').trim();

    if (!clean) {
      return '';
    }


    try {

      const absolute =
        new URL(
          toManagerUrl(clean),
          window.location.href
        );


      absolute.hash = '';


      if (
        absolute.pathname.length > 1 &&
        absolute.pathname.endsWith('/')
      ) {
        absolute.pathname =
          absolute.pathname.slice(0, -1);
      }


      return absolute.href;

    } catch {

      return clean;

    }

  }


  function sameManagerUrl(a, b) {

    const first =
      normalizeManagerUrl(a);

    const second =
      normalizeManagerUrl(b);


    return Boolean(
      first &&
      second &&
      first === second
    );

  }

  function syncScrollTable({
    topScrollId,
    topInnerId,
    wrapId,
    tableId
  }) {
    const topScroll = document.getElementById(topScrollId);
    const topInner = document.getElementById(topInnerId);
    const wrap = document.getElementById(wrapId);
    const table = document.getElementById(tableId);

    if (!topScroll || !topInner || !wrap || !table) {
      return;
    }

    const update = () => {
      topInner.style.width = `${table.scrollWidth}px`;
      topScroll.scrollLeft = wrap.scrollLeft;
    };

    if (!topScroll.dataset.syncBound) {
      topScroll.addEventListener('scroll', () => {
        wrap.scrollLeft = topScroll.scrollLeft;
      });

      wrap.addEventListener('scroll', () => {
        topScroll.scrollLeft = wrap.scrollLeft;
      });

      window.addEventListener('resize', update);

      topScroll.dataset.syncBound = 'true';
    }

    requestAnimationFrame(update);
  }

window.IXLManager = {
    toUrl:
      toManagerUrl,

    normalizeUrl:
      normalizeManagerUrl,

    sameUrl:
      sameManagerUrl,

    syncScrollTable:
      syncScrollTable
  };


})();
