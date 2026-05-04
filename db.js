const { Pool } = require('pg');
require('dotenv').config();

// Cerdas mencari koneksi apapun yang disediakan oleh Vercel (Neon/Supabase/dll)
const connString = process.env.POSTGRES_URL || 
                   process.env.DATABASE_URL || 
                   process.env.NEON_DATABASE_URL || 
                   Object.values(process.env).find(val => typeof val === 'string' && val.startsWith('postgres://'));

const pool = new Pool({
  connectionString: connString,
  ssl: { rejectUnauthorized: false }
});

// Helper pintar untuk menerjemahkan sintaks parameter SQLite (?) ke PostgreSQL ($1, $2)
const replacePlaceholders = (query) => {
    let index = 1;
    return query.replace(/\?/g, () => `$${index++}`);
};

// "Adapter" agar seluruh API server.js tidak perlu diedit sama sekali!
const db = {
  all: (query, params, callback) => {
    if (typeof params === 'function') { callback = params; params = []; }
    if (!connString) return callback(new Error("Variabel Database (POSTGRES_URL) tidak ditemukan di Vercel/Local!"));
    pool.query(replacePlaceholders(query), params, (err, res) => {
      if (err) return callback(err);
      callback(null, res.rows);
    });
  },
  get: (query, params, callback) => {
    if (typeof params === 'function') { callback = params; params = []; }
    if (!connString) return callback(new Error("Variabel Database (POSTGRES_URL) tidak ditemukan di Vercel/Local!"));
    pool.query(replacePlaceholders(query), params, (err, res) => {
      if (err) return callback(err);
      callback(null, res.rows[0]);
    });
  },
  run: function(query, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    if (!connString) {
        const err = new Error("Variabel Database (POSTGRES_URL) tidak ditemukan di Vercel/Local!");
        if(callback) return callback.call(this, err);
        return;
    }
    
    // Penyesuaian sintaks pembuatan tabel SQLite ke Postgres
    query = query.replace(/AUTOINCREMENT/g, "SERIAL");
    query = query.replace(/TEXT UNIQUE/g, "VARCHAR(255) UNIQUE");
    
    let isInsertUser = query.toUpperCase().includes("INSERT INTO USERS");
    let isInsertCat = query.toUpperCase().includes("INSERT INTO CATEGORIES");
    
    let pgQuery = replacePlaceholders(query);
    if (isInsertUser || isInsertCat) {
        pgQuery += " RETURNING id"; // Agar mendapat lastID (perilaku bawaan SQLite)
    }

    pool.query(pgQuery, params, (err, res) => {
      if (err) {
        if(callback) callback.call(this, err);
        return;
      }
      let lastID = null;
      if ((isInsertUser || isInsertCat) && res.rows && res.rows.length > 0) {
          lastID = res.rows[0].id;
      }
      if(callback) callback.call({ lastID: lastID }, null);
    });
  }
};

// --- Inisialisasi Tabel ---
db.run(`CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    condition VARCHAR(50),
    status VARCHAR(50),
    location VARCHAR(100),
    owner VARCHAR(100)
)`);

db.run(`CREATE TABLE IF NOT EXISTS borrows (
    id VARCHAR(50) PRIMARY KEY,
    asset_id VARCHAR(50) NOT NULL,
    borrower VARCHAR(100),
    purpose TEXT,
    date_req VARCHAR(50),
    status VARCHAR(50)
)`);

db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id VARCHAR(50) PRIMARY KEY,
    asset_id VARCHAR(50) NOT NULL,
    issue_desc TEXT,
    priority VARCHAR(50),
    status VARCHAR(50)
)`);

db.run(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
)`);

// --- Seeder ---
setTimeout(() => {
    db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
        if (row && parseInt(row.count) === 0) {
            console.log("Seeding Users...");
            db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", ["admin", "admin123", "Admin", "Admin Ops"]);
            db.run("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", ["staf", "staf123", "Staff", "Staf Gudang"]);
        }
    });

    db.get("SELECT COUNT(*) AS count FROM categories", (err, row) => {
        if (row && parseInt(row.count) === 0) {
            console.log("Seeding Categories...");
            db.run("INSERT INTO categories (name) VALUES (?)", ["Elektronik"]);
            db.run("INSERT INTO categories (name) VALUES (?)", ["Furniture"]);
            db.run("INSERT INTO categories (name) VALUES (?)", ["Kendaraan"]);
            db.run("INSERT INTO categories (name) VALUES (?)", ["Alat Tulis Kantor"]);
        }
    });

    db.get("SELECT COUNT(*) AS count FROM assets", (err, row) => {
        if (row && parseInt(row.count) === 0) {
            console.log("Seeding Assets...");
            db.run("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)", ["INV-ELK-001", "Laptop Lenovo ThinkPad T14", "Elektronik", "Bagus", "Dipinjam", "Divisi Marketing", "Budi Santoso"]);
            db.run("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)", ["INV-ELK-002", "MacBook Pro M2 2023", "Elektronik", "Bagus", "Tersedia", "Gudang IT", "-"]);
            db.run("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)", ["INV-ALA-001", "Printer Epson L3110", "Alat Tulis Kantor", "Rusak", "Servis", "Ruang Staff", "Fasilitas Umum"]);
            
            db.run("INSERT INTO borrows VALUES (?, ?, ?, ?, ?, ?)", ["REQ-001", "INV-ELK-001", "Budi Santoso", "Untuk presentasi di luar kota", new Date().toLocaleDateString('id-ID'), "Approved"]);
            db.run("INSERT INTO borrows VALUES (?, ?, ?, ?, ?, ?)", ["REQ-002", "INV-ELK-002", "Sarah Marketing", "Laptop utama rusak", new Date().toLocaleDateString('id-ID'), "Menunggu Approval"]);
            
            db.run("INSERT INTO tickets VALUES (?, ?, ?, ?, ?)", ["TCK-001", "INV-ALA-001", "Tinta macet dan hasil print bergaris", "Sedang", "Open"]);
        }
    });
}, 1000);

module.exports = db;
