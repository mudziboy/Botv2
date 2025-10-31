<h1><b>⚡ Bot VPN Telegram Otomatis (Node.js + Telegraf + Pakasir) ⚡</h1></b>
<p>Bot Telegram VPN berbasis Node.js yang modular dan stabil, dirancang untuk otomasi penuh layanan VPN (SSH/Vmess/Vless/Trojan/Shadowsocks). Dilengkapi dengan fitur manajemen server, Rate Limit, dan integrasi pembayaran otomatis.</p>

<h2>✨ Fitur Utama</h2>

<table>
  <thead>
    <tr>
      <th>Kategori</th>
      <th>Fitur</th>
      <th>Deskripsi</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Otomasi Layanan</td>
      <td>Create & Renew Akun</td>
      <td>Pembuatan dan perpanjangan akun VPN (SSH, Vmess, Vless, Trojan, Shadowsocks) secara otomatis tanpa intervensi manual.</td>
    </tr>
    <tr>
      <td>Integrasi Pembayaran</td>
      <td>Top Up Otomatis (Pakasir)</td>
      <td>Terintegrasi penuh dengan Pakasir untuk menerima pembayaran QRIS (dan metode lain). Saldo pengguna bertambah secara instan setelah pembayaran sukses.</td>
    </tr>
    <tr>
      <td>Trial Akun</td>
      <td>Trial Akun 1 Jam</td>
      <td>Memberikan akun trial otomatis dengan batas harian, memungkinkan pengguna menguji layanan.</td>
    </tr>
    <tr>
      <td>Manajemen Reseller</td>
      <td>Upgrade Role & Diskon</td>
      <td>Fitur upgrade role Reseller dengan potongan saldo dan pemberian harga layanan yang lebih murah (Diskon 40%).</td>
    </tr>
    <tr>
      <td>Stabilitas & Keamanan</td>
      <td>Rate Limit & Validasi</td>
      <td>Mencegah spam / flood pesan (Rate Limit) dan memaksa pengguna bergabung ke channel wajib untuk membaca ketentuan sebelum menggunakan bot.</td>
    </tr>
    <tr>
      <td>Manajemen Admin</td>
      <td>CRUD Server</td>
      <td>Menu Admin lengkap untuk menambah, menghapus, dan mengedit detail server (domain, harga, kuota, dll.) melalui bot.</td>
    </tr>
  </tbody>
</table>

<h2>🔗 Status & Demo</h2>

<ul>
  <li><b>Badge</b></li>
  <li>Status</li>
  <li>Node.js Environment</li>
  <li>Telegraf Core</li>
  <li>Persistent Storage</li>
  <li>Top Up Otomatis</li>
  <li>Bot Preview: <a href="https://t.me/teletunbot" target="_blank">@teletunbot</a></li>
</ul>

<h2>🛠️ Panduan Instalasi (Khusus Server Linux)</h2>

<p>Ikuti langkah-langkah di bawah ini untuk menginstal Bot VPN Telegram di server Linux Anda (disarankan Debian/Ubuntu).</p>

<ol>
  <li>Pastikan Anda memiliki file <code>app.js</code>, <code>utils/</code>, <code>handlers/</code>, <code>modules/</code>, dan folder <code>scripts/</code> (berisi skrip <code>.sh</code> Anda) di direktori bot Anda.</li>
  <li>Eksekusi Perintah Instalasi:<br>
  Perintah ini akan menonaktifkan IPv6, menginstal dependensi dasar (git, curl, dos2unix), mengunduh skrip start dari repositori, dan menjalankannya.</li>
</ol>

<pre><code>sysctl -w net.ipv6.conf.all.disable_ipv6=1 \
&& sysctl -w net.ipv6.conf.default.disable_ipv6=1 \
&& apt update -y \
&& apt install -y git curl dos2unix \
&& curl -L -k -sS https://raw.githubusercontent.com/mudziboy/Botv2/main/start -o start \
&& dos2unix start \
&& bash start sellvpn \
&& [ $? -eq 0 ] && rm -f start
</code></pre>

<h3>Konfigurasi Variabel:</h3>

<p>Setelah menjalankan perintah di atas, skrip akan meminta Anda untuk memasukkan data-data penting, termasuk Token Bot, Admin ID, dan API Key Pakasir.</p>

<p>Pastikan Anda mengisi <code>PAKASIR_API_KEY</code>, <code>PAKASIR_PROJECT_SLUG</code>, dan <code>PAKASIR_WEBHOOK_URL</code> sesuai dengan pengaturan Anda di Pakasir.</p>

<p>Sistem akan secara otomatis menjalankan bot menggunakan PM2 dan mengirim notifikasi ke Admin ID Anda.</p>

<h2>🤝 Dukungan & Kontak</h2>

<p>Proyek ini adalah bot komersial dengan logic yang kompleks. Bot ini membutuhkan file utama, silahkan cari di repo akun saya yang bernama '''mdzitr.'' Jika Anda ingin mendapatkan full script ini atau membutuhkan jasa instalasi, kustomisasi, dan pengembangan lebih lanjut, silakan hubungi kontak di bawah:</p>

<p>Telegram: <a href="https://t.me/rahmarie" target="_blank">t.me/rahmarie</a></p>
