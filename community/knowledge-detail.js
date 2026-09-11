/* =========================================
   IXL KOREA COMMUNITY
   KNOWLEDGE DETAIL
   ========================================= */

const communityAuth =
  window.IXLCommunity.auth;

const communityKnowledge =
  window.IXLCommunity.knowledge;

const detailElement =
  document.getElementById('knowledge-detail');

const userNameElement =
  document.getElementById('community-user-name');

const signoutButton =
  document.getElementById('community-signout');

const backLink =
  document.getElementById('knowledge-detail-back');

function getKnowledgeId() {
  const params =
    new URLSearchParams(window.location.search);

  return params.get('id');
}

function createElement(
  tagName,
  className,
  textContent
) {
  const element =
    document.createElement(tagName);

  if (className) {
    element.className =
      className;
  }

  if (textContent !== undefined) {
    element.textContent =
      textContent;
  }

  return element;
}

function renderKnowledgeBody(body) {
  const container =
    createElement(
      'div',
      'knowledge-detail-body'
    );

  if (
    !window.IXLMarkdown ||
    typeof window.IXLMarkdown.render !== 'function'
  ) {
    throw new Error(
      'Shared Markdown renderer is not available.'
    );
  }

  container.innerHTML =
    window.IXLMarkdown.render(
      body || ''
    );

  return container;
}

function createResourceSection(item) {
  const list = Array.isArray(item?.media) ? item.media : [];
  const language = item?.selectedVersionKey || '';
  const resources = list.filter(media => media && (media.language === language || media.language === 'common'));
  if (!resources.length) return null;

  const section = createElement('section', 'knowledge-detail-source');
  section.appendChild(createElement('p', 'knowledge-detail-source-label', 'RESOURCES'));

  if (item.source) {
    section.appendChild(createElement('p', null, item.source));
  }

  resources.forEach((media, index) => {
    const url = media.resolvedUrl || media.url || media.asset || '';
    if (!url) return;
    const link = createElement('a', null, media.title || `Open Resource ${index + 1}`);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    section.appendChild(link);
  });

  return section.querySelector('a') ? section : null;
}


async function renderKnowledgeDetail(item) {
  detailElement.replaceChildren();

  const header =
    createElement(
      'header',
      'knowledge-detail-header'
    );

  header.appendChild(
    createElement(
      'p',
      'eyebrow',
      String(
        item.type || 'knowledge'
      ).toUpperCase()
    )
  );

  const meta =
    createElement(
      'div',
      'knowledge-detail-meta'
    );

  if (item.dateLabel || item.date) {
    meta.appendChild(
      createElement(
        'span',
        null,
        item.dateLabel || item.date
      )
    );
  }

  if (item.author) {
    meta.appendChild(
      createElement(
        'span',
        null,
        item.author
      )
    );
  }

  if (meta.childNodes.length) {
    header.appendChild(meta);
  }

  header.appendChild(
    createElement(
      'h1',
      null,
      item.title || 'Untitled'
    )
  );

  if (item.summary) {
    header.appendChild(
      createElement(
        'p',
        'knowledge-detail-summary',
        item.summary
      )
    );
  }

  detailElement.appendChild(header);

  let body = '';

  try {
    body =
      await communityKnowledge.loadBody(item);
  } catch (error) {
    console.error(
      'Failed to load linked Knowledge body:',
      error
    );
  }

  if (body) {
    detailElement.appendChild(
      renderKnowledgeBody(body)
    );
  } else {
    detailElement.appendChild(
      createElement(
        'p',
        'knowledge-detail-empty',
        'Detailed content is not available for this Knowledge item.'
      )
    );
  }

  const resources = createResourceSection(item);

  if (resources) {
    detailElement.appendChild(resources);
  }
}

function renderNotFound() {
  detailElement.replaceChildren(
    createElement(
      'p',
      'eyebrow',
      'KNOWLEDGE'
    ),
    createElement(
      'h1',
      'knowledge-detail-not-found-title',
      'Content not found'
    ),
    createElement(
      'p',
      'knowledge-detail-empty',
      'The requested Knowledge item could not be found.'
    )
  );
}

async function initializeKnowledgeDetail() {
  const session =
    await communityAuth.requireSession();

  if (!session) {
    return;
  }

  await communityAuth.renderProfileName(
    session.user,
    userNameElement
  );

  const knowledgeId =
    getKnowledgeId();

  if (!knowledgeId) {
    renderNotFound();
    return;
  }

  try {
    const items =
      await communityKnowledge.loadItems();

    const item =
      items.find(
        entry =>
          entry.knowledgeId ===
          knowledgeId
      );

    if (!item) {
      renderNotFound();
      return;
    }

    await renderKnowledgeDetail(item);
  } catch (error) {
    console.error(
      'Failed to load Knowledge detail:',
      error
    );

    renderNotFound();
  }
}

backLink.addEventListener(
  'click',
  event => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  }
);

signoutButton.addEventListener(
  'click',
  async () => {
    signoutButton.disabled = true;

    try {
      await communityAuth.signOut();
    } catch (error) {
      console.error(error);
      signoutButton.disabled = false;
    }
  }
);

document.addEventListener(
  'DOMContentLoaded',
  initializeKnowledgeDetail
);
