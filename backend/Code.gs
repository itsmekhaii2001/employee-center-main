/************************************************************
 * ศูนย์บริหารพนักงาน
 * Google Apps Script Web App
 ************************************************************/

const APP = {

  SHEETS: {
    EMPLOYEES: 'DB_Employees',
    SHIFT_SETS: 'DB_ShiftSets',
    ASSIGNMENTS: 'DB_Assignments',
    OVERRIDES: 'DB_ShiftOverrides',
    SHIFT_HISTORY: 'DB_ShiftHistory',
    SETTINGS: 'DB_Settings',
    TEAM_PLANNER: 'DB_TeamPlanner',
    SEATING: 'DB_Seating',
    DEDUCTIONS: 'DB_Deductions',
    DEDUCTION_LIMITS: 'DB_DeductionLimits'
  },

  POSITIONS: [
    'AG',
    'AE',
    'การตลาด',
    'SEO',
    'ตัดต่อ',
    'กราฟฟิก',
    'พัฒนา',
    'PR',
    'Audit',
    'ฝาก - ถอน',
    'แอดมิน',
    'Tele sell'
  ],

  GENDERS: [
    'ชาย',
    'หญิง'
  ],

  EMPLOYEE_STATUS: [
    'ทำงาน',
    'รอเรียก',
    'พักงาน',
    'ออก'
  ],

  DEFAULT_TEAMS: [
    'TEAM A',
    'TEAM B',
    'TEAM C'
  ],

  DEFAULT_BRANCHES: [
    'RH289',
    'LD789',
    'ส่วนกลาง (RH289/LD789)'
  ]
};


/* =========================================================
   WEB APP
========================================================= */

function doGet(e) {

  setupSystem_();


  const api =
    String(
      e?.parameter?.api || ''
    )
    .trim()
    .toLowerCase();


  if (
    api === 'public'
  ) {

    return handlePublicApi_(
      e
    );
  }


  const view =
    String(
      e?.parameter?.view || ''
    )
    .trim()
    .toLowerCase();


  if (
    view === 'employee'
  ) {

    const template =
      HtmlService
        .createTemplateFromFile(
          'Employee'
        );


    template.initialEmployeeId =
      String(
        e?.parameter?.id || ''
      )
      .trim()
      .toUpperCase();


    return template
      .evaluate()
      .setTitle(
        'ตารางกะพนักงาน'
      )
      .setXFrameOptionsMode(
        HtmlService
          .XFrameOptionsMode
          .ALLOWALL
      );
  }


  return HtmlService
    .createHtmlOutputFromFile(
      'Index'
    )
    .setTitle(
      'ศูนย์บริหารพนักงาน'
    )
    .setXFrameOptionsMode(
      HtmlService
        .XFrameOptionsMode
        .ALLOWALL
    );
}


/**
 * API อ่านข้อมูลสำหรับหน้า GitHub Pages
 * เป็น read-only บ่มีคำสั่งแก้ข้อมูล
 */
function handlePublicApi_(e) {

  const p =
    e?.parameter || {};


  const callback =
    String(
      p.callback || ''
    )
    .trim();


  if (
    !/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(
      callback
    )
  ) {

    return ContentService
      .createTextOutput(
        '/* invalid callback */'
      )
      .setMimeType(
        ContentService.MimeType.JAVASCRIPT
      );
  }


  try {

    const action =
      String(
        p.action || ''
      )
      .trim();


    let data;


    if (
      action === 'employeeSchedule'
    ) {

      data =
        getEmployeePublicSchedule(
          p.query || '',
          p.anchorDate || ''
        );

    } else if (
      action === 'teamSchedule'
    ) {

      data =
        getEmployeePublicTeamSchedule(
          p.anchorDate || ''
        );

    } else if (
      action === 'ownerResult'
    ) {

      data =
        getOwnerAsyncResult_(
          p.requestId || ''
        );

    } else {

      throw new Error(
        'ไม่พบคำสั่ง API'
      );
    }


    return jsonpOutput_(
      callback,
      {
        ok: true,
        data: data
      }
    );

  } catch (error) {

    return jsonpOutput_(
      callback,
      {
        ok: false,

        error:
          String(
            error?.message ||
            error ||
            'เกิดข้อผิดพลาด'
          )
          .replace(
            /^Error:\s*/i,
            ''
          )
      }
    );
  }
}


function jsonpOutput_(
  callback,
  payload
) {

  return ContentService
    .createTextOutput(
      callback +
      '(' +
      JSON.stringify(
        payload
      ) +
      ');'
    )
    .setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
}



/* =========================================================
   OWNER AUTH / OWNER API
   ใช้กับหน้า OWNER บน GitHub Pages
========================================================= */

const OWNER_SESSION_SECONDS_ = 21600;
const OWNER_RESULT_SECONDS_ = 120;
const OWNER_RESULT_CHUNK_ = 25000;


function doPost(e) {

  const p =
    e?.parameter || {};

  const action =
    String(
      p.action || ''
    ).trim();

  try {

    if (
      action === 'ownerLogin'
    ) {

      processOwnerLogin_(p);

    } else if (
      action === 'ownerCall'
    ) {

      processOwnerCall_(p);

    } else if (
      action === 'ownerLogout'
    ) {

      processOwnerLogout_(p);

    } else {

      throw new Error(
        'ไม่พบคำสั่ง POST'
      );
    }

  } catch (error) {

    const requestId =
      normalizeOwnerRequestId_(
        p.requestId || ''
      );

    if (requestId) {

      cacheOwnerAsyncResult_(
        requestId,
        {
          ok: false,
          error:
            cleanOwnerError_(
              error
            )
        }
      );
    }
  }

  return ContentService
    .createTextOutput('OK')
    .setMimeType(
      ContentService.MimeType.TEXT
    );
}


function processOwnerLogin_(p) {

  const requestId =
    requireOwnerRequestId_(
      p.requestId
    );

  const username =
    String(
      p.username || ''
    ).trim();

  const password =
    String(
      p.password || ''
    );

  if (
    !username ||
    !password
  ) {

    cacheOwnerAsyncResult_(
      requestId,
      {
        ok: false,
        error:
          'กรุณากรอก Username และ Password'
      }
    );

    return;
  }

  const props =
    PropertiesService
      .getScriptProperties();

  const savedUsername =
    String(
      props.getProperty(
        'OWNER_USERNAME'
      ) || ''
    ).trim();

  const savedPassword =
    String(
      props.getProperty(
        'OWNER_PASSWORD'
      ) || ''
    );

  if (
    !savedUsername ||
    !savedPassword
  ) {

    cacheOwnerAsyncResult_(
      requestId,
      {
        ok: false,
        error:
          'ระบบยังไม่ได้ตั้งค่าบัญชี OWNER'
      }
    );

    return;
  }

  const cache =
    CacheService
      .getScriptCache();

  const rateKey =
    'OWNER_LOGIN_FAIL_' +
    Utilities.base64EncodeWebSafe(
      username.toLowerCase()
    )
    .replace(
      /=+$/g,
      ''
    )
    .slice(
      0,
      80
    );

  const failCount =
    Number(
      cache.get(
        rateKey
      ) || 0
    );

  if (
    failCount >= 7
  ) {

    cacheOwnerAsyncResult_(
      requestId,
      {
        ok: false,
        error:
          'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่'
      }
    );

    return;
  }

  const valid =
    safeTextEqual_(
      username,
      savedUsername
    ) &&
    safeTextEqual_(
      password,
      savedPassword
    );

  if (!valid) {

    cache.put(
      rateKey,
      String(
        failCount + 1
      ),
      600
    );

    cacheOwnerAsyncResult_(
      requestId,
      {
        ok: false,
        error:
          'Username หรือ Password ไม่ถูกต้อง'
      }
    );

    return;
  }

  cache.remove(
    rateKey
  );

  const token =
    createOwnerSession_();

  cacheOwnerAsyncResult_(
    requestId,
    {
      ok: true,
      token:
        token,
      expiresIn:
        OWNER_SESSION_SECONDS_
    }
  );
}


function processOwnerCall_(p) {

  const requestId =
    requireOwnerRequestId_(
      p.requestId
    );

  const token =
    String(
      p.token || ''
    ).trim();

  const method =
    String(
      p.method || ''
    ).trim();

  let args = [];

  try {

    args =
      JSON.parse(
        String(
          p.args || '[]'
        )
      );

  } catch (_) {

    throw new Error(
      'รูปแบบข้อมูลคำสั่งไม่ถูกต้อง'
    );
  }

  if (
    !Array.isArray(args)
  ) {

    throw new Error(
      'รูปแบบ args ไม่ถูกต้อง'
    );
  }

  if (
    !verifyOwnerSession_(
      token
    )
  ) {

    cacheOwnerAsyncResult_(
      requestId,
      {
        ok: false,
        authExpired: true,
        error:
          'Session OWNER หมดอายุ กรุณาเข้าสู่ระบบใหม่'
      }
    );

    return;
  }

  try {

    const result =
      callOwnerMethod_(
        method,
        args
      );

    cacheOwnerAsyncResult_(
      requestId,
      {
        ok: true,
        data:
          result === undefined
            ? null
            : result
      }
    );

  } catch (error) {

    cacheOwnerAsyncResult_(
      requestId,
      {
        ok: false,
        error:
          cleanOwnerError_(
            error
          )
      }
    );
  }
}


function processOwnerLogout_(p) {

  const requestId =
    requireOwnerRequestId_(
      p.requestId
    );

  const token =
    String(
      p.token || ''
    ).trim();

  if (token) {

    CacheService
      .getScriptCache()
      .remove(
        ownerSessionKey_(
          token
        )
      );
  }

  cacheOwnerAsyncResult_(
    requestId,
    {
      ok: true
    }
  );
}


function callOwnerMethod_(
  method,
  args
) {

  const methods = {

    setupSystem:
      () =>
        setupSystem(),

    getImportSheets:
      () =>
        getImportSheets(),

    previewEmployeeImport:
      () =>
        previewEmployeeImport(
          args[0]
        ),

    importEmployeesFromSheet:
      () =>
        importEmployeesFromSheet(
          args[0]
        ),

    saveEmployee:
      () =>
        saveEmployee(
          args[0]
        ),

    deleteEmployee:
      () =>
        deleteEmployee(
          args[0]
        ),

    getSeatingPlan:
      () =>
        getSeatingPlan(),

    saveSeatAssignment:
      () =>
        saveSeatAssignment(
          args[0]
        ),

    saveDeduction:
      () =>
        saveDeduction(
          args[0]
        ),

    saveDeductionsBatch:
      () =>
        saveDeductionsBatch(
          args[0]
        ),

    markDeductionDone:
      () =>
        markDeductionDone(
          args[0]
        ),

    deleteDeductionRecord:
      () =>
        deleteDeductionRecord(
          args[0],
          args[1]
        ),

    getDeductionRecords:
      () =>
        getDeductionRecords(
          args[0]
        ),

    getDeductionDashboard:
      () =>
        getDeductionDashboard(
          args[0]
        ),

    getDeductionLimitTypes:
      () =>
        getDeductionLimitTypes(),

    saveDeductionLimit:
      () =>
        saveDeductionLimit(
          args[0]
        ),

    deleteDeductionLimit:
      () =>
        deleteDeductionLimit(
          args[0]
        ),

    saveShiftSet:
      () =>
        saveShiftSet(
          args[0]
        ),

    deleteShiftSet:
      () =>
        deleteShiftSet(
          args[0]
        ),

    saveAssignment:
      () =>
        saveAssignment(
          args[0]
        ),

    deactivateAssignment:
      () =>
        deactivateAssignment(
          args[0]
        ),

    getEmployeeCalendar:
      () =>
        getEmployeeCalendar(
          args[0]
        ),

    saveEmployeeDayNote:
      () =>
        saveEmployeeDayNote(
          args[0]
        ),

    saveShiftOverridesBatch:
      () =>
        saveShiftOverridesBatch(
          args[0]
        ),

    getShiftHistory:
      () =>
        getShiftHistory(
          args[0]
        ),

    getSchedule:
      () =>
        getSchedule(
          args[0]
        ),

    getManpower:
      () =>
        getManpower(
          args[0]
        ),

    saveSetting:
      () =>
        saveSetting(
          args[0]
        ),

    deleteSetting:
      () =>
        deleteSetting(
          args[0]
        ),

    getEmployeeView:
      () =>
        getEmployeeView(
          args[0]
        ),

    getTeamPlanner:
      () =>
        getTeamPlanner(
          args[0]
        ),

    saveTeamPlanner:
      () =>
        saveTeamPlanner(
          args[0]
        )
  };

  if (
    !Object.prototype
      .hasOwnProperty
      .call(
        methods,
        method
      )
  ) {

    throw new Error(
      'คำสั่ง OWNER นี้ไม่ได้รับอนุญาต'
    );
  }

  return methods[
    method
  ]();
}


function createOwnerSession_() {

  const token =
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ''
      ) +
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ''
      );

  CacheService
    .getScriptCache()
    .put(
      ownerSessionKey_(
        token
      ),
      JSON.stringify({
        role:
          'OWNER',
        createdAt:
          new Date()
            .toISOString()
      }),
      OWNER_SESSION_SECONDS_
    );

  return token;
}


function verifyOwnerSession_(token) {

  token =
    String(
      token || ''
    ).trim();

  if (
    !/^[A-Za-z0-9_-]{40,160}$/.test(
      token
    )
  ) {

    return false;
  }

  const cache =
    CacheService
      .getScriptCache();

  const key =
    ownerSessionKey_(
      token
    );

  const raw =
    cache.get(
      key
    );

  if (!raw) {

    return false;
  }

  cache.put(
    key,
    raw,
    OWNER_SESSION_SECONDS_
  );

  return true;
}


function ownerSessionKey_(token) {

  return (
    'OWNER_SESSION_' +
    token
  );
}


function normalizeOwnerRequestId_(
  requestId
) {

  requestId =
    String(
      requestId || ''
    ).trim();

  if (
    !/^[A-Za-z0-9_-]{16,120}$/.test(
      requestId
    )
  ) {

    return '';
  }

  return requestId;
}


function requireOwnerRequestId_(
  requestId
) {

  const clean =
    normalizeOwnerRequestId_(
      requestId
    );

  if (!clean) {

    throw new Error(
      'requestId ไม่ถูกต้อง'
    );
  }

  return clean;
}


function cacheOwnerAsyncResult_(
  requestId,
  payload
) {

  requestId =
    requireOwnerRequestId_(
      requestId
    );

  const text =
    JSON.stringify(
      payload
    );

  const cache =
    CacheService
      .getScriptCache();

  const prefix =
    ownerResultPrefix_(
      requestId
    );

  const chunkCount =
    Math.max(
      1,
      Math.ceil(
        text.length /
        OWNER_RESULT_CHUNK_
      )
    );

  if (
    chunkCount > 30
  ) {

    throw new Error(
      'ผลลัพธ์มีขนาดใหญ่เกินไป'
    );
  }

  for (
    let i = 0;
    i < chunkCount;
    i++
  ) {

    cache.put(
      prefix +
      '_CHUNK_' +
      i,
      text.slice(
        i *
          OWNER_RESULT_CHUNK_,
        (i + 1) *
          OWNER_RESULT_CHUNK_
      ),
      OWNER_RESULT_SECONDS_
    );
  }

  cache.put(
    prefix +
    '_META',
    String(
      chunkCount
    ),
    OWNER_RESULT_SECONDS_
  );
}


function getOwnerAsyncResult_(
  requestId
) {

  requestId =
    normalizeOwnerRequestId_(
      requestId
    );

  if (!requestId) {

    return {
      pending: false,
      ok: false,
      error:
        'requestId ไม่ถูกต้อง'
    };
  }

  const cache =
    CacheService
      .getScriptCache();

  const prefix =
    ownerResultPrefix_(
      requestId
    );

  const metaKey =
    prefix +
    '_META';

  const chunkCount =
    Number(
      cache.get(
        metaKey
      ) || 0
    );

  if (!chunkCount) {

    return {
      pending: true
    };
  }

  let text = '';

  const keys = [
    metaKey
  ];

  for (
    let i = 0;
    i < chunkCount;
    i++
  ) {

    const key =
      prefix +
      '_CHUNK_' +
      i;

    const chunk =
      cache.get(
        key
      );

    if (
      chunk === null
    ) {

      return {
        pending: true
      };
    }

    text +=
      chunk;

    keys.push(
      key
    );
  }

  keys.forEach(
    key =>
      cache.remove(
        key
      )
  );

  try {

    return JSON.parse(
      text
    );

  } catch (_) {

    return {
      pending: false,
      ok: false,
      error:
        'อ่านผลลัพธ์จากระบบไม่สำเร็จ'
    };
  }
}


function ownerResultPrefix_(
  requestId
) {

  return (
    'OWNER_RESULT_' +
    requestId
  );
}


function safeTextEqual_(
  a,
  b
) {

  return (
    sha256Hex_(
      String(
        a ?? ''
      )
    ) ===
    sha256Hex_(
      String(
        b ?? ''
      )
    )
  );
}


function sha256Hex_(text) {

  const bytes =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      text,
      Utilities.Charset.UTF_8
    );

  return bytes
    .map(
      byte =>
        (
          byte +
          256
        )
        .toString(16)
        .slice(-2)
    )
    .join('');
}


function cleanOwnerError_(
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


/* =========================================================
   SETUP
========================================================= */

function setupSystem() {

  /*
   * เดิมฟังก์ชันนี้เรียก setupSystem_()
   * แล้ว getAppData() ก็เรียก setupSystem_() ซ้ำอีกครั้ง
   * ทำให้ตอนเข้า OWNER ต้องตรวจ/สร้างชีตซ้ำ 2 รอบ
   */
  ensureSystemReadyCached_();

  return getAppDataFast_();
}


/**
 * ลดงานตรวจโครงสร้างชีตซ้ำทุกครั้งที่ Refresh OWNER
 * Cache ไว้ 5 นาที
 */
function ensureSystemReadyCached_() {

  const cache =
    CacheService
      .getScriptCache();

  const key =
    'EMPLOYEE_CENTER_SYSTEM_READY_V7';


  if (
    cache.get(key) === '1'
  ) {
    return;
  }


  setupSystem_();


  cache.put(
    key,
    '1',
    300
  );
}


function setupSystem_() {

  const ss = getDatabase_();

  ensureSheet_(
    ss,
    APP.SHEETS.EMPLOYEES,
    [
      'employeeId',
      'nickname',
      'fullName',
      'team',
      'position',
      'branch',
      'gender',
      'status',
      'createdAt',
      'updatedAt',
      'newUntil'
    ]
  );

  ensureSheet_(
    ss,
    APP.SHEETS.SHIFT_SETS,
    [
      'setId',
      'setName',
      'workDays',
      'offDays',
      'alternate',
      'startShift',
      'fixedShift',
      'createdAt',
      'updatedAt'
    ]
  );

  ensureSheet_(
    ss,
    APP.SHEETS.ASSIGNMENTS,
    [
      'assignmentId',
      'scopeType',
      'scopeValue',
      'teamFilter',
      'setId',
      'startDate',
      'startShift',
      'active',
      'createdAt',
      'cycleStartDate',
      'cycleReset',
      'updatedAt'
    ]
  );

  ensureSheet_(
    ss,
    APP.SHEETS.OVERRIDES,
    [
      'employeeId',
      'date',
      'shift',
      'note',
      'updatedAt'
    ]
  );

  ensureSheet_(
    ss,
    APP.SHEETS.SHIFT_HISTORY,
    [
      'historyId',
      'employeeId',
      'nickname',
      'team',
      'position',
      'date',
      'oldShift',
      'newShift',
      'action',
      'changedAt'
    ]
  );


  ensureSheet_(
    ss,
    APP.SHEETS.SETTINGS,
    [
      'settingId',
      'type',
      'value',
      'sortOrder',
      'active',
      'createdAt',
      'updatedAt'
    ]
  );


  ensureSheet_(
    ss,
    APP.SHEETS.TEAM_PLANNER,
    [
      'team',
      'setId',
      'cycleStartDate',
      'startShift',
      'overridesJson',
      'updatedAt'
    ]
  );


  seedDefaultShiftSets_();
  seedDefaultSettings_();

  /*
   * ดึงตำแหน่งเดิมที่เคยมีอยู่ใน Dropdown
   * ให้แสดงในหน้า Settings ด้วย
   */
  migrateLegacyPositionsToSettings_();

  /*
   * รอบตาราง 26-25 เป็นเพียงรอบแสดงผล/รายงาน
   * ส่วน Cycle ทำงาน-หยุด (เช่น 10/5) ต้องเดินต่อเนื่องตลอด
   * จึงเก็บ cycleStartDate แยกจาก startDate ของการนำเซตไปใช้
   */
  migrateAssignmentCycles_();
}


function getDatabase_() {

  const props =
    PropertiesService
      .getScriptProperties();

  const savedId =
    props.getProperty(
      'EMPLOYEE_DB_ID'
    );

  if (savedId) {

    return SpreadsheetApp
      .openById(savedId);
  }

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  if (!ss) {

    throw new Error(
      'ไม่พบ Google Sheet ที่เชื่อมกับระบบ'
    );
  }

  props.setProperty(
    'EMPLOYEE_DB_ID',
    ss.getId()
  );

  return ss;
}


function ensureSheet_(
  ss,
  name,
  headers
) {

  let sheet =
    ss.getSheetByName(name);

  if (!sheet) {

    sheet =
      ss.insertSheet(name);
  }

  if (
    sheet.getLastRow() === 0
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);

    sheet.setFrozenRows(1);

    return;
  }


  /*
   * รองรับการอัปเดตระบบเดิมโดยไม่ต้องลบชีตฐานข้อมูล
   * ถ้าเวอร์ชันใหม่เพิ่มคอลัมน์ จะเติมหัวคอลัมน์ท้ายชีตให้อัตโนมัติ
   */
  const lastColumn =
    Math.max(
      1,
      sheet.getLastColumn()
    );

  const currentHeaders =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getDisplayValues()[0]
      .map(
        value =>
          String(value || '').trim()
      );

  const missing =
    headers.filter(
      header =>
        !currentHeaders.includes(header)
    );

  if (missing.length) {

    sheet
      .getRange(
        1,
        lastColumn + 1,
        1,
        missing.length
      )
      .setValues([missing]);
  }

  sheet.setFrozenRows(1);
}


