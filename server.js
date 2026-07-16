const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

// --- DATABASE INITIALIZER (Untuk Vercel Serverless) ---
app.get('/api/init', async (req, res) => {
    const runAsync = (query) => new Promise((resolve, reject) => {
        db.run(query, (err) => { if (err) reject(err); else resolve(); });
    });

    try {
        // Buat tabel jika belum ada
        await runAsync(`CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, name TEXT, brand TEXT, category TEXT, condition TEXT, status TEXT, location TEXT, owner TEXT, last_updated TEXT)`);
        await runAsync(`CREATE TABLE IF NOT EXISTS borrows (id TEXT PRIMARY KEY, asset_id TEXT, borrower TEXT, purpose TEXT, date_req TEXT, status TEXT, date_return TEXT, returned_by TEXT)`);
        await runAsync(`CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, asset_id TEXT, issue_desc TEXT, priority TEXT, status TEXT)`);
        await runAsync(`CREATE TABLE IF NOT EXISTS consumables (id VARCHAR(50) PRIMARY KEY, name VARCHAR(255) NOT NULL, category VARCHAR(100), unit VARCHAR(50) DEFAULT 'pcs', stock INTEGER DEFAULT 0, min_stock INTEGER DEFAULT 5, location VARCHAR(100), last_updated VARCHAR(50))`);
        await runAsync(`CREATE TABLE IF NOT EXISTS consumable_logs (id SERIAL PRIMARY KEY, consumable_id VARCHAR(50) NOT NULL, action VARCHAR(20) NOT NULL, quantity INTEGER NOT NULL, user_name VARCHAR(100), note TEXT, created_at VARCHAR(50))`);
        await runAsync(`CREATE TABLE IF NOT EXISTS locations (id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL)`);
        
        // Migrasi kolom jika sudah ada tabel lama
        try { await runAsync("ALTER TABLE borrows ADD COLUMN date_return TEXT"); } catch(e){}
        try { await runAsync("ALTER TABLE borrows ADD COLUMN returned_by TEXT"); } catch(e){}
        
        res.json({ message: "Database berhasil diinisialisasi & dimigrasi!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- AUTH / LOGIN ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT id, username, role, name FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            res.json({ success: true, user: row });
        } else {
            res.status(401).json({ success: false, message: "Username atau password salah!" });
        }
    });
});

// --- ASSETS ---
app.get('/api/assets', (req, res) => {
    db.all("SELECT * FROM assets ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/assets', (req, res) => {
    const { id, name, brand, category, condition, status, location, owner, last_updated } = req.body;
    db.run(`INSERT INTO assets (id, name, brand, category, condition, status, location, owner, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [id, name, brand, category, condition, status, location, owner, last_updated], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Aset disimpan!", id: this.lastID });
    });
});

app.put('/api/assets/:id', async (req, res) => {
    const runAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.run(query, params, function(err) { if (err) reject(err); else resolve(this); });
    });

    const { name, brand, category, condition, status, location, owner, last_updated, returned_by } = req.body;
    try {
        await runAsync(`UPDATE assets SET name=?, brand=?, category=?, condition=?, status=?, location=?, owner=?, last_updated=? WHERE id=?`, 
            [name, brand, category, condition, status, location, owner, last_updated, req.params.id]);
        
        // Jika status aset dikembalikan ke 'Tersedia', otomatis TUTUP peminjaman yang aktif
        if (status === 'Tersedia') {
            const now = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
            // Update semua peminjaman yang belum Close untuk aset ini
            await runAsync(`UPDATE borrows SET status='Close', date_return=?, returned_by=? WHERE asset_id=? AND status NOT IN ('Close', 'Closed', 'Ditolak')`, [now, returned_by || "Staff", req.params.id]);
        }
        
        res.json({ message: "Aset diupdate dan status peminjaman disinkronkan!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/assets/:id', (req, res) => {
    db.run(`DELETE FROM assets WHERE id=?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Aset dihapus!" });
    });
});

