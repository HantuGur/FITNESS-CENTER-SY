# SISTEM FC - Sistem Admin Gym

Frontend dipisah menjadi:

- `index.html`
- `style.css`
- `config.js`
- `app.js`

Backend Google Apps Script ada di:

- `backend-google-apps-script/Code.gs`
- `backend-google-apps-script/appsscript.json`

## 1. Upload ke GitHub Pages

Upload file berikut ke root repo:

```text
index.html
404.html
style.css
config.js
app.js
README.md
backend-google-apps-script/
templates/
```

Link web nanti:

```text
https://hantugur.github.io/SISTEM-FC/
```

Jangan buka `/frontend/`, karena versi ini file frontend ada di root repo.

## 2. Setup Google Sheet

Buat / buka Google Sheet.

Tab yang dipakai:

```text
LOG_GYM
DATA_KUNCI
MEMBER_LIFETIME
```

Kalau tab belum ada, backend akan membuatnya otomatis setelah function `setupGymSheets` dijalankan.

## 3. Setup Apps Script

Buka Google Sheet:

```text
Ekstensi -> Apps Script
```

Copy semua isi:

```text
backend-google-apps-script/Code.gs
```

Paste ke file `Code.gs` di Apps Script.

Ganti ini:

```javascript
const SPREADSHEET_ID = 'PASTE_GOOGLE_SHEET_ID_HERE';
```

Dengan ID Google Sheet kamu.

Contoh link:

```text
https://docs.google.com/spreadsheets/d/1ABCDEFxxxx/edit
```

Yang dipakai cuma:

```text
1ABCDEFxxxx
```

## 4. Jalankan setup

Di Apps Script:

1. Klik Save.
2. Pilih function `setupGymSheets`.
3. Klik Run.
4. Izinkan akses.

## 5. Deploy Apps Script

Di Apps Script:

```text
Deploy -> New deployment -> Web app
```

Setting:

```text
Execute as: Me
Who has access: Anyone
```

Copy Web App URL yang berakhiran `/exec`.

## 6. Isi config.js

Edit `config.js`:

```javascript
SCRIPT_URL: "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE",
```

Ganti jadi URL Apps Script kamu:

```javascript
SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxxxx/exec",
```

Commit ke GitHub.

## 7. Test

Buka:

```text
https://hantugur.github.io/SISTEM-FC/
```

Kalau backend aktif, status di kanan atas akan berubah jadi `Backend aktif`.
