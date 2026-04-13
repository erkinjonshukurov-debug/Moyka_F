const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const qr = require('qrcode');

// -------------------- VERSIYA MA'LUMOTLARI --------------------
const BOT_VERSION = "2.0.0";
const NEW_BOT_LINK = "https://t.me/Isuzu_doctor_bot";

// -------------------- TO'LOV MA'LUMOTLARI --------------------
const CARD_NUMBER = "9860040115220143";
const CARD_OWNER = "Erkinjon Shukurov";
const BANK_NAME = "Xalq Bank";

// -------------------- XAVFSIZLIK VA ADMIN --------------------
const BOT_TOKEN = process.env.BOT_TOKEN || '8779251766:AAH12INusgBCawsk5awqIjcyHnNLiq5A33A';

const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = [1437230485];
const SUPER_ADMIN_ID = 1437230485;

let adminSettings = {
    allowedEditors: [],
    lastChanges: [],
    securityLog: []
};

const DIAGNOSTIC_PRICE = 250000;
const MAX_CARS_PER_USER = 20;

// -------------------- RAILWAY VOLUME YO'LLARI --------------------
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const BACKUP_DIR = path.join(VOLUME_PATH, 'backups');
const REPORTS_DIR = path.join(VOLUME_PATH, 'reports');

const USERS_FILE = path.join(VOLUME_PATH, 'users.json');
const DIAGNOSTICS_FILE = path.join(VOLUME_PATH, 'diagnostics.json');
const ERRORS_FILE = path.join(VOLUME_PATH, 'errors.json');
const VERSION_FILE = path.join(VOLUME_PATH, 'version.json');
const ADMIN_SETTINGS_FILE = path.join(VOLUME_PATH, 'admin_settings.json');
const OIL_CHANGE_FILE = path.join(VOLUME_PATH, 'oil_changes.json'); // Yangi: moykaga kirishlar

// -------------------- MOYKA KIRISHLAR --------------------
let oilChanges = [];

function ensureVolumeDir() {
    if (!fs.existsSync(VOLUME_PATH)) {
        fs.mkdirSync(VOLUME_PATH, { recursive: true });
        console.log("✅ Volume yaratildi: " + VOLUME_PATH);
    }
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log("✅ Backup papkasi yaratildi: " + BACKUP_DIR);
    }
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        console.log("✅ Hisobot papkasi yaratildi: " + REPORTS_DIR);
    }
}

ensureVolumeDir();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log("Webhook xatolik:", e.message));

// -------------------- QR KOD YARATISH FUNKSIYALARI --------------------
async function generateQRCode(data) {
    try {
        return await qr.toBuffer(data);
    } catch (err) {
        console.error("QR kod yaratish xatolik:", err);
        return null;
    }
}

// Bonus olish uchun QR kod (har safar yangilanadi)
async function getBonusQRCode(userId, carNumber) {
    const timestamp = Date.now();
    const uniqueId = `${userId}_${carNumber}_${timestamp}`;
    const qrData = JSON.stringify({
        type: "bonus",
        userId: userId,
        carNumber: carNumber,
        timestamp: timestamp,
        uniqueId: uniqueId
    });
    return await generateQRCode(qrData);
}

// To'lov uchun QR kod (har safar yangilanadi)
async function getPaymentQRCode() {
    const timestamp = Date.now();
    const paymentData = JSON.stringify({
        type: "payment",
        cardNumber: CARD_NUMBER,
        cardOwner: CARD_OWNER,
        bank: BANK_NAME,
        timestamp: timestamp,
        amount: DIAGNOSTIC_PRICE
    });
    return await generateQRCode(paymentData);
}

// Moykaga yozilish uchun QR kod (ro'yxatdan o'tkazish)
async function getOilChangeQRCode() {
    const timestamp = Date.now();
    const uniqueId = `oil_${timestamp}_${Math.random().toString(36).substring(7)}`;
    const qrData = JSON.stringify({
        type: "oil_change_registration",
        uniqueId: uniqueId,
        timestamp: timestamp,
        validUntil: timestamp + 3600000 // 1 soat amal qiladi
    });
    return await generateQRCode(qrData);
}

// -------------------- MOYKA KIRISH FUNKSIYALARI --------------------
function loadOilChanges() {
    try {
        if (fs.existsSync(OIL_CHANGE_FILE)) {
            oilChanges = JSON.parse(fs.readFileSync(OIL_CHANGE_FILE, "utf8"));
        } else {
            oilChanges = [];
            saveOilChanges();
        }
        console.log("✅ Moykaga kirishlar yuklandi: " + oilChanges.length + " ta");
    } catch (err) {
        console.error("Moykaga kirishlarni yuklashda xatolik:", err);
        oilChanges = [];
    }
}

function saveOilChanges() {
    fs.writeFileSync(OIL_CHANGE_FILE, JSON.stringify(oilChanges, null, 2));
}

// Moykaga kirish qo'shish (admin tomonidan QR kod orqali)
function addOilChange(carNumber, phoneNumber, userName, adminId) {
    const newOilChange = {
        id: Date.now(),
        carNumber: carNumber,
        phoneNumber: phoneNumber,
        userName: userName,
        date: new Date().toISOString(),
        adminId: adminId,
        isActive: true
    };
    oilChanges.unshift(newOilChange);
    saveOilChanges();
    addSecurityLog("OIL_CHANGE_ADDED", adminId, `Moykaga kirish: ${carNumber} (${phoneNumber})`);
    return newOilChange;
}

// Moykaga kirgan avtomobillar tarixi
function getAllOilChanges(limit = 500) {
    return oilChanges.slice(-limit).reverse();
}

// Telefon raqam bo'yicha moykaga kirishlar
function getOilChangesByPhone(phoneNumber, limit = 20) {
    return oilChanges.filter(o => o.phoneNumber === phoneNumber).slice(-limit).reverse();
}

// -------------------- ESLATMA MATNI --------------------
const REMINDER_MESSAGE = `
🚗 **Hurmatli mijoz!**

Agar avtomobilingiz doimo soz, ishonchli va yo'llarda sizni yarim yo'lda qoldirmasligini istasangiz — unda unga faqat professional va malakali mutaxassislar xizmat ko'rsatishi muhim.

🛠️ **Sifatli xizmat** — bu nafaqat qulaylik, balki sizning xavfsizligingiz kafolatidir.

✅ Shuning uchun avtomobilingizni haqiqiy professionallarga ishonib topshiring!
`;

// -------------------- QURILMA TURINI ANIQLASH --------------------
let userDevices = new Map();

function getDeviceType(userAgent) {
    if (!userAgent) return "web";
    const ua = userAgent.toLowerCase();
    if (ua.includes("android")) return "android";
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
    return "web";
}

function getUserDevice(userId) {
    return userDevices.get(userId) || "web";
}

function setUserDevice(userId, deviceType) {
    userDevices.set(userId, deviceType);
}

// -------------------- HISOBOT YARATISH --------------------
async function generateOilChangeReport(oilChangesList) {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        const filename = "oil_change_report_" + timestamp + ".txt";
        const filepath = path.join(REPORTS_DIR, filename);
        
        let content = "";
        content += "=".repeat(80) + "\n";
        content += "                    MOYKAGA KIRGAN AVTOMOBILLAR HISOBOTI\n";
        content += "=".repeat(80) + "\n\n";
        content += "Yaratilgan sana: " + new Date().toLocaleString() + "\n";
        content += "Jami kirishlar: " + oilChangesList.length + " ta\n\n";
        
        content += "----------------------- MOYKAGA KIRGANLAR RO'YXATI -----------------------\n";
        content += "=".repeat(80) + "\n\n";
        
        let i = 1;
        for (const oil of oilChangesList.slice(0, 200)) {
            content += "📅 " + i + "-KIRISH\n";
            content += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
            content += "📆 Sana: " + new Date(oil.date).toLocaleString() + "\n";
            content += "🚗 Avtomobil raqami: " + oil.carNumber + "\n";
            content += "👤 Foydalanuvchi: " + (oil.userName || "Ism kiritilmagan") + "\n";
            content += "📞 Telefon: " + oil.phoneNumber + "\n";
            content += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
            i++;
        }
        
        content += "\nJami: " + oilChangesList.length + " ta moykaga kirish\n";
        content += "Hisobot yaratildi: " + new Date().toLocaleString() + "\n";
        content += "=".repeat(80) + "\n";
        
        try {
            fs.writeFileSync(filepath, content, "utf8");
            resolve(filepath);
        } catch (err) {
            reject(err);
        }
    });
}

