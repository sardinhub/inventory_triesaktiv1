const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db'); // Import koneksi database kita

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Agar bisa menerima data JSON dari frontend

// Sajikan file statis (Frontend HTML, CSS, JS) dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// API ENDPOINTS (Jalur Komunikasi Frontend-Backend)
// ==========================================

// 1. GET: Mengambil semua data aset dari database
app.get('/api/assets', (req, res) => {
    db.all("SELECT * FROM assets ORDER BY id DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 2. POST: Menambahkan aset baru ke database
app.post('/api/assets', (req, res) => {
    const { id, name, category, condition, status, location, owner } = req.body;
    
    const sql = `INSERT INTO assets (id, name, category, condition, status, location, owner) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [id, name, category, condition, status, location, owner], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Aset berhasil disimpan ke database!", id: this.lastID });
    });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Server Inventarisasi berjalan di: http://localhost:${PORT}`);
    console.log(`Silakan buka link tersebut di browser Anda.`);
});
