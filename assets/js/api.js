const API_URL =
  'https://script.google.com/macros/s/AKfycbxxxoVRi0XKiC0pcuUmlyUivPbXvEephl4vbZ-x1afHVfi71ZpOZhNXh89AwNLo8YWv/exec';


function createRequestId(prefix = 'REQ') {

  const random =
    (
      crypto.randomUUID?.() ||
      (
        Date.now() +
        '_' +
        Math.random()
          .toString(36)
          .slice(2)
      )
    )
    .replace(
      /[^A-Za-z0-9_-]/g,
      ''
    );


  return (
    prefix +
    '_' +
    random
  );
}


function jsonpRequest(
  action,
  params = {}
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const callback =
        '__apiCallback_' +
        Date.now() +
        '_' +
        Math.random()
          .toString(36)
          .slice(2);


      const script =
        document.createElement(
          'script'
        );


      const url =
        new URL(
          API_URL
        );


      url.searchParams.set(
        'api',
        'public'
      );


      url.searchParams.set(
        'action',
        action
      );


      url.searchParams.set(
        'callback',
        callback
      );


      Object.entries(
        params
      )
      .forEach(
        (
          [key, value]
        ) => {

          if (
            value !== undefined &&
            value !== null &&
            String(value) !== ''
          ) {

            url.searchParams.set(
              key,
              String(value)
            );
          }

        }
      );


      let finished =
        false;


      const cleanup =
        () => {

          if (finished) {
            return;
          }


          finished =
            true;


          try {

            delete window[
              callback
            ];

          } catch (_) {

            window[
              callback
            ] = undefined;
          }


          script.remove();
        };


      const timer =
        setTimeout(
          () => {

            cleanup();


            reject(
              new Error(
                'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่'
              )
            );

          },
          20000
        );


      window[
        callback
      ] =
        payload => {

          clearTimeout(
            timer
          );


          cleanup();


          if (
            payload &&
            payload.ok
          ) {

            resolve(
              payload.data
            );

            return;
          }


          reject(
            new Error(
              payload?.error ||
              'เกิดข้อผิดพลาดจากระบบ'
            )
          );
        };


      script.onerror =
        () => {

          clearTimeout(
            timer
          );


          cleanup();


          reject(
            new Error(
              'ไม่สามารถเชื่อมต่อ Backend ได้'
            )
          );
        };


      script.src =
        url.toString();


      document.head.appendChild(
        script
      );

    }
  );
}


async function waitOwnerResult(
  requestId
) {

  const started =
    Date.now();


  while (
    Date.now() -
    started <
    25000
  ) {

    const result =
      await jsonpRequest(
        'ownerResult',
        {
          requestId:
            requestId
        }
      );


    if (
      !result?.pending
    ) {

      return result;
    }


    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          500
        )
    );
  }


  throw new Error(
    'ระบบใช้เวลาตอบกลับนานเกินไป กรุณาลองใหม่'
  );
}


async function ownerPost(
  action,
  data = {}
) {

  const requestId =
    createRequestId(
      'OWNER'
    );


  const body =
    new URLSearchParams();


  body.set(
    'action',
    action
  );


  body.set(
    'requestId',
    requestId
  );


  Object.entries(
    data
  )
  .forEach(
    (
      [key, value]
    ) => {

      body.set(
        key,
        String(
          value ?? ''
        )
      );

    }
  );


  await fetch(
    API_URL,
    {
      method:
        'POST',

      mode:
        'no-cors',

      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded;charset=UTF-8'
      },

      body:
        body.toString()
    }
  );


  return waitOwnerResult(
    requestId
  );
}


async function apiOwnerLogin(
  username,
  password
) {

  return ownerPost(
    'ownerLogin',
    {
      username:
        username,

      password:
        password
    }
  );
}


async function apiOwnerCall(
  method,
  args = []
) {

  const token =
    sessionStorage.getItem(
      'OWNER_TOKEN'
    );


  if (!token) {

    throw new Error(
      'ยังไม่ได้เข้าสู่ระบบ OWNER'
    );
  }


  return ownerPost(
    'ownerCall',
    {
      token:
        token,

      method:
        method,

      args:
        JSON.stringify(
          args
        )
    }
  );
}


async function apiOwnerLogout() {

  const token =
    sessionStorage.getItem(
      'OWNER_TOKEN'
    );


  if (!token) {

    return {
      ok: true
    };
  }


  try {

    return await ownerPost(
      'ownerLogout',
      {
        token:
          token
      }
    );

  } finally {

    sessionStorage.removeItem(
      'OWNER_TOKEN'
    );
  }
}