// -------------------- XAVFSIZLIK FUNKSIYALARI --------------------
function loadAdminSettings() {
    try {
        if (fs.existsSync(ADMIN_SETTINGS_FILE)) {
            adminSettings = JSON.parse(fs.readFileSync(ADMIN_SETTINGS_FILE, "utf8"));
        } else {
            saveAdminSettings();
        }
    } catch (err) {
        console.error("Admin sozlamalarini yuklashda xatolik:", err);
        adminSettings = { allowedEditors: [], lastChanges: [], securityLog: [] };
    }
}

function saveAdminSettings() {
    fs.writeFileSync(ADMIN_SETTINGS_FILE, JSON.stringify(adminSettings, null, 2));
}

function isSuperAdmin(userId) {
    return userId === SUPER_ADMIN_ID;
}

function canEditCode(userId) {
    return isSuperAdmin(userId) || adminSettings.allowedEditors.includes(userId);
}

function addSecurityLog(action, userId, details) {
    const log = {
        id: Date.now(),
        action: action,
        userId: userId,
        details: details,
        date: new Date().toISOString()
    };
    adminSettings.securityLog.unshift(log);
    if (adminSettings.securityLog.length > 100) {
        adminSettings.securityLog = adminSettings.securityLog.slice(0, 100);
    }
    saveAdminSettings();
}

function grantEditPermission(adminId, targetUserId) {
    if (!isSuperAdmin(adminId)) {
        return { success: false, message: "Faqat Super Admin ruxsat bera oladi!" };
    }
    
    if (adminSettings.allowedEditors.includes(targetUserId)) {
        return { success: false, message: "Bu admin allaqachon ruxsatga ega!" };
    }
    
    adminSettings.allowedEditors.push(targetUserId);
    saveAdminSettings();
    addSecurityLog("GRANT_EDIT_PERMISSION", adminId, "Admin " + targetUserId + " ga ruxsat berildi");
    
    return { success: true, message: "Ruxsat muvaffaqiyatli berildi!" };
}

function revokeEditPermission(adminId, targetUserId) {
    if (!isSuperAdmin(adminId)) {
        return { success: false, message: "Faqat Super Admin ruxsatni olib qo'yishi mumkin!" };
    }
    
    const index = adminSettings.allowedEditors.indexOf(targetUserId);
    if (index === -1) {
        return { success: false, message: "Bu admin ruxsatga ega emas!" };
    }
    
    adminSettings.allowedEditors.splice(index, 1);
    saveAdminSettings();
    addSecurityLog("REVOKE_EDIT_PERMISSION", adminId, "Admin " + targetUserId + " dan ruxsat olindi");
    
    return { success: true, message: "Ruxsat muvaffaqiyatli olib qo'yildi!" };
}

// -------------------- VERSIYA BOSHQARISH --------------------
let currentVersion = BOT_VERSION;
let isUpdateMode = false;

function loadVersion() {
    try {
        if (fs.existsSync(VERSION_FILE)) {
            const versionData = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
            currentVersion = versionData.version;
            isUpdateMode = versionData.updateMode || false;
            console.log("📌 Joriy versiya: " + currentVersion + ", Yangilanish rejimi: " + isUpdateMode);
        } else {
            saveVersion();
        }
    } catch (err) {
        console.error("Versiya yuklashda xatolik:", err);
        saveVersion();
    }
}

function saveVersion() {
    const versionData = {
        version: currentVersion,
        updateMode: isUpdateMode,
        lastUpdate: new Date().toISOString(),
        newBotLink: NEW_BOT_LINK
    };
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2));
}

function enableUpdateMode() {
    isUpdateMode = true;
    saveVersion();
    console.log("🔄 Yangilanish rejimi faollashtirildi!");
}

function disableUpdateMode() {
    isUpdateMode = false;
    saveVersion();
    console.log("✅ Yangilanish rejimi o'chirildi");
}

async function notifyAllUsersAboutUpdate() {
    const activeUsers = users.filter(u => !u.isAdmin && !u.isBlocked);
    let successCount = 0;
    let failCount = 0;
    
    for (const user of activeUsers) {
        try {
            await bot.sendMessage(user.userId, "🚀 *YANGI VERSIYA CHIQDI!*\n\nBotimiz yangilandi. Iltimos, yangi botga o'ting:\n" + NEW_BOT_LINK, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🚀 Yangi botga o'tish", url: NEW_BOT_LINK }]
                    ]
                }
            });
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            failCount++;
            console.error("Xabar yuborilmadi (" + user.userId + "):", error.message);
        }
    }
    
    return { success: successCount, fail: failCount };
}

// -------------------- ESLATMA YUBORISH FUNKSIYASI --------------------
async function sendReminder(chatId) {
    try {
        await bot.sendMessage(chatId, REMINDER_MESSAGE, { parse_mode: "Markdown" });
    } catch (error) {
        console.error("Eslatma yuborishda xatolik:", error);
    }
}

// -------------------- BACKUP FUNKSIYALARI --------------------
function createBackup() {
    ensureVolumeDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    
    if (fs.existsSync(USERS_FILE)) {
        fs.copyFileSync(USERS_FILE, path.join(BACKUP_DIR, "users_backup_" + timestamp + ".json"));
    }
    if (fs.existsSync(DIAGNOSTICS_FILE)) {
        fs.copyFileSync(DIAGNOSTICS_FILE, path.join(BACKUP_DIR, "diagnostics_backup_" + timestamp + ".json"));
    }
    if (fs.existsSync(ERRORS_FILE)) {
        fs.copyFileSync(ERRORS_FILE, path.join(BACKUP_DIR, "errors_backup_" + timestamp + ".json"));
    }
    if (fs.existsSync(OIL_CHANGE_FILE)) {
        fs.copyFileSync(OIL_CHANGE_FILE, path.join(BACKUP_DIR, "oil_changes_backup_" + timestamp + ".json"));
    }
    
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json"));
    while (backups.length > 30) {
        const oldest = backups.sort()[0];
        fs.unlinkSync(path.join(BACKUP_DIR, oldest));
        backups.shift();
    }
    console.log("✅ Backup yaratildi: " + timestamp);
    return true;
}

function listBackups() {
    ensureVolumeDir();
    const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith("users_backup_") && f.endsWith(".json"))
        .map(f => ({
            name: f,
            date: fs.statSync(path.join(BACKUP_DIR, f)).mtime
        }))
        .sort((a, b) => b.date - a.date);
    return backups;
}

function restoreBackup(backupName) {
    const backupPath = path.join(BACKUP_DIR, backupName);
    if (!fs.existsSync(backupPath)) return false;
    
    const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    fs.writeFileSync(USERS_FILE, JSON.stringify(backupData, null, 2));
    
    const diagBackupName = backupName.replace("users_backup_", "diagnostics_backup_");
    const diagBackupPath = path.join(BACKUP_DIR, diagBackupName);
    if (fs.existsSync(diagBackupPath)) {
        const diagData = JSON.parse(fs.readFileSync(diagBackupPath, "utf8"));
        fs.writeFileSync(DIAGNOSTICS_FILE, JSON.stringify(diagData, null, 2));
    }
    
    const oilBackupName = backupName.replace("users_backup_", "oil_changes_backup_");
    const oilBackupPath = path.join(BACKUP_DIR, oilBackupName);
    if (fs.existsSync(oilBackupPath)) {
        const oilData = JSON.parse(fs.readFileSync(oilBackupPath, "utf8"));
        fs.writeFileSync(OIL_CHANGE_FILE, JSON.stringify(oilData, null, 2));
        oilChanges = oilData;
    }
    
    console.log("✅ Database tiklandi: " + backupName);
    return true;
}

// -------------------- DATABASE FUNKSIYALARI --------------------
let users = [];
let diagnostics = [];
let errors = [];

