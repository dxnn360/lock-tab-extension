# TabLock - Browser Tab Locker Extension

Ekstensi browser (Chrome / Edge / Chromium) berbasis **Manifest V3** untuk mengunci tab aktif dengan kata sandi (password).

## ✨ Fitur Utama
1. **Password Protection**: Kata sandi di-hash menggunakan **SHA-256** dan disimpan secara persisten di storage browser (`chrome.storage.local`).
2. **Kunci Tab Fleksibel**:
   - Melalui **Popup Extension**: Klik tombol *"🔒 Kunci Tab Ini Sekarang"*.
   - Melalui **Menu Klik Kanan (Context Menu)**: Klik kanan di mana saja pada tab yang ingin dikunci, lalu pilih *"🔒 Kunci Tab Ini"*.
3. **Layar Kunci Otomatis (Lock Screen)**:
   - Ketika tab dikunci, tab dialihkan ke layar input sandi.
   - Konten halaman tersembunyi sepenuhnya dari siapa pun yang melihat layar.
   - Setelah password yang benar dimasukkan, tab otomatis kembali ke URL situs asli.
4. **Desain Modern**: Antarmuka gelap (Dark Mode Glassmorphism) responsif & bersih.

---

## 🚀 Cara Memasang (Install) di Browser

1. Buka browser Chromium favorit Anda (Google Chrome, Microsoft Edge, Brave, dll).
2. Buka halaman pengaturan ekstensi:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Aktifkan toggle **Developer Mode** (Mode Pengembang) di pojok kanan atas.
4. Klik tombol **Load unpacked** (Muat yang belum dibongkar).
5. Pilih folder proyek ini: `d:\PROJECT\lock-tab-extension`.
6. Ekstensi **TabLock** siap digunakan!

---

## 🔒 Catatan Penyimpanan Persisten (Storage)
Pada Web Extension standar modern (Manifest V3), `chrome.storage.local` adalah standar penyimpanan persisten teraman dan paling optimal (didukung LevelDB/SQLite bawaan per user profile di dalam browser) tanpa perlu konfigurasi server atau library berat tambahan.
