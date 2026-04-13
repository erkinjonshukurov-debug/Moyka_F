const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// -------------------- BOT MA'LUMOTLARI --------------------
const BOT_TOKEN = process.env.BOT_TOKEN || '8779251766:AAH12INusgBCawsk5awqIjcyHnNLiq5A33A';
const BOT_USERNAME = "Moyka_F_bot";
const BOT_VERSION = "1.0.0";

// -------------------- KONTAKT MA'LUMOTLARI --------------------
const ADMIN_PHONE = "+998979247888";
const ADMIN_IDS = [1437230485];
const SUPER_ADMIN_ID = 1437230485;

// -------------------- TO'LOV MA'LUMOTLARI --------------------
const CARD_NUMBER = "9860040115220143";
const CARD_OWNER = "Erkinjon Shukurov";
const BANK_NAME = "Xalq Bank";
const SERVICE_PRICE = 150000;

// -------------------- BONUS TIZIMI --------------------
const FREE_WASH_THRESHOLD = 5;
let pendingConfirmations = new Map(); // Kutilayotgan tasdiqlashlar { code: { userId, carNumber, expiresAt } }

// -------------------- XAVFSIZLIK --------------------
let adminSettings = {
    allowedEditors: [],
    lastChanges: [],
    securityLog: []
};

const MAX_CARS_PER_USER = 10;

// -------------------- RAILWAY VOLUME YO'LLARI --------------------
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const BACKUP_DIR = path.join(VOLUME_PATH, 'backups');
const REPORTS_DIR = path.join(VOLUME_PATH, 'reports');

const USERS_FILE = path.join(VOLUME_PATH, 'users.json');
const ORDERS_FILE = path.join(VOLUME_PATH, 'orders.json');
const ERRORS_FILE = path.join(VOLUME_PATH, 'errors.json');
const VERSION_FILE = path.join(VOLUME_PATH, 'version.json');
const ADMIN_SETTINGS_FILE = path.join(VOLUME_PATH, 'admin_settings.json');

// -------------------- MA'LUMOTLAR --------------------
let users = [];
let orders = [];
let errors = [];

// -------------------- PAPKALARNI YARATISH --------------------
function ensureVolumeDir() {
    const dirs = [VOLUME_PATH, BACKUP_DIR, REPORTS_DIR];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`✅ Papka yaratildi: ${dir}`);
        }
    }
}

ensureVolumeDir();

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.deleteWebHook().catch(e => console.log("Webhook xatolik:", e.message));

// -------------------- TASDIQLASH KODI YARATISH --------------------
function generateConfirmCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createConfirmationCode(userId, carNumber) {
    const code = generateConfirmCode();
    
    // Kodni vaqtincha saqlash (10 daqiqa amal qiladi)
    pendingConfirmations.set(code, {
        userId: userId,
        carNumber: carNumber,
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 daqiqa
    });
    
    // Eski kodlarni tozalash
    for (const [key, value] of pendingConfirmations.entries()) {
        if (value.expiresAt < Date.now()) {
            pendingConfirmations.delete(key);
        }
    }
    
    return code;
}

function verifyConfirmationCode(code, userId, carNumber) {
    const pending = pendingConfirmations.get(code);
    if (!pending) {
        return { success: false, message: "❌ Kod topilmadi yoki muddati o'tgan!" };
    }
    if (pending.userId !== userId) {
        return { success: false, message: "❌ Noto'g'ri kod!" };
    }
    if (pending.carNumber !== carNumber) {
        return { success: false, message: "❌ Kod boshqa avtomobil uchun!" };
    }
    if (pending.expiresAt < Date.now()) {
        pendingConfirmations.delete(code);
        return { success: false, message: "❌ Kodning muddati o'tgan! Yangi kod yarating." };
    }
    
    // Kodni ishlatilgan deb belgilash
    pendingConfirmations.delete(code);
    return { success: true, message: "✅ Kod tasdiqlandi!" };
}

// -------------------- MA'LUMOTLARNI YUKLASH/SAQLASH --------------------
function loadData() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
            users.forEach(u => {
                if (u.isBlocked === undefined) u.isBlocked = false;
                if (!u.cars) u.cars = [];
                if (u.totalWashes === undefined) u.totalWashes = 0;
                if (u.freeWashes === undefined) u.freeWashes = 0;
                if (u.washCount === undefined) u.washCount = 0;
                if (u.cars) {
                    u.cars.forEach(c => {
                        if (c.washCount === undefined) c.washCount = 0;
                        if (c.freeWashes === undefined) c.freeWashes = 0;
                    });
                }
            });
            saveUsers();
        } else {
            users = [];
            saveUsers();
        }
        
        if (fs.existsSync(ORDERS_FILE)) {
            orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
        } else {
            orders = [];
            saveOrders();
        }
        
        if (fs.existsSync(ERRORS_FILE)) {
            errors = JSON.parse(fs.readFileSync(ERRORS_FILE, "utf8"));
        } else {
            errors = [];
            saveErrors();
        }
        
        console.log(`✅ Ma'lumotlar yuklandi: ${users.length} foydalanuvchi, ${orders.length} buyurtma`);
    } catch (err) {
        console.error("Ma'lumot yuklash xatolik:", err);
        users = [];
        orders = [];
        errors = [];
    }
}

function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function saveOrders() { fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2)); }
function saveErrors() { fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2)); }

function loadAdminSettings() {
    try {
        if (fs.existsSync(ADMIN_SETTINGS_FILE)) {
            adminSettings = JSON.parse(fs.readFileSync(ADMIN_SETTINGS_FILE, "utf8"));
        } else {
            saveAdminSettings();
        }
    } catch (err) {
        adminSettings = { allowedEditors: [], lastChanges: [], securityLog: [] };
    }
}

