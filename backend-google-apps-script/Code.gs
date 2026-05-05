const SPREADSHEET_ID = ""; 
// Kosongkan kalau Apps Script lo bound langsung ke Google Sheet.
// Kalau Apps Script standalone, isi dengan ID spreadsheet:
// const SPREADSHEET_ID = "PASTE_ID_SPREADSHEET_DI_SINI";

const APP_TITLE = "Sistem Rekap Fitness Center";

const COL = {
  TANGGAL: 1,
  NAMA: 2,
  NO_ANGGOTA: 3,
  MASA_BERLAKU: 4,
  TANGGAL_BERLAKU: 5,
  KETERANGAN: 6,
  JUMLAH: 7,
  CETAK_KARTU: 8,
  NO_KUITANSI: 9,
  MULAI_MEMBER: 10,
  EXPIRED_MEMBER: 11,
  SISA_HARI: 12,
  STATUS_MASA_AKTIF: 13,
  KETERANGAN_MASA_AKTIF: 14
};

const EXTRA_HEADERS = [
  "Mulai Member",
  "Expired Member",
  "Sisa Hari",
  "Status Masa Aktif",
  "Keterangan Masa Aktif"
];

const BULAN_INDONESIA = {
  "januari": 0,
  "februari": 1,
  "maret": 2,
  "april": 3,
  "mei": 4,
  "juni": 5,
  "juli": 6,
  "agustus": 7,
  "september": 8,
  "oktober": 9,
  "november": 10,
  "desember": 11
};

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile("index")
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  return SpreadsheetApp.getActiveSpreadsheet();
}

function normalizeDate_(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isValidDate_(date) {
  return date instanceof Date && !isNaN(date.getTime());
}

function isSameDate_(a, b) {
  const da = normalizeDate_(a);
  const db = normalizeDate_(b);

  return da.getTime() === db.getTime();
}

function formatDateKey_(date) {
  if (!date || !isValidDate_(date)) return "";

  return Utilities.formatDate(
    normalizeDate_(date),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}

function formatTanggalIndonesia_(date) {
  if (!date || !isValidDate_(date)) return "";

  const d = normalizeDate_(date);

  return d.getDate() + " " + NAMA_BULAN[d.getMonth()] + " " + d.getFullYear();
}

function parseDateFlexible_(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]") {
    const date = normalizeDate_(value);
    return isValidDate_(date) ? date : null;
  }

  const text = String(value).trim();

  if (text === "") return null;

  // Format input HTML date: yyyy-mm-dd
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const tahun = Number(isoMatch[1]);
    const bulan = Number(isoMatch[2]) - 1;
    const hari = Number(isoMatch[3]);

    return normalizeDate_(new Date(tahun, bulan, hari));
  }

  // Format Indonesia: 4 Mei 2026
  const indoMatch = text.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);
  if (indoMatch) {
    const hari = Number(indoMatch[1]);
    const bulan = BULAN_INDONESIA[indoMatch[2].toLowerCase()];
    const tahun = Number(indoMatch[3]);

    return normalizeDate_(new Date(tahun, bulan, hari));
  }

  const parsed = new Date(text);
  if (isValidDate_(parsed)) {
    return normalizeDate_(parsed);
  }

  return null;
}

