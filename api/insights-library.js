import {
  requireManager
} from '../lib/manager-auth-utils.js';

export default async function handler(req, res) {

  /* =========================================
     CONFIG
     ========================================= */

  const GITHUB_OWNER = 'jhk-ixl';
  const GITHUB_REPO = 'ixl-korea-website';
  const GITHUB_BRANCH = 'master';

  const DATA_FILES = {
    insights: {
      path: 'insightscontent/insights-data.json',
      arrayKey: 'items'
    },

    knowledge: {
      path: 'insightscontent/knowledge-data.json',
      arrayKey: 'items'
    },

    assets: {
      path: 'insightscontent/asset-registry.json',
      arrayKey: 'assets'
    },

    knowledgetypes: {
      path: 'insightscontent/knowledge-types.json',
      arrayKey: 'types'
    },

    usage: {
      path: 'insightscontent/asset-usage.json',
      arrayKey: 'usages'
    }
  };


  /* =========================================
     REQUIRE MANAGER AUTHENTICATION
     ========================================= */

  const manager =
    requireManager(req, res);

  if (!manager) {
    return;
  }


  /* =========================================
     CHECK TOKEN
     ========================================= */

  const githubToken =
    process.env.GITHUB_TOKEN;

  if (!githubToken) {

    console.error(
      'GITHUB_TOKEN is not configured.'
    );

    return res
      .status(500)
      .json({
        error:
          'GitHub authentication is not configured.'
      });
  }


  /* =========================================
     COMMON GITHUB HEADERS
     ========================================= */

  const githubHeaders = {

    Accept:
      'application/vnd.github+json',

    Authorization:
      `Bearer ${githubToken}`,

    'X-GitHub-Api-Version':
      '2022-11-28',

    'User-Agent':
      'IXL-Korea-Manager'
  };


  /* =========================================
     RESOURCE SELECT
     default = insights
     ========================================= */

  const resource =
    String(
      req.query?.resource || 'insights'
    )
      .trim()
      .toLowerCase();


  const resourceConfig =
    DATA_FILES[resource];


  if (!resourceConfig) {

    return res
      .status(400)
      .json({
        error:
          'Invalid resource. Use insights, knowledge, assets, usage or knowledgetypes.'
      });
  }


  const fileUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${resourceConfig.path}`;


  /* =========================================
     LOAD DATA FILE
     ========================================= */

  async function loadDataFile() {

    const response =
      await fetch(
        `${fileUrl}?ref=${GITHUB_BRANCH}`,
        {
          headers:
            githubHeaders
        }
      );


    if (
      response.status === 404
    ) {

      const error =
        new Error(
          `${resourceConfig.path} was not found.`
        );

      error.statusCode = 404;

      throw error;
    }


    if (!response.ok) {

      const errorText =
        await response.text();


      console.error(
        'GitHub data file request failed:',
        resource,
        response.status,
        errorText
      );


      throw new Error(
        `GitHub file API HTTP ${response.status}`
      );
    }


    const currentFile =
      await response.json();


    if (
      !currentFile.sha ||
      !currentFile.content
    ) {

      throw new Error(
        `Unexpected GitHub ${resource} file response.`
      );
    }


    let data;


    try {

      const decoded =
        Buffer
          .from(
            currentFile.content,
            'base64'
          )
          .toString(
            'utf8'
          );


      data =
        JSON.parse(
          decoded
        );

    } catch (error) {

      console.error(
        `${resource} JSON parsing failed:`,
        error
      );


      const parseError =
        new Error(
          `${resource} data contains invalid JSON.`
        );

      parseError.statusCode = 500;

      throw parseError;
    }


    if (
      !data ||
      !Array.isArray(
        data[resourceConfig.arrayKey]
      )
    ) {

      const formatError =
        new Error(
          `Unexpected ${resource} data format.`
        );

      formatError.statusCode = 500;

      throw formatError;
    }


    return {
      sha:
        currentFile.sha,

      data
    };
  }


  /* =========================================
     RELATED DATA HELPERS
     ========================================= */

  async function loadRelatedDataFile(relatedResource) {
    const relatedConfig = DATA_FILES[relatedResource];
    const relatedFileUrl =
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
      `/contents/${relatedConfig.path}`;
    const response = await fetch(`${relatedFileUrl}?ref=${GITHUB_BRANCH}`, { headers: githubHeaders });
    if (!response.ok) {
      const error = new Error(`Could not load ${relatedResource} data.`);
      error.statusCode = response.status === 404 ? 404 : 500;
      throw error;
    }
    const currentFile = await response.json();
    const data = JSON.parse(Buffer.from(currentFile.content, 'base64').toString('utf8'));
    if (!data || !Array.isArray(data[relatedConfig.arrayKey])) {
      const error = new Error(`Unexpected ${relatedResource} data format.`);
      error.statusCode = 500;
      throw error;
    }
    return { sha: currentFile.sha, data, list: data[relatedConfig.arrayKey] };
  }

  async function writeRelatedDataFile(relatedResource, data, sha, message) {
    const relatedConfig = DATA_FILES[relatedResource];
    const relatedFileUrl =
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
      `/contents/${relatedConfig.path}`;
    const content = Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64');
    const response = await fetch(relatedFileUrl, {
      method: 'PUT', headers: { ...githubHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content, sha, branch: GITHUB_BRANCH })
    });
    if (!response.ok) {
      const error = new Error(`${relatedResource} data changed before this save completed. Reload and try again.`);
      error.statusCode = response.status === 409 ? 409 : response.status === 403 ? 403 : 500;
      throw error;
    }
    return await response.json();
  }

  function getUsagesForAssetKey(usages, assetKey) {
    return usages.filter(usage => usage.assetKey === assetKey);
  }

  async function assertUsageAssetExists(assetKey) {
    const assetsCurrent = await loadRelatedDataFile('assets');
    if (!assetsCurrent.list.some(asset => asset.key === assetKey)) {
      const error = new Error(`Asset Key "${assetKey}" does not exist in Asset Registry.`);
      error.statusCode = 400;
      throw error;
    }
  }


  /* =========================================
     WRITE DATA FILE
     ========================================= */

  async function writeDataFile(
    data,
    sha,
    message
  ) {

    const content =
      Buffer
        .from(
          JSON.stringify(
            data,
            null,
            2
          ) + '\n',
          'utf8'
        )
        .toString(
          'base64'
        );


    const response =
      await fetch(
        fileUrl,
        {
          method:
            'PUT',

          headers: {
            ...githubHeaders,

            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              message,
              content,
              sha,

              branch:
                GITHUB_BRANCH
            })
        }
      );


    if (!response.ok) {

      const errorText =
        await response.text();


      console.error(
        'GitHub data update failed:',
        resource,
        response.status,
        errorText
      );


      if (
        response.status === 403
      ) {

        const permissionError =
          new Error(
            `GitHub token does not have permission to update ${resource}.`
          );

        permissionError.statusCode = 403;

        throw permissionError;
      }


      if (
        response.status === 409
      ) {

        const conflictError =
          new Error(
            `${resource} data changed before this save completed. Reload and try again.`
          );

        conflictError.statusCode = 409;

        throw conflictError;
      }


      throw new Error(
        `GitHub update API HTTP ${response.status}`
      );
    }


    return await response.json();
  }


  /* =========================================
     COMMON HELPERS
     ========================================= */

  function normalizeStringArray(value) {

    if (!Array.isArray(value)) {
      return [];
    }


    return value
      .map(
        item =>
          String(
            item || ''
          ).trim()
      )
      .filter(Boolean);
  }


  function cleanString(value) {

    return String(
      value ?? ''
    ).trim();
  }


  function slugifyKey(value) {

    return cleanString(value)
      .replace(
        /\\/g,
        '/'
      )
      .split('/')
      .pop()
      .replace(
        /\.[^.]+$/,
        ''
      )
      .normalize(
        'NFKD'
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9가-힣]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      );
  }


  function makeUniqueKey(
    baseKey,
    assets
  ) {

    if (
      !assets.some(
        item =>
          item.key === baseKey
      )
    ) {
      return baseKey;
    }


    let no = 2;


    while (
      assets.some(
        item =>
          item.key ===
          `${baseKey}-${no}`
      )
    ) {
      no += 1;
    }


    return `${baseKey}-${no}`;
  }


  function getIndex(body) {

    const index =
      Number(
        body.index
      );


    if (
      !Number.isInteger(index) ||
      index < 0
    ) {

      const error =
        new Error(
          `A valid ${resource} index is required.`
        );

      error.statusCode = 400;

      throw error;
    }


    return index;
  }


  /* =========================================
     KNOWLEDGE MASTER DATA
     ========================================= */

  async function loadKnowledgeMasterData() {

    async function loadJson(path) {

      const url =
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
        `/contents/${path}`;

      const response =
        await fetch(
          `${url}?ref=${GITHUB_BRANCH}`,
          {
            headers:
              githubHeaders
          }
        );

      if (!response.ok) {
        throw new Error(
          `Knowledge master data could not be loaded: ${path}`
        );
      }

      const file =
        await response.json();

      if (
        !file.content
      ) {
        throw new Error(
          `Invalid Knowledge master data response: ${path}`
        );
      }

      const decoded =
        Buffer
          .from(
            file.content,
            'base64'
          )
          .toString(
            'utf8'
          );

      return JSON.parse(
        decoded
      );
    }


    const [
      typeData,
      accessData
    ] =
      await Promise.all([
        loadJson(
          'insightscontent/knowledge-types.json'
        ),
        loadJson(
          'insightscontent/access-levels.json'
        )
      ]);


    return {

      allowedTypes:
        Array.isArray(typeData.types)
          ? typeData.types
              .map(
                item =>
                  cleanString(
                    item.value
                  ).toLowerCase()
              )
              .filter(Boolean)
          : [],

      allowedAccessLevels:
        Array.isArray(accessData.accessLevels)
          ? accessData.accessLevels
              .map(
                item =>
                  cleanString(
                    item.name
                  )
              )
              .filter(Boolean)
          : []

    };
  }

  /* =========================================
     NORMALIZE INSIGHT
     ========================================= */

  function normalizeInsight(body, validation = {}) {

    const type =
      cleanString(
        body.type
      ).toLowerCase();


    const date =
      cleanString(
        body.date
      );


    const dateLabel =
      cleanString(
        body.dateLabel
      );


    const title =
      cleanString(
        body.title
      );


    const summary =
      cleanString(
        body.summary
      );


    const slug =
      cleanString(
        body.slug
      );


    const author =
      cleanString(
        body.author
      );


    const source =
      cleanString(
        body.source
      );


    const bodyContent =
      String(
        body.body ?? ''
      );


    const url =
      cleanString(
        body.url
      );


    const asset =
      cleanString(
        body.asset
      );


    const assetKey =
      slugifyKey(
        body.assetKey
      );


    const access =
      cleanString(
        body.access ||
        'Public'
      );


    const featured =
      body.featured === true;


    const allowedTypes =
      Array.isArray(
        validation.allowedTypes
      )
        ? validation.allowedTypes
        : [];


    const allowedAccessLevels =
      Array.isArray(
        validation.allowedAccessLevels
      )
        ? validation.allowedAccessLevels
        : [];


    if (
      !allowedTypes.includes(
        type
      )
    ) {

      const error =
        new Error(
          'Invalid Knowledge Type.'
        );

      error.statusCode = 400;

      throw error;
    }


    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date
      )
    ) {

      const error =
        new Error(
          'A valid date in YYYY-MM-DD format is required.'
        );

      error.statusCode = 400;

      throw error;
    }


    if (
      !dateLabel ||
      !title ||
      !summary
    ) {

      const error =
        new Error(
          'Display Label, Title and Summary are required.'
        );

      error.statusCode = 400;

      throw error;
    }


    if (
      !allowedAccessLevels.includes(
        access
      )
    ) {

      const error =
        new Error(
          'Invalid Access Level.'
        );

      error.statusCode = 400;

      throw error;
    }


    return {

      type,

      topics:
        normalizeStringArray(
          body.topics
        ),

      industries:
        normalizeStringArray(
          body.industries
        ),

      programs:
        normalizeStringArray(
          body.programs
        ),

      tags:
        normalizeStringArray(
          body.tags
        ),

      access,

      date,

      dateLabel,

      title,

      summary,

      slug,

      author,

      source,

      body:
        bodyContent,

      url,

      asset,

      assetKey,

      featured
    };
  }


  /* =========================================
     NORMALIZE ASSET
     ========================================= */

  function normalizeAsset(body) {

    const fileName =
      cleanString(
        body.fileName ||
        body.filename
      );


    const pathname =
      cleanString(
        body.pathname
      );


    const name =
      cleanString(
        body.name ||
        fileName ||
        pathname
      );


    const requestedKey =
      cleanString(
        body.key
      );


    const key =
      slugifyKey(
        requestedKey ||
        fileName ||
        pathname ||
        name
      );


    if (!key) {

      const error =
        new Error(
          'Asset key could not be created. Provide a key or file name.'
        );

      error.statusCode = 400;

      throw error;
    }


    return {

      key,

      name,

      fileName,

      folder:
        cleanString(
          body.folder
        ),

      pathname,

      url:
        cleanString(
          body.url
        ),

      downloadUrl:
        cleanString(
          body.downloadUrl
        ),

      type:
        cleanString(
          body.type
        ).toLowerCase(),

      size:
        Number.isFinite(
          Number(
            body.size
          )
        )
          ? Number(
              body.size
            )
          : null,

      uploadedAt:
        cleanString(
          body.uploadedAt
        ),

      updatedAt:
        new Date()
          .toISOString()
    };
  }


  /* =========================================
     NORMALIZE USAGE
     ========================================= */

  function normalizeUsage(body) {

    const usageKey =
      slugifyKey(
        body.usageKey ||
        body.id ||
        body.label
      );


    const page =
      cleanString(
        body.page
      );


    const label =
      cleanString(
        body.label
      );


    const assetKey =
      slugifyKey(
        body.assetKey
      );


    if (!usageKey) {

      const error =
        new Error(
          'Usage key is required.'
        );

      error.statusCode = 400;

      throw error;
    }


    if (!assetKey) {

      const error =
        new Error(
          'Asset key is required for usage.'
        );

      error.statusCode = 400;

      throw error;
    }


    return {

      usageKey,

      page,

      label,

      assetKey,

      updatedAt:
        new Date()
          .toISOString()
    };
  }


  function makeKnowledgeTypeValue(name, list = []) {
    const base =
      cleanString(name)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') ||
      'knowledge-type';

    const used =
      new Set(
        list
          .map(
            item =>
              cleanString(
                item.value
              ).toLowerCase()
          )
          .filter(Boolean)
      );

    if (!used.has(base)) {
      return base;
    }

    let number = 2;

    while (
      used.has(
        `${base}-${number}`
      )
    ) {
      number += 1;
    }

    return `${base}-${number}`;
  }


  function normalizeKnowledgeType(
    body,
    existingItem = null,
    list = []
  ) {
    const name =
      cleanString(
        body.name
      );

    const description =
      cleanString(
        body.description
      );

    if (!name) {
      const error =
        new Error(
          'Knowledge Type name is required.'
        );

      error.statusCode = 400;
      throw error;
    }

    const existingValue =
      existingItem
        ? cleanString(
            existingItem.value
          )
        : '';

    const duplicateName =
      list.some(
        item =>
          item !== existingItem &&
          cleanString(
            item.name
          ).toLowerCase() ===
            name.toLowerCase()
      );

    if (duplicateName) {
      const error =
        new Error(
          'Knowledge Type name already exists.'
        );

      error.statusCode = 409;
      throw error;
    }

    const value =
      existingValue ||
      makeKnowledgeTypeValue(
        name,
        list
      );

    return {
      name,
      description,
      value
    };
  }


  function normalizeByResource(
    body,
    validation = {},
    existingItem = null,
    list = []
  ) {

    if (
      (resource === 'insights' || resource === 'knowledge')
    ) {

      return normalizeInsight(
        body,
        validation
      );
    }


    if (
      resource === 'knowledgetypes'
    ) {

      return normalizeKnowledgeType(
        body,
        existingItem,
        list
      );
    }


    if (
      resource === 'assets'
    ) {

      return normalizeAsset(
        body
      );
    }


    return normalizeUsage(
      body
    );
  }


  function getDisplayName(
    item,
    index
  ) {

    if (
      (resource === 'insights' || resource === 'knowledge')
    ) {

      return (
        item.title ||
        `Item ${index}`
      );
    }


    if (
      resource === 'knowledgetypes'
    ) {

      return (
        item.name ||
        `Knowledge Type ${index}`
      );
    }


    if (
      resource === 'assets'
    ) {

      return (
        item.key ||
        item.name ||
        `Asset ${index}`
      );
    }


    return (
      item.usageKey ||
      item.label ||
      `Usage ${index}`
    );
  }


  try {

    /* =========================================
       GET
       ========================================= */

    if (
      req.method === 'GET'
    ) {

      const current =
        await loadDataFile();


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json(
          current.data[
            resourceConfig.arrayKey
          ]
        );
    }


    /* =========================================
       POST
       ADD
       ========================================= */

    if (
      req.method === 'POST'
    ) {

      const body =
        req.body || {};


      const current =
        await loadDataFile();


      const list =
        current.data[
          resourceConfig.arrayKey
        ];


      const validation =
        (resource === 'insights' || resource === 'knowledge')
          ? await loadKnowledgeMasterData()
          : {};


      let item =
        normalizeByResource(
          body,
          validation,
          null,
          list
        );


      /* Asset duplicate key */

      if (
        resource === 'assets'
      ) {

        const existingIndex =
          list.findIndex(
            existing =>
              existing.key ===
              item.key
          );


        if (
          existingIndex >= 0
        ) {

          /*
           * Add as new:
           * key
           * key-2
           * key-3 ...
           */

          if (
            body.onDuplicate ===
            'add'
          ) {

            item = {
              ...item,

              key:
                makeUniqueKey(
                  item.key,
                  list
                )
            };

          } else {

            /*
             * Manager can show this existingItem
             * and provide View / Update / Add.
             */

            return res
              .status(409)
              .json({

                error:
                  'Asset key already exists.',

                duplicate:
                  true,

                existingIndex,

                existingItem:
                  list[
                    existingIndex
                  ],

                requestedItem:
                  item
              });
          }
        }
      }


      if (resource === 'usage') {
        await assertUsageAssetExists(item.assetKey);
      }


      /* Usage duplicate */

      if (
        resource === 'usage'
      ) {

        const duplicateIndex =
          list.findIndex(
            existing =>
              existing.usageKey ===
              item.usageKey
          );


        if (
          duplicateIndex >= 0
        ) {

          return res
            .status(409)
            .json({

              error:
                'Usage key already exists.',

              duplicate:
                true,

              existingIndex:
                duplicateIndex,

              existingItem:
                list[
                  duplicateIndex
                ],

              requestedItem:
                item
            });
        }
      }


      list.push(
        item
      );


      const result =
        await writeDataFile(

          current.data,

          current.sha,

          `Add ${resource}: ${
            getDisplayName(
              item,
              list.length - 1
            )
          }`
        );


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(201)
        .json({

          success:
            true,

          resource,

          item,

          index:
            list.length - 1,

          commit:
            result
              ?.commit
              ?.sha || null,

          createdBy:
            manager.login
        });
    }


    /* =========================================
       PATCH
       UPDATE
       ========================================= */

    if (
      req.method === 'PATCH'
    ) {

      const body =
        req.body || {};


      const index =
        getIndex(
          body
        );


      const current =
        await loadDataFile();


      const list =
        current.data[
          resourceConfig.arrayKey
        ];


      if (
        index >= list.length
      ) {

        return res
          .status(404)
          .json({
            error:
              `${resource} item was not found.`
          });
      }


      const validation =
        (resource === 'insights' || resource === 'knowledge')
          ? await loadKnowledgeMasterData()
          : {};


      let item =
        normalizeByResource(
          body,
          validation,
          list[index],
          list
        );


      if (resource === 'assets') {
        item = {
          ...item,
          uploadedAt: cleanString(list[index]?.uploadedAt || body.uploadedAt)
        };
      }

      if (resource === 'usage') {
        await assertUsageAssetExists(item.assetKey);
      }


      /*
       * When Asset key is changed during Update,
       * another Asset cannot already use that key.
       */

      if (
        resource === 'assets'
      ) {

        const duplicateIndex =
          list.findIndex(
            (existing, i) =>
              i !== index &&
              existing.key ===
              item.key
          );


        if (
          duplicateIndex >= 0
        ) {

          return res
            .status(409)
            .json({

              error:
                'Asset key already exists.',

              duplicate:
                true,

              existingIndex:
                duplicateIndex,

              existingItem:
                list[
                  duplicateIndex
                ],

              requestedItem:
                item
            });
        }
      }


      let relatedUsageCurrent = null;
      let affectedUsages = [];
      let oldAssetKey = '';

      if (resource === 'assets') {
        oldAssetKey = cleanString(list[index]?.key);
        if (oldAssetKey && item.key !== oldAssetKey) {
          relatedUsageCurrent = await loadRelatedDataFile('usage');
          affectedUsages = getUsagesForAssetKey(relatedUsageCurrent.list, oldAssetKey);
          if (affectedUsages.length && body.confirmUsageKeyChange !== true) {
            return res.status(409).json({
              error: `Asset Key "${oldAssetKey}" is used by ${affectedUsages.length} Usage mapping(s). Confirm the key change to update those mappings.`,
              usageConflict: true, oldKey: oldAssetKey, newKey: item.key,
              affectedUsages: affectedUsages.map(usage => ({ usageKey: usage.usageKey, page: usage.page, label: usage.label }))
            });
          }
        }
      }


      if (
        resource === 'usage'
      ) {

        const duplicateIndex =
          list.findIndex(
            (existing, i) =>
              i !== index &&
              existing.usageKey ===
              item.usageKey
          );


        if (
          duplicateIndex >= 0
        ) {

          return res
            .status(409)
            .json({

              error:
                'Usage key already exists.',

              duplicate:
                true,

              existingIndex:
                duplicateIndex,

              existingItem:
                list[
                  duplicateIndex
                ],

              requestedItem:
                item
            });
        }
      }


      list[index] =
        item;


      const result =
        await writeDataFile(

          current.data,

          current.sha,

          `Update ${resource}: ${
            getDisplayName(
              item,
              index
            )
          }`
        );


      let usageCommit = null;

      if (resource === 'assets' && oldAssetKey && item.key !== oldAssetKey && affectedUsages.length && relatedUsageCurrent) {
        const changedAt = new Date().toISOString();
        relatedUsageCurrent.data.usages = relatedUsageCurrent.list.map(usage =>
          usage.assetKey === oldAssetKey
            ? { ...usage, assetKey: item.key, updatedAt: changedAt }
            : usage
        );
        const usageResult = await writeRelatedDataFile(
          'usage', relatedUsageCurrent.data, relatedUsageCurrent.sha,
          `Update usage Asset Key: ${oldAssetKey} -> ${item.key}`
        );
        usageCommit = usageResult?.commit?.sha || null;
      }


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json({

          success:
            true,

          resource,

          item,

          index,

          commit:
            result
              ?.commit
              ?.sha || null,

          updatedBy:
            manager.login,

          affectedUsageCount:
            affectedUsages.length,

          usageCommit
        });
    }


    /* =========================================
       DELETE
       Registry/Data record only
       ========================================= */

    if (
      req.method === 'DELETE'
    ) {

      const body =
        req.body || {};


      const index =
        getIndex(
          body
        );


      const current =
        await loadDataFile();


      const list =
        current.data[
          resourceConfig.arrayKey
        ];


      if (
        index >= list.length
      ) {

        return res
          .status(404)
          .json({
            error:
              `${resource} item was not found.`
          });
      }


      const deletedItem =
        list[index];


      if (resource === 'knowledgetypes') {
        const typeValue =
          cleanString(
            deletedItem.value
          ).toLowerCase();

        const knowledgeCurrent =
          await loadRelatedDataFile(
            'knowledge'
          );

        const affectedKnowledge =
          knowledgeCurrent.list.filter(
            item =>
              cleanString(
                item.type
              ).toLowerCase() ===
                typeValue
          );

        if (affectedKnowledge.length) {
          return res
            .status(409)
            .json({
              error:
                `Knowledge Type "${deletedItem.name}" is used by ${affectedKnowledge.length} Knowledge item(s). Reclassify those items before deleting this Type.`,
              typeConflict: true,
              typeValue,
              affectedCount:
                affectedKnowledge.length,
              affectedKnowledge:
                affectedKnowledge.map(
                  item => ({
                    title:
                      item.title || '',
                    slug:
                      item.slug || ''
                  })
                )
            });
        }
      }


      if (resource === 'assets') {
        const usageCurrent = await loadRelatedDataFile('usage');
        const affectedUsages = getUsagesForAssetKey(usageCurrent.list, deletedItem.key);
        if (affectedUsages.length) {
          return res.status(409).json({
            error: `Asset Key "${deletedItem.key}" is used by ${affectedUsages.length} Usage mapping(s). Remove or change those Usage mappings first.`,
            usageConflict: true, assetKey: deletedItem.key,
            affectedUsages: affectedUsages.map(usage => ({ usageKey: usage.usageKey, page: usage.page, label: usage.label }))
          });
        }
      }


      list.splice(
        index,
        1
      );


      const result =
        await writeDataFile(

          current.data,

          current.sha,

          `Delete ${resource}: ${
            getDisplayName(
              deletedItem,
              index
            )
          }`
        );


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json({

          success:
            true,

          resource,

          deletedItem,

          index,

          commit:
            result
              ?.commit
              ?.sha || null,

          deletedBy:
            manager.login
        });
    }


    /* =========================================
       METHOD NOT ALLOWED
       ========================================= */

    res.setHeader(
      'Allow',
      'GET, POST, PATCH, DELETE'
    );


    return res
      .status(405)
      .json({
        error:
          'Method not allowed.'
      });


  } catch (error) {

    console.error(
      'Insights / Asset Data API Error:',
      error
    );


    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );


    return res
      .status(
        error.statusCode || 500
      )
      .json({
        error:
          error.message ||
          'Data operation failed.'
      });
  }
}