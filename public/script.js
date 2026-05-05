let currentUser = null;
let assets = [];
let borrows = [];
let tickets = [];
let categories = [];
let users = [];
let statusChartObj = null;
let categoryChartObj = null;
let html5QrcodeScanner = null;

// --- API FETCHERS ---
async function fetchData() {
    try {
        const [resAssets, resBorrows, resTickets, resCats] = await Promise.all([
            fetch('/api/assets'), fetch('/api/borrows'), fetch('/api/tickets'), fetch('/api/categories')
        ]);
        assets = await resAssets.json();
        borrows = await resBorrows.json();
        tickets = await resTickets.json();
        categories = await resCats.json();
        
        renderCategories();
        renderAssets();
        renderBorrows();
        renderTickets();
        updateDashboardCards();
        renderCharts();
    } catch(err) { 
        console.error("Error fetching data:", err); 
        if(err.message.includes('401')) logout();
    }
}

function updateDashboardCards() {
    document.getElementById('count-total').innerText = assets.length;
    document.getElementById('count-tersedia').innerText = assets.filter(a => a.status === 'Tersedia').length;
    document.getElementById('count-dipinjam').innerText = assets.filter(a => a.status === 'Dipinjam').length;
    document.getElementById('count-rusak').innerText = assets.filter(a => a.condition === 'Rusak').length;
}

// --- RENDERERS ---
function getConditionBadge(cond) { return cond==="Bagus"?`<span class="pill pill-success">Bagus</span>`:`<span class="pill pill-danger">Rusak</span>`; }
function getStatusBadge(stat) {
    if(["Tersedia","Approved","Resolved"].includes(stat)) return `<span class="pill pill-success">${stat}</span>`;
    if(["Dipinjam","Menunggu Approval","Open","Sedang"].includes(stat)) return `<span class="pill pill-warning">${stat}</span>`;
    if(["Servis","Tinggi (Mendesak)"].includes(stat)) return `<span class="pill pill-danger">${stat}</span>`;
    if(["Sedang Digunakan"].includes(stat)) return `<span class="pill pill-success">${stat}</span>`;
    return `<span class="pill pill-info">${stat}</span>`;
}

function renderCategories() {
    const opts = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const addCat = document.getElementById('assetCategory');
    const editCat = document.getElementById('editAssetCategory');
    if(addCat) addCat.innerHTML = `<option value="" disabled selected>Pilih Kategori</option>` + opts;
    if(editCat) editCat.innerHTML = opts;
}

function renderAssets() {
    const dBody = document.querySelector(".dashboard-tbody");
    const aBody = document.querySelector(".daftar-aset-tbody");
    const rows = assets.map(a => `
        <tr>
            <td style="font-family: monospace; font-weight: 600; color: var(--primary);">${a.id}</td>
            <td class="asset-name">${a.name}</td>
            <td>${a.brand || '-'}</td>
            <td>${a.category}</td>
            <td>${getConditionBadge(a.condition)}</td>
            <td>${getStatusBadge(a.status)}</td>
            <td><i class="fa-solid fa-location-dot" style="color: var(--text-muted); margin-right: 6px;"></i> ${a.location}</td>
            <td style="font-weight: 500;">${a.owner}</td>
            <td>${a.last_updated || '-'}</td>
            <td>
                <button class="action-btn" title="View" onclick="viewAsset('${a.id}')"><i class="fa-solid fa-eye"></i></button>
                ${currentUser && currentUser.role === 'Admin' ? `
                <button class="action-btn admin-only" title="Edit" onclick="openEditAsset('${a.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn admin-only" title="Hapus" onclick="deleteAsset('${a.id}')" style="color:var(--danger);"><i class="fa-solid fa-trash"></i></button>
                ` : ''}
            </td>
        </tr>
    `).join('');
    if(dBody) dBody.innerHTML = rows;
    if(aBody) aBody.innerHTML = rows;
    
    // --- SMART DROPDOWN (DATALIST) ---
    const datalistOptions = assets.map(a => `<option value="${a.id} - ${a.name}">`).join('');
    const borrowList = document.getElementById('borrowAssetList');
    if(borrowList) borrowList.innerHTML = datalistOptions;
    const maintList = document.getElementById('maintAssetList');
    if(maintList) maintList.innerHTML = datalistOptions;
}