function parseAllTanggalIndonesia_(text) {
  if (!text) return [];

  if (Object.prototype.toString.call(text) === "[object Date]") {
    const date = normalizeDate_(text);
    return isValidDate_(date) ? [date] : [];
  }

  const regex = /(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/gi;

  const hasil = [];
  let match;

  while ((match = regex.exec(String(text))) !== null) {
    const hari = Number(match[1]);
    const bulan = BULAN_INDONESIA[match[2].toLowerCase()];
    const tahun = Number(match[3]);

    hasil.push(normalizeDate_(new Date(tahun, bulan, hari)));
  }

  return hasil;
}

function hitungMasaAktifMember_(tanggalBerlaku) {
  const daftarTanggal = parseAllTanggalIndonesia_(tanggalBerlaku);

  if (daftarTanggal.length === 0) {
    return {
      mulaiMember: "",
      expiredMember: "",
      sisaHari: "",
      statusMasaAktif: "Tanggal Tidak Valid",
      keteranganMasaAktif: "Tanggal berlaku belum bisa dibaca"
    };
  }

  const mulaiMember = daftarTanggal[0];
  const expiredMember = daftarTanggal.length >= 2
    ? daftarTanggal[daftarTanggal.length - 1]
    : daftarTanggal[0];

  const hariIni = normalizeDate_(new Date());

  const selisihMs = expiredMember.getTime() - hariIni.getTime();
  const sisaHari = Math.ceil(selisihMs / (1000 * 60 * 60 * 24));

  let statusMasaAktif = "";

  if (hariIni.getTime() < mulaiMember.getTime()) {
    statusMasaAktif = "Belum Mulai";
  } else if (hariIni.getTime() > expiredMember.getTime()) {
    statusMasaAktif = "Expired";
  } else if (sisaHari === 0) {
    statusMasaAktif = "Berakhir Hari Ini";
  } else {
    statusMasaAktif = "Aktif";
  }

  let keteranganMasaAktif = "";

  if (statusMasaAktif === "Expired") {
    keteranganMasaAktif =
      "Mulai member " +
      formatTanggalIndonesia_(mulaiMember) +
      ", expired " +
      Math.abs(sisaHari) +
      " hari lalu";
  } else if (statusMasaAktif === "Berakhir Hari Ini") {
    keteranganMasaAktif =
      "Mulai member " +
      formatTanggalIndonesia_(mulaiMember) +
      ", berakhir hari ini";
  } else if (statusMasaAktif === "Belum Mulai") {
    keteranganMasaAktif =
      "Mulai member " +
      formatTanggalIndonesia_(mulaiMember) +
      ", belum mulai";
  } else {
    keteranganMasaAktif =
      "Mulai member " +
      formatTanggalIndonesia_(mulaiMember) +
      ", sisa " +
      sisaHari +
      " hari";
  }

  return {
    mulaiMember: formatTanggalIndonesia_(mulaiMember),
    expiredMember: formatTanggalIndonesia_(expiredMember),
    sisaHari: sisaHari,
    statusMasaAktif: statusMasaAktif,
    keteranganMasaAktif: keteranganMasaAktif
  };
}

function buatTanggalBerlakuOtomatis_(tanggalMulaiInput, masaBerlakuInput) {
  const mulai = parseDateFlexible_(tanggalMulaiInput);

  if (!mulai) {
    throw new Error("Tanggal mulai tidak valid.");
  }

  const masa = String(masaBerlakuInput || "").toLowerCase().trim();
  const akhir = new Date(mulai);

  let angka = 1;
  const angkaMatch = masa.match(/(\d+)/);

  if (angkaMatch) {
    angka = Number(angkaMatch[1]);
  }

  if (
    masa.includes("per-visit") ||
    masa.includes("per visit") ||
    masa.includes("visit") ||
    masa.includes("harian") ||
    masa.includes("1 hari")
  ) {
    // berlaku hari itu saja
  } else if (masa.includes("minggu")) {
    akhir.setDate(akhir.getDate() + (angka * 7));
  } else if (masa.includes("bulan")) {
    akhir.setMonth(akhir.getMonth() + angka);
  } else if (masa.includes("tahun")) {
    akhir.setFullYear(akhir.getFullYear() + angka);
  } else {
    // Kalau format masa berlaku tidak dikenali,
    // default-nya dianggap berlaku di hari yang sama.
  }

  const mulaiText = formatTanggalIndonesia_(mulai);
  const akhirText = formatTanggalIndonesia_(akhir);

  if (isSameDate_(mulai, akhir)) {
    return mulaiText;
  }

  return mulaiText + " - " + akhirText;
}

function findHeaderRow_(sheet) {
  const maxRows = Math.min(sheet.getLastRow(), 20);

  if (maxRows < 1) return 1;

  const values = sheet.getRange(1, 1, maxRows, Math.min(sheet.getLastColumn(), 14)).getValues();

  for (let i = 0; i < values.length; i++) {
    const rowText = values[i].map(function(cell) {
      return String(cell || "").toLowerCase().trim();
    });

    const hasTanggal = rowText.includes("tanggal");
    const hasNama = rowText.includes("nama");
    const hasMasaBerlaku = rowText.includes("masa berlaku");

    if (hasTanggal && hasNama && hasMasaBerlaku) {
      return i + 1;
    }
  }

  return 1;
}

function isDataSheet_(sheet) {
  const sheetName = sheet.getName();

  if (sheetName.toLowerCase().includes("dashboard")) return false;
  if (sheetName.toLowerCase().includes("template")) return false;

  const headerRow = findHeaderRow_(sheet);

  if (headerRow < 1) return false;

  const header = sheet.getRange(headerRow, 1, 1, Math.min(sheet.getLastColumn(), 9)).getValues()[0];

  const headerText = header.map(function(cell) {
    return String(cell || "").toLowerCase().trim();
  });

  return (
    headerText.includes("tanggal") &&
    headerText.includes("nama") &&
    headerText.includes("masa berlaku")
  );
}

function ensureMasaAktifHeaders_(sheet) {
  const headerRow = findHeaderRow_(sheet);

  sheet.getRange(headerRow, COL.MULAI_MEMBER, 1, EXTRA_HEADERS.length).setValues([
    EXTRA_HEADERS
  ]);

  const headerRange = sheet.getRange(headerRow, COL.MULAI_MEMBER, 1, EXTRA_HEADERS.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#d9ead3");
  headerRange.setHorizontalAlignment("center");
}

function setupMasaAktifSemuaSheet() {
  const ss = getSpreadsheet_();
  const sheets = ss.getSheets();

  let totalSheet = 0;

  sheets.forEach(function(sheet) {
    if (isDataSheet_(sheet)) {
      ensureMasaAktifHeaders_(sheet);
      totalSheet++;
    }
  });

  return {
    success: true,
    message: "Setup kolom masa aktif selesai. Total sheet diproses: " + totalSheet,
    totalSheet: totalSheet
  };
}

function parseSheetNameRange_(sheetName) {
  const text = String(sheetName || "").trim();

  // Contoh:
  // 4-8 Mei 2026
  // 27 - 30 April 2026
  const rangeMatch = text.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);

  if (rangeMatch) {
    const startDay = Number(rangeMatch[1]);
    const endDay = Number(rangeMatch[2]);
    const month = BULAN_INDONESIA[rangeMatch[3].toLowerCase()];
    const year = Number(rangeMatch[4]);

    return {
      start: normalizeDate_(new Date(year, month, startDay)),
      end: normalizeDate_(new Date(year, month, endDay))
    };
  }

  // Contoh:
  // 4 Mei 2026
  const singleMatch = text.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);

  if (singleMatch) {
    const day = Number(singleMatch[1]);
    const month = BULAN_INDONESIA[singleMatch[2].toLowerCase()];
    const year = Number(singleMatch[3]);

    const date = normalizeDate_(new Date(year, month, day));

    return {
      start: date,
      end: date
    };
  }

  return null;
}

