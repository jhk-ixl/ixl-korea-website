/* =========================================
   IXL KOREA COMMUNITY
   COMMUNITY HUB
   ========================================= */

const communityAuth =
  window.IXLCommunity.auth;

const userName =
  document.getElementById('community-user-name');

const signOutButton =
  document.getElementById('community-signout');


async function initializeCommunityHub() {
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

initializeCommunityHub();