/* =========================================================
   DEFAULT DATA
========================================================= */

function seedDefaultShiftSets_() {

  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SHIFT_SETS
      );

  if (
    sheet.getLastRow() > 1
  ) {
    return;
  }

  const now =
    nowText_();

  sheet
    .getRange(
      2,
      1,
      3,
      9
    )
    .setValues([

      [
        'SET_10_5_ALT',
        '10 ทำงาน / 5 หยุด / สลับกะ',
        10,
        5,
        'TRUE',
        'MORNING',
        '',
        now,
        now
      ],

      [
        'SET_10_5_MORNING',
        '10 ทำงาน / 5 หยุด / เช้าคงที่',
        10,
        5,
        'FALSE',
        'MORNING',
        'MORNING',
        now,
        now
      ],

      [
        'SET_10_5_NIGHT',
        '10 ทำงาน / 5 หยุด / ดึกคงที่',
        10,
        5,
        'FALSE',
        'NIGHT',
        'NIGHT',
        now,
        now
      ]

    ]);
}


function migrateLegacyPositionsToSettings_() {

  const props =
    PropertiesService
      .getScriptProperties();


  const migrationKey =
    'POSITION_SETTINGS_MIGRATED_V1';


  /*
   * ทำครั้งเดียวเท่านั้น
   * หลังจากนั้นถ้าผู้ใช้ลบตำแหน่งเอง ระบบจะไม่สร้างกลับมาใหม่
   */
  if (
    props.getProperty(
      migrationKey
    ) === 'TRUE'
  ) {
    return;
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SETTINGS
      );


  if (!sheet) {
    return;
  }


  const lastColumn =
    Math.max(
      7,
      sheet.getLastColumn()
    );


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getDisplayValues()[0]
      .map(
        value =>
          String(
            value || ''
          ).trim()
      );


  const typeIndex =
    headers.indexOf(
      'type'
    );


  const valueIndex =
    headers.indexOf(
      'value'
    );


  if (
    typeIndex < 0 ||
    valueIndex < 0
  ) {
    return;
  }


  const rows =
    sheet.getLastRow() > 1
      ? sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            lastColumn
          )
          .getDisplayValues()
      : [];


  /*
   * เก็บชื่อ POSITION ที่มีอยู่แล้ว
   * ไม่ว่าจะ active/inactive เพื่อป้องกันชื่อซ้ำ
   */
  const existing =
    new Set(
      rows
        .filter(
          row =>
            String(
              row[typeIndex] || ''
            )
            .trim()
            .toUpperCase() ===
              'POSITION'
        )
        .map(
          row =>
            String(
              row[valueIndex] || ''
            )
            .trim()
        )
        .filter(Boolean)
    );


  /*
   * รายการเดิมที่มีอยู่ใน Dropdown ระบบ
   * เช่น AG / AE / การตลาด / SEO / ตัดต่อ / ...
   */
  const missing =
    APP.POSITIONS
      .map(
        value =>
          String(
            value || ''
          ).trim()
      )
      .filter(Boolean)
      .filter(
        value =>
          !existing.has(
            value
          )
      );


  if (
    missing.length
  ) {

    const now =
      nowText_();


    const currentPositionCount =
      rows
        .filter(
          row =>
            String(
              row[typeIndex] || ''
            )
            .trim()
            .toUpperCase() ===
              'POSITION'
        )
        .length;


    const values =
      missing.map(
        (
          name,
          index
        ) => ([
          'POSITION_' +
            Utilities.getUuid(),

          'POSITION',

          name,

          currentPositionCount +
            index +
            1,

          'TRUE',

          now,

          now
        ])
      );


    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        values.length,
        7
      )
      .setValues(
        values
      );
  }


  /*
   * บันทึกว่า migration เสร็จแล้ว
   */
  props.setProperty(
    migrationKey,
    'TRUE'
  );
}


function seedDefaultSettings_() {

  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SETTINGS
      );

  const rows =
    getSheetObjects_(
      APP.SHEETS.SETTINGS
    );

  const now =
    nowText_();

  const teams =
    rows.filter(
      x =>
        x.type === 'TEAM' &&
        String(
          x.active || 'TRUE'
        ).toUpperCase() !== 'FALSE'
    );

  const branches =
    rows.filter(
      x =>
        x.type === 'BRANCH' &&
        String(
          x.active || 'TRUE'
        ).toUpperCase() !== 'FALSE'
    );


  const positions =
    rows.filter(
      x =>
        x.type === 'POSITION' &&
        String(
          x.active || 'TRUE'
        ).toUpperCase() !== 'FALSE'
    );


  if (!teams.length) {

    APP.DEFAULT_TEAMS
      .forEach(
        (name, index) => {

          sheet.appendRow([
            'TEAM_' +
              new Date().getTime() +
              '_' +
              index,
            'TEAM',
            name,
            index + 1,
            'TRUE',
            now,
            now
          ]);
        }
      );
  }


  if (!branches.length) {

    APP.DEFAULT_BRANCHES
      .forEach(
        (name, index) => {

          sheet.appendRow([
            'BRANCH_' +
              new Date().getTime() +
              '_' +
              index,
            'BRANCH',
            name,
            index + 1,
            'TRUE',
            now,
            now
          ]);
        }
      );
  }


  if (!positions.length) {

    APP.POSITIONS
      .forEach(
        (name, index) => {

          sheet.appendRow([
            'POSITION_' +
              new Date().getTime() +
              '_' +
              index,
            'POSITION',
            name,
            index + 1,
            'TRUE',
            now,
            now
          ]);
        }
      );
  }
}


/* =========================================================
   APP DATA
========================================================= */

function getAppData() {

  ensureSystemReadyCached_();

  return getAppDataFast_();
}


function getAppDataFast_() {

  /*
   * ทำ migration ก่อนอ่าน settings
   * ถ้าทำไปแล้วฟังก์ชันจะ return ทันที
   */
  migrateLegacyPositionsToSettings_();

  let settings =
    getSettings_();


  /*
   * ระบบเก่าที่เพิ่งอัปเดตอาจยังไม่มี POSITION ใน DB_Settings
   * เติมรายการตำแหน่งเดิมให้ครั้งแรกอัตโนมัติ แล้วโหลด settings ใหม่
   */
  if (
    !settings.some(
      x => x.type === 'POSITION'
    )
  ) {

    seedDefaultSettings_();

    settings =
      getSettings_();
  }

  const employees =
    getEmployees_();

  const shiftSets =
    getShiftSets_();

  const assignments =
    getAssignments_();

  const today =
    todayText_();


  return {

    teams:
      settings
        .filter(
          x => x.type === 'TEAM'
        )
        .map(
          x => x.value
        ),

    branches:
      settings
        .filter(
          x => x.type === 'BRANCH'
        )
        .map(
          x => x.value
        ),

    settings:
      settings,

    positions:
      settings
        .filter(
          x => x.type === 'POSITION'
        )
        .map(
          x => x.value
        ),

    genders:
      APP.GENDERS,

    employeeStatus:
      APP.EMPLOYEE_STATUS,

    employees:
      employees,

    shiftSets:
      shiftSets,

    assignments:
      assignments,

    importSheets:
      getImportSheets_(),

    today:
      today,

    /*
     * ใช้ข้อมูลที่โหลดมาแล้ว
     * ไม่อ่าน Employees / ShiftSets / Assignments ซ้ำอีกรอบ
     */
    dashboard:
      getManpowerInternal_(
        today,
        {
          employees:
            employees,

          shiftSets:
            shiftSets,

          assignments:
            assignments
        }
      ),

    round:
      getRoundRange_(
        today
      )
  };
}


/* =========================================================
   IMPORT EMPLOYEES FROM EXISTING SHEET
========================================================= */

/**
 * รายชื่อชีตที่สามารถเลือกเป็นต้นทางได้
 * ตัดชีตฐานข้อมูลของระบบออกทั้งหมด
 */
function getImportSheets_() {

  const ss =
    getDatabase_();

  const blocked =
    Object.values(
      APP.SHEETS
    );

  return ss
    .getSheets()
    .map(
      sheet => sheet.getName()
    )
    .filter(
      name =>
        !blocked.includes(name)
    );
}


/**
 * ใช้จากหน้าเว็บเพื่อรีเฟรชรายชื่อชีตต้นทาง
 */
function getImportSheets() {

  setupSystem_();

  return getImportSheets_();
}


/**
 * ตรวจตัวอย่างก่อนนำเข้า
 */
function previewEmployeeImport(
  sheetName
) {

  const parsed =
    parseEmployeeSourceSheet_(
      sheetName
    );

  const existing =
    getEmployees_();

  const existingIds =
    {};

  existing.forEach(
    employee => {

      existingIds[
        String(
          employee.employeeId
        ).trim().toUpperCase()
      ] = true;
    }
  );


  let newCount = 0;
  let updateCount = 0;


  parsed.validRows
    .forEach(row => {

      const id =
        String(
          row.employeeId
        ).trim().toUpperCase();

      if (existingIds[id]) {
        updateCount++;
      } else {
        newCount++;
      }
    });


  return {

    sheetName:
      sheetName,

    headerRow:
      parsed.headerRow,

    totalSourceRows:
      parsed.totalSourceRows,

    validCount:
      parsed.validRows.length,

    invalidCount:
      parsed.invalidRows.length,

    duplicateCount:
      parsed.duplicateCount,

    newCount:
      newCount,

    updateCount:
      updateCount,

    rows:
      parsed.validRows
        .slice(0, 20),

    invalidRows:
      parsed.invalidRows
        .slice(0, 10),

    detectedHeaders:
      parsed.detectedHeaders
  };
}


/**
 * นำเข้าจริง
 */
function importEmployeesFromSheet(
  sheetName
) {

  const parsed =
    parseEmployeeSourceSheet_(
      sheetName
    );


  if (!parsed.validRows.length) {

    throw new Error(
      'ไม่พบข้อมูลพนักงานที่สามารถนำเข้าได้'
    );
  }


  const employeeSheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.EMPLOYEES
      );


  const existing =
    getSheetObjects_(
      APP.SHEETS.EMPLOYEES
    );


  const employeeMap =
    new Map();


  existing.forEach(
    employee => {

      const id =
        String(
          employee.employeeId || ''
        )
        .trim()
        .toUpperCase();


      if (!id) {
        return;
      }


      employeeMap.set(
        id,
        employee
      );
    }
  );


  let newCount = 0;
  let updateCount = 0;

  const now =
    nowText_();


  parsed.validRows
    .forEach(
      imported => {

        const key =
          String(
            imported.employeeId
          )
          .trim()
          .toUpperCase();


        const old =
          employeeMap.get(key);


        if (old) {

          updateCount++;

        } else {

          newCount++;
        }


        employeeMap.set(
          key,
          {

            employeeId:
              imported.employeeId,

            nickname:
              imported.nickname,

            fullName:
              old
                ? old.fullName || ''
                : '',

            team:
              imported.team,

            position:
              imported.position,

            branch:
              imported.branch,

            gender:
              imported.gender,

            status:
              imported.status,

            createdAt:
              old
                ? old.createdAt || now
                : now,

            updatedAt:
              now
          }
        );
      }
    );


  const headers = [
    'employeeId',
    'nickname',
    'fullName',
    'team',
    'position',
    'branch',
    'gender',
    'status',
    'createdAt',
    'updatedAt'
  ];


  const finalRows =
    Array
      .from(
        employeeMap.values()
      )
      .map(
        employee =>
          headers.map(
            header =>
              employee[header] || ''
          )
      );


  if (
    employeeSheet.getLastRow() > 1
  ) {

    employeeSheet
      .getRange(
        2,
        1,
        employeeSheet.getLastRow() - 1,
        headers.length
      )
      .clearContent();
  }


  if (finalRows.length) {

    employeeSheet
      .getRange(
        2,
        1,
        finalRows.length,
        headers.length
      )
      .setValues(
        finalRows
      );
  }


  /**
   * เพิ่ม TEAM / สาขาที่พบในข้อมูล
   * เข้า DB_Settings ให้อัตโนมัติ
   */
  const teams =
    [...new Set(
      parsed.validRows
        .map(
          x => x.team
        )
        .filter(Boolean)
    )];


  const branches =
    [...new Set(
      parsed.validRows
        .map(
          x => x.branch
        )
        .filter(Boolean)
    )];


  syncSettingValues_(
    'TEAM',
    teams
  );

  syncSettingValues_(
    'BRANCH',
    branches
  );


  const settings =
    getSettings_();


  return {

    ok: true,

    message:
      'นำเข้าพนักงานสำเร็จ ' +
      parsed.validRows.length +
      ' คน',

    importedCount:
      parsed.validRows.length,

    newCount:
      newCount,

    updateCount:
      updateCount,

    invalidCount:
      parsed.invalidRows.length,

    duplicateCount:
      parsed.duplicateCount,

    employees:
      getEmployees_(),

    settings:
      settings,

    teams:
      settings
        .filter(
          x => x.type === 'TEAM'
        )
        .map(
          x => x.value
        ),

    branches:
      settings
        .filter(
          x => x.type === 'BRANCH'
        )
        .map(
          x => x.value
        )
  };
}


/**
 * อ่านชีตต้นทางและแปลงหัวตารางอัตโนมัติ
 */
function parseEmployeeSourceSheet_(
  sheetName
) {

  sheetName =
    String(
      sheetName || ''
    ).trim();


  if (!sheetName) {

    throw new Error(
      'กรุณาเลือกชีตต้นทาง'
    );
  }


  if (
    Object
      .values(APP.SHEETS)
      .includes(sheetName)
  ) {

    throw new Error(
      'ไม่สามารถใช้ชีตฐานข้อมูลของระบบเป็นชีตต้นทางได้'
    );
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        sheetName
      );


  if (!sheet) {

    throw new Error(
      'ไม่พบชีต "' +
      sheetName +
      '"'
    );
  }


  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();


  if (
    lastRow < 2 ||
    lastColumn < 1
  ) {

    throw new Error(
      'ชีตที่เลือกยังไม่มีข้อมูล'
    );
  }


  const values =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        lastColumn
      )
      .getDisplayValues();


  const aliases = {

    employeeId: [
      'รหัสพนักงาน',
      'รหัส',
      'employeeid',
      'employee id',
      'empid',
      'emp id'
    ],

    nickname: [
      'ชื่อ',
      'ชื่อเล่น',
      'nickname',
      'nick name'
    ],

    position: [
      'ตำแหน่ง',
      'position',
      'department',
      'แผนก'
    ],

    team: [
      'ทีม',
      'team'
    ],

    branch: [
      'สาขา',
      'branch'
    ],

    gender: [
      'เพศ',
      'gender',
      'sex'
    ],

    status: [
      'สถานะ',
      'status',
      'สถานะงาน'
    ]
  };


  let headerRowIndex = -1;
  let columnMap = {};


  const maxHeaderSearch =
    Math.min(
      values.length,
      10
    );


  for (
    let rowIndex = 0;
    rowIndex < maxHeaderSearch;
    rowIndex++
  ) {

    const map =
      detectEmployeeHeaders_(
        values[rowIndex],
        aliases
      );


    if (
      map.employeeId !== undefined &&
      map.nickname !== undefined
    ) {

      headerRowIndex =
        rowIndex;

      columnMap =
        map;

      break;
    }
  }


  if (
    headerRowIndex === -1
  ) {

    throw new Error(
      'หารายการหัวตารางไม่เจอ กรุณาตรวจว่ามีหัว "รหัสพนักงาน" และ "ชื่อ"'
    );
  }


  const headerRow =
    values[
      headerRowIndex
    ];


  const detectedHeaders = {

    employeeId:
      getDetectedHeaderName_(
        headerRow,
        columnMap.employeeId
      ),

    nickname:
      getDetectedHeaderName_(
        headerRow,
        columnMap.nickname
      ),

    position:
      getDetectedHeaderName_(
        headerRow,
        columnMap.position
      ),

    team:
      getDetectedHeaderName_(
        headerRow,
        columnMap.team
      ),

    branch:
      getDetectedHeaderName_(
        headerRow,
        columnMap.branch
      ),

    gender:
      getDetectedHeaderName_(
        headerRow,
        columnMap.gender
      ),

    status:
      getDetectedHeaderName_(
        headerRow,
        columnMap.status
      )
  };


  const validMap =
    new Map();

  const invalidRows = [];

  let duplicateCount = 0;
  let totalSourceRows = 0;


  for (
    let i =
      headerRowIndex + 1;
    i < values.length;
    i++
  ) {

    const sourceRow =
      values[i];


    const hasAnyData =
      sourceRow.some(
        cell =>
          String(cell)
            .trim() !== ''
      );


    if (!hasAnyData) {
      continue;
    }


    totalSourceRows++;


    const employee = {

      employeeId:
        cleanEmployeeValue_(
          getMappedCell_(
            sourceRow,
            columnMap.employeeId
          )
        ),

      nickname:
        cleanEmployeeValue_(
          getMappedCell_(
            sourceRow,
            columnMap.nickname
          )
        ),

      position:
        cleanEmployeeValue_(
          getMappedCell_(
            sourceRow,
            columnMap.position
          )
        ),

      team:
        normalizeTeam_(
          getMappedCell_(
            sourceRow,
            columnMap.team
          )
        ),

      branch:
        normalizeBranch_(
          getMappedCell_(
            sourceRow,
            columnMap.branch
          )
        ),

      gender:
        normalizeGender_(
          getMappedCell_(
            sourceRow,
            columnMap.gender
          )
        ),

      status:
        normalizeEmployeeStatus_(
          getMappedCell_(
            sourceRow,
            columnMap.status
          )
        ),

      sourceRow:
        i + 1
    };


    if (!employee.employeeId) {

      invalidRows.push({

        row:
          i + 1,

        reason:
          'ไม่มีรหัสพนักงาน'
      });

      continue;
    }


    if (!employee.nickname) {

      invalidRows.push({

        row:
          i + 1,

        employeeId:
          employee.employeeId,

        reason:
          'ไม่มีชื่อ'
      });

      continue;
    }


    const key =
      employee.employeeId
        .toUpperCase();


    if (
      validMap.has(key)
    ) {

      duplicateCount++;
    }


    /**
     * ถ้ามีรหัสซ้ำในชีตต้นทาง
     * ใช้ข้อมูลแถวล่าสุด
     */
    validMap.set(
      key,
      employee
    );
  }


  return {

    headerRow:
      headerRowIndex + 1,

    totalSourceRows:
      totalSourceRows,

    validRows:
      Array.from(
        validMap.values()
      ),

    invalidRows:
      invalidRows,

    duplicateCount:
      duplicateCount,

    detectedHeaders:
      detectedHeaders
  };
}