function findSheetForTanggal_(tanggalInput) {
  const ss = getSpreadsheet_();
  const targetDate = parseDateFlexible_(tanggalInput);

  if (!targetDate) {
    throw new Error("Tanggal input tidak valid.");
  }

  const sheets = ss.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const range = parseSheetNameRange_(sheet.getName());

    if (!range) continue;

    if (
      targetDate.getTime() >= range.start.getTime() &&
      targetDate.getTime() <= range.end.getTime()
    ) {
      return sheet;
    }
  }

  return null;
}

function isRowEmptyExceptDate_(row) {
  for (let i = 1; i < 9; i++) {
    if (String(row[i] || "").trim() !== "") {
      return false;
    }
  }

  return true;
}

function hasAnyData_(row) {
  for (let i = 0; i < row.length; i++) {
    if (String(row[i] || "").trim() !== "") {
      return true;
    }
  }

  return false;
}

function findInsertRowForDate_(sheet, tanggalInput) {
  const targetDate = parseDateFlexible_(tanggalInput);
  const headerRow = findHeaderRow_(sheet);
  const lastRow = Math.max(sheet.getLastRow(), headerRow + 1);

  const values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, Math.max(sheet.getLastColumn(), 14)).getValues();

  let currentDate = null;
  let foundTarget = false;
  let firstBlankDateOnlyRow = null;
  let lastRowInTarget = null;
  let nextDateRow = null;

  for (let i = 0; i < values.length; i++) {
    const actualRow = headerRow + 1 + i;
    const row = values[i];

    const parsedDate = parseDateFlexible_(row[0]);

    if (parsedDate) {
      if (foundTarget && !isSameDate_(parsedDate, targetDate)) {
        nextDateRow = actualRow;
        break;
      }

      currentDate = parsedDate;

      if (isSameDate_(currentDate, targetDate)) {
        foundTarget = true;

        if (isRowEmptyExceptDate_(row)) {
          firstBlankDateOnlyRow = actualRow;
        }
      }
    }

    if (foundTarget && currentDate && isSameDate_(currentDate, targetDate)) {
      if (hasAnyData_(row)) {
        lastRowInTarget = actualRow;
      }
    }
  }

  if (firstBlankDateOnlyRow) {
    return {
      mode: "write",
      row: firstBlankDateOnlyRow,
      shouldWriteDate: true
    };
  }

  if (foundTarget && lastRowInTarget) {
    if (nextDateRow) {
      sheet.insertRowBefore(nextDateRow);

      return {
        mode: "write",
        row: nextDateRow,
        shouldWriteDate: false
      };
    }

    sheet.insertRowAfter(lastRowInTarget);

    return {
      mode: "write",
      row: lastRowInTarget + 1,
      shouldWriteDate: false
    };
  }

  const appendRow = sheet.getLastRow() + 1;

  return {
    mode: "write",
    row: appendRow,
    shouldWriteDate: true
  };
}

