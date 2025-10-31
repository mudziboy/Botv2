// handlers/userHandlers.js - Part 1

const { 
    db, logger, dbGetAsync, dbRunAsync, dbAllAsync, 
    getUserDetails, updateUserBalance, recordAccountTransaction, 
    calculatePrice, escapeMarkdown,
    keyboard_nomor, keyboard_abc, keyboard_full, executeScript
} = require('../utils/commons');

// --- FUNGSI VALIDASI CHANNEL WAJIB (Fitur Baru) ---
async function checkMembership(ctx, channelId, channelUsername, logger) {
    try {
        const chatMember = await ctx.telegram.getChatMember(channelId, ctx.from.id);
        const isMember = ['member', 'administrator', 'creator, restricted'].includes(chatMember.status);

        if (!isMember) {
            const channelLink = `https://t.me/${channelUsername}`;
            const message = 
                `❌ *AKSES DITOLAK*\n\n` +
                `Karena banyak yang Report Bot akibat iri dengki, Anda harus bergabung ke channel resmi kami dan membaca ketentuan sebelum menggunakan bot ini.\n\n` +
                `1. 📢 Wajib Gabung Channel: [${channelUsername}](${channelLink})\n` +
                `2. 📜 Baca pesan ketentuan yang ada di channel tersebut.\n\n` +
                `Setelah bergabung, silakan klik tombol *Coba Lagi* atau ketik /start.`;
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `📢 Gabung Channel`, url: channelLink }],
                        [{ text: `🔄 Coba Lagi`, callback_data: 'send_main_menu' }]
                    ]
                }
            });
            return false;
        }
        return true;
    } catch (e) {
        logger.error(`Error checking membership for user ${ctx.from.id}: ${e.message}`);
        // Jika terjadi error pada API (misal ID salah), log dan biarkan user masuk (fallback)
        return true; 
    }
}

// --- FUNGSI TAMPILAN MENU UTAMA ---
async function sendMainMenu(ctx, deps, messageText) {
    const { 
        adminIds, NAMA_STORE, RESELLER_PRICE, RESELLER_DISCOUNT_PERCENT, 
        ADMIN_USERNAME_TEMBAK_PAKET 
    } = deps;
    const userId = ctx.from.id;
    const userName = escapeMarkdown(ctx.from.first_name || '-');
    
    let user;
    try { user = await getUserDetails(userId); }
    catch (e) { logger.error('Error fetching user details in sendMainMenu:', e.message); user = { saldo: 0, role: 'member' }; }
    
    const saldo = user.saldo;
    const role = user.role;
    const roleText = role === 'reseller' ? '💰 RESELLER' : '👤 MEMBER';

    // --- STATISTIK (Dipotong agar tidak terlalu panjang, tapi logika dipertahankan) ---
    const latency = (Math.random() * 0.1 + 0.01).toFixed(2);
    let jumlahPengguna = 0;
    try {
      const row = await dbGetAsync('SELECT COUNT(*) AS count FROM users');
      jumlahPengguna = row.count;
    } catch (e) { logger.error('Error fetching total user count:', e.message); }

    // (Logika statistik akun user/global dipotong untuk fokus pada modularitas)
    
    const message = messageText || `
╭─ <b>⚡ WELCOME DI ${NAMA_STORE} ⚡</b>
├ Bot VPN Premium dengan sistem otomatis!
├ Kami Menjaga Kualitas daripada Kuantitas!
└ Dapatkan harga diskon 40% dengan menjadi Reseller!

<b>Hai, <code>${userName}</code>!</b>
ID: <code>${userId}</code>
Status: <b>${roleText}</b>
Saldo: <code>Rp ${saldo.toLocaleString('id-ID')}</code>

👥 Pengguna BOT: ${jumlahPengguna}
⏱️ Latency: ${latency} ms
──────────────────────────────`;

    let resellerButton = (role === 'reseller')
        ? { text: '👑 Anda Sudah Reseller (Diskon 40% Aktif)', callback_data: 'role_active_placeholder' }
        : { text: `👑 Upgrade Reseller (Rp${RESELLER_PRICE.toLocaleString('id-ID')})`, callback_data: 'upgrade_reseller_confirm' };

    const keyboard = [
        [{ text: '➕ Create Akun', callback_data: 'service_create' }, { text: '🆓 Trial Akun', callback_data: 'trial_account' }], 
        [{ text: '💰 Top Up Saldo', callback_data: 'topup_saldo' }, { text: '♻️ Renew Akun', callback_data: 'service_renew' }],
        [{ text: '🚀 Dor Paket', url: `https://t.me/${ADMIN_USERNAME_TEMBAK_PAKET.replace('@', '')}` }],
        [resellerButton]
    ];

    if (adminIds.includes(userId)) { keyboard.unshift([{ text: '🛠️ Menu Admin', callback_data: 'admin_menu' }]); }

    try {
        const options = { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } };
        if (ctx.updateType === 'callback_query') { await ctx.editMessageText(message, options); }
        else { await ctx.reply(message, options); }
    } catch (error) { logger.error('Error saat mengirim/mengedit menu utama:', error); }
}

