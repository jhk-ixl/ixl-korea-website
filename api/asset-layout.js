/* =========================================
   IXL KOREA
   PUBLIC ASSET LAYOUT CSS
   ========================================= */

function requestOrigin(req) {
  const proto = String(
    req.headers['x-forwarded-proto'] || 'https'
  ).split(',')[0].trim();

  const host = String(
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    'ixlkorea.co.kr'
  ).split(',')[0].trim();

  return `${proto}://${host}`;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0
    ? number
    : null;
}

function cssAttributeValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed.');
  }

  try {
    const origin = requestOrigin(req);

    const [registryResponse, usageResponse] =
      await Promise.all([
        fetch(
          `${origin}/insightscontent/asset-registry.json`,
          { cache: 'no-store' }
        ),
        fetch(
          `${origin}/insightscontent/asset-usage.json`,
          { cache: 'no-store' }
        )
      ]);

    if (!registryResponse.ok || !usageResponse.ok) {
      throw new Error('Asset layout data could not be loaded.');
    }

    const registryData = await registryResponse.json();
    const usageData = await usageResponse.json();

    const assets = Array.isArray(registryData.assets)
      ? registryData.assets
      : [];

    const usages = Array.isArray(usageData.usages)
      ? usageData.usages
      : [];

    const assetMap = new Map(
      assets.map(asset => [asset.key, asset])
    );

    const rules = usages
      .map(usage => {
        const asset = assetMap.get(usage.assetKey);
        if (!asset) return '';

        const width = positiveInteger(asset.width);
        const height = positiveInteger(asset.height);

        if (!width || !height) return '';

        const usageKey =
          cssAttributeValue(usage.usageKey);

        return (
          `img[data-asset-usage="${usageKey}"] {` +
          ` aspect-ratio: ${width} / ${height}; }`
        );
      })
      .filter(Boolean);

    res.setHeader(
      'Content-Type',
      'text/css; charset=utf-8'
    );

    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );

    return res.status(200).send(
      '/* IXL Korea Asset Layout — generated from Asset Registry + Usage */\n' +
      rules.join('\n') +
      '\n'
    );

  } catch (error) {
    console.error('Asset layout CSS error:', error);

    res.setHeader(
      'Content-Type',
      'text/css; charset=utf-8'
    );

    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );

    return res.status(200).send(
      '/* Asset layout unavailable; page design CSS remains active. */\n'
    );
  }
}
