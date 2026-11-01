# Notifikasi admin

Pengajuan sewa baru membuat satu notifikasi untuk setiap akun `admin` dan `pemilik`.
Notifikasi disimpan di Supabase, dibaca melalui RLS, dan diperbarui melalui Realtime
dengan pemeriksaan cadangan setiap 30 detik. Membuka ulang admin tidak membunyikan
notifikasi lama. Tekan **Aktifkan notifikasi & bunyi** untuk meminta izin dan menguji
bunyi. Pengaturan bunyi tersimpan per akun. Keluar dari akun melepas token perangkat.

## Web

Tab admin harus tetap terbuka. Browser memerlukan interaksi pengguna untuk mengaktifkan
audio, sehingga tombol aktivasi perlu ditekan lagi setelah memuat ulang halaman.
Jika izin notifikasi browser ditolak, daftar notifikasi dalam admin tetap berfungsi.
Web push saat seluruh tab ditutup belum diimplementasikan.

## Android / APK

`expo-notifications` menggunakan channel `booking-alerts` dengan bunyi bawaan Android,
dan `booking-silent` ketika bunyi dimatikan. Tanpa Firebase, notifikasi lokal tersedia
saat aplikasi aktif. Untuk menerima push ketika aplikasi ditutup:

1. Buat aplikasi Android Firebase dengan package `com.sulthanafif.kontrakankuadmin`.
2. Simpan `google-services.json` di `apps/admin/google-services.json` (diabaikan Git),
   atau sediakan variabel EAS bertipe file `GOOGLE_SERVICES_JSON`.
3. Unggah kredensial FCM V1 untuk project EAS `fad9fe65-0d90-44b7-bb9c-48869204d700`
   melalui `eas credentials --platform android`. Kunci service account hanya untuk
   EAS; jangan masukkan ke source, variabel `EXPO_PUBLIC_*`, atau aplikasi.
4. Bangun ulang dengan `eas build --platform android --profile preview` dari
   `apps/admin`. Profil preview secara eksplisit menghasilkan APK.
5. Instal pada perangkat fisik, masuk sebagai admin, lalu aktifkan notifikasi.
   Pastikan izin dan bunyi notifikasi aplikasi juga diaktifkan di pengaturan Android.

`GOOGLE_SERVICES_JSON` harus tersedia pada environment EAS yang dipakai profil build.
Konfigurasi Firebase membutuhkan APK baru; mengubah JavaScript saja tidak cukup.
Expo Go Android tidak mendukung pengujian remote push ini.

## Database dan pengiriman

Migrasi `202611010003_admin_notifications.sql` menambahkan inbox, token perangkat,
RLS, Realtime, dan trigger pengajuan baru. Tidak ada pengiriman ulang untuk pengajuan
lama. Jangan menerapkan ulang SQL mentah jika tabel sudah ada; gunakan alur migrasi
normal untuk deployment selanjutnya.

Trigger menggunakan `pg_net` untuk mengirim ke Expo Push Service setelah transaksi
commit. Payload hanya berisi pesan umum dan ID, tanpa nama, NIK, atau nomor telepon
penyewa. Token hanya dapat dikelola akun admin pemilik perangkat. Daftar perangkat
disaring lagi berdasarkan role saat mengirim.

ID request disimpan di `admin_push_deliveries`. Operator dapat memeriksa HTTP result
di `net._http_response` untuk diagnosis. Antrean ini belum mengambil push receipts
Expo, membersihkan token `DeviceNotRegistered` otomatis, atau mencoba ulang kegagalan
transport. Status inbox tersimpan meskipun transport push gagal. Jika Expo Push
Security diaktifkan pada project, tambahkan transport server dengan access token
sebelum menggunakannya; implementasi saat ini memakai endpoint push standar.

## Verifikasi

- Kirim satu pengajuan dengan akun customer pada unit tersedia.
- Admin mendapatkan satu item baru dan satu bunyi setelah aktivasi.
- Memuat ulang data tidak mengulang bunyi item lama.
- Ketuk item untuk membuka pengajuan; jumlah belum dibaca berkurang.
- Matikan bunyi dan ulangi: item tetap muncul tanpa suara.
- Setelah FCM terpasang dan APK dibangun ulang, uji pada perangkat fisik dengan
  aplikasi di latar belakang dan tertutup. Pastikan keluar akun menghentikan push.

Referensi: [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/),
[FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/),
[Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