function loadData() {
    try {
        ensureVolumeDir();
        
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
            users.forEach(u => {
                if (u.isBlocked === undefined) u.isBlocked = false;
                if (!u.cars) u.cars = [];
                if (u.totalDiagnosticsAll === undefined) u.totalDiagnosticsAll = 0;
                if (u.totalBonusCount === undefined) u.totalBonusCount = 0;
                if (u.totalFreeDiagnostics === undefined) u.totalFreeDiagnostics = 0;
            });
            saveUsers();
        } else {
            users = [];
            saveUsers();
        }
        
        if (fs.existsSync(DIAGNOSTICS_FILE)) {
            diagnostics = JSON.parse(fs.readFileSync(DIAGNOSTICS_FILE, "utf8"));
        } else {
            diagnostics = [];
            saveDiagnostics();
        }
        
        if (fs.existsSync(ERRORS_FILE)) {
            errors = JSON.parse(fs.readFileSync(ERRORS_FILE, "utf8"));
        } else {
            errors = [];
            saveErrors();
        }
        
        console.log("✅ Yuklandi: " + users.length + " foydalanuvchi, " + diagnostics.length + " diagnostika");
        console.log("✅ Volume manzili: " + VOLUME_PATH);
    } catch (err) {
        console.error("Ma'lumot yuklashda xatolik:", err);
        users = [];
        diagnostics = [];
        errors = [];
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveDiagnostics() {
    fs.writeFileSync(DIAGNOSTICS_FILE, JSON.stringify(diagnostics, null, 2));
}

function saveErrors() {
    fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
}

function getUserByPhone(phone) {
    return users.find(u => u.phone === phone);
}

function getUserByUserId(userId) {
    return users.find(u => u.userId === userId);
}

function isAdmin(userId) {
    if (ADMIN_IDS.includes(userId)) return true;
    const user = getUserByUserId(userId);
    return user ? user.isAdmin === true : false;
}

function blockUser(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    if (user.isAdmin) return { success: false, message: "Adminni bloklab bo'lmaydi!" };
    
    user.isBlocked = true;
    saveUsers();
    return { success: true, message: "✅ Foydalanuvchi bloklandi: " + (user.fullName || user.phone) };
}

function unblockUser(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    user.isBlocked = false;
    saveUsers();
    return { success: true, message: "✅ Foydalanuvchi blokdan ochildi: " + (user.fullName || user.phone) };
}

function deleteUser(userId) {
    const userIndex = users.findIndex(u => u.userId === userId);
    if (userIndex === -1) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    const user = users[userIndex];
    if (user.isAdmin) return { success: false, message: "Adminni o'chirib bo'lmaydi!" };
    
    const userDiagnostics = diagnostics.filter(d => d.userId === userId);
    diagnostics = diagnostics.filter(d => d.userId !== userId);
    saveDiagnostics();
    
    users.splice(userIndex, 1);
    saveUsers();
    
    return { 
        success: true, 
        message: "🗑️ Foydalanuvchi o'chirildi: " + (user.fullName || user.phone),
        deletedDiagnostics: userDiagnostics.length
    };
}

function getBlockedUsers() {
    return users.filter(u => !u.isAdmin && u.isBlocked === true);
}

function getActiveUsers() {
    return users.filter(u => !u.isAdmin && u.isBlocked !== true);
}

function addNewUser(userId, phoneNumber, carNumber, firstName, lastName, username) {
    const newUser = {
        userId: userId,
        phone: phoneNumber,
        firstName: firstName || "",
        lastName: lastName || "",
        username: username || "",
        fullName: (firstName || "") + " " + (lastName || ""),
        isAdmin: false,
        isActive: true,
        isBlocked: false,
        registeredDate: new Date().toISOString(),
        cars: [{
            carId: Date.now(),
            carNumber: carNumber,
            bonusCount: 0,
            freeDiagnostics: 0,
            totalDiagnostics: 0,
            addedDate: new Date().toISOString(),
            isActive: true
        }],
        totalBonusCount: 0,
        totalFreeDiagnostics: 0,
        totalDiagnosticsAll: 0
    };
    users.push(newUser);
    saveUsers();
    return newUser;
}

function addCarToUser(phoneNumber, carNumber, userInfo = {}) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    if (user.cars.length >= MAX_CARS_PER_USER) {
        return { success: false, message: "Siz maksimum " + MAX_CARS_PER_USER + " ta avtomobil qo'sha olasiz!" };
    }
    
    const existingCar = user.cars.find(c => c.carNumber === carNumber);
    if (existingCar) {
        return { success: false, message: "Bu avtomobil raqami allaqachon qo'shilgan!" };
    }
    
    if (userInfo.firstName && !user.firstName) {
        user.firstName = userInfo.firstName;
        user.lastName = userInfo.lastName || "";
        user.username = userInfo.username || "";
        user.fullName = (userInfo.firstName || "") + " " + (userInfo.lastName || "");
        saveUsers();
    }
    
    user.cars.push({
        carId: Date.now(),
        carNumber: carNumber,
        bonusCount: 0,
        freeDiagnostics: 0,
        totalDiagnostics: 0,
        addedDate: new Date().toISOString(),
        isActive: true
    });
    
    saveUsers();
    return { success: true, message: "Yangi avtomobil qo'shildi!", carsCount: user.cars.length };
}

// Bonus olish (QR kod orqali)
async function claimBonus(userId, carNumber) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    const car = user.cars.find(c => c.carNumber === carNumber);
    if (!car) return { success: false, message: "Avtomobil topilmadi" };
    
    // Bonus olish vaqtini qayd qilish
    const bonusClaim = {
        userId: userId,
        carNumber: carNumber,
        claimedAt: new Date().toISOString(),
        phoneNumber: user.phone
    };
    
    // Bonus qo'shish
    car.freeDiagnostics++;
    user.totalFreeDiagnostics++;
    saveUsers();
    
    return {
        success: true,
        message: "🎉 *BONUS OLINDI!*\n\n🚗 " + carNumber + "\n📞 " + user.phone + "\n📅 " + new Date().toLocaleString() + "\n\n✅ Siz 1 ta BEPUL diagnostika qozondingiz!",
        bonusClaim: bonusClaim
    };
}

function getBonusHistory(userId) {
    // Bonus olish tarixini qaytarish
    const user = getUserByUserId(userId);
    if (!user) return [];
    
    const bonusHistory = [];
    for (const car of user.cars) {
        // Har bir avtomobil uchun bonuslar hisobi
        const totalBonuses = Math.floor(car.totalDiagnostics / 5);
        const freeUsed = car.freeDiagnostics;
        bonusHistory.push({
            carNumber: car.carNumber,
            totalDiagnostics: car.totalDiagnostics,
            totalBonusesEarned: totalBonuses,
            freeUsed: freeUsed,
            availableFree: car.freeDiagnostics
        });
    }
    return bonusHistory;
}

function getNearBonusCars() {
    const nearBonus = [];
    for (const user of users) {
        if (user.isAdmin) continue;
        for (const car of user.cars) {
            if (car.bonusCount >= 3 && car.bonusCount < 5) {
                nearBonus.push({
                    phone: user.phone,
                    carNumber: car.carNumber,
                    bonusCount: car.bonusCount,
                    remaining: 5 - car.bonusCount,
                    fullName: user.fullName || "Ism kiritilmagan"
                });
            }
        }
    }
    return nearBonus;
}

function getTodayOilChanges() {
    const today = new Date().toISOString().split("T")[0];
    return oilChanges.filter(o => o.date.split("T")[0] === today);
}

function getStatistics() {
    const regularUsers = users.filter(u => !u.isAdmin);
    const blockedUsers = users.filter(u => !u.isAdmin && u.isBlocked === true);
    const activeUsers = regularUsers.filter(u => u.isBlocked !== true);
    
    let totalCars = 0;
    for (const user of activeUsers) {
        totalCars += user.cars.length;
    }
    
    const paidDiagnostics = diagnostics.filter(d => !d.isFree);
    const totalIncome = paidDiagnostics.reduce((sum, d) => sum + d.price, 0);
    
    return {
        totalUsers: activeUsers.length,
        blockedUsers: blockedUsers.length,
        totalCars: totalCars,
        totalDiagnostics: diagnostics.length,
        paidDiagnostics: paidDiagnostics.length,
        freeDiagnostics: diagnostics.filter(d => d.isFree).length,
        totalIncome: totalIncome,
        totalErrors: errors.length,
        currentVersion: currentVersion,
        isUpdateMode: isUpdateMode,
        totalOilChanges: oilChanges.length
    };
}

