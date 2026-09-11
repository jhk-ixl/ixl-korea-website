/* =========================================
   IXL KOREA COMMUNITY
   HOME
   ========================================= */

const communityAuth =
  window.IXLCommunity.auth;


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
   START
   ========================================= */

async function initializeCommunityHome() {
  const session =
    await communityAuth.requireSession();

  if (!session) {
    return;
  }

  await communityAuth.renderProfileName(
    session.user,
    userName
  );
}


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

initializeCommunityHome();
