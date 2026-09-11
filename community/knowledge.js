/* =========================================
   IXL KOREA COMMUNITY
   KNOWLEDGE HUB
   ========================================= */

const communityAuth =
  window.IXLCommunity.auth;

const communityKnowledge =
  window.IXLCommunity.knowledge;


/* =========================================
   KNOWLEDGE HUB CATEGORIES
   ========================================= */

const KNOWLEDGE_CATEGORIES = {
  insights: {
    title: 'Insights',
    types: [
      'news',
      'article',
      'research',
      'foresight'
    ]
  },

  cases: {
    title: 'Cases',
    types: [
      'case',
      'project-knowledge'
    ]
  },

  methods: {
    title: 'Methods',
    types: [
      'framework',
      'learning-material'
    ]
  },

  resources: {
    title: 'Resources',
    types: [
      'video',
      'external',
      'book',
      'report',
      'presentation'
    ]
  }
};


/* =========================================
   KNOWLEDGE DATA
   ========================================= */

let knowledgeItems = [];

async function loadKnowledgeData() {
  try {
    knowledgeItems =
      await communityKnowledge.loadItems();

    console.log(
      'Public Knowledge items loaded:',
      knowledgeItems.length
    );

    updateKnowledgeCounts();
  } catch (error) {
    console.error(
      'Failed to load Public Knowledge:',
      error
    );

    knowledgeItems = [];
    updateKnowledgeCounts();
  }
}

function updateKnowledgeCounts() {
  Object.entries(
    KNOWLEDGE_CATEGORIES
  ).forEach(
    ([categoryKey, category]) => {
      const count =
        knowledgeItems.filter(
          item =>
            category.types.includes(
              item.type
            )
        ).length;

      const countElement =
        document.querySelector(
          `[data-count-for="${categoryKey}"]`
        );

      if (countElement) {
        countElement.textContent =
          `${count} Knowledge`;
      }
    }
  );
}


/* =========================================
   ELEMENTS
   ========================================= */

const userName =
  document.getElementById(
    'community-user-name'
  );

const signOutButton =
  document.getElementById(
    'community-signout'
  );


/* =========================================
   SESSION CHECK
   ========================================= */

async function initializeKnowledgeHub() {
  const session =
    await communityAuth.requireSession();

  if (!session) {
    return;
  }

  await communityAuth.renderProfileName(
    session.user,
    userName
  );

  await loadKnowledgeData();
}


/* =========================================
   KNOWLEDGE CATEGORY CLICK
   ========================================= */

document
  .querySelectorAll(
    '.knowledge-hub-card[data-category]'
  )
  .forEach(card => {
    card.addEventListener(
      'click',
      () => {
        const category =
          card.dataset.category;

        window.location.href =
          `/community/knowledge-list.html?category=${encodeURIComponent(category)}`;
      }
    );
  });


/* =========================================
   SIGN OUT
   ========================================= */

signOutButton.addEventListener(
  'click',
  async () => {
    signOutButton.disabled = true;

    try {
      await communityAuth.signOut();
    } catch (error) {
      console.error(error);
      signOutButton.disabled = false;
    }
  }
);

initializeKnowledgeHub();