function renderBorrows() {
    const tbody = document.getElementById("peminjaman-tbody");
    if(!tbody) return;
    tbody.innerHTML = borrows.map(b => `
        <tr>
            <td style="font-family: monospace; font-weight:bold;">${b.id}</td>
            <td style="font-weight:500;">${b.borrower_name}</td>
            <td>${b.asset_id} <br><small style="color:var(--text-muted)">${b.asset_name || ''}</small></td>
            <td>${b.request_date}</td>
            <td>${getStatusBadge(b.status)}</td>
            <td>
                ${b.status === 'Menunggu Approval' ? `<button class="secondary-btn" onclick="approveBorrow('${b.id}')" style="padding: 4px 12px; font-size:12px;"><i class="fa-solid fa-check"></i> Approve</button>` : `<span style="font-size:12px; color:var(--text-muted);">Selesai</span>`}
            </td>
        </tr>
    `).join('');
}

function renderTickets() {
    const tbody = document.getElementById("maintenance-tbody");
    if(!tbody) return;
    tbody.innerHTML = tickets.map(t => `
        <tr>
            <td style="font-family: monospace; font-weight:bold;">${t.id}</td>
            <td style="font-weight:500;">${t.asset_id} <br><small style="color:var(--text-muted)">${t.asset_name || ''}</small></td>
            <td>${t.issue_desc}</td>
            <td>${getStatusBadge(t.priority)}</td>
            <td>${getStatusBadge(t.status)}</td>
            <td>
                ${t.status === 'Open' ? `<button class="secondary-btn" onclick="resolveTicket('${t.id}')" style="padding: 4px 12px; font-size:12px;"><i class="fa-solid fa-check"></i> Selesai</button>` : `<span style="font-size:12px; color:var(--text-muted);">Tuntas</span>`}
            </td>
        </tr>
    `).join('');
}

// --- GLOBAL ACTIONS (Dipanggil dari HTML onclick) ---
window.viewAsset = function(id) {
    const a = assets.find(x => x.id === id);
    if(!a) return;
    document.getElementById('viewAssetTitle').innerText = "Detail: " + a.name;
    document.getElementById('viewAssetContent').innerHTML = `
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>ID Aset:</strong> <span style="float:right; color:var(--primary); font-family:monospace; font-weight:bold;">${a.id}</span></div>
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>Merk & Type:</strong> <span style="float:right;">${a.brand || '-'}</span></div>
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>Kategori:</strong> <span style="float:right;">${a.category}</span></div>
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>Kondisi:</strong> <span style="float:right;">${getConditionBadge(a.condition)}</span></div>
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>Status:</strong> <span style="float:right;">${getStatusBadge(a.status)}</span></div>
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>Lokasi:</strong> <span style="float:right;">${a.location}</span></div>
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>PIC:</strong> <span style="float:right; font-weight:500;">${a.owner}</span></div>
        <div style="margin-bottom: 8px;"><strong>Riwayat Terakhir:</strong> <span style="float:right;">${a.last_updated || '-'}</span></div>
        <div style="margin-top:20px; text-align:center;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${a.id}" alt="QR Code" style="border-radius:12px; padding:8px; border:1px solid var(--border); background:white;">
            <p style="font-size:12px; margin-top:8px; color:var(--text-muted);">Scan QR Code ini untuk akses cepat via mobile</p>
            <button class="primary-btn" onclick="printLabel('${a.id}')" style="margin-top: 16px; width: 100%; justify-content: center;"><i class="fa-solid fa-print"></i> Cetak Label Fisik</button>
        </div>
    `;
    document.getElementById('viewAssetModal').classList.add('active');
};

