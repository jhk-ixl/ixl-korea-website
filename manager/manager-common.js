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


  window.IXLManager = {
    toUrl:
      toManagerUrl,

    normalizeUrl:
      normalizeManagerUrl,

    sameUrl:
      sameManagerUrl
  };


})();
