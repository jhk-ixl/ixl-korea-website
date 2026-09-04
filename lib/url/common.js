/* =========================================
   IXL KOREA
   COMMON URL UTILITIES
   ========================================= */

export function normalizeComparableUrl(
  value
) {

  const clean =
    String(value || '').trim();


  if (!clean) {
    return '';
  }


  try {

    const url =
      new URL(clean);


    url.hash = '';


    if (
      url.pathname.length > 1 &&
      url.pathname.endsWith('/')
    ) {

      url.pathname =
        url.pathname.slice(0, -1);

    }


    return url.toString();

  } catch {

    const hashIndex =
      clean.indexOf('#');


    const withoutHash =
      hashIndex >= 0
        ? clean.slice(0, hashIndex)
        : clean;


    const queryIndex =
      withoutHash.indexOf('?');


    let pathname =
      queryIndex >= 0
        ? withoutHash.slice(0, queryIndex)
        : withoutHash;


    pathname =
      pathname.replace(/^\/+/, '');


    const query =
      queryIndex >= 0
        ? withoutHash.slice(queryIndex)
        : '';


    if (
      pathname.length > 1 &&
      pathname.endsWith('/')
    ) {

      pathname =
        pathname.slice(0, -1);

    }


    return pathname + query;

  }

}


export function sameResourceUrl(
  firstValue,
  secondValue
) {

  const first =
    normalizeComparableUrl(
      firstValue
    );


  const second =
    normalizeComparableUrl(
      secondValue
    );


  return Boolean(
    first &&
    second &&
    first === second
  );

}