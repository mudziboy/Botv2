// utils/commons.js

const sqlite3 = require('sqlite3').verbose();
const winston = require('winston');
const { exec } = require('child_process');

// --- LOGGER & CONFIGURATION ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: 'bot-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'bot-combined.log' }),
  ],
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: winston.format.simple() }));
}

// --- DATABASE INITALIZATION (SELLVPN) ---
const db = new sqlite3.Database('./sellvpn.db', (err) => {
  if (err) { logger.error('Kesalahan koneksi SQLite3:', err.message); }
  else { logger.info('Terhubung ke SQLite3'); }
});

// --- INICIALISASI TABEL ---
db.run(`CREATE TABLE IF NOT EXISTS Server (
  id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT, auth TEXT, harga INTEGER, nama_server TEXT, quota INTEGER, iplimit INTEGER,
  batas_create_akun INTEGER, total_create_akun INTEGER
)`, (err) => { if (err) { logger.error('Kesalahan membuat tabel Server:', err.message); } });

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE, saldo INTEGER DEFAULT 0, role TEXT DEFAULT 'member',
  daily_trial_count INTEGER DEFAULT 0, last_trial_date TEXT DEFAULT '',
  CONSTRAINT unique_user_id UNIQUE (user_id)
)`, (err) => {
  if (err) { logger.error('Kesalahan membuat tabel users:', err.message); return; }
  // Logic ALTER TABLE lama untuk memastikan kolom ada
  db.all("PRAGMA table_info(users)", (err, rows) => {
    if (err || !rows) return;
    if (!rows.some(row => row.name === 'role')) {
      db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'", (err) => { if (!err) logger.info('Kolom role berhasil ditambahkan'); });
    }
    if (!rows.some(row => row.name === 'daily_trial_count')) {
      db.run("ALTER TABLE users ADD COLUMN daily_trial_count INTEGER DEFAULT 0", (err) => { if (!err) logger.info('Kolom daily_trial_count berhasil ditambahkan'); });
    }
    if (!rows.some(row => row.name === 'last_trial_date')) {
      db.run("ALTER TABLE users ADD COLUMN last_trial_date TEXT DEFAULT ''", (err) => { if (!err) logger.info('Kolom last_trial_date berhasil ditambahkan'); });
    }
  });
});

db.run(`CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount INTEGER, type TEXT, reference_id TEXT, timestamp INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
)`, (err) => { if (err) { logger.error('Kesalahan membuat tabel transactions:', err.message); } });

db.run(`CREATE TABLE IF NOT EXISTS pending_deposits_pakasir (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, order_id TEXT UNIQUE, amount INTEGER, status TEXT DEFAULT 'pending',
  payment_method TEXT, payment_data TEXT, expired_at TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`, (err) => { if (err) { logger.error('Kesalahan membuat tabel pending_deposits_pakasir:', err.message); } });

// Asumsi: Tabel trial_logs juga diperlukan untuk alur Trial lama
db.run(`CREATE TABLE IF NOT EXISTS trial_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, username TEXT, jenis TEXT, created_at TIMESTAMP
)`, (err) => { if (err) { logger.error('Kesalahan membuat tabel trial_logs:', err.message); } });

// ... (Lanjutan di Part 2)
// utils/commons.js (Lanjutan Part 2)

// --- FUNGSI UTILITY DATABASE (Menggunakan Promise Wrapper) ---
function dbGetAsync(query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) { reject(err); }
      else { resolve(row); }
    });
  });
}

function dbRunAsync(query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) { reject(err); }
      else { resolve(this); }
    });
  });
}

function dbAllAsync(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) { reject(err); }
            else { resolve(rows); }
        });
    });
}

async function getUserDetails(userId) {
  // Menggunakan dbGetAsync untuk mendapatkan detail user
  return dbGetAsync('SELECT saldo, role, daily_trial_count, last_trial_date FROM users WHERE user_id = ?', [userId])
    .then(row => row || { saldo: 0, role: 'member', daily_trial_count: 0, last_trial_date: '' });
}

async function updateUserBalance(userId, amount) {
  return dbRunAsync('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, userId]);
}

async function updateServerField(serverId, value, query) {
  return dbRunAsync(query, [value, serverId]);
}

async function recordAccountTransaction(userId, type) {
  const referenceId = `account-${type}-${userId}-${Date.now()}`;
  return dbRunAsync('INSERT INTO transactions (user_id, type, reference_id, timestamp) VALUES (?, ?, ?, ?)',
    [userId, type, referenceId, Date.now()]);
}

// --- FUNGSI UTILITY UMUM ---
function calculatePrice(basePrice, role) {
    // Catatan: RESELLER_DISCOUNT_PERCENT harus diimpor/didefinisikan jika ingin lebih modular
    const RESELLER_DISCOUNT_PERCENT = 40; 
    if (role === 'reseller') {
        const discount = basePrice * (RESELLER_DISCOUNT_PERCENT / 100);
        return Math.max(0, basePrice - discount);
    }
    return basePrice;
}

function escapeMarkdown(text) {
  if (!text) return '';
  // Escaping karakter yang digunakan oleh Markdown V2
  return text.replace(/([_*\[\]()~`>#+-=|{}.!])/g, '\\$1');
}


// --- FUNGSI KEYBOARD ---
function keyboard_nomor() {
  const alphabet = '1234567890'; const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({ text: char, callback_data: char }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]); return buttons;
}
function keyboard_abc() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'; const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({ text: char, callback_data: char }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]); return buttons;
}
function keyboard_full() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'; const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({ text: char, callback_data: char }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]); return buttons;
}


// ... (Lanjutan di Part 3)
// utils/commons.js (Lanjutan Part 3)

// --- FUNGSI EKSEKUSI TRIAL SCRIPT (Hanya eksekusi dan ambil output mentah/JSON) ---
function executeScript(scriptType, serverId) { 
    return new Promise((resolve, reject) => {
        // Logika detail parsing JSON dipindahkan ke userHandlers untuk mengurangi kompleksitas di sini.
        // Fungsi ini hanya memastikan skrip tereksekusi.
        const scriptName = `trial${scriptType}.sh`;
        const fullPath = `./scripts/${scriptName}`;
        
        // CATATAN: Skrip .sh di sini menerima serverId sebagai argumen, sesuai dengan alur pemilihan server lama.
        const command = `bash ${fullPath} ${serverId}`; 
        
        logger.info(`Executing script: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                logger.error(`Script execution error for ${scriptName}: ${error.message}, Stderr: ${stderr}`);
                return resolve({ status: 'error', message: error.message.substring(0, 100), rawOutput: stderr });
            }
            if (stderr) { logger.warn(`Script stderr for ${scriptName}: ${stderr}`); }
            
            // Mengirim output stdout mentah untuk diproses di userHandlers
            return resolve({ status: 'success', rawOutput: stdout.trim() });
        });
    });
}


// --- EKSPOR MODUL ---
module.exports = {
    // Inisialisasi
    logger, db, 
    // Database Functions
    dbGetAsync, dbRunAsync, dbAllAsync,
    getUserDetails, updateUserBalance, updateServerField, recordAccountTransaction,
    // Utility Functions
    calculatePrice, escapeMarkdown,
    // Keyboard Functions
    keyboard_nomor, keyboard_abc, keyboard_full,
    // Script Execution
    executeScript
};