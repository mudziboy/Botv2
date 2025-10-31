const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const winston = require('winston');
const { PakasirClient } = require('pakasir-client');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron'); 
const rateLimit = require('telegraf-ratelimit'); 

// --- IMPOR MODUL HANDLER & UTILITAS (Placeholder, akan dibuat nanti) ---
// CATATAN: Pastikan Anda membuat file-file ini di folder yang sesuai
const { logger, db, getUserDetails } = require('./utils/commons');
const { registerUserHandlers } = require('./handlers/userHandlers');
const { registerAdminHandlers } = require('./handlers/adminHandlers');
const { registerPaymentHandlers, handlePakasirWebhook } = require('./handlers/paymentHandlers');

// --- KONSTANTA GLOBAL (Sesuai kode lama) ---
const PAKASIR_API_KEY = 'nnzphsnFdNhY60jIWXgu7v87CtljahsL';
const PAKASIR_PROJECT_SLUG = 'autobot-vpn';
const PAKASIR_WEBHOOK_URL = 'https://sagivpn.my.id/webhook/pakasir';
const MIN_DEPOSIT_AMOUNT = 10000;
const RESELLER_PRICE = 30000;
const RESELLER_DISCOUNT_PERCENT = 40;
const ADMIN_USERNAME_TEMBAK_PAKET = '@dorinajabot';
const TRIAL_EXPIRY_HOURS = 1;
const MEMBER_TRIAL_LIMIT = 3; 
const RESELLER_TRIAL_LIMIT = 10;

// --- KONSTANTA DARI .VARS.JSON ---
const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));
const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 50123;
const ADMIN_RAW = vars.USER_ID;
const NAMA_STORE = vars.NAMA_STORE;
const GROUP_ID = vars.GROUP_ID;

// --- KONSTANTA VALIDASI CHANNEL WAJIB (HARUS DIGANTI OLEH ANDA!) ---
const REQUIRED_CHANNEL_USERNAME = '@tunnelftdor'; 
const REQUIRED_CHANNEL_ID = -1003270561006; 

// --- INIT UTAMA ---
const app = express();
const bot = new Telegraf(BOT_TOKEN);
const pakasir = new PakasirClient({ project: PAKASIR_PROJECT_SLUG, apiKey: PAKASIR_API_KEY });
const userState = {};
global.processedTransactions = new Set();

// --- INICIALISASI ADMIN ID ---
let adminIds = [];
if (Array.isArray(ADMIN_RAW)) { adminIds = ADMIN_RAW.map(id => parseInt(id)).filter(id => !isNaN(id)); } 
else if (ADMIN_RAW) { adminIds = [parseInt(ADMIN_RAW)].filter(id => !isNaN(id)); }
if (adminIds.length === 0) { logger.error("⚠️ PERINGATAN! Admin ID tidak terdeteksi atau tidak valid di .vars.json."); }
logger.info(`✅ Bot initialized. Admin IDs: ${adminIds.join(', ')}`);

// --- MIDDLEWARE EXPRESS ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- MIDDLEWARE RATE LIMIT (Mencegah Frozen/Spam) ---
const limitConfig = {
    window: 3000, // 3 detik
    limit: 3,     // 3 aksi/pesan
    onLimitExceeded: (ctx) => {
        logger.warn(`Rate limit exceeded for user ${ctx.from.id}`);
        if (!userState[ctx.from.id]?.limitMessageSent) {
             ctx.reply('⚠️ Harap jangan terlalu cepat! Mohon tunggu sebentar.').catch(e => logger.error('Rate limit reply error:', e));
             userState[ctx.from.id] = { limitMessageSent: true };
             setTimeout(() => { userState[ctx.from.id].limitMessageSent = false; }, 5000); // Reset flag setelah 5 detik
        }
    },
    keyGenerator: (ctx) => ctx.from.id,
};
bot.use(rateLimit(limitConfig));
logger.info('✅ Rate Limiter activated (3 messages / 3 seconds).');

