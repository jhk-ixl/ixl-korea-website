export default async function handler(req, res) {

  /* =========================================
     CONFIG
     ========================================= */

  const GITHUB_OWNER = 'jhk-ixl';
  const GITHUB_REPO = 'ixl-korea-website';
  const GITHUB_BRANCH = 'master';

  const QUEUE_FOLDER =
    'insightscontent/distributionqueue';


  /* =========================================
     ONLY GET
     ========================================= */

  if (req.method !== 'GET') {

    res.setHeader(
      'Allow',
      'GET'
    );

    return res
      .status(405)
      .json({
        error: 'Method not allowed.'
      });

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


  try {

    /* =========================================
       1. GET QUEUE FILE LIST
       ========================================= */

    const folderUrl =
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
      `/contents/${QUEUE_FOLDER}?ref=${GITHUB_BRANCH}`;


    const folderResponse =
      await fetch(
        folderUrl,
        {
          headers: {
            'Accept':
              'application/vnd.github+json',

            'Authorization':
              `Bearer ${githubToken}`,

            'X-GitHub-Api-Version':
              '2022-11-28',

            'User-Agent':
              'IXL-Korea-Website'
          }
        }
      );


    /*
      Queue folder does not exist yet.
      Treat it as an empty queue.
    */

    if (folderResponse.status === 404) {

      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );

      return res
        .status(200)
        .json([]);

    }


    if (!folderResponse.ok) {

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


    if (!Array.isArray(files)) {

      throw new Error(
        'Unexpected GitHub folder response.'
      );

    }


    /* =========================================
       2. SELECT JSON FILES
       ========================================= */

    const jsonFiles =
      files.filter(
        file =>
          file.type === 'file' &&
          file.name &&
          file.name
            .toLowerCase()
            .endsWith('.json')
      );


    if (!jsonFiles.length) {

      res.setHeader(
        'Cache-Control',
        'no-store, max-age=0'
      );

      return res
        .status(200)
        .json([]);

    }


    /* =========================================
       3. LOAD EACH QUEUE FILE
       ========================================= */

    const results =
      await Promise.all(

        jsonFiles.map(

          async file => {

            const fileResponse =
              await fetch(
                file.url,
                {
                  headers: {
                    'Accept':
                      'application/vnd.github.raw+json',

                    'Authorization':
                      `Bearer ${githubToken}`,

                    'X-GitHub-Api-Version':
                      '2022-11-28',

                    'User-Agent':
                      'IXL-Korea-Website'
                  }
                }
              );


            if (!fileResponse.ok) {

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
              _fileName: file.name
            };

          }

        )

      );


    /* =========================================
       4. SORT
       NEWEST FIRST
       ========================================= */

    results.sort(
      (a, b) => {

        const dateA =
          new Date(
            a.createdDate || 0
          );

        const dateB =
          new Date(
            b.createdDate || 0
          );

        return dateB - dateA;

      }
    );


    /* =========================================
       5. RETURN TO MANAGER
       ========================================= */

    res.setHeader(
      'Cache-Control',
      'no-store, max-age=0'
    );


    return res
      .status(200)
      .json(results);


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
          'Failed to load distribution queue.'
      });

  }

}