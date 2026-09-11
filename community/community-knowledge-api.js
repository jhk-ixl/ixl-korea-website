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
      key: '',
      value: {}
    };
  }

  function normalizeItem(item, assetRegistry = []) {
    const selected = selectVersion(item);
    const version = selected.value || {};
    const mediaItems = Array.isArray(item?.media) ? item.media : [];
    const selectedMedia = mediaItems.find(entry => entry.language === selected.key) ||
                          mediaItems.find(entry => entry.language === 'common') ||
                          mediaItems[0] || {};
    const resolvedMedia = mediaItems.map(media => {
      const asset = media.assetKey
        ? assetRegistry.find(entry => String(entry?.key || '') === String(media.assetKey || ''))
        : null;
      return {
        ...media,
        resolvedUrl: String(asset?.url || asset?.pathname || media.url || media.asset || '').trim()
      };
    });
    const selectedResolved = resolvedMedia.find(media => media === selectedMedia || (media.assetKey && media.assetKey === selectedMedia.assetKey)) ||
                             resolvedMedia.find(media => media.language === selected.key) ||
                             resolvedMedia.find(media => media.language === 'common') ||
                             resolvedMedia[0] || {};

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
    const [response, assetResponse] = await Promise.all([
      fetch(PUBLIC_KNOWLEDGE_ENDPOINT, { cache: 'no-store' }),
      fetch('/insightscontent/asset-registry.json', { cache: 'no-store' })
    ]);

    if (!response.ok) {
      throw new Error(`Public Knowledge request failed: ${response.status}`);
    }

    const data = await response.json();
    const assetData = assetResponse.ok ? await assetResponse.json() : {};
    const assetRegistry = Array.isArray(assetData?.assets) ? assetData.assets : [];
    const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];

    return items.map(item => normalizeItem(item, assetRegistry));
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
