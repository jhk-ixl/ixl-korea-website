/* =========================================
   IXL KOREA COMMUNITY
   AUTH
   ========================================= */

const supabaseClient =
  window.IXLCommunity.supabase;

const communityAuth =
  window.IXLCommunity.auth;

/* =========================================
   COMMUNITY AUTH
   ========================================= */

const loginTab =
  document.getElementById('login-tab');

const signupTab =
  document.getElementById('signup-tab');

const authForm =
  document.getElementById('auth-form');

const fullNameField =
  document.getElementById('full-name-field');

const fullNameInput =
  document.getElementById('full-name');

const emailInput =
  document.getElementById('email');

const passwordInput =
  document.getElementById('password');

const authSubmit =
  document.getElementById('auth-submit');

const authMessage =
  document.getElementById('auth-message');

let authMode = 'login';


/* =========================================
   AUTH MODE
   ========================================= */

function setAuthMode(mode) {
  authMode = mode;

  const isSignup =
    mode === 'signup';

  loginTab.classList.toggle(
    'active',
    !isSignup
  );

  signupTab.classList.toggle(
    'active',
    isSignup
  );

  fullNameField.hidden =
    !isSignup;

  fullNameInput.required =
    isSignup;

  passwordInput.autocomplete =
    isSignup
      ? 'new-password'
      : 'current-password';

  authSubmit.textContent =
    isSignup
      ? 'Create Account'
      : 'Sign In';

  authMessage.textContent = '';
}


/* =========================================
   TAB EVENTS
   ========================================= */

loginTab.addEventListener(
  'click',
  () => setAuthMode('login')
);

signupTab.addEventListener(
  'click',
  () => setAuthMode('signup')
);


/* =========================================
   CREATE ACCOUNT
   ========================================= */

async function createAccount() {
  const fullName =
    fullNameInput.value.trim();

  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;

  const { data, error } =
    await supabaseClient.auth.signUp({
      email,
      password,

      options: {
        data: {
          full_name: fullName
        },

        emailRedirectTo:
          `${window.location.origin}/community/`
      }
    });

  if (error) {
    throw error;
  }

  /*
   * Confirm email is enabled.
   * The profile row will be created
   * after the authenticated user is available.
   */

  if (data.session && data.user) {
    await ensureProfile(
      data.user,
      fullName
    );
  }

  authMessage.textContent =
    'Account created. Please check your email to confirm your account.';
}


/* =========================================
   SIGN IN
   ========================================= */

async function signIn() {
  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;

  const { data, error } =
    await supabaseClient.auth
      .signInWithPassword({
        email,
        password
      });

  if (error) {
    throw error;
  }

  await ensureProfile(
    data.user
  );

  window.location.href =
  '/community/home.html';
}


/* =========================================
   PROFILE
   ========================================= */

const ensureProfile =
  communityAuth.ensureProfile;


/* =========================================
   FORM SUBMIT
   ========================================= */

authForm.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    authSubmit.disabled = true;
    authMessage.textContent =
      'Please wait...';

    try {
      if (authMode === 'signup') {
        await createAccount();
      } else {
        await signIn();
      }
    } catch (error) {
      console.error(error);

      authMessage.textContent =
        error.message ||
        'Something went wrong.';
    } finally {
      authSubmit.disabled = false;
    }
  }
);


/* =========================================
   INITIAL SESSION
   ========================================= */

async function initializeCommunity() {
  let session = null;

  try {
    session =
      await communityAuth.getSession();
  } catch (error) {
    console.error(error);
    return;
  }

  if (!session?.user) {
    return;
  }

  try {
    await ensureProfile(
      session.user
    );

    window.location.href =
        '/community/home.html';
        
  } catch (error) {
    console.error(error);

    authMessage.textContent =
      error.message ||
      'Could not load your profile.';
  }
}

initializeCommunity();