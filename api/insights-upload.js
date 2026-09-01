import {
  handleUpload
} from '@vercel/blob/client';

import {
  list,
  del
} from '@vercel/blob';

import {
  requireManager
} from '../lib/manager-auth-utils.js';


export default async function handler(
  req,
  res
) {

  /* =========================================
     ALLOW GET / POST
     ========================================= */

  if (
    req.method !== 'GET' &&
    req.method !== 'POST' &&
    req.method !== 'DELETE'
  ) {

    res.setHeader(
      'Allow',
      'GET, POST, DELETE'
    );

    return res
      .status(405)
      .json({
        error:
          'Method not allowed.'
      });

  }

  /* =========================================
     VERIFY BLOB CONFIGURATION
     ========================================= */

  if (
    !process.env
      .BLOB_READ_WRITE_TOKEN
  ) {

    console.error(
      'BLOB_READ_WRITE_TOKEN is missing.'
    );

    return res
      .status(500)
      .json({
        error:
          'Blob storage is not configured.'
      });

  }

 /* =========================================
     GET BLOB ASSET LIST
     ========================================= */

  if (
    req.method === 'GET'
  ) {

    const manager =
      requireManager(
        req,
        res
      );

    if (!manager) {
      return;
    }


    try {

      const result =
        await list({
          token:
            process.env
              .BLOB_READ_WRITE_TOKEN
        });


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json({
          blobs:
            result.blobs || [],
          cursor:
            result.cursor || null,
          hasMore:
            result.hasMore || false
        });

    } catch (error) {

      console.error(
        'Blob list error:',
        error
      );


      return res
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load assets.'
        });

    }

  }

  /* =========================================
     DELETE BLOB ASSET
     ========================================= */

  if (
    req.method === 'DELETE'
  ) {

    const manager =
      requireManager(
        req,
        res
      );

    if (!manager) {
      return;
    }


    try {

      const url =
        String(
          req.body?.url || ''
        ).trim();


      if (!url) {

        return res
          .status(400)
          .json({
            error:
              'Blob URL is required.'
          });

      }


      if (
        !url.includes(
          '.public.blob.vercel-storage.com/'
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              'Invalid Blob URL.'
          });

      }


      await del(
        url,
        {
          token:
            process.env
              .BLOB_READ_WRITE_TOKEN
        }
      );


      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );


      return res
        .status(200)
        .json({
          success: true
        });


    } catch (error) {

      console.error(
        'Blob delete error:',
        error
      );


      return res
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to delete asset.'
        });

    }

  }

  /* =========================================
     HANDLE CLIENT UPLOAD
     ========================================= */

  try {

    const jsonResponse =
      await handleUpload({

        body:
          req.body,

        request:
          req,

        token:
          process.env
            .BLOB_READ_WRITE_TOKEN,


        /* =====================================
           BEFORE CLIENT UPLOAD TOKEN
           ===================================== */

        onBeforeGenerateToken:
          async (
            pathname,
            clientPayload
          ) => {

            /* ---------------------------------
               VERIFY MANAGER HERE
               --------------------------------- */

            const manager =
              requireManager(
                req,
                res
              );


            if (!manager) {

              throw new Error(
                'Manager authentication required.'
              );

            }


            /* ---------------------------------
               BASIC PATH VALIDATION
               --------------------------------- */

            const safePathname =
              String(
                pathname || ''
              )
                .replace(
                  /\\/g,
                  '/'
                )
                .replace(
                  /^\/+/,
                  ''
                );


            if (!safePathname) {

              throw new Error(
                'Invalid upload filename.'
              );

            }


            if (
              safePathname.includes(
                '..'
              )
            ) {

              throw new Error(
                'Invalid upload path.'
              );

            }


            /* ---------------------------------
               ONLY INSIGHTS UPLOAD AREA
               --------------------------------- */

            if (
                !(
                    safePathname.startsWith(
                    'insights/'
                    ) ||
                    safePathname.startsWith(
                    'companyprofile/'
                    )
                )
                ) {

                throw new Error(
                    'Upload path is not allowed.'
                );

            }


            /* ---------------------------------
               TOKEN SETTINGS
               --------------------------------- */

            return {

              allowedContentTypes: [

                'image/jpeg',
                'image/png',
                'image/webp',
                'image/gif',

                'application/pdf',

                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',

                'video/mp4',
                'video/webm',

                'audio/mpeg',
                'audio/mp4',

                'application/octet-stream'

              ],

              addRandomSuffix:
                true,

              tokenPayload:
                JSON.stringify({

                  manager:
                    manager.login,

                  clientPayload:
                    clientPayload || null,

                  createdAt:
                    new Date()
                      .toISOString()

                })

            };

          },


        /* =====================================
           AFTER UPLOAD COMPLETED
           ===================================== */

        onUploadCompleted:
          async ({
            blob,
            tokenPayload
          }) => {

            console.log(
              'IXL Korea Insights Blob upload completed:',
              {
                pathname:
                  blob.pathname,

                url:
                  blob.url,

                tokenPayload
              }
            );

          }

      });


    /* =========================================
       SUCCESS
       ========================================= */

    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );


    return res
      .status(200)
      .json(
        jsonResponse
      );


  } catch (error) {

    console.error(
      'Insights Blob upload error:',
      error
    );


    return res
      .status(400)
      .json({
        error:
          error instanceof Error
            ? error.message
            : 'Blob upload failed.'
      });

  }

}