/* =========================================
   IXL KOREA COMMUNITY
   SHARED PUBLIC KNOWLEDGE API
   ========================================= */

(function () {
  const root = window.IXLCommunity =
    window.IXLCommunity || {};

  const PUBLIC_KNOWLEDGE_ENDPOINT =
    '/api/insights-library?resource=public-knowledge';

  function hasVersionContent(version) {
    const source =
      version?.contentSource || {};

    return Boolean(
      version &&
      (
        version.title ||
        version.summary ||
        version.body ||
        source.ref ||
        source.path
      )
    );
  }

  function selectVersion(item) {
    const versions =
      item?.versions || {};

    const language =
      String(
        document.documentElement.lang ||
        'en'
      ).toLowerCase();

    const preferKorean =
      language === 'ko' ||
      language.startsWith('ko-');

    const preferredKey =
      preferKorean ? 'ko' : 'other';

    const fallbackKey =
      preferKorean ? 'other' : 'ko';

    const preferred =
      versions[preferredKey];

    const fallback =
      versions[fallbackKey];

    // Community follows the Public Website rule:
    // page language sets display priority, not content eligibility.
    if (hasVersionContent(preferred)) {
      return {
        key: preferredKey,
        value: preferred
      };
    }

    if (hasVersionContent(fallback)) {
      return {
        key: fallbackKey,
        value: fallback
      };
    }

    return {
      key: preferredKey,
      value: null
    };
  }

  function normalizeItem(item, assetRegistry = []) {
    const selected = selectVersion(item);
    const version = selected.value;
    if (!version) return null;
    const canonicalMedia = item?.versions?.[selected.key]?.media;
    const mediaItems = Array.isArray(canonicalMedia)
      ? canonicalMedia
      : (Array.isArray(item?.media)
          ? item.media.filter(media =>
              media && (
                String(media.language || '').toLowerCase() === selected.key ||
                String(media.language || '').toLowerCase() === 'common'
              )
            )
          : []);

    const resolvedMedia = mediaItems.map(media => {
      const asset = media.assetKey
        ? assetRegistry.find(entry => String(entry?.key || '') === String(media.assetKey || ''))
        : null;
      return {
        ...media,
        resolvedUrl: String(asset?.url || asset?.pathname || media.url || media.asset || '').trim()
      };
    });

    const selectedResolved = resolvedMedia[0] || {};

    return {
      ...item,
      media: resolvedMedia,
      selectedVersionKey: selected.key,
      title: version.title || '',
      summary: version.summary || '',
      body: version.body || '',
      contentSource: version.contentSource || { type: 'builder-markdown', ref: '', path: '' },
      selectedMedia: selectedResolved,
      url: selectedResolved.resolvedUrl || '',
      asset: selectedResolved.resolvedUrl || '',
      assetKey: selectedResolved.assetKey || ''
    };
  }


  async function loadItems() {
    const response = await fetch(PUBLIC_KNOWLEDGE_ENDPOINT, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Public Knowledge request failed: ${response.status}`);
    }

    const data = await response.json();
    let assetRegistry = [];

    try {
      const assetResponse = await fetch('/insightscontent/asset-registry.json', { cache: 'no-store' });
      if (assetResponse.ok) {
        const assetData = await assetResponse.json();
        assetRegistry = Array.isArray(assetData?.assets) ? assetData.assets : [];
      }
    } catch (error) {
      console.warn('Community Asset Registry unavailable; using Knowledge media fallback URLs.', error);
    }

    const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];

    return items
      .map(item => normalizeItem(item, assetRegistry))
      .filter(Boolean);
  }

  function stripFrontmatter(text) {
    return String(text || '')
      .replace(
        /^---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*[\r\n]?/,
        ''
      );
  }

  async function loadBody(item) {
    const source =
      item?.contentSource || {};

    if (
      source.type !== 'cms-markdown' ||
      !source.path
    ) {
      return item?.body || '';
    }

    const response =
      await fetch(
        source.path,
        { cache: 'no-store' }
      );

    if (!response.ok) {
      throw new Error(
        `Linked Markdown request failed: ${response.status}`
      );
    }

    return stripFrontmatter(
      await response.text()
    );
  }

  root.knowledge = {
    endpoint:
      PUBLIC_KNOWLEDGE_ENDPOINT,
    loadItems,
    loadBody,
    normalizeItem,
    selectVersion
  };
})();
