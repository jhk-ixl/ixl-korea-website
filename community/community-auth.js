/* =========================================
   IXL KOREA COMMUNITY
   SHARED AUTH / PROFILE
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

  async function getSession() {
    const {
      data: { session },
      error
    } = await supabaseClient.auth.getSession();

    if (error) {
      throw error;
    }

    return session || null;
  }

  async function requireSession(
    redirectTo = '/community/'
  ) {
    try {
      const session = await getSession();

      if (!session?.user) {
        window.location.replace(redirectTo);
        return null;
      }

      return session;
    } catch (error) {
      console.error(error);
      window.location.replace(redirectTo);
      return null;
    }
  }

  async function ensureProfile(
    user,
    suppliedFullName = ''
  ) {
    if (!user) {
      return;
    }

    const fullName =
      String(
        suppliedFullName ||
        user.user_metadata?.full_name ||
        ''
      ).trim();

    const { error } =
      await supabaseClient
        .from('profiles')
        .upsert(
          {
            id: user.id,
            full_name: fullName,
            updated_at:
              new Date().toISOString()
          },
          {
            onConflict: 'id'
          }
        );

    if (error) {
      throw error;
    }
  }

  async function getProfileName(user) {
    if (!user) {
      return 'Member';
    }

    const { data, error } =
      await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
      console.error(error);
    }

    return (
      data?.full_name?.trim() ||
      user.user_metadata?.full_name?.trim() ||
      user.email ||
      'Member'
    );
  }

  async function renderProfileName(
    user,
    element
  ) {
    if (!element) {
      return;
    }

    element.textContent =
      await getProfileName(user);
  }

  async function signOut(
    redirectTo = '/community/'
  ) {
    const { error } =
      await supabaseClient.auth.signOut();

    if (error) {
      throw error;
    }

    window.location.replace(redirectTo);
  }

  root.auth = {
    getSession,
    requireSession,
    ensureProfile,
    getProfileName,
    renderProfileName,
    signOut
  };
})();
