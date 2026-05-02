/* ===============================
   BACKEND SISTEM ADMIN GYM
   Google Apps Script + Google Sheet
   =============================== */

// ===============================
// 1. SETTING UTAMA
// ===============================

// Sheet utama sistem lu: LOG_GYM, DATA_KUNCI, REKAP_HARIAN, dll.
// Isi cuma ID Google Sheet, bukan link full.
const SPREADSHEET_ID = '1J4YOaOLhwZ2fb4CpWUSMct8TnGX6oxfU5EO5tyG3AZw';

// Sheet rekap member dari team lain.
// Ambil ID dari link Google Sheet team lu.
// Contoh link:
// https://docs.google.com/spreadsheets/d/1ABCDEFxxxx/edit
// ID-nya cuma:
// 1ABCDEFxxxx
const MEMBER_SOURCE_SPREADSHEET_ID = 'AKfycbw5oijMr6Ce4EUL1yvsyCMZG5I7ILXgMOdegk6MQVU93-BdERZklfIouXJv0U6Ng4MN';

// Kalau sheet member team masih sama dengan sheet utama, kosongin aja:
// const MEMBER_SOURCE_SPREADSHEET_ID = '';

const TIMEZONE = 'Asia/Jakarta';

const MAX_KEY_NUMBER = 100;
const MEMBER_SOURCE_MAX_ROWS = 800;

const SHEET_LOG = 'LOG_GYM';
const SHEET_KEYS = 'DATA_KUNCI';
const SHEET_MEMBERS = 'MEMBER_LIFETIME';
const SHEET_DAILY = 'REKAP_HARIAN';

const INTERNAL_SHEET_NAMES = [
  SHEET_LOG,
  SHEET_KEYS,
  SHEET_MEMBERS,
  SHEET_DAILY,
  'DASHBOARD',
  'README_SETUP'
];

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

const DAILY_HEADERS = [
  'Tanggal',
  'No',
  'Nama',
  'No Kunci',
  'Jam Masuk',
  'Waktu Masuk Lengkap',
  'Admin Masuk',
  'Jam Keluar',
  'Sudah Keluar',
  'Waktu Keluar Lengkap',
  'Admin Keluar'
];

// ===============================
// 2. SETUP SHEET
// ===============================

function setupGymSheets() {
  const ss = getSpreadsheet_();

  const logSheet = getOrCreateSheet_(ss, SHEET_LOG);
  const keySheet = getOrCreateSheet_(ss, SHEET_KEYS);
  const memberSheet = getOrCreateSheet_(ss, SHEET_MEMBERS);
  const dailySheet = getOrCreateSheet_(ss, SHEET_DAILY);

  setupHeader_(logSheet, LOG_HEADERS);
  setupHeader_(keySheet, KEY_HEADERS);
  setupHeader_(memberSheet, MEMBER_HEADERS);
  setupDailyHeader_(dailySheet);

  seedKeys_(keySheet, MAX_KEY_NUMBER);
  setupDailyCheckboxes_(dailySheet);

  logSheet.setFrozenRows(1);
  keySheet.setFrozenRows(1);
  memberSheet.setFrozenRows(1);
  dailySheet.setFrozenRows(1);

  autoResize_(logSheet, LOG_HEADERS.length);
  autoResize_(keySheet, KEY_HEADERS.length);
  autoResize_(memberSheet, MEMBER_HEADERS.length);
  autoResize_(dailySheet, DAILY_HEADERS.length);

  return 'Setup selesai. Sheet LOG_GYM, DATA_KUNCI, MEMBER_LIFETIME, dan REKAP_HARIAN siap dipakai.';
}

