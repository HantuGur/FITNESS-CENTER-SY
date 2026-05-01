/* ===============================
   BACKEND SISTEM ADMIN GYM
   Google Apps Script + Google Sheet
   =============================== */

// PENTING:
// Isi cuma ID spreadsheet, jangan pakai /edit?gid=...
// Contoh link sheet:
// https://docs.google.com/spreadsheets/d/1ABCDEFxxxx/edit
// Yang dipakai cuma: 1ABCDEFxxxx
const SPREADSHEET_ID = 'PASTE_GOOGLE_SHEET_ID_HERE';

const MAX_KEY_NUMBER = 100;

const SHEET_LOG = 'LOG_GYM';
const SHEET_KEYS = 'DATA_KUNCI';
const SHEET_MEMBERS = 'MEMBER_LIFETIME';

const LOG_HEADERS = [
  'No',
  'Waktu Lengkap',
  'Tanggal',
  'Jam',
  'Nama',
  'No Kunci',
  'Status',
  'Admin'
];

const KEY_HEADERS = [
  'No Kunci',
  'Status',
  'Dipakai Oleh',
  'Jam Masuk',
  'Update Terakhir'
];

const MEMBER_HEADERS = [
  'No',
  'Nama Member',
  'Status',
  'Tanggal Daftar',
  'Diinput Oleh',
  'Update Terakhir'
];

function setupGymSheets() {
  const ss = getSpreadsheet_();

  const logSheet = getOrCreateSheet_(ss, SHEET_LOG);
  const keySheet = getOrCreateSheet_(ss, SHEET_KEYS);
  const memberSheet = getOrCreateSheet_(ss, SHEET_MEMBERS);

  setupHeader_(logSheet, LOG_HEADERS);
  setupHeader_(keySheet, KEY_HEADERS);
  setupHeader_(memberSheet, MEMBER_HEADERS);
  seedKeys_(keySheet, MAX_KEY_NUMBER);

  logSheet.setFrozenRows(1);
  keySheet.setFrozenRows(1);
  memberSheet.setFrozenRows(1);

  autoResize_(logSheet, LOG_HEADERS.length);
  autoResize_(keySheet, KEY_HEADERS.length);
  autoResize_(memberSheet, MEMBER_HEADERS.length);

  return 'Setup selesai. Sheet LOG_GYM, DATA_KUNCI, dan MEMBER_LIFETIME siap dipakai.';
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};

  try {
    ensureReady_();

    const action = String(params.action || 'ping').trim().toLowerCase();

    if (action === 'ping') {
      return respondJson_(params.callback, {
        ok: true,
        message: 'Backend Sistem Admin Gym aktif.',
        data: {
          app: 'Sistem Admin Gym',
          serverTime: formatDateTime_(new Date())
        }
      });
    }

    if (action === 'keys') {
      return respondJson_(params.callback, {
        ok: true,
        message: 'Data kunci berhasil diambil.',
        data: getKeys_()
      });
    }

    if (action === 'members') {
      return respondJson_(params.callback, {
        ok: true,
        message: 'Data member lifetime berhasil diambil.',
        data: getMembers_()
      });
    }

    if (action === 'logs') {
      return respondJson_(params.callback, {
        ok: true,
        message: 'Data audit berhasil diambil.',
        data: getLogs_()
      });
    }

    return respondJson_(params.callback, {
      ok: false,
      message: 'Action tidak dikenal: ' + action
    });
  } catch (error) {
    return respondJson_(params.callback, {
      ok: false,
      message: error.message || String(error)
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(10000);
    locked = true;

    ensureReady_();

    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || '').trim();

    if (action !== 'saveLog') {
      throw new Error('Action tidak dikenal.');
    }

    const payload = normalizePayload_(params);

    const ss = getSpreadsheet_();
    const logSheet = getOrCreateSheet_(ss, SHEET_LOG);
    const keySheet = getOrCreateSheet_(ss, SHEET_KEYS);

    setupHeader_(logSheet, LOG_HEADERS);
    setupHeader_(keySheet, KEY_HEADERS);
    seedKeys_(keySheet, MAX_KEY_NUMBER);

    const currentKey = getKeyRecord_(keySheet, payload.keyNumber);

    if (payload.status === 'Masuk' && currentKey.status === 'Dipakai') {
      throw new Error(
        'Kunci ' + payload.keyNumber + ' sedang dipakai oleh ' + (currentKey.customerName || 'pelanggan lain') + '.'
      );
    }

    appendLog_(logSheet, payload);
    updateKey_(keySheet, payload);

    return respondPostMessage_({
      ok: true,
      message: 'Data ' + payload.status.toLowerCase() + ' berhasil disimpan untuk kunci ' + payload.keyNumber + '.'
    });
  } catch (error) {
    return respondPostMessage_({
      ok: false,
      message: error.message || String(error)
    });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function ensureReady_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PASTE_GOOGLE_SHEET_ID_HERE') {
    throw new Error('SPREADSHEET_ID belum diisi di Code.gs.');
  }

  if (String(SPREADSHEET_ID).includes('/edit')) {
    throw new Error('SPREADSHEET_ID salah. Isi cuma ID spreadsheet, bukan link full.');
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  return sheet;
}

function setupHeader_(sheet, headers) {
  const lastCol = Math.max(sheet.getLastColumn(), headers.length);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sheet, headers.length);
    return;
  }

  const current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const rowEmpty = current.every(function (value) {
    return String(value || '').trim() === '';
  });

  if (rowEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sheet, headers.length);
  }
}