function detectEmployeeHeaders_(
  row,
  aliases
) {

  const result = {};


  Object
    .keys(aliases)
    .forEach(key => {

      const aliasList =
        aliases[key]
          .map(
            normalizeHeader_
          );


      for (
        let i = 0;
        i < row.length;
        i++
      ) {

        const normalized =
          normalizeHeader_(
            row[i]
          );


        if (
          aliasList.includes(
            normalized
          )
        ) {

          result[key] =
            i;

          break;
        }
      }
    });


  return result;
}


function normalizeHeader_(value) {

  return String(
    value || ''
  )
  .trim()
  .toLowerCase()
  .replace(
    /[\s_\-\/\\().]+/g,
    ''
  );
}


function getDetectedHeaderName_(
  headerRow,
  index
) {

  if (
    index === undefined
  ) {
    return '';
  }

  return String(
    headerRow[index] || ''
  );
}


function getMappedCell_(
  row,
  index
) {

  if (
    index === undefined ||
    index === null
  ) {
    return '';
  }

  return row[index] || '';
}


function cleanEmployeeValue_(
  value
) {

  return String(
    value || ''
  ).trim();
}


function normalizeTeam_(
  value
) {

  const text =
    String(
      value || ''
    )
    .trim()
    .replace(
      /\s+/g,
      ' '
    );


  if (!text) {
    return '';
  }


  const upper =
    text.toUpperCase();


  if (
    /^TEAMA$/i.test(
      upper.replace(/\s/g, '')
    )
  ) {
    return 'TEAM A';
  }


  if (
    /^TEAMB$/i.test(
      upper.replace(/\s/g, '')
    )
  ) {
    return 'TEAM B';
  }


  if (
    /^TEAMC$/i.test(
      upper.replace(/\s/g, '')
    )
  ) {
    return 'TEAM C';
  }


  return text;
}


function normalizeBranch_(
  value
) {

  return String(
    value || ''
  )
  .trim()
  .replace(
    /\s+/g,
    ' '
  );
}


function normalizeGender_(
  value
) {

  const text =
    String(
      value || ''
    )
    .trim()
    .toLowerCase();


  if (!text) {
    return '';
  }


  if (
    text === 'ชาย' ||
    text === 'male' ||
    text === 'm'
  ) {
    return 'ชาย';
  }


  if (
    text === 'หญิง' ||
    text === 'female' ||
    text === 'f'
  ) {
    return 'หญิง';
  }


  return String(
    value || ''
  ).trim();
}


function normalizeEmployeeStatus_(
  value
) {

  const text =
    String(
      value || ''
    )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ''
    );


  if (!text) {
    return 'ทำงาน';
  }


  if (
    text.includes(
      'รอเรียก'
    ) ||
    text.includes(
      'รอเรียกงาน'
    ) ||
    text.includes(
      'waiting'
    )
  ) {

    return 'รอเรียก';
  }


  if (
    text.includes(
      'พักงาน'
    )
  ) {

    return 'พักงาน';
  }


  if (
    text.includes(
      'ลาออก'
    ) ||
    text.includes(
      'พ้นสภาพ'
    ) ||
    text.includes(
      'ออกแล้ว'
    ) ||
    text === 'ออก'
  ) {

    return 'ออก';
  }


  if (
    text.includes(
      'ทำงาน'
    )
  ) {

    return 'ทำงาน';
  }


  return 'ทำงาน';
}


/**
 * ถ้าข้อมูลนำเข้ามี TEAM / สาขาใหม่
 * เพิ่มเข้าเมนูตั้งค่าให้อัตโนมัติ
 */
function syncSettingValues_(
  type,
  values
) {

  if (
    !values ||
    !values.length
  ) {
    return;
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SETTINGS
      );


  const settings =
    getSettings_()
      .filter(
        x => x.type === type
      );


  const existing =
    new Set(
      settings.map(
        x =>
          String(
            x.value
          )
          .trim()
          .toLowerCase()
      )
    );


  let sortOrder =
    settings.length;


  const now =
    nowText_();


  values.forEach(
    value => {

      value =
        String(
          value || ''
        ).trim();


      if (!value) {
        return;
      }


      const key =
        value.toLowerCase();


      if (
        existing.has(key)
      ) {
        return;
      }


      sortOrder++;


      sheet.appendRow([

        type +
          '_' +
          new Date().getTime() +
          '_' +
          sortOrder,

        type,

        value,

        sortOrder,

        'TRUE',

        now,

        now
      ]);


      existing.add(key);
    }
  );
}


/* =========================================================
   SETTINGS
========================================================= */

function getSettings_() {

  return getSheetObjects_(
    APP.SHEETS.SETTINGS
  )
  .filter(
    x =>
      String(
        x.active || 'TRUE'
      ).toUpperCase() !== 'FALSE'
  )
  .sort(
    (a, b) => {

      if (
        a.type !== b.type
      ) {

        return String(
          a.type
        ).localeCompare(
          String(
            b.type
          )
        );
      }

      return (
        Number(
          a.sortOrder || 0
        ) -
        Number(
          b.sortOrder || 0
        )
      );
    }
  );
}


function saveSetting(data) {

  const type =
    String(
      data?.type || ''
    )
    .trim()
    .toUpperCase();


  const settingValue =
    String(
      data?.value || ''
    ).trim();


  let settingId =
    String(
      data?.settingId || ''
    ).trim();


  if (
    ![
      'TEAM',
      'BRANCH',
      'POSITION'
    ].includes(type)
  ) {

    throw new Error(
      'ประเภทการตั้งค่าไม่ถูกต้อง'
    );
  }


  if (!settingValue) {

    throw new Error(
      'กรุณากรอกชื่อ'
    );
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SETTINGS
      );


  const rows =
    sheet
      .getDataRange()
      .getDisplayValues();


  let foundRow = 0;
  let oldCreatedAt = '';
  let sortOrder = 0;


  for (
    let r = 1;
    r < rows.length;
    r++
  ) {

    const rowId =
      String(
        rows[r][0]
      );

    const rowType =
      String(
        rows[r][1]
      ).toUpperCase();

    const rowValue =
      String(
        rows[r][2]
      ).trim();

    const active =
      String(
        rows[r][4] || 'TRUE'
      ).toUpperCase() !== 'FALSE';


    if (
      active &&
      rowType === type &&
      rowValue.toLowerCase() ===
        settingValue.toLowerCase() &&
      rowId !== settingId
    ) {

      throw new Error(
        'มีรายการนี้อยู่แล้ว'
      );
    }


    if (
      rowId === settingId
    ) {

      foundRow =
        r + 1;

      sortOrder =
        Number(
          rows[r][3] || 0
        );

      oldCreatedAt =
        rows[r][5] || '';
    }
  }


  if (!settingId) {

    settingId =
      type +
      '_' +
      new Date().getTime();
  }


  if (!sortOrder) {

    sortOrder =
      getSettings_()
        .filter(
          x => x.type === type
        )
        .length + 1;
  }


  const now =
    nowText_();


  const row = [

    settingId,
    type,
    settingValue,
    sortOrder,
    'TRUE',
    oldCreatedAt || now,
    now
  ];


  if (foundRow) {

    sheet
      .getRange(
        foundRow,
        1,
        1,
        row.length
      )
      .setValues([row]);

  } else {

    sheet.appendRow(row);
  }


  return {

    ok: true,

    message:
      'บันทึกการตั้งค่าแล้ว',

    settings:
      getSettings_()
  };
}


function deleteSetting(
  settingId
) {

  const setting =
    getSettings_()
      .find(
        x =>
          x.settingId ===
          settingId
      );


  if (!setting) {

    throw new Error(
      'ไม่พบรายการ'
    );
  }


  const employees =
    getEmployees_();


  if (
    setting.type === 'TEAM' &&
    employees.some(
      e =>
        e.team ===
        setting.value
    )
  ) {

    throw new Error(
      'TEAM นี้มีพนักงานใช้งานอยู่ จึงยังลบไม่ได้'
    );
  }


  if (
    setting.type === 'BRANCH' &&
    employees.some(
      e =>
        e.branch ===
        setting.value
    )
  ) {

    throw new Error(
      'สาขานี้มีพนักงานใช้งานอยู่ จึงยังลบไม่ได้'
    );
  }


  if (
    setting.type === 'POSITION' &&
    employees.some(
      e =>
        e.position ===
        setting.value
    )
  ) {

    throw new Error(
      'ตำแหน่งนี้มีพนักงานใช้งานอยู่ จึงยังลบไม่ได้'
    );
  }


  if (
    setting.type === 'POSITION'
  ) {

    const assignments =
      getAssignments_();


    const usedByAssignment =
      assignments.some(
        item =>
          String(
            item.active || 'TRUE'
          ).toUpperCase() !== 'FALSE' &&
          String(
            item.scopeType || ''
          ).toUpperCase() === 'POSITION' &&
          String(
            item.scopeValue || ''
          ).trim() ===
            setting.value
      );


    if (usedByAssignment) {

      throw new Error(
        'ตำแหน่งนี้ยังถูกใช้ในรายการจัดกะ จึงยังลบไม่ได้'
      );
    }
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SETTINGS
      );


  const rows =
    sheet
      .getDataRange()
      .getDisplayValues();


  for (
    let r = 1;
    r < rows.length;
    r++
  ) {

    if (
      String(
        rows[r][0]
      ) ===
      String(settingId)
    ) {

      sheet.deleteRow(
        r + 1
      );

      break;
    }
  }


  return {

    ok: true,

    message:
      'ลบแล้ว',

    settings:
      getSettings_()
  };
}


/* =========================================================
   EMPLOYEES
========================================================= */

function getEmployees_() {

  const today =
    todayText_();


  return getSheetObjects_(
    APP.SHEETS.EMPLOYEES
  )
  .map(
    employee => {

      const newUntil =
        String(
          employee.newUntil || ''
        )
        .trim();


      return {

        ...employee,

        newUntil:
          newUntil,

        isNew:
          (
            newUntil &&
            today < newUntil
          )
      };
    }
  )
  .sort(
    (a, b) => {

      const teamCompare =
        String(
          a.team || ''
        ).localeCompare(
          String(
            b.team || ''
          )
        );


      if (
        teamCompare !== 0
      ) {

        return teamCompare;
      }


      return String(
        a.employeeId || ''
      ).localeCompare(
        String(
          b.employeeId || ''
        )
      );
    }
  );
}


function saveEmployee(data) {

  if (!data) {

    throw new Error(
      'ไม่พบข้อมูลพนักงาน'
    );
  }


  const employeeId =
    String(
      data.employeeId || ''
    ).trim();


  const nickname =
    String(
      data.nickname || ''
    ).trim();


  const mode =
    String(
      data.mode || 'create'
    )
    .trim()
    .toLowerCase();


  if (!employeeId) {

    throw new Error(
      'กรุณากรอกรหัสพนักงาน'
    );
  }


  if (!nickname) {

    throw new Error(
      'กรุณากรอกชื่อเล่น'
    );
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.EMPLOYEES
      );


  const rows =
    sheet
      .getDataRange()
      .getDisplayValues();


  let foundRow = 0;
  let oldCreatedAt = '';
  let oldFullName = '';
  let oldNewUntil = '';


  for (
    let r = 1;
    r < rows.length;
    r++
  ) {

    if (
      String(
        rows[r][0]
      )
      .trim()
      .toUpperCase() ===
      employeeId.toUpperCase()
    ) {

      foundRow =
        r + 1;

      oldFullName =
        rows[r][2] || '';

      oldCreatedAt =
        rows[r][8] || '';

      oldNewUntil =
        rows[r][10] || '';

      break;
    }
  }


  /*
   * กันรหัสพนักงานซ้ำแบบ Backend อีกชั้น
   * ต่อให้ Frontend ถูกข้ามหรือเปิดหลายหน้าพร้อมกัน
   * ก็ห้ามสร้างรหัสเดิมซ้ำเด็ดขาด
   */
  if (
    foundRow &&
    mode !== 'update'
  ) {

    throw new Error(
      'รหัสพนักงาน ' +
      employeeId +
      ' มีอยู่ในระบบแล้ว ไม่สามารถบันทึกข้อมูลซ้ำได้'
    );
  }


  if (
    !foundRow &&
    mode === 'update'
  ) {

    throw new Error(
      'ไม่พบรหัสพนักงาน ' +
      employeeId +
      ' สำหรับการแก้ไข'
    );
  }


  const now =
    nowText_();


  let newUntil =
    oldNewUntil;


  const wantsNewBadge =
    (
      data.isNew === true ||
      String(
        data.isNew || ''
      )
      .toUpperCase() ===
      'TRUE'
    );


  /*
   * ติ๊ก "พนักงานใหม่"
   * -> แสดง NEW 14 วันนับจากวันที่บันทึก
   */
  if (
    wantsNewBadge
  ) {

    const expireDate =
      parseDate_(
        todayText_()
      );


    expireDate.setDate(
      expireDate.getDate() +
      14
    );


    newUntil =
      formatDate_(
        expireDate
      );
  }


  /*
   * เพิ่มพนักงานใหม่แต่ไม่ได้ติ๊ก
   * -> ไม่มีป้าย NEW
   *
   * ถ้าเป็นการแก้ไขพนักงานเดิม
   * -> เก็บ newUntil เดิมไว้ ไม่รีเซ็ตอายุป้าย
   */
  if (
    !foundRow &&
    !wantsNewBadge
  ) {

    newUntil =
      '';
  }


  const row = [

    employeeId,

    nickname,

    oldFullName,

    String(
      data.team || ''
    ).trim(),

    String(
      data.position || ''
    ).trim(),

    String(
      data.branch || ''
    ).trim(),

    String(
      data.gender || ''
    ).trim(),

    normalizeEmployeeStatus_(
      data.status || 'ทำงาน'
    ),

    oldCreatedAt || now,

    now,

    newUntil
  ];


  if (foundRow) {

    sheet
      .getRange(
        foundRow,
        1,
        1,
        row.length
      )
      .setValues([row]);

  } else {

    sheet.appendRow(row);
  }


  return {

    ok: true,

    message:
      'บันทึกข้อมูลพนักงานแล้ว',

    employees:
      getEmployees_()
  };
}


function deleteEmployee(
  employeeId
) {

  employeeId =
    String(
      employeeId || ''
    ).trim();


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.EMPLOYEES
      );


  const rows =
    sheet
      .getDataRange()
      .getDisplayValues();


  for (
    let r =
      rows.length - 1;
    r >= 1;
    r--
  ) {

    if (
      String(
        rows[r][0]
      )
      .trim()
      .toUpperCase() ===
      employeeId.toUpperCase()
    ) {

      sheet.deleteRow(
        r + 1
      );
    }
  }


  return {

    ok: true,

    message:
      'ลบพนักงานแล้ว',

    employees:
      getEmployees_()
  };
}



/* =========================================================
   DEDUCTION / ตัดยอด
========================================================= */

function ensureDeductionSheets_() {

  const ss =
    getDatabase_();


  ensureSheet_(
    ss,
    APP.SHEETS.DEDUCTIONS,
    [
      'deductionId',
      'employeeId',
      'amount',
      'limitType',
      'detail',
      'transactionDate',
      'createdAt',
      'status',
      'completedAt'
    ]
  );


  ensureSheet_(
    ss,
    APP.SHEETS.DEDUCTION_LIMITS,
    [
      'limitCode',
      'position',
      'amount',
      'updatedAt'
    ]
  );


  seedDefaultDeductionLimits_();
}


function seedDefaultDeductionLimits_() {

  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.DEDUCTION_LIMITS
      );


  if (!sheet) {
    return;
  }


  /*
   * เช็กข้อมูลจริงในชีตทุกครั้ง ไม่พึ่ง Script Property
   * เพื่อกันกรณีเคย seed แล้วแต่ชีตถูกสร้างใหม่/ถูกลบ
   */
  const existing =
    getSheetObjects_(
      APP.SHEETS.DEDUCTION_LIMITS
    );


  const existingCodes =
    new Set(
      existing
        .map(
          row =>
            String(
              row.limitCode || ''
            )
            .trim()
            .toUpperCase()
        )
    );


  const rowsToAdd = [];


  if (
    !existingCodes.has(
      'WD'
    )
  ) {

    rowsToAdd.push([
      'WD',
      'ฝาก-ถอน',
      5000,
      nowText_()
    ]);
  }


  if (
    !existingCodes.has(
      'GENERAL'
    )
  ) {

    rowsToAdd.push([
      'GENERAL',
      'ทั่วไป',
      0,
      nowText_()
    ]);
  }


  if (
    rowsToAdd.length
  ) {

    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        rowsToAdd.length,
        4
      )
      .setValues(
        rowsToAdd
      );
  }
}


function normalizeDeductionLimitCode_(
  value
) {

  return String(
    value || ''
  )
  .trim()
  .toUpperCase()
  .replace(
    /[^A-Z0-9_]/g,
    '_'
  )
  .replace(
    /_+/g,
    '_'
  )
  .replace(
    /^_+|_+$/g,
    ''
  );
}


function makeDeductionLimitCode_(
  name
) {

  const english =
    normalizeDeductionLimitCode_(
      name
    );


  if (english) {

    return (
      english +
      '_' +
      Utilities
        .getUuid()
        .slice(
          0,
          6
        )
        .toUpperCase()
    );
  }


  return (
    'LIMIT_' +
    Utilities
      .getUuid()
      .slice(
        0,
        8
      )
      .toUpperCase()
  );
}


function normalizeDeductionPosition_(
  position
) {

  return String(
    position || ''
  )
  .trim()
  .toLowerCase()
  .replace(
    /\s+/g,
    ''
  )
  .replace(
    /[-–—]/g,
    ''
  );
}


function isWdEmployee_(
  employee
) {

  const position =
    normalizeDeductionPosition_(
      employee?.position
    );


  return (
    position.includes(
      'ฝาก'
    ) &&
    position.includes(
      'ถอน'
    )
  );
}


function getEmployeeById_(
  employeeId
) {

  const key =
    String(
      employeeId || ''
    )
    .trim()
    .toUpperCase();


  return getEmployees_()
    .find(
      employee =>
        String(
          employee.employeeId || ''
        )
        .trim()
        .toUpperCase() ===
        key
    ) || null;
}


function getDeductionLimits_() {

  ensureDeductionSheets_();


  return getSheetObjects_(
    APP.SHEETS.DEDUCTION_LIMITS
  );
}