// ===============================
// 3. API GET
// ===============================

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
        message: 'Data member / visit dari sheet team berhasil diambil.',
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

    if (action === 'daily') {
      return respondJson_(params.callback, {
        ok: true,
        message: 'Data rekap harian berhasil diambil.',
        data: getDailyRecap_()
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

// ===============================
// 4. API POST
// ===============================

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
    const dailySheet = getOrCreateSheet_(ss, SHEET_DAILY);

    setupHeader_(logSheet, LOG_HEADERS);
    setupHeader_(keySheet, KEY_HEADERS);
    setupDailyHeader_(dailySheet);

    seedKeys_(keySheet, MAX_KEY_NUMBER);
    setupDailyCheckboxes_(dailySheet);

    const currentKey = getKeyRecord_(keySheet, payload.keyNumber);

    if (payload.status === 'Masuk' && currentKey.status === 'Dipakai') {
      throw new Error(
        'Kunci ' + payload.keyNumber + ' sedang dipakai oleh ' + (currentKey.customerName || 'pelanggan lain') + '.'
      );
    }

    appendLog_(logSheet, payload);
    updateDailyRecap_(dailySheet, payload);
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

// ===============================
// 5. VALIDASI DAN SPREADSHEET
// ===============================

function ensureReady_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PASTE_GOOGLE_SHEET_ID_HERE') {
    throw new Error('SPREADSHEET_ID belum diisi di Code.gs.');
  }

  if (
    String(SPREADSHEET_ID).includes('/edit') ||
    String(SPREADSHEET_ID).includes('docs.google.com') ||
    String(SPREADSHEET_ID).includes('script.google.com')
  ) {
    throw new Error('SPREADSHEET_ID salah. Isi cuma ID Google Sheet, bukan link full dan bukan URL Apps Script.');
  }

  if (
    MEMBER_SOURCE_SPREADSHEET_ID &&
    MEMBER_SOURCE_SPREADSHEET_ID !== 'PASTE_ID_SPREADSHEET_TEAM_DI_SINI' &&
    (
      String(MEMBER_SOURCE_SPREADSHEET_ID).includes('/edit') ||
      String(MEMBER_SOURCE_SPREADSHEET_ID).includes('docs.google.com') ||
      String(MEMBER_SOURCE_SPREADSHEET_ID).includes('script.google.com')
    )
  ) {
    throw new Error('MEMBER_SOURCE_SPREADSHEET_ID salah. Isi cuma ID Google Sheet team, bukan link full.');
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getMemberSpreadsheet_() {
  if (
    MEMBER_SOURCE_SPREADSHEET_ID &&
    MEMBER_SOURCE_SPREADSHEET_ID !== 'PASTE_ID_SPREADSHEET_TEAM_DI_SINI'
  ) {
    return SpreadsheetApp.openById(MEMBER_SOURCE_SPREADSHEET_ID);
  }

  return getSpreadsheet_();
}

function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  return sheet;
}

// ===============================
// 6. HEADER DAN STYLE
// ===============================

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

function setupDailyHeader_(sheet) {
  sheet.getRange(1, 1, 1, DAILY_HEADERS.length).setValues([DAILY_HEADERS]);
  styleHeader_(sheet, DAILY_HEADERS.length);
  sheet.setFrozenRows(1);
}

function setupDailyCheckboxes_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  sheet.getRange(2, 9, lastRow - 1, 1).insertCheckboxes();
}

function styleHeader_(sheet, length) {
  sheet.getRange(1, 1, 1, length)
    .setFontWeight('bold')
    .setBackground('#eaf1ff')
    .setFontColor('#111827');
}

// ===============================
// 7. DATA KUNCI
// ===============================

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

// ===============================
// 8. INPUT MASUK / KELUAR
// ===============================

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

function appendLog_(sheet, payload) {
  const timestamp = payload.timestamp || new Date();
  const no = Math.max(sheet.getLastRow(), 1);

  sheet.appendRow([
    no,
    formatDateTime_(timestamp),
    formatDate_(timestamp),
    formatTime_(timestamp),
    payload.customerName,
    payload.keyNumber,
    payload.status,
    payload.admin
  ]);
}

function updateDailyRecap_(sheet, payload) {
  setupDailyHeader_(sheet);
  setupDailyCheckboxes_(sheet);

  if (payload.status === 'Masuk') {
    appendDailyCheckIn_(sheet, payload);
    return;
  }

  if (payload.status === 'Keluar') {
    markDailyCheckout_(sheet, payload);
  }
}

function appendDailyCheckIn_(sheet, payload) {
  const timestamp = payload.timestamp || new Date();

  const tanggal = formatDate_(timestamp);
  const jamMasuk = formatTime_(timestamp);
  const waktuMasukLengkap = formatDateTime_(timestamp);
  const nomorHarian = getNextDailyNumber_(sheet, tanggal);

  sheet.appendRow([
    tanggal,
    nomorHarian,
    payload.customerName,
    payload.keyNumber,
    jamMasuk,
    waktuMasukLengkap,
    payload.admin,
    '',
    false,
    '',
    ''
  ]);

  const rowIndex = sheet.getLastRow();

  sheet.getRange(rowIndex, 9).insertCheckboxes();
  sheet.getRange(rowIndex, 9).setValue(false);
}

function markDailyCheckout_(sheet, payload) {
  const timestamp = payload.timestamp || new Date();

  const tanggal = formatDate_(timestamp);
  const jamKeluar = formatTime_(timestamp);
  const waktuKeluarLengkap = formatDateTime_(timestamp);

  const rowIndex = findOpenDailyRow_(sheet, tanggal, payload.keyNumber);

  if (!rowIndex) {
    throw new Error(
      'Data masuk untuk kunci ' + payload.keyNumber + ' hari ini belum ditemukan atau sudah checkout.'
    );
  }

  sheet.getRange(rowIndex, 8).setValue(jamKeluar);
  sheet.getRange(rowIndex, 9).insertCheckboxes();
  sheet.getRange(rowIndex, 9).setValue(true);
  sheet.getRange(rowIndex, 10).setValue(waktuKeluarLengkap);
  sheet.getRange(rowIndex, 11).setValue(payload.admin);
}

function findOpenDailyRow_(sheet, tanggal, keyNumber) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, DAILY_HEADERS.length).getValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];

    const rowTanggal = stringifyCell_(row[0]);
    const rowKunci = normalizeKeyNumber_(row[3]) || cleanText_(row[3]);
    const sudahKeluar = row[8] === true;

    const sameDate = rowTanggal === tanggal;
    const sameKey = rowKunci === keyNumber;

    if (sameDate && sameKey && !sudahKeluar) {
      return i + 2;
    }
  }

  return null;
}