function styleHeader_(sheet, length) {
  sheet.getRange(1, 1, 1, length)
    .setFontWeight('bold')
    .setBackground('#eaf1ff')
    .setFontColor('#111827');
}

function seedKeys_(sheet, maxKey) {
  const existingKeys = new Set();
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    values.forEach(function (row) {
      const key = normalizeKeyNumber_(row[0]);
      if (key) existingKeys.add(key);
    });
  }

  const rows = [];

  for (let i = 1; i <= maxKey; i++) {
    const key = String(i).padStart(2, '0');

    if (!existingKeys.has(key)) {
      rows.push([key, 'Kosong', '', '', '']);
    }
  }

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, KEY_HEADERS.length).setValues(rows);
  }
}

function normalizePayload_(params) {
  const admin = cleanText_(params.admin);
  const customerName = cleanText_(params.customerName || params.nama || params.namaPelanggan);
  const keyNumber = normalizeKeyNumber_(params.keyNumber || params.noKunci || params.nomorKunci);
  const status = normalizeStatus_(params.status);

  if (!admin) throw new Error('Nama admin/pegawai wajib diisi.');
  if (!customerName) throw new Error('Nama pelanggan wajib diisi.');
  if (!keyNumber) throw new Error('Nomor kunci wajib diisi.');
  if (!status) throw new Error('Status tidak valid.');

  return {
    admin: admin,
    customerName: customerName,
    keyNumber: keyNumber,
    status: status,
    timestamp: new Date()
  };
}

function cleanText_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeKeyNumber_(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  const number = Number(raw);

  if (!Number.isFinite(number) || number <= 0) return '';

  return String(Math.floor(number)).padStart(2, '0');
}

function normalizeStatus_(value) {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'masuk') return 'Masuk';
  if (raw === 'keluar') return 'Keluar';

  return '';
}

function appendLog_(sheet, payload) {
  const timestamp = payload.timestamp || new Date();
  const no = Math.max(sheet.getLastRow(), 1);

  sheet.appendRow([
    no,
    timestamp,
    formatDate_(timestamp),
    formatTime_(timestamp),
    payload.customerName,
    payload.keyNumber,
    payload.status,
    payload.admin
  ]);
}

function updateKey_(sheet, payload) {
  const record = getKeyRecord_(sheet, payload.keyNumber);
  const rowIndex = record.rowIndex || appendKeyRow_(sheet, payload.keyNumber);
  const nowText = formatDateTime_(new Date());

  if (payload.status === 'Masuk') {
    sheet.getRange(rowIndex, 1, 1, KEY_HEADERS.length).setValues([[
      payload.keyNumber,
      'Dipakai',
      payload.customerName,
      formatDateTime_(payload.timestamp || new Date()),
      nowText
    ]]);
  } else {
    sheet.getRange(rowIndex, 1, 1, KEY_HEADERS.length).setValues([[
      payload.keyNumber,
      'Kosong',
      '',
      '',
      nowText
    ]]);
  }
}

function appendKeyRow_(sheet, keyNumber) {
  const rowIndex = sheet.getLastRow() + 1;

  sheet.getRange(rowIndex, 1, 1, KEY_HEADERS.length).setValues([[
    keyNumber,
    'Kosong',
    '',
    '',
    ''
  ]]);

  return rowIndex;
}

function getKeyRecord_(sheet, keyNumber) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      rowIndex: null,
      keyNumber: keyNumber,
      status: 'Kosong',
      customerName: '',
      checkInTime: '',
      updatedAt: ''
    };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, KEY_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowKey = normalizeKeyNumber_(row[0]);

    if (rowKey === keyNumber) {
      return {
        rowIndex: i + 2,
        keyNumber: rowKey,
        status: cleanText_(row[1]) || 'Kosong',
        customerName: cleanText_(row[2]),
        checkInTime: stringifyCell_(row[3]),
        updatedAt: stringifyCell_(row[4])
      };
    }
  }

  return {
    rowIndex: null,
    keyNumber: keyNumber,
    status: 'Kosong',
    customerName: '',
    checkInTime: '',
    updatedAt: ''
  };
}