function normalizeDeductionLimitRow_(
  row
) {

  const limitCode =
    String(
      row.limitCode || ''
    )
    .trim()
    .toUpperCase();


  const name =
    String(
      row.position ||
      row.name ||
      limitCode
    )
    .trim();


  const amount =
    Number(
      String(
        row.amount || '0'
      )
      .replace(
        /,/g,
        ''
      )
    );


  return {

    limitCode:
      limitCode,

    name:
      name,

    amount:
      Number.isFinite(
        amount
      )
        ? Math.max(
            0,
            amount
          )
        : 0,

    updatedAt:
      String(
        row.updatedAt || ''
      )
  };
}


function getDeductionLimitTypes() {

  return getDeductionLimits_()
    .map(
      normalizeDeductionLimitRow_
    )
    .filter(
      row =>
        row.limitCode &&
        row.name
    );
}


function getDeductionLimitMap_() {

  const map = {};


  getDeductionLimitTypes()
    .forEach(
      row => {

        map[
          row.limitCode
        ] = row;
      }
    );


  return map;
}


function getWdLimitAmount_() {

  return Number(
    getDeductionLimitMap_()
      .WD
      ?.amount || 0
  );
}


function saveDeductionLimit(
  data
) {

  ensureDeductionSheets_();


  data =
    data || {};


  const name =
    String(
      data.name ||
      data.position ||
      ''
    )
    .trim()
    .slice(
      0,
      80
    );


  if (!name) {

    throw new Error(
      'กรุณากรอกหัวข้อรายการ'
    );
  }


  const amount =
    Number(
      data.amount
    );


  if (
    !Number.isFinite(
      amount
    ) ||
    amount < 0
  ) {

    throw new Error(
      'วงเงินต้องเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป'
    );
  }


  let limitCode =
    normalizeDeductionLimitCode_(
      data.limitCode
    );


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.DEDUCTION_LIMITS
      );


  const values =
    sheet
      .getDataRange()
      .getDisplayValues();


  let foundRow =
    0;


  if (limitCode) {

    for (
      let r = 1;
      r < values.length;
      r++
    ) {

      if (
        String(
          values[r][0] || ''
        )
        .trim()
        .toUpperCase() ===
        limitCode
      ) {

        foundRow =
          r + 1;

        break;
      }
    }
  }


  if (!limitCode) {

    limitCode =
      makeDeductionLimitCode_(
        name
      );
  }


  const duplicateName =
    getDeductionLimitTypes()
      .find(
        row =>
          row.name
            .toLowerCase() ===
            name.toLowerCase() &&
          row.limitCode !==
            limitCode
      );


  if (duplicateName) {

    throw new Error(
      'มีหัวข้อ “' +
      name +
      '” อยู่แล้ว'
    );
  }


  const row = [
    limitCode,
    name,
    amount,
    nowText_()
  ];


  if (foundRow) {

    sheet
      .getRange(
        foundRow,
        1,
        1,
        row.length
      )
      .setValues(
        [row]
      );

  } else {

    sheet
      .appendRow(
        row
      );
  }


  return {

    ok:
      true,

    message:
      'บันทึกหัวข้อ “' +
      name +
      '” แล้ว',

    rows:
      getDeductionLimitTypes()
  };
}


function deleteDeductionLimit(
  limitCode
) {

  ensureDeductionSheets_();


  limitCode =
    normalizeDeductionLimitCode_(
      limitCode
    );


  if (!limitCode) {

    throw new Error(
      'ไม่พบรหัสหัวข้อวงเงิน'
    );
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.DEDUCTION_LIMITS
      );


  const values =
    sheet
      .getDataRange()
      .getDisplayValues();


  let rowNumber =
    0;


  let name =
    limitCode;


  for (
    let r = 1;
    r < values.length;
    r++
  ) {

    if (
      String(
        values[r][0] || ''
      )
      .trim()
      .toUpperCase() ===
      limitCode
    ) {

      rowNumber =
        r + 1;

      name =
        String(
          values[r][1] ||
          limitCode
        );

      break;
    }
  }


  if (!rowNumber) {

    throw new Error(
      'ไม่พบหัวข้อวงเงินที่ต้องการลบ'
    );
  }


  /*
   * ห้ามลบหัวข้อที่ถูกใช้ในรายการตัดยอดแล้ว
   * เพื่อไม่ให้ประวัติเดิมเสียความหมาย
   */
  const used =
    getRawDeductions_()
      .some(
        row =>
          row.limitType ===
          limitCode
      );


  if (used) {

    throw new Error(
      'หัวข้อ “' +
      name +
      '” มีรายการตัดยอดใช้งานอยู่แล้ว จึงไม่สามารถลบได้'
    );
  }


  sheet.deleteRow(
    rowNumber
  );


  return {

    ok:
      true,

    message:
      'ลบหัวข้อ “' +
      name +
      '” แล้ว',

    rows:
      getDeductionLimitTypes()
  };
}




function saveDeduction(
  data
) {

  ensureDeductionSheets_();


  data =
    data || {};


  const employeeId =
    String(
      data.employeeId || ''
    )
    .trim()
    .toUpperCase();


  const employee =
    getEmployeeById_(
      employeeId
    );


  if (!employee) {

    throw new Error(
      'ไม่พบรหัสพนักงาน ' +
      employeeId
    );
  }


  const amount =
    Number(
      data.amount
    );


  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {

    throw new Error(
      'ยอดเงินต้องมากกว่า 0 บาท'
    );
  }


  const limitType =
    normalizeDeductionLimitCode_(
      data.limitType
    );


  const limitMap =
    getDeductionLimitMap_();


  const limitConfig =
    limitMap[
      limitType
    ];


  if (!limitConfig) {

    throw new Error(
      'ไม่พบหัวข้อวงเงินที่เลือก'
    );
  }


  if (
    limitType === 'WD' &&
    !isWdEmployee_(
      employee
    )
  ) {

    throw new Error(
      'วงเงินฝาก-ถอนใช้ได้เฉพาะพนักงานตำแหน่งฝาก-ถอน'
    );
  }


  const transactionDate =
    String(
      data.transactionDate || ''
    )
    .trim();


  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(
        transactionDate
      )
  ) {

    throw new Error(
      'วันที่รายการไม่ถูกต้อง'
    );
  }


  const detail =
    String(
      data.detail || ''
    )
    .trim()
    .slice(
      0,
      1000
    );


  const deductionId =
    Utilities
      .getUuid();


  getDatabase_()
    .getSheetByName(
      APP.SHEETS.DEDUCTIONS
    )
    .appendRow([
      deductionId,
      employeeId,
      amount,
      limitType,
      detail,
      transactionDate,
      nowText_(),
      'WAITING',
      ''
    ]);


  return {

    ok:
      true,

    message:
      'บันทึกรายการตัดยอด ' +
      amount +
      ' บาทแล้ว',

    deductionId:
      deductionId
  };
}


function validateDeductionInput_(
  data,
  employeeMap,
  limitMap
) {

  data =
    data || {};


  const employeeId =
    String(
      data.employeeId || ''
    )
    .trim()
    .toUpperCase();


  const employee =
    employeeMap[
      employeeId
    ];


  if (!employee) {

    throw new Error(
      'ไม่พบรหัสพนักงาน ' +
      employeeId
    );
  }


  const amount =
    Number(
      data.amount
    );


  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {

    throw new Error(
      'ยอดเงินของ ' +
      employeeId +
      ' ต้องมากกว่า 0 บาท'
    );
  }


  const limitType =
    normalizeDeductionLimitCode_(
      data.limitType
    );


  const limitConfig =
    limitMap[
      limitType
    ];


  if (!limitConfig) {

    throw new Error(
      'ไม่พบหัวข้อวงเงินของ ' +
      employeeId
    );
  }


  if (
    limitType === 'WD' &&
    !isWdEmployee_(
      employee
    )
  ) {

    throw new Error(
      'วงเงินฝาก-ถอนใช้ได้เฉพาะพนักงานตำแหน่งฝาก-ถอน: ' +
      employeeId
    );
  }


  const transactionDate =
    String(
      data.transactionDate || ''
    )
    .trim();


  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(
        transactionDate
      )
  ) {

    throw new Error(
      'วันที่รายการของ ' +
      employeeId +
      ' ไม่ถูกต้อง'
    );
  }


  const detail =
    String(
      data.detail || ''
    )
    .trim()
    .slice(
      0,
      1000
    );


  return {

    employeeId:
      employeeId,

    amount:
      Math.round(
        amount * 100
      ) / 100,

    limitType:
      limitType,

    detail:
      detail,

    transactionDate:
      transactionDate
  };
}


function saveDeductionsBatch(
  items
) {

  ensureDeductionSheets_();


  if (
    !Array.isArray(
      items
    ) ||
    !items.length
  ) {

    throw new Error(
      'ยังไม่มีรายการตัดยอดที่จะบันทึก'
    );
  }


  if (
    items.length >
    500
  ) {

    throw new Error(
      'บันทึกได้สูงสุด 500 รายการต่อครั้ง'
    );
  }


  /*
   * เตรียมข้อมูลอ้างอิงครั้งเดียว
   * แล้ว validate ทุกแถวก่อนเขียนจริง
   * ถ้ามีแถวใดผิด -> ไม่บันทึกทั้งชุด
   */
  const employeeMap = {};


  getEmployees_()
    .forEach(
      employee => {

        employeeMap[
          String(
            employee.employeeId || ''
          )
          .trim()
          .toUpperCase()
        ] = employee;
      }
    );


  const limitMap =
    getDeductionLimitMap_();


  const now =
    nowText_();


  const rows =
    items
      .map(
        item =>
          validateDeductionInput_(
            item,
            employeeMap,
            limitMap
          )
      )
      .map(
        item => [

          Utilities
            .getUuid(),

          item.employeeId,

          item.amount,

          item.limitType,

          item.detail,

          item.transactionDate,

          now,

          'WAITING',

          ''
        ]
      );


  const lock =
    LockService
      .getScriptLock();


  lock.waitLock(
    20000
  );


  try {

    const sheet =
      getDatabase_()
        .getSheetByName(
          APP.SHEETS.DEDUCTIONS
        );


    const startRow =
      sheet.getLastRow() + 1;


    sheet
      .getRange(
        startRow,
        1,
        rows.length,
        9
      )
      .setValues(
        rows
      );

  } finally {

    lock.releaseLock();
  }


  const total =
    rows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        Number(
          row[2] || 0
        ),
      0
    );


  return {

    ok:
      true,

    count:
      rows.length,

    total:
      total,

    message:
      'บันทึกทั้งหมด ' +
      rows.length +
      ' รายการแล้ว'
  };
}



function findDeductionRow_(
  deductionId
) {

  ensureDeductionSheets_();


  deductionId =
    String(
      deductionId || ''
    )
    .trim();


  if (!deductionId) {

    throw new Error(
      'ไม่พบรหัสรายการตัดยอด'
    );
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.DEDUCTIONS
      );


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    throw new Error(
      'ไม่พบรายการตัดยอด'
    );
  }


  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues();


  for (
    let i = 0;
    i < ids.length;
    i++
  ) {

    if (
      String(
        ids[i][0] || ''
      )
      .trim() ===
      deductionId
    ) {

      return {

        sheet:
          sheet,

        row:
          i + 2
      };
    }
  }


  throw new Error(
    'ไม่พบรายการตัดยอดที่ต้องการ'
  );
}


function getDeductionHeaderMap_(
  sheet
) {

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      )
      .getDisplayValues()[0];


  const map = {};


  headers
    .forEach(
      (
        header,
        index
      ) => {

        map[
          String(
            header || ''
          )
          .trim()
        ] = index + 1;
      }
    );


  return map;
}


function markDeductionDone(
  deductionId
) {

  const found =
    findDeductionRow_(
      deductionId
    );


  const headerMap =
    getDeductionHeaderMap_(
      found.sheet
    );


  const statusColumn =
    headerMap.status;


  const completedAtColumn =
    headerMap.completedAt;


  if (
    !statusColumn ||
    !completedAtColumn
  ) {

    throw new Error(
      'โครงสร้างฐานข้อมูลตัดยอดยังไม่สมบูรณ์ กรุณารีเฟรชระบบอีกครั้ง'
    );
  }


  found.sheet
    .getRange(
      found.row,
      statusColumn
    )
    .setValue(
      'DONE'
    );


  found.sheet
    .getRange(
      found.row,
      completedAtColumn
    )
    .setValue(
      nowText_()
    );


  return {

    ok:
      true,

    message:
      'ทำรายการแล้ว · สถานะเปลี่ยนเป็น “หักแล้ว”'
  };
}


function deleteDeductionRecord(
  deductionId,
  filters
) {

  const found =
    findDeductionRow_(
      deductionId
    );


  found.sheet
    .deleteRow(
      found.row
    );


  /*
   * คืนข้อมูลที่คำนวณใหม่ใน request เดียว
   * เพื่อให้ Frontend ไม่ต้องยิง getDeductionRecords()
   * อีกรอบและไม่ต้องขึ้น Loading ทั้งตาราง
   */
  const data =
    getDeductionRecords(
      filters || {}
    );


  return {

    ok:
      true,

    message:
      'ลบรายการตัดยอดแล้ว',

    data:
      data
  };
}


function getRawDeductions_() {

  ensureDeductionSheets_();


  return getSheetObjects_(
    APP.SHEETS.DEDUCTIONS
  )
  .map(
    row => ({

      deductionId:
        String(
          row.deductionId || ''
        ),

      employeeId:
        String(
          row.employeeId || ''
        )
        .trim()
        .toUpperCase(),

      amount:
        Number(
          String(
            row.amount || '0'
          )
          .replace(
            /,/g,
            ''
          )
        ) || 0,

      limitType:
        normalizeDeductionLimitCode_(
          row.limitType
        ),

      detail:
        String(
          row.detail || ''
        ),

      transactionDate:
        String(
          row.transactionDate || ''
        )
        .trim(),

      createdAt:
        String(
          row.createdAt || ''
        ),

      status:
        String(
          row.status || 'WAITING'
        )
        .trim()
        .toUpperCase() ===
        'DONE'
          ? 'DONE'
          : 'WAITING',

      completedAt:
        String(
          row.completedAt || ''
        )
    }))
  .filter(
    row =>
      row.employeeId &&
      row.transactionDate &&
      row.amount > 0
  );
}


function calculateDeductions_() {

  const employees =
    getEmployees_();


  const employeeMap = {};


  employees
    .forEach(
      employee => {

        employeeMap[
          String(
            employee.employeeId || ''
          )
          .trim()
          .toUpperCase()
        ] = employee;
      }
    );


  const limitMap =
    getDeductionLimitMap_();


  const rows =
    getRawDeductions_()
      .sort(
        (
          a,
          b
        ) => {

          const dateCompare =
            String(
              a.transactionDate
            )
            .localeCompare(
              String(
                b.transactionDate
              )
            );


          if (dateCompare) {
            return dateCompare;
          }


          const createdCompare =
            String(
              a.createdAt
            )
            .localeCompare(
              String(
                b.createdAt
              )
            );


          if (createdCompare) {
            return createdCompare;
          }


          return String(
            a.deductionId
          )
          .localeCompare(
            String(
              b.deductionId
            )
          );
        }
      );


  const monthlyLimitUsed = {};


  return rows
    .map(
      row => {

        const employee =
          employeeMap[
            row.employeeId
          ] || {};


        const month =
          row.transactionDate
            .slice(
              0,
              7
            );


        const limitConfig =
          limitMap[
            row.limitType
          ] || {

            limitCode:
              row.limitType,

            name:
              row.limitType ||
              'ไม่ระบุ',

            amount:
              0
          };


        const monthlyLimit =
          Number(
            limitConfig.amount || 0
          );


        const key =
          row.employeeId +
          '|' +
          month +
          '|' +
          row.limitType;


        let coveredByLimit =
          0;


        let actualDeduction =
          row.amount;


        let before =
          Number(
            monthlyLimitUsed[
              key
            ] || 0
          );


        let after =
          before;


        if (
          monthlyLimit > 0
        ) {

          const remainingBefore =
            Math.max(
              0,
              monthlyLimit -
              before
            );


          coveredByLimit =
            Math.min(
              row.amount,
              remainingBefore
            );


          actualDeduction =
            Math.max(
              0,
              row.amount -
              coveredByLimit
            );


          after =
            Math.min(
              monthlyLimit,
              before +
              row.amount
            );


          monthlyLimitUsed[
            key
          ] = after;
        }


        return {

          ...row,

          nickname:
            employee.nickname || '',

          team:
            employee.team || '',

          position:
            employee.position || '',

          month:
            month,

          limitLabel:
            limitConfig.name,

          monthlyLimit:
            monthlyLimit,

          coveredByLimit:
            coveredByLimit,

          actualDeduction:
            actualDeduction,

          limitUsedBefore:
            before,

          limitUsedAfter:
            after
        };
      }
    );
}


function getDeductionRecords(
  filters
) {

  filters =
    filters || {};


  const from =
    String(
      filters.from || ''
    )
    .trim();


  const to =
    String(
      filters.to || ''
    )
    .trim();


  const employeeQuery =
    String(
      filters.employee || ''
    )
    .trim()
    .toLowerCase();


  let rows =
    calculateDeductions_();


  if (from) {

    rows =
      rows.filter(
        row =>
          row.transactionDate >=
          from
      );
  }


  if (to) {

    rows =
      rows.filter(
        row =>
          row.transactionDate <=
          to
      );
  }


  if (employeeQuery) {

    rows =
      rows.filter(
        row =>
          [
            row.employeeId,
            row.nickname
          ]
          .join(
            ' '
          )
          .toLowerCase()
          .includes(
            employeeQuery
          )
      );
  }


  rows =
    rows
      .sort(
        (
          a,
          b
        ) => {

          const dateCompare =
            String(
              b.transactionDate
            )
            .localeCompare(
              String(
                a.transactionDate
              )
            );


          if (dateCompare) {
            return dateCompare;
          }


          return String(
            b.createdAt
          )
          .localeCompare(
            String(
              a.createdAt
            )
          );
        }
      );


  return {

    rows:
      rows,

    totalDamage:
      rows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.amount || 0
          ),
        0
      ),

    totalCovered:
      rows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.coveredByLimit || 0
          ),
        0
      ),

    totalActual:
      rows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.actualDeduction || 0
          ),
        0
      )
  };
}