function getNextDailyNumber_(sheet, tanggal) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 1;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  let count = 0;

  values.forEach(function (row) {
    const rowTanggal = stringifyCell_(row[0]);

    if (rowTanggal === tanggal) {
      count++;
    }
  });

  return count + 1;
}

// ===============================
// 9. BACA MEMBER DARI SHEET TEAM
// ===============================

function getMembers_() {
  const ss = getMemberSpreadsheet_();
  const sheets = ss.getSheets();

  let result = [];

  sheets.forEach(function (sheet, sheetIndex) {
    const sheetName = sheet.getName();

    if (shouldSkipMemberSourceSheet_(sheetName)) {
      return;
    }

    const rows = readMemberRowsFromSheet_(sheet, sheetIndex);

    result = result.concat(rows);
  });

  result.sort(function (a, b) {
    if (b._sheetIndex !== a._sheetIndex) {
      return b._sheetIndex - a._sheetIndex;
    }

    return b._rowIndex - a._rowIndex;
  });

  return result
    .slice(0, MEMBER_SOURCE_MAX_ROWS)
    .map(function (item) {
      return {
        memberId: item.memberId,
        memberName: item.memberName,
        status: item.status,
        registeredAt: item.registeredAt,
        createdBy: item.createdBy,
        updatedAt: item.updatedAt,
        masaBerlaku: item.masaBerlaku,
        tanggalBerlaku: item.tanggalBerlaku,
        keterangan: item.keterangan,
        jumlah: item.jumlah,
        noKuitansi: item.noKuitansi,
        sheetName: item.sheetName
      };
    });
}

function shouldSkipMemberSourceSheet_(sheetName) {
  const cleanName = cleanText_(sheetName).toLowerCase();

  return INTERNAL_SHEET_NAMES.some(function (name) {
    return cleanText_(name).toLowerCase() === cleanName;
  });
}

function readMemberRowsFromSheet_(sheet, sheetIndex) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 2) {
    return [];
  }

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const result = [];

  let headerMap = null;
  let lastTanggal = '';

  for (let r = 0; r < values.length; r++) {
    const row = values[r];

    if (isMemberHeaderRow_(row)) {
      headerMap = buildMemberHeaderMap_(row);
      lastTanggal = '';
      continue;
    }

    if (!headerMap) {
      continue;
    }

    const rawTanggal = getByIndex_(row, headerMap.tanggal);
    const rawNama = getByIndex_(row, headerMap.nama);
    const rawNoAnggota = getByIndex_(row, headerMap.noAnggota);
    const rawMasaBerlaku = getByIndex_(row, headerMap.masaBerlaku);
    const rawTanggalBerlaku = getByIndex_(row, headerMap.tanggalBerlaku);
    const rawKeterangan = getByIndex_(row, headerMap.keterangan);
    const rawJumlah = getByIndex_(row, headerMap.jumlah);
    const rawNoKuitansi = getByIndex_(row, headerMap.noKuitansi);

    const tanggalText = stringifyDateOnly_(rawTanggal);
    const nama = cleanText_(rawNama);
    const noAnggota = cleanText_(rawNoAnggota);
    const masaBerlaku = cleanText_(rawMasaBerlaku);
    const tanggalBerlaku = stringifyCell_(rawTanggalBerlaku);
    const keterangan = cleanText_(rawKeterangan);
    const jumlah = stringifyCell_(rawJumlah);
    const noKuitansi = cleanText_(rawNoKuitansi);

    if (tanggalText) {
      lastTanggal = tanggalText;
    }

    if (!nama && !noAnggota && !masaBerlaku) {
      continue;
    }

    if (isTotalRow_(row)) {
      continue;
    }

    const memberId = noAnggota || noKuitansi || String(result.length + 1).padStart(3, '0');

    result.push({
      memberId: memberId,
      memberName: nama,
      status: masaBerlaku || 'Member',
      registeredAt: lastTanggal,
      createdBy: keterangan,
      updatedAt: tanggalBerlaku || lastTanggal,
      masaBerlaku: masaBerlaku,
      tanggalBerlaku: tanggalBerlaku,
      keterangan: keterangan,
      jumlah: jumlah,
      noKuitansi: noKuitansi,
      sheetName: sheet.getName(),
      _sheetIndex: sheetIndex,
      _rowIndex: r + 1
    });
  }

  return result;
}