function getErrors() {
    return errors.slice(-50).reverse();
}

function getAllUsersWithDetails() {
    return users.filter(u => !u.isAdmin).map(u => ({
        userId: u.userId,
        fullName: u.fullName || "Ism kiritilmagan",
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        username: u.username || "",
        phone: u.phone,
        cars: u.cars,
        totalDiagnostics: u.totalDiagnosticsAll || 0,
        registeredDate: u.registeredDate,
        isBlocked: u.isBlocked || false
    }));
}

// ======================== INLINE KEYBOARD (FOYDALANUVCHI UCHUN) ========================
function getCompactInlineKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 Profil", callback_data: "user_profile" }, { text: "🚗 Avtomobillar", callback_data: "user_my_cars" }],
                [{ text: "🎁 Bonuslar", callback_data: "user_my_bonus" }, { text: "➕ Avto qo'shish", callback_data: "user_add_car" }],
                [{ text: "📋 Tarix", callback_data: "user_history" }, { text: "💳 To'lov", callback_data: "user_payment" }],
                [{ text: "ℹ️ Ma'lumot", callback_data: "user_info" }]
            ],
            resize_keyboard: true
        }
    };
}

// ADMIN UCHUN REPLY KEYBOARD
function getAdminReplyKeyboard() {
    const keyboard = [
        ["📊 Statistika", "👥 Foydalanuvchilar"],
        ["🚗 Avtomobil moykasi", "🎁 Bonusga yaqinlar"],
        ["⚠️ Xatoliklar", "📋 Moykaga kirgan avtomobillar tarixi"],
        ["📅 Bugungi", "📄 Hisobot"],
        ["💾 Backup", "🔄 Tiklash"],
        ["🚫 Foyd. boshqarish", "🔐 Xavfsizlik"]
    ];
    
    if (!isUpdateMode) {
        keyboard.push(["🚀 Yangi versiya"]);
    } else {
        keyboard.push(["✅ Yangilanish rejimi o'chirish"]);
    }
    
    keyboard.push(["❌ Asosiy menyu"]);
    
    return {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

function getPhoneKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: "📱 Telefon raqamini yuborish", request_contact: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
}

function removeKeyboard() {
    return {
        reply_markup: {
            remove_keyboard: true
        }
    };
}

// Asosiy menyuni yuborish
async function sendMainMenu(chatId, isAdminUser = false, deviceType = "web") {
    try {
        if (isAdminUser) {
            await bot.sendMessage(chatId, "👑 *Admin paneli*", {
                parse_mode: "Markdown",
                ...getAdminReplyKeyboard()
            });
        } else {
            await bot.sendMessage(chatId, "🏠 *Asosiy menyu*", {
                parse_mode: "Markdown",
                ...getCompactInlineKeyboard()
            });
        }
    } catch (error) {
        console.error("Menu yuborishda xatolik:", error);
    }
}

// -------------------- SESSIONS --------------------
const userSessions = new Map();

function getUserSession(userId) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: null, data: {} });
    }
    return userSessions.get(userId);
}

function clearUserSession(userId) {
    userSessions.delete(userId);
}

// -------------------- /start KOMANDASI --------------------
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";
    const username = msg.from.username || "";
    
    const userAgent = msg.from?.userAgent || "";
    const deviceType = getDeviceType(userAgent);
    setUserDevice(userId, deviceType);
    
    clearUserSession(userId);
    const existingUser = getUserByUserId(userId);
    
    if (existingUser && existingUser.isBlocked) {
        await bot.sendMessage(chatId, "🚫 *Siz botdan bloklangansiz!*\n\nIltimos, administrator bilan bog'laning.\n📞 Aloqa: " + ADMIN_PHONE, { 
            parse_mode: "Markdown",
            ...removeKeyboard()
        });
        return;
    }
    
    try {
        await sendReminder(chatId);
        
        if (existingUser) {
            if (!existingUser.firstName && firstName) {
                existingUser.firstName = firstName;
                existingUser.lastName = lastName;
                existingUser.username = username;
                existingUser.fullName = firstName + " " + lastName;
                saveUsers();
            }
            
            const carsCount = existingUser.cars.length;
            const welcomeText = "👋 *Xush kelibsiz, " + (existingUser.fullName || firstName || "hurmatli mijoz") + "!*\n\n📞 Telefon: " + existingUser.phone + "\n🚗 Avtomobillar: " + carsCount + " ta\n🎁 Bonus: " + (existingUser.totalBonusCount || 0) + "\n🎉 Bepul: " + (existingUser.totalFreeDiagnostics || 0) + " ta\n📊 Diagnostika: " + (existingUser.totalDiagnosticsAll || 0) + " ta";
            await bot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, existingUser.isAdmin, deviceType);
        } else {
            const session = getUserSession(userId);
            session.data.firstName = firstName;
            session.data.lastName = lastName;
            session.data.username = username;
            
            await bot.sendMessage(chatId, "🚗 *ISUZU DOCTOR* tizimiga xush kelibsiz!\n\n📱 Iltimos, telefon raqamingizni yuboring:", {
                parse_mode: "Markdown",
                ...getPhoneKeyboard()
            });
        }
    } catch (error) {
        console.error("/start xatolik:", error);
        await bot.sendMessage(chatId, "❌ *Xatolik yuz berdi!* Iltimos, qaytadan /start bosing.", { parse_mode: "Markdown" });
    }
});

// -------------------- KONTAKT QABUL QILISH --------------------
bot.on("contact", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;
    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";
    const username = msg.from.username || "";
    
    if (!contact) return;
    
    let phoneNumber = contact.phone_number;
    if (!phoneNumber.startsWith("+")) {
        phoneNumber = "+" + phoneNumber;
    }
    
    const session = getUserSession(userId);
    session.data.phone = phoneNumber;
    
    if (!session.data.firstName) {
        session.data.firstName = firstName;
        session.data.lastName = lastName;
        session.data.username = username;
    }
    
    if (phoneNumber === ADMIN_PHONE) {
        const newUser = {
            userId: userId,
            phone: phoneNumber,
            firstName: firstName,
            lastName: lastName,
            username: username,
            fullName: firstName + " " + lastName,
            isAdmin: true,
            isActive: true,
            isBlocked: false,
            registeredDate: new Date().toISOString(),
            cars: [{
                carId: Date.now(),
                carNumber: "ADMIN",
                bonusCount: 0,
                freeDiagnostics: 0,
                totalDiagnostics: 0,
                addedDate: new Date().toISOString(),
                isActive: true
            }],
            totalBonusCount: 0,
            totalFreeDiagnostics: 0,
            totalDiagnosticsAll: 0
        };
        users.push(newUser);
        saveUsers();
        
        try {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, "👑 *Siz ADMIN sifatida tizimga kirdingiz!*\n\n📞 Telefon: " + phoneNumber, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, getUserDevice(userId));
        } catch (error) {
            console.error("Admin xabar xatolik:", error);
        }
        clearUserSession(userId);
        return;
    }
    
    const existingUser = getUserByPhone(phoneNumber);
    
    if (existingUser && existingUser.userId !== userId) {
        await bot.sendMessage(chatId, "❌ *Bu telefon raqam allaqachon ro'yxatdan o'tgan!*", { parse_mode: "Markdown" });
        clearUserSession(userId);
        return;
    }
    
    if (existingUser && existingUser.userId === userId) {
        session.step = "add_new_car";
        session.data.isExistingUser = true;
        await bot.sendMessage(chatId, "✅ Telefon raqam tasdiqlandi: " + phoneNumber + "\n\n🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA\n\n⚠️ Siz maksimum " + MAX_CARS_PER_USER + " tagacha avtomobil qo'sha olasiz.", {
            parse_mode: "Markdown",
            ...removeKeyboard()
        });
    } else {
        session.step = "first_car_number";
        session.data.isExistingUser = false;
        await bot.sendMessage(chatId, "✅ Telefon raqam qabul qilindi: " + phoneNumber + "\n\n🚗 *Birinchi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA", {
            parse_mode: "Markdown",
            ...removeKeyboard()
        });
    }
});

