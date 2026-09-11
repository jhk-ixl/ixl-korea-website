/* =========================================
   IXL KOREA COMMUNITY
   SHARED DISCUSSION DATA API
   ========================================= */

(function () {
  const root = window.IXLCommunity =
    window.IXLCommunity || {};

  const supabaseClient = root.supabase;

  if (!supabaseClient) {
    throw new Error(
      'IXL Community Supabase client is not available.'
    );
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function mapDatabaseError(error) {
    if (!error) {
      return new Error('Unknown Community data error.');
    }

    const message = String(error.message || '');

    if (
      message.includes('community_posts') ||
      message.includes('community_comments') ||
      error.code === '42P01'
    ) {
      return new Error(
        'Community database tables are not configured yet. Run community/supabase-community-schema.sql in the Supabase SQL Editor.'
      );
    }

    return error;
  }

  async function getProfileNames(userIds) {
    const ids = [
      ...new Set(
        (userIds || []).filter(Boolean)
      )
    ];

    if (!ids.length) {
      return {};
    }

    const { data, error } =
      await supabaseClient
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);

    if (error) {
      console.error(error);
      return {};
    }

    return (data || []).reduce(
      (map, profile) => {
        map[profile.id] =
          normalizeText(profile.full_name) ||
          'Member';
        return map;
      },
      {}
    );
  }

  async function listDiscussions() {
    const { data, error } =
      await supabaseClient
        .from('community_posts')
        .select(
          'id, author_id, post_type, title, body, status, promoted_knowledge_id, created_at, updated_at'
        )
        .eq('post_type', 'discussion')
        .eq('status', 'active')
        .order('created_at', {
          ascending: false
        });

    if (error) {
      throw mapDatabaseError(error);
    }

    const names = await getProfileNames(
      (data || []).map(
        (item) => item.author_id
      )
    );

    return (data || []).map(
      (item) => ({
        ...item,
        author_name:
          names[item.author_id] || 'Member'
      })
    );
  }

  async function getDiscussion(postId) {
    const id = normalizeText(postId);

    if (!id) {
      return null;
    }

    const { data, error } =
      await supabaseClient
        .from('community_posts')
        .select(
          'id, author_id, post_type, title, body, status, promoted_knowledge_id, created_at, updated_at'
        )
        .eq('id', id)
        .eq('post_type', 'discussion')
        .eq('status', 'active')
        .maybeSingle();

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data) {
      return null;
    }

    const names = await getProfileNames([
      data.author_id
    ]);

    return {
      ...data,
      author_name:
        names[data.author_id] || 'Member'
    };
  }

  async function createDiscussion({
    authorId,
    title,
    body
  }) {
    const cleanAuthorId =
      normalizeText(authorId);
    const cleanTitle = normalizeText(title);
    const cleanBody = normalizeText(body);

    if (!cleanAuthorId) {
      throw new Error(
        'You must be signed in to create a discussion.'
      );
    }

    if (!cleanTitle || !cleanBody) {
      throw new Error(
        'Title and discussion text are required.'
      );
    }

    const { data, error } =
      await supabaseClient
        .from('community_posts')
        .insert({
          author_id: cleanAuthorId,
          post_type: 'discussion',
          title: cleanTitle,
          body: cleanBody,
          status: 'active'
        })
        .select('id')
        .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    return data;
  }

  async function listComments(postId) {
    const id = normalizeText(postId);

    if (!id) {
      return [];
    }

    const { data, error } =
      await supabaseClient
        .from('community_comments')
        .select(
          'id, post_id, author_id, body, status, created_at, updated_at'
        )
        .eq('post_id', id)
        .eq('status', 'active')
        .order('created_at', {
          ascending: true
        });

    if (error) {
      throw mapDatabaseError(error);
    }

    const names = await getProfileNames(
      (data || []).map(
        (item) => item.author_id
      )
    );

    return (data || []).map(
      (item) => ({
        ...item,
        author_name:
          names[item.author_id] || 'Member'
      })
    );
  }

  async function createComment({
    postId,
    authorId,
    body
  }) {
    const cleanPostId = normalizeText(postId);
    const cleanAuthorId =
      normalizeText(authorId);
    const cleanBody = normalizeText(body);

    if (
      !cleanPostId ||
      !cleanAuthorId ||
      !cleanBody
    ) {
      throw new Error(
        'A signed-in member and comment text are required.'
      );
    }

    const { data, error } =
      await supabaseClient
        .from('community_comments')
        .insert({
          post_id: cleanPostId,
          author_id: cleanAuthorId,
          body: cleanBody,
          status: 'active'
        })
        .select('id')
        .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    return data;
  }

  root.discussionApi = {
    listDiscussions,
    getDiscussion,
    createDiscussion,
    listComments,
    createComment
  };
})();