function saveAdminSettings() {
    fs.writeFileSync(ADMIN_SETTINGS_FILE, JSON.stringify(adminSettings, null, 2));
}

// -------------------- FOYDALANUVCHI FUNKSIYALARI --------------------
function getUserByUserId(userId) {
    return users.find(u => u.userId === userId);
}

function getUserByPhone(phone) {
    return users.find(u => u.phone === phone);
}

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

function isSuperAdmin(userId) {
    return userId === SUPER_ADMIN_ID;
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

function blockUser(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    if (user.isAdmin) return { success: false, message: "Adminni bloklab bo'lmaydi!" };
    user.isBlocked = true;
    saveUsers();
    return { success: true, message: `✅ Foydalanuvchi bloklandi: ${user.fullName || user.phone}` };
}

function unblockUser(userId) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    user.isBlocked = false;
    saveUsers();
    return { success: true, message: `✅ Foydalanuvchi blokdan ochildi: ${user.fullName || user.phone}` };
}

function deleteUser(userId) {
    const userIndex = users.findIndex(u => u.userId === userId);
    if (userIndex === -1) return { success: false, message: "Foydalanuvchi topilmadi" };
    const user = users[userIndex];
    if (user.isAdmin) return { success: false, message: "Adminni o'chirib bo'lmaydi!" };
    users.splice(userIndex, 1);
    saveUsers();
    return { success: true, message: `🗑️ Foydalanuvchi o'chirildi: ${user.fullName || user.phone}` };
}

function addNewUser(userId, phoneNumber, carNumber, firstName, lastName, username) {
    const newUser = {
        userId: userId,
        phone: phoneNumber,
        firstName: firstName || "",
        lastName: lastName || "",
        username: username || "",
        fullName: `${firstName || ""} ${lastName || ""}`.trim(),
        isAdmin: false,
        isBlocked: false,
        registeredDate: new Date().toISOString(),
        cars: [{
            carId: Date.now(),
            carNumber: carNumber,
            addedDate: new Date().toISOString(),
            washCount: 0,
            freeWashes: 0
        }],
        totalWashes: 0,
        freeWashes: 0,
        washCount: 0
    };
    users.push(newUser);
    saveUsers();
    return newUser;
}

function addCarToUser(phoneNumber, carNumber) {
    const user = getUserByPhone(phoneNumber);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    if (user.cars.length >= MAX_CARS_PER_USER) {
        return { success: false, message: `Maksimum ${MAX_CARS_PER_USER} ta avtomobil qo'sha olasiz!` };
    }
    if (user.cars.find(c => c.carNumber === carNumber)) {
        return { success: false, message: "Bu avtomobil allaqachon qo'shilgan!" };
    }
    user.cars.push({
        carId: Date.now(),
        carNumber: carNumber,
        addedDate: new Date().toISOString(),
        washCount: 0,
        freeWashes: 0
    });
    saveUsers();
    return { success: true, message: "Yangi avtomobil qo'shildi!" };
}

// -------------------- MOYKA HISOBLASH FUNKSIYASI --------------------
function addWashToCar(userId, carNumber, adminId = null) {
    const user = getUserByUserId(userId);
    if (!user) return { success: false, message: "Foydalanuvchi topilmadi" };
    
    const car = user.cars.find(c => c.carNumber === carNumber);
    if (!car) return { success: false, message: "Avtomobil topilmadi" };
    
    let isFree = false;
    let bonusMessage = "";
    let newWashCount = car.washCount;
    let newFreeWashes = car.freeWashes;
    
    if (car.freeWashes > 0) {
        isFree = true;
        newFreeWashes--;
        bonusMessage = "🎉 BEPUL moykadan foydalandingiz!";
    } else {
        newWashCount++;
        
        if (newWashCount >= FREE_WASH_THRESHOLD) {
            const freeCount = Math.floor(newWashCount / FREE_WASH_THRESHOLD);
            newFreeWashes += freeCount;
            newWashCount = newWashCount % FREE_WASH_THRESHOLD;
            bonusMessage = `🎉🎉🎉 TABRIKLAYMIZ! ${FREE_WASH_THRESHOLD}-moykani tugatdingiz va ${freeCount} ta BEPUL moyka qozondingiz!`;
        }
    }
    
    const order = {
        id: Date.now(),
        orderNumber: `MOYKA-${Date.now()}`,
        carNumber: carNumber,
        phoneNumber: user.phone,
        userName: user.fullName || user.phone,
        userId: userId,
        status: "completed",
        price: isFree ? 0 : SERVICE_PRICE,
        isFree: isFree,
        date: new Date().toISOString(),
        adminId: adminId
    };
    orders.unshift(order);
    saveOrders();
    
    car.washCount = newWashCount;
    car.freeWashes = newFreeWashes;
    
    user.totalWashes = (user.totalWashes || 0) + 1;
    if (isFree) {
        user.freeWashes = (user.freeWashes || 0) + 1;
    } else {
        user.washCount = (user.washCount || 0) + 1;
    }
    
    saveUsers();
    addSecurityLog("WASH_ADDED", adminId || userId, `Moyka: ${carNumber} (${isFree ? "BEPUL" : "TO'LOVLI"})`);
    
    return {
        success: true,
        isFree: isFree,
        price: isFree ? 0 : SERVICE_PRICE,
        newWashCount: newWashCount,
        newFreeWashes: newFreeWashes,
        bonusMessage: bonusMessage,
        carNumber: carNumber,
        order: order
    };
}

// -------------------- STATISTIKA FUNKSIYALARI --------------------
function getUserOrders(phoneNumber, limit = 20) {
    return orders.filter(o => o.phoneNumber === phoneNumber).slice(-limit).reverse();
}

function getAllOrders(limit = 500) {
    return orders.slice(-limit).reverse();
}

function getTodayOrders() {
    const today = new Date().toISOString().split("T")[0];
    return orders.filter(o => o.date.split("T")[0] === today);
}