function getKeys_() {
  const ss = getSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, SHEET_KEYS);

  setupHeader_(sheet, KEY_HEADERS);
  seedKeys_(sheet, MAX_KEY_NUMBER);

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, KEY_HEADERS.length).getValues();

  return values
    .filter(function (row) {
      return cleanText_(row[0]);
    })
    .map(function (row) {
      return {
        keyNumber: normalizeKeyNumber_(row[0]),
        status: cleanText_(row[1]) || 'Kosong',
        customerName: cleanText_(row[2]),
        checkInTime: stringifyCell_(row[3]),
        updatedAt: stringifyCell_(row[4])
      };
    });
}

function getMembers_() {
  const ss = getSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, SHEET_MEMBERS);

  setupHeader_(sheet, MEMBER_HEADERS);

  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), MEMBER_HEADERS.length);

  if (lastRow < 2) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(cleanHeader_);
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const idx = {
    memberId: findHeaderIndex_(headers, ['no', 'id member', 'id', 'no member', 'nomor member', 'kode member']),
    memberName: findHeaderIndex_(headers, ['nama member', 'nama', 'name', 'member']),
    status: findHeaderIndex_(headers, ['status', 'status member', 'tipe member']),
    registeredAt: findHeaderIndex_(headers, ['tanggal daftar', 'tanggal', 'join date', 'mulai member', 'tanggal mulai']),
    createdBy: findHeaderIndex_(headers, ['diinput oleh', 'admin', 'input oleh', 'pegawai']),
    updatedAt: findHeaderIndex_(headers, ['update terakhir', 'updated at', 'last update', 'terakhir update'])
  };

  return values
    .map(function (row, index) {
      const fallbackNo = String(index + 1).padStart(3, '0');
      const memberId = getRowValue_(row, idx.memberId) || fallbackNo;
      const memberName = getRowValue_(row, idx.memberName);

      return {
        memberId: memberId,
        memberName: memberName,
        status: getRowValue_(row, idx.status) || 'Lifetime',
        registeredAt: stringifyCell_(getRawRowValue_(row, idx.registeredAt)),
        createdBy: getRowValue_(row, idx.createdBy),
        updatedAt: stringifyCell_(getRawRowValue_(row, idx.updatedAt))
      };
    })
    .filter(function (item) {
      return item.memberName || item.memberId;
    });
}

function getLogs_() {
  const ss = getSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, SHEET_LOG);

  setupHeader_(sheet, LOG_HEADERS);

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const numberOfRows = Math.min(lastRow - 1, 50);
  const startRow = Math.max(2, lastRow - numberOfRows + 1);
  const values = sheet.getRange(startRow, 1, numberOfRows, LOG_HEADERS.length).getValues();

  return values
    .map(function (row) {
      return {
        no: row[0],
        waktuLengkap: stringifyCell_(row[1]),
        tanggal: stringifyCell_(row[2]),
        jam: stringifyCell_(row[3]),
        nama: cleanText_(row[4]),
        noKunci: normalizeKeyNumber_(row[5]) || cleanText_(row[5]),
        status: cleanText_(row[6]),
        admin: cleanText_(row[7])
      };
    })
    .filter(function (item) {
      return item.nama || item.noKunci || item.status;
    })
    .reverse();
}

function cleanHeader_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findHeaderIndex_(headers, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const index = headers.indexOf(aliases[i]);
    if (index !== -1) return index;
  }

  return -1;
}

function getRawRowValue_(row, index) {
  return index >= 0 ? row[index] : '';
}

function getRowValue_(row, index) {
  return cleanText_(getRawRowValue_(row, index));
}

function stringifyCell_(value) {
  if (value instanceof Date) {
    return formatDateTime_(value);
  }

  return cleanText_(value);
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function formatTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm:ss');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
}

function autoResize_(sheet, length) {
  for (let i = 1; i <= length; i++) {
    sheet.autoResizeColumn(i);
  }
}

function respondJson_(callback, payload) {
  const json = JSON.stringify(payload);

  if (callback) {
    const safeCallback = String(callback).replace(/[^a-zA-Z0-9_.$]/g, '');

    return ContentService
      .createTextOutput(safeCallback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function respondPostMessage_(payload) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');

  const html = '<!doctype html><html><body><script>' +
    'window.parent.postMessage({source:"sistem-gym-backend",payload:' + safeJson + '},"*");' +
    '</script></body></html>';

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