app.post('/api/assets/adjust-qty', async (req, res) => {
    const runAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.run(query, params, function(err) { if (err) reject(err); else resolve(this); });
    });
    const getAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => { if (err) reject(err); else resolve(row); });
    });
    const allAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
    });

    const { baseAssetId, newQuantity } = req.body;
    try {
        const baseAsset = await getAsync("SELECT * FROM assets WHERE id = ?", [baseAssetId]);
        if (!baseAsset) return res.status(404).json({ error: "Base asset not found" });

        const sameAssets = await allAsync("SELECT * FROM assets WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(COALESCE(brand, ''))) = LOWER(TRIM(COALESCE(?, '')))", [baseAsset.name, baseAsset.brand]);
        
        const currentQuantity = sameAssets.length;
        const diff = newQuantity - currentQuantity;

        if (diff > 0) {
            const catPrefix = (baseAsset.category || 'UNK').substring(0,3).toUpperCase();
            for (let i = 0; i < diff; i++) {
                const uniqueRandom = Math.floor(Math.random() * 900) + 100;
                const id = `INV-${catPrefix}-${uniqueRandom}-${Date.now().toString().slice(-4)}${i}`;
                await runAsync(`INSERT INTO assets (id, name, brand, category, condition, status, location, owner, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [id, baseAsset.name, baseAsset.brand, baseAsset.category, baseAsset.condition, baseAsset.status, baseAsset.location, baseAsset.owner, baseAsset.last_updated]);
            }
        } else if (diff < 0) {
            const toRemove = Math.abs(diff);
            sameAssets.sort((a, b) => {
                if (a.status === 'Tersedia' && b.status !== 'Tersedia') return -1;
                if (a.status !== 'Tersedia' && b.status === 'Tersedia') return 1;
                return 0;
            });
            for (let i = 0; i < toRemove; i++) {
                await runAsync("DELETE FROM assets WHERE id = ?", [sameAssets[i].id]);
            }
        }

        res.json({ message: "Quantity adjusted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- BORROWS ---
app.get('/api/borrows', (req, res) => {
    db.all(`SELECT b.*, a.name as asset_name FROM borrows b LEFT JOIN assets a ON b.asset_id = a.id ORDER BY b.id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/borrows', (req, res) => {
    const { id, asset_id, borrower_name, reason, request_date, status } = req.body;
    // Menggunakan nama kolom eksplisit agar aman meski ada penambahan kolom di masa depan
    db.run(`INSERT INTO borrows (id, asset_id, borrower, purpose, date_req, status) VALUES (?, ?, ?, ?, ?, ?)`, 
        [id, asset_id, borrower_name, reason, request_date, status], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Request dibuat!" });
    });
});

app.delete('/api/borrows/:id', (req, res) => {
    db.run(`DELETE FROM borrows WHERE id=?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Peminjaman dihapus!" });
    });
});

app.put('/api/borrows/:id/approve', async (req, res) => {
    const runAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.run(query, params, function(err) { if (err) reject(err); else resolve(this); });
    });
    const getAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => { if (err) reject(err); else resolve(row); });
    });

    try {
        await runAsync(`UPDATE borrows SET status='Approved' WHERE id=?`, [req.params.id]);
        const row = await getAsync("SELECT asset_id, borrower FROM borrows WHERE id=?", [req.params.id]);
        if(row) {
            await runAsync(`UPDATE assets SET status='Dipinjam', owner=? WHERE id=?`, [row.borrower, row.asset_id]);
        }
        res.json({ message: "Disetujui dan status aset diperbarui!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TICKETS ---
app.get('/api/tickets', (req, res) => {
    db.all(`SELECT t.*, a.name as asset_name FROM tickets t LEFT JOIN assets a ON t.asset_id = a.id ORDER BY t.id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tickets', (req, res) => {
    const { id, asset_id, issue_desc, priority, status } = req.body;
    db.run(`INSERT INTO tickets VALUES (?, ?, ?, ?, ?)`, [id, asset_id, issue_desc, priority, status], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`UPDATE assets SET status='Servis', condition='Rusak' WHERE id=?`, [asset_id]);
        res.json({ message: "Tiket dibuat!" });
    });
});

