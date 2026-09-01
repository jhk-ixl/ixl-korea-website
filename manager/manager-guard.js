/* =========================================
   IXL KOREA MANAGER
   ACCESS GUARD
   ========================================= */

(function () {

  'use strict';


  /* =========================================
     HIDE PAGE UNTIL AUTH CHECK
     ========================================= */

  document.documentElement.style.visibility =
    'hidden';


  /* =========================================
     CHECK MANAGER SESSION
     ========================================= */

  async function checkManagerSession() {

    try {

      const response =
        await fetch(
          '/api/manager-session',
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin'
          }
        );


      if (!response.ok) {

        redirectToLogin();

        return;

      }


      const data =
        await response.json();


      if (
        !data ||
        data.authenticated !== true
      ) {

        redirectToLogin();

        return;

      }


      /* =========================================
         AUTHENTICATED
         SHOW MANAGER PAGE
         ========================================= */

      document.documentElement.style.visibility =
        'visible';


      /* =========================================
         OPTIONAL USER INFORMATION
         ========================================= */

      window.IXL_MANAGER_USER = {
        login:
          data.login || ''
      };


    } catch (error) {

      console.error(
        'Manager authentication check failed:',
        error
      );


      redirectToLogin();

    }

  }


  /* =========================================
     REDIRECT TO LOGIN
     ========================================= */

  function redirectToLogin() {

    window.location.replace(
      '/manager/login.html'
    );

  }


  /* =========================================
     LOGOUT
     ========================================= */

  async function logoutManager() {

    try {

      await fetch(
        '/api/manager-session',
        {
          method: 'POST',
          credentials: 'same-origin'
        }
      );

    } catch (error) {

      console.error(
        'Manager logout failed:',
        error
      );

    }


    window.location.replace(
      '/manager/login.html'
    );

  }


  /* =========================================
     MAKE LOGOUT AVAILABLE
     TO MANAGER PAGES
     ========================================= */

  window.logoutManager =
    logoutManager;


  /* =========================================
     START AUTH CHECK
     ========================================= */

  checkManagerSession();

})();