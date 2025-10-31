// handlers/adminHandlers.js - Kode Final

const { 
    db, logger, dbGetAsync, dbRunAsync, dbAllAsync, 
    updateServerField, escapeMarkdown,
    keyboard_nomor, keyboard_abc, keyboard_full 
} = require('../utils/commons');
const fs = require('fs'); // Diperlukan untuk hapuslog
const axios = require('axios'); // Diperlukan untuk broadcast


// --- FUNGSI TAMPILAN MENU ADMIN ---
async function sendAdminMenu(ctx) {
  const adminKeyboard = [
    [{ text: '➕ Tambah Server', callback_data: 'addserver' }, { text: '❌ Hapus Server', callback_data: 'deleteserver' }],
    [{ text: '💲 Edit Harga', callback_data: 'editserver_harga' }, { text: '📝 Edit Nama', callback_data: 'editserver_nama_server' }],
    [{ text: '🌐 Edit Domain', callback_data: 'editserver_domain' }, { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }],
    [{ text: '📊 Edit Quota', callback_data: 'editserver_quota' }, { text: '📶 Edit Limit IP', callback_data: 'editserver_iplimit' }],
    [{ text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' }, { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }],
    [{ text: '💵 Tambah Saldo', callback_data: 'addsaldo_user' }, { text: '📋 List Server', callback_data: 'listserver' }],
    [{ text: '♻️ Reset DB (Hapus Semua Server)', callback_data: 'resetdb' }, { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }],
    [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
  ];
  try {
    const options = { reply_markup: { inline_keyboard: adminKeyboard } };
    if (ctx.updateType === 'callback_query') { await ctx.editMessageText('Menu Admin:', options); }
    else { await ctx.reply('Menu Admin:', options); }
  } catch (error) { logger.error('Error saat mengirim menu admin:', error); }
}


// --- FUNGSI BANTU UNTUK HANDLE INPUT KEYBOARD ---

async function handleNumericInput(ctx, userStateData, data, field, fieldName, query, isAddSaldo = false) {
  let currentValue = userStateData[field] || ''; await ctx.answerCbQuery();
  
  if (data === 'delete') { currentValue = currentValue.slice(0, -1); }
  else if (data === 'confirm') {
    if (currentValue.length === 0 || isNaN(parseFloat(currentValue)) || parseFloat(currentValue) <= 0) { return ctx.reply(`❌ *${fieldName} tidak valid.* Masukkan angka yang valid.`, { parse_mode: 'Markdown' }); }
    const numericValue = parseFloat(currentValue);
    try {
      if (isAddSaldo) { 
        const targetUserId = userStateData.targetUserId;
        const row = await dbGetAsync("SELECT * FROM users WHERE user_id = ?", [targetUserId]);
        if (!row) { return ctx.reply('⚠️ `user_id` target tidak terdaftar. Buat akun baru (/start) terlebih dahulu.', { parse_mode: 'Markdown' }); }
        await dbRunAsync('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [numericValue, targetUserId]);
        ctx.reply(`✅ *Saldo berhasil ditambahkan.*\n\n📄 *Detail Saldo:*\n- User ID: ${targetUserId}\n- Jumlah Saldo: *Rp ${numericValue.toLocaleString('id-ID')}*`, { parse_mode: 'Markdown' });
      }
      else { 
        // Update Server
        const updateQuery = query.replace('harga', fieldName.includes('harga') ? 'harga' : field); // Fix field name if it's 'amount' in state but 'harga' in DB
        await updateServerField(userStateData.serverId, numericValue, updateQuery); 
        ctx.reply(`✅ *${fieldName} server berhasil diupdate.*\n\n📄 *Detail Server:*\n- ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} Baru: *${fieldName.includes('harga') ? 'Rp ' + numericValue.toLocaleString('id-ID') : numericValue}*`, { parse_mode: 'Markdown' }); 
      }
    } catch (err) { logger.error(`Error updating field ${fieldName}:`, err.message); ctx.reply(`❌ *Terjadi kesalahan saat mengupdate ${fieldName} server.*`, { parse_mode: 'Markdown' }); }
    delete userState[ctx.chat.id]; return;
  } else if (!/^\d+$/.test(data)) { return; }
  else { if (currentValue.length < 12) { currentValue += data; } else { return ctx.reply('⚠️ *Jumlah maksimal adalah 12 digit!*', { parse_mode: 'Markdown' }); } }

  userStateData[field] = currentValue;
  const displayValue = isAddSaldo || fieldName.includes('harga server') ? `Rp ${parseFloat(currentValue).toLocaleString('id-ID')}` : currentValue;
  const newMessage = `💵 *Silakan masukkan ${fieldName} baru:*\n\n${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} saat ini: *${displayValue}*`;
  try { await ctx.editMessageText(newMessage, { reply_markup: { inline_keyboard: keyboard_nomor() }, parse_mode: 'Markdown' }); } catch (error) { if (!error.message.includes('message is not modified')) logger.error('Error editing message during numeric input:', error); }
}

async function handleTextInput(ctx, userStateData, data, field, fieldName, query) {
  let currentValue = userStateData[field] || ''; await ctx.answerCbQuery();
  
  if (data === 'delete') { currentValue = currentValue.slice(0, -1); }
  else if (data === 'confirm') {
    if (currentValue.length === 0) { return ctx.reply(`❌ *${fieldName} tidak boleh kosong.*`, { parse_mode: 'Markdown' }); }
    try {
      await updateServerField(userStateData.serverId, currentValue, query);
      ctx.reply(`✅ *${fieldName} server berhasil diupdate.*\n\n📄 *Detail Server:*\n- ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} Baru: *${currentValue}*`, { parse_mode: 'Markdown' });
    } catch (err) { logger.error(`Error updating field ${fieldName}:`, err.message); ctx.reply(`❌ *Terjadi kesalahan saat mengupdate ${fieldName} server.*`, { parse_mode: 'Markdown' }); }
    delete userState[ctx.chat.id]; return;
  } else if (!/^[a-zA-Z0-9.\-_@]+$/.test(data)) { return; }
  else { if (currentValue.length < 253) { currentValue += data; } else { return ctx.reply(`⚠️ *${fieldName} maksimal adalah 253 karakter!*`, { parse_mode: 'Markdown' }); } }

  userStateData[field] = currentValue;
  const keyboard = fieldName === 'nama server' ? keyboard_abc() : keyboard_full();
  const newMessage = `📊 *Silakan masukkan ${fieldName} server baru:*\n\n${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} saat ini: *${currentValue}*`;
  try { await ctx.editMessageText(newMessage, { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' }); } catch (error) { if (!error.message.includes('message is not modified')) logger.error('Error editing message during text input:', error); }
}


function registerAdminHandlers(bot, deps) {
    const { logger, adminIds, userState, BOT_TOKEN } = deps;

    // --- COMMANDS UTAMA ---
    bot.command('admin', async (ctx) => {
        if (!adminIds.includes(ctx.from.id)) { await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses menu admin.'); return; }
        await sendAdminMenu(ctx);
    });

    bot.command('addsaldo', async (ctx) => {
      const userId = ctx.message.from.id;
      if (!adminIds.includes(userId)) { return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' }); }
      const args = ctx.message.text.split(' ');
      if (args.length !== 3) { return ctx.reply('⚠️ Format salah. Gunakan: `/addsaldo <user_id> <jumlah>`', { parse_mode: 'Markdown' }); }
      const targetUserId = parseInt(args[1]);
      const amount = parseInt(args[2]);
      if (isNaN(targetUserId) || isNaN(amount) || amount <= 0) { return ctx.reply('⚠️ `user_id` dan `jumlah` harus berupa angka positif.', { parse_mode: 'Markdown' }); }
      
      try {
          const row = await dbGetAsync("SELECT * FROM users WHERE user_id = ?", [targetUserId]);
          if (!row) { return ctx.reply('⚠️ `user_id` tidak terdaftar.', { parse_mode: 'Markdown' }); }
          const result = await dbRunAsync("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [amount, targetUserId]);
          if (result.changes === 0) { return ctx.reply('⚠️ Pengguna tidak ditemukan.', { parse_mode: 'Markdown' }); }
          ctx.reply(`✅ Saldo sebesar \`${amount.toLocaleString('id-ID')}\` berhasil ditambahkan untuk \`user_id\` \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
      } catch (err) {
          logger.error('Error running /addsaldo:', err.message);
          return ctx.reply('⚠️ Kesalahan saat menambahkan saldo.', { parse_mode: 'Markdown' });
      }
    });

    bot.command('hapuslog', async (ctx) => {
      if (!adminIds.includes(ctx.from.id)) return ctx.reply('Tidak ada izin!');
      try {
        if (fs.existsSync('bot-combined.log')) fs.unlinkSync('bot-combined.log');
        if (fs.existsSync('bot-error.log')) fs.unlinkSync('bot-error.log');
        ctx.reply('Log berhasil dihapus.');
      } catch (e) { ctx.reply('Gagal menghapus log: ' + e.message); }
    });
    
    bot.command('helpadmin', async (ctx) => {
      const userId = ctx.message.from.id;
      if (!adminIds.includes(userId)) { return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' }); }
      const helpMessage = `*📋 Daftar Perintah Admin:*\n1. \`/admin\` - Akses menu admin (CRUD Server, Saldo).\n2. \`/addsaldo <user_id> <jumlah>\` - Menambahkan saldo langsung ke user.\n3. \`/hapuslog\` - Menghapus file log bot.\n4. \`/broadcast <pesan>\` - Mengirim pesan ke semua pengguna bot.\n`;
      ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    });
    
    bot.command('broadcast', async (ctx) => {
      const userId = ctx.message.from.id;
      if (!adminIds.includes(userId)) { return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' }); }
      const message = ctx.message.reply_to_message ? ctx.message.reply_to_message.text : ctx.message.text.split(' ').slice(1).join(' ');
      if (!message) { return ctx.reply('⚠️ Mohon berikan pesan untuk disiarkan.', { parse_mode: 'Markdown' }); }
      
      try {
        const rows = await dbAllAsync("SELECT user_id FROM users", []);
        rows.forEach((row) => {
            const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
            axios.post(telegramUrl, { chat_id: row.user_id, text: message }).catch((error) => { logger.error(`⚠️ Kesalahan saat mengirim pesan siaran ke ${row.user_id}`, error.message); });
        });
        ctx.reply('✅ Pesan siaran berhasil dikirim.', { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply('⚠️ Kesalahan saat mengambil daftar pengguna.', { parse_mode: 'Markdown' });
      }
    });

    // --- ACTION HANDLER ADMIN MENU ---
    bot.action('admin_menu', async (ctx) => {
        await ctx.answerCbQuery();
        await sendAdminMenu(ctx);
    });
    
    // --- ACTION: CRUD UMUM (RESET & DELETE) ---
    bot.action('resetdb', async (ctx) => {
        try { 
            await ctx.answerCbQuery(); 
            await ctx.reply('🚨 *PERHATIAN! Anda akan menghapus semua server yang tersedia. Apakah Anda yakin?*', { 
                reply_markup: { inline_keyboard: [
                    [{ text: '✅ Ya', callback_data: 'confirm_resetdb' }], 
                    [{ text: '❌ Tidak', callback_data: 'cancel_resetdb' }]
                ] }, 
                parse_mode: 'Markdown' 
            }); 
        } catch (error) { await ctx.reply(`❌ *Terjadi kesalahan.*`, { parse_mode: 'Markdown' }); }
    });
    
    bot.action('confirm_resetdb', async (ctx) => { 
        try {
            await ctx.answerCbQuery();
            await dbRunAsync('DELETE FROM Server');
            await ctx.reply('🚨 *PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.*', { parse_mode: 'Markdown' });
        } catch (error) { 
            await ctx.reply(`❌ *Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!*`, { parse_mode: 'Markdown' }); 
        }
    });
    
    bot.action('cancel_resetdb', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('❌ *Proses reset database dibatalkan.*', { parse_mode: 'Markdown' }); });
    
    // --- ACTION: Tambah Server (Memulai Flow Input) ---
    bot.action('addserver', async (ctx) => {
      try {
        await ctx.answerCbQuery('Memulai penambahan server...');
        await ctx.reply('🌐 *Silakan masukkan domain/ip server:*', { parse_mode: 'Markdown' });
        userState[ctx.chat.id] = { step: 'addserver' };
      }
      catch (error) { await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' }); }
    });

    // --- ACTION: Hapus Server (Menampilkan List) ---
    bot.action('deleteserver', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const servers = await dbAllAsync('SELECT id, nama_server FROM Server');
        if (servers.length === 0) { return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' }); }
        
        const keyboard = servers.map(server => { return [{ text: server.nama_server, callback_data: `confirm_delete_server_${server.id}` }]; });
        keyboard.push([{ text: '🔙 Kembali', callback_data: 'admin_menu' }]);
        
        ctx.reply('🗑️ *Pilih server yang ingin dihapus:*', { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
      } catch (error) { await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' }); }
    });
    
    // --- ACTION: Konfirmasi Hapus Server ---
    bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const result = await dbRunAsync('DELETE FROM Server WHERE id = ?', [ctx.match[1]]);
        if (result.changes === 0) { return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' }); }
        ctx.reply('✅ *Server berhasil dihapus.*', { parse_mode: 'Markdown' });
      } catch (error) { await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' }); }
    });

    // --- ACTION: Memulai Edit Server (Callback Query Pattern) ---
    bot.action(/editserver_(.+)/, async (ctx) => {
        const field = ctx.match[1];
        await ctx.answerCbQuery(`Memilih server untuk edit ${field}...`);

        try {
            const servers = await dbAllAsync('SELECT id, nama_server FROM Server');
            if (servers.length === 0) { return ctx.reply('⚠️ *Tidak ada server untuk diedit.*', { parse_mode: 'Markdown' }); }

            const keyboard = servers.map(server => {
                // Callback: edit_${field}_${serverId}
                return [{ text: server.nama_server, callback_data: `edit_${field}_${server.id}` }];
            });
            keyboard.push([{ text: '🔙 Kembali', callback_data: 'admin_menu' }]);

            ctx.editMessageText(`📝 *Pilih server untuk mengedit ${field}:*`, {
                reply_markup: { inline_keyboard: keyboard },
                parse_mode: 'Markdown'
            });
        } catch (e) {
            logger.error('Error in editserver action:', e.message);
            ctx.reply('❌ Gagal menampilkan daftar server.', { parse_mode: 'Markdown' });
        }
    });

    // --- ACTION: Memulai Input Edit Saldo ---
    bot.action('addsaldo_user', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            userState[ctx.chat.id] = { step: 'request_user_id_for_add_saldo' };
            await ctx.editMessageText('👤 *Silakan masukkan User ID Telegram yang ingin ditambahkan saldonya (angka):*', { parse_mode: 'Markdown' });
        } catch (error) { await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda.*', { parse_mode: 'Markdown' }); }
    });

    // --- ACTION: Memulai Input Edit Spesifik Server (Mengatur State) ---
    bot.action(/edit_(harga|nama_server|domain|auth|quota|iplimit|batas_create_akun|total_create_akun)_(\d+)/, async (ctx) => {
        const field = ctx.match[1];
        const serverId = ctx.match[2];
        const fieldToState = {
            'harga': 'amount', 'nama_server': 'name', 'domain': 'domain', 'auth': 'auth', 
            'quota': 'quota', 'iplimit': 'iplimit', 'batas_create_akun': 'batasCreateAkun', 
            'total_create_akun': 'totalCreateAkun'
        };
        const fieldName = {
            'harga': 'harga server', 'nama_server': 'nama server', 'domain': 'domain server', 'auth': 'auth server', 
            'quota': 'quota server', 'iplimit': 'limit IP', 'batas_create_akun': 'batas create akun', 
            'total_create_akun': 'total create akun'
        };
        const isNumeric = ['harga', 'quota', 'iplimit', 'batas_create_akun', 'total_create_akun'].includes(field);
        const keyboard = isNumeric ? keyboard_nomor() : (field === 'nama_server' ? keyboard_abc() : keyboard_full());
        
        await ctx.answerCbQuery(`Memulai input untuk ${fieldName[field]}...`);
        userState[ctx.chat.id] = { step: `edit_${field}`, serverId: serverId, [fieldToState[field]]: '' };
        
        await ctx.reply(`📝 *Silakan masukkan ${fieldName[field]} baru:*`, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
        });
    });


    // --- TEXT HANDLER UTAMA UNTUK ADMIN FLOW ---
    bot.on('text', async (ctx) => {
        const state = userState[ctx.chat.id]; if (!state) return;
        const text = ctx.message.text.trim();

        // 1. FLOW ADMIN ADD SALDO (Meminta Jumlah Saldo)
        if (state.step === 'request_user_id_for_add_saldo') {
            const targetUserId = parseInt(text, 10);
            if (isNaN(targetUserId)) { return ctx.reply('❌ *User ID tidak valid.* Masukkan ID Telegram berupa angka.', { parse_mode: 'Markdown' }); }
            state.step = 'request_amount_for_add_saldo';
            state.targetUserId = targetUserId;
            await ctx.reply(`💵 *Masukkan jumlah saldo (hanya angka) yang ingin ditambahkan ke User ID ${targetUserId}:*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard_nomor() } });
        }
        
        // 2. FLOW ADMIN ADD SERVER
        else if (state.step === 'addserver' || state.step.startsWith('addserver_')) {
          // Logic Add Server multi-step
          if (state.step === 'addserver') {
            const domain = text; if (!domain) { return ctx.reply('⚠️ *Domain tidak boleh kosong.*', { parse_mode: 'Markdown' }); } state.step = 'addserver_auth'; state.domain = domain; await ctx.reply('🔑 *Silakan masukkan auth server:*', { parse_mode: 'Markdown' });
          } else if (state.step === 'addserver_auth') {
            const auth = text; if (!auth) { return ctx.reply('⚠️ *Auth tidak boleh kosong.*', { parse_mode: 'Markdown' }); } state.step = 'addserver_nama_server'; state.auth = auth; await ctx.reply('🏷️ *Silakan masukkan nama server:*', { parse_mode: 'Markdown' });
          } else if (state.step === 'addserver_nama_server') {
            const nama_server = text; if (!nama_server) { return ctx.reply('⚠️ *Nama server tidak boleh kosong.*', { parse_mode: 'Markdown' }); } state.step = 'addserver_quota'; state.nama_server = nama_server; await ctx.reply('📊 *Silakan masukkan quota server (GB):*', { parse_mode: 'Markdown' });
          } else if (state.step === 'addserver_quota') {
            const quota = parseInt(text, 10); if (isNaN(quota) || quota <= 0) { return ctx.reply('⚠️ *Quota tidak valid.*', { parse_mode: 'Markdown' }); } state.step = 'addserver_iplimit'; state.quota = quota; await ctx.reply('🔢 *Silakan masukkan limit IP server:*', { parse_mode: 'Markdown' });
          } else if (state.step === 'addserver_iplimit') {
            const iplimit = parseInt(text, 10); if (isNaN(iplimit) || iplimit <= 0) { return ctx.reply('⚠️ *Limit IP tidak valid.*', { parse_mode: 'Markdown' }); } state.step = 'addserver_batas_create_akun'; state.iplimit = iplimit; await ctx.reply('🔢 *Silakan masukkan batas create akun server:*', { parse_mode: 'Markdown' });
          } else if (state.step === 'addserver_batas_create_akun') {
            const batas_create_akun = parseInt(text, 10); if (isNaN(batas_create_akun) || batas_create_akun <= 0) { return ctx.reply('⚠️ *Batas create akun tidak valid.*', { parse_mode: 'Markdown' }); } state.step = 'addserver_harga'; state.batas_create_akun = batas_create_akun; await ctx.reply('💰 *Silakan masukkan harga server (per hari):*', { parse_mode: 'Markdown' });
          } else if (state.step === 'addserver_harga') {
            const harga = parseFloat(text); if (isNaN(harga) || harga <= 0) { return ctx.reply('⚠️ *Harga tidak valid.*', { parse_mode: 'Markdown' }); }
            const { domain, auth, nama_server, quota, iplimit, batas_create_akun } = state;
            try {
              await dbRunAsync('INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, 0]);
              ctx.reply(`✅ *Server baru dengan domain ${domain} telah berhasil ditambahkan.*\n\n📄 *Detail Server:*\n- Domain: ${domain}\n- Auth: ${auth}\n- Nama Server: ${nama_server}\n- Quota: ${quota}\n- Limit IP: ${iplimit}\n- Batas Create Akun: ${batas_create_akun}\n- Harga: Rp ${harga.toLocaleString('id-ID')}`, { parse_mode: 'Markdown' });
            } catch (error) { logger.error('Error saat menambahkan server:', error); await ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' }); }
            delete userState[ctx.chat.id];
          }
        }
    });

    // --- CALLBACK QUERY HANDLER: INPUT NUMERIC/TEXT ---
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        const userStateData = userState[ctx.chat.id];
        // Hanya proses jika state aktif dan data adalah input keyboard
        if (!userStateData || !data.match(/^(confirm|delete|\d+)$/)) return;
        
        // Mapping state steps ke fungsi handler
        const handlerMap = {
            'request_amount_for_add_saldo': { fn: handleNumericInput, field: 'amount', name: 'jumlah saldo', query: 'N/A', isAddSaldo: true },
            'edit_batas_create_akun': { fn: handleNumericInput, field: 'batasCreateAkun', name: 'batas create akun', query: 'UPDATE Server SET batas_create_akun = ? WHERE id = ?', isNumeric: true },
            'edit_total_create_akun': { fn: handleNumericInput, field: 'totalCreateAkun', name: 'total create akun', query: 'UPDATE Server SET total_create_akun = ? WHERE id = ?', isNumeric: true },
            'edit_limit_ip': { fn: handleNumericInput, field: 'iplimit', name: 'limit IP', query: 'UPDATE Server SET iplimit = ? WHERE id = ?', isNumeric: true },
            'edit_quota': { fn: handleNumericInput, field: 'quota', name: 'quota server', query: 'UPDATE Server SET quota = ? WHERE id = ?', isNumeric: true },
            'edit_harga': { fn: handleNumericInput, field: 'amount', name: 'harga server', query: 'UPDATE Server SET harga = ? WHERE id = ?', isNumeric: true },
            'edit_auth': { fn: handleTextInput, field: 'auth', name: 'auth server', query: 'UPDATE Server SET auth = ? WHERE id = ?', isNumeric: false },
            'edit_domain': { fn: handleTextInput, field: 'domain', name: 'domain server', query: 'UPDATE Server SET domain = ? WHERE id = ?', isNumeric: false },
            'edit_nama_server': { fn: handleTextInput, field: 'name', name: 'nama server', query: 'UPDATE Server SET nama_server = ? WHERE id = ?', isNumeric: false },
        };
        
        const handler = handlerMap[userStateData.step];

        if (handler) {
            await handler.fn(ctx, userStateData, data, handler.field, handler.name, handler.query, handler.isAddSaldo || handler.isNumeric);
        }
    });

    // --- EXPORT HANDLER ---
    module.exports = { registerAdminHandlers };
}