function getDeductionDashboard(
  month
) {

  month =
    String(
      month || ''
    )
    .trim();


  if (
    !/^\d{4}-\d{2}$/
      .test(
        month
      )
  ) {

    month =
      todayText_()
        .slice(
          0,
          7
        );
  }


  const employees =
    getEmployees_();


  const wdLimit =
    getWdLimitAmount_();


  const monthRows =
    calculateDeductions_()
      .filter(
        row =>
          row.month ===
          month
      );


  const byEmployee = {};


  monthRows
    .forEach(
      row => {

        if (
          !byEmployee[
            row.employeeId
          ]
        ) {

          byEmployee[
            row.employeeId
          ] = {

            totalDamage:
              0,

            limitUsed:
              0,

            actualDeduction:
              0
          };
        }


        const bucket =
          byEmployee[
            row.employeeId
          ];


        bucket.totalDamage +=
          Number(
            row.amount || 0
          );


        bucket.limitUsed +=
          Number(
            row.coveredByLimit || 0
          );


        bucket.actualDeduction +=
          Number(
            row.actualDeduction || 0
          );
      }
    );


  const wdEmployees =
    employees
      .filter(
        isWdEmployee_
      )
      .map(
        employee => {

          const totals =
            byEmployee[
              employee.employeeId
            ] || {

              totalDamage:
                0,

              limitUsed:
                0,

              actualDeduction:
                0
            };


          return {

            employeeId:
              employee.employeeId,

            nickname:
              employee.nickname,

            team:
              employee.team,

            position:
              employee.position,

            limit:
              wdLimit,

            totalDamage:
              totals.totalDamage,

            limitUsed:
              Math.min(
                wdLimit,
                totals.limitUsed
              ),

            remainingLimit:
              Math.max(
                0,
                wdLimit -
                totals.limitUsed
              ),

            actualDeduction:
              totals.actualDeduction
          };
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          Number(
            b.limitUsed
          ) -
          Number(
            a.limitUsed
          )
      );


  const generalEmployees =
    employees
      .filter(
        employee =>
          !isWdEmployee_(
            employee
          )
      )
      .map(
        employee => {

          const totals =
            byEmployee[
              employee.employeeId
            ] || {

              actualDeduction:
                0
            };


          return {

            employeeId:
              employee.employeeId,

            nickname:
              employee.nickname,

            team:
              employee.team,

            position:
              employee.position,

            actualDeduction:
              totals.actualDeduction
          };
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          Number(
            b.actualDeduction
          ) -
          Number(
            a.actualDeduction
          )
      );


  return {

    month:
      month,

    wdLimit:
      wdLimit,

    limitTypes:
      getDeductionLimitTypes(),

    wdEmployees:
      wdEmployees,

    generalEmployees:
      generalEmployees
  };
}


/* =========================================================
   SEATING PLAN
========================================================= */

function parseStringArrayJson_(
  text
) {

  if (!text) {
    return [];
  }


  try {

    const value =
      JSON.parse(
        String(text)
      );


    if (
      !Array.isArray(
        value
      )
    ) {
      return [];
    }


    return value
      .map(
        item =>
          String(
            item ?? ''
          )
          .trim()
      )
      .filter(Boolean);

  } catch (_) {

    return [];
  }
}


function uniqueCleanStrings_(
  values,
  maxLength
) {

  const result = [];
  const seen = new Set();


  (
    Array.isArray(values)
      ? values
      : []
  )
    .forEach(
      value => {

        const cleaned =
          String(
            value ?? ''
          )
          .trim()
          .slice(
            0,
            maxLength || 120
          );


        if (!cleaned) {
          return;
        }


        const key =
          cleaned.toUpperCase();


        if (
          seen.has(
            key
          )
        ) {
          return;
        }


        seen.add(
          key
        );

        result.push(
          cleaned
        );
      }
    );


  return result;
}


function ensureSeatingSheet_() {

  const ss =
    getDatabase_();


  ensureSheet_(
    ss,
    APP.SHEETS.SEATING,
    [
      'seatNo',
      'seatName',
      'employeeIdsJson',
      'emailNamesJson',
      'updatedAt'
    ]
  );


  return ss
    .getSheetByName(
      APP.SHEETS.SEATING
    );
}


function getSeatingPlan() {

  ensureSeatingSheet_();

  migrateSeatingNameColumn_();

  return getSeatingPlan_();
}


function migrateSeatingNameColumn_() {

  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SEATING
      );


  if (!sheet) {
    return;
  }


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      )
      .getDisplayValues()[0];


  if (
    headers[0] === 'seatNo' &&
    headers[1] === 'seatName' &&
    headers[2] === 'employeeIdsJson'
  ) {
    return;
  }


  if (
    headers[0] === 'seatNo' &&
    headers[1] === 'employeeIdsJson'
  ) {

    sheet.insertColumnAfter(
      1
    );


    sheet
      .getRange(
        1,
        2
      )
      .setValue(
        'seatName'
      );
  }
}


function getSeatingPlan_() {

  const saved = {};


  getSheetObjects_(
    APP.SHEETS.SEATING
  )
  .forEach(
    row => {

      const seatNo =
        Number(
          row.seatNo
        );


      if (
        !Number.isInteger(
          seatNo
        ) ||
        seatNo < 1 ||
        seatNo > 48
      ) {
        return;
      }


      saved[
        seatNo
      ] = {

        seatNo:
          seatNo,

        seatName:
          String(
            row.seatName || ''
          )
          .trim()
          .slice(
            0,
            60
          ),

        employeeIds:
          uniqueCleanStrings_(
            parseStringArrayJson_(
              row.employeeIdsJson
            ),
            80
          ),

        emailNames:
          uniqueCleanStrings_(
            parseStringArrayJson_(
              row.emailNamesJson
            ),
            80
          ),

        updatedAt:
          String(
            row.updatedAt || ''
          )
      };
    }
  );


  const result = [];


  for (
    let seatNo = 1;
    seatNo <= 48;
    seatNo++
  ) {

    result.push(
      saved[
        seatNo
      ] || {

        seatNo:
          seatNo,

        seatName:
          '',

        employeeIds:
          [],

        emailNames:
          [],

        updatedAt:
          ''
      }
    );
  }


  return result;
}


function saveSeatAssignment(
  data
) {

  data =
    data || {};


  const seatNo =
    Number(
      data.seatNo
    );


  if (
    !Number.isInteger(
      seatNo
    ) ||
    seatNo < 1 ||
    seatNo > 48
  ) {

    throw new Error(
      'หมายเลขโต๊ะไม่ถูกต้อง'
    );
  }


  const seatName =
    String(
      data.seatName || ''
    )
    .trim()
    .slice(
      0,
      60
    );


  const employeeIds =
    uniqueCleanStrings_(
      data.employeeIds,
      80
    );


  const emailNames =
    uniqueCleanStrings_(
      data.emailNames,
      80
    );


  ensureSeatingSheet_();

  migrateSeatingNameColumn_();


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SEATING
      );


  /*
   * เร็วกว่าแบบเดิม:
   * - โต๊ะ 1 อยู่แถว 2
   * - โต๊ะ 2 อยู่แถว 3
   * - ...
   * - โต๊ะ 48 อยู่แถว 49
   *
   * ไม่ต้องอ่านทั้งชีตเพื่อหาแถวทุกครั้ง
   */
  const targetRow =
    seatNo + 1;


  const updatedAt =
    nowText_();


  sheet
    .getRange(
      targetRow,
      1,
      1,
      5
    )
    .setValues([
      [
        seatNo,
        seatName,
        JSON.stringify(
          employeeIds
        ),
        JSON.stringify(
          emailNames
        ),
        updatedAt
      ]
    ]);


  /*
   * ไม่อ่าน DB_Seating ทั้งชีตซ้ำอีกครั้ง
   * ส่งกลับเฉพาะโต๊ะที่เพิ่งบันทึก
   */
  return {

    ok:
      true,

    message:
      (
        employeeIds.length ||
        emailNames.length
      )
        ? (
            'บันทึกโต๊ะที่ ' +
            seatNo +
            ' แล้ว'
          )
        : (
            'ล้างโต๊ะที่ ' +
            seatNo +
            ' แล้ว'
          ),

    seat: {

      seatNo:
        seatNo,

      seatName:
        seatName,

      employeeIds:
        employeeIds,

      emailNames:
        emailNames,

      updatedAt:
        updatedAt
    }
  };
}



/* =========================================================
   SHIFT SET
========================================================= */

function getShiftSets_() {

  return getSheetObjects_(
    APP.SHEETS.SHIFT_SETS
  )
  .map(
    x => ({

      setId:
        x.setId,

      setName:
        x.setName,

      workDays:
        Number(
          x.workDays || 10
        ),

      offDays:
        Number(
          x.offDays || 5
        ),

      alternate:
        String(
          x.alternate
        ).toUpperCase() === 'TRUE',

      startShift:
        x.startShift ||
        'MORNING',

      fixedShift:
        x.fixedShift || '',

      createdAt:
        x.createdAt || '',

      updatedAt:
        x.updatedAt || ''
    })
  );
}


function saveShiftSet(data) {

  const setName =
    String(
      data?.setName || ''
    ).trim();


  if (!setName) {

    throw new Error(
      'กรุณาตั้งชื่อเซตกะ'
    );
  }


  const workDays =
    Math.max(
      1,
      Number(
        data.workDays || 10
      )
    );


  const offDays =
    Math.max(
      0,
      Number(
        data.offDays || 5
      )
    );


  const alternate =
    data.alternate === true ||
    String(
      data.alternate
    ).toUpperCase() === 'TRUE';


  let setId =
    String(
      data.setId || ''
    ).trim();


  if (!setId) {

    setId =
      'SET_' +
      new Date().getTime();
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SHIFT_SETS
      );


  const rows =
    sheet
      .getDataRange()
      .getDisplayValues();


  let foundRow = 0;
  let oldCreatedAt = '';


  for (
    let r = 1;
    r < rows.length;
    r++
  ) {

    if (
      String(
        rows[r][0]
      ) === setId
    ) {

      foundRow =
        r + 1;

      oldCreatedAt =
        rows[r][7] || '';

      break;
    }
  }


  const now =
    nowText_();


  const row = [

    setId,

    setName,

    workDays,

    offDays,

    alternate
      ? 'TRUE'
      : 'FALSE',

    String(
      data.startShift ||
      'MORNING'
    ),

    alternate
      ? ''
      : String(
          data.fixedShift ||
          data.startShift ||
          'MORNING'
        ),

    oldCreatedAt || now,

    now
  ];


  if (foundRow) {

    sheet
      .getRange(
        foundRow,
        1,
        1,
        row.length
      )
      .setValues([row]);

  } else {

    sheet.appendRow(row);
  }


  return {

    ok: true,

    message:
      'บันทึกเซตกะแล้ว',

    shiftSets:
      getShiftSets_()
  };
}


function deleteShiftSet(
  setId
) {

  const assignments =
    getAssignments_();


  const inUse =
    assignments.some(
      a =>
        a.setId === setId &&
        String(
          a.active || 'TRUE'
        ).toUpperCase() !== 'FALSE'
    );


  if (inUse) {

    throw new Error(
      'เซตกะนี้กำลังถูกใช้งานอยู่'
    );
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SHIFT_SETS
      );


  const rows =
    sheet
      .getDataRange()
      .getDisplayValues();


  for (
    let r =
      rows.length - 1;
    r >= 1;
    r--
  ) {

    if (
      String(
        rows[r][0]
      ) ===
      String(setId)
    ) {

      sheet.deleteRow(
        r + 1
      );
    }
  }


  return {

    ok: true,

    message:
      'ลบเซตกะแล้ว',

    shiftSets:
      getShiftSets_()
  };
}



/* =========================================================
   TEAM PLANNER — แบบร่างเปรียบเทียบ TEAM A / B / C
========================================================= */

function getTeamPlanner(request) {
  const anchorDate = String(request?.anchorDate || todayText_()).trim();
  const range = getRoundRange_(anchorDate);
  const dates = createDateRange_(range.from,range.to,40);
  const shiftSets = getShiftSets_();
  const setMap = {};
  shiftSets.forEach(set => { setMap[set.setId] = set; });
  const savedMap = getTeamPlannerMap_();
  const assignments = getAssignments_();

  const teams = APP.DEFAULT_TEAMS.map(team => {
    const saved = savedMap[team] || {};
    const fallback = getDefaultTeamPlannerConfig_(team,assignments,shiftSets,range.from);
    const setId = String(saved.setId || fallback.setId || shiftSets[0]?.setId || '');
    const set = setMap[setId] || {};
    const cycleStartDate = String(saved.cycleStartDate || fallback.cycleStartDate || range.from);
    const startShift = String(saved.startShift || fallback.startShift || set.startShift || 'MORNING');
    const overrides = parsePlannerOverrides_(saved.overridesJson);
    const days = dates.map(date => {
      const autoShift = calculateTeamPlannerShift_(set,cycleStartDate,date,startShift);
      const override = String(overrides[date] || '').trim().toUpperCase();
      const isOverride = ['MORNING','NIGHT','OFF','UNSET'].includes(override);
      return {date:date,autoShift:autoShift,shift:isOverride?override:autoShift,isOverride:isOverride};
    });
    return {team:team,setId:setId,cycleStartDate:cycleStartDate,startShift:startShift,overrides:overrides,overrideCount:Object.keys(overrides).filter(date=>dates.includes(date)).length,days:days};
  });

  return {anchorDate:anchorDate,from:range.from,to:range.to,dates:dates,teams:teams};
}

function saveTeamPlanner(request) {
  const teams = Array.isArray(request?.teams) ? request.teams : [];
  if (!teams.length) throw new Error('ไม่พบข้อมูล TEAM ที่จะบันทึก');
  const validSetIds = new Set(getShiftSets_().map(set => String(set.setId)));
  const sheet = getDatabase_().getSheetByName(APP.SHEETS.TEAM_PLANNER);
  const now = nowText_();
  const rows = [];

  APP.DEFAULT_TEAMS.forEach(team => {
    const item = teams.find(row => String(row?.team || '').trim() === team);
    if (!item) return;
    const setId = String(item.setId || '').trim();
    if (setId && !validSetIds.has(setId)) throw new Error('ไม่พบเซตกะของ ' + team);
    const cycleStartDate = String(item.cycleStartDate || '').trim();
    if (!cycleStartDate) throw new Error('กรุณาเลือกวันเริ่ม Cycle ของ ' + team);
    const startShift = String(item.startShift || 'MORNING').trim().toUpperCase();
    if (!['MORNING','NIGHT'].includes(startShift)) throw new Error('กะเริ่มต้นของ ' + team + ' ไม่ถูกต้อง');
    const overrides = sanitizePlannerOverrides_(item.overrides);
    rows.push([team,setId,cycleStartDate,startShift,JSON.stringify(overrides),now]);
  });

  if (sheet.getLastRow() > 1) sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).clearContent();
  if (rows.length) sheet.getRange(2,1,rows.length,6).setValues(rows);

  const planner = getTeamPlanner({anchorDate:String(request?.anchorDate || todayText_())});
  return {ok:true,message:'บันทึกแบบร่าง TEAM A / B / C แล้ว',planner:planner};
}

function getTeamPlannerMap_() {
  const sheet = getDatabase_().getSheetByName(APP.SHEETS.TEAM_PLANNER);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(value => String(value || '').trim());
  const result = {};
  values.slice(1).forEach(row => {
    const obj = {};
    headers.forEach((header,index) => { obj[header] = row[index]; });
    const team = String(obj.team || '').trim();
    if (team) result[team] = obj;
  });
  return result;
}

function getDefaultTeamPlannerConfig_(team,assignments,shiftSets,anchorDate) {
  const assignment = assignments.filter(item => String(item.active || 'TRUE').toUpperCase() !== 'FALSE' && String(item.scopeType || '').toUpperCase() === 'TEAM' && String(item.scopeValue || '').trim() === team && String(item.startDate || '') <= anchorDate).sort((a,b) => String(b.startDate || '').localeCompare(String(a.startDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  if (assignment) {
    const set = shiftSets.find(item => String(item.setId) === String(assignment.setId)) || {};
    return {setId:String(assignment.setId || ''),cycleStartDate:String(assignment.cycleStartDate || assignment.startDate || anchorDate),startShift:String(assignment.startShift || set.startShift || 'MORNING')};
  }
  const firstSet = shiftSets[0] || {};
  return {setId:String(firstSet.setId || ''),cycleStartDate:anchorDate,startShift:String(firstSet.startShift || 'MORNING')};
}

function calculateTeamPlannerShift_(set,cycleStartDate,date,startShift) {
  if (!set || !set.setId || !cycleStartDate) return 'UNSET';
  const diff = dayDiff_(cycleStartDate,date);
  if (diff < 0) return 'UNSET';
  const workDays = Math.max(1,Number(set.workDays || 10));
  const offDays = Math.max(0,Number(set.offDays || 5));
  const cycleLength = workDays + offDays;
  if (cycleLength <= 0) return 'UNSET';
  const cycleIndex = Math.floor(diff/cycleLength);
  const dayInCycle = diff % cycleLength;
  if (dayInCycle >= workDays) return 'OFF';
  const baseShift = String(startShift || set.startShift || 'MORNING').toUpperCase();
  const alternate = set.alternate === true || String(set.alternate).toUpperCase() === 'TRUE';
  if (alternate) return cycleIndex%2===1 ? (baseShift==='MORNING'?'NIGHT':'MORNING') : baseShift;
  return String(set.fixedShift || baseShift).toUpperCase();
}

function parsePlannerOverrides_(text) {
  if (!text) return {};
  try { return sanitizePlannerOverrides_(JSON.parse(String(text))); } catch (_) { return {}; }
}

function sanitizePlannerOverrides_(input) {
  const result = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  Object.entries(input).forEach(([date,shift]) => {
    date = String(date || '').trim();
    shift = String(shift || '').trim().toUpperCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && ['MORNING','NIGHT','OFF','UNSET'].includes(shift)) result[date] = shift;
  });
  return result;
}


/* =========================================================
   ASSIGNMENTS
========================================================= */

function getAssignments_() {

  return getSheetObjects_(
    APP.SHEETS.ASSIGNMENTS
  )
  .map(
    assignment => ({

      ...assignment,

      cycleStartDate:
        String(
          assignment.cycleStartDate ||
          assignment.startDate ||
          ''
        ).trim(),

      cycleReset:
        String(
          assignment.cycleReset ||
          'FALSE'
        ).toUpperCase() === 'TRUE'
    })
  );
}


/**
 * แปลงข้อมูลการจัดกะเวอร์ชันเก่าให้มี cycleStartDate
 * โดยไม่รีเซ็ตรอบ 10/5 ทุกครั้งที่ขึ้นรอบเดือนใหม่
 *
 * หลักการ:
 * - startDate = วันที่เริ่มใช้รายการ/เซตกะนั้น
 * - cycleStartDate = จุดอ้างอิงสำหรับนับ ทำงาน X วัน / หยุด Y วัน
 * - ถ้าเป็น Cycle รูปแบบเดิมของ scope เดิม ให้สืบทอดจุดอ้างอิงเดิม
 */
function migrateAssignmentCycles_() {

  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.ASSIGNMENTS
      );

  if (
    !sheet ||
    sheet.getLastRow() <= 1
  ) {
    return;
  }


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      )
      .getDisplayValues()[0]
      .map(
        value =>
          String(value || '').trim()
      );


  const index = {};

  headers.forEach(
    (header, i) => {
      index[header] = i;
    }
  );


  if (
    index.cycleStartDate === undefined ||
    index.cycleReset === undefined
  ) {
    return;
  }


  const values =
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        headers.length
      )
      .getDisplayValues();


  const setMap = {};

  getShiftSets_()
    .forEach(
      set => {
        setMap[set.setId] = set;
      }
    );


  const rows =
    values
      .map(
        (row, offset) => {

          const obj = {};

          headers.forEach(
            (header, i) => {
              obj[header] =
                row[i] !== undefined
                  ? row[i]
                  : '';
            }
          );

          obj.__rowNumber =
            offset + 2;

          return obj;
        }
      )
      .filter(
        row =>
          String(
            row.assignmentId || ''
          ).trim()
      )
      .sort(
        (a, b) => {

          const dateCompare =
            String(
              a.startDate || ''
            ).localeCompare(
              String(
                b.startDate || ''
              )
            );

          if (dateCompare !== 0) {
            return dateCompare;
          }

          return String(
            a.createdAt || ''
          ).localeCompare(
            String(
              b.createdAt || ''
            )
          );
        }
      );


  const chainAnchors = {};


  rows.forEach(
    row => {

      const set =
        setMap[row.setId] || {};

      const cycleKey =
        getAssignmentCycleKey_(
          row,
          set
        );

      const reset =
        String(
          row.cycleReset ||
          'FALSE'
        ).toUpperCase() === 'TRUE';

      let cycleStart =
        String(
          row.cycleStartDate || ''
        ).trim();


      if (!cycleStart) {

        if (
          reset ||
          !chainAnchors[cycleKey]
        ) {

          cycleStart =
            String(
              row.startDate || ''
            ).trim();

        } else {

          cycleStart =
            chainAnchors[cycleKey];
        }


        if (cycleStart) {

          sheet
            .getRange(
              row.__rowNumber,
              index.cycleStartDate + 1
            )
            .setValue(
              cycleStart
            );
        }
      }


      if (cycleStart) {
        chainAnchors[cycleKey] =
          cycleStart;
      }
    }
  );
}


