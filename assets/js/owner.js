/* =========================================================
   OWNER PAGE BRIDGE
   - ตรวจ Session OWNER
   - ทำให้ google.script.run เดิม ใช้กับ GitHub Pages ได้
   - ทุกคำสั่งวิ่งผ่าน Backend และตรวจ Token
--------------------------------------------------------- */

(function () {

  const OWNER_TOKEN_KEY =
    'OWNER_TOKEN';


  function getOwnerToken() {

    return sessionStorage.getItem(
      OWNER_TOKEN_KEY
    ) || '';
  }


  function requireOwnerLogin() {

    const token =
      getOwnerToken();


    if (!token) {

      window.location.replace(
        './index.html'
      );

      return false;
    }


    return true;
  }


  /*
   * ต้องเช็กทันที เพราะไฟล์นี้ถูกโหลดใน <head>
   * ก่อน loadApp() ของ owner.html
   */
  if (
    !requireOwnerLogin()
  ) {

    return;
  }


  /* =========================================================
     google.script.run BRIDGE
  --------------------------------------------------------- */

  function makeScriptRunner(
    successHandler = null,
    failureHandler = null
  ) {

    return new Proxy(
      {},
      {

        get(
          target,
          property
        ) {

          if (
            property ===
            'withSuccessHandler'
          ) {

            return function (
              handler
            ) {

              return makeScriptRunner(
                handler,
                failureHandler
              );
            };
          }


          if (
            property ===
            'withFailureHandler'
          ) {

            return function (
              handler
            ) {

              return makeScriptRunner(
                successHandler,
                handler
              );
            };
          }


          if (
            typeof property ===
            'symbol'
          ) {

            return undefined;
          }


          return function (
            ...args
          ) {

            callBackendMethod(
              String(
                property
              ),
              args,
              successHandler,
              failureHandler
            );

            return undefined;
          };

        }

      }
    );
  }


  async function callBackendMethod(
    method,
    args,
    successHandler,
    failureHandler
  ) {

    try {

      const result =
        await apiOwnerCall(
          method,
          args
        );


      if (
        result?.authExpired
      ) {

        handleAuthExpired(
          result.error
        );

        return;
      }


      if (
        !result ||
        result.ok !== true
      ) {

        throw new Error(
          result?.error ||
          'เกิดข้อผิดพลาดจากระบบ'
        );
      }


      if (
        typeof successHandler ===
        'function'
      ) {

        successHandler(
          result.data
        );
      }


    } catch (
      error
    ) {

      console.error(
        '[OWNER API]',
        method,
        error
      );


      const message =
        cleanOwnerError(
          error
        );


      if (
        /session|เข้าสู่ระบบ owner/i
          .test(
            message
          )
      ) {

        handleAuthExpired(
          message
        );

        return;
      }


      if (
        typeof failureHandler ===
        'function'
      ) {

        failureHandler({
          message:
            message
        });

        return;
      }


      console.error(
        message
      );

    }
  }


  function handleAuthExpired(
    message
  ) {

    sessionStorage.removeItem(
      OWNER_TOKEN_KEY
    );


    sessionStorage.removeItem(
      'OWNER_LOGIN_TIME'
    );


    alert(
      message ||
      'Session OWNER หมดอายุ กรุณาเข้าสู่ระบบใหม่'
    );


    window.location.replace(
      './index.html'
    );
  }


  function cleanOwnerError(
    error
  ) {

    return String(
      error?.message ||
      error ||
      'เกิดข้อผิดพลาด'
    )
    .replace(
      /^Error:\s*/i,
      ''
    )
    .trim();
  }


  window.google =
    window.google || {};


  window.google.script =
    window.google.script || {};


  Object.defineProperty(
    window.google.script,
    'run',
    {

      configurable: true,

      get() {

        return makeScriptRunner();
      }

    }
  );


  async function logoutOwner() {

    const confirmLogout =
      window.confirm(
        'ออกจากระบบ OWNER ใช่ก่อ?'
      );


    if (
      !confirmLogout
    ) {

      return;
    }


    try {

      await apiOwnerLogout();

    } catch (
      error
    ) {

      console.warn(
        'Logout backend:',
        error
      );

    } finally {

      sessionStorage.removeItem(
        OWNER_TOKEN_KEY
      );


      sessionStorage.removeItem(
        'OWNER_LOGIN_TIME'
      );


      window.location.replace(
        './index.html'
      );
    }
  }


  window.logoutOwner =
    logoutOwner;


  document.addEventListener(
    'DOMContentLoaded',
    function () {

      if (
        !requireOwnerLogin()
      ) {

        return;
      }


      if (
        document.getElementById(
          'ownerLogoutButton'
        )
      ) {

        return;
      }


      const button =
        document.createElement(
          'button'
        );


      button.id =
        'ownerLogoutButton';


      button.type =
        'button';


      button.innerHTML =
        '↪️ ออกจาก OWNER';


      button.onclick =
        logoutOwner;


      Object.assign(
        button.style,
        {

          position:
            'fixed',

          right:
            '18px',

          bottom:
            '18px',

          zIndex:
            '99999',

          border:
            '1px solid #ddd7fa',

          background:
            '#f3efff',

          color:
            '#6655b8',

          borderRadius:
            '14px',

          padding:
            '10px 16px',

          fontFamily:
            'inherit',

          fontSize:
            '12px',

          fontWeight:
            '800',

          cursor:
            'pointer',

          boxShadow:
            '0 8px 24px rgba(80,70,130,.12)'

        }
      );


      document.body.appendChild(
        button
      );

    }
  );


})();