function tambahMember(data) {
  if (!data) {
    return {
      success: false,
      message: "Data kosong."
    };
  }

  if (!data.tanggal) {
    return {
      success: false,
      message: "Tanggal wajib diisi."
    };
  }

  if (!data.nama) {
    return {
      success: false,
      message: "Nama wajib diisi."
    };
  }

  const tanggalInput = data.tanggal;
  const targetDate = parseDateFlexible_(tanggalInput);

  if (!targetDate) {
    return {
      success: false,
      message: "Format tanggal tidak valid."
    };
  }

  let sheet = findSheetForTanggal_(targetDate);

  if (!sheet) {
    return {
      success: false,
      message:
        "Sheet untuk tanggal " +
        formatTanggalIndonesia_(targetDate) +
        " tidak ditemukan. Buat tab mingguan dulu, contoh: 4-8 Mei 2026."
    };
  }

  ensureMasaAktifHeaders_(sheet);

  let tanggalBerlaku = String(data.tanggalBerlaku || "").trim();

  if (!tanggalBerlaku) {
    tanggalBerlaku = buatTanggalBerlakuOtomatis_(targetDate, data.masaBerlaku);
  }

  const masaAktif = hitungMasaAktifMember_(tanggalBerlaku);

  const insertInfo = findInsertRowForDate_(sheet, targetDate);

  const rowValues = [
    insertInfo.shouldWriteDate ? formatTanggalIndonesia_(targetDate) : "",
    data.nama || "",
    data.noAnggota || "",
    data.masaBerlaku || "",
    tanggalBerlaku,
    data.keterangan || "",
    data.jumlah || "",
    data.cetakKartu || "",
    data.noKuitansi || "",
    masaAktif.mulaiMember,
    masaAktif.expiredMember,
    masaAktif.sisaHari,
    masaAktif.statusMasaAktif,
    masaAktif.keteranganMasaAktif
  ];

  sheet.getRange(insertInfo.row, 1, 1, rowValues.length).setValues([rowValues]);

  const masaRange = sheet.getRange(insertInfo.row, COL.MULAI_MEMBER, 1, EXTRA_HEADERS.length);
  masaRange.setBackground("#f6fff2");

  return {
    success: true,
    message:
      "Member berhasil ditambahkan ke sheet " +
      sheet.getName() +
      ". " +
      masaAktif.keteranganMasaAktif,
    sheetName: sheet.getName(),
    row: insertInfo.row,
    masaAktif: masaAktif
  };
}