function getAssignmentCycleKey_(
  assignment,
  set
) {

  const workDays =
    Math.max(
      1,
      Number(
        set?.workDays || 10
      )
    );

  const offDays =
    Math.max(
      0,
      Number(
        set?.offDays || 5
      )
    );

  return [
    String(
      assignment.scopeType || ''
    ).trim(),
    String(
      assignment.scopeValue || ''
    ).trim(),
    String(
      assignment.teamFilter || ''
    ).trim(),
    workDays + '/' + offDays
  ].join('|');
}


function sameAssignmentScope_(
  a,
  b
) {

  return (
    String(
      a.scopeType || ''
    ).trim() ===
    String(
      b.scopeType || ''
    ).trim()

    &&

    String(
      a.scopeValue || ''
    ).trim() ===
    String(
      b.scopeValue || ''
    ).trim()

    &&

    String(
      a.teamFilter || ''
    ).trim() ===
    String(
      b.teamFilter || ''
    ).trim()
  );
}


/**
 * ปิดรายการจัดกะ "อนาคต" ของ scope เดียวกัน
 * เพื่อไม่ให้รายการเก่ากลับมาทับรายการใหม่
 *
 * ตัวอย่าง:
 * เดิม TEAM B เริ่ม 26/08 = เช้า
 * ใหม่ TEAM B เริ่ม 25/08 = ดึก
 *
 * เมื่อบันทึกรายการใหม่:
 * - รายการ TEAM B วันที่ 26/08 เดิมจะถูกปิด
 * - รายการเก่าที่เริ่มก่อน 25/08 ยังเก็บไว้สำหรับประวัติ
 *
 * Scope ต้องตรงกันทั้งหมด:
 * scopeType + scopeValue + teamFilter
 *
 * ดังนั้น TEAM จะไม่ไปปิด POSITION
 * และ POSITION จะไม่ไปปิด EMPLOYEE
 */
function supersedeFutureAssignments_(
  newAssignment,
  assignments,
  excludeAssignmentId
) {

  const newStart =
    String(
      newAssignment.startDate || ''
    ).trim();


  if (!newStart) {
    return 0;
  }


  const futureIds =
    assignments
      .filter(
        old => {

          if (
            String(
              old.active || 'TRUE'
            ).toUpperCase() === 'FALSE'
          ) {
            return false;
          }


          if (
            excludeAssignmentId &&
            String(
              old.assignmentId || ''
            ).trim() ===
              String(
                excludeAssignmentId
              ).trim()
          ) {
            return false;
          }


          if (
            !sameAssignmentScope_(
              old,
              newAssignment
            )
          ) {
            return false;
          }


          const oldStart =
            String(
              old.startDate || ''
            ).trim();


          if (!oldStart) {
            return false;
          }


          return (
            oldStart >=
            newStart
          );
        }
      )
      .map(
        old =>
          String(
            old.assignmentId || ''
          ).trim()
      )
      .filter(Boolean);


  if (
    !futureIds.length
  ) {
    return 0;
  }


  const idSet =
    new Set(
      futureIds
    );


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.ASSIGNMENTS
      );


  const rows =
    sheet
      .getDataRange()
      .getDisplayValues();


  if (
    rows.length < 2
  ) {
    return 0;
  }


  const headers =
    rows[0]
      .map(
        value =>
          String(
            value || ''
          ).trim()
      );


  const idIndex =
    headers.indexOf(
      'assignmentId'
    );


  const activeIndex =
    headers.indexOf(
      'active'
    );


  const updatedIndex =
    headers.indexOf(
      'updatedAt'
    );


  if (
    idIndex < 0 ||
    activeIndex < 0
  ) {

    throw new Error(
      'โครงสร้าง DB_Assignments ไม่ครบ'
    );
  }


  const now =
    nowText_();


  let count = 0;


  for (
    let r = 1;
    r < rows.length;
    r++
  ) {

    const assignmentId =
      String(
        rows[r][idIndex] || ''
      ).trim();


    if (
      !idSet.has(
        assignmentId
      )
    ) {
      continue;
    }


    sheet
      .getRange(
        r + 1,
        activeIndex + 1
      )
      .setValue(
        'FALSE'
      );


    if (
      updatedIndex >= 0
    ) {

      sheet
        .getRange(
          r + 1,
          updatedIndex + 1
        )
        .setValue(
          now
        );
    }


    count++;
  }


  return count;
}


function appendObjectRow_(
  sheetName,
  object
) {

  const sheet =
    getDatabase_()
      .getSheetByName(
        sheetName
      );

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      )
      .getDisplayValues()[0]
      .map(
        value =>
          String(value || '').trim()
      );

  sheet.appendRow(
    headers.map(
      header =>
        object[header] !== undefined &&
        object[header] !== null
          ? object[header]
          : ''
    )
  );
}


function saveAssignment(data) {

  if (
    !data ||
    !data.scopeType ||
    !data.scopeValue ||
    !data.setId ||
    !data.startDate
  ) {

    throw new Error(
      'กรุณากรอกข้อมูลการจัดกะให้ครบ'
    );
  }


  const now =
    nowText_();


  const startDate =
    String(
      data.startDate || ''
    ).trim();


  const setMap = {};


  getShiftSets_()
    .forEach(
      set => {

        setMap[
          set.setId
        ] = set;
      }
    );


  const selectedSet =
    setMap[
      String(
        data.setId
      )
    ];


  if (!selectedSet) {

    throw new Error(
      'ไม่พบเซตกะที่เลือก'
    );
  }


  /*
   * กติกาหลัก:
   *
   * วันที่เริ่มใช้เซต = วันแรกของ Cycle ใหม่เสมอ
   *
   * ตัวอย่าง 10 ทำ / 5 หยุด
   * เริ่ม 25/08:
   * 25/08 - 03/09 = ทำงาน 10 วัน
   * 04/09 - 08/09 = หยุด 5 วัน
   * แล้ววนต่อไปเรื่อย ๆ
   *
   * รอบ 26-25 มีไว้ "แสดงผล" เท่านั้น
   * ไม่มีสิทธิ์รีเซ็ต Cycle
   */
  const newAssignment = {

    assignmentId:
      'ASN_' +
      new Date().getTime() +
      '_' +
      Utilities.getUuid()
        .slice(
          0,
          8
        ),

    scopeType:
      String(
        data.scopeType
      )
      .trim()
      .toUpperCase(),

    scopeValue:
      String(
        data.scopeValue
      )
      .trim(),

    teamFilter:
      String(
        data.teamFilter || ''
      )
      .trim(),

    setId:
      String(
        data.setId
      )
      .trim(),

    startDate:
      startDate,

    startShift:
      String(
        data.startShift ||
        selectedSet.startShift ||
        'MORNING'
      )
      .trim()
      .toUpperCase(),

    active:
      'TRUE',

    createdAt:
      now,

    /*
     * สำคัญ:
     * ใช้วันที่ที่เลือกเป็น Anchor ของ 10/5 โดยตรง
     */
    cycleStartDate:
      startDate,

    cycleReset:
      'TRUE',

    updatedAt:
      now
  };


  const assignments =
    getAssignments_();


  /*
   * ถ้ามีรายการ scope เดียวกันที่เริ่ม "วันเดียวกันหรือหลังจากนี้"
   * ให้ปิดก่อน เพื่อไม่ให้ของเก่ากลับมาทับของใหม่
   *
   * ตัวอย่าง:
   * เดิม TEAM B 26/08 = เช้า
   * ใหม่ TEAM B 25/08 = ดึก
   *
   * 26/08 เดิมจะถูกปิด
   * แล้ว 25/08 ดึกจะวิ่งต่อเนื่องตาม 10/5
   */
  const supersededCount =
    supersedeFutureAssignments_(
      newAssignment,
      assignments
    );


  appendObjectRow_(
    APP.SHEETS.ASSIGNMENTS,
    newAssignment
  );


  return {

    ok:
      true,

    supersededCount:
      supersededCount,

    message:
      'จัดกะเรียบร้อย · เริ่ม Cycle 10/5 จาก ' +
      formatThaiDateServer_(
        startDate
      ) +
      (
        supersededCount
          ? ' · ปิดรายการเดิมที่ทับ ' +
            supersededCount +
            ' รายการ'
          : ''
      ),

    assignments:
      getAssignments_()
  };
}


function formatThaiDateServer_(
  dateText
) {

  if (!dateText) {
    return '-';
  }

  const date =
    parseDate_(dateText);

  const months = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.'
  ];

  return (
    date.getDate() +
    ' ' +
    months[date.getMonth()] +
    ' ' +
    (date.getFullYear() + 543)
  );
}

function deactivateAssignment(
  assignmentId
) {

  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.ASSIGNMENTS
      );


  const rows =
    sheet
      .getDataRange()
      .getDisplayValues();


  for (
    let r = 1;
    r < rows.length;
    r++
  ) {

    if (
      String(
        rows[r][0]
      ) ===
      String(assignmentId)
    ) {

      const headers =
        rows[0];

      const activeIndex =
        headers.indexOf('active');

      const updatedIndex =
        headers.indexOf('updatedAt');

      if (activeIndex >= 0) {

        sheet
          .getRange(
            r + 1,
            activeIndex + 1
          )
          .setValue(
            'FALSE'
          );
      }

      if (updatedIndex >= 0) {

        sheet
          .getRange(
            r + 1,
            updatedIndex + 1
          )
          .setValue(
            nowText_()
          );
      }

      break;
    }
  }


  return {

    ok: true,

    message:
      'ปิดการจัดกะแล้ว',

    assignments:
      getAssignments_()
  };
}


/* =========================================================
   INDIVIDUAL CALENDAR
========================================================= */

function getEmployeeCalendar(
  request
) {

  const employeeId =
    String(
      request?.employeeId || ''
    ).trim();


  const anchorDate =
    String(
      request?.anchorDate ||
      todayText_()
    ).trim();


  const employee =
    getEmployees_()
      .find(
        e =>
          e.employeeId ===
          employeeId
      );


  if (!employee) {

    throw new Error(
      'ไม่พบพนักงาน'
    );
  }


  const range =
    getRoundRange_(
      anchorDate
    );


  const dates =
    createDateRange_(
      range.from,
      range.to,
      40
    );


  const setMap = {};


  getShiftSets_()
    .forEach(
      set => {

        setMap[
          set.setId
        ] = set;
      }
    );


  const assignments =
    getAssignments_();


  const overrides =
    getOverrideMap_(
      range.from,
      range.to
    );


  const days =
    dates.map(
      date => {

        const result =
          calculateEmployeeShift_(
            employee,
            date,
            setMap,
            assignments,
            overrides
          );


        const automatic =
          calculateEmployeeShift_(
            employee,
            date,
            setMap,
            assignments,
            {}
          );


        return {

          date:
            date,

          shift:
            result.shift,

          autoShift:
            automatic.shift,

          hasOverride:
            result.source ===
            'OVERRIDE',

          source:
            result.source,

          setName:
            automatic.setName || '',

          note:
            String(
              overrides[
                employee.employeeId +
                '|' +
                date
              ]?.note || ''
            )
        };
      }
    );


  return {

    employee:
      employee,

    anchorDate:
      anchorDate,

    from:
      range.from,

    to:
      range.to,

    days:
      days
  };
}


function saveShiftOverridesBatch(
  data
) {

  const employeeId =
    String(
      data?.employeeId || ''
    ).trim();


  const rawItems =
    Array.isArray(
      data?.items
    )
      ? data.items
      : [];


  if (!employeeId) {

    throw new Error(
      'กรุณาเลือกพนักงาน'
    );
  }


  if (!rawItems.length) {

    return {

      ok: true,

      message:
        'ไม่มีรายการเปลี่ยนแปลง',

      savedItems:
        []
    };
  }


  /*
   * ถ้าวันเดียวกันถูกส่งมาซ้ำ
   * ใช้ค่าล่าสุดเพียงรายการเดียว
   */
  const itemMap =
    new Map();


  rawItems.forEach(
    item => {

      const date =
        String(
          item?.date || ''
        ).trim();


      if (!date) {
        return;
      }


      let shift =
        String(
          item?.shift || 'AUTO'
        )
        .trim()
        .toUpperCase();


      if (
        ![
          'AUTO',
          'MORNING',
          'NIGHT',
          'OFF',
          'UNSET'
        ].includes(
          shift
        )
      ) {

        shift =
          'AUTO';
      }


      itemMap.set(
        date,
        shift
      );
    }
  );


  const items =
    Array.from(
      itemMap.entries()
    )
    .map(
      ([date, shift]) => ({
        date:
          date,

        shift:
          shift
      })
    );


  if (!items.length) {

    return {

      ok: true,

      message:
        'ไม่มีรายการเปลี่ยนแปลง',

      savedItems:
        []
    };
  }


  const lock =
    LockService
      .getScriptLock();


  lock.waitLock(
    15000
  );


  try {

    const employee =
      getEmployees_()
        .find(
          e =>
            e.employeeId ===
            employeeId
        );


    if (!employee) {

      throw new Error(
        'ไม่พบพนักงาน'
      );
    }


    const setMap = {};


    getShiftSets_()
      .forEach(
        set => {

          setMap[
            set.setId
          ] = set;
        }
      );


    const assignments =
      getAssignments_();


    /*
     * อ่าน DB_ShiftOverrides เพียง 1 ครั้ง
     * แล้วแก้เฉพาะแถวที่เกี่ยวข้อง
     * ไม่ล้างและเขียนทั้งตารางใหม่
     */
    const state =
      loadOverrideSheetState_();


    const validManualShifts = [
      'MORNING',
      'NIGHT',
      'OFF',
      'UNSET'
    ];


    const historyRows = [];

    const rowWrites =
      new Map();

    const clearRows =
      new Set();

    const appendRows = [];

    const availableBlankRows =
      [...state.blankRows];


    const savedItems = [];

    let changedCount = 0;


    items.forEach(
      item => {

        const date =
          item.date;


        const shift =
          item.shift;


        const key =
          employeeId +
          '|' +
          date;


        const oldEntry =
          state.byKey.get(
            key
          );


        const old =
          oldEntry
            ? oldEntry.object
            : {
                employeeId:
                  employeeId,

                date:
                  date,

                shift:
                  'AUTO',

                note:
                  '',

                updatedAt:
                  ''
              };


        const oldStoredShift =
          String(
            old.shift || 'AUTO'
          )
          .trim()
          .toUpperCase() ||
          'AUTO';


        const automatic =
          calculateEmployeeShift_(
            employee,
            date,
            setMap,
            assignments,
            {}
          );


        const oldEffectiveShift =
          validManualShifts.includes(
            oldStoredShift
          )
            ? oldStoredShift
            : automatic.shift;


        const newEffectiveShift =
          validManualShifts.includes(
            shift
          )
            ? shift
            : automatic.shift;


        const note =
          String(
            old.note || ''
          );


        const storageChanged =
          oldStoredShift !==
          shift;


        if (
          storageChanged
        ) {

          changedCount++;


          historyRows.push({

            historyId:
              'HIS_' +
              Utilities.getUuid(),

            employeeId:
              employee.employeeId,

            nickname:
              employee.nickname,

            team:
              employee.team,

            position:
              employee.position,

            date:
              date,

            oldShift:
              oldEffectiveShift,

            newShift:
              newEffectiveShift,

            action:
              shift === 'AUTO'
                ? 'กลับไปใช้ตามเซตกะ'
                : shift === 'UNSET'
                  ? 'กำหนดไม่มีกะ'
                  : 'แก้กะรายบุคคล',

            changedAt:
              nowText_()
          });
        }


        /*
         * AUTO + ไม่มี note = ไม่ต้องมีแถวใน DB
         */
        if (
          shift === 'AUTO' &&
          !note.trim()
        ) {

          if (
            oldEntry &&
            storageChanged
          ) {

            clearRows.add(
              oldEntry.rowNumber
            );
          }


          state.byKey.delete(
            key
          );

        } else if (
          storageChanged ||
          !oldEntry
        ) {

          const rowObject = {

            employeeId:
              employeeId,

            date:
              date,

            shift:
              shift,

            note:
              note,

            updatedAt:
              nowText_()
          };


          const rowValues =
            buildOverrideRowValues_(
              state,
              oldEntry?.values,
              rowObject
            );


          if (oldEntry) {

            rowWrites.set(
              oldEntry.rowNumber,
              rowValues
            );


            state.byKey.set(
              key,
              {
                rowNumber:
                  oldEntry.rowNumber,

                values:
                  rowValues,

                object:
                  rowObject
              }
            );

          } else if (
            availableBlankRows.length
          ) {

            const rowNumber =
              availableBlankRows.shift();


            rowWrites.set(
              rowNumber,
              rowValues
            );


            state.byKey.set(
              key,
              {
                rowNumber:
                  rowNumber,

                values:
                  rowValues,

                object:
                  rowObject
              }
            );

          } else {

            appendRows.push(
              {
                key:
                  key,

                values:
                  rowValues,

                object:
                  rowObject
              }
            );
          }
        }


        savedItems.push({

          date:
            date,

          shift:
            newEffectiveShift,

          autoShift:
            automatic.shift,

          hasOverride:
            validManualShifts
              .includes(
                shift
              ),

          source:
            validManualShifts
              .includes(
                shift
              )
              ? 'OVERRIDE'
              : automatic.source,

          setName:
            automatic.setName || '',

          note:
            note
        });
      }
    );


    /*
     * เขียนเฉพาะแถวที่เปลี่ยน
     */
    writeOverrideRowsFast_(
      state.sheet,
      rowWrites,
      state.lastColumn
    );


    clearOverrideRowsFast_(
      state.sheet,
      clearRows,
      state.lastColumn
    );


    if (
      appendRows.length
    ) {

      const startRow =
        Math.max(
          2,
          state.sheet.getLastRow() + 1
        );


      state.sheet
        .getRange(
          startRow,
          1,
          appendRows.length,
          state.lastColumn
        )
        .setValues(
          appendRows.map(
            item =>
              item.values
          )
        );
    }


    appendShiftHistory_(
      historyRows
    );


    return {

      ok:
        true,

      message:
        changedCount
          ? 'บันทึกกะรายบุคคลแล้ว ' +
            changedCount +
            ' วัน'
          : 'ข้อมูลกะเป็นค่าปัจจุบันอยู่แล้ว',

      changedCount:
        changedCount,

      savedItems:
        savedItems
    };

  } finally {

    lock.releaseLock();
  }
}

/**
 * เพิ่มประวัติการแก้กะ
 */
function appendShiftHistory_(
  rows
) {

  if (
    !rows ||
    !rows.length
  ) {
    return;
  }


  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.SHIFT_HISTORY
      );


  const headers = [
    'historyId',
    'employeeId',
    'nickname',
    'team',
    'position',
    'date',
    'oldShift',
    'newShift',
    'action',
    'changedAt'
  ];


  const values =
    rows.map(
      row =>
        headers.map(
          header =>
            row[header] || ''
        )
    );


  sheet
    .getRange(
      sheet.getLastRow() + 1,
      1,
      values.length,
      headers.length
    )
    .setValues(
      values
    );
}


/**
 * ดึงประวัติการแก้กะสำหรับหน้า Admin
 */
function getShiftHistory(
  request
) {

  request =
    request || {};


  const employeeId =
    String(
      request.employeeId || ''
    ).trim();


  const team =
    String(
      request.team || ''
    ).trim();


  const from =
    String(
      request.from || ''
    ).trim();


  const to =
    String(
      request.to || ''
    ).trim();


  const search =
    String(
      request.search || ''
    )
    .trim()
    .toLowerCase();


  let rows =
    getSheetObjects_(
      APP.SHEETS.SHIFT_HISTORY
    );


  if (
    employeeId
  ) {

    rows =
      rows.filter(
        row =>
          String(
            row.employeeId || ''
          ) === employeeId
      );
  }


  if (
    team
  ) {

    rows =
      rows.filter(
        row =>
          String(
            row.team || ''
          ) === team
      );
  }


  if (
    from
  ) {

    rows =
      rows.filter(
        row =>
          String(
            row.date || ''
          ) >= from
      );
  }


  if (
    to
  ) {

    rows =
      rows.filter(
        row =>
          String(
            row.date || ''
          ) <= to
      );
  }


  if (
    search
  ) {

    rows =
      rows.filter(
        row => {

          const text =
            [
              row.employeeId,
              row.nickname,
              row.team,
              row.position,
              row.action
            ]
            .join(
              ' '
            )
            .toLowerCase();


          return text.includes(
            search
          );
        }
      );
  }


  rows.sort(
    (a,b) =>
      String(
        b.changedAt || ''
      )
      .localeCompare(
        String(
          a.changedAt || ''
        )
      )
  );


  return {
    total:
      rows.length,

    rows:
      rows.slice(
        0,
        1000
      )
  };
}