function getStatistics() {
    const activeUsers = users.filter(u => !u.isAdmin && !u.isBlocked);
    const blockedUsers = users.filter(u => !u.isAdmin && u.isBlocked);
    
    let totalCars = 0;
    for (const user of activeUsers) {
        totalCars += user.cars.length;
    }
    
    const totalIncome = orders.reduce((sum, o) => sum + o.price, 0);
    const freeWashes = orders.filter(o => o.isFree).length;
    const paidWashes = orders.filter(o => !o.isFree).length;
    
    return {
        totalUsers: activeUsers.length,
        blockedUsers: blockedUsers.length,
        totalCars: totalCars,
        totalOrders: orders.length,
        paidWashes: paidWashes,
        freeWashes: freeWashes,
        todayOrders: getTodayOrders().length,
        totalIncome: totalIncome,
        totalErrors: errors.length
    };
}

async function generateOrdersReport(ordersList) {
    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
        const filename = `orders_report_${timestamp}.txt`;
        const filepath = path.join(REPORTS_DIR, filename);
        
        let content = "";
        content += "=".repeat(80) + "\n";
        content += "                    MOYKA F - BUYURTMALAR HISOBOTI\n";
        content += "=".repeat(80) + "\n\n";
        content += `Yaratilgan sana: ${new Date().toLocaleString()}\n`;
        content += `Jami buyurtmalar: ${ordersList.length} ta\n`;
        content += `To'lovli: ${ordersList.filter(o => !o.isFree).length} ta\n`;
        content += `Bepul: ${ordersList.filter(o => o.isFree).length} ta\n`;
        content += `Umumiy daromad: ${ordersList.reduce((s, o) => s + o.price, 0).toLocaleString()} so'm\n\n`;
        
        content += "----------------------- BUYURTMALAR RO'YXATI -----------------------\n";
        content += "=".repeat(80) + "\n\n";
        
        let i = 1;
        for (const order of ordersList.slice(0, 200)) {
            content += `📅 ${i}-BUYURTMA\n`;
            content += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
            content += `📆 Sana: ${new Date(order.date).toLocaleString()}\n`;
            content += `🚗 Avtomobil raqami: ${order.carNumber}\n`;
            content += `👤 Foydalanuvchi: ${order.userName || "Ism kiritilmagan"}\n`;
            content += `📞 Telefon: ${order.phoneNumber}\n`;
            content += `💰 Narx: ${order.price.toLocaleString()} so'm\n`;
            content += `🎁 Holat: ${order.isFree ? "BEPUL" : "TO'LOVLI"}\n`;
            content += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
            i++;
        }
        
        try {
            fs.writeFileSync(filepath, content, "utf8");
            resolve(filepath);
        } catch (err) {
            reject(err);
        }
    });
}

// -------------------- BACKUP FUNKSIYALARI --------------------
function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    
    if (fs.existsSync(USERS_FILE)) {
        fs.copyFileSync(USERS_FILE, path.join(BACKUP_DIR, `users_backup_${timestamp}.json`));
    }
    if (fs.existsSync(ORDERS_FILE)) {
        fs.copyFileSync(ORDERS_FILE, path.join(BACKUP_DIR, `orders_backup_${timestamp}.json`));
    }
    
    const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json"));
    while (backups.length > 30) {
        const oldest = backups.sort()[0];
        fs.unlinkSync(path.join(BACKUP_DIR, oldest));
        backups.shift();
    }
    console.log(`✅ Backup yaratildi: ${timestamp}`);
    return true;
}

function listBackups() {
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
    
    const ordersBackupName = backupName.replace("users_backup_", "orders_backup_");
    const ordersBackupPath = path.join(BACKUP_DIR, ordersBackupName);
    if (fs.existsSync(ordersBackupPath)) {
        const ordersData = JSON.parse(fs.readFileSync(ordersBackupPath, "utf8"));
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(ordersData, null, 2));
        orders = ordersData;
    }
    
    loadData();
    console.log(`✅ Database tiklandi: ${backupName}`);
    return true;
}

// -------------------- KLAVIATURALAR --------------------
function getMainKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ["🚗 Yangi buyurtma", "📋 Mening buyurtmalarim"],
                ["🚘 Mening avtomobillarim", "➕ Avtomobil qo'shish"],
                ["💳 To'lov", "ℹ️ Ma'lumot"],
                ["🎁 Mening bonuslarim"]
            ],
            resize_keyboard: true
        }
    };
}

function getAdminKeyboard() {
    const keyboard = [
        ["📊 Statistika", "👥 Foydalanuvchilar"],
        ["📋 Buyurtmalar tarixi", "📅 Bugungi buyurtmalar"],
        ["📄 Hisobot", "💾 Backup"],
        ["🔄 Tiklash", "🚫 Foyd. boshqarish"],
        ["🔐 Xavfsizlik", "✅ Kodni tasdiqlash"]
    ];
    keyboard.push(["❌ Chiqish"]);
    
    return {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true
        }
    };
}