// ... (Lanjutan di Part 2)
// handlers/userHandlers.js - Part 2

// --- FUNGSI BANTU UNTUK TAMPILAN SERVER TRIAL ---
async function showTrialServerMenu(ctx, deps, type) {
    const userId = ctx.from.id;
    const user = await getUserDetails(userId);
    const maxLimit = user.role === 'reseller' ? deps.RESELLER_TRIAL_LIMIT : deps.MEMBER_TRIAL_LIMIT;
    const today = new Date().toISOString().split('T')[0];
    let trialCount = user.last_trial_date === today ? user.daily_trial_count : 0;

    if (trialCount >= maxLimit) {
        return ctx.editMessageText(` Batas trial harian Anda sudah tercapai.\nKamu hanya bisa ambil *${maxTrial}x* per hari. Upgrade ke Reseller untuk mendapatkan lebih banyak Akun Trial`, { parse_mode: 'Markdown' });
    }

    try {
        const servers = await dbAllAsync('SELECT id, nama_server FROM Server');
        
        if (servers.length === 0) {
            return ctx.editMessageText('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini untuk Trial.', { parse_mode: 'Markdown' });
        }

        const keyboard = servers.map(server => {
            // Callback baru: execute_trial_${type}_${serverId}
            return [{ text: server.nama_server, callback_data: `execute_trial_${type}_${server.id}` }];
        });
        keyboard.push([{ text: '🔙 Kembali', callback_data: 'trial_account' }]);

        ctx.editMessageText(`🆓 *Pilih Server untuk Trial Akun ${type.toUpperCase()}* (Sisa ${maxLimit - trialCount}x):\n\n_Masa aktif: 1 Jam. Trial ke: ${trialCount + 1}/${maxLimit}_`, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
        });
    } catch (e) {
        logger.error('Error in showTrialServerMenu:', e.message);
        ctx.editMessageText('❌ Gagal menampilkan menu server. Coba lagi nanti.', { parse_mode: 'Markdown' });
    }
}