function isMemberHeaderRow_(row) {
  const normalized = row.map(function (cell) {
    return cleanHeader_(cell);
  });

  const hasNama = normalized.indexOf('nama') !== -1 || normalized.indexOf('nama member') !== -1;
  const hasNoAnggota =
    normalized.indexOf('no.anggota') !== -1 ||
    normalized.indexOf('no anggota') !== -1 ||
    normalized.indexOf('noanggota') !== -1 ||
    normalized.indexOf('nomor anggota') !== -1;

  return hasNama && hasNoAnggota;
}

function buildMemberHeaderMap_(row) {
  const headers = row.map(cleanHeader_);

  return {
    tanggal: findHeaderIndex_(headers, ['tanggal']),
    nama: findHeaderIndex_(headers, ['nama', 'nama member']),
    noAnggota: findHeaderIndex_(headers, ['no.anggota', 'no anggota', 'noanggota', 'nomor anggota']),
    masaBerlaku: findHeaderIndex_(headers, ['masa berlaku']),
    tanggalBerlaku: findHeaderIndex_(headers, ['tanggal berlaku']),
    keterangan: findHeaderIndex_(headers, ['keterangan']),
    jumlah: findHeaderIndex_(headers, ['jumlah']),
    cetakKartu: findHeaderIndex_(headers, ['cetak kartu']),
    noKuitansi: findHeaderIndex_(headers, ['no. kuitansi', 'no kuitansi', 'nomor kuitansi']),
    kartuMember: findHeaderIndex_(headers, ['kartu member'])
  };
}

function isTotalRow_(row) {
  return row.some(function (cell) {
    const text = cleanText_(cell).toLowerCase();
    return text === 'total' || text === 'jumlah total';
  });
}

// ===============================
// 10. LOG DAN REKAP
// ===============================

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

function getDailyRecap_() {
  const ss = getSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, SHEET_DAILY);

  setupDailyHeader_(sheet);
  setupDailyCheckboxes_(sheet);

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const numberOfRows = Math.min(lastRow - 1, 200);
  const startRow = Math.max(2, lastRow - numberOfRows + 1);
  const values = sheet.getRange(startRow, 1, numberOfRows, DAILY_HEADERS.length).getValues();

  return values
    .map(function (row) {
      return {
        tanggal: stringifyCell_(row[0]),
        no: row[1],
        nama: cleanText_(row[2]),
        noKunci: normalizeKeyNumber_(row[3]) || cleanText_(row[3]),
        jamMasuk: stringifyCell_(row[4]),
        waktuMasukLengkap: stringifyCell_(row[5]),
        adminMasuk: cleanText_(row[6]),
        jamKeluar: stringifyCell_(row[7]),
        sudahKeluar: row[8] === true,
        waktuKeluarLengkap: stringifyCell_(row[9]),
        adminKeluar: cleanText_(row[10])
      };
    })
    .filter(function (item) {
      return item.nama || item.noKunci;
    })
    .reverse();
}

// ===============================
// 11. HELPER
// ===============================

function cleanText_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\.\s*/g, '.');
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

function findHeaderIndex_(headers, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const alias = cleanHeader_(aliases[i]);
    const index = headers.indexOf(alias);

    if (index !== -1) return index;
  }

  return -1;
}

function getByIndex_(row, index) {
  return index >= 0 ? row[index] : '';
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

function stringifyDateOnly_(value) {
  if (value instanceof Date) {
    return formatDate_(value);
  }

  return cleanText_(value);
}

function formatDate_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'dd/MM/yyyy');
}

function formatTime_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'HH:mm:ss');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}

function autoResize_(sheet, length) {
  for (let i = 1; i <= length; i++) {
    sheet.autoResizeColumn(i);
  }
}

// ===============================
// 12. RESPONSE
// ===============================

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
