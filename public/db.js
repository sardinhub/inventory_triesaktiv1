const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Membuat file database lokal bernama 'database.sqlite'
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Gagal terhubung ke database:', err.message);
    } else {
        console.log('✅ Terhubung ke database SQLite.');
    }
});

// Inisialisasi Tabel
db.serialize(() => {
    // Membuat tabel 'assets' jika belum ada
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        condition TEXT,
        status TEXT,
        location TEXT,
        owner TEXT
    )`);

    // Cek apakah tabel kosong. Jika ya, isi dengan data awal (Seeder)
    db.get("SELECT COUNT(*) AS count FROM assets", (err, row) => {
        if (row.count === 0) {
            console.log("Database masih kosong. Menyuntikkan data awal...");
            const stmt = db.prepare("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)");
            
            stmt.run("INV-ELK-001", "Laptop Lenovo ThinkPad T14", "Elektronik", "Bagus", "Dipinjam", "Divisi Marketing", "Budi Santoso");
            stmt.run("INV-ELK-002", "MacBook Pro M2 2023", "Elektronik", "Bagus", "Tersedia", "Gudang IT", "-");
            stmt.run("INV-ALA-001", "Printer Epson L3110", "Alat Tulis Kantor", "Bagus", "Sedang Digunakan", "Ruang Staff", "Fasilitas Umum");
            
            stmt.finalize();
        }
    });
});

module.exports = db;
