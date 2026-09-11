/* =========================================
   IXL KOREA COMMUNITY
   DISCUSSION LIST / CREATE
   ========================================= */

const communityAuth = window.IXLCommunity.auth;
const discussionApi = window.IXLCommunity.discussionApi;

const userName = document.getElementById('community-user-name');
const signOutButton = document.getElementById('community-signout');
const newToggle = document.getElementById('discussion-new-toggle');
const composer = document.getElementById('discussion-composer');
const cancelButton = document.getElementById('discussion-cancel');
const form = document.getElementById('discussion-form');
const titleInput = document.getElementById('discussion-title');
const bodyInput = document.getElementById('discussion-body');
const submitButton = document.getElementById('discussion-submit');
const formMessage = document.getElementById('discussion-form-message');
const state = document.getElementById('discussion-state');
const list = document.getElementById('discussion-list');
const count = document.getElementById('discussion-count');

let currentSession = null;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

function excerpt(value, maxLength = 220) {
  const text = String(value || '').trim();
  return text.length > maxLength
    ? `${text.slice(0, maxLength).trim()}…`
    : text;
}

function showComposer() {
  composer.hidden = false;
  newToggle.setAttribute('aria-expanded', 'true');
  titleInput.focus();
}

function hideComposer() {
  composer.hidden = true;
  newToggle.setAttribute('aria-expanded', 'false');
  formMessage.textContent = '';
}

function renderDiscussions(items) {
  count.textContent = `${items.length} ${items.length === 1 ? 'discussion' : 'discussions'}`;

  if (!items.length) {
    list.hidden = true;
    state.hidden = false;
    state.innerHTML = '<strong>No discussions yet.</strong><span>Start the first conversation in the IXL Korea Community.</span>';
    return;
  }

  list.innerHTML = items.map((item) => `
    <a class="discussion-card" href="/community/discussion-detail.html?id=${encodeURIComponent(item.id)}">
      <div class="discussion-card-topline">
        <span class="discussion-type">Discussion</span>
        <time>${escapeHtml(formatDate(item.created_at))}</time>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(excerpt(item.body))}</p>
      <div class="discussion-card-footer">
        <span>${escapeHtml(item.author_name || 'Member')}</span>
        <span>View discussion →</span>
      </div>
    </a>
  `).join('');

  state.hidden = true;
  list.hidden = false;
}

async function loadDiscussions() {
  state.hidden = false;
  state.textContent = 'Loading discussions…';
  list.hidden = true;

  try {
    const items = await discussionApi.listDiscussions();
    renderDiscussions(items);
  } catch (error) {
    console.error(error);
    count.textContent = '';
    state.hidden = false;
    state.innerHTML = `<strong>Discussion is not ready yet.</strong><span>${escapeHtml(error.message)}</span>`;
  }
}

async function initializeDiscussion() {
  currentSession = await communityAuth.requireSession();
  if (!currentSession) return;

  await communityAuth.renderProfileName(
    currentSession.user,
    userName
  );

  await loadDiscussions();
}

newToggle.addEventListener('click', () => {
  if (composer.hidden) showComposer();
  else hideComposer();
});

cancelButton.addEventListener('click', hideComposer);

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentSession?.user) return;

  submitButton.disabled = true;
  formMessage.textContent = 'Publishing…';

  try {
    const created = await discussionApi.createDiscussion({
      authorId: currentSession.user.id,
      title: titleInput.value,
      body: bodyInput.value
    });

    form.reset();
    window.location.href =
      `/community/discussion-detail.html?id=${encodeURIComponent(created.id)}`;
  } catch (error) {
    console.error(error);
    formMessage.textContent = error.message;
    submitButton.disabled = false;
  }
});

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  try {
    await communityAuth.signOut();
  } catch (error) {
    console.error(error);
    signOutButton.disabled = false;
  }
});

initializeDiscussion();