/**
 * บันทึก / แก้ไข / ลบ หมายเหตุของวัน
 * โดยไม่กระทบกะที่กำหนดไว้
 */
function saveEmployeeDayNote(
  data
) {

  const employeeId =
    String(
      data?.employeeId || ''
    ).trim();


  const date =
    String(
      data?.date || ''
    ).trim();


  const note =
    String(
      data?.note || ''
    )
    .trim()
    .slice(
      0,
      200
    );


  if (!employeeId) {

    throw new Error(
      'กรุณาเลือกพนักงาน'
    );
  }


  if (!date) {

    throw new Error(
      'ไม่พบวันที่'
    );
  }


  const lock =
    LockService
      .getScriptLock();


  lock.waitLock(
    15000
  );


  try {

    const state =
      loadOverrideSheetState_();


    const key =
      employeeId +
      '|' +
      date;


    const oldEntry =
      state.byKey.get(
        key
      );


    const old =
      oldEntry
        ? oldEntry.object
        : {
            employeeId:
              employeeId,

            date:
              date,

            shift:
              'AUTO',

            note:
              '',

            updatedAt:
              ''
          };


    let shift =
      String(
        old.shift || 'AUTO'
      )
      .trim()
      .toUpperCase();


    if (
      ![
        'AUTO',
        'MORNING',
        'NIGHT',
        'OFF',
        'UNSET'
      ].includes(
        shift
      )
    ) {

      shift =
        'AUTO';
    }


    /*
     * ถ้าค่า note เดิมเท่ากัน ไม่ต้องเขียนชีต
     */
    if (
      String(
        old.note || ''
      ) === note
    ) {

      return {

        ok:
          true,

        message:
          note
            ? 'หมายเหตุเป็นค่าปัจจุบันอยู่แล้ว'
            : 'ไม่มีหมายเหตุให้ลบ',

        employeeId:
          employeeId,

        date:
          date,

        note:
          note
      };
    }


    if (
      !note &&
      shift === 'AUTO'
    ) {

      if (oldEntry) {

        state.sheet
          .getRange(
            oldEntry.rowNumber,
            1,
            1,
            state.lastColumn
          )
          .clearContent();
      }

    } else {

      const rowObject = {

        employeeId:
          employeeId,

        date:
          date,

        shift:
          shift,

        note:
          note,

        updatedAt:
          nowText_()
      };


      const rowValues =
        buildOverrideRowValues_(
          state,
          oldEntry?.values,
          rowObject
        );


      let rowNumber =
        oldEntry?.rowNumber;


      if (!rowNumber) {

        rowNumber =
          state.blankRows.length
            ? state.blankRows[0]
            : Math.max(
                2,
                state.sheet.getLastRow() + 1
              );
      }


      state.sheet
        .getRange(
          rowNumber,
          1,
          1,
          state.lastColumn
        )
        .setValues([
          rowValues
        ]);
    }


    return {

      ok:
        true,

      message:
        note
          ? 'บันทึกหมายเหตุแล้ว'
          : 'ลบหมายเหตุแล้ว',

      employeeId:
        employeeId,

      date:
        date,

      note:
        note
    };

  } finally {

    lock.releaseLock();
  }
}

/**
 * โหลด DB_ShiftOverrides 1 ครั้ง พร้อมตำแหน่งแถวจริง
 * ใช้สำหรับบันทึกแบบเร็วโดยไม่ rewrite ทั้งชีต
 */
function loadOverrideSheetState_() {

  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.OVERRIDES
      );


  const lastColumn =
    Math.max(
      5,
      sheet.getLastColumn()
    );


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getDisplayValues()[0]
      .map(
        value =>
          String(
            value || ''
          ).trim()
      );


  const required = [
    'employeeId',
    'date',
    'shift',
    'note',
    'updatedAt'
  ];


  const columns = {};


  required.forEach(
    header => {

      const index =
        headers.indexOf(
          header
        );


      if (
        index < 0
      ) {

        throw new Error(
          'DB_ShiftOverrides ไม่มีคอลัมน์ ' +
          header
        );
      }


      columns[
        header
      ] = index;
    }
  );


  const lastRow =
    sheet.getLastRow();


  const values =
    lastRow > 1
      ? sheet
          .getRange(
            2,
            1,
            lastRow - 1,
            lastColumn
          )
          .getDisplayValues()
      : [];


  const byKey =
    new Map();


  const blankRows = [];


  values.forEach(
    (
      row,
      index
    ) => {

      const rowNumber =
        index + 2;


      const employeeId =
        String(
          row[
            columns.employeeId
          ] || ''
        ).trim();


      const date =
        String(
          row[
            columns.date
          ] || ''
        ).trim();


      if (
        !employeeId &&
        !date
      ) {

        blankRows.push(
          rowNumber
        );

        return;
      }


      if (
        !employeeId ||
        !date
      ) {
        return;
      }


      byKey.set(
        employeeId +
        '|' +
        date,
        {
          rowNumber:
            rowNumber,

          values:
            [...row],

          object: {
            employeeId:
              employeeId,

            date:
              date,

            shift:
              String(
                row[
                  columns.shift
                ] || 'AUTO'
              )
              .trim()
              .toUpperCase() ||
              'AUTO',

            note:
              String(
                row[
                  columns.note
                ] || ''
              ),

            updatedAt:
              String(
                row[
                  columns.updatedAt
                ] || ''
              )
          }
        }
      );
    }
  );


  return {

    sheet:
      sheet,

    lastColumn:
      lastColumn,

    headers:
      headers,

    columns:
      columns,

    byKey:
      byKey,

    blankRows:
      blankRows
  };
}


/**
 * สร้าง array สำหรับเขียน 1 แถว
 * โดยรักษาคอลัมน์อื่นที่อาจมีอยู่ในชีต
 */
function buildOverrideRowValues_(
  state,
  existingValues,
  rowObject
) {

  const values =
    Array.isArray(
      existingValues
    )
      ? [
          ...existingValues
        ]
      : new Array(
          state.lastColumn
        ).fill('');


  while (
    values.length <
    state.lastColumn
  ) {

    values.push('');
  }


  Object
    .entries(
      rowObject
    )
    .forEach(
      (
        [key, value]
      ) => {

        if (
          state.columns[
            key
          ] === undefined
        ) {
          return;
        }


        values[
          state.columns[
            key
          ]
        ] =
          value ?? '';
      }
    );


  return values;
}


/**
 * เขียนแถวที่เปลี่ยนแบบ batch เป็นช่วงติดกัน
 */
function writeOverrideRowsFast_(
  sheet,
  rowWrites,
  lastColumn
) {

  if (
    !rowWrites ||
    !rowWrites.size
  ) {
    return;
  }


  const entries =
    Array
      .from(
        rowWrites.entries()
      )
      .sort(
        (a, b) =>
          a[0] - b[0]
      );


  let startRow =
    entries[0][0];


  let previousRow =
    entries[0][0];


  let values = [
    entries[0][1]
  ];


  for (
    let i = 1;
    i < entries.length;
    i++
  ) {

    const [
      rowNumber,
      rowValues
    ] =
      entries[i];


    if (
      rowNumber ===
      previousRow + 1
    ) {

      values.push(
        rowValues
      );

    } else {

      sheet
        .getRange(
          startRow,
          1,
          values.length,
          lastColumn
        )
        .setValues(
          values
        );


      startRow =
        rowNumber;


      values = [
        rowValues
      ];
    }


    previousRow =
      rowNumber;
  }


  sheet
    .getRange(
      startRow,
      1,
      values.length,
      lastColumn
    )
    .setValues(
      values
    );
}


/**
 * ล้างเฉพาะแถวที่ต้องลบ
 */
function clearOverrideRowsFast_(
  sheet,
  clearRows,
  lastColumn
) {

  if (
    !clearRows ||
    !clearRows.size
  ) {
    return;
  }


  const rows =
    Array
      .from(
        clearRows
      )
      .sort(
        (a, b) =>
          a - b
      );


  let startRow =
    rows[0];


  let previousRow =
    rows[0];


  let count = 1;


  for (
    let i = 1;
    i < rows.length;
    i++
  ) {

    const rowNumber =
      rows[i];


    if (
      rowNumber ===
      previousRow + 1
    ) {

      count++;

    } else {

      sheet
        .getRange(
          startRow,
          1,
          count,
          lastColumn
        )
        .clearContent();


      startRow =
        rowNumber;

      count = 1;
    }


    previousRow =
      rowNumber;
  }


  sheet
    .getRange(
      startRow,
      1,
      count,
      lastColumn
    )
    .clearContent();
}


/**
 * เขียนข้อมูล DB_ShiftOverrides ใหม่ทั้งตาราง
 */
function rewriteShiftOverrides_(
  rows
) {

  const sheet =
    getDatabase_()
      .getSheetByName(
        APP.SHEETS.OVERRIDES
      );


  const headers = [
    'employeeId',
    'date',
    'shift',
    'note',
    'updatedAt'
  ];


  if (
    sheet.getLastRow() > 1
  ) {

    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        headers.length
      )
      .clearContent();
  }


  if (
    !rows ||
    !rows.length
  ) {
    return;
  }


  const values =
    rows.map(
      row =>
        headers.map(
          header =>
            row[header] || ''
        )
    );


  sheet
    .getRange(
      2,
      1,
      values.length,
      headers.length
    )
    .setValues(values);
}


/* =========================================================
   SCHEDULE
========================================================= */

function getSchedule(
  request
) {

  /*
   * ตารางกะจริงทั้งหมดใช้ helper ตัวเดียว
   * หน้า "กำลังคน" จะอ้างอิง helper นี้ด้วย
   * เพื่อให้ยอด เช้า / ดึก / หยุด / ไม่มีกะ
   * ตรงกับหน้าตารางกะ 100%
   */
  return getScheduleInternal_(
    request,
    null
  );
}


function getScheduleInternal_(
  request,
  preloaded
) {

  request =
    request || {};


  preloaded =
    preloaded || {};


  let from =
    String(
      request.from || ''
    ).trim();


  let to =
    String(
      request.to || ''
    ).trim();


  if (
    !from ||
    !to
  ) {

    const range =
      getRoundRange_(
        todayText_()
      );

    from =
      range.from;

    to =
      range.to;
  }


  let employees =
    (
      preloaded.employees ||
      getEmployees_()
    )
      .filter(
        e =>
          String(
            e.status || ''
          ).trim() === 'ทำงาน'
      );


  if (
    request.team
  ) {

    employees =
      employees.filter(
        e =>
          e.team ===
          request.team
      );
  }


  if (
    request.position
  ) {

    employees =
      employees.filter(
        e =>
          e.position ===
          request.position
      );
  }


  if (
    request.employeeId
  ) {

    employees =
      employees.filter(
        e =>
          e.employeeId ===
          request.employeeId
      );
  }


  const search =
    String(
      request.search || ''
    )
    .trim()
    .toLowerCase();


  if (search) {

    employees =
      employees.filter(
        e =>
          String(
            e.employeeId || ''
          )
          .toLowerCase()
          .includes(search)

          ||

          String(
            e.nickname || ''
          )
          .toLowerCase()
          .includes(search)
      );
  }


  const dates =
    createDateRange_(
      from,
      to,
      50
    );


  const setMap = {};


  (
    preloaded.shiftSets ||
    getShiftSets_()
  )
    .forEach(
      set => {

        setMap[
          set.setId
        ] = set;
      }
    );


  const assignments =
    preloaded.assignments ||
    getAssignments_();


  const overrides =
    getOverrideMap_(
      from,
      to
    );


  const rows =
    employees.map(
      employee => ({

        employeeId:
          employee.employeeId,

        nickname:
          employee.nickname,

        team:
          employee.team,

        position:
          employee.position,

        branch:
          employee.branch,

        gender:
          employee.gender,

        days:
          dates.map(
            date => {

              const result =
                calculateEmployeeShift_(
                  employee,
                  date,
                  setMap,
                  assignments,
                  overrides
                );


              return {

                date:
                  date,

                shift:
                  result.shift,

                source:
                  result.source,

                setName:
                  result.setName || ''
              };
            }
          )
      })
    );


  return {

    from:
      from,

    to:
      to,

    dates:
      dates,

    rows:
      rows
  };
}


/* =========================================================
   EMPLOYEE VIEW
========================================================= */

function getEmployeeView(
  employeeId
) {

  const employee =
    getEmployees_()
      .find(
        e =>
          e.employeeId ===
          employeeId
      );


  if (!employee) {

    throw new Error(
      'ไม่พบพนักงาน'
    );
  }


  const today =
    todayText_();


  const range =
    getRoundRange_(
      today
    );


  return {

    employee:
      employee,

    today:
      today,

    todayShift:
      getShiftForEmployeeDate_(
        employeeId,
        today
      ),

    round:
      range,

    schedule:
      getSchedule({

        employeeId:
          employeeId,

        from:
          range.from,

        to:
          range.to
      })
  };
}



/* =========================================================
   EMPLOYEE PUBLIC VIEW
   อ่านอย่างเดียวสำหรับลิงก์พนักงาน
========================================================= */