// --- MIDDLEWARE CLEAR STATE (Mencegah State Macet) ---
bot.use(async (ctx, next) => {
    if (ctx.from && userState[ctx.from.id] && !userState[ctx.from.id].timeout) {
        userState[ctx.from.id].timeout = setTimeout(() => {
            delete userState[ctx.from.id];
            logger.info(`User state for ${ctx.from.id} cleared after 30 minutes timeout.`);
            // Beri notifikasi ke user (opsional)
            ctx.reply('⏳ *Sesi Anda berakhir.* Silakan ketik /start untuk mulai lagi.', { parse_mode: 'Markdown' }).catch(e => {});
        }, 1800000); // 30 menit
    } else if (ctx.from && userState[ctx.from.id]?.timeout) {
        clearTimeout(userState[ctx.from.id].timeout);
        userState[ctx.from.id].timeout = setTimeout(() => {
            delete userState[ctx.from.id];
            logger.info(`User state for ${ctx.from.id} cleared after 30 minutes timeout.`);
            ctx.reply('⏳ *Sesi Anda berakhir.* Silakan ketik /start untuk mulai lagi.', { parse_mode: 'Markdown' }).catch(e => {});
        }, 1800000); // 30 menit
    }
    await next();
});
logger.info('✅ User state timeout mechanism active (30 minutes).');


// --- DEKLARASI SHARED DEPENDENCIES ---
// Objek ini berisi semua yang dibutuhkan oleh handler lain
const sharedDependencies = {
    // Utilities dari commons.js (Asumsikan diimpor)
    db, logger, getUserDetails,
    // Konstanta & Konfigurasi
    adminIds, userState, NAMA_STORE, GROUP_ID, ADMIN_USERNAME_TEMBAK_PAKET,
    REQUIRED_CHANNEL_ID, REQUIRED_CHANNEL_USERNAME,
    PAKASIR_PROJECT_SLUG,
    // Harga & Limit
    MIN_DEPOSIT_AMOUNT, RESELLER_PRICE, RESELLER_DISCOUNT_PERCENT, 
    MEMBER_TRIAL_LIMIT, RESELLER_TRIAL_LIMIT,
    // Eksternal Services
    bot, pakasir, exec, axios, fs, path, cron, // exec, fs, path, cron, axios dipindahkan ke sini jika diperlukan
    // Modules (Placeholder: Anda harus membuat fungsi-fungsi ini di folder ./modules/!)
    modules: {
        createssh: require('./modules/createssh').createssh,
        createvmess: require('./modules/createvmess').createvmess,
        createvless: require('./modules/createvless').createvless,
        createtrojan: require('./modules/createtrojan').createtrojan,
        createshadowshocks: require('./modules/createshadowsocks').createshadowshocks,
        renewssh: require('./modules/renewssh').renewssh,
        renewvmess: require('./modules/renewvmess').renewvmess,
        renewvless: require('./modules/renewvless').renewvless,
        renewtrojan: require('./modules/renewtrojan').renewtrojan,
        renewshadowshocks: require('./modules/renewSHADOWSOCKS').renewshadowshocks,
    }
};

// --- PENDAFTARAN HANDLERS MODULAR ---
// Pastikan ini dipanggil SETELAH semua dependencies diinisialisasi
registerUserHandlers(bot, sharedDependencies);
registerAdminHandlers(bot, sharedDependencies);
registerPaymentHandlers(bot, sharedDependencies); 

// --- WEBHOOK HANDLER PAKASIR ---
app.post('/webhook/pakasir', (req, res) => {
    const payload = req.body;
    logger.info(`Webhook received. Payload: ${JSON.stringify(payload)}`);
    if (payload && payload.order_id && payload.amount && payload.status) {
        handlePakasirWebhook(payload, bot, sharedDependencies); 
        res.json({ received: true });
    } else {
        res.status(400).json({ error: 'Invalid webhook payload structure.' });
    }
});

// Endpoint dummy untuk redirect sukses
app.get('/topup-success', (req, res) => {
    res.send('Pembayaran Anda sedang diverifikasi. Silakan kembali ke Telegram bot untuk melihat saldo.');
});

// --- LOGIKA BACKUP DATABASE (Minimal, detail di commons.js) ---
function backupDatabase() { 
    // Logika backup dipindahkan ke commons.js atau diimpor di sini jika perlu dijalankan
    logger.info('Mulai proses backup database harian...');
    // Asumsi: Logic backup ada di commons.js atau di sini
    // Jika Anda ingin mengimpornya: const { backupDatabase } = require('./utils/commons');
}
cron.schedule('0 3 * * *', () => { backupDatabase(); }, { timezone: "Asia/Jakarta" });
logger.info('✅ Penjadwalan backup harian (03:00 WIB) telah aktif.');


// --- INISIALISASI SERVER ---
app.listen(port, () => {
  bot.launch().then(() => {
      logger.info('Bot telah dimulai');
  }).catch((error) => {
      logger.error('Error saat memulai bot:', error);
  });
  logger.info(`Server berjalan di port ${port}`);
});