window.printLabel = function(id) {
    const a = assets.find(x => x.id === id);
    if(!a) return;
    
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
        <html>
            <head>
                <title>Cetak Label - ${a.id}</title>
                <style>
                    body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; text-align: center; background: #f0f0f0; }
                    .label-container {
                        background: white;
                        border: 2px dashed #000;
                        border-radius: 12px;
                        padding: 20px;
                        width: 250px;
                        margin: 0 auto;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    }
                    .header { font-size: 14px; font-weight: bold; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
                    .qr-image { width: 150px; height: 150px; margin-bottom: 12px; }
                    .asset-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; line-height: 1.2; }
                    .asset-id { font-family: monospace; font-size: 15px; font-weight: bold; margin-bottom: 8px; }
                    .asset-meta { font-size: 11px; color: #555; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 8px; }
                    
                    @media print {
                        body { padding: 0; background: white; }
                        .label-container { border: 1px solid #000; box-shadow: none; page-break-inside: avoid; border-radius: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="label-container">
                    <div class="header">INVENTARIS.IO</div>
                    <img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${a.id}" alt="QR">
                    <div class="asset-name">${a.name}</div>
                    <div class="asset-id">${a.id}</div>
                    <div class="asset-meta">
                        ${a.brand || '-'}<br>
                        ${a.category} • ${a.location}<br>
                        Update: ${a.last_updated || '-'}
                    </div>
                </div>
                <script>
                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 800);
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
};

window.openEditAsset = function(id) {
    const a = assets.find(x => x.id === id);
    if(!a) return;
    document.getElementById('editAssetId').value = a.id;
    document.getElementById('editAssetName').value = a.name;
    document.getElementById('editAssetBrand').value = a.brand || '';
    document.getElementById('editAssetCategory').value = a.category;
    document.getElementById('editAssetCondition').value = a.condition;
    document.getElementById('editAssetStatus').value = a.status;
    document.getElementById('editAssetLocation').value = a.location;
    document.getElementById('editAssetOwner').value = a.owner;
    document.getElementById('editAssetLastUpdated').value = a.last_updated || new Date().toISOString().split('T')[0];
    document.getElementById('editAssetModal').classList.add('active');
};

window.deleteAsset = async function(id) {
    const res = await Swal.fire({
        title: 'Hapus Aset?',
        text: `Anda yakin ingin menghapus ${id} secara permanen?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'Ya, Hapus!'
    });
    if(res.isConfirmed) {
        await fetch(`/api/assets/${id}`, { method: 'DELETE' });
        Swal.fire('Terhapus!', 'Data aset berhasil dihapus.', 'success');
        fetchData(); // Refresh UI
    }
};

window.approveBorrow = async function(id) {
    await fetch(`/api/borrows/${id}/approve`, { method: 'PUT' });
    fetchData(); // Refresh everything since asset status also changes
};

window.resolveTicket = async function(id) {
    await fetch(`/api/tickets/${id}/resolve`, { method: 'PUT' });
    fetchData(); 
};

// --- MASTER DATA & USERS MANAGEMENT ---
window.openCategoriesModal = async function() {
    document.getElementById('categoriesModal').classList.add('active');
    renderCategoriesTable();
};

window.renderCategoriesTable = function() {
    const tbody = document.getElementById('categories-tbody');
    if(!tbody) return;
    tbody.innerHTML = categories.map(c => `
        <tr>
            <td>${c.name}</td>
            <td><button class="action-btn" onclick="deleteCategory(${c.id})" style="color:var(--danger);"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
    `).join('');
};

window.deleteCategory = async function(id) {
    const res = await Swal.fire({
        title: 'Hapus Kategori?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        confirmButtonText: 'Hapus'
    });
    if(res.isConfirmed) {
        await fetch(`/api/categories/${id}`, { method: 'DELETE' });
        Swal.fire('Terhapus!', 'Kategori telah dihapus.', 'success');
        const resCats = await fetch('/api/categories');
        categories = await resCats.json();
        renderCategories();
        renderCategoriesTable();
    }
};

window.openUsersModal = async function() {
    document.getElementById('usersModal').classList.add('active');
    const res = await fetch('/api/users');
    users = await res.json();
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.name}</td><td>${u.username}</td><td>${getStatusBadge(u.role)}</td>
            <td>${u.username !== 'admin' ? `<button class="action-btn" onclick="deleteUser(${u.id})" style="color:var(--danger);"><i class="fa-solid fa-trash"></i></button>` : ''}</td>
        </tr>
    `).join('');
};

window.deleteUser = async function(id) {
    const res = await Swal.fire({
        title: 'Cabut Akses?',
        text: "User ini tidak akan bisa login lagi.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        confirmButtonText: 'Hapus Akses'
    });
    if(res.isConfirmed) {
        await fetch(`/api/users/${id}`, { method: 'DELETE' });
        Swal.fire('Berhasil!', 'Akses user telah dicabut.', 'success');
        openUsersModal(); // reload table
    }
};

// --- QR SCANNER LOGIC ---
window.isScanningLocked = false;

window.simulateQrScan = function() {
    const input = document.getElementById('manualQrInput').value.trim();
    if(!input) return Swal.fire('Peringatan', 'Masukkan ID Aset terlebih dahulu!', 'warning');
    onScanSuccess(input);
    document.getElementById('manualQrInput').value = '';
};

function onScanSuccess(decodedText) {
    if(window.isScanningLocked) return;
    window.isScanningLocked = true;
    
    // Membunyikan suara "Beep" kasir yang profesional
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = 880;
        osc.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}

    const inputVal = decodedText.trim();
    const a = assets.find(x => x.id.toLowerCase() === inputVal.toLowerCase());
    
    if(a) {
        Swal.fire({
            toast: true, position: 'top-end', showConfirmButton: false, timer: 1500,
            icon: 'success', title: `Aset ${a.id} Ditemukan!`
        });
        viewAsset(a.id);
        
        // Kunci scanner hingga modal ditutup agar tidak mendeteksi ganda
        const checkClose = setInterval(() => {
            if(!document.getElementById('viewAssetModal').classList.contains('active')) {
                clearInterval(checkClose);
                setTimeout(() => { window.isScanningLocked = false; }, 1000); // jeda 1 detik ekstra
            }
        }, 500);
    } else {
        Swal.fire({
            title: 'Tidak Dikenali',
            text: `QR Code [${inputVal}] bukan merupakan aset dari gudang kita.`,
            icon: 'error',
            confirmButtonColor: '#EF4444',
            confirmButtonText: 'Tutup'
        }).then(() => {
            setTimeout(() => { window.isScanningLocked = false; }, 1000);
        });
    }
}

// --- CHART RENDERING (LAPORAN) ---
function renderCharts() {
    const ctxStatus = document.getElementById('statusChart');
    const ctxCat = document.getElementById('categoryChart');
    if(!ctxStatus || !ctxCat) return;
    
    // Status Aggregation
    const countsStatus = { 'Tersedia': 0, 'Dipinjam': 0, 'Servis': 0, 'Sedang Digunakan': 0 };
    assets.forEach(a => { if(countsStatus[a.status] !== undefined) countsStatus[a.status]++; });
    
    if(statusChartObj) statusChartObj.destroy();
    statusChartObj = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Tersedia', 'Dipinjam', 'Servis', 'Digunakan'],
            datasets: [{
                data: [countsStatus['Tersedia'], countsStatus['Dipinjam'], countsStatus['Servis'], countsStatus['Sedang Digunakan']],
                backgroundColor: ['#10B981', '#F59E0B', '#EF4444', '#3B82F6'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
    });

    // Category Aggregation
    const countsCat = {};
    assets.forEach(a => { countsCat[a.category] = (countsCat[a.category]||0) + 1; });
    
    if(categoryChartObj) categoryChartObj.destroy();
    categoryChartObj = new Chart(ctxCat, {
        type: 'bar',
        data: {
            labels: Object.keys(countsCat),
            datasets: [{
                label: 'Jumlah Aset',
                data: Object.values(countsCat),
                backgroundColor: '#4F46E5',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- EXPORT TO CSV ---
window.exportToCSV = function() {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID Aset,Nama Barang,Merk & Type,Kategori,Kondisi,Status,Lokasi,Peminjam,Riwayat Terakhir\n";
    assets.forEach(a => {
        csvContent += `"${a.id}","${a.name}","${a.brand || '-'}","${a.category}","${a.condition}","${a.status}","${a.location}","${a.owner}","${a.last_updated || '-'}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Laporan_Aset_Kantor.csv");
    document.body.appendChild(link);
    link.click();
};

// --- AUTHENTICATION & INITIALIZATION ---
function initApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    
    // Update User Profile UI
    document.getElementById('userNameDisplay').innerText = currentUser.name;
    document.getElementById('userRoleDisplay').innerText = currentUser.role;
    document.getElementById('userAvatar').src = `https://ui-avatars.com/api/?name=${currentUser.name.replace(' ','+')}&background=0D8ABC&color=fff`;

    // Apply Role Restrictions
    if(currentUser.role !== 'Admin') {
        const navPengaturan = document.getElementById('nav-pengaturan');
        if(navPengaturan) navPengaturan.style.display = 'none';
        
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }

    fetchData(); // Load all DB records
}

window.logout = function() {
    localStorage.removeItem('inv_user');
    window.location.reload();
};

document.addEventListener("DOMContentLoaded", () => {
    // 1. Check Login Auth
    const savedUser = localStorage.getItem('inv_user');
    if(savedUser) {
        currentUser = JSON.parse(savedUser);
        initApp();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
    }

    // Login Form Submit
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('loginUsername').value;
        const p = document.getElementById('loginPassword').value;
        const errEl = document.getElementById('loginError');
        
        try {
            const res = await fetch('/api/login', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username: u, password: p})
            });
            const data = await res.json();
            
            if(data.success) {
                currentUser = data.user;
                localStorage.setItem('inv_user', JSON.stringify(currentUser));
                errEl.style.display = 'none';
                initApp();
            } else {
                errEl.innerText = data.error || data.message || "Login Gagal!";
                errEl.style.display = 'block';
            }
        } catch(e) { errEl.innerText = "Koneksi ke server terputus."; errEl.style.display = 'block'; }
    });
    
    // SPA Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.app-view');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            views.forEach(view => view.style.display = 'none');
            
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).style.display = 'block';
            
            // Re-render chart if switching to laporan
            if(targetId === 'view-laporan') renderCharts();
            
            // Auto-start QR Scanner if switching to Scan QR
            if(targetId === 'view-scan-qr' && typeof Html5QrcodeScanner !== 'undefined') {
                if(!html5QrcodeScanner) {
                    html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
                    html5QrcodeScanner.render(onScanSuccess);
                }
            } else if(html5QrcodeScanner && targetId !== 'view-scan-qr') {
                // Good practice to clear scanner when not in view
                try { html5QrcodeScanner.clear(); html5QrcodeScanner = null; } catch(e){}
            }
        });
    });

    // Modals Initialization
    function setupModal(triggerSelectors, modalId, closeSelectors) {
        const triggers = document.querySelectorAll(triggerSelectors);
        const modal = document.getElementById(modalId);
        if(!modal) return;
        const closers = document.querySelectorAll(closeSelectors);
        
        triggers.forEach(t => t.addEventListener('click', () => modal.classList.add('active')));
        closers.forEach(c => c.addEventListener('click', () => {
            modal.classList.remove('active');
            const form = modal.querySelector('form');
            if(form) setTimeout(() => form.reset(), 300);
        }));
    }

    setupModal('.btn-tambah-aset', 'addAssetModal', '#addAssetModal .closeModalBtn');
    setupModal('.btn-buat-peminjaman', 'borrowModal', '#borrowModal .closeBorrowBtn');
    setupModal('.btn-buat-tiket', 'maintenanceModal', '#maintenanceModal .closeMaintBtn');
    setupModal('.closeViewBtn', 'viewAssetModal', '.closeViewBtn');
    setupModal('.closeEditBtn', 'editAssetModal', '.closeEditBtn');
    setupModal('.closeUsersBtn', 'usersModal', '.closeUsersBtn');
    setupModal('.closeCatBtn', 'categoriesModal', '.closeCatBtn');

    document.querySelectorAll('.btn-tambah-aset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('assetLastUpdated').value = new Date().toISOString().split('T')[0];
        });
    });

    // POST: Tambah Aset
    document.getElementById('addAssetForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const conf = await Swal.fire({
            title: 'Simpan Data Aset?',
            text: "Pastikan data yang Anda masukkan sudah benar.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#4F46E5',
            confirmButtonText: 'Ya, Simpan!'
        });
        if(!conf.isConfirmed) return;

        const data = {
            id: `INV-${document.getElementById('assetCategory').value.substring(0,3).toUpperCase()}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`,
            name: document.getElementById('assetName').value,
            brand: document.getElementById('assetBrand').value,
            category: document.getElementById('assetCategory').value,
            condition: document.getElementById('assetCondition').value,
            status: document.getElementById('assetStatus').value,
            location: document.getElementById('assetLocation').value,
            owner: document.getElementById('assetOwner').value || "-",
            last_updated: document.getElementById('assetLastUpdated').value
        };
        
        try {
            const res = await fetch('/api/assets', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
            const result = await res.json();
            
            if(!res.ok) {
                Swal.fire('Peringatan Database', result.error || 'Terjadi kesalahan jaringan.', 'error');
                return;
            }

            document.getElementById('addAssetModal').classList.remove('active');
            Swal.fire('Tersimpan!', 'Aset baru berhasil ditambahkan.', 'success');
            fetchData();
        } catch(err) {
            Swal.fire('Error Sistem', 'Tidak dapat terhubung ke server.', 'error');
        }
    });

    // PUT: Edit Aset
    document.getElementById('editAssetForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const conf = await Swal.fire({
            title: 'Terapkan Perubahan?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#4F46E5',
            confirmButtonText: 'Ya, Perbarui!'
        });
        if(!conf.isConfirmed) return;

        const id = document.getElementById('editAssetId').value;
        const data = {
            name: document.getElementById('editAssetName').value,
            brand: document.getElementById('editAssetBrand').value,
            category: document.getElementById('editAssetCategory').value,
            condition: document.getElementById('editAssetCondition').value,
            status: document.getElementById('editAssetStatus').value,
            location: document.getElementById('editAssetLocation').value,
            owner: document.getElementById('editAssetOwner').value || "-",
            last_updated: document.getElementById('editAssetLastUpdated').value
        };
        
        try {
            const res = await fetch(`/api/assets/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
            const result = await res.json();
            
            if(!res.ok) {
                Swal.fire('Peringatan Database', result.error || 'Terjadi kesalahan sistem.', 'error');
                return;
            }

            document.getElementById('editAssetModal').classList.remove('active');
            Swal.fire('Diperbarui!', 'Perubahan aset berhasil disimpan.', 'success');
            fetchData();
        } catch(err) {
            Swal.fire('Error Sistem', 'Tidak dapat terhubung ke server.', 'error');
        }
    });

    // POST: Buat Request Peminjaman
    document.getElementById('borrowForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const asset_id = document.getElementById('borrowItem').value.split(' - ')[0].trim();
        if(!assets.find(a => a.id === asset_id)) {
            return Swal.fire('Aset Tidak Valid', 'Mohon ketik lalu pilih aset dari daftar dropdown yang muncul.', 'error');
        }
        
        const conf = await Swal.fire({ title: 'Ajukan Peminjaman?', icon: 'question', showCancelButton: true, confirmButtonText: 'Ajukan' });
        if(!conf.isConfirmed) return;

        const data = {
            id: `REQ-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`,
            asset_id: asset_id,
            borrower_name: document.getElementById('borrowerName').value,
            reason: document.getElementById('borrowReason').value,
            request_date: new Date().toLocaleDateString('id-ID'),
            status: "Menunggu Approval"
        };
        await fetch('/api/borrows', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
        document.getElementById('borrowModal').classList.remove('active');
        Swal.fire('Terkirim!', 'Permintaan peminjaman sedang diproses.', 'success');
        fetchData();
    });

    // POST: Buat Tiket Maintenance
    document.getElementById('maintenanceForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const asset_id = document.getElementById('maintItem').value.split(' - ')[0].trim();
        if(!assets.find(a => a.id === asset_id)) {
            return Swal.fire('Aset Tidak Valid', 'Mohon ketik lalu pilih aset dari daftar dropdown yang muncul.', 'error');
        }

        const data = {
            id: `TCK-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`,
            asset_id: asset_id,
            issue_desc: document.getElementById('maintDesc').value,
            priority: document.getElementById('maintPriority').value,
            status: "Open"
        };
        await fetch('/api/tickets', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
        document.getElementById('maintenanceModal').classList.remove('active');
        Swal.fire('Tiket Terbuat!', 'Laporan kerusakan telah masuk antrean.', 'success');
        fetchData();
    });

    // POST: Tambah Kategori
    document.getElementById('addCatForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('newCatName').value;
        await fetch('/api/categories', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
        document.getElementById('newCatName').value = "";
        
        // Refresh local categories
        const resCats = await fetch('/api/categories');
        categories = await resCats.json();
        renderCategories();
        renderCategoriesTable();
    });

    // POST: Tambah User
    document.getElementById('addUserForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('newUserName').value,
            username: document.getElementById('newUserUsername').value,
            password: document.getElementById('newUserPassword').value,
            role: document.getElementById('newUserRole').value
        };
        await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
        document.getElementById('addUserForm').reset();
        openUsersModal(); // Refresh UI
    });
});