app.delete('/api/tickets/:id', (req, res) => {
    db.run(`DELETE FROM tickets WHERE id=?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Tiket dihapus!" });
    });
});

app.put('/api/tickets/:id/resolve', async (req, res) => {
    const runAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.run(query, params, function(err) { if (err) reject(err); else resolve(this); });
    });
    const getAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => { if (err) reject(err); else resolve(row); });
    });

    try {
        await runAsync(`UPDATE tickets SET status='Resolved' WHERE id=?`, [req.params.id]);
        const row = await getAsync("SELECT asset_id FROM tickets WHERE id=?", [req.params.id]);
        if(row) {
            await runAsync(`UPDATE assets SET status='Tersedia', condition='Bagus', owner='-' WHERE id=?`, [row.asset_id]);
        }
        res.json({ message: "Tiket diselesaikan dan aset kembali tersedia!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- STATS FOR LAPORAN ---
app.get('/api/stats', (req, res) => {
    db.all(`SELECT status, COUNT(*) as count FROM assets GROUP BY status`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- USERS MANAGEMENT ---
app.get('/api/users', (req, res) => {
    db.all("SELECT id, username, role, name FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', (req, res) => {
    const { username, password, role, name } = req.body;
    db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", [username, password, role, name], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "User ditambahkan!", id: this.lastID });
    });
});

app.delete('/api/users/:id', (req, res) => {
    db.run("DELETE FROM users WHERE id=?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "User dihapus!" });
    });
});

// --- CATEGORIES MANAGEMENT ---
app.get('/api/categories', (req, res) => {
    db.all("SELECT * FROM categories", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/categories', (req, res) => {
    const { name } = req.body;
    db.run("INSERT INTO categories (name) VALUES (?)", [name], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Kategori ditambahkan!", id: this.lastID });
    });
});

app.delete('/api/categories/:id', (req, res) => {
    db.run("DELETE FROM categories WHERE id=?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Kategori dihapus!" });
    });
});

// --- LOCATIONS MANAGEMENT ---
app.get('/api/locations', (req, res) => {
    db.all("SELECT * FROM locations", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/locations', (req, res) => {
    const { name } = req.body;
    db.run("INSERT INTO locations (name) VALUES (?)", [name], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Lokasi ditambahkan!", id: this.lastID });
    });
});

app.delete('/api/locations/:id', (req, res) => {
    db.run("DELETE FROM locations WHERE id=?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Lokasi dihapus!" });
    });
});

// --- SEEDER MANUAL ---
app.get('/api/seed', (req, res) => {
    try {
        db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", ["admin", "admin123", "Admin", "Admin Ops"]);
        db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", ["staf", "staf123", "Staff", "Staf Gudang"]);
        db.run("INSERT INTO categories (name) VALUES (?)", ["Elektronik"]);
        db.run("INSERT INTO categories (name) VALUES (?)", ["Furniture"]);
        db.run("INSERT INTO categories (name) VALUES (?)", ["Kendaraan"]);
        db.run("INSERT INTO categories (name) VALUES (?)", ["Alat Tulis Kantor"]);
        db.run("INSERT INTO locations (name) VALUES (?)", ["Gudang Utama"]);
        db.run("INSERT INTO locations (name) VALUES (?)", ["Ruang Meeting A"]);
        db.run("INSERT INTO locations (name) VALUES (?)", ["Ruang Manager"]);
        db.run("INSERT INTO assets (id, name, brand, category, condition, status, location, owner, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
            ["INV-ELK-001", "Laptop Lenovo", "Lenovo", "Elektronik", "Bagus", "Tersedia", "Gudang Utama", "-", new Date().toISOString().split('T')[0]]);
        
        res.json({ message: "🎉 SUKSES! Akun Admin dan data awal berhasil dibuat! Silakan kembali ke halaman awal dan lakukan Login." });
    } catch (e) {
        res.json({ error: e.message });
    }
});

// --- RESET DATABASE (Gunakan dengan hati-hati!) ---
app.get('/api/database/reset', async (req, res) => {
    const runAsync = (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    };

    try {
        console.log("Resetting database...");
        await runAsync("DELETE FROM borrows");
        await runAsync("DELETE FROM tickets");
        await runAsync("DELETE FROM assets");
        
        res.json({ success: true, message: "🚀 DATABASE BERHASIL DIRESET! Semua data aset, peminjaman, dan tiket telah dihapus. Database siap untuk input data baru." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CONSUMABLES (Bahan Habis Pakai) ---
app.get('/api/consumables', (req, res) => {
    db.all("SELECT * FROM consumables ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/consumables', (req, res) => {
    const { id, name, category, unit, stock, min_stock, location, last_updated } = req.body;
    db.run(`INSERT INTO consumables (id, name, category, unit, stock, min_stock, location, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, category, unit, stock || 0, min_stock || 5, location, last_updated], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Bahan habis pakai ditambahkan!" });
    });
});

