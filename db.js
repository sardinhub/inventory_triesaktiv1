const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ Gagal terhubung ke database:', err.message);
    else console.log('✅ Terhubung ke database SQLite.');
});

db.serialize(() => {
    // 1. Assets Table
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        condition TEXT,
        status TEXT,
        location TEXT,
        owner TEXT
    )`);

    // 2. Borrows (Peminjaman) Table
    db.run(`CREATE TABLE IF NOT EXISTS borrows (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        borrower_name TEXT NOT NULL,
        reason TEXT,
        request_date TEXT,
        status TEXT
    )`);

    // 3. Maintenance (Tiket Servis) Table
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        issue_desc TEXT,
        priority TEXT,
        status TEXT
    )`);

    // 4. Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL
    )`);

    // Seeder
    db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
        if (row && row.count === 0) {
            console.log("Menyuntikkan data akun user...");
            const stmt = db.prepare("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)");
            stmt.run("admin", "admin123", "Admin", "Admin Ops");
            stmt.run("staf", "staf123", "Staff", "Staf Gudang");
            stmt.finalize();
        }
    });

    // Seeder Assets
    db.get("SELECT COUNT(*) AS count FROM assets", (err, row) => {
        if (row.count === 0) {
            console.log("Menyuntikkan data seeder...");
            
            const stmtAsset = db.prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)");
            stmtAsset.run("INV-ELK-001", "Laptop Lenovo ThinkPad T14", "Elektronik", "Bagus", "Dipinjam", "Divisi Marketing", "Budi Santoso");
            stmtAsset.run("INV-ELK-002", "MacBook Pro M2 2023", "Elektronik", "Bagus", "Tersedia", "Gudang IT", "-");
            stmtAsset.run("INV-ALA-001", "Printer Epson L3110", "Alat Tulis Kantor", "Rusak", "Servis", "Ruang Staff", "Fasilitas Umum");
            stmtAsset.finalize();

            const stmtBorrow = db.prepare("INSERT INTO borrows VALUES (?, ?, ?, ?, ?, ?)");
            stmtBorrow.run("REQ-001", "INV-ELK-001", "Budi Santoso", "Untuk presentasi di luar kota", new Date().toLocaleDateString('id-ID'), "Approved");
            stmtBorrow.run("REQ-002", "INV-ELK-002", "Sarah Marketing", "Laptop utama rusak", new Date().toLocaleDateString('id-ID'), "Menunggu Approval");
            stmtBorrow.finalize();

            const stmtTicket = db.prepare("INSERT INTO tickets VALUES (?, ?, ?, ?, ?)");
            stmtTicket.run("TCK-001", "INV-ALA-001", "Tinta macet dan hasil print bergaris", "Sedang", "Open");
            stmtTicket.finalize();
        }
    });

    // 5. Categories Table
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )`);

    // Seeder Categories
    db.get("SELECT COUNT(*) AS count FROM categories", (err, row) => {
        if (row && row.count === 0) {
            console.log("Menyuntikkan data master kategori...");
            const stmt = db.prepare("INSERT INTO categories (name) VALUES (?)");
            stmt.run("Elektronik");
            stmt.run("Furniture");
            stmt.run("Kendaraan");
            stmt.run("Alat Tulis Kantor");
            stmt.finalize();
        }
    });
});

module.exports = db;
