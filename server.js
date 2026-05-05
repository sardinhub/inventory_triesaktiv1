const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

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

    const { name, brand, category, condition, status, location, owner, last_updated } = req.body;
    try {
        await runAsync(`UPDATE assets SET name=?, brand=?, category=?, condition=?, status=?, location=?, owner=?, last_updated=? WHERE id=?`, 
            [name, brand, category, condition, status, location, owner, last_updated, req.params.id]);
        
        // Jika status aset dikembalikan ke 'Tersedia', otomatis TUTUP peminjaman yang aktif
        if (status === 'Tersedia') {
            await runAsync(`UPDATE borrows SET status='Closed' WHERE asset_id=? AND status='Approved'`, [req.params.id]);
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

// --- BORROWS ---
app.get('/api/borrows', (req, res) => {
    db.all(`SELECT b.*, a.name as asset_name FROM borrows b LEFT JOIN assets a ON b.asset_id = a.id ORDER BY b.id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/borrows', (req, res) => {
    const { id, asset_id, borrower_name, reason, request_date, status } = req.body;
    db.run(`INSERT INTO borrows VALUES (?, ?, ?, ?, ?, ?)`, [id, asset_id, borrower_name, reason, request_date, status], function(err) {
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

// --- DATABASE INITIALIZER (Untuk Vercel Serverless) ---
app.get('/api/init', async (req, res) => {
    const runAsync = (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    };

    try {
        await runAsync(`CREATE TABLE IF NOT EXISTS assets (id VARCHAR(50) PRIMARY KEY, name VARCHAR(255) NOT NULL, category VARCHAR(100), condition VARCHAR(50), status VARCHAR(50), location VARCHAR(100), owner VARCHAR(100))`);
        
        // Memaksa Vercel menunggu update kolom selesai sebelum menutup koneksi
        await runAsync(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS brand VARCHAR(255)`);
        await runAsync(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_updated VARCHAR(100)`);
        
        await runAsync(`CREATE TABLE IF NOT EXISTS borrows (id VARCHAR(50) PRIMARY KEY, asset_id VARCHAR(50) NOT NULL, borrower VARCHAR(100), purpose TEXT, date_req VARCHAR(50), status VARCHAR(50))`);
        await runAsync(`CREATE TABLE IF NOT EXISTS tickets (id VARCHAR(50) PRIMARY KEY, asset_id VARCHAR(50) NOT NULL, issue_desc TEXT, priority VARCHAR(50), status VARCHAR(50))`);
        await runAsync(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(100) NOT NULL, role VARCHAR(50) NOT NULL, name VARCHAR(100) NOT NULL)`);
        await runAsync(`CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL)`);

        res.json({ success: true, message: "🎉 UPDATE BERHASIL! Database telah siap dengan struktur terbaru. Silakan kembali ke web." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
        db.run("INSERT INTO assets (id, name, brand, category, condition, status, location, owner, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
            ["INV-ELK-001", "Laptop Lenovo", "Lenovo", "Elektronik", "Bagus", "Tersedia", "Gudang", "-", new Date().toISOString().split('T')[0]]);
        
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

app.listen(PORT, () => {
    console.log(`🚀 Server Inventarisasi berjalan di: http://localhost:${PORT}`);
});

// Wajib untuk Vercel Serverless Functions
module.exports = app;
