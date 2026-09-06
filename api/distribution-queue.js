import crypto from 'node:crypto';

import {
  requireManager
} from '../lib/manager-auth-utils.js';

import {
  sameResourceUrl
} from '../lib/url/common.js';


function createDistributionId() {
  return (
    'dist_' +
    crypto.randomUUID()
      .replace(/-/g, '')
      .toLowerCase()
  );
}


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

  const QUEUE_FOLDER =
    'insightscontent/distributionqueue';


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


  try {

    /* =========================================
       GET
       LOAD QUEUE
       ========================================= */

    if (
      req.method === 'GET'
    ) {

      const folderUrl =
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
        `/contents/${QUEUE_FOLDER}?ref=${GITHUB_BRANCH}`;


      const folderResponse =
        await fetch(
          folderUrl,
          {
            headers:
              githubHeaders
          }
        );


      if (
        folderResponse.status === 404
      ) {

        res.setHeader(
          'Cache-Control',
          'no-store, max-age=0'
        );

        return res
          .status(200)
          .json([]);

      }


      if (
        !folderResponse.ok
      ) {

        const errorText =
          await folderResponse.text();

        console.error(
          'GitHub folder request failed:',
          folderResponse.status,
          errorText
        );

        throw new Error(
          `GitHub folder API HTTP ${folderResponse.status}`
        );

      }


      const files =
        await folderResponse.json();


      if (
        !Array.isArray(files)
      ) {

        throw new Error(
          'Unexpected GitHub folder response.'
        );

      }


      const jsonFiles =
        files.filter(
          file =>
            file.type === 'file' &&
            file.name &&
            file.name
              .toLowerCase()
              .endsWith('.json')
        );


      if (
        !jsonFiles.length
      ) {

        res.setHeader(
          'Cache-Control',
          'no-store, max-age=0'
        );

        return res
          .status(200)
          .json([]);

      }


      const results =
        await Promise.all(

          jsonFiles.map(

            async file => {

              const fileResponse =
                await fetch(
                  file.url,
                  {
                    headers: {
                      ...githubHeaders,

                      'Accept':
                        'application/vnd.github.raw+json'
                    }
                  }
                );


              if (
                !fileResponse.ok
              ) {

                const errorText =
                  await fileResponse.text();

                console.error(
                  'GitHub queue file request failed:',
                  file.name,
                  fileResponse.status,
                  errorText
                );

                throw new Error(
                  `GitHub file API HTTP ${fileResponse.status}`
                );

              }


              const data =
                await fileResponse.json();


              return {
                ...data,
                _fileName:
                  file.name
              };

            }

          )

        );


      results.sort(
        (a, b) => {

          const dateA =
            new Date(
              a.createdAt ||
              a.createdDate ||
              0
            );

          const dateB =
            new Date(
              b.createdAt ||
              b.createdDate ||
              0
            );

          return (
            dateB -
            dateA
          );

        }
      );


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json(results);

    }


    /* =========================================
      POST
      CREATE QUEUE ITEM
      ========================================= */

    if (
      req.method === 'POST'
    ) {

      const body =
        req.body || {};


      const channel =
        String(
          body.channel || ''
        ).trim();


      const language =
        String(
          body.language || 'en'
        )
          .trim()
          .toLowerCase();


      const title =
        String(
          body.title || ''
        ).trim();


      const postText =
        String(
          body.postText || ''
        ).trim();


      const legacyLink =
        String(
          body.link || ''
        ).trim();

      const detailLink =
        String(
          body.detailLink || ''
        ).trim();

      let externalLink =
        String(
          body.externalLink || ''
        ).trim();

      const mediaType =
        String(
          body.mediaType || 'None'
        ).trim();


      const mediaFile =
        String(
          body.mediaFile || ''
        ).trim();


      /*
         URL DATA INTEGRITY

         External Link and Media File represent
         independent distribution resources.

         When both point to the same resource,
         External Link is redundant and is removed
         before the Queue item is stored.
      */

      if (
        mediaType !== 'None' &&
        sameResourceUrl(
          externalLink,
          mediaFile
        )
      ) {

        externalLink = '';

      }


      const knowledgeId =
        String(
          body.knowledgeId || ''
        ).trim();


      const assetKey =
        String(
          body.assetKey || ''
        ).trim();


    const allowedMediaTypes = [
      'None',
      'Image',
      'Document',
      'Video'
    ];


    if (
      !allowedMediaTypes.includes(
        mediaType
      )
    ) {

      return res.status(400).json({
        error: 'Invalid media type.'
      });

    }


    if (
      mediaType !== 'None' &&
      !mediaFile
    ) {

      return res.status(400).json({
        error: 'Media file is required.'
      });

    }        

      if (
        !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(
          language
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              'Invalid language code.'
          });

      }


      /* =========================================
        VALIDATE REQUIRED FIELDS
        ========================================= */

      if (
        !channel ||
        !title ||
        !postText
      ) {

        return res
          .status(400)
          .json({
            error:
              'Channel, title and post text are required.'
          });

      }


      /* =========================================
        CREATE TIMESTAMP
        ========================================= */

      const now =
        new Date();


      const createdDate =
        now
          .toISOString()
          .slice(0, 10);


      const timestamp =
        now
          .toISOString()
          .replace(
            /[:.]/g,
            '-'
          );


      /* =========================================
        SAFE FILE NAME
        ========================================= */

      const safeChannel =
        channel
          .toLowerCase()
          .replace(
            /[^a-z0-9]+/g,
            '-'
          )
          .replace(
            /^-+|-+$/g,
            ''
          ) || 'sns';


      const fileName =
        `${createdDate}-${safeChannel}-${timestamp}.json`;


      const filePath =
        `${QUEUE_FOLDER}/${fileName}`;


      const fileUrl =
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
        `/contents/${filePath}`;


      /* =========================================
        BUILD QUEUE JSON
        ========================================= */

      const queueData = {
        distributionId:
          createDistributionId(),
        createdDate,
        createdAt: now.toISOString(),
        knowledgeId,
        channel,
        language,
        title,
        postText,

        detailLink:
          detailLink || legacyLink,

        externalLink,

        link:
          detailLink || legacyLink || externalLink,

        mediaType:
          mediaType || 'None',

        mediaFile:
          mediaType === 'None'
            ? ''
            : mediaFile,

        assetKey:
          mediaType === 'None'
            ? ''
            : assetKey,

        status: 'Draft',
        scheduledDate: '',
        publishedDate: ''
      };


      const content =
        Buffer
          .from(
            JSON.stringify(
              queueData,
              null,
              2
            ) + '\n',
            'utf8'
          )
          .toString(
            'base64'
          );


      /* =========================================
        WRITE NEW FILE TO GITHUB
        ========================================= */

      const createResponse =
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

                message:
                  `Add Distribution Queue ${fileName}`,

                content,

                branch:
                  GITHUB_BRANCH

              })
          }
        );


      if (
        !createResponse.ok
      ) {

        const errorText =
          await createResponse.text();


        console.error(
          'GitHub queue creation failed:',
          createResponse.status,
          errorText
        );


        if (
          createResponse.status === 403
        ) {

          return res
            .status(403)
            .json({
              error:
                'GitHub token does not have permission to create queue items.'
            });

        }


        throw new Error(
          `GitHub create API HTTP ${createResponse.status}`
        );

      }


      const createResult =
        await createResponse.json();


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(201)
        .json({

          success: true,

          fileName,

          distributionId:
            queueData.distributionId,

          createdDate,

          channel,

          language,

          title,

          status:
            'Draft',

          commit:
            createResult
              ?.commit
              ?.sha || null,

          createdBy:
            manager.login

        });

    }
    
    /* =========================================
       PATCH
       UPDATE QUEUE ITEM
       ========================================= */

    if (
      req.method === 'PATCH'
    ) {

      const body =
        req.body || {};


      const fileName =
        String(
          body.fileName || ''
        ).trim();


      const requestedStatus =
        String(
          body.status || ''
        ).trim();


      let scheduledDate =
        String(
          body.scheduledDate || ''
        ).trim();


      let publishedDate =
        String(
          body.publishedDate || ''
        ).trim();


      /* =========================================
         VALIDATE FILE NAME
         ========================================= */

      if (
        !fileName ||
        !fileName
          .toLowerCase()
          .endsWith('.json') ||
        fileName.includes('/') ||
        fileName.includes('\\') ||
        fileName.includes('..')
      ) {

        return res
          .status(400)
          .json({
            error:
              'Invalid queue file name.'
          });

      }


      /* =========================================
         VALIDATE STATUS
         ========================================= */

      const allowedStatuses = [
        'Draft',
        'Ready',
        'Scheduled',
        'Published'
      ];


      if (
        !allowedStatuses.includes(
          requestedStatus
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              'Invalid distribution status.'
          });

      }


      /* =========================================
         STATUS / DATE RULES
         ========================================= */

      if (
        requestedStatus === 'Draft' ||
        requestedStatus === 'Ready'
      ) {

        scheduledDate = '';
        publishedDate = '';

      }


      if (
        requestedStatus === 'Scheduled'
      ) {

        if (
          !scheduledDate
        ) {

          return res
            .status(400)
            .json({
              error:
                'Scheduled Date is required when status is Scheduled.'
            });

        }


        publishedDate = '';

      }


      if (
        requestedStatus === 'Published'
      ) {

        if (
          !publishedDate
        ) {

          return res
            .status(400)
            .json({
              error:
                'Published Date is required when status is Published.'
            });

        }

      }


      /* =========================================
         LOAD CURRENT FILE
         ========================================= */

      const filePath =
        `${QUEUE_FOLDER}/${fileName}`;


      const fileUrl =
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
        `/contents/${filePath}?ref=${GITHUB_BRANCH}`;


      const currentResponse =
        await fetch(
          fileUrl,
          {
            headers:
              githubHeaders
          }
        );


      if (
        currentResponse.status === 404
      ) {

        return res
          .status(404)
          .json({
            error:
              'Distribution Queue item was not found.'
          });

      }


      if (
        !currentResponse.ok
      ) {

        const errorText =
          await currentResponse.text();

        console.error(
          'GitHub queue item lookup failed:',
          currentResponse.status,
          errorText
        );

        throw new Error(
          `GitHub file lookup HTTP ${currentResponse.status}`
        );

      }


      const currentFile =
        await currentResponse.json();


      if (
        !currentFile.sha ||
        !currentFile.content
      ) {

        throw new Error(
          'Unexpected GitHub queue file response.'
        );

      }


      /* =========================================
         DECODE CURRENT JSON
         ========================================= */

      let currentData;


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


        currentData =
          JSON.parse(
            decoded
          );

      } catch (error) {

        console.error(
          'Queue JSON parsing failed:',
          fileName,
          error
        );

        return res
          .status(500)
          .json({
            error:
              'Distribution Queue item contains invalid JSON.'
          });

      }


      /* =========================================
         BUILD UPDATED JSON
         ========================================= */

      const updatedData = {
        ...currentData,

        status:
          requestedStatus,

        scheduledDate,

        publishedDate
      };


      const updatedContent =
        Buffer
          .from(
            JSON.stringify(
              updatedData,
              null,
              2
            ) + '\n',
            'utf8'
          )
          .toString(
            'base64'
          );


      /* =========================================
         WRITE TO GITHUB
         ========================================= */

      const updateResponse =
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
                message:
                  `Update Distribution Queue ${fileName}`,

                content:
                  updatedContent,

                sha:
                  currentFile.sha,

                branch:
                  GITHUB_BRANCH
              })
          }
        );


      if (
        !updateResponse.ok
      ) {

        const errorText =
          await updateResponse.text();

        console.error(
          'GitHub queue update failed:',
          updateResponse.status,
          errorText
        );


        if (
          updateResponse.status === 403
        ) {

          return res
            .status(403)
            .json({
              error:
                'GitHub token does not have permission to update the queue.'
            });

        }


        throw new Error(
          `GitHub update API HTTP ${updateResponse.status}`
        );

      }


      const updateResult =
        await updateResponse.json();


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json({
          success: true,

          fileName,

          status:
            requestedStatus,

          scheduledDate,

          publishedDate,

          commit:
            updateResult
              ?.commit
              ?.sha || null,

          updatedBy:
            manager.login
        });

    }


    /* =========================================
       METHOD NOT ALLOWED
       ========================================= */

    res.setHeader(
      'Allow',
      'GET, POST, PATCH'
    );


    return res
      .status(405)
      .json({
        error:
          'Method not allowed.'
      });


  } catch (error) {

    console.error(
      'Distribution Queue API Error:',
      error
    );


    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );


    return res
      .status(500)
      .json({
        error:
          'Distribution Queue operation failed.'
      });

  }

}