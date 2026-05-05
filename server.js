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

app.put('/api/assets/:id', (req, res) => {
    const { name, brand, category, condition, status, location, owner, last_updated } = req.body;
    db.run(`UPDATE assets SET name=?, brand=?, category=?, condition=?, status=?, location=?, owner=?, last_updated=? WHERE id=?`, 
        [name, brand, category, condition, status, location, owner, last_updated, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Aset diupdate!" });
    });
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

app.put('/api/borrows/:id/approve', (req, res) => {
    db.run(`UPDATE borrows SET status='Approved' WHERE id=?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        // Update asset status
        db.get("SELECT asset_id, borrower_name FROM borrows WHERE id=?", [req.params.id], (err, row) => {
            if(row) db.run(`UPDATE assets SET status='Dipinjam', owner=? WHERE id=?`, [row.borrower_name, row.asset_id]);
        });
        res.json({ message: "Disetujui!" });
    });
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

app.put('/api/tickets/:id/resolve', (req, res) => {
    db.run(`UPDATE tickets SET status='Resolved' WHERE id=?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT asset_id FROM tickets WHERE id=?", [req.params.id], (err, row) => {
            if(row) db.run(`UPDATE assets SET status='Tersedia', condition='Bagus', owner='-' WHERE id=?`, [row.asset_id]);
        });
        res.json({ message: "Tiket diselesaikan!" });
    });
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
app.get('/api/init', (req, res) => {
    try {
        db.run(`CREATE TABLE IF NOT EXISTS assets (id VARCHAR(50) PRIMARY KEY, name VARCHAR(255) NOT NULL, category VARCHAR(100), condition VARCHAR(50), status VARCHAR(50), location VARCHAR(100), owner VARCHAR(100))`);
        // Migrasi kolom baru (Aman jika kolom sudah ada)
        db.run(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS brand VARCHAR(255)`);
        db.run(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_updated VARCHAR(100)`);
        
        db.run(`CREATE TABLE IF NOT EXISTS borrows (id VARCHAR(50) PRIMARY KEY, asset_id VARCHAR(50) NOT NULL, borrower VARCHAR(100), purpose TEXT, date_req VARCHAR(50), status VARCHAR(50))`);
        db.run(`CREATE TABLE IF NOT EXISTS tickets (id VARCHAR(50) PRIMARY KEY, asset_id VARCHAR(50) NOT NULL, issue_desc TEXT, priority VARCHAR(50), status VARCHAR(50))`);
        db.run(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(100) NOT NULL, role VARCHAR(50) NOT NULL, name VARCHAR(100) NOT NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL)`);

        setTimeout(() => {
            db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
                if (row && parseInt(row.count) === 0) {
                    db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", ["admin", "admin123", "Admin", "Admin Ops"]);
                    db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", ["staf", "staf123", "Staff", "Staf Gudang"]);
                }
            });
            db.get("SELECT COUNT(*) AS count FROM categories", (err, row) => {
                if (row && parseInt(row.count) === 0) {
                    db.run("INSERT INTO categories (name) VALUES (?)", ["Elektronik"]);
                    db.run("INSERT INTO categories (name) VALUES (?)", ["Furniture"]);
                    db.run("INSERT INTO categories (name) VALUES (?)", ["Kendaraan"]);
                    db.run("INSERT INTO categories (name) VALUES (?)", ["Alat Tulis Kantor"]);
                }
            });
            db.get("SELECT COUNT(*) AS count FROM assets", (err, row) => {
                if (row && parseInt(row.count) === 0) {
                    db.run("INSERT INTO assets (id, name, brand, category, condition, status, location, owner, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
                    ["INV-ELK-001", "Laptop Lenovo ThinkPad T14", "Lenovo", "Elektronik", "Bagus", "Dipinjam", "Divisi Marketing", "Budi Santoso", new Date().toISOString().split('T')[0]]);
                }
            });
        }, 1500);

        res.json({ success: true, message: "Database sedang diinisialisasi! Silakan tunggu 3 detik, lalu kembali ke halaman login." });
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

app.listen(PORT, () => {
    console.log(`🚀 Server Inventarisasi berjalan di: http://localhost:${PORT}`);
});

// Wajib untuk Vercel Serverless Functions
module.exports = app;
