const { db, logger, dbGetAsync, dbRunAsync } = require('../utils/commons');

// --- FUNGSI GENERATE PEMBAYARAN PAKASIR ---
async function generatePakasirPayment(userId, amount, deps) {
    const { pakasir, PAKASIR_WEBHOOK_URL } = deps;
    const orderId = `PKS-${userId}-${Date.now()}`;
    const redirectUrl = PAKASIR_WEBHOOK_URL.replace('/webhook/pakasir', '/topup-success');
    
    // Memanggil fungsi Pakasir Client yang sudah diinisialisasi di app.js
    const paymentUrl = pakasir.generatePaymentUrl({
        orderId: orderId, amount: amount, redirect: redirectUrl, qrisOnly: true
    });

    // Simpan detail deposit ke DB sebelum membuat tautan
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 jam
    await dbRunAsync(`INSERT INTO pending_deposits_pakasir (user_id, order_id, amount, status, payment_method, payment_data, expired_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, orderId, amount, 'pending', 'qris', paymentUrl, expiresAt]
    );
    
    return { orderId, paymentUrl, amount };
}

// --- FUNGSI WEBHOOK HANDLER (DIPANGGIL DARI app.js) ---
async function handlePakasirWebhook(payload, botInstance, deps) {
    const { db, logger, GROUP_ID, PAKASIR_PROJECT_SLUG } = deps;
    const { order_id, amount, status, project } = payload;
    
    if (status !== 'completed' || project !== PAKASIR_PROJECT_SLUG) {
        logger.warn(`Webhook received but status is not completed or project mismatch. Order ID: ${order_id}, Status: ${status}`);
        return;
    }

    if (global.processedTransactions.has(order_id)) {
        logger.warn(`Webhook received but transaction already processed: ${order_id}`);
        return;
    }
    global.processedTransactions.add(order_id);

    // Cek di DB apakah deposit pending
    const row = await dbGetAsync('SELECT user_id, status FROM pending_deposits_pakasir WHERE order_id = ? AND status = ?', [order_id, 'pending']);
    if (!row) { 
        logger.warn(`Pending deposit not found or already completed for Order ID: ${order_id}`); 
        return; 
    }
    
    const userId = row.user_id;
    
    // --- TRANSAKSI SALDO (Menggunakan TRANSACTION DB untuk keamanan) ---
    db.run('BEGIN TRANSACTION');
    try {
        // 1. Update Saldo User
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, userId], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        // 2. Update Status Deposit
        await dbRunAsync('UPDATE pending_deposits_pakasir SET status = ?, payment_method = ? WHERE order_id = ?', ['completed', payload.payment_method || 'QRIS', order_id]);
        
        db.run('COMMIT');
        logger.info(`✅ Saldo user ${userId} berhasil ditambahkan via Pakasir Webhook. Amount: ${amount}`);

        // 3. NOTIFIKASI KE USER (KODE LAMA DARI app.js)
        const messageText = 
            `🎉 <b>TOP UP SALDO BERHASIL (OTOMATIS)</b> 🎉\n\n` +
            `Invoice: <code>${order_id}</code>\n` +
            `Jumlah ditambahkan: <b>Rp ${amount.toLocaleString('id-ID')}</b>\n` +
            `Metode: ${payload.payment_method || 'QRIS'}\n\n` +
            `Saldo Anda telah diupdate. Terima kasih!`;
        
        botInstance.telegram.sendMessage(userId, messageText, { parse_mode: 'HTML' }).catch(e => logger.error(`Failed to notify user ${userId}: ${e.message}`));
        
        // 4. NOTIFIKASI KE GRUP ADMIN (KODE LAMA DARI app.js)
        botInstance.telegram.sendMessage(GROUP_ID, 
            `📢 <b>NOTIFIKASI TOP UP TUNNEL FT DOR</b>\n\n` +
            `✅ *Top Up Berhasil*\n` +
            `User ID: <code>${userId}</code>\n` +
            `Order ID: <code>${order_id}</code>\n` +
            `Jumlah: <b>Rp ${amount.toLocaleString('id-ID')}</b>\n` +
            `Metode: ${payload.payment_method || 'QRIS'}`,
            { parse_mode: 'HTML' }
        ).catch(e => logger.error(`Failed to notify admin group: ${e.message}`));

    } catch (e) {
        db.run('ROLLBACK'); 
        logger.error(`Error processing Pakasir webhook for ${order_id}: ${e.message}`);
    }
}


function registerPaymentHandlers(bot, deps) {
    const { logger, userState, MIN_DEPOSIT_AMOUNT, pakasir } = deps;

    // --- ACTION: Memulai Top Up Saldo ---
    bot.action('topup_saldo', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            userState[ctx.chat.id] = { step: 'request_pakasir_amount', amount: '' };
            await ctx.editMessageText(
                `💰 *TOP UP SALDO (OTOMATIS)*\n\n` +
                `Silakan masukkan jumlah nominal saldo (hanya angka) yang Anda ingin tambahkan ke akun Anda.\n` +
                `Minimal Top Up adalah *Rp ${MIN_DEPOSIT_AMOUNT.toLocaleString('id-ID')}*.\n\n` +
                `_Contoh: 50000_`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            logger.error('❌ Kesalahan saat memulai proses top-up saldo otomatis:', error);
            await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
        }
    });

    // --- ACTION: Membuat Pembayaran Pakasir ---
    bot.action(/create_pakasir_payment_(\d+)/, async (ctx) => {
        const amount = parseInt(ctx.match[1], 10);
        const userId = ctx.from.id;
        await ctx.answerCbQuery('Membuat tautan pembayaran Pakasir...');

        try {
            const { orderId, paymentUrl } = await generatePakasirPayment(userId, amount, deps);

            // --- DETAIL FORMAT PESAN (KODE LAMA DARI app.js) ---
            const expiryDate = new Date(Date.now() + 60 * 60 * 1000);
            const expiryText = expiryDate.toLocaleTimeString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

            const message =
                `✅ *TAUTAN PEMBAYARAN TERSEDIA*\n\n` +
                `Invoice ID: \`${orderId}\`\n` +
                `Nominal: *Rp ${amount.toLocaleString('id-ID')}*\n` +
                `Metode: *QRIS*\n` +
                `Kadaluarsa: ${expiryText} WIB\n\n` +
                `Klik tombol di bawah untuk membayar menggunakan QRIS. Saldo akan ditambahkan otomatis setelah pembayaran berhasil dikonfirmasi. Jika sudah, tekan tombol Cek Status Transaksi agar saldo kamu langsung masuk.\n\n` +
                ``;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💳 Klik Untuk Bayar (QRIS)', url: paymentUrl }],
                        [{ text: '🔄 Cek Status Transaksi', callback_data: `check_pakasir_status_${orderId}` }],
                        [{ text: '❌ Batalkan', callback_data: 'send_main_menu' }]
                    ]
                }
            });
        } catch (error) {
            logger.error('❌ Error creating Pakasir payment:', error.message);
            await ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat membuat tautan pembayaran. Coba lagi nanti.', { parse_mode: 'Markdown' });
        }
    });

    // --- ACTION: Cek Status Pakasir ---
    bot.action(/check_pakasir_status_(.+)/, async (ctx) => {
        const orderId = ctx.match[1];
        await ctx.answerCbQuery('Mengecek status pembayaran...');
        
        try {
            const pending = await dbGetAsync('SELECT amount FROM pending_deposits_pakasir WHERE order_id = ? AND status = ?', [orderId, 'pending']);

            if (!pending) { return ctx.reply('✅ *Transaksi sudah selesai atau tidak ditemukan.* Silakan cek saldo Anda.', { parse_mode: 'Markdown' }); }

            const amount = pending.amount;
            const statusResponse = await pakasir.checkTransactionStatus(orderId, amount);
            const status = statusResponse.transaction.status;

            if (status === 'completed') {
                // Panggil webhook handler untuk memproses saldo secara manual jika cek status berhasil
                await handlePakasirWebhook({ order_id: orderId, amount: amount, project: deps.PAKASIR_PROJECT_SLUG, status: 'completed', payment_method: 'qris' }, bot, deps);
                return ctx.reply('✅ *Pembayaran berhasil dikonfirmasi!* Saldo Anda telah ditambahkan secara otomatis.', { parse_mode: 'Markdown' });
            } else if (status === 'pending') {
                return ctx.reply(`⏳ *Status Transaksi: Menunggu Pembayaran*\n\nInvoice: \`${orderId}\`\nNominal: *Rp ${amount.toLocaleString('id-ID')}*\n\nMohon selesaikan pembayaran sebelum batas waktu.`, { parse_mode: 'Markdown' });
            } else { 
                return ctx.reply(`❌ *Status Transaksi: ${status.toUpperCase()}*\n\nTransaksi ini sudah tidak valid. Silakan buat transaksi Top Up baru.`, { parse_mode: 'Markdown' });
            }

        } catch (error) {
            logger.error('❌ Error checking Pakasir status:', error.message);
            await ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat mengecek status pembayaran. Coba lagi nanti.', { parse_mode: 'Markdown' });
        }
    });

    // --- TEXT HANDLER: Top Up Nominal ---
    bot.on('text', async (ctx) => {
        const state = userState[ctx.chat.id]; if (!state) return;
        const text = ctx.message.text.trim();

        if (state.step === 'request_pakasir_amount') {
            const amount = parseInt(text, 10);
            if (isNaN(amount) || amount < MIN_DEPOSIT_AMOUNT) { return ctx.reply(`❌ *Nominal tidak valid.* Masukkan angka yang valid (minimal Rp${MIN_DEPOSIT_AMOUNT.toLocaleString('id-ID')}).`, { parse_mode: 'Markdown' }); }
            
            await ctx.reply(`📝 *Konfirmasi Top Up Saldo Otomatis:*\n\n💰 Jumlah Nominal: *Rp ${amount.toLocaleString('id-ID')}*\n\nTekan tombol di bawah untuk membuat tautan pembayaran QRIS Pakasir.`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `💳 Buat Pembayaran Rp ${amount.toLocaleString('id-ID')}`, callback_data: `create_pakasir_payment_${amount}` }],
                        [{ text: '❌ Batalkan', callback_data: 'send_main_menu' }]
                    ]
                },
                parse_mode: 'Markdown'
            });
            delete userState[ctx.chat.id];
        }
    });
}

// --- EXPORT HANDLER ---
module.exports = { registerPaymentHandlers, handlePakasirWebhook };
