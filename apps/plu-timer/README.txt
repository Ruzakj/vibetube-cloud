PLU TIMER — BACKGROUND + NOTIFICATION UPDATE

Perubahan:
- Notifikasi menampilkan Sisa waktu: M:SS saat timer berjalan.
- Timer memakai absolute deadline, sehingga saat Chrome memberi throttle di background,
  waktu tidak 'berhenti'; ketika mendapat CPU lagi, sisa waktu dikoreksi dari jam sistem.
- Saat 0, notifikasi akhir memakai vibrasi dan requireInteraction.
- Saat aplikasi kembali ke foreground, alarm yang terlewat akan dipicu segera.
- Countdown 10→1 dan custom alarm tetap dipertahankan.

CATATAN ANDROID/PWA:
Web PWA tidak memiliki foreground service Android. Karena itu Chrome/Android tetap dapat
menangguhkan proses dan tidak ada cara HTML/JS yang menjamin audio custom akan mulai tepat
pada detik 0 ketika proses aplikasi benar-benar dibekukan. Versi ini memaksimalkan reliabilitas
dengan deadline berbasis waktu + notifikasi, tetapi untuk alarm yang benar-benar terjamin
meski aplikasi dibunuh OS, diperlukan native Android/foreground service atau mekanisme OS lain.

DEPLOY:
1. Upload ZIP ini ke project Vercel yang sama.
2. Deploy.
3. Uninstall PWA lama lalu install ulang agar Service Worker v3 aktif.
