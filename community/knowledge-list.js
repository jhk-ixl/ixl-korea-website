/* =========================================
   IXL KOREA COMMUNITY
   KNOWLEDGE LIST
   ========================================= */

const communityAuth =
  window.IXLCommunity.auth;

const communityKnowledge =
  window.IXLCommunity.knowledge;

const KNOWLEDGE_CATEGORIES = {
  insights: {
    title: 'Insights',
    description: 'Articles, news, research and foresight.',
    types: ['news', 'article', 'research', 'foresight']
  },
  cases: {
    title: 'Cases',
    description: 'Innovation cases and project knowledge.',
    types: ['case', 'project-knowledge']
  },
  methods: {
    title: 'Methods',
    description: 'Frameworks, methods and learning materials.',
    types: ['framework', 'learning-material']
  },
  resources: {
    title: 'Resources',
    description: 'Videos, external resources, reports and presentations.',
    types: ['video', 'external', 'book', 'report', 'presentation']
  }
};

const userNameElement =
  document.getElementById('community-user-name');

const signoutButton =
  document.getElementById('community-signout');

const titleElement =
  document.getElementById('knowledge-list-title');

const descriptionElement =
  document.getElementById('knowledge-list-description');

const countElement =
  document.getElementById('knowledge-list-count');

const listElement =
  document.getElementById('knowledge-list');

function getSelectedCategory() {
  const params =
    new URLSearchParams(window.location.search);

  return params.get('category');
}

function createKnowledgeCard(item) {
  const article =
    document.createElement('article');

  article.className =
    'knowledge-list-card';

  if (item.knowledgeId) {
    article.tabIndex = 0;
    article.setAttribute(
      'role',
      'link'
    );

    const openDetail = () => {
      window.location.href =
        `/community/knowledge-detail.html?id=${encodeURIComponent(item.knowledgeId)}`;
    };

    article.addEventListener(
      'click',
      openDetail
    );

    article.addEventListener(
      'keydown',
      event => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          openDetail();
        }
      }
    );
  }

  const meta =
    document.createElement('div');

  meta.className =
    'knowledge-list-card-meta';

  const type =
    document.createElement('span');

  type.className =
    'knowledge-list-card-type';

  type.textContent =
    item.type || 'knowledge';

  meta.appendChild(type);

  if (item.date) {
    const date =
      document.createElement('span');

    date.className =
      'knowledge-list-card-date';

    date.textContent =
      item.dateLabel || item.date;

    meta.appendChild(date);
  }

  const heading =
    document.createElement('h2');

  heading.textContent =
    item.title || 'Untitled';

  const summary =
    document.createElement('p');

  summary.textContent =
    item.summary || '';

  article.append(
    meta,
    heading,
    summary
  );

  return article;
}

function renderKnowledgeItems(category, items) {
  const filteredItems =
    items
      .filter(
        item =>
          category.types.includes(item.type)
      )
      .sort(
        (a, b) =>
          new Date(b.date || 0) -
          new Date(a.date || 0)
      );

  listElement.replaceChildren();

  countElement.textContent =
    `${filteredItems.length} Knowledge`;

  if (!filteredItems.length) {
    const empty =
      document.createElement('div');

    empty.className =
      'knowledge-list-empty';

    empty.textContent =
      'No Knowledge available yet.';

    listElement.appendChild(empty);
    return;
  }

  filteredItems.forEach(item => {
    listElement.appendChild(
      createKnowledgeCard(item)
    );
  });
}

async function initializeKnowledgeList() {
  const session =
    await communityAuth.requireSession();

  if (!session) {
    return;
  }

  await communityAuth.renderProfileName(
    session.user,
    userNameElement
  );

  const categoryKey =
    getSelectedCategory();

  const category =
    KNOWLEDGE_CATEGORIES[
      categoryKey
    ];

  if (!category) {
    window.location.href =
      '/community/knowledge.html';
    return;
  }

  titleElement.textContent =
    category.title;

  descriptionElement.textContent =
    category.description;

  try {
    const items =
      await communityKnowledge.loadItems();

    renderKnowledgeItems(
      category,
      items
    );
  } catch (error) {
    console.error(
      'Failed to load Public Knowledge:',
      error
    );

    countElement.textContent =
      'Knowledge unavailable';

    listElement.replaceChildren();

    const message =
      document.createElement('div');

    message.className =
      'knowledge-list-empty';

    message.textContent =
      'Knowledge could not be loaded.';

    listElement.appendChild(message);
  }
}

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

initializeKnowledgeList();