app.put('/api/consumables/:id', (req, res) => {
    const { name, category, unit, stock, min_stock, location, last_updated } = req.body;
    db.run(`UPDATE consumables SET name=?, category=?, unit=?, stock=?, min_stock=?, location=?, last_updated=? WHERE id=?`,
        [name, category, unit, stock, min_stock, location, last_updated, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Data bahan diperbarui!" });
    });
});

app.delete('/api/consumables/:id', (req, res) => {
    db.run(`DELETE FROM consumables WHERE id=?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Bahan dihapus!" });
    });
});

// Ambil Stok (kurangi)
app.post('/api/consumables/:id/use', async (req, res) => {
    const runAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.run(query, params, function(err) { if (err) reject(err); else resolve(this); });
    });
    const getAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => { if (err) reject(err); else resolve(row); });
    });

    const { quantity, user_name, note } = req.body;
    try {
        const item = await getAsync("SELECT * FROM consumables WHERE id=?", [req.params.id]);
        if (!item) return res.status(404).json({ error: "Bahan tidak ditemukan!" });
        if (item.stock < quantity) return res.status(400).json({ error: `Stok tidak cukup! Sisa: ${item.stock}` });

        const newStock = item.stock - quantity;
        const now = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
        await runAsync("UPDATE consumables SET stock=?, last_updated=? WHERE id=?", [newStock, now, req.params.id]);
        await runAsync("INSERT INTO consumable_logs (consumable_id, action, quantity, user_name, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [req.params.id, 'USE', quantity, user_name, note, now]);

        res.json({ message: `Berhasil mengambil ${quantity} ${item.unit}. Sisa stok: ${newStock}`, stock: newStock });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restok (tambah)
app.post('/api/consumables/:id/restock', async (req, res) => {
    const runAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.run(query, params, function(err) { if (err) reject(err); else resolve(this); });
    });
    const getAsync = (query, params = []) => new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => { if (err) reject(err); else resolve(row); });
    });

    const { quantity, user_name, note } = req.body;
    try {
        const item = await getAsync("SELECT * FROM consumables WHERE id=?", [req.params.id]);
        if (!item) return res.status(404).json({ error: "Bahan tidak ditemukan!" });

        const newStock = item.stock + quantity;
        const now = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
        await runAsync("UPDATE consumables SET stock=?, last_updated=? WHERE id=?", [newStock, now, req.params.id]);
        await runAsync("INSERT INTO consumable_logs (consumable_id, action, quantity, user_name, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [req.params.id, 'RESTOCK', quantity, user_name || 'Admin', note, now]);

        res.json({ message: `Restok berhasil! Stok baru: ${newStock}`, stock: newStock });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Riwayat Pemakaian
app.get('/api/consumable-logs', (req, res) => {
    db.all(`SELECT cl.*, c.name as item_name, c.unit FROM consumable_logs cl LEFT JOIN consumables c ON cl.consumable_id = c.id ORDER BY cl.id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/consumable-logs/:consumable_id', (req, res) => {
    db.all(`SELECT * FROM consumable_logs WHERE consumable_id=? ORDER BY id DESC`, [req.params.consumable_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server Inventarisasi berjalan di: http://localhost:${PORT}`);
});

// Wajib untuk Vercel Serverless Functions
module.exports = app;