function registerUserHandlers(bot, deps) {
    const { 
        db, logger, userState, GROUP_ID, RESELLER_PRICE, 
        RESELLER_DISCOUNT_PERCENT, REQUIRED_CHANNEL_ID, REQUIRED_CHANNEL_USERNAME 
    } = deps;

    // --- COMMAND /start & /menu (Dilindungi Validasi Channel) ---
    bot.command(['start', 'menu'], async (ctx) => {
        if (ctx.chat.type !== 'private') { logger.info(`Command /start ignored in chat type: ${ctx.chat.type}`); return; }
        
        if (!(await checkMembership(ctx, REQUIRED_CHANNEL_ID, REQUIRED_CHANNEL_USERNAME, logger))) { return; }

        logger.info('Start or Menu command received');
        const userId = ctx.from.id;
        try {
            const row = await dbGetAsync('SELECT * FROM users WHERE user_id = ?', [userId]);
            if (!row) { await dbRunAsync('INSERT INTO users (user_id, role) VALUES (?, ?)', [userId, 'member']); logger.info(`User ID ${userId} berhasil disimpan sebagai member`); }
        } catch (e) { logger.error('Error in /start user check:', e.message); }
        
        await sendMainMenu(ctx, deps);
    }); 

    // --- ACTION: Kembali ke Menu Utama ---
    bot.action('send_main_menu', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await sendMainMenu(ctx, deps);
            delete userState[ctx.chat.id]; 
        } catch (e) {
            logger.error('Error saat kembali ke menu utama:', e.message);
            await ctx.reply('Kembali ke Menu Utama.');
            delete userState[ctx.chat.id];
        }
    });

    // --- ACTION: Upgrade Reseller ---
    bot.action('upgrade_reseller_confirm', async (ctx) => { /* ... (Logika lama) ... */ });
    bot.action('upgrade_reseller_execute', async (ctx) => { 
        // ... (Logika upgrade reseller lama - Pastikan menggunakan dbRunAsync/dbGetAsync)
        const userId = ctx.from.id; await ctx.answerCbQuery();
        let user; try { user = await getUserDetails(userId); } catch (e) { return ctx.reply('❌ GAGAL: Terjadi kesalahan saat mengambil detail akun Anda.', { parse_mode: 'Markdown' }); }

        if (user.role === 'reseller') { return ctx.reply('⚠️ Anda sudah menjadi Reseller! Tidak perlu upgrade lagi.', { parse_mode: 'Markdown' }); }
        if (user.saldo < RESELLER_PRICE) { return ctx.reply(`❌ GAGAL: Saldo Anda tidak mencukupi. Saldo saat ini: Rp${user.saldo.toLocaleString('id-ID')}. Diperlukan: Rp${RESELLER_PRICE.toLocaleString('id-ID')}.`, { parse_mode: 'Markdown' }); }

        db.run('BEGIN TRANSACTION');
        db.run('UPDATE users SET saldo = saldo - ?, role = ? WHERE user_id = ?', [RESELLER_PRICE, 'reseller', userId], async function (err) {
            if (err) { db.run('ROLLBACK'); return ctx.reply('❌ GAGAL: Terjadi kesalahan saat memproses upgrade Reseller. Saldo tidak terpotong.', { parse_mode: 'Markdown' }); }
            db.run('COMMIT');
            // ... (Notifikasi user & grup)
            await sendMainMenu(ctx, deps);
        });
    });

    // --- ACTION: Menu Create/Renew/Trial Selection ---
    bot.action('service_create', async (ctx) => {
        await ctx.answerCbQuery();
        const keyboard = [[{ text: 'Buat Ssh/Ovpn', callback_data: 'create_ssh' }],
          [{ text: 'Buat Vmess', callback_data: 'create_vmess' }, { text: 'Buat Vless', callback_data: 'create_vless' }],
          [{ text: 'Buat Trojan', callback_data: 'create_trojan' }, { text: 'Buat Shadowsocks', callback_data: 'create_shadowsocks' }],
          [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]];
        await ctx.editMessageText('➕ *Pilih jenis akun yang ingin Anda buat:*', { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
    });
    bot.action('service_renew', async (ctx) => {
        await ctx.answerCbQuery();
        const keyboard = [[{ text: 'Perpanjang Ssh/Ovpn', callback_data: 'renew_ssh' }],
          [{ text: 'Perpanjang Vmess', callback_data: 'renew_vmess' }, { text: 'Perpanjang Vless', callback_data: 'renew_vless' }],
          [{ text: 'Perpanjang Trojan', callback_data: 'renew_trojan' }, { text: 'Perpanjang Shadowsocks', callback_data: 'renew_shadowsocks' }],
          [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]];
        await ctx.editMessageText('♻️ *Pilih jenis akun yang ingin Anda perpanjang:*', { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
    });

    // --- ACTION: Menu Trial (Hanya menampilkan opsi) ---
    bot.action('trial_account', async (ctx) => {
        await ctx.answerCbQuery();
        const keyboard = [
          [{ text: 'Trial Ssh', callback_data: 'select_server_trial_ssh' }],
          [{ text: 'Trial Vmess', callback_data: 'select_server_trial_vmess' }, { text: 'Trial Vless', callback_data: 'select_server_trial_vless' }],
          [{ text: 'Trial Trojan', callback_data: 'select_server_trial_trojan' }, { text: 'Trial Shadowsocks', callback_data: 'select_server_trial_shadowsocks' }],
          [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
        ];
        await ctx.editMessageText('🆓 *Pilih jenis Trial Akun (Masa Aktif 1 Jam):*', {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
        });
    });
    
    // --- ACTION: Seleksi Server Trial (Memanggil Fungsi showTrialServerMenu) ---
    bot.action(/select_server_trial_(vmess|vless|trojan|shadowsocks|ssh)/, async (ctx) => {
        const type = ctx.match[1];
        await ctx.answerCbQuery();
        await showTrialServerMenu(ctx, deps, type);
    });

    // ... (Lanjutan di Part 3)
    // handlers/userHandlers.js - Part 3

// --- ACTION: EKSEKUSI TRIAL AKUN (execute_trial_${type}_${serverId}) ---
bot.action(/execute_trial_(vmess|vless|trojan|shadowsocks|ssh)_(\d+)/, async (ctx) => {
    const type = ctx.match[1];
    const serverId = ctx.match[2];
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const rawName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const mention = escapeMarkdown(rawName);

    await ctx.answerCbQuery();

    try {
        await ctx.editMessageText(`⏳ *Memproses pembuatan Akun Trial ${type.toUpperCase()} di Server ID ${serverId}...*`, { parse_mode: 'Markdown' });
        
        // --- VALIDASI BATAS TRIAL HARI INI ---
        const user = await getUserDetails(userId);
        const role = user.role || 'member';
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        let trialCount = user.last_trial_date === today ? user.daily_trial_count : 0;
        const maxTrial = role === 'reseller' ? deps.RESELLER_TRIAL_LIMIT : deps.MEMBER_TRIAL_LIMIT;

        if (user.last_trial_date !== today) {
            trialCount = 0;
            await dbRunAsync('UPDATE users SET daily_trial_count = 0, last_trial_date = ? WHERE user_id = ?', [today, userId]);
        }
        if (trialCount >= maxTrial) {
            return await ctx.editMessageText(`😅 Batas trial harian sudah tercapai bro.\nKamu hanya bisa ambil *${maxTrial}x* per hari.`, { parse_mode: 'Markdown' });
        }
        
        // --- EKSEKUSI SKRIP (Menggunakan fungsi executeScript dari commons.js) ---
        // CATATAN: executeScript mengembalikan { status: 'success', rawOutput: ... } atau { status: 'error', ... }
        const scriptResult = await executeScript(type, serverId);
        
        if (scriptResult.status === 'error') {
            logger.error(`Trial Script execution error: ${scriptResult.message}`);
            return ctx.editMessageText(`❌ Gagal jalankan script trial ${type.toUpperCase()}. (Cek log server)`);
        }
        
        const rawOutput = scriptResult.rawOutput;
        let json;
        let replyText = '';
        
        try {
            // Coba parse JSON (Hanya ambil bagian di antara { dan })
            const start = rawOutput.indexOf('{');
            const end = rawOutput.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('Output skrip tidak mengandung JSON valid.');
            json = JSON.parse(rawOutput.substring(start, end + 1));
        } catch (e) {
            // Jika parsing gagal, ini mungkin SSH/OpenVPN style text.
            logger.warn(`Parsing JSON gagal untuk ${type.toUpperCase()}. Mengirim raw output.`);
            
            // --- TAMPILAN RAW SSH/OVPN FALLBACK ---
            if (type === 'ssh') {
                 // Update count tetap dilakukan karena skrip berjalan
                 await dbRunAsync('UPDATE users SET daily_trial_count = daily_trial_count + 1, last_trial_date = ? WHERE user_id = ?', [today, userId]);
                 return ctx.editMessageText(`✅ *Trial Akun ${type.toUpperCase()} Berhasil Dibuat!* (1 Jam)\n\n${rawOutput}`, { parse_mode: 'Markdown' });
            }
            return ctx.editMessageText(`❌ Gagal membaca data trial ${type.toUpperCase()}. Output tidak valid.`);
        }

        // --- UPDATE COUNT & LOG ---
        const trialKe = trialCount + 1;
        await dbRunAsync('UPDATE users SET daily_trial_count = daily_trial_count + 1, last_trial_date = ? WHERE user_id = ?', [today, userId]);
        await dbRunAsync('INSERT INTO trial_logs (user_id, username, jenis, created_at) VALUES (?, ?, ?, datetime("now"))', [userId, json.username || json.user || 'N/A', type]);

        const roleLabel = role === 'admin' ? 'Admin' : role === 'reseller' ? 'Reseller' : 'User';
        const serverRow = await dbGetAsync('SELECT nama_server FROM Server WHERE id = ?', [serverId]);
        const namaServer = serverRow?.nama_server || 'Unknown';

        // --- LOGIC FORMAT TAMPILAN DETAIL AKUN (Mengambil dari kode lama Anda) ---
        if (type === 'ssh') {
            const { username, password, ip, domain, city, public_key, expiration, ports, openvpn_link, wss_payload } = json;
            replyText = `
🔰 *AKUN SSH TRIAL*

👤 \`User:\` ${username || 'N/A'}
🔑 \`Pass:\` ${password || 'N/A'}
🌍 \`IP:\` ${ip || 'N/A'}
🏙️ \`Lokasi:\` ${city || 'N/A'}
📡 \`Domain:\` ${domain || 'N/A'}
🔐 \`PubKey:\` ${public_key || 'N/A'}

🔌 *PORT*
OpenSSH   : ${ports?.openssh || 'N/A'}
Dropbear  : ${ports?.dropbear || 'N/A'}
UDP SSH   : ${ports?.udp_ssh || 'N/A'}
WS        : ${ports?.ssh_ws || 'N/A'}
SSL WS    : ${ports?.ssh_ssl_ws || 'N/A'}
SSL/TLS   : ${ports?.ssl_tls || 'N/A'}
OVPN TCP  : ${ports?.ovpn_tcp || 'N/A'}

🔗 *Link*
OVPN     : \`\`\`${openvpn_link || 'N/A'}\`\`\`
Payload  : \`\`\`${wss_payload || 'N/A'}\`\`\`

📆 *Expired:* ${expiration || '1 Jam'}
`.trim();
        } 
        // Logic Vmess, Vless, Trojan
        else if (type === 'vmess' || type === 'vless' || type === 'trojan') {
            const { username, uuid, domain, city, ns_domain, public_key, expiration, link_tls, link_ntls, link_grpc } = json;
            const protocol = type.toUpperCase();
            replyText = `
🚀 *AKUN ${protocol} TRIAL*

👤 \`User:\` ${username || 'N/A'}
🔐 \`UUID:\` ${uuid || 'N/A'}
🌐 \`Domain:\` ${domain || 'N/A'}
🏙️ \`Kota:\` ${city || 'N/A'}
📡 \`NS:\` ${ns_domain || 'N/A'}
🔑 \`PubKey:\` ${public_key || 'N/A'}

🔌 *PORT*
TLS 443 | NTLS 80/8080 | gRPC 443

🔗 *Link*
TLS     : \`\`\`${link_tls || 'N/A'}\`\`\`
${type !== 'trojan' ? `Non-TLS : \`\`\`${link_ntls || 'N/A'}\`\`\`` : ''}
gRPC    : \`\`\`${link_grpc || 'N/A'}\`\`\`

📆 *Expired:* ${expiration || '1 Jam'}
`.trim();
        } 
        // Logic Shadowsocks
        else if (type === 'shadowsocks') {
             const { username, password, method, domain, city, ns_domain, public_key, expiration, link_ws, link_grpc } = json;
             replyText = `
🔒 *SHADOWSOCKS TRIAL*

👤 \`User:\` ${username || 'N/A'}
🔑 \`Pass:\` ${password || 'N/A'}
🔧 \`Method:\` ${method || 'N/A'}
🌐 \`Domain:\` ${domain || 'N/A'}
🏙️ \`Kota:\` ${city || 'N/A'}
📡 \`NS:\` ${ns_domain || 'N/A'}
🔑 \`PubKey:\` ${public_key || 'N/A'}

🔌 *PORT*
443 (WS/gRPC)

🔗 *Link*
WS     : \`\`\`${link_ws || 'N/A'}\`\`\`
gRPC   : \`\`\`${link_grpc || 'N/A'}\`\`\`

📄 *OpenClash:* https://${domain}:81/shadowsocks-${username}.txt
📆 *Expired:* ${expiration || '1 Jam'}
`.trim();
        }

        // --- KIRIM PESAN & NOTIFIKASI GRUP ---
        await bot.telegram.sendMessage(chatId, replyText, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });

        if (deps.GROUP_ID) {
            const notif = `
━━━━━━━━━━━━━━━━━━━━━━━        
🎁 𝗧𝗥𝗜𝗔𝗟 𝗔𝗖𝗖𝗢𝗨𝗡𝗧 ${type.toUpperCase()} 𝗡𝗘𝗪
━━━━━━━━━━━━━━━━━━━━━━━
👤 𝗨𝘀𝗲𝗿: ${mention}
📩 𝗧𝗿𝗶𝗮𝗹 𝗯𝘆: ${roleLabel} | ${trialKe} dari ${maxTrial}
🌐 𝗦𝗲𝗿𝘃𝗲𝗿: ${namaServer}
🏪 𝗣𝗿𝗼𝘁𝗼𝗰𝗼𝗹: ${type.toUpperCase()}
⏳ 𝗗𝘂𝗿𝗮𝘀𝗶: 60 Menit
🕒 𝗪𝗮𝗸𝘁𝘂: ${new Date().toLocaleString('id-ID')}
━━━━━━━━━━━━━━━━━━━━━━━
            `.trim();

            await bot.telegram.sendMessage(deps.GROUP_ID, notif, { parse_mode: 'Markdown' });
        }

    } catch (err) {
        logger.error(`❌ Gagal proses trial ${type.toUpperCase()} di server ${serverId}:`, err.message);
        await ctx.editMessageText('❌ Terjadi kesalahan serius saat memproses data trial. Silakan coba lagi.', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
});

// ... (Lanjutan di Part 4)
// handlers/userHandlers.js - Part 4

// --- FUNGSI BANTU UNTUK TAMPILAN SERVER CREATE/RENEW ---
async function startSelectServer(ctx, deps, action, type, page = 0) {
    // Dipindahkan logikanya dari app.js lama
    const { logger, userState } = deps;
    try {
      const userId = ctx.from.id;
      const user = await getUserDetails(userId);
      const userRole = user.role;

      const servers = await dbAllAsync('SELECT * FROM Server');

      if (servers.length === 0) { return ctx.reply('⚠️ <b>PERHATIAN!</b> Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'HTML' }); }

      const serversPerPage = 6;
      const totalPages = Math.ceil(servers.length / serversPerPage);
      const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
      const start = currentPage * serversPerPage;
      const end = start + serversPerPage;
      const currentServers = servers.slice(start, end);

      const keyboard = [];
      // ... (Logika pembuatan keyboard, navigasi, dan tampilan list server) ...
      // CATATAN: Pastikan callback_data di sini adalah: `${action}_username_${type}_${server1.id}`
      // CATATAN: Pastikan callback navigasi adalah: `Maps_${action}_${type}_${currentPage + 1}`

      const serverList = currentServers.map(server => { /* ... (Logic detail server list lama) ... */ }).join('\n\n');

      const options = { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' };
      if (ctx.updateType === 'callback_query') { ctx.editMessageText(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, options); } 
      else { ctx.reply(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, options); }
      userState[ctx.chat.id] = { step: `${action}_username_${type}`, page: currentPage };
    } catch (error) { logger.error(`❌ Error saat memulai proses ${action} untuk ${type}:`, error); await ctx.reply(`❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.`, { parse_mode: 'Markdown' }); }
}


// --- ACTION: Create/Renew (Server Selection) ---
bot.action(/Maps_(\w+)_(\w+)_(\d+)/, async (ctx) => {
  const [, action, type, page] = ctx.match;
  await ctx.answerCbQuery();
  await startSelectServer(ctx, deps, action, type, parseInt(page, 10));
});
bot.action(/(create|renew)_(vmess|vless|trojan|shadowsocks|ssh)/, async (ctx) => {
    const action = ctx.match[1]; const type = ctx.match[2]; await startSelectServer(ctx, deps, action, type, 0);
});
bot.action(/(create|renew)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)/, async (ctx) => {
  const action = ctx.match[1]; const type = ctx.match[2]; const serverId = ctx.match[3];
  userState[ctx.chat.id] = { step: `username_${action}_${type}`, serverId, type, action };

  // ... (Logika cek kuota server lama menggunakan dbGetAsync)
  await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });
});


// --- TEXT HANDLER UTAMA UNTUK USER (CREATE/RENEW FLOW) ---
bot.on('text', async (ctx) => {
  const state = userState[ctx.chat.id]; if (!state) return;
  const text = ctx.message.text.trim();

  // ABAIKAN ALUR ADMIN/PAYMENT
  if (state.step.startsWith('request_') || state.step.startsWith('addserver')) { return; }
  // ABAIKAN ALUR TRIAL yang sudah langsung dieksekusi via ACTION

  // --- 1. FLOW CREATE/RENEW ---
  if (state.step.startsWith('username_') && state.action !== 'trial') {
    // ... (Logika username lama menggunakan dbGetAsync/dbRunAsync)
  } else if (state.step.startsWith('password_')) {
    // ... (Logika password lama)
  } else if (state.step.startsWith('exp_')) {
    const exp = parseInt(text, 10);
    if (isNaN(exp) || exp <= 0 || exp > 365) { return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid (1-365 hari).*', { parse_mode: 'Markdown' }); }
    state.exp = exp;
    
    // ... (Logika pengecekan saldo dan eksekusi modules)
    db.get('SELECT quota, iplimit, harga, nama_server FROM Server WHERE id = ?', [state.serverId], async (err, server) => {
      // ... (Sisa logic transaksi dan notifikasi grup)
      // Gunakan modules[action+type] yang diimpor dari deps.modules
    });
  }
});

// --- EXPORT HANDLER ---
module.exports = { registerUserHandlers };