// -------------------- XABARLARNI QAYTA ISHLASH --------------------
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const photo = msg.photo;
    
    const session = getUserSession(userId);
    
    if (photo) return;
    if (!text) return;
    if (text === "/start") return;
    if (text.startsWith("/")) return;
    
    const user = getUserByUserId(userId);
    const deviceType = getUserDevice(userId);
    
    // Yangi avtomobil qo'shish
    if (session.step === "first_car_number") {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri avtomobil raqami!*\n\n2-10 belgi kiriting:", { parse_mode: "Markdown" });
            return;
        }
        
        const userFullName = (session.data.firstName || "") + " " + (session.data.lastName || "");
        
        addNewUser(
            userId, 
            session.data.phone, 
            carNumber,
            session.data.firstName || "",
            session.data.lastName || "",
            session.data.username || ""
        );
        
        try {
            await sendReminder(chatId);
            await bot.sendMessage(chatId, "✅ *Ro'yxatdan o'tdingiz!*\n\n👤 " + (userFullName.trim() || "Mijoz") + "\n🚗 " + carNumber + "\n📞 " + session.data.phone + "\n\n🎁 Har 5 diagnostikada 1 BEPUL!", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            
            for (const adminId of ADMIN_IDS) {
                bot.sendMessage(adminId, "🆕 *YANGI FOYDALANUVCHI!*\n\n👤 " + (userFullName.trim() || "Mijoz") + "\n📞 " + session.data.phone + "\n🚗 " + carNumber, { parse_mode: "Markdown" }).catch(() => {});
            }
        } catch (error) {
            console.error("Ro'yxatdan o'tkazish xatolik:", error);
        }
        clearUserSession(userId);
        return;
    }
    
    if (session.step === "add_new_car") {
        const carNumber = text.toUpperCase().trim();
        
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri raqam!*", { parse_mode: "Markdown" });
            return;
        }
        
        const result = addCarToUser(session.data.phone, carNumber, {
            firstName: session.data.firstName,
            lastName: session.data.lastName,
            username: session.data.username
        });
        
        if (result.success) {
            await bot.sendMessage(chatId, "✅ *Yangi avtomobil qo'shildi!*\n\n🚗 " + carNumber, { parse_mode: "Markdown" });
        } else {
            await bot.sendMessage(chatId, "❌ " + result.message, { parse_mode: "Markdown" });
        }
        
        clearUserSession(userId);
        await sendMainMenu(chatId, false, deviceType);
        return;
    }
    
    // Admin moykaga kirish qo'shish (QR kod orqali)
    if (session.step === "admin_add_oil_change") {
        if (!isAdmin(userId)) {
            clearUserSession(userId);
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        const carNumber = text.toUpperCase().trim();
        
        let foundUser = null;
        let foundCar = null;
        
        for (const userObj of users) {
            const car = userObj.cars.find(c => c.carNumber === carNumber);
            if (car) {
                foundUser = userObj;
                foundCar = car;
                break;
            }
        }
        
        if (!foundUser) {
            await bot.sendMessage(chatId, "❌ *Bunday avtomobil topilmadi!*", { parse_mode: "Markdown" });
            return;
        }
        
        // Moykaga kirish qo'shish
        const oilChange = addOilChange(foundCar.carNumber, foundUser.phone, foundUser.fullName || foundUser.phone, userId);
        
        await bot.sendMessage(chatId, "✅ *MOYKAGA KIRISH QO'SHILDI!*\n\n🚗 " + foundCar.carNumber + "\n👤 " + (foundUser.fullName || "Ismsiz") + "\n📞 " + foundUser.phone + "\n📅 " + new Date().toLocaleString(), { parse_mode: "Markdown" });
        
        // Foydalanuvchiga xabar yuborish
        bot.sendMessage(foundUser.userId, "🚗 *MOYKAGA KIRISHINGIZ QAYD ETILDI!*\n\n🚗 " + foundCar.carNumber + "\n📅 " + new Date().toLocaleString() + "\n\n✅ Xizmatdan foydalanganingiz uchun tashakkur!", { parse_mode: "Markdown" }).catch(() => {});
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true, deviceType);
        return;
    }
    
    // Admin qo'shish session
    if (session.step === "add_admin_permission") {
        if (text === "/cancel") {
            clearUserSession(userId);
            await bot.sendMessage(chatId, "❌ *Amal bekor qilindi.*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
            return;
        }
        
        const targetAdminId = parseInt(text);
        if (isNaN(targetAdminId)) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri ID!*", { parse_mode: "Markdown" });
            return;
        }
        
        const result = grantEditPermission(userId, targetAdminId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true, deviceType);
        return;
    }
    
    // AGAR SESSION YO'Q BO'LSA
    if (!user) {
        await bot.sendMessage(chatId, "❌ Ro'yxatdan o'tmagansiz! Iltimos, /start bosing.", { parse_mode: "Markdown" });
        return;
    }
    
    if (user.isBlocked) {
        await bot.sendMessage(chatId, "🚫 *Siz botdan bloklangansiz!*", { parse_mode: "Markdown" });
        return;
    }
    
    // ======================== ADMIN MATNLI BUYRUQLAR ========================
    if (isAdmin(userId)) {
        // STATISTIKA
        if (text === "📊 Statistika") {
            const stats = getStatistics();
            await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Faol: ${stats.totalUsers}\n🚫 Bloklangan: ${stats.blockedUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n🔧 Jami diagnostika: ${stats.totalDiagnostics}\n💰 Daromad: ${stats.totalIncome.toLocaleString()} so'm\n🛢️ Moykaga kirish: ${stats.totalOilChanges} ta\n📌 Versiya: ${stats.currentVersion}`, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        // FOYDALANUVCHILAR
        else if (text === "👥 Foydalanuvchilar") {
            const usersList = getAllUsersWithDetails();
            if (usersList.length === 0) { 
                await bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi yo'q", { parse_mode: "Markdown" }); 
                await sendMainMenu(chatId, true, deviceType);
                return; 
            }
            
            let msgText = "👥 *FOYDALANUVCHILAR*\n━━━━━━━━━━━━━━━━━━\n\n";
            usersList.slice(0, 15).forEach((u, index) => { 
                const status = u.isBlocked ? "🔴" : "🟢";
                msgText += `${status} *${index + 1}. ${u.fullName || "Ismsiz"}*\n`;
                msgText += `📞 ${u.phone}\n`;
                msgText += `🚗 ${u.cars.map(c => c.carNumber).join(", ")}\n`;
                msgText += "━━━━━━━━━━━━━━━━━━\n";
            });
            await bot.sendMessage(chatId, msgText, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        // AVTOMOBIL MOYKASI (QR kod orqali)
        else if (text === "🚗 Avtomobil moykasi") {
            const qrBuffer = await getOilChangeQRCode();
            if (qrBuffer) {
                await bot.sendPhoto(chatId, qrBuffer, {
                    caption: "🛢️ *AVTOMOBIL MOYKASIGA RO'YXATDAN O'TISH*\n\n📌 Ushbu QR kodni skaner qiling va avtomobil raqamini kiriting.\n\n⚠️ QR kod 1 soat davomida amal qiladi.",
                    parse_mode: "Markdown"
                });
                
                const adminSession = getUserSession(userId);
                adminSession.step = "admin_add_oil_change";
                await bot.sendMessage(chatId, "🚗 *Avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA", { parse_mode: "Markdown", ...removeKeyboard() });
            } else {
                await bot.sendMessage(chatId, "❌ *QR kod yaratishda xatolik!*", { parse_mode: "Markdown" });
            }
        }
        // BONUSGA YAQINLAR
        else if (text === "🎁 Bonusga yaqinlar") {
            const nearBonus = getNearBonusCars();
            if (nearBonus.length === 0) {
                await bot.sendMessage(chatId, "📭 Bonusga yaqin avtomobillar yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = "🎁 *BONUSGA YAQINLAR*\n━━━━━━━━━━━━━━━━━━\n\n";
                nearBonus.forEach(c => {
                    msg += `👤 ${c.fullName}\n🚗 ${c.carNumber}\n🎁 ${c.bonusCount}/5\n📌 ${c.remaining} diagnostikadan keyin BEPUL\n━━━━━━━━━━━━━━━━━━\n`;
                });
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // XATOLIKLAR
        else if (text === "⚠️ Xatoliklar") {
            const errorsList = getErrors();
            if (errorsList.length === 0) {
                await bot.sendMessage(chatId, "✅ Xatoliklar yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = "⚠️ *XATOLIKLAR*\n\n";
                errorsList.slice(0, 10).forEach(e => {
                    msg += `🚗 ${e.carNumber}\n📝 ${e.errorDescription || "Xatolik"}\n📅 ${new Date(e.date).toLocaleDateString()}\n━━━━━━━━━━━━━━━━━━\n`;
                });
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // MOYKAGA KIRGAN AVTOMOBILLAR TARIXI
        else if (text === "📋 Moykaga kirgan avtomobillar tarixi") {
            const oilList = getAllOilChanges(20);
            if (oilList.length === 0) {
                await bot.sendMessage(chatId, "📭 Moykaga kirishlar yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = "📋 *MOYKAGA KIRGAN AVTOMOBILLAR TARIXI*\n━━━━━━━━━━━━━━━━━━\n\n";
                for (const oil of oilList.slice(0, 15)) {
                    msg += `📅 ${new Date(oil.date).toLocaleString()}\n`;
                    msg += `🚗 ${oil.carNumber}\n`;
                    msg += `👤 ${oil.userName || "Ismsiz"}\n`;
                    msg += `📞 ${oil.phoneNumber}\n`;
                    msg += "━━━━━━━━━━━━━━━━━━\n";
                }
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // BUGUNGI
        else if (text === "📅 Bugungi") {
            const oilList = getTodayOilChanges();
            if (oilList.length === 0) {
                await bot.sendMessage(chatId, "📭 Bugun moykaga kirish yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = "📅 *BUGUNGI MOYKAGA KIRISHLAR*\n━━━━━━━━━━━━━━━━━━\n\n";
                oilList.forEach(oil => {
                    msg += `🚗 ${oil.carNumber}\n`;
                    msg += `👤 ${oil.userName || "Ismsiz"}\n`;
                    msg += `📞 ${oil.phoneNumber}\n`;
                    msg += "━━━━━━━━━━━━━━━━━━\n";
                });
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // HISOBOT OLISH
        else if (text === "📄 Hisobot") {
            await bot.sendMessage(chatId, "📄 *Hisobot tayyorlanmoqda...*", { parse_mode: "Markdown" });
            try {
                const allOilChanges = getAllOilChanges(500);
                const filepath = await generateOilChangeReport(allOilChanges);
                await bot.sendDocument(chatId, filepath, { caption: "📊 Moykaga kirish hisoboti\n📅 " + new Date().toLocaleString() });
                setTimeout(() => fs.unlinkSync(filepath), 60000);
            } catch (error) {
                await bot.sendMessage(chatId, "❌ *Xatolik!*", { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, true, deviceType);
        }
        // BACKUP YARATISH
        else if (text === "💾 Backup") {
            await bot.sendMessage(chatId, "💾 *Backup yaratilmoqda...*", { parse_mode: "Markdown" });
            createBackup();
            await bot.sendMessage(chatId, "✅ *Backup yaratildi!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        // DATABASE TIKLASH
        else if (text === "🔄 Tiklash") {
            const backups = listBackups();
            if (backups.length === 0) {
                await bot.sendMessage(chatId, "❌ *Backup topilmadi!*", { parse_mode: "Markdown" });
                await sendMainMenu(chatId, true, deviceType);
            } else {
                let msg = "🔄 *DATABASE TIKLASH*\n\nBackup tanlang:\n\n";
                const keyboard = backups.slice(0, 10).map(b => [{ text: "📁 " + b.name.substring(0, 30), callback_data: "restore_" + b.name }]);
                keyboard.push([{ text: "❌ Bekor qilish", callback_data: "restore_cancel" }]);
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
            }
        }
        // FOYDALANUVCHINI BOSHQARISH
        else if (text === "🚫 Foyd. boshqarish") {
            const activeUsers = getActiveUsers();
            const blockedUsers = getBlockedUsers();
            const allUsers = [...activeUsers, ...blockedUsers];
            
            if (allUsers.length === 0) {
                await bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi yo'q", { parse_mode: "Markdown" });
                await sendMainMenu(chatId, true, deviceType);
                return;
            }
            
            let msg = "👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n🟢 Faol: " + activeUsers.length + "\n🔴 Bloklangan: " + blockedUsers.length + "\n\nTanlang:\n\n";
            const keyboard = [];
            allUsers.slice(0, 10).forEach(userObj => {
                keyboard.push([{ text: (userObj.isBlocked ? "🔴" : "🟢") + " " + (userObj.fullName || userObj.phone).substring(0, 20), callback_data: "manage_user_" + userObj.userId }]);
            });
            keyboard.push([{ text: "❌ Bekor qilish", callback_data: "user_manage_cancel" }]);
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
        }
        // XAVFSIZLIK
        else if (text === "🔐 Xavfsizlik") {
            if (!isSuperAdmin(userId) && !canEditCode(userId)) {
                await bot.sendMessage(chatId, "❌ *Ruxsat yo'q!*", { parse_mode: "Markdown" });
                await sendMainMenu(chatId, true, deviceType);
                return;
            }
            const keyboard = [
                [{ text: "👥 Ruxsat berilgan adminlar", callback_data: "security_allowed_admins" }],
                [{ text: "➕ Admin qo'shish", callback_data: "security_add_admin" }],
                [{ text: "➖ Admin o'chirish", callback_data: "security_remove_admin" }],
                [{ text: "📜 Xavfsizlik jurnali", callback_data: "security_log" }],
                [{ text: "🔙 Orqaga", callback_data: "security_back" }]
            ];
            await bot.sendMessage(chatId, "🔐 *XAVFSIZLIK SOZLAMALARI*", { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
        }
        // YANGI VERSIYAGA O'TISH
        else if (text === "🚀 Yangi versiya") {
            await bot.sendMessage(chatId, "⚠️ *YANGI VERSIYAGA O'TISH*\n\nDavom etasizmi?", {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [[{ text: "✅ Ha", callback_data: "confirm_update" }, { text: "❌ Yo'q", callback_data: "cancel_update" }]] }
            });
        }
        // YANGILANISH REJIMINI O'CHIRISH
        else if (text === "✅ Yangilanish rejimi o'chirish") {
            disableUpdateMode();
            await bot.sendMessage(chatId, "✅ *Yangilanish rejimi o'chirildi!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        // ASOSIY MENYU
        else if (text === "❌ Asosiy menyu") {
            clearUserSession(userId);
            await sendMainMenu(chatId, true, deviceType);
        }
        else if (!session.step) {
            await bot.sendMessage(chatId, "❌ *Tushunarsiz buyruq!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, true, deviceType);
        }
        return;
    }
    
    // Foydalanuvchi matn yuborsa
    if (!session.step) {
        await bot.sendMessage(chatId, "❌ *Iltimos, tugmalardan foydalaning!*", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
});

// -------------------- CALLBACK QUERY HANDLER --------------------
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id;
    const messageId = query.message.message_id;
    
    await bot.answerCallbackQuery(query.id);
    
    const user = getUserByUserId(userId);
    if (!user) {
        await bot.sendMessage(chatId, "❌ Ro'yxatdan o'tmagan! /start bosing.");
        return;
    }
    
    const deviceType = getUserDevice(userId);
    
    // Foydalanuvchi callback'lari
    if (data === "user_profile") {
        const carsList = user.cars.map(c => "🚗 " + c.carNumber + " (" + c.totalDiagnostics + " ta)").join("\n");
        await bot.sendMessage(chatId, "📊 *MENGING SAHIFAM*\n\n👤 *Ism:* " + (user.fullName || "Kiritilmagan") + "\n📞 *Telefon:* " + user.phone + "\n🚗 *Avtomobillar:* " + user.cars.length + "/" + MAX_CARS_PER_USER + "\n\n" + carsList + "\n\n🎁 *Bonus:* " + (user.totalBonusCount || 0) + "\n🎉 *Bepul:* " + (user.totalFreeDiagnostics || 0) + " ta\n📊 *Jami:* " + (user.totalDiagnosticsAll || 0) + " ta", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_my_cars") {
        if (user.cars.length === 0) {
            await bot.sendMessage(chatId, "📭 Sizda hali avtomobillar mavjud emas!", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        let carsText = "🚗 *MENGING AVTOMOBILLARIM*\n📌 5 diagnostika = 1 BEPUL\n━━━━━━━━━━━━━━━━━━\n\n";
        for (const car of user.cars) {
            const nextFree = 5 - car.bonusCount;
            carsText += "🚗 *" + car.carNumber + "*\n";
            carsText += "🎁 Bonus: " + car.bonusCount + "/5\n";
            carsText += "🎉 Bepul: " + car.freeDiagnostics + " ta\n";
            carsText += "📊 Diagnostika: " + car.totalDiagnostics + " ta\n";
            if (car.freeDiagnostics > 0) {
                carsText += "✅ *Bepul mavjud!*\n";
            } else if (nextFree > 0) {
                carsText += "📌 BEPUL: " + nextFree + " dan keyin\n";
            }
            carsText += "━━━━━━━━━━━━━━━━━━\n";
        }
        await bot.sendMessage(chatId, carsText, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_my_bonus") {
        // Bonus olish uchun QR kod ko'rsatish
        if (user.cars.length === 0) {
            await bot.sendMessage(chatId, "📭 Sizda hali avtomobillar mavjud emas!", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        // Avtomobil tanlash uchun keyboard
        const carKeyboard = [];
        for (const car of user.cars) {
            carKeyboard.push([{ text: "🚗 " + car.carNumber, callback_data: "select_car_bonus_" + car.carNumber }]);
        }
        carKeyboard.push([{ text: "🔙 Orqaga", callback_data: "back_to_main" }]);
        
        await bot.sendMessage(chatId, "🎁 *BONUS OLISH*\n\nBonus olish uchun avtomobilingizni tanlang:", {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: carKeyboard }
        });
    }
    else if (data.startsWith("select_car_bonus_")) {
        const carNumber = data.replace("select_car_bonus_", "");
        const car = user.cars.find(c => c.carNumber === carNumber);
        
        if (!car) {
            await bot.sendMessage(chatId, "❌ *Avtomobil topilmadi!*", { parse_mode: "Markdown" });
            return;
        }
        
        // QR kod orqali bonus olish
        const qrBuffer = await getBonusQRCode(user.userId, carNumber);
        if (qrBuffer) {
            await bot.sendPhoto(chatId, qrBuffer, {
                caption: `🎁 *BONUS OLISH* - ${carNumber}\n\n📌 Ushbu QR kodni skaner qiling va bonusni qo'lga kiriting.\n\n📞 Telefon: ${user.phone}\n🚗 Avtomobil: ${carNumber}\n\n⚠️ QR kod bir martalik va faqat shu avtomobil uchun amal qiladi.`,
                parse_mode: "Markdown"
            });
        } else {
            await bot.sendMessage(chatId, "❌ *QR kod yaratishda xatolik!*", { parse_mode: "Markdown" });
        }
        
        // Bonus tarixini ko'rsatish
        let bonusText = "🎁 *BONUSLAR TARIXI*\n━━━━━━━━━━━━━━━━━━\n\n";
        bonusText += `🚗 *${carNumber}*\n`;
        bonusText += `📊 Diagnostika: ${car.totalDiagnostics} ta\n`;
        bonusText += `🎉 Bepul: ${car.freeDiagnostics} ta\n`;
        bonusText += `📌 Bonus ballari: ${car.bonusCount}/5\n`;
        bonusText += "━━━━━━━━━━━━━━━━━━\n";
        
        await bot.sendMessage(chatId, bonusText, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_add_car") {
        if (user.cars.length >= MAX_CARS_PER_USER) {
            await bot.sendMessage(chatId, "❌ Maksimum " + MAX_CARS_PER_USER + " ta avtomobil!", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        const session = getUserSession(userId);
        session.step = "add_new_car";
        session.data.phone = user.phone;
        session.data.firstName = user.firstName;
        session.data.lastName = user.lastName;
        session.data.username = user.username;
        
        await bot.sendMessage(chatId, "🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA", {
            parse_mode: "Markdown",
            reply_markup: { remove_keyboard: true }
        });
    }
    else if (data === "user_history") {
        const oilHistory = getOilChangesByPhone(user.phone, 10);
        if (oilHistory.length === 0) {
            await bot.sendMessage(chatId, "📭 *Sizning moykaga kirish tarixingiz mavjud emas!*", { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false, deviceType);
            return;
        }
        
        let historyText = "📋 *MOYKAGA KIRISH TARIXI*\n━━━━━━━━━━━━━━━━━━\n\n";
        for (const oil of oilHistory) {
            historyText += `📅 ${new Date(oil.date).toLocaleString()}\n`;
            historyText += `🚗 *${oil.carNumber}*\n`;
            historyText += "━━━━━━━━━━━━━━━━━━\n";
        }
        await bot.sendMessage(chatId, historyText, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    else if (data === "user_payment") {
        // To'lov uchun QR kod (har safar yangilanadi)
        const qrBuffer = await getPaymentQRCode();
        if (qrBuffer) {
            await bot.sendPhoto(chatId, qrBuffer, {
                caption: `💳 *TO'LOV MA'LUMOTLARI*\n\n🏦 *Bank:* ${BANK_NAME}\n💳 *Karta raqami:* \`${CARD_NUMBER}\`\n👤 *Karta egasi:* ${CARD_OWNER}\n💰 *Summa:* ${DIAGNOSTIC_PRICE.toLocaleString()} so'm\n\n📌 Ushbu QR kod orqali to'lov qilishingiz mumkin.\n\n✅ To'lov amalga oshirilgandan so'ng, administrator bilan bog'lanishingiz mumkin.`,
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🏦 Karta raqamini nusxalash", callback_data: "copy_card_number" }],
                        [{ text: "🔙 Ortga", callback_data: "back_to_main" }]
                    ]
                }
            });
        } else {
            // QR kod yaratilmagan holda oddiy matn
            await bot.sendMessage(chatId, `
🏦 *TO'LOV MA'LUMOTLARI*

💳 *Karta raqami:* \`${CARD_NUMBER}\`
👤 *Karta egasi:* ${CARD_OWNER}
🏛 *Bank:* ${BANK_NAME}
💰 *Summa:* ${DIAGNOSTIC_PRICE.toLocaleString()} so'm

📌 *To'lov qilish uchun:*
1. Karta raqamini nusxalang
2. Click, Payme yoki Apelsin orqali to'lov qiling
3. To'lov chekini saqlang

✅ To'lov amalga oshirilgandan so'ng, administrator bilan bog'lanishingiz mumkin.
            `, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📋 Karta raqamini nusxalash", callback_data: "copy_card_number" }],
                        [{ text: "🔙 Ortga", callback_data: "back_to_main" }]
                    ]
                }
            });
        }
    }
    else if (data === "copy_card_number") {
        await bot.sendMessage(chatId, `💳 *Karta raqami:* \`${CARD_NUMBER}\`\n\n👤 *Karta egasi:* ${CARD_OWNER}\n💰 *Summa:* ${DIAGNOSTIC_PRICE.toLocaleString()} so'm\n\nRaqamni nusxalash uchun bosing va ushlab turing.`, {
            parse_mode: "Markdown"
        });
    }
    else if (data === "user_info") {
        await bot.sendMessage(chatId, "ℹ️ *ISUZU DOCTOR BOT*\n\n🚗 Avtomobil diagnostikasi va moykaga kirish\n🎁 Har 5 diagnostikada 1 ta BEPUL\n📱 " + MAX_CARS_PER_USER + " tagacha avtomobil\n📞 Aloqa: " + ADMIN_PHONE + "\n📌 Versiya: " + BOT_VERSION, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false, deviceType);
    }
    
    // Security callback'lari
    else if (data === "security_allowed_admins") {
        let msg = "👥 *RUXSAT BERILGAN ADMINLAR*\n━━━━━━━━━━━━━━━━━━\n\n";
        if (adminSettings.allowedEditors.length === 0) {
            msg += "Hech qanday admin ruxsatga ega emas.";
        } else {
            adminSettings.allowedEditors.forEach((adminId, index) => {
                const adminUser = getUserByUserId(adminId);
                msg += (index + 1) + ". ID: " + adminId + "\n";
                if (adminUser) msg += "👤 " + (adminUser.fullName || adminUser.phone) + "\n";
                msg += "━━━━━━━━━━━━━━━━━━\n";
            });
        }
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    }
    else if (data === "security_add_admin") {
        if (!isSuperAdmin(userId)) {
            await bot.sendMessage(chatId, "❌ Faqat Super Admin!", { parse_mode: "Markdown" });
            return;
        }
        await bot.sendMessage(chatId, "➕ *ADMIN QO'SHISH*\n\nTelegram ID sini yuboring:\n❌ Bekor qilish: /cancel", { parse_mode: "Markdown" });
        const session = getUserSession(userId);
        session.step = "add_admin_permission";
    }
    else if (data === "security_remove_admin") {
        if (!isSuperAdmin(userId)) {
            await bot.sendMessage(chatId, "❌ Faqat Super Admin!", { parse_mode: "Markdown" });
            return;
        }
        if (adminSettings.allowedEditors.length === 0) {
            await bot.sendMessage(chatId, "❌ *Hech qanday admin yo'q!*", { parse_mode: "Markdown" });
            return;
        }
        let msg = "➖ *ADMIN O'CHIRISH*\n\nTanlang:\n\n";
        const keyboard = [];
        adminSettings.allowedEditors.forEach(adminId => {
            const adminUser = getUserByUserId(adminId);
            const name = adminUser ? (adminUser.fullName || adminUser.phone) : ("ID: " + adminId);
            keyboard.push([{ text: "❌ " + name.substring(0, 30), callback_data: "remove_admin_" + adminId }]);
        });
        keyboard.push([{ text: "🔙 Orqaga", callback_data: "security_back" }]);
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
    }
    else if (data === "security_log") {
        let msg = "📜 *XAVFSIZLIK JURNALI*\n━━━━━━━━━━━━━━━━━━\n\n";
        if (adminSettings.securityLog.length === 0) {
            msg += "Hech qanday hodisa yo'q.";
        } else {
            adminSettings.securityLog.slice(0, 15).forEach(log => {
                msg += "📅 " + new Date(log.date).toLocaleString() + "\n";
                msg += "🔹 " + log.action + "\n";
                msg += "📝 " + log.details + "\n";
                msg += "━━━━━━━━━━━━━━━━━━\n";
            });
        }
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    }
    else if (data === "security_back") {
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("remove_admin_")) {
        if (!isSuperAdmin(userId)) {
            await bot.sendMessage(chatId, "❌ Faqat Super Admin!", { parse_mode: "Markdown" });
            return;
        }
        const targetAdminId = parseInt(data.split("_")[2]);
        const result = revokeEditPermission(userId, targetAdminId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("restore_")) {
        const backupName = data.replace("restore_", "");
        await bot.sendMessage(chatId, "🔄 *Database tiklanmoqda...*", { parse_mode: "Markdown" });
        if (restoreBackup(backupName)) {
            loadData();
            loadOilChanges();
            await bot.sendMessage(chatId, "✅ *Database tiklandi!*", { parse_mode: "Markdown" });
        } else {
            await bot.sendMessage(chatId, "❌ *Xatolik!*", { parse_mode: "Markdown" });
        }
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data === "restore_cancel") {
        await bot.sendMessage(chatId, "❌ *Bekor qilindi.*", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data === "confirm_update") {
        const result = await notifyAllUsersAboutUpdate();
        enableUpdateMode();
        await bot.sendMessage(chatId, "✅ *YANGILANISH TUGALLANDI!*\n\n✅ Yuborildi: " + result.success + " ta\n❌ Yuborilmadi: " + result.fail + " ta", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data === "cancel_update") {
        await bot.sendMessage(chatId, "❌ *Bekor qilindi.*", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data === "user_manage_cancel") {
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("manage_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const targetUser = getUserByUserId(targetUserId);
        if (!targetUser) {
            await bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi!", { parse_mode: "Markdown" });
            return;
        }
        
        const userInfo = "👤 *" + (targetUser.fullName || "Ismsiz") + "*\n📞 " + targetUser.phone + "\n🚗 " + targetUser.cars.length + " ta\n📊 " + (targetUser.totalDiagnosticsAll || 0) + " ta\n🚦 " + (targetUser.isBlocked ? "🔴 BLOKLANGAN" : "🟢 FAOL");
        
        const keyboard = [];
        if (targetUser.isBlocked) {
            keyboard.push([{ text: "✅ Blokdan ochish", callback_data: "unblock_user_" + targetUserId }]);
        } else {
            keyboard.push([{ text: "🚫 Bloklash", callback_data: "block_user_" + targetUserId }]);
        }
        keyboard.push([{ text: "🗑️ O'chirish", callback_data: "delete_user_" + targetUserId }]);
        keyboard.push([{ text: "🔙 Orqaga", callback_data: "admin_manage_users" }]);
        
        await bot.editMessageText(userInfo, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });
    }
    else if (data.startsWith("block_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const result = blockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("unblock_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const result = unblockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data.startsWith("delete_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const confirmKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Ha", callback_data: "confirm_delete_" + targetUserId }],
                    [{ text: "❌ Yo'q", callback_data: "admin_manage_users" }]
                ]
            }
        };
        await bot.sendMessage(chatId, "⚠️ *DIQQAT!*\n\nFoydalanuvchini o'chirmoqchisiz?\nBu amal ortga qaytmaydi!", {
            parse_mode: "Markdown",
            ...confirmKeyboard
        });
    }
    else if (data.startsWith("confirm_delete_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const result = deleteUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true, deviceType);
    }
    else if (data === "admin_manage_users") {
        const activeUsers = getActiveUsers();
        const blockedUsers = getBlockedUsers();
        const allUsers = [...activeUsers, ...blockedUsers];
        
        let msg = "👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n🟢 Faol: " + activeUsers.length + "\n🔴 Bloklangan: " + blockedUsers.length + "\n\nTanlang:\n\n";
        const keyboard = [];
        allUsers.slice(0, 10).forEach(userObj => {
            keyboard.push([{ text: (userObj.isBlocked ? "🔴" : "🟢") + " " + (userObj.fullName || userObj.phone).substring(0, 20), callback_data: "manage_user_" + userObj.userId }]);
        });
        keyboard.push([{ text: "❌ Bekor qilish", callback_data: "user_manage_cancel" }]);
        
        await bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });
    }
    else if (data === "back_to_main") {
        await sendMainMenu(chatId, isAdmin(userId), deviceType);
    }
});

// -------------------- XATOLIKLARNI QAYTA ISHLASH --------------------
bot.on("polling_error", (error) => console.error("Polling xatolik:", error));
process.on("uncaughtException", (error) => console.error("Uncaught exception:", error));

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
console.log("=".repeat(60));
console.log("🚗 ISUZU DOCTOR BOT ISHGA TUSHMOQDA");
console.log("=".repeat(60));

loadVersion();
loadData();
loadAdminSettings();
loadOilChanges();

console.log("=".repeat(60));
console.log("🚗 ISUZU DOCTOR BOT ISHGA TUSHDI");
console.log("=".repeat(60));
console.log("📌 Versiya: " + BOT_VERSION);
console.log("👑 Adminlar: " + ADMIN_IDS.join(", "));
console.log("👥 Foydalanuvchilar: " + users.filter(u => !u.isAdmin).length);
console.log("🔧 Diagnostikalar: " + diagnostics.length);
console.log("🛢️ Moykaga kirishlar: " + oilChanges.length);
console.log("💳 Karta: " + CARD_NUMBER);
console.log("💾 Volume manzili: " + VOLUME_PATH);
console.log("=".repeat(60));
console.log("✅ Bot ishlashga tayyor!");
