/* =========================================================
   OWNER PAGE BRIDGE — FAST VERSION
   - ตรวจ Session OWNER
   - แปลง google.script.run ให้ใช้กับ GitHub Pages
   - Cache ข้อมูลที่อ่านแล้วใน Browser
   - รวม request ซ้ำที่กำลังโหลดอยู่
   - ลด Full-screen Loading หลังเข้า OWNER สำเร็จ
========================================================= */

(function () {

  const OWNER_TOKEN_KEY = 'OWNER_TOKEN';

  /*
   * Cache เฉพาะคำสั่งอ่านข้อมูล
   * ค่าเป็น milliseconds
   */
  const READ_CACHE_TTL = {
    setupSystem: 120000,
    getImportSheets: 300000,
    getEmployeeCalendar: 60000,
    getShiftHistory: 30000,
    getSchedule: 60000,
    getManpower: 60000,
    getEmployeeView: 60000
  };

  /*
   * คำสั่งที่แก้ข้อมูล
   * เมื่อสำเร็จให้ล้าง Cache ฝั่ง Browser ทั้งหมด
   */
  const MUTATION_METHODS = new Set([
    'importEmployeesFromSheet',
    'saveEmployee',
    'deleteEmployee',
    'saveShiftSet',
    'deleteShiftSet',
    'saveAssignment',
    'deactivateAssignment',
    'saveEmployeeDayNote',
    'saveShiftOverridesBatch',
    'saveSetting',
    'deleteSetting'
  ]);

  const READ_CACHE = new Map();
  const IN_FLIGHT = new Map();


  function getOwnerToken() {

    return sessionStorage.getItem(
      OWNER_TOKEN_KEY
    ) || '';
  }


  function requireOwnerLogin() {

    if (
      getOwnerToken()
    ) {
      return true;
    }

    window.location.replace(
      './index.html'
    );

    return false;
  }


  if (
    !requireOwnerLogin()
  ) {
    return;
  }


  /* =========================================================
     CACHE
  ========================================================= */

  function cacheKey(
    method,
    args
  ) {

    let serialized = '[]';

    try {
      serialized =
        JSON.stringify(
          args || []
        );
    } catch (_) {}

    return (
      method +
      '|' +
      serialized
    );
  }


  function getCachedResult(
    method,
    args
  ) {

    const ttl =
      READ_CACHE_TTL[
        method
      ] || 0;

    if (!ttl) {
      return null;
    }

    const key =
      cacheKey(
        method,
        args
      );

    const item =
      READ_CACHE.get(
        key
      );

    if (!item) {
      return null;
    }

    if (
      Date.now() -
      item.time >
      ttl
    ) {

      READ_CACHE.delete(
        key
      );

      return null;
    }

    return item.result;
  }


  function saveCachedResult(
    method,
    args,
    result
  ) {

    if (
      !READ_CACHE_TTL[
        method
      ]
    ) {
      return;
    }

    READ_CACHE.set(
      cacheKey(
        method,
        args
      ),
      {
        time: Date.now(),
        result: result
      }
    );
  }


  function clearOwnerReadCache() {

    READ_CACHE.clear();
  }


  window.clearOwnerReadCache =
    clearOwnerReadCache;


  /* =========================================================
     REQUEST DEDUPLICATION
  ========================================================= */

  async function requestOwnerMethod(
    method,
    args
  ) {

    const cached =
      getCachedResult(
        method,
        args
      );

    if (cached) {
      return cached;
    }

    const key =
      cacheKey(
        method,
        args
      );

    if (
      IN_FLIGHT.has(
        key
      )
    ) {

      return IN_FLIGHT.get(
        key
      );
    }

    const request =
      apiOwnerCall(
        method,
        args
      )
      .then(
        result => {

          if (
            result &&
            result.ok === true
          ) {

            if (
              MUTATION_METHODS.has(
                method
              )
            ) {

              clearOwnerReadCache();

            } else {

              saveCachedResult(
                method,
                args,
                result
              );
            }
          }

          return result;
        }
      )
      .finally(
        () => {

          IN_FLIGHT.delete(
            key
          );
        }
      );

    IN_FLIGHT.set(
      key,
      request
    );

    return request;
  }


  /* =========================================================
     google.script.run BRIDGE
  ========================================================= */

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

            return handler =>
              makeScriptRunner(
                handler,
                failureHandler
              );
          }

          if (
            property ===
            'withFailureHandler'
          ) {

            return handler =>
              makeScriptRunner(
                successHandler,
                handler
              );
          }

          if (
            typeof property ===
            'symbol'
          ) {

            return undefined;
          }

          return (
            ...args
          ) => {

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
        await requestOwnerMethod(
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

    READ_CACHE.clear();
    IN_FLIGHT.clear();

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


  /* =========================================================
     FAST LOADING UI
     - รอบแรก: Full-screen Loading แบบเดิม แต่หน่วง 250ms
     - หลังจากนั้น: ใช้กล่องเล็กด้านล่าง ไม่เบลอทั้งหน้า
     - ถ้า Cache ตอบเร็วกว่า 180ms จะไม่เห็น Loading เลย
  ========================================================= */

  function installFastLoading() {

    if (
      typeof window.setLoading !==
      'function'
    ) {
      return;
    }

    const originalSetLoading =
      window.setLoading;

    let firstCycle = true;
    let activeCount = 0;
    let timer = null;

    const mini =
      document.createElement(
        'div'
      );

    mini.id =
      'ownerMiniLoading';

    mini.textContent =
      '⏳ กำลังโหลดข้อมูล...';

    Object.assign(
      mini.style,
      {
        display: 'none',
        position: 'fixed',
        left: '50%',
        bottom: '18px',
        transform: 'translateX(-50%)',
        zIndex: '99998',
        padding: '10px 16px',
        borderRadius: '14px',
        border: '1px solid #dfe5ee',
        background: 'rgba(255,255,255,.96)',
        color: '#526173',
        fontFamily: 'inherit',
        fontSize: '12px',
        fontWeight: '800',
        boxShadow:
          '0 10px 30px rgba(45,60,85,.12)',
        backdropFilter: 'blur(8px)'
      }
    );

    document.body.appendChild(
      mini
    );


    window.setLoading =
      function (
        show
      ) {

        if (show) {

          activeCount++;

          clearTimeout(
            timer
          );

          timer =
            setTimeout(
              () => {

                if (
                  activeCount <= 0
                ) {
                  return;
                }

                if (
                  firstCycle
                ) {

                  originalSetLoading(
                    true
                  );

                } else {

                  mini.style.display =
                    'block';
                }

              },
              firstCycle
                ? 250
                : 180
            );

          return;
        }


        activeCount =
          Math.max(
            0,
            activeCount - 1
          );


        if (
          activeCount > 0
        ) {
          return;
        }


        clearTimeout(
          timer
        );


        originalSetLoading(
          false
        );


        mini.style.display =
          'none';


        if (
          firstCycle
        ) {

          firstCycle =
            false;
        }
      };
  }


  /* =========================================================
     LOGOUT
  ========================================================= */

  async function logoutOwner() {

    const confirmLogout =
      window.confirm(
        'ออกจากระบบ OWNER ใช่หรือไม่?'
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

      READ_CACHE.clear();
      IN_FLIGHT.clear();

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


  /* =========================================================
     DOM READY
  ========================================================= */

  document.addEventListener(
    'DOMContentLoaded',
    function () {

      if (
        !requireOwnerLogin()
      ) {
        return;
      }

      /*
       * Listener ของ owner.js ถูกลงทะเบียนก่อน
       * loadApp() ใน owner.html
       * ดังนั้นจุดนี้จะแทน setLoading ได้ก่อน loadApp เริ่ม
       */
      installFastLoading();


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
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          zIndex: '99999',
          border: '1px solid #ddd7fa',
          background: '#f3efff',
          color: '#6655b8',
          borderRadius: '14px',
          padding: '10px 16px',
          fontFamily: 'inherit',
          fontSize: '12px',
          fontWeight: '800',
          cursor: 'pointer',
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