function getRekapMember() {
  const ss = getSpreadsheet_();
  const sheets = ss.getSheets();

  const result = [];
  const grouped = {};

  sheets.forEach(function(sheet) {
    if (!isDataSheet_(sheet)) return;

    ensureMasaAktifHeaders_(sheet);

    const headerRow = findHeaderRow_(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= headerRow) return;

    const values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, Math.max(sheet.getLastColumn(), 14)).getValues();

    let currentDate = null;

    values.forEach(function(row, index) {
      const actualRow = headerRow + 1 + index;

      const tanggalDiKolomA = parseDateFlexible_(row[0]);

      if (tanggalDiKolomA) {
        currentDate = tanggalDiKolomA;
      }

      const nama = row[COL.NAMA - 1];

      if (!currentDate || !nama) return;

      const tanggalBerlaku = row[COL.TANGGAL_BERLAKU - 1];

      const masaAktif = hitungMasaAktifMember_(tanggalBerlaku);

      const tanggalKey = formatDateKey_(currentDate);
      const tanggalDisplay = formatTanggalIndonesia_(currentDate);

      if (!grouped[tanggalKey]) {
        grouped[tanggalKey] = {
          tanggalKey: tanggalKey,
          tanggalDisplay: tanggalDisplay,
          total: 0,
          members: []
        };
      }

      const member = {
        sheetName: sheet.getName(),
        rowNumber: actualRow,
        tanggalKey: tanggalKey,
        tanggalDisplay: tanggalDisplay,
        nama: row[COL.NAMA - 1] || "",
        noAnggota: row[COL.NO_ANGGOTA - 1] || "",
        masaBerlaku: row[COL.MASA_BERLAKU - 1] || "",
        tanggalBerlaku: tanggalBerlaku || "",
        keterangan: row[COL.KETERANGAN - 1] || "",
        jumlah: row[COL.JUMLAH - 1] || "",
        cetakKartu: row[COL.CETAK_KARTU - 1] || "",
        noKuitansi: row[COL.NO_KUITANSI - 1] || "",
        mulaiMember: masaAktif.mulaiMember,
        expiredMember: masaAktif.expiredMember,
        sisaHari: masaAktif.sisaHari,
        statusMasaAktif: masaAktif.statusMasaAktif,
        keteranganMasaAktif: masaAktif.keteranganMasaAktif
      };

      grouped[tanggalKey].members.push(member);
      grouped[tanggalKey].total++;
      result.push(member);
    });
  });

  const groups = Object.values(grouped).sort(function(a, b) {
    return new Date(a.tanggalKey) - new Date(b.tanggalKey);
  });

  return {
    success: true,
    data: result,
    groups: groups,
    total: result.length
  };
}

function updateMasaAktifSemuaData() {
  const ss = getSpreadsheet_();
  const sheets = ss.getSheets();

  let totalSheet = 0;
  let totalRowUpdated = 0;

  sheets.forEach(function(sheet) {
    if (!isDataSheet_(sheet)) return;

    ensureMasaAktifHeaders_(sheet);

    const headerRow = findHeaderRow_(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= headerRow) return;

    const numRows = lastRow - headerRow;
    const values = sheet.getRange(headerRow + 1, 1, numRows, Math.max(sheet.getLastColumn(), 14)).getValues();

    const output = [];
    let hasData = false;

    values.forEach(function(row) {
      const nama = row[COL.NAMA - 1];
      const tanggalBerlaku = row[COL.TANGGAL_BERLAKU - 1];

      if (nama && tanggalBerlaku) {
        const masaAktif = hitungMasaAktifMember_(tanggalBerlaku);

        output.push([
          masaAktif.mulaiMember,
          masaAktif.expiredMember,
          masaAktif.sisaHari,
          masaAktif.statusMasaAktif,
          masaAktif.keteranganMasaAktif
        ]);

        hasData = true;
        totalRowUpdated++;
      } else {
        output.push(["", "", "", "", ""]);
      }
    });

    if (hasData) {
      sheet.getRange(headerRow + 1, COL.MULAI_MEMBER, output.length, EXTRA_HEADERS.length).setValues(output);
      totalSheet++;
    }
  });

  return {
    success: true,
    message:
      "Update masa aktif selesai. Total sheet: " +
      totalSheet +
      ", total baris diperbarui: " +
      totalRowUpdated,
    totalSheet: totalSheet,
    totalRowUpdated: totalRowUpdated
  };
}

function testHitungMasaAktif() {
  const contoh1 = hitungMasaAktifMember_("4 Mei 2026 - 4 Juni 2026");
  const contoh2 = hitungMasaAktifMember_("4 Mei 2026");

  Logger.log(contoh1);
  Logger.log(contoh2);
}
