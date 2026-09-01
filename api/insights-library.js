import {
  requireManager
} from '../lib/manager-auth-utils.js';


export default async function handler(req, res) {

  /* =========================================
     CONFIG
     ========================================= */

  const GITHUB_OWNER =
    'jhk-ixl';

  const GITHUB_REPO =
    'ixl-korea-website';

  const GITHUB_BRANCH =
    'master';

  const INSIGHTS_FILE =
    'insightscontent/insights-data.json';


  /* =========================================
     REQUIRE MANAGER AUTHENTICATION
     ========================================= */

  const manager =
    requireManager(
      req,
      res
    );


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

    'Accept':
      'application/vnd.github+json',

    'Authorization':
      `Bearer ${githubToken}`,

    'X-GitHub-Api-Version':
      '2022-11-28',

    'User-Agent':
      'IXL-Korea-Manager'

  };


  const fileUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${INSIGHTS_FILE}`;


  /* =========================================
     LOAD CURRENT INSIGHTS FILE
     ========================================= */

  async function loadInsightsFile() {

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
          'Insights data file was not found.'
        );

      error.statusCode = 404;

      throw error;

    }


    if (!response.ok) {

      const errorText =
        await response.text();


      console.error(
        'GitHub Insights file request failed:',
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
        'Unexpected GitHub Insights file response.'
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
        'Insights JSON parsing failed:',
        error
      );


      const parseError =
        new Error(
          'Insights data contains invalid JSON.'
        );

      parseError.statusCode = 500;

      throw parseError;

    }


    if (
      !data ||
      !Array.isArray(data.items)
    ) {

      const formatError =
        new Error(
          'Unexpected Insights data format.'
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
     WRITE INSIGHTS FILE
     ========================================= */

  async function writeInsightsFile(
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
        'GitHub Insights update failed:',
        response.status,
        errorText
      );


      if (
        response.status === 403
      ) {

        const permissionError =
          new Error(
            'GitHub token does not have permission to update Insights.'
          );

        permissionError.statusCode = 403;

        throw permissionError;

      }


      if (
        response.status === 409
      ) {

        const conflictError =
          new Error(
            'Insights data changed before this save completed. Reload and try again.'
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
     NORMALIZE STRING ARRAY
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


  /* =========================================
     VALIDATE / NORMALIZE INSIGHT
     ========================================= */

  function normalizeInsight(body) {

    const type =
      String(
        body.type || ''
      ).trim()
        .toLowerCase();


    const date =
      String(
        body.date || ''
      ).trim();


    const dateLabel =
      String(
        body.dateLabel || ''
      ).trim();


    const title =
      String(
        body.title || ''
      ).trim();


    const summary =
      String(
        body.summary || ''
      ).trim();


    const url =
      String(
        body.url || ''
      ).trim();


    const asset =
      String(
        body.asset || ''
      ).trim();


    const access =
      String(
        body.access || 'Public'
      ).trim();


    const featured =
      body.featured === true;


    const allowedTypes = [
      'news',
      'article',
      'video',
      'external'
    ];


    const allowedAccessLevels = [
      'Public',
      'Members',
      'Professionals',
      'Clients',
      'Internal'
    ];


    if (
      !allowedTypes.includes(
        type
      )
    ) {

      const error =
        new Error(
          'Invalid Insight type.'
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

      url,

      asset,

      featured

    };

  }



  try {



    /* =========================================
       GET
       LOAD INSIGHTS
       ========================================= */

    if (
      req.method === 'GET'
    ) {

      const current =
        await loadInsightsFile();


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json(
          current.data.items
        );

    }


    /* =========================================
       POST
       ADD INSIGHT
       ========================================= */

    if (
      req.method === 'POST'
    ) {

      const body =
        req.body || {};


      const insight =
        normalizeInsight(
          body
        );


      const current =
        await loadInsightsFile();


      /*
       * Add to the end of the source array.
       * Search/sort in Manager does not modify
       * the stored JSON order.
       */

      current.data.items.push(
        insight
      );


      const result =
        await writeInsightsFile(
          current.data,
          current.sha,
          `Add Insight: ${insight.title}`
        );


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(201)
        .json({

          success: true,

          item:
            insight,

          index:
            current.data.items.length - 1,

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
       UPDATE INSIGHT
       ========================================= */

    if (
      req.method === 'PATCH'
    ) {

      const body =
        req.body || {};


      const index =
        Number(
          body.index
        );


      if (
        !Number.isInteger(
          index
        ) ||
        index < 0
      ) {

        return res
          .status(400)
          .json({
            error:
              'A valid Insight index is required.'
          });

      }


      const insight =
        normalizeInsight(
          body
        );


      const current =
        await loadInsightsFile();


      if (
        index >=
        current.data.items.length
      ) {

        return res
          .status(404)
          .json({
            error:
              'Insight item was not found.'
          });

      }


      current.data.items[index] =
        insight;


      const result =
        await writeInsightsFile(
          current.data,
          current.sha,
          `Update Insight: ${insight.title}`
        );


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json({

          success: true,

          item:
            insight,

          index,

          commit:
            result
              ?.commit
              ?.sha || null,

          updatedBy:
            manager.login

        });

    }


    /* =========================================
       DELETE
       DELETE INSIGHT
       ========================================= */

    if (
      req.method === 'DELETE'
    ) {

      const body =
        req.body || {};


      const index =
        Number(
          body.index
        );


      if (
        !Number.isInteger(
          index
        ) ||
        index < 0
      ) {

        return res
          .status(400)
          .json({
            error:
              'A valid Insight index is required.'
          });

      }


      const current =
        await loadInsightsFile();


      if (
        index >=
        current.data.items.length
      ) {

        return res
          .status(404)
          .json({
            error:
              'Insight item was not found.'
          });

      }


      const deletedItem =
        current.data.items[index];


      current.data.items.splice(
        index,
        1
      );


      const result =
        await writeInsightsFile(
          current.data,
          current.sha,
          `Delete Insight: ${
            deletedItem.title ||
            `Item ${index}`
          }`
        );


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json({

          success: true,

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
      'Insights Library API Error:',
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
          'Insights Library operation failed.'
      });

  }

}