function findEmployeePublic_(query) {

  query =
    String(
      query || ''
    )
    .trim()
    .replace(
      /^["']+|["']+$/g,
      ''
    )
    .trim();


  if (
    !query ||
    query === '""' ||
    query === "''"
  ) {

    throw new Error(
      'กรุณากรอกรหัสหรือชื่อพนักงาน'
    );
  }


  const q =
    query.toLowerCase();


  const employees =
    getEmployees_()
      .filter(
        e =>
          String(
            e.status || ''
          ).trim() !== 'ออก'
      );


  /*
   * 1) รหัสพนักงานตรงกัน
   */
  let employee =
    employees.find(
      e =>
        String(
          e.employeeId || ''
        )
        .trim()
        .toLowerCase() ===
        q
    );


  if (employee) {
    return employee;
  }


  /*
   * 2) ชื่อเล่น หรือ ชื่อ-นามสกุล ตรงกัน
   */
  const exact =
    employees.filter(
      e => {

        const nickname =
          String(
            e.nickname || ''
          )
          .trim()
          .toLowerCase();


        const fullName =
          String(
            e.fullName || ''
          )
          .trim()
          .toLowerCase();


        return (
          nickname === q ||
          fullName === q
        );
      }
    );


  if (
    exact.length === 1
  ) {

    return exact[0];
  }


  if (
    exact.length > 1
  ) {

    throw new Error(
      'พบชื่อซ้ำ กรุณาใช้รหัสพนักงาน'
    );
  }


  /*
   * 3) ค้นหาบางส่วน
   */
  const partial =
    employees.filter(
      e => {

        const employeeId =
          String(
            e.employeeId || ''
          )
          .toLowerCase();


        const nickname =
          String(
            e.nickname || ''
          )
          .toLowerCase();


        const fullName =
          String(
            e.fullName || ''
          )
          .toLowerCase();


        return (
          employeeId.includes(q) ||
          nickname.includes(q) ||
          fullName.includes(q)
        );
      }
    );


  if (
    partial.length === 1
  ) {

    return partial[0];
  }


  if (
    partial.length > 1
  ) {

    const examples =
      partial
        .slice(
          0,
          5
        )
        .map(
          e =>
            e.employeeId +
            ' · ' +
            e.nickname
        )
        .join(
          ', '
        );


    throw new Error(
      'พบหลายคน: ' +
      examples +
      ' กรุณาพิมพ์ชื่อหรือรหัสให้ชัดเจนขึ้น'
    );
  }


  throw new Error(
    'ไม่พบรหัสหรือชื่อพนักงานนี้'
  );
}


function getEmployeePublicSchedule(query, anchorDate) {
  const employee = findEmployeePublic_(query);
  const today = todayText_();
  anchorDate = String(anchorDate || today).trim();
  const range = getRoundRange_(anchorDate);
  const dates = createDateRange_(range.from, range.to, 40);
  const setMap = {};
  getShiftSets_().forEach(set => setMap[set.setId] = set);
  const assignments = getAssignments_();
  const overrides = getOverrideMap_(range.from, range.to);

  const days = dates.map(date => {
    const result = calculateEmployeeShift_(employee,date,setMap,assignments,overrides);
    return {date:date, shift:result.shift};
  });

  const todayResult = calculateEmployeeShift_(
    employee,today,setMap,assignments,getOverrideMap_(today,today)
  );

  return {
    employee:{
      employeeId:employee.employeeId,
      nickname:employee.nickname,
      team:employee.team,
      position:employee.position
    },
    today:today,
    todayShift:todayResult.shift,
    round:range,
    days:days
  };
}


function getEmployeePublicTeamSchedule(anchorDate) {
  const today = todayText_();
  anchorDate = String(anchorDate || today).trim();
  const range = getRoundRange_(anchorDate);
  const schedule = getSchedule({from:range.from,to:range.to});
  const order = {'TEAM A':1,'TEAM B':2,'TEAM C':3};

  const rows = schedule.rows.map(row => ({
    employeeId:row.employeeId,
    nickname:row.nickname,
    team:row.team,
    position:row.position,
    days:row.days.map(day => ({date:day.date,shift:day.shift}))
  })).sort((a,b) => {
    const ta = order[String(a.team || '').toUpperCase()] || 99;
    const tb = order[String(b.team || '').toUpperCase()] || 99;
    if (ta !== tb) return ta-tb;
    return String(a.employeeId || '').localeCompare(String(b.employeeId || ''));
  });

  const counts={};
  rows.forEach(row => {
    const team=row.team || 'ไม่ระบุ TEAM';
    counts[team]=(counts[team]||0)+1;
  });

  return {today:today,round:range,dates:schedule.dates,rows:rows,counts:counts};
}


/* =========================================================
   MANPOWER
========================================================= */

function getManpower(
  date
) {

  return getManpowerInternal_(
    String(
      date ||
      todayText_()
    )
  );
}


function getManpowerInternal_(
  date,
  preloaded
) {

  /*
   * สำคัญ:
   * ไม่คำนวณกะแยกอีกชุดแล้ว
   *
   * หน้า "กำลังคน" อ่านผลจากตารางกะจริง
   * ผ่าน getScheduleInternal_() โดยตรง
   *
   * ถ้าหน้าตารางกะของวันที่นี้แสดง:
   * - เช้า 20 คน
   * - ดึก 30 คน
   * - หยุด 50 คน
   *
   * หน้ากำลังคนจะนับจาก 20 / 30 / 50 ชุดเดียวกัน
   */
  const schedule =
    getScheduleInternal_(
      {
        from:
          date,

        to:
          date
      },
      preloaded || null
    );


  const rows =
    Array.isArray(
      schedule.rows
    )
      ? schedule.rows
      : [];


  const summary = {
    MORNING: 0,
    NIGHT: 0,
    OFF: 0,
    UNSET: 0
  };


  const byTeam = {};
  const byPosition = {};
  const byGender = {};
  const byTeamGender = {};


  const byShiftGender = {
    MORNING: {},
    NIGHT: {},
    OFF: {},
    UNSET: {}
  };


  const byTeamShiftGender = {};


  rows.forEach(
    row => {

      const rawShift =
        String(
          row.days?.[0]?.shift ||
          'UNSET'
        )
        .trim()
        .toUpperCase();


      const shift =
        [
          'MORNING',
          'NIGHT',
          'OFF'
        ].includes(
          rawShift
        )
          ? rawShift
          : 'UNSET';


      const team =
        row.team ||
        'ไม่ระบุ TEAM';


      const position =
        row.position ||
        'ไม่ระบุตำแหน่ง';


      const gender =
        row.gender ||
        'ไม่ระบุ';


      summary[
        shift
      ]++;


      if (
        !byTeam[
          team
        ]
      ) {

        byTeam[
          team
        ] = {
          MORNING: 0,
          NIGHT: 0,
          OFF: 0,
          UNSET: 0
        };
      }


      byTeam[
        team
      ][
        shift
      ]++;


      if (
        !byPosition[
          position
        ]
      ) {

        byPosition[
          position
        ] = {
          MORNING: 0,
          NIGHT: 0,
          OFF: 0,
          UNSET: 0
        };
      }


      byPosition[
        position
      ][
        shift
      ]++;


      incrementObject_(
        byGender,
        gender
      );


      if (
        !byTeamGender[
          team
        ]
      ) {

        byTeamGender[
          team
        ] = {};
      }


      incrementObject_(
        byTeamGender[
          team
        ],
        gender
      );


      incrementObject_(
        byShiftGender[
          shift
        ],
        gender
      );


      if (
        !byTeamShiftGender[
          team
        ]
      ) {

        byTeamShiftGender[
          team
        ] = {
          MORNING: {},
          NIGHT: {},
          OFF: {},
          UNSET: {}
        };
      }


      incrementObject_(
        byTeamShiftGender[
          team
        ][
          shift
        ],
        gender
      );
    }
  );


  return {

    date:
      date,

    total:
      rows.length,

    summary:
      summary,

    byTeam:
      byTeam,

    byPosition:
      byPosition,

    byGender:
      byGender,

    byTeamGender:
      byTeamGender,

    byShiftGender:
      byShiftGender,

    byTeamShiftGender:
      byTeamShiftGender
  };
}


function incrementObject_(
  obj,
  key
) {

  if (!obj[key]) {
    obj[key] = 0;
  }

  obj[key]++;
}


/* =========================================================
   SHIFT CALCULATION
========================================================= */

function getShiftForEmployeeDate_(
  employeeId,
  date
) {

  const employee =
    getEmployees_()
      .find(
        e =>
          e.employeeId ===
          employeeId
      );


  if (!employee) {

    return {

      shift:
        'UNSET',

      source:
        'NONE'
    };
  }


  const setMap = {};


  getShiftSets_()
    .forEach(
      set => {

        setMap[
          set.setId
        ] = set;
      }
    );


  return calculateEmployeeShift_(
    employee,
    date,
    setMap,
    getAssignments_(),
    getOverrideMap_(
      date,
      date
    )
  );
}


/**
 * หา TEAM assignment ที่มีผลจริงของพนักงาน ณ วันที่นั้น
 * ไม่สน POSITION/EMPLOYEE priority
 */
function resolveTeamAssignmentForEmployee_(
  employee,
  date,
  assignments
) {

  return assignments
    .filter(
      item => {

        if (
          String(
            item.active || 'TRUE'
          ).toUpperCase() === 'FALSE'
        ) {
          return false;
        }


        if (
          String(
            item.scopeType || ''
          ).toUpperCase() !== 'TEAM'
        ) {
          return false;
        }


        if (
          String(
            item.scopeValue || ''
          ).trim() !==
          String(
            employee.team || ''
          ).trim()
        ) {
          return false;
        }


        const startDate =
          String(
            item.startDate || ''
          ).trim();


        return (
          !!startDate &&
          startDate <= date
        );
      }
    )
    .sort(
      (a, b) => {

        const byDate =
          String(
            b.startDate || ''
          ).localeCompare(
            String(
              a.startDate || ''
            )
          );


        if (byDate) {
          return byDate;
        }


        return String(
          b.createdAt || ''
        ).localeCompare(
          String(
            a.createdAt || ''
          )
        );
      }
    )[0] || null;
}


/**
 * คำนวณสถานะของ 1 assignment จาก Cycle ของมันเอง
 */
function calculateAssignmentCycleState_(
  date,
  assignment,
  set
) {

  const cycleStartDate =
    String(
      assignment.cycleStartDate ||
      assignment.startDate ||
      ''
    ).trim();


  if (!cycleStartDate) {

    return {
      shift: 'UNSET',
      cycleIndex: 0,
      dayInCycle: -1
    };
  }


  const diff =
    dayDiff_(
      cycleStartDate,
      date
    );


  if (diff < 0) {

    return {
      shift: 'UNSET',
      cycleIndex: 0,
      dayInCycle: -1
    };
  }


  const workDays =
    Math.max(
      1,
      Number(
        set.workDays || 10
      )
    );


  const offDays =
    Math.max(
      0,
      Number(
        set.offDays || 5
      )
    );


  const cycleLength =
    Math.max(
      1,
      workDays + offDays
    );


  const cycleIndex =
    Math.floor(
      diff /
      cycleLength
    );


  const dayInCycle =
    diff %
    cycleLength;


  if (
    dayInCycle >= workDays
  ) {

    return {
      shift: 'OFF',
      cycleIndex,
      dayInCycle
    };
  }


  const baseShift =
    String(
      assignment.startShift ||
      set.startShift ||
      'MORNING'
    )
    .trim()
    .toUpperCase();


  let shift =
    baseShift;


  if (set.alternate) {

    if (
      cycleIndex % 2 === 1
    ) {

      shift =
        baseShift === 'MORNING'
          ? 'NIGHT'
          : 'MORNING';
    }

  } else {

    shift =
      String(
        set.fixedShift ||
        baseShift
      )
      .trim()
      .toUpperCase();
  }


  return {
    shift,
    cycleIndex,
    dayInCycle
  };
}


function calculateEmployeeShift_(
  employee,
  date,
  setMap,
  assignments,
  overrideMap
) {

  /*
   * 1) แก้กะรายบุคคลรายวัน สำคัญที่สุด
   */
  const overrideKey =
    employee.employeeId +
    '|' +
    date;


  const overrideRow =
    overrideMap &&
    overrideMap[
      overrideKey
    ]
      ? overrideMap[
          overrideKey
        ]
      : null;


  const overrideShift =
    String(
      overrideRow?.shift || ''
    )
    .trim()
    .toUpperCase();


  if (
    [
      'MORNING',
      'NIGHT',
      'OFF',
      'UNSET'
    ].includes(
      overrideShift
    )
  ) {

    return {
      shift:
        overrideShift,

      source:
        'OVERRIDE',

      setName:
        'แก้กะรายบุคคล'
    };
  }


  /*
   * 2) หา Assignment ที่มี priority สูงสุด
   * EMPLOYEE > POSITION+TEAM > POSITION > TEAM
   */
  const assignment =
    resolveAssignment_(
      employee,
      date,
      assignments
    );


  if (!assignment) {

    return {
      shift:
        'UNSET',

      source:
        'NONE',

      setName:
        ''
    };
  }


  const set =
    setMap[
      assignment.setId
    ];


  if (!set) {

    return {
      shift:
        'UNSET',

      source:
        'NONE',

      setName:
        ''
    };
  }


  /*
   * =====================================================
   * POSITION
   *
   * ตำแหน่ง "ไม่มีสิทธิ์สร้างวันหยุดคนละรอบกับ TEAM"
   *
   * ต้องอ่านวันทำงาน/หยุดจาก TEAM ก่อนเสมอ
   *
   * ตัวอย่าง:
   * TEAM B = หยุดวันที่ 31
   * การตลาด TEAM B = เช้าคงที่
   *
   * 31 ต้อง "หยุด"
   * ไม่ใช่เช้า
   *
   * ส่วนวันที่ TEAM B ทำงาน:
   * การตลาดสามารถเป็นเช้าคงที่ได้ตามเซตตำแหน่ง
   * =====================================================
   */
  if (
    String(
      assignment.scopeType || ''
    ).toUpperCase() ===
    'POSITION'
  ) {

    const teamAssignment =
      resolveTeamAssignmentForEmployee_(
        employee,
        date,
        assignments
      );


    if (teamAssignment) {

      const teamSet =
        setMap[
          teamAssignment.setId
        ];


      if (teamSet) {

        const teamState =
          calculateAssignmentCycleState_(
            date,
            teamAssignment,
            teamSet
          );


        /*
         * TEAM เป็นเจ้าของ "ทำงาน/หยุด"
         */
        if (
          teamState.shift === 'OFF'
        ) {

          return {
            shift:
              'OFF',

            source:
              'POSITION_TEAM_CYCLE',

            setName:
              set.setName
          };
        }


        if (
          teamState.shift === 'UNSET'
        ) {

          return {
            shift:
              'UNSET',

            source:
              'POSITION_TEAM_CYCLE',

            setName:
              set.setName
          };
        }


        /*
         * วันนี้ TEAM ทำงาน
         * ใช้เซต POSITION กำหนดเฉพาะ "เช้า/ดึก"
         *
         * ถ้า POSITION เป็นสลับกะ
         * ให้สลับตามรอบของ TEAM ไม่ใช่สร้าง Cycle ใหม่
         */
        const baseShift =
          String(
            assignment.startShift ||
            set.startShift ||
            'MORNING'
          )
          .trim()
          .toUpperCase();


        let positionShift =
          baseShift;


        if (set.alternate) {

          if (
            teamState.cycleIndex %
            2 === 1
          ) {

            positionShift =
              baseShift === 'MORNING'
                ? 'NIGHT'
                : 'MORNING';
          }

        } else {

          positionShift =
            String(
              set.fixedShift ||
              baseShift
            )
            .trim()
            .toUpperCase();
        }


        return {
          shift:
            positionShift,

          source:
            assignment.teamFilter
              ? 'POSITION_TEAM'
              : 'POSITION',

          setName:
            set.setName
        };
      }
    }
  }


  /*
   * 3) TEAM / EMPLOYEE
   * ใช้ Cycle ของ Assignment ตัวเองตามปกติ
   */
  const state =
    calculateAssignmentCycleState_(
      date,
      assignment,
      set
    );


  return {
    shift:
      state.shift,

    source:
      assignment.scopeType,

    setName:
      set.setName
  };
}


/**
 * จุดอ้างอิง Cycle:
 * TEAM เป็นเจ้าของรอบทำงาน/หยุด
 * POSITION/EMPLOYEE ที่ใช้ work/off เท่ากัน จะเกาะ Cycle ของ TEAM
 */
function resolveCycleStartDate_(
  employee,
  date,
  assignment,
  set,
  assignments,
  setMap
) {

  /*
   * กติกา Cycle ที่ถูกต้อง:
   *
   * TEAM
   * = ใช้วันที่เริ่มของ TEAM เป็น Anchor ของ 10/5 โดยตรง
   *
   * POSITION / EMPLOYEE
   * = ถ้าใช้จำนวนวันทำงาน/วันหยุดเท่ากับ TEAM
   *   ให้ "เกาะ Cycle ของ TEAM"
   *   เพื่อให้วันทำงาน/วันหยุดตรงกับ TEAM นั้น
   *
   * ตัวอย่าง:
   * TEAM B อยู่ Cycle ของ B
   * การตลาด TEAM B ตั้งเป็น "เช้าคงที่"
   *
   * ผล:
   * - วันทำงาน/หยุด ต้องตรงกับ TEAM B
   * - แต่ในวันทำงาน การตลาดยังเป็นกะเช้าตามเซตตำแหน่ง
   *
   * รอบ 26-25 เป็นเพียงกรอบแสดงผล ไม่มีผลกับ Cycle
   */

  const ownCycleStart =
    String(
      assignment.cycleStartDate ||
      assignment.startDate ||
      ''
    ).trim();


  if (
    String(
      assignment.scopeType || ''
    ).toUpperCase() ===
    'TEAM'
  ) {

    return ownCycleStart;
  }


  const assignmentWorkDays =
    Math.max(
      1,
      Number(
        set?.workDays || 10
      )
    );


  const assignmentOffDays =
    Math.max(
      0,
      Number(
        set?.offDays || 5
      )
    );


  /*
   * หา TEAM assignment ของพนักงานคนนี้โดยตรง
   * ไม่ใช้ resolveAssignment_ เพราะ POSITION/EMPLOYEE
   * มี priority สูงกว่า TEAM
   */
  const teamAssignment =
    assignments
      .filter(
        item => {

          if (
            String(
              item.active || 'TRUE'
            ).toUpperCase() ===
            'FALSE'
          ) {
            return false;
          }


          if (
            String(
              item.scopeType || ''
            ).toUpperCase() !==
            'TEAM'
          ) {
            return false;
          }


          if (
            String(
              item.scopeValue || ''
            ).trim() !==
            String(
              employee.team || ''
            ).trim()
          ) {
            return false;
          }


          const startDate =
            String(
              item.startDate || ''
            ).trim();


          return (
            !!startDate &&
            startDate <= date
          );
        }
      )
      .sort(
        (a, b) => {

          const dateCompare =
            String(
              b.startDate || ''
            ).localeCompare(
              String(
                a.startDate || ''
              )
            );


          if (
            dateCompare !== 0
          ) {
            return dateCompare;
          }


          return String(
            b.createdAt || ''
          ).localeCompare(
            String(
              a.createdAt || ''
            )
          );
        }
      )[0];


  if (!teamAssignment) {

    return ownCycleStart;
  }


  const teamSet =
    setMap[
      teamAssignment.setId
    ];


  if (!teamSet) {

    return ownCycleStart;
  }


  const teamWorkDays =
    Math.max(
      1,
      Number(
        teamSet.workDays || 10
      )
    );


  const teamOffDays =
    Math.max(
      0,
      Number(
        teamSet.offDays || 5
      )
    );


  /*
   * เกาะ Cycle ของ TEAM เฉพาะเมื่อโครง work/off เท่ากัน
   * เช่น 10/5 กับ 10/5
   */
  if (
    assignmentWorkDays ===
      teamWorkDays &&
    assignmentOffDays ===
      teamOffDays
  ) {

    return String(
      teamAssignment.cycleStartDate ||
      teamAssignment.startDate ||
      ownCycleStart
    ).trim();
  }


  /*
   * ถ้าตำแหน่งใช้ Cycle คนละแบบ เช่น 8/2
   * ให้ใช้ Anchor ของตัวเอง
   */
  return ownCycleStart;
}


function resolveAssignment_(
  employee,
  date,
  assignments
) {

  const matches =
    assignments.filter(
      assignment => {

        if (
          String(
            assignment.active ||
            'TRUE'
          ).toUpperCase() ===
          'FALSE'
        ) {

          return false;
        }


        if (
          !assignment.startDate ||
          assignment.startDate >
          date
        ) {

          return false;
        }


        if (
          assignment.scopeType ===
          'EMPLOYEE'
        ) {

          return (
            assignment.scopeValue ===
            employee.employeeId
          );
        }


        if (
          assignment.scopeType ===
          'POSITION'
        ) {

          if (
            assignment.scopeValue !==
            employee.position
          ) {

            return false;
          }


          /*
           * POSITION แบบระบุ TEAM
           * ใช้เฉพาะ TEAM นั้นเท่านั้น
           */
          if (
            assignment.teamFilter &&
            assignment.teamFilter !==
            employee.team
          ) {

            return false;
          }


          return true;
        }


        if (
          assignment.scopeType ===
          'TEAM'
        ) {

          return (
            assignment.scopeValue ===
            employee.team
          );
        }


        return false;
      }
    );


  if (!matches.length) {
    return null;
  }


  /*
   * Priority:
   *
   * 400 = EMPLOYEE
   * 300 = POSITION ที่ระบุ TEAM
   * 250 = POSITION ทุก TEAM
   * 100 = TEAM
   *
   * ดังนั้น:
   * "การตลาด + TEAM B"
   * จะไม่ถูก "การตลาดทุก TEAM" หรือ TEAM A มาทับ
   */
  function assignmentPriority_(
    assignment
  ) {

    if (
      assignment.scopeType ===
      'EMPLOYEE'
    ) {

      return 400;
    }


    if (
      assignment.scopeType ===
      'POSITION'
    ) {

      return assignment.teamFilter
        ? 300
        : 250;
    }


    if (
      assignment.scopeType ===
      'TEAM'
    ) {

      return 100;
    }


    return 0;
  }


  matches.sort(
    (a, b) => {

      const priorityCompare =
        assignmentPriority_(
          b
        ) -
        assignmentPriority_(
          a
        );


      if (
        priorityCompare !== 0
      ) {

        return priorityCompare;
      }


      const dateCompare =
        String(
          b.startDate || ''
        ).localeCompare(
          String(
            a.startDate || ''
          )
        );


      if (
        dateCompare !== 0
      ) {

        return dateCompare;
      }


      return String(
        b.createdAt || ''
      ).localeCompare(
        String(
          a.createdAt || ''
        )
      );
    }
  );


  return matches[0];
}


/* =========================================================
   OVERRIDES
========================================================= */

function getOverrideMap_(
  from,
  to
) {

  const map = {};


  getSheetObjects_(
    APP.SHEETS.OVERRIDES
  )
  .forEach(
    row => {

      if (
        row.date >= from &&
        row.date <= to
      ) {

        map[
          row.employeeId +
          '|' +
          row.date
        ] = row;
      }
    }
  );


  return map;
}


/* =========================================================
   SHEET HELPERS
========================================================= */

function getSheetObjects_(
  sheetName
) {

  const sheet =
    getDatabase_()
      .getSheetByName(
        sheetName
      );


  if (!sheet) {
    return [];
  }


  const values =
    sheet
      .getDataRange()
      .getDisplayValues();


  if (
    values.length <= 1
  ) {
    return [];
  }


  const headers =
    values[0];


  return values
    .slice(1)
    .filter(
      row =>
        row.some(
          value =>
            String(value)
              .trim() !== ''
        )
    )
    .map(
      row => {

        const obj = {};


        headers.forEach(
          (header, index) => {

            obj[header] =
              row[index] !==
              undefined
                ? row[index]
                : '';
          }
        );


        return obj;
      }
    );
}


/* =========================================================
   DATE HELPERS
========================================================= */

function todayText_() {

  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


function nowText_() {

  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
}


function parseDate_(
  text
) {

  const parts =
    String(text)
      .split('-')
      .map(Number);


  return new Date(
    parts[0],
    parts[1] - 1,
    parts[2],
    12,
    0,
    0
  );
}


function formatDate_(
  date
) {

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


function dayDiff_(
  from,
  to
) {

  const a =
    String(from)
      .split('-')
      .map(Number);


  const b =
    String(to)
      .split('-')
      .map(Number);


  const utcA =
    Date.UTC(
      a[0],
      a[1] - 1,
      a[2]
    );


  const utcB =
    Date.UTC(
      b[0],
      b[1] - 1,
      b[2]
    );


  return Math.round(
    (utcB - utcA) /
    86400000
  );
}


function createDateRange_(
  from,
  to,
  maxDays
) {

  const start =
    parseDate_(from);

  const end =
    parseDate_(to);

  const result = [];

  let date =
    new Date(start);


  while (
    date <= end &&
    result.length <
    maxDays
  ) {

    result.push(
      formatDate_(date)
    );


    date.setDate(
      date.getDate() + 1
    );
  }


  return result;
}


function getRoundRange_(
  dateText
) {

  const date =
    parseDate_(
      dateText
    );


  const year =
    date.getFullYear();

  const month =
    date.getMonth();

  const day =
    date.getDate();


  let from;
  let to;


  if (
    day >= 26
  ) {

    from =
      new Date(
        year,
        month,
        26,
        12
      );


    to =
      new Date(
        year,
        month + 1,
        25,
        12
      );

  } else {

    from =
      new Date(
        year,
        month - 1,
        26,
        12
      );


    to =
      new Date(
        year,
        month,
        25,
        12
      );
  }


  return {

    from:
      formatDate_(from),

    to:
      formatDate_(to)
  };
}