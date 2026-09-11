/* =========================================
   IXL KOREA COMMUNITY
   DISCUSSION DETAIL / COMMENTS
   ========================================= */

const communityAuth = window.IXLCommunity.auth;
const discussionApi = window.IXLCommunity.discussionApi;

const userName = document.getElementById('community-user-name');
const signOutButton = document.getElementById('community-signout');
const detailState = document.getElementById('discussion-detail-state');
const detailCard = document.getElementById('discussion-detail');
const titleElement = document.getElementById('discussion-detail-title');
const authorElement = document.getElementById('discussion-detail-author');
const dateElement = document.getElementById('discussion-detail-date');
const bodyElement = document.getElementById('discussion-detail-body');
const knowledgeBadge = document.getElementById('discussion-knowledge-badge');
const commentsSection = document.getElementById('discussion-comments-section');
const commentsElement = document.getElementById('discussion-comments');
const commentCount = document.getElementById('discussion-comment-count');
const commentForm = document.getElementById('discussion-comment-form');
const commentBody = document.getElementById('discussion-comment-body');
const commentSubmit = document.getElementById('discussion-comment-submit');
const commentMessage = document.getElementById('discussion-comment-message');

const postId = new URLSearchParams(window.location.search).get('id');
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
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function renderBody(element, value) {
  element.innerHTML = escapeHtml(value)
    .replaceAll('\n', '<br>');
}

function renderComments(items) {
  commentCount.textContent = `${items.length} ${items.length === 1 ? 'response' : 'responses'}`;

  if (!items.length) {
    commentsElement.innerHTML = '<div class="discussion-empty-comments">No responses yet. Add the first response.</div>';
    return;
  }

  commentsElement.innerHTML = items.map((item) => `
    <article class="discussion-comment">
      <div class="discussion-comment-meta">
        <strong>${escapeHtml(item.author_name || 'Member')}</strong>
        <time>${escapeHtml(formatDate(item.created_at))}</time>
      </div>
      <p>${escapeHtml(item.body).replaceAll('\n', '<br>')}</p>
    </article>
  `).join('');
}

async function loadComments() {
  const comments = await discussionApi.listComments(postId);
  renderComments(comments);
}

async function initializeDetail() {
  currentSession = await communityAuth.requireSession();
  if (!currentSession) return;

  await communityAuth.renderProfileName(
    currentSession.user,
    userName
  );

  if (!postId) {
    detailState.innerHTML = '<strong>Discussion not found.</strong><span>No discussion ID was provided.</span>';
    return;
  }

  try {
    const post = await discussionApi.getDiscussion(postId);

    if (!post) {
      detailState.innerHTML = '<strong>Discussion not found.</strong><span>This discussion may have been removed or is no longer available.</span>';
      return;
    }

    titleElement.textContent = post.title;
    authorElement.textContent = post.author_name || 'Member';
    dateElement.textContent = formatDate(post.created_at);
    dateElement.dateTime = post.created_at || '';
    renderBody(bodyElement, post.body);
    knowledgeBadge.hidden = !post.promoted_knowledge_id;

    detailState.hidden = true;
    detailCard.hidden = false;
    commentsSection.hidden = false;

    await loadComments();
  } catch (error) {
    console.error(error);
    detailState.innerHTML = `<strong>Discussion is not ready yet.</strong><span>${escapeHtml(error.message)}</span>`;
  }
}

commentForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentSession?.user || !postId) return;

  commentSubmit.disabled = true;
  commentMessage.textContent = 'Posting…';

  try {
    await discussionApi.createComment({
      postId,
      authorId: currentSession.user.id,
      body: commentBody.value
    });

    commentBody.value = '';
    commentMessage.textContent = '';
    await loadComments();
  } catch (error) {
    console.error(error);
    commentMessage.textContent = error.message;
  } finally {
    commentSubmit.disabled = false;
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

initializeDetail();
