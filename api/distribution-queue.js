export default async function handler(req, res) {

  const GITHUB_OWNER = 'jhk-ixl';
  const GITHUB_REPO = 'ixl-korea-website';
  const GITHUB_BRANCH = 'master';

  const QUEUE_FOLDER =
    'insightscontent/distributionqueue';

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
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'IXL-Korea-Website'
          }
        }
      );


    /*
      Queue folder does not exist yet.
      Return an empty queue.
    */

    if (folderResponse.status === 404) {

      return res.status(200).json([]);

    }


    if (!folderResponse.ok) {

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


    const jsonFiles =
      files.filter(
        file =>
          file.type === 'file' &&
          file.name &&
          file.name.toLowerCase().endsWith('.json')
      );


    /* =========================================
       2. LOAD EACH QUEUE FILE
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

                    'User-Agent':
                      'IXL-Korea-Website'
                  }
                }
              );


            if (!fileResponse.ok) {

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
       3. SORT
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
       4. RETURN TO MANAGER
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


    return res
      .status(500)
      .json({
        error:
          'Failed to load distribution queue.'
      });

  }

}