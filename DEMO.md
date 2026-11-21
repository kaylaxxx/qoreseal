# Demo QoreSeal — Naskah Video (< 3 menit)

Video demo untuk QoreChain Developer Fest "Build Before Q-Day" (Quantum Pass).
Total durasi target: **2 menit 45 detik**. Satu take per adegan, tanpa editing
rumit — cukup rekam layar + narasi.

## Adegan 1 — Pembuka: masalahnya (0:00–0:25)

**Layar:** judul "QoreSeal — segel pesan anti-kuantum di QoreChain" di atas
tampilan awal web app (`npm run dev`, http://localhost:5173).

**Narasi (ucapkan):**
> "Tanda tangan digital hari ini aman — sampai komputer kuantum datang.
> QoreSeal menyegel pesan di QoreChain dengan dua tanda tangan sekaligus:
> secp256k1 klasik, dan ML-DSA-87 post-quantum. Segelnya bisa diverifikasi
> siapa saja, selamanya, dari data publik rantai."

## Adegan 2 — Buka app, lihat segel yang sudah live (0:25–1:05)

**Layar:** web app QoreSeal.

**Langkah persis:**
1. Buka http://localhost:5173 — tampilkan halaman utama app.
2. Tempel hash segel live di kolom verifier app:
   `9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82`
3. Klik **Verify** — tunjukkan keempat lapis lolos di browser (tx confirmed,
   sha256 memo cocok, ekstensi `PQCHybridSignature` ada, public key cocok
   dengan kunci terdaftar pengirim).

**Narasi (ucapkan):**
> "Ini segel pertama kami, sudah live di testnet qorechain-diana. Pesannya:
> 'Hello Q-Day — sealed with QoreSeal'. App memeriksa empat lapis langsung
> dari testnet — tanpa kunci, tanpa percaya pada kami."

## Adegan 3 — Segel di explorer (1:05–1:35)

**Layar:** browser di
https://dashboard.qorechain.io/explorer/tx/9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82

**Langkah persis:**
1. Buka URL explorer di atas.
2. Tunjukkan transaksi terkonfirmasi di height **10429594**.
3. Sorot memo `QORESEAL1|<sha256>|Hello Q-Day — sealed with QoreSeal`.

**Narasi (ucapkan):**
> "Di explorer QoreChain, segelnya terlihat sebagai transaksi biasa —
> memo-nya membawa hash dan pesan aslinya. Siapa pun bisa membacanya."

## Adegan 4 — Verifikasi kriptografi penuh di CLI (1:35–2:25)

**Layar:** terminal di root repo.

**Langkah persis:**
1. Jalankan:
   ```bash
   node scripts/verify.mjs 9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82
   ```
2. Tunggu sampai kelima lapis tampil dan baris terakhir muncul:
   **SEAL VALID**.
3. Sorot lapis ke-5: re-verifikasi lokal tanda tangan ML-DSA-87 dari raw
   transaction bytes — audit kriptografi lengkap, independen dari rantai.

**Narasi (ucapkan):**
> "Dan ini buktinya yang paling kuat: CLI membangun ulang sign-bytes dari
> transaksi mentah dan memeriksa sendiri tanda tangan ML-DSA-87-nya.
> Lima dari lima lapis lolos — SEAL VALID."

## Adegan 5 — Penutup: kenapa hybrid (2:25–2:45)

**Layar:** kembali ke app, tampilkan diagram singkat dari README (bagian
"The idea"): kunci ML-DSA-87 terdaftar sekali, lalu tiap segel membawa
tanda tangan hybrid.

**Narasi (ucapkan):**
> "Kenapa dua tanda tangan? Kalau suatu hari secp256k1 pecah oleh komputer
> kuantum, separuh ML-DSA-87 tetap membuktikan siapa yang menyegel dan pesan
> itu tidak diubah. QoreSeal — segel hari ini, bukti untuk hari-Q."

**Tutup layar:** logo/teks "QoreSeal — github.com/kaylaxxx/qoreseal".

## Checklist rekaman

- [ ] App jalan (`npm run dev`) sebelum rekam adegan 2.
- [ ] Hash segel disalin utuh — 64 karakter hex, tanpa spasi.
- [ ] `node scripts/verify.mjs …` dijalankan sekali sebelum rekam, supaya
      cache/dependensi sudah hangat dan tidak ada jeda unduh di video.
- [ ] Durasi akhir ≤ 3:00 — potong jeda diam, bukan narasi.