function getPhoneKeyboard() {
    return {
        reply_markup: {
            keyboard: [[{ text: "📱 Telefon raqamini yuborish", request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
}

function removeKeyboard() {
    return { reply_markup: { remove_keyboard: true } };
}

async function sendMainMenu(chatId, isAdminUser = false) {
    if (isAdminUser) {
        await bot.sendMessage(chatId, "👑 *MOYKA F - ADMIN PANELI*\n\nXush kelibsiz!", {
            parse_mode: "Markdown",
            ...getAdminKeyboard()
        });
    } else {
        await bot.sendMessage(chatId, "🚗 *MOYKA F BOT*\n\nXush kelibsiz! Quyidagi menyu orqali buyurtma berishingiz mumkin:", {
            parse_mode: "Markdown",
            ...getMainKeyboard()
        });
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
    
    clearUserSession(userId);
    const existingUser = getUserByUserId(userId);
    
    if (existingUser && existingUser.isBlocked) {
        await bot.sendMessage(chatId, "🚫 *Siz botdan bloklangansiz!*", { parse_mode: "Markdown", ...removeKeyboard() });
        return;
    }
    
    if (existingUser) {
        if (!existingUser.firstName && firstName) {
            existingUser.firstName = firstName;
            existingUser.lastName = lastName;
            existingUser.fullName = `${firstName} ${lastName}`.trim();
            saveUsers();
        }
        
        let bonusText = "";
        if (existingUser.cars.length > 0) {
            const mainCar = existingUser.cars[0];
            const remainingForFree = FREE_WASH_THRESHOLD - mainCar.washCount;
            bonusText = `\n\n🎁 *BONUS:* ${mainCar.washCount}/${FREE_WASH_THRESHOLD}`;
            if (mainCar.freeWashes > 0) {
                bonusText += `\n🎉 *Bepul moyka: ${mainCar.freeWashes} ta!*`;
            } else if (remainingForFree > 0) {
                bonusText += `\n📌 *Keyingi bepul: ${remainingForFree} ta moykadan keyin*`;
            }
        }
        
        await bot.sendMessage(chatId, `👋 *Xush kelibsiz, ${existingUser.fullName || firstName || "hurmatli mijoz"}!*${bonusText}`, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, existingUser.isAdmin);
    } else {
        const session = getUserSession(userId);
        session.data.firstName = firstName;
        session.data.lastName = lastName;
        session.data.username = username;
        
        await bot.sendMessage(chatId, "🚗 *MOYKA F BOT* ga xush kelibsiz!\n\n📱 Iltimos, telefon raqamingizni yuboring:", {
            parse_mode: "Markdown",
            ...getPhoneKeyboard()
        });
    }
});

// -------------------- KONTAKT QABUL QILISH --------------------
bot.on("contact", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const contact = msg.contact;
    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";
    
    if (!contact) return;
    
    let phoneNumber = contact.phone_number;
    if (!phoneNumber.startsWith("+")) phoneNumber = "+" + phoneNumber;
    
    const session = getUserSession(userId);
    session.data.phone = phoneNumber;
    
    if (phoneNumber === ADMIN_PHONE) {
        const newUser = {
            userId: userId,
            phone: phoneNumber,
            firstName: firstName,
            lastName: lastName,
            fullName: `${firstName} ${lastName}`.trim(),
            isAdmin: true,
            isBlocked: false,
            registeredDate: new Date().toISOString(),
            cars: [],
            totalWashes: 0,
            freeWashes: 0,
            washCount: 0
        };
        users.push(newUser);
        saveUsers();
        
        await bot.sendMessage(chatId, "👑 *Siz ADMIN sifatida tizimga kirdingiz!*", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true);
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
        await bot.sendMessage(chatId, `✅ Telefon raqam tasdiqlandi: ${phoneNumber}\n\n🚗 *Yangi avtomobil raqamini kiriting:*`, {
            parse_mode: "Markdown",
            ...removeKeyboard()
        });
    } else {
        session.step = "first_car_number";
        await bot.sendMessage(chatId, `✅ Telefon raqam qabul qilindi: ${phoneNumber}\n\n🚗 *Avtomobil raqamini kiriting:*`, {
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
    
    if (!text || text === "/start") return;
    
    const session = getUserSession(userId);
    const user = getUserByUserId(userId);
    
    if (!user && !session.step) {
        await bot.sendMessage(chatId, "❌ Iltimos, /start bosing.", { parse_mode: "Markdown" });
        return;
    }
    
    if (user && user.isBlocked) {
        await bot.sendMessage(chatId, "🚫 *Siz botdan bloklangansiz!*", { parse_mode: "Markdown" });
        return;
    }
    
    // -------------------- RO'YXATDAN O'TISH --------------------
    if (session.step === "first_car_number") {
        const carNumber = text.toUpperCase().trim();
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri avtomobil raqami!*", { parse_mode: "Markdown" });
            return;
        }
        
        addNewUser(userId, session.data.phone, carNumber, session.data.firstName, session.data.lastName, session.data.username);
        await bot.sendMessage(chatId, `✅ *Ro'yxatdan o'tdingiz!*\n\n🚗 ${carNumber}\n📞 ${session.data.phone}\n\n🎁 *Bonus tizimi:* Har ${FREE_WASH_THRESHOLD} moykada 1 ta BEPUL!`, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, false);
        clearUserSession(userId);
        return;
    }
    
    if (session.step === "add_new_car") {
        const carNumber = text.toUpperCase().trim();
        if (carNumber.length < 2 || carNumber.length > 10) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri raqam!*", { parse_mode: "Markdown" });
            return;
        }
        
        const result = addCarToUser(session.data.phone, carNumber);
        await bot.sendMessage(chatId, result.success ? `✅ ${result.message}\n\n🚗 ${carNumber}` : `❌ ${result.message}`, { parse_mode: "Markdown" });
        clearUserSession(userId);
        await sendMainMenu(chatId, false);
        return;
    }
    
    // -------------------- ADMIN KODNI TASDIQLASH --------------------
    if (session.step === "admin_confirm_code" && isAdmin(userId)) {
        const code = text.trim();
        
        // Kodni tekshirish
        let foundPending = null;
        for (const [key, value] of pendingConfirmations.entries()) {
            if (key === code) {
                foundPending = value;
                break;
            }
        }
        
        if (!foundPending) {
            await bot.sendMessage(chatId, "❌ *Noto'g'ri kod yoki muddati o'tgan!*\n\nIltimos, foydalanuvchidan yangi kod oling.", { parse_mode: "Markdown" });
            return;
        }
        
        const targetUser = getUserByUserId(foundPending.userId);
        if (!targetUser) {
            await bot.sendMessage(chatId, "❌ *Foydalanuvchi topilmadi!*", { parse_mode: "Markdown" });
            return;
        }
        
        // Moykani qo'shish
        const result = addWashToCar(foundPending.userId, foundPending.carNumber, userId);
        
        if (!result.success) {
            await bot.sendMessage(chatId, `❌ *Xatolik:* ${result.message}`, { parse_mode: "Markdown" });
            clearUserSession(userId);
            await sendMainMenu(chatId, true);
            return;
        }
        
        // Kodni o'chirish
        pendingConfirmations.delete(code);
        
        let adminResponse = `✅ *MOYKA TASDIQLANDI!*\n\n`;
        adminResponse += `🚗 ${result.carNumber}\n`;
        adminResponse += `👤 ${targetUser.fullName || "Ismsiz"}\n`;
        adminResponse += `📞 ${targetUser.phone}\n`;
        adminResponse += `💰 Narx: ${result.price.toLocaleString()} so'm\n`;
        adminResponse += `🎁 ${result.isFree ? "BEPUL" : "TO'LOVLI"}\n\n`;
        adminResponse += result.bonusMessage;
        
        await bot.sendMessage(chatId, adminResponse, { parse_mode: "Markdown" });
        
        // Foydalanuvchiga xabar yuborish
        let userMsg = `🚗 *MOYKA F - XIZMAT TASDIQLANDI!*\n\n`;
        userMsg += `🚗 Avtomobil: ${result.carNumber}\n`;
        userMsg += `📅 Sana: ${new Date().toLocaleString()}\n`;
        userMsg += `💰 Narx: ${result.price.toLocaleString()} so'm\n\n`;
        userMsg += result.bonusMessage;
        
        if (result.newFreeWashes > 0) {
            userMsg += `\n\n🎉 *Sizda ${result.newFreeWashes} ta BEPUL moyka mavjud!*`;
        }
        
        bot.sendMessage(targetUser.userId, userMsg, { parse_mode: "Markdown" }).catch(() => {});
        
        clearUserSession(userId);
        await sendMainMenu(chatId, true);
        return;
    }
    
    // -------------------- FOYDALANUVCHI MENYU --------------------
    if (!isAdmin(userId)) {
        if (text === "🚗 Yangi buyurtma") {
            if (user.cars.length === 0) {
                await bot.sendMessage(chatId, "❌ *Sizda avtomobil mavjud emas!*", { parse_mode: "Markdown" });
                return;
            }
            
            const carKeyboard = user.cars.map(car => [{ text: `🚗 ${car.carNumber}`, callback_data: `order_car_${car.carNumber}` }]);
            carKeyboard.push([{ text: "🔙 Orqaga", callback_data: "back_to_main" }]);
            
            await bot.sendMessage(chatId, "🚗 *Buyurtma berish uchun avtomobilingizni tanlang:*", {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: carKeyboard }
            });
        }
        else if (text === "📋 Mening buyurtmalarim") {
            const userOrders = getUserOrders(user.phone, 10);
            if (userOrders.length === 0) {
                await bot.sendMessage(chatId, "📭 *Sizning buyurtmalaringiz mavjud emas!*", { parse_mode: "Markdown" });
            } else {
                let msg = "📋 *MENING BUYURTMALARIM*\n━━━━━━━━━━━━━━━━━━\n\n";
                for (const order of userOrders) {
                    msg += `📅 ${new Date(order.date).toLocaleString()}\n`;
                    msg += `🚗 ${order.carNumber}\n`;
                    msg += `💰 ${order.price.toLocaleString()} so'm\n`;
                    msg += order.isFree ? "🎉 BEPUL\n" : "━━━━━━━━━━━━━━━━━━\n";
                }
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, false);
        }
        else if (text === "🚘 Mening avtomobillarim") {
            if (user.cars.length === 0) {
                await bot.sendMessage(chatId, "📭 *Sizda avtomobillar mavjud emas!*", { parse_mode: "Markdown" });
            } else {
                let msg = "🚘 *MENGING AVTOMOBILLARIM*\n━━━━━━━━━━━━━━━━━━\n\n";
                for (const car of user.cars) {
                    const carOrders = orders.filter(o => o.carNumber === car.carNumber && o.phoneNumber === user.phone);
                    const remainingForFree = FREE_WASH_THRESHOLD - car.washCount;
                    msg += `🚗 *${car.carNumber}*\n`;
                    msg += `📊 Moykalar: ${carOrders.length} ta\n`;
                    msg += `🎁 Bonus: ${car.washCount}/${FREE_WASH_THRESHOLD}\n`;
                    if (car.freeWashes > 0) {
                        msg += `🎉 Bepul: ${car.freeWashes} ta\n`;
                    } else if (remainingForFree > 0) {
                        msg += `📌 Bepul: ${remainingForFree} ta moykadan keyin\n`;
                    }
                    msg += "━━━━━━━━━━━━━━━━━━\n";
                }
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
            await sendMainMenu(chatId, false);
        }
        else if (text === "➕ Avtomobil qo'shish") {
            if (user.cars.length >= MAX_CARS_PER_USER) {
                await bot.sendMessage(chatId, `❌ Maksimum ${MAX_CARS_PER_USER} ta avtomobil!`, { parse_mode: "Markdown" });
                await sendMainMenu(chatId, false);
                return;
            }
            
            const session = getUserSession(userId);
            session.step = "add_new_car";
            session.data.phone = user.phone;
            await bot.sendMessage(chatId, "🚗 *Yangi avtomobil raqamini kiriting:*\n\nMasalan: 01A777AA", {
                parse_mode: "Markdown",
                ...removeKeyboard()
            });
        }
        else if (text === "💳 To'lov") {
            await bot.sendMessage(chatId, `💳 *TO'LOV MA'LUMOTLARI*\n\n🏦 Bank: ${BANK_NAME}\n💳 Karta: \`${CARD_NUMBER}\`\n👤 Egasi: ${CARD_OWNER}\n💰 Summa: ${SERVICE_PRICE.toLocaleString()} so'm\n\n📌 To'lovni amalga oshirgandan so'ng, admin tasdiqlaydi.`, { parse_mode: "Markdown" });
        }
        else if (text === "🎁 Mening bonuslarim") {
            let bonusText = "🎁 *MENGING BONUSLARIM*\n━━━━━━━━━━━━━━━━━━\n\n";
            bonusText += `📌 *Qoida:* Har ${FREE_WASH_THRESHOLD} moykada 1 ta BEPUL!\n\n`;
            
            for (const car of user.cars) {
                const remainingForFree = FREE_WASH_THRESHOLD - car.washCount;
                bonusText += `🚗 *${car.carNumber}*\n`;
                bonusText += `📊 To'plangan: ${car.washCount}/${FREE_WASH_THRESHOLD}\n`;
                bonusText += `🎉 Bepul: ${car.freeWashes} ta\n`;
                
                if (car.freeWashes > 0) {
                    bonusText += `✅ *Sizda ${car.freeWashes} ta BEPUL moyka bor!*\n`;
                } else if (remainingForFree > 0 && remainingForFree < FREE_WASH_THRESHOLD) {
                    bonusText += `📌 *Keyingi BEPUL:* ${remainingForFree} ta moykadan keyin\n`;
                }
                bonusText += "━━━━━━━━━━━━━━━━━━\n";
            }
            
            bonusText += `\n🎯 *QANDAY ISHLAYDI?*\n`;
            bonusText += `• Har ${FREE_WASH_THRESHOLD} ta to'lovli moyka = 1 ta BEPUL\n`;
            bonusText += `• Har bir avtomobil uchun bonus alohida hisoblanadi\n`;
            bonusText += `• Bepul moyka cheksiz muddatga amal qiladi`;
            
            await bot.sendMessage(chatId, bonusText, { parse_mode: "Markdown" });
            await sendMainMenu(chatId, false);
        }
        else if (text === "ℹ️ Ma'lumot") {
            await bot.sendMessage(chatId, `ℹ️ *MOYKA F BOT*\n\n🚗 Avtomobil moykasi xizmati\n💰 Xizmat narxi: ${SERVICE_PRICE.toLocaleString()} so'm\n🎁 Har ${FREE_WASH_THRESHOLD} moykada 1 ta BEPUL\n📞 Aloqa: ${ADMIN_PHONE}\n📌 Versiya: ${BOT_VERSION}`, { parse_mode: "Markdown" });
        }
        else {
            await sendMainMenu(chatId, false);
        }
        return;
    }
    
    // -------------------- ADMIN MENYU --------------------
    if (isAdmin(userId)) {
        if (text === "📊 Statistika") {
            const stats = getStatistics();
            await bot.sendMessage(chatId, `📊 *STATISTIKA*\n\n👥 Faol: ${stats.totalUsers}\n🚫 Bloklangan: ${stats.blockedUsers}\n🚗 Avtomobillar: ${stats.totalCars}\n📋 Jami: ${stats.totalOrders}\n💰 To'lovli: ${stats.paidWashes}\n🎉 Bepul: ${stats.freeWashes}\n📅 Bugungi: ${stats.todayOrders}\n💵 Daromad: ${stats.totalIncome.toLocaleString()} so'm`, { parse_mode: "Markdown" });
        }
        else if (text === "👥 Foydalanuvchilar") {
            const usersList = users.filter(u => !u.isAdmin).map(u => `${u.isBlocked ? "🔴" : "🟢"} ${u.fullName || "Ismsiz"} - ${u.phone} (${u.cars.length} ta, ${u.totalWashes || 0} moyka)`);
            const msg = usersList.length ? `👥 *FOYDALANUVCHILAR*\n\n${usersList.slice(0, 20).join("\n")}` : "📭 Hech qanday foydalanuvchi yo'q";
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
        }
        else if (text === "✅ Kodni tasdiqlash") {
            const adminSession = getUserSession(userId);
            adminSession.step = "admin_confirm_code";
            await bot.sendMessage(chatId, "🔐 *KODNI TASDIQLASH*\n\nIltimos, foydalanuvchi botida olingan 6 xonali tasdiqlash kodini kiriting:\n\nMasalan: 482739", {
                parse_mode: "Markdown",
                ...removeKeyboard()
            });
        }
        else if (text === "📋 Buyurtmalar tarixi") {
            const allOrders = getAllOrders(20);
            if (allOrders.length === 0) {
                await bot.sendMessage(chatId, "📭 Buyurtmalar yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = "📋 *BUYURTMALAR TARIXI*\n━━━━━━━━━━━━━━━━━━\n\n";
                for (const order of allOrders.slice(0, 15)) {
                    msg += `📅 ${new Date(order.date).toLocaleString()}\n`;
                    msg += `🚗 ${order.carNumber}\n`;
                    msg += `👤 ${order.userName}\n`;
                    msg += `💰 ${order.price.toLocaleString()} so'm\n`;
                    msg += order.isFree ? "🎉 BEPUL\n" : "━━━━━━━━━━━━━━━━━━\n";
                }
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
        }
        else if (text === "📅 Bugungi buyurtmalar") {
            const todayOrders = getTodayOrders();
            if (todayOrders.length === 0) {
                await bot.sendMessage(chatId, "📭 Bugun buyurtmalar yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = "📅 *BUGUNGI BUYURTMALAR*\n━━━━━━━━━━━━━━━━━━\n\n";
                for (const order of todayOrders) {
                    msg += `🚗 ${order.carNumber}\n👤 ${order.userName}\n💰 ${order.price.toLocaleString()} so'm\n${order.isFree ? "🎉 BEPUL\n" : "━━━━━━━━━━━━━━━━━━\n"}`;
                }
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
            }
        }
        else if (text === "📄 Hisobot") {
            await bot.sendMessage(chatId, "📄 *Hisobot tayyorlanmoqda...*", { parse_mode: "Markdown" });
            try {
                const allOrders = getAllOrders(500);
                const filepath = await generateOrdersReport(allOrders);
                await bot.sendDocument(chatId, filepath, { caption: `📊 Buyurtmalar hisoboti\n📅 ${new Date().toLocaleString()}` });
                setTimeout(() => fs.unlinkSync(filepath), 60000);
            } catch (error) {
                await bot.sendMessage(chatId, "❌ *Xatolik!*", { parse_mode: "Markdown" });
            }
        }
        else if (text === "💾 Backup") {
            await bot.sendMessage(chatId, "💾 *Backup yaratilmoqda...*", { parse_mode: "Markdown" });
            createBackup();
            await bot.sendMessage(chatId, "✅ *Backup yaratildi!*", { parse_mode: "Markdown" });
        }
        else if (text === "🔄 Tiklash") {
            const backups = listBackups();
            if (backups.length === 0) {
                await bot.sendMessage(chatId, "❌ *Backup topilmadi!*", { parse_mode: "Markdown" });
            } else {
                let msg = "🔄 *DATABASE TIKLASH*\n\nBackup tanlang:\n\n";
                const keyboard = backups.slice(0, 10).map(b => [{ text: `📁 ${b.name.substring(0, 30)}`, callback_data: `restore_${b.name}` }]);
                keyboard.push([{ text: "❌ Bekor qilish", callback_data: "restore_cancel" }]);
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
            }
        }
        else if (text === "🚫 Foyd. boshqarish") {
            const activeUsers = users.filter(u => !u.isAdmin && !u.isBlocked);
            const blockedUsers = users.filter(u => !u.isAdmin && u.isBlocked);
            const allUsers = [...activeUsers, ...blockedUsers];
            
            if (allUsers.length === 0) {
                await bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi yo'q", { parse_mode: "Markdown" });
            } else {
                let msg = `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n🟢 Faol: ${activeUsers.length}\n🔴 Bloklangan: ${blockedUsers.length}\n\nTanlang:\n\n`;
                const keyboard = [];
                for (const u of allUsers.slice(0, 10)) {
                    keyboard.push([{ text: `${u.isBlocked ? "🔴" : "🟢"} ${(u.fullName || u.phone).substring(0, 20)}`, callback_data: `manage_user_${u.userId}` }]);
                }
                keyboard.push([{ text: "❌ Bekor qilish", callback_data: "user_manage_cancel" }]);
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
            }
        }
        else if (text === "🔐 Xavfsizlik") {
            const keyboard = [
                [{ text: "📜 Xavfsizlik jurnali", callback_data: "security_log" }],
                [{ text: "🔙 Orqaga", callback_data: "security_back" }]
            ];
            await bot.sendMessage(chatId, "🔐 *XAVFSIZLIK SOZLAMALARI*", { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
        }
        else if (text === "❌ Chiqish") {
            await sendMainMenu(chatId, false);
        }
        else {
            await sendMainMenu(chatId, true);
        }
        return;
    }
});

// -------------------- CALLBACK QUERY --------------------
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
    
    // Buyurtma berish (foydalanuvchi tasdiqlash kodini oladi)
    if (data.startsWith("order_car_")) {
        const carNumber = data.replace("order_car_", "");
        const car = user.cars.find(c => c.carNumber === carNumber);
        
        if (!car) {
            await bot.sendMessage(chatId, "❌ *Avtomobil topilmadi!*", { parse_mode: "Markdown" });
            return;
        }
        
        // Tasdiqlash kodini yaratish
        const confirmCode = await createConfirmationCode(userId, carNumber);
        
        await bot.sendMessage(chatId, `🔐 *TASDIQLASH KODI*\n\n🚗 Avtomobil: ${carNumber}\n💰 Narx: ${SERVICE_PRICE.toLocaleString()} so'm\n\n📌 *Tasdiqlash kodi:* \`${confirmCode}\`\n\n⏳ Kod 10 daqiqa amal qiladi.\n\n⚠️ *Ushbu kodni admin botiga yuboring!*\n\nAdmin botida "✅ Kodni tasdiqlash" tugmasini bosib, kodni kiriting.`, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔄 Yangi kod olish", callback_data: `refresh_code_${carNumber}` }],
                    [{ text: "🔙 Asosiy menyu", callback_data: "back_to_main" }]
                ]
            }
        });
    }
    else if (data.startsWith("refresh_code_")) {
        const carNumber = data.replace("refresh_code_", "");
        const car = user.cars.find(c => c.carNumber === carNumber);
        
        if (!car) {
            await bot.sendMessage(chatId, "❌ *Avtomobil topilmadi!*", { parse_mode: "Markdown" });
            return;
        }
        
        // Eski kodlarni tozalash (bu foydalanuvchi uchun)
        for (const [key, value] of pendingConfirmations.entries()) {
            if (value.userId === userId && value.carNumber === carNumber) {
                pendingConfirmations.delete(key);
            }
        }
        
        // Yangi kod yaratish
        const confirmCode = await createConfirmationCode(userId, carNumber);
        
        await bot.sendMessage(chatId, `🔐 *YANGI TASDIQLASH KODI*\n\n🚗 Avtomobil: ${carNumber}\n💰 Narx: ${SERVICE_PRICE.toLocaleString()} so'm\n\n📌 *Tasdiqlash kodi:* \`${confirmCode}\`\n\n⏳ Kod 10 daqiqa amal qiladi.\n\n⚠️ *Ushbu kodni admin botiga yuboring!*`, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔄 Yangi kod olish", callback_data: `refresh_code_${carNumber}` }],
                    [{ text: "🔙 Asosiy menyu", callback_data: "back_to_main" }]
                ]
            }
        });
    }
    else if (data === "back_to_main") {
        await sendMainMenu(chatId, isAdmin(userId));
    }
    else if (data.startsWith("restore_")) {
        const backupName = data.replace("restore_", "");
        await bot.sendMessage(chatId, "🔄 *Database tiklanmoqda...*", { parse_mode: "Markdown" });
        if (restoreBackup(backupName)) {
            await bot.sendMessage(chatId, "✅ *Database tiklandi!*", { parse_mode: "Markdown" });
        } else {
            await bot.sendMessage(chatId, "❌ *Xatolik!*", { parse_mode: "Markdown" });
        }
        await sendMainMenu(chatId, true);
    }
    else if (data === "restore_cancel") {
        await bot.sendMessage(chatId, "❌ *Bekor qilindi.*", { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true);
    }
    else if (data === "security_log") {
        let msg = "📜 *XAVFSIZLIK JURNALI*\n━━━━━━━━━━━━━━━━━━\n\n";
        if (adminSettings.securityLog.length === 0) {
            msg += "Hech qanday hodisa yo'q.";
        } else {
            for (const log of adminSettings.securityLog.slice(0, 15)) {
                msg += `📅 ${new Date(log.date).toLocaleString()}\n🔹 ${log.action}\n📝 ${log.details}\n━━━━━━━━━━━━━━━━━━\n`;
            }
        }
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
    }
    else if (data === "security_back") {
        await sendMainMenu(chatId, true);
    }
    else if (data === "user_manage_cancel") {
        await sendMainMenu(chatId, true);
    }
    else if (data.startsWith("manage_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const targetUser = getUserByUserId(targetUserId);
        if (!targetUser) {
            await bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi!", { parse_mode: "Markdown" });
            return;
        }
        
        const userInfo = `👤 *${targetUser.fullName || "Ismsiz"}*\n📞 ${targetUser.phone}\n🚗 ${targetUser.cars.length} ta\n📊 ${targetUser.totalWashes || 0} ta moyka\n🎁 Bonus: ${targetUser.washCount || 0}/${FREE_WASH_THRESHOLD}\n🎉 Bepul: ${targetUser.freeWashes || 0} ta\n🚦 ${targetUser.isBlocked ? "🔴 BLOKLANGAN" : "🟢 FAOL"}`;
        
        const keyboard = [];
        if (targetUser.isBlocked) {
            keyboard.push([{ text: "✅ Blokdan ochish", callback_data: `unblock_user_${targetUserId}` }]);
        } else {
            keyboard.push([{ text: "🚫 Bloklash", callback_data: `block_user_${targetUserId}` }]);
        }
        keyboard.push([{ text: "🗑️ O'chirish", callback_data: `delete_user_${targetUserId}` }]);
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
        await sendMainMenu(chatId, true);
    }
    else if (data.startsWith("unblock_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const result = unblockUser(targetUserId);
        await bot.sendMessage(chatId, result.message, { parse_mode: "Markdown" });
        await sendMainMenu(chatId, true);
    }
    else if (data.startsWith("delete_user_")) {
        const targetUserId = parseInt(data.split("_")[2]);
        const confirmKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Ha", callback_data: `confirm_delete_${targetUserId}` }],
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
        await sendMainMenu(chatId, true);
    }
    else if (data === "admin_manage_users") {
        const activeUsers = users.filter(u => !u.isAdmin && !u.isBlocked);
        const blockedUsers = users.filter(u => !u.isAdmin && u.isBlocked);
        const allUsers = [...activeUsers, ...blockedUsers];
        
        let msg = `👥 *FOYDALANUVCHILARNI BOSHQARISH*\n\n🟢 Faol: ${activeUsers.length}\n🔴 Bloklangan: ${blockedUsers.length}\n\nTanlang:\n\n`;
        const keyboard = [];
        for (const u of allUsers.slice(0, 10)) {
            keyboard.push([{ text: `${u.isBlocked ? "🔴" : "🟢"} ${(u.fullName || u.phone).substring(0, 20)}`, callback_data: `manage_user_${u.userId}` }]);
        }
        keyboard.push([{ text: "❌ Bekor qilish", callback_data: "user_manage_cancel" }]);
        
        await bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });
    }
});

// -------------------- XATOLIKLAR --------------------
bot.on("polling_error", (error) => console.error("Polling xatolik:", error));
process.on("uncaughtException", (error) => console.error("Uncaught exception:", error));

// -------------------- BOTNI ISHGA TUSHIRISH --------------------
console.log("=".repeat(60));
console.log("🚗 MOYKA F BOT ISHGA TUSHMOQDA");
console.log("=".repeat(60));

loadData();
loadAdminSettings();

// Eski kodlarni tozalash (har 5 daqiqada)
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of pendingConfirmations.entries()) {
        if (value.expiresAt < now) {
            pendingConfirmations.delete(key);
        }
    }
}, 5 * 60 * 1000);

console.log("=".repeat(60));
console.log(`✅ ${BOT_USERNAME} ishga tushdi!`);
console.log(`📌 Versiya: ${BOT_VERSION}`);
console.log(`👑 Adminlar: ${ADMIN_IDS.join(", ")}`);
console.log(`👥 Foydalanuvchilar: ${users.filter(u => !u.isAdmin).length}`);
console.log(`📋 Buyurtmalar: ${orders.length}`);
console.log(`💾 Volume: ${VOLUME_PATH}`);
console.log(`🎁 Bonus tizimi: Har ${FREE_WASH_THRESHOLD} moykada 1 ta BEPUL`);
console.log("=".repeat(60));
