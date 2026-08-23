function openEmployee(){

  window.location.href =
    './employee.html';
}


function showOwnerLogin(){

  const box =
    document.getElementById(
      'ownerLogin'
    );


  box.classList.add(
    'show'
  );


  document
    .getElementById(
      'ownerUsername'
    )
    .focus();


  box.scrollIntoView({
    behavior:'smooth',
    block:'center'
  });
}


function hideOwnerLogin(){

  document
    .getElementById(
      'ownerLogin'
    )
    .classList.remove(
      'show'
    );


  clearMessage();
}


async function loginOwner(){

  const username =
    document
      .getElementById(
        'ownerUsername'
      )
      .value
      .trim();


  const password =
    document
      .getElementById(
        'ownerPassword'
      )
      .value;


  if(
    !username ||
    !password
  ){

    showMessage(
      'กรุณากรอก Username และ Password',
      'error'
    );

    return;
  }


  setOwnerLoginLoading(
    true
  );


  showMessage(
    'กำลังตรวจสอบสิทธิ์ OWNER...',
    'info'
  );


  try {

    const result =
      await apiOwnerLogin(
        username,
        password
      );


    if(
      !result ||
      !result.ok ||
      !result.token
    ){

      throw new Error(
        result?.error ||
        'เข้าสู่ระบบไม่สำเร็จ'
      );
    }


    sessionStorage.setItem(
      'OWNER_TOKEN',
      result.token
    );


    sessionStorage.setItem(
      'OWNER_LOGIN_TIME',
      String(
        Date.now()
      )
    );


    showMessage(
      'เข้าสู่ระบบสำเร็จ 👑',
      'success'
    );


    setTimeout(
      () => {

        window.location.href =
          './owner.html';

      },
      350
    );


  } catch(error){

    sessionStorage.removeItem(
      'OWNER_TOKEN'
    );


    showMessage(
      cleanLoginError(
        error
      ),
      'error'
    );

  } finally {

    setOwnerLoginLoading(
      false
    );
  }
}


function setOwnerLoginLoading(
  loading
){

  const buttons =
    document.querySelectorAll(
      '#ownerLogin button'
    );


  buttons.forEach(
    button => {

      button.disabled =
        loading;


      button.style.opacity =
        loading
          ? '.65'
          : '1';


      button.style.cursor =
        loading
          ? 'wait'
          : 'pointer';
    }
  );
}


function showMessage(
  text,
  type
){

  const box =
    document.getElementById(
      'loginMessage'
    );


  box.textContent =
    text;


  box.className =
    'message show ' +
    type;
}


function clearMessage(){

  const box =
    document.getElementById(
      'loginMessage'
    );


  box.textContent =
    '';


  box.className =
    'message';
}


function cleanLoginError(
  error
){

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


/*
 * ถ้า OWNER ล็อกอินอยู่แล้ว
 * และกลับมาหน้า Login
 * หื้อไป owner.html ได้ทันที
 */
document.addEventListener(
  'DOMContentLoaded',
  () => {

    const token =
      sessionStorage.getItem(
        'OWNER_TOKEN'
      );


    if(token){

      const ownerButton =
        document.querySelector(
          '.btn-owner'
        );


      if(ownerButton){

        ownerButton.textContent =
          '👑 กลับเข้าสู่หน้า OWNER';


        ownerButton.onclick =
          () => {

            window.location.href =
              './owner.html';
          };
      }
    }
  }
);