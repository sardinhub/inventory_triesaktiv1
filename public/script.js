let currentUser = null;
let assets = [];
let borrows = [];
let tickets = [];
let categories = [];
let users = [];
let consumables = [];
let statusChartObj = null;
let categoryChartObj = null;
let html5QrcodeScanner = null;
let currentPage = 1;
let rowsPerPage = 20;
let currentConsumablePage = 1;
let consumableRowsPerPage = 20;
let filteredAssetsGlobal = null; 
let filteredConsumablesGlobal = null;

window.populateFilterDropdowns = function() {
    const fCat = document.getElementById('filterCategory');
    const fLoc = document.getElementById('filterLocation');
    
    if(!assets || assets.length === 0) return;

    const cats = [...new Set(assets.map(a => a.category))].filter(Boolean).sort();
    const locs = [...new Set(assets.map(a => a.location))].filter(Boolean).sort();

    if(fCat) {
        const currentVal = fCat.value;
        fCat.innerHTML = '<option value="">Semua Kategori</option>' + 
            cats.map(c => `<option value="${c}">${c}</option>`).join('');
        fCat.value = currentVal;
    }
    if(fLoc) {
        const currentVal = fLoc.value;
        fLoc.innerHTML = '<option value="">Semua Lokasi</option>' + 
            locs.map(l => `<option value="${l}">${l}</option>`).join('');
        fLoc.value = currentVal;
    }
};

window.updateNotificationBadge = function() {
    const badge = document.getElementById('notif-badge');
    if(!badge) return;

    const pendingBorrows = borrows.filter(b => b.status === 'Menunggu Approval' || b.status === 'Requested').length;
    const openTickets = tickets.filter(t => t.status === 'Open').length;
    const lowStockItems = consumables.filter(c => c.stock <= c.min_stock).length;

    const total = pendingBorrows + openTickets + lowStockItems;

    if(total > 0) {
        badge.innerText = total;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
};

window.showNotifications = function() {
    const pendingBorrows = borrows.filter(b => b.status === 'Menunggu Approval' || b.status === 'Requested');
    const openTickets = tickets.filter(t => t.status === 'Open');

    if(pendingBorrows.length === 0 && openTickets.length === 0) {
        return Swal.fire({
            title: 'Tidak Ada Notifikasi',
            text: 'Semua tugas Anda sudah beres! Kerja bagus.',
            icon: 'success',
            confirmButtonColor: '#4F46E5'
        });
    }

    let html = '<div style="text-align: left; font-size: 14px;">';
    if(pendingBorrows.length > 0) {
        html += `<p style="margin-bottom: 8px;"><b>📦 Peminjaman:</b> Ada ${pendingBorrows.length} permintaan menunggu approval.</p>`;
    }
    if(openTickets.length > 0) {
        html += `<p style="margin-bottom: 8px;"><b>🛠️ Maintenance:</b> Ada ${openTickets.length} tiket perbaikan yang terbuka.</p>`;
    }
    html += '</div>';

    Swal.fire({
        title: 'Tugas Perlu Perhatian',
        html: html,
        icon: 'info',
        confirmButtonText: 'Buka Menu Terkait',
        showCancelButton: true,
        cancelButtonText: 'Tutup',
        confirmButtonColor: '#4F46E5'
    }).then((result) => {
        if (result.isConfirmed) {
            if (pendingBorrows.length > 0) {
                document.querySelector('[data-target="view-peminjaman"]').click();
            } else if (openTickets.length > 0) {
                document.querySelector('[data-target="view-maintenance"]').click();
            }
        }
    });
};

// --- API FETCHERS ---
async function fetchData() {
    try {
        const [resAssets, resBorrows, resTickets, resCats, resConsumables] = await Promise.all([
            fetch('/api/assets'), fetch('/api/borrows'), fetch('/api/tickets'), fetch('/api/categories'), fetch('/api/consumables')
        ]);
        assets = await resAssets.json();
        borrows = await resBorrows.json();
        tickets = await resTickets.json();
        categories = await resCats.json();
        consumables = await resConsumables.json();
        
        renderCategories();
        renderAssets();
        renderBorrows();
        renderTickets();
        renderConsumables();
        updateDashboardCards();
        renderCharts();
        populateFilterDropdowns();
        updateNotificationBadge();
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
    // Consumables dashboard
    const lowStock = consumables.filter(c => c.stock <= c.min_stock).length;
    const elLow = document.getElementById('count-low-stock');
    if(elLow) elLow.innerText = lowStock;
    const elTotal = document.getElementById('count-consumable-total');
    if(elTotal) elTotal.innerText = consumables.length;
    const elSafe = document.getElementById('count-consumable-safe');
    if(elSafe) elSafe.innerText = consumables.filter(c => c.stock > c.min_stock).length;
    const elLowC = document.getElementById('count-consumable-low');
    if(elLowC) elLowC.innerText = lowStock;
}

// --- RENDERERS ---
function getConditionBadge(cond) { return cond==="Bagus"?`<span class="pill pill-success">Bagus</span>`:`<span class="pill pill-danger">Rusak</span>`; }
function getStatusBadge(stat) {
    if(["Tersedia","Approved","Resolved","Closed","Close"].includes(stat)) return `<span class="pill pill-success">${stat}</span>`;
    if(["Dipinjam","Menunggu Approval","Open","Sedang","Disetujui"].includes(stat)) return `<span class="pill pill-warning">${stat}</span>`;
    if(["Servis","Rusak","Tinggi (Mendesak)"].includes(stat)) return `<span class="pill pill-danger">${stat}</span>`;
    return `<span class="pill pill-info">${stat}</span>`;
}

function renderCategories() {
    const opts = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const addCat = document.getElementById('assetCategory');
    const editCat = document.getElementById('editAssetCategory');
    if(addCat) addCat.innerHTML = `<option value="" disabled selected>Pilih Kategori</option>` + opts;
    if(editCat) editCat.innerHTML = opts;
    // Consumable category dropdowns
    const conCat = document.getElementById('consumableCategory');
    const conCatEdit = document.getElementById('editConsumableCategory');
    if(conCat) conCat.innerHTML = `<option value="" disabled selected>Pilih Kategori</option>` + opts;
    if(conCatEdit) conCatEdit.innerHTML = opts;
}

function renderAssets(dataToRender = null) {
    const aBody = document.querySelector(".daftar-aset-tbody");
    if(!aBody) return;

    // Gunakan data filter jika ada, jika tidak gunakan data aset utama
    const data = dataToRender || assets;
    filteredAssetsGlobal = data; // Simpan untuk navigasi halaman

    // Hitung index untuk slicing
    let displayData = data;
    if (rowsPerPage !== 'all') {
        const start = (currentPage - 1) * rowsPerPage;
        const end = start + parseInt(rowsPerPage);
        displayData = data.slice(start, end);
    }

    const rows = displayData.map(a => `
        <tr>
            <td style="font-family: monospace; font-weight: 600; color: var(--primary);">${a.id}</td>
            <td class="asset-name">${a.name}</td>
            <td>${a.brand || '-'}</td>
            <td style="text-align:center; font-weight:600;">${a.quantity || 1}</td>
            <td>${a.category}</td>
            <td>${getConditionBadge(a.condition)}</td>
            <td>${getStatusBadge(a.status)}</td>
            <td><i class="fa-solid fa-location-dot" style="color: var(--text-muted); margin-right: 6px;"></i> ${a.location}</td>
            <td style="font-weight: 500;">${a.owner}</td>
            <td>${a.last_updated || '-'}</td>
            <td>
                <div style="display:flex; gap:4px;">
                    <button class="action-btn" title="View" onclick="viewAsset('${a.id}')"><i class="fa-solid fa-eye"></i></button>
                    ${a.status === 'Dipinjam' ? `<button class="action-btn" title="Kembalikan" onclick="returnAsset('${a.id}')" style="color:var(--success);"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
                    ${a.condition === 'Rusak' && a.status !== 'Servis' ? `<button class="action-btn" title="Servis" onclick="openMaintenance('${a.id}')" style="color:var(--warning);"><i class="fa-solid fa-screwdriver-wrench"></i></button>` : ''}
                    ${currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Staff') ? `
                    <button class="action-btn" title="Edit" onclick="openEditAsset('${a.id}')"><i class="fa-solid fa-pen"></i></button>
                    ` : ''}
                    ${currentUser && currentUser.role === 'Admin' ? `
                    <button class="action-btn admin-only" title="Hapus" onclick="deleteAsset('${a.id}')" style="color:var(--danger);"><i class="fa-solid fa-trash"></i></button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
    
    aBody.innerHTML = rows || '<tr><td colspan="11" style="text-align:center; padding:40px; color:var(--text-muted);">Tidak ada data yang sesuai filter.</td></tr>';
    
    // Update Pagination UI
    renderPagination(data.length);

    // Dropdown Peminjaman & Maintenance (Tetap gunakan data asli untuk dropdown)
    updateDropdowns();
}

function updateDropdowns() {
    const borrowSelect = document.getElementById('borrowItem');
    if(borrowSelect) {
        borrowSelect.innerHTML = '<option value="">-- Pilih Aset Tersedia --</option>' + 
            assets.filter(a => a.status === 'Tersedia')
                  .map(a => `<option value="${a.id}">${a.id} | ${a.name}</option>`).join('');
    }
    
    const maintSelect = document.getElementById('maintItem');
    if(maintSelect) {
        maintSelect.innerHTML = '<option value="">-- Pilih Aset Bermasalah --</option>' + 
            assets.filter(a => a.condition === 'Rusak' || a.status === 'Servis')
                  .map(a => `<option value="${a.id}">${a.id} | ${a.name}</option>`).join('');
    }
    if(window.populateFilterDropdowns) window.populateFilterDropdowns();
}

// LOGIKA PAGINATION
window.renderPagination = function(totalItems) {
    const info = document.getElementById('paginationInfo');
    const nav = document.getElementById('paginationNav');
    if (!info || !nav) return;

    if (rowsPerPage === 'all' || totalItems <= rowsPerPage) {
        info.innerText = `Menampilkan ${totalItems} data`;
        nav.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(totalItems / rowsPerPage);
    const startIdx = (currentPage - 1) * rowsPerPage + 1;
    const endIdx = Math.min(currentPage * rowsPerPage, totalItems);

    info.innerText = `Menampilkan ${startIdx} - ${endIdx} dari ${totalItems} data`;

    let html = `
        <button class="page-btn" onclick="changePage(1)" ${currentPage === 1 ? 'disabled' : ''} title="Halaman Pertama">
            <i class="fa-solid fa-angles-left"></i>
        </button>
        <button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-angle-left"></i>
        </button>
    `;

    // Tampilkan maksimal 5 tombol halaman di sekitar halaman aktif
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }

    html += `
        <button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fa-solid fa-angle-right"></i>
        </button>
        <button class="page-btn" onclick="changePage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''} title="Halaman Terakhir">
            <i class="fa-solid fa-angles-right"></i>
        </button>
    `;

    nav.innerHTML = html;
};

window.changePage = function(page) {
    currentPage = page;
    renderAssets(filteredAssetsGlobal);
    // Scroll table to top smoothly
    document.querySelector('.table-responsive')?.scrollTo({ top: 0, behavior: 'smooth' });
};

window.changeRowsPerPage = function(val) {
    rowsPerPage = val === 'all' ? 'all' : parseInt(val);
    currentPage = 1;
    renderAssets(filteredAssetsGlobal);
};

function renderBorrows() {
    const tbody = document.getElementById("peminjaman-tbody");
    if(!tbody) return;
    tbody.innerHTML = borrows.map(b => `
        <tr>
            <td style="font-family: monospace; font-weight:bold;">${b.id}</td>
            <td style="font-weight:500;">${b.borrower}</td>
            <td>${b.asset_id} <br><small style="color:var(--text-muted)">${b.asset_name || ''}</small></td>
            <td>${b.date_req}</td>
            <td>
                ${getStatusBadge(b.status)}
                ${b.status === 'Close' && b.date_return ? `<br><small style="color:var(--text-muted); font-size:10px;">Kembali: ${b.date_return} oleh ${b.returned_by || '-'}</small>` : ''}
            </td>
            <td>
                ${(b.status === 'Menunggu Approval' || b.status === 'Requested') && (currentUser && currentUser.role === 'Admin') ? 
                    `<button class="secondary-btn" onclick="approveBorrow('${b.id}')" style="padding: 4px 8px; font-size:11px; margin-right:4px;"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
                <button class="action-btn" onclick="deleteBorrow('${b.id}')" style="color:var(--danger);" title="Hapus"><i class="fa-solid fa-trash"></i></button>
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
                ${t.status === 'Open' ? `<button class="secondary-btn" onclick="resolveTicket('${t.id}')" style="padding: 4px 8px; font-size:11px; margin-right:4px;"><i class="fa-solid fa-check"></i> Selesai</button>` : ''}
                <button class="action-btn" onclick="deleteTicket('${t.id}')" style="color:var(--danger);" title="Hapus"><i class="fa-solid fa-trash"></i></button>
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
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>Merk &amp; Type:</strong> <span style="float:right;">${a.brand || '-'}</span></div>
        <div style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;"><strong>Jumlah:</strong> <span style="float:right; font-weight:700; color:var(--primary);">${a.quantity || 1} unit</span></div>
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
    document.getElementById('editAssetQuantity').value = a.quantity || 1;
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

window.deleteBorrow = async function(id) {
    const res = await Swal.fire({
        title: 'Hapus Data Pinjam?',
        text: `Hapus riwayat peminjaman ${id}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        confirmButtonText: 'Ya, Hapus'
    });
    if(res.isConfirmed) {
        await fetch(`/api/borrows/${id}`, { method: 'DELETE' });
        Swal.fire('Terhapus!', 'Data peminjaman telah dibersihkan.', 'success');
        fetchData();
    }
};

window.resolveTicket = async function(id) {
    await fetch(`/api/tickets/${id}/resolve`, { method: 'PUT' });
    fetchData(); 
};

window.deleteTicket = async function(id) {
    const res = await Swal.fire({
        title: 'Hapus Tiket?',
        text: `Hapus riwayat servis ${id}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        confirmButtonText: 'Ya, Hapus'
    });
    if(res.isConfirmed) {
        await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
        Swal.fire('Terhapus!', 'Tiket servis telah dihapus.', 'success');
        fetchData();
    }
};

window.returnAsset = async function(id) {
    const asset = assets.find(a => a.id === id);
    const assetDisplayName = asset ? `${asset.id} - ${asset.name}` : id;

    const { value: returnedBy } = await Swal.fire({
        title: 'Konfirmasi Pengembalian',
        html: `
            <div style="margin-bottom: 15px;">
                <i class="fa-solid fa-rotate-left" style="font-size: 3rem; color: var(--primary); margin-bottom: 15px;"></i>
                <p style="font-weight: 600; color: var(--text-dark); margin-bottom: 5px;">Aset yang dikembalikan:</p>
                <p style="font-family: monospace; background: var(--bg-card); padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); color: var(--primary);">
                    ${assetDisplayName}
                </p>
            </div>
            <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 10px;">Siapa yang menyerahkan aset ini?</p>
        `,
        input: 'text',
        inputPlaceholder: 'Ketik Nama Pengembali...',
        showCancelButton: true,
        confirmButtonText: 'Konfirmasi & Simpan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#4F46E5',
        cancelButtonColor: '#94A3B8',
        inputValidator: (value) => {
            if (!value) return 'Nama pengembali wajib diisi!'
        },
        background: 'rgba(255, 255, 255, 0.95)',
        backdrop: `rgba(15, 23, 42, 0.4)`,
        width: '450px',
        customClass: {
            popup: 'glass-modal-swal',
            title: 'swal-title-custom',
            input: 'swal-input-aesthetic'
        }
    });

    if(returnedBy) {
        try {
            await fetch(`/api/assets/${id}`, { 
                method: 'PUT', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    ...asset,
                    status: 'Tersedia',
                    owner: '-',
                    returned_by: returnedBy
                })
            });
            Swal.fire({
                title: 'Berhasil!',
                text: 'Aset telah kembali ke gudang.',
                icon: 'success',
                confirmButtonColor: '#4F46E5'
            });
            fetchData();
        } catch(err) {
            Swal.fire('Error', 'Gagal memproses data.', 'error');
        }
    }
};

window.openMaintenance = function(id) {
    document.getElementById('maintenanceModal').classList.add('active');
    document.getElementById('maintItem').value = id;
};
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
    // Cari aset dengan pembersihan spasi dan case-insensitive yang lebih kuat
    const a = assets.find(x => {
        if (!x.id) return false;
        return x.id.trim().toLowerCase() === inputVal.toLowerCase();
    });
    
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
    csvContent += "ID Aset,Nama Barang,Merk & Type,Jumlah,Kategori,Kondisi,Status,Lokasi,Peminjam,Riwayat Terakhir\n";
    assets.forEach(a => {
        csvContent += `"${a.id}","${a.name}","${a.brand || '-'}","${a.quantity || 1}","${a.category}","${a.condition}","${a.status}","${a.location}","${a.owner}","${a.last_updated || '-'}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Laporan_Aset_Kantor.csv");
    document.body.appendChild(link);
    link.click();
};

// --- PRINT FUNCTIONS ---
function buildPrintHTML(title, dataArr, isPreview = false) {
    const now = new Date().toLocaleString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const rows = dataArr.map((a, idx) => `
        <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
            <td>${idx + 1}</td>
            <td>${a.id}</td>
            <td>${a.name}</td>
            <td>${a.brand || '-'}</td>
            <td style="text-align:center;">${a.quantity || 1}</td>
            <td>${a.category}</td>
            <td>${a.condition}</td>
            <td>${a.status}</td>
            <td>${a.location}</td>
            <td>${a.owner || '-'}</td>
            <td>${a.last_updated || '-'}</td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Arial', sans-serif; background: #f5f5f5; color: #1e293b; font-size: 12px; }
            .print-wrapper { max-width: 1200px; margin: 0 auto; background: white; }
            /* === HEADER === */
            .print-header { background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
            .print-header .brand { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
            .print-header .brand small { display: block; font-size: 11px; font-weight: 400; opacity: 0.85; margin-top: 2px; }
            .print-header .meta { text-align: right; font-size: 11px; opacity: 0.9; line-height: 1.8; }
            /* === TITLE === */
            .print-title-bar { background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 16px 32px; display:flex; justify-content:space-between; align-items:center; }
            .print-title-bar h1 { font-size: 17px; font-weight: 700; color: #1e293b; }
            .print-title-bar .stats { display: flex; gap: 24px; }
            .print-title-bar .stat-item { text-align: center; }
            .print-title-bar .stat-num { font-size: 20px; font-weight: 700; color: #4F46E5; }
            .print-title-bar .stat-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; }
            /* === TABLE === */
            .table-wrap { padding: 20px 32px 32px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            thead tr { background: #4F46E5; color: white; }
            thead th { padding: 9px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
            thead th:nth-child(1), thead th:nth-child(5) { text-align: center; }
            tbody tr.even { background: #ffffff; }
            tbody tr.odd  { background: #f8fafc; }
            tbody tr:hover { background: #eff6ff; }
            tbody td { padding: 8px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
            tbody td:nth-child(1), tbody td:nth-child(5) { text-align: center; font-weight: 700; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
            .badge-ok   { background: #d1fae5; color: #065f46; }
            .badge-warn { background: #fef3c7; color: #92400e; }
            .badge-bad  { background: #fee2e2; color: #991b1b; }
            /* === FOOTER === */
            .print-footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 32px; display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#94a3b8; }
            /* === PREVIEW CONTROLS === */
            .preview-controls { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; background: #1e293b; color: white; padding: 10px 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
            .preview-controls h3 { font-size: 14px; }
            .preview-controls .ctrl-btns { display: flex; gap: 8px; }
            .ctrl-btn { padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px; }
            .ctrl-btn-primary { background: #4F46E5; color: white; }
            .ctrl-btn-primary:hover { background: #4338ca; }
            .ctrl-btn-danger  { background: #ef4444; color: white; }
            .ctrl-btn-danger:hover  { background: #dc2626; }
            .ctrl-btn-neutral { background: #475569; color: white; }
            .ctrl-btn-neutral:hover { background: #334155; }
            body.preview-mode { padding-top: 56px; }
            @media print {
                body { background: white; font-size: 10px; }
                .preview-controls { display: none !important; }
                body.preview-mode { padding-top: 0; }
                .print-wrapper { max-width: 100%; }
            }
        </style>
    </head>
    <body class="${isPreview ? 'preview-mode' : ''}">
        ${isPreview ? `
        <div class="preview-controls">
            <h3>📄 Print Preview — ${dataArr.length} Aset</h3>
            <div class="ctrl-btns">
                <button class="ctrl-btn ctrl-btn-primary" onclick="window.print()">🖨️ Cetak</button>
                <button class="ctrl-btn ctrl-btn-danger" onclick="printAsPDF()">📥 Simpan PDF</button>
                <button class="ctrl-btn ctrl-btn-neutral" onclick="window.close()">✕ Tutup</button>
            </div>
        </div>` : ''}
        <div class="print-wrapper">
            <div class="print-header">
                <div class="brand">
                    📦 INVENTARIS.IO
                    <small>Sistem Inventarisasi Aset Terpadu</small>
                </div>
                <div class="meta">
                    <strong>${title}</strong><br>
                    Dicetak: ${now}<br>
                    Total Data: ${dataArr.length} aset
                </div>
            </div>
            <div class="print-title-bar">
                <h1>Laporan Daftar Aset</h1>
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-num">${dataArr.length}</div>
                        <div class="stat-lbl">Total</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-num" style="color:#10b981;">${dataArr.filter(a => a.status === 'Tersedia').length}</div>
                        <div class="stat-lbl">Tersedia</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-num" style="color:#f59e0b;">${dataArr.filter(a => a.status === 'Dipinjam').length}</div>
                        <div class="stat-lbl">Dipinjam</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-num" style="color:#ef4444;">${dataArr.filter(a => a.condition === 'Rusak').length}</div>
                        <div class="stat-lbl">Rusak</div>
                    </div>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>ID Aset</th>
                            <th>Nama Barang</th>
                            <th>Merk &amp; Type</th>
                            <th>Jml</th>
                            <th>Kategori</th>
                            <th>Kondisi</th>
                            <th>Status</th>
                            <th>Lokasi</th>
                            <th>PIC / Peminjam</th>
                            <th>Update Terakhir</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="print-footer">
                <span>© Inventaris.io — Laporan dicetak pada ${now}</span>
                <span>Halaman <span id="pg"></span></span>
            </div>
        </div>
        <script>
            function printAsPDF() {
                // Trigger browser Save as PDF dialog
                window.print();
            }
            // Auto-print if not preview
            ${isPreview ? '' : 'setTimeout(() => { window.print(); }, 800);'}
        <\/script>
    </body>
    </html>`;
}

window.printPreviewAssets = function() {
    const data = filteredAssetsGlobal || assets;
    if(!data || data.length === 0) {
        return Swal.fire('Tidak Ada Data', 'Tidak ada aset untuk ditampilkan.', 'warning');
    }
    const pw = window.open('', '_blank', 'width=1200,height=800');
    pw.document.write(buildPrintHTML('Daftar Aset Lengkap', data, true));
    pw.document.close();
};

window.printAssetsAsPDF = function() {
    const data = filteredAssetsGlobal || assets;
    if(!data || data.length === 0) {
        return Swal.fire('Tidak Ada Data', 'Tidak ada aset untuk dicetak.', 'warning');
    }
    const pw = window.open('', '_blank', 'width=1200,height=800');
    pw.document.write(buildPrintHTML('Daftar Aset — Cetak PDF', data, false));
    pw.document.close();
};

// --- PRINT FUNCTIONS FOR CONSUMABLES ---
function buildConsumablePrintHTML(title, dataArr, isPreview = false) {
    const now = new Date().toLocaleString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const rows = dataArr.map((c, idx) => `
        <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
            <td>${idx + 1}</td>
            <td>${c.id}</td>
            <td>${c.name}</td>
            <td>${c.category || '-'}</td>
            <td style="text-align:center; font-weight:bold; color:${c.stock <= c.min_stock ? '#ef4444' : '#10b981'}">${c.stock}</td>
            <td style="text-align:center;">${c.min_stock}</td>
            <td>${c.unit}</td>
            <td>${c.location || '-'}</td>
            <td>${c.last_updated || '-'}</td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Arial', sans-serif; background: #f5f5f5; color: #1e293b; font-size: 12px; }
            .print-wrapper { max-width: 1200px; margin: 0 auto; background: white; }
            /* === HEADER === */
            .print-header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
            .print-header .brand { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
            .print-header .brand small { display: block; font-size: 11px; font-weight: 400; opacity: 0.85; margin-top: 2px; }
            .print-header .meta { text-align: right; font-size: 11px; opacity: 0.9; line-height: 1.8; }
            /* === TITLE === */
            .print-title-bar { background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 16px 32px; display:flex; justify-content:space-between; align-items:center; }
            .print-title-bar h1 { font-size: 17px; font-weight: 700; color: #1e293b; }
            .print-title-bar .stats { display: flex; gap: 24px; }
            .print-title-bar .stat-item { text-align: center; }
            .print-title-bar .stat-num { font-size: 20px; font-weight: 700; color: #10b981; }
            .print-title-bar .stat-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; }
            /* === TABLE === */
            .table-wrap { padding: 20px 32px 32px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            thead tr { background: #10b981; color: white; }
            thead th { padding: 9px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
            thead th:nth-child(1), thead th:nth-child(5), thead th:nth-child(6) { text-align: center; }
            tbody tr.even { background: #ffffff; }
            tbody tr.odd  { background: #f8fafc; }
            tbody tr:hover { background: #eff6ff; }
            tbody td { padding: 8px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
            tbody td:nth-child(1), tbody td:nth-child(5), tbody td:nth-child(6) { text-align: center; }
            /* === FOOTER === */
            .print-footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 32px; display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#94a3b8; }
            /* === PREVIEW CONTROLS === */
            .preview-controls { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; background: #1e293b; color: white; padding: 10px 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
            .preview-controls h3 { font-size: 14px; }
            .preview-controls .ctrl-btns { display: flex; gap: 8px; }
            .ctrl-btn { padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px; }
            .ctrl-btn-primary { background: #10b981; color: white; }
            .ctrl-btn-primary:hover { background: #059669; }
            .ctrl-btn-danger  { background: #ef4444; color: white; }
            .ctrl-btn-danger:hover  { background: #dc2626; }
            .ctrl-btn-neutral { background: #475569; color: white; }
            .ctrl-btn-neutral:hover { background: #334155; }
            body.preview-mode { padding-top: 56px; }
            @media print {
                body { background: white; font-size: 10px; }
                .preview-controls { display: none !important; }
                body.preview-mode { padding-top: 0; }
                .print-wrapper { max-width: 100%; }
            }
        </style>
    </head>
    <body class="${isPreview ? 'preview-mode' : ''}">
        ${isPreview ? `
        <div class="preview-controls">
            <h3>📄 Print Preview — ${dataArr.length} Bahan Habis Pakai</h3>
            <div class="ctrl-btns">
                <button class="ctrl-btn ctrl-btn-primary" onclick="window.print()">🖨️ Cetak</button>
                <button class="ctrl-btn ctrl-btn-danger" onclick="printAsPDF()">📥 Simpan PDF</button>
                <button class="ctrl-btn ctrl-btn-neutral" onclick="window.close()">✕ Tutup</button>
            </div>
        </div>` : ''}
        <div class="print-wrapper">
            <div class="print-header">
                <div class="brand">
                    📦 INVENTARIS.IO
                    <small>Sistem Inventarisasi Aset Terpadu</small>
                </div>
                <div class="meta">
                    <strong>${title}</strong><br>
                    Dicetak: ${now}<br>
                    Total Data: ${dataArr.length} item
                </div>
            </div>
            <div class="print-title-bar">
                <h1>Laporan Stok Bahan Habis Pakai</h1>
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-num">${dataArr.length}</div>
                        <div class="stat-lbl">Total Jenis Bahan</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-num" style="color:#10b981;">${dataArr.filter(c => c.stock > c.min_stock).length}</div>
                        <div class="stat-lbl">Stok Aman</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-num" style="color:#ef4444;">${dataArr.filter(c => c.stock <= c.min_stock).length}</div>
                        <div class="stat-lbl">Stok Menipis / Habis</div>
                    </div>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>ID Bahan</th>
                            <th>Nama Bahan</th>
                            <th>Kategori</th>
                            <th>Stok</th>
                            <th>Batas Min</th>
                            <th>Satuan</th>
                            <th>Lokasi</th>
                            <th>Update Terakhir</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="print-footer">
                <span>© Inventaris.io — Laporan dicetak pada ${now}</span>
                <span>Halaman <span id="pg"></span></span>
            </div>
        </div>
        <script>
            function printAsPDF() {
                window.print();
            }
            ${isPreview ? '' : 'setTimeout(() => { window.print(); }, 800);'}
        <\/script>
    </body>
    </html>`;
}

window.printPreviewConsumables = function() {
    const data = filteredConsumablesGlobal || consumables;
    if(!data || data.length === 0) {
        return Swal.fire('Tidak Ada Data', 'Tidak ada data stok bahan untuk ditampilkan.', 'warning');
    }
    const pw = window.open('', '_blank', 'width=1200,height=800');
    pw.document.write(buildConsumablePrintHTML('Daftar Stok Bahan Habis Pakai', data, true));
    pw.document.close();
};

window.printConsumablesAsPDF = function() {
    const data = filteredConsumablesGlobal || consumables;
    if(!data || data.length === 0) {
        return Swal.fire('Tidak Ada Data', 'Tidak ada data stok bahan untuk dicetak.', 'warning');
    }
    const pw = window.open('', '_blank', 'width=1200,height=800');
    pw.document.write(buildConsumablePrintHTML('Daftar Stok Bahan — Cetak PDF', data, false));
    pw.document.close();
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
        
        const navPengaturanMobile = document.getElementById('nav-pengaturan-mobile');
        if(navPengaturanMobile) navPengaturanMobile.style.display = 'none';
        
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
        } catch(e) { 
            errEl.innerText = "Koneksi ke server terputus."; 
            errEl.style.display = 'block'; 
        }
    });
    
    // --- UNIFIED FILTERING SYSTEM ---
    const searchInput = document.querySelector('.search-bar input');
    const filterCategory = document.getElementById('filterCategory');
    const filterCondition = document.getElementById('filterCondition');
    const filterStatus = document.getElementById('filterStatus');
    const filterLocation = document.getElementById('filterLocation');

    function applyFilters() {
        const term = searchInput.value.toLowerCase();
        const cat = filterCategory.value;
        const cond = filterCondition.value;
        const stat = filterStatus.value;
        const loc = filterLocation.value;

        const filtered = assets.filter(a => {
            const matchesSearch = !term || 
                a.name.toLowerCase().includes(term) || 
                a.id.toLowerCase().includes(term) || 
                a.brand?.toLowerCase().includes(term);
            
            const matchesCat = !cat || a.category === cat;
            const matchesCond = !cond || a.condition === cond;
            const matchesStat = !stat || a.status === stat;
            const matchesLoc = !loc || a.location === loc;

            return matchesSearch && matchesCat && matchesCond && matchesStat && matchesLoc;
        });

        const filteredConsumables = consumables.filter(c => {
            return !term || 
                c.name.toLowerCase().includes(term) || 
                c.id.toLowerCase().includes(term) || 
                (c.category && c.category.toLowerCase().includes(term)) ||
                (c.location && c.location.toLowerCase().includes(term));
        });

        currentPage = 1; // Reset ke halaman 1 saat filter berubah
        renderAssets(filtered);

        currentConsumablePage = 1;
        renderConsumables(filteredConsumables);
    }

    // Event Listeners for Filters
    [searchInput, filterCategory, filterCondition, filterStatus, filterLocation].forEach(el => {
        el?.addEventListener('change', applyFilters);
        if(el === searchInput) el?.addEventListener('input', applyFilters);
    });

    window.resetFilters = function() {
        searchInput.value = "";
        filterCategory.value = "";
        filterCondition.value = "";
        filterStatus.value = "";
        filterLocation.value = "";
        renderAssets();
        renderConsumables();
    };


    
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
            if(targetId === 'view-laporan') {
                renderCharts();
                updateLaporanSummary();
            }
            
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
            quantity: parseInt(document.getElementById('assetQuantity').value) || 1,
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
            quantity: parseInt(document.getElementById('editAssetQuantity').value) || 1,
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
        
        const asset_id = document.getElementById('borrowItem').value;
        if(!asset_id) return Swal.fire('Pilih Aset', 'Silakan pilih aset dari daftar.', 'warning');
        
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
        
        const asset_id = document.getElementById('maintItem').value;
        if(!asset_id) return Swal.fire('Pilih Aset', 'Silakan pilih aset dari daftar.', 'warning');

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

    // ============================
    // CONSUMABLES MODULE
    // ============================
    setupModal('.btn-tambah-consumable', 'addConsumableModal', '#addConsumableModal .closeAddConsumableBtn');
    setupModal('.closeEditConsumableBtn', 'editConsumableModal', '.closeEditConsumableBtn');

    // POST: Tambah Bahan
    document.getElementById('addConsumableForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cat = document.getElementById('consumableCategory').value;
        const prefix = cat ? cat.substring(0,3).toUpperCase() : 'BHP';
        const data = {
            id: `STK-${prefix}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`,
            name: document.getElementById('consumableName').value,
            category: cat,
            unit: document.getElementById('consumableUnit').value,
            stock: parseInt(document.getElementById('consumableStock').value) || 0,
            min_stock: parseInt(document.getElementById('consumableMinStock').value) || 5,
            location: document.getElementById('consumableLocation').value,
            last_updated: new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
        };
        try {
            const res = await fetch('/api/consumables', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
            if(!res.ok) { const r = await res.json(); return Swal.fire('Error', r.error, 'error'); }
            document.getElementById('addConsumableModal').classList.remove('active');
            Swal.fire('Tersimpan!', 'Bahan habis pakai berhasil ditambahkan.', 'success');
            fetchData();
        } catch(err) { Swal.fire('Error', 'Gagal menyimpan data.', 'error'); }
    });

    // PUT: Edit Bahan
    document.getElementById('editConsumableForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editConsumableId').value;
        const data = {
            name: document.getElementById('editConsumableName').value,
            category: document.getElementById('editConsumableCategory').value,
            unit: document.getElementById('editConsumableUnit').value,
            stock: parseInt(document.getElementById('editConsumableStock').value),
            min_stock: parseInt(document.getElementById('editConsumableMinStock').value),
            location: document.getElementById('editConsumableLocation').value,
            last_updated: new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
        };
        try {
            const res = await fetch(`/api/consumables/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
            if(!res.ok) { const r = await res.json(); return Swal.fire('Error', r.error, 'error'); }
            document.getElementById('editConsumableModal').classList.remove('active');
            Swal.fire('Diperbarui!', 'Data bahan berhasil diubah.', 'success');
            fetchData();
        } catch(err) { Swal.fire('Error', 'Gagal menyimpan data.', 'error'); }
    });
});

function updateLaporanSummary() {
    const repTotal = document.getElementById('rep-total');
    const repBorrowed = document.getElementById('rep-borrowed');
    const repMaint = document.getElementById('rep-maint');
    const repLow = document.getElementById('rep-low');

    if(repTotal) repTotal.innerText = assets.length;
    if(repBorrowed) repBorrowed.innerText = assets.filter(a => a.status === 'Dipinjam').length;
    if(repMaint) repMaint.innerText = assets.filter(a => a.status === 'Servis').length;
    if(repLow) repLow.innerText = consumables.filter(c => c.stock <= c.min_stock).length;
}

// --- CONSUMABLES RENDER & ACTIONS ---
function getStockBadge(stock, min) {
    if(stock <= 0) return `<span class="pill pill-danger">Habis</span>`;
    if(stock <= min) return `<span class="pill pill-warning">${stock} ⚠️</span>`;
    return `<span class="pill pill-success">${stock}</span>`;
}

function getStockBar(stock, min) {
    const max = Math.max(min * 3, stock, 1);
    const pct = Math.min((stock / max) * 100, 100);
    let color = '#10b981';
    if(stock <= 0) color = '#ef4444';
    else if(stock <= min) color = '#f59e0b';
    return `<div style="background:#e2e8f0; border-radius:4px; height:6px; width:80px; display:inline-block; vertical-align:middle; margin-left:6px;">
        <div style="background:${color}; height:100%; border-radius:4px; width:${pct}%; transition:width 0.3s;"></div>
    </div>`;
}

function renderConsumables(dataToRender = null) {
    const tbody = document.getElementById('consumables-tbody');
    if(!tbody) return;

    const data = dataToRender || consumables;
    filteredConsumablesGlobal = data;

    // Hitung index untuk slicing
    let displayData = data;
    if (consumableRowsPerPage !== 'all') {
        const start = (currentConsumablePage - 1) * consumableRowsPerPage;
        const end = start + parseInt(consumableRowsPerPage);
        displayData = data.slice(start, end);
    }

    const rows = displayData.map(c => `
        <tr>
            <td style="font-family:monospace; font-weight:600; color:var(--primary);">${c.id}</td>
            <td style="font-weight:600;">${c.name}</td>
            <td>${c.category || '-'}</td>
            <td>${getStockBadge(c.stock, c.min_stock)} ${getStockBar(c.stock, c.min_stock)}</td>
            <td style="color:var(--text-muted);">${c.min_stock}</td>
            <td>${c.unit}</td>
            <td><i class="fa-solid fa-location-dot" style="color:var(--text-muted); margin-right:4px;"></i>${c.location || '-'}</td>
            <td style="font-size:12px; color:var(--text-muted);">${c.last_updated || '-'}</td>
            <td>
                <div style="display:flex; gap:4px;">
                    <button class="action-btn" title="Ambil Stok" onclick="useStock('${c.id}')" style="color:var(--warning);"><i class="fa-solid fa-arrow-up-from-bracket"></i></button>
                    <button class="action-btn" title="Terima Stok" onclick="restockItem('${c.id}')" style="color:#16a34a;"><i class="fa-solid fa-download"></i></button>
                    <button class="action-btn" title="Riwayat" onclick="viewItemLogs('${c.id}')"><i class="fa-solid fa-clock-rotate-left"></i></button>
                    ${currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Staff') ? `
                    <button class="action-btn" title="Edit" onclick="openEditConsumable('${c.id}')"><i class="fa-solid fa-pen"></i></button>` : ''}
                    ${currentUser && currentUser.role === 'Admin' ? `
                    <button class="action-btn" title="Hapus" onclick="deleteConsumable('${c.id}')" style="color:var(--danger);"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');

    tbody.innerHTML = rows || '<tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text-muted);">Tidak ada stok bahan yang sesuai pencarian.</td></tr>';

    // Update Pagination UI for Consumables
    renderConsumablePagination(data.length);
}

// LOGIKA PAGINATION UNTUK CONSUMABLES
window.renderConsumablePagination = function(totalItems) {
    const info = document.getElementById('consumablePaginationInfo');
    const nav = document.getElementById('consumablePaginationNav');
    if (!info || !nav) return;

    if (consumableRowsPerPage === 'all' || totalItems <= consumableRowsPerPage) {
        info.innerText = `Menampilkan ${totalItems} data`;
        nav.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(totalItems / consumableRowsPerPage);
    const startIdx = (currentConsumablePage - 1) * consumableRowsPerPage + 1;
    const endIdx = Math.min(currentConsumablePage * consumableRowsPerPage, totalItems);

    info.innerText = `Menampilkan ${startIdx} - ${endIdx} dari ${totalItems} data`;

    let html = `
        <button class="page-btn" onclick="changeConsumablePage(1)" ${currentConsumablePage === 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-angles-left"></i>
        </button>
        <button class="page-btn" onclick="changeConsumablePage(${currentConsumablePage - 1})" ${currentConsumablePage === 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-angle-left"></i>
        </button>
    `;

    let startPage = Math.max(1, currentConsumablePage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === currentConsumablePage ? 'active' : ''}" onclick="changeConsumablePage(${i})">${i}</button>`;
    }

    html += `
        <button class="page-btn" onclick="changeConsumablePage(${currentConsumablePage + 1})" ${currentConsumablePage === totalPages ? 'disabled' : ''}>
            <i class="fa-solid fa-angle-right"></i>
        </button>
        <button class="page-btn" onclick="changeConsumablePage(${totalPages})" ${currentConsumablePage === totalPages ? 'disabled' : ''}>
            <i class="fa-solid fa-angles-right"></i>
        </button>
    `;

    nav.innerHTML = html;
};

window.changeConsumablePage = function(page) {
    currentConsumablePage = page;
    renderConsumables();
    document.querySelector('#view-consumables .table-responsive')?.scrollTo({ top: 0, behavior: 'smooth' });
};

window.changeConsumableRowsPerPage = function(val) {
    consumableRowsPerPage = val === 'all' ? 'all' : parseInt(val);
    currentConsumablePage = 1;
    renderConsumables();
};

window.useStock = async function(id) {
    const item = consumables.find(c => c.id === id);
    if(!item) return;
    const { value: formValues } = await Swal.fire({
        title: `📤 Ambil Stok: ${item.name}`,
        html: `<p style="margin-bottom:8px; color:var(--text-muted);">Sisa stok: <b>${item.stock} ${item.unit}</b></p>
            <input id="swal-qty" type="number" min="1" max="${item.stock}" value="1" class="swal2-input" placeholder="Jumlah">
            <input id="swal-user" type="text" class="swal2-input" placeholder="Nama Pengambil">
            <input id="swal-note" type="text" class="swal2-input" placeholder="Catatan (opsional)">`,
        confirmButtonText: 'Ambil Stok',
        confirmButtonColor: '#f59e0b',
        showCancelButton: true,
        cancelButtonText: 'Batal',
        preConfirm: () => {
            const qty = parseInt(document.getElementById('swal-qty').value);
            const user = document.getElementById('swal-user').value;
            if(!qty || qty <= 0) { Swal.showValidationMessage('Jumlah harus lebih dari 0'); return false; }
            if(!user) { Swal.showValidationMessage('Nama pengambil wajib diisi'); return false; }
            if(qty > item.stock) { Swal.showValidationMessage(`Stok tidak cukup! Sisa: ${item.stock}`); return false; }
            return { quantity: qty, user_name: user, note: document.getElementById('swal-note').value };
        }
    });
    if(formValues) {
        try {
            const res = await fetch(`/api/consumables/${id}/use`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(formValues) });
            const data = await res.json();
            if(!res.ok) return Swal.fire('Gagal', data.error, 'error');
            Swal.fire('Berhasil!', data.message, 'success');
            fetchData();
        } catch(err) { Swal.fire('Error', 'Gagal memproses.', 'error'); }
    }
};

window.restockItem = async function(id) {
    const item = consumables.find(c => c.id === id);
    if(!item) return;
    const { value: formValues } = await Swal.fire({
        title: `📥 Terima Stok: ${item.name}`,
        html: `<p style="margin-bottom:8px; color:var(--text-muted);">Stok saat ini: <b>${item.stock} ${item.unit}</b></p>
            <input id="swal-qty" type="number" min="1" value="1" class="swal2-input" placeholder="Jumlah tambahan">
            <input id="swal-user" type="text" class="swal2-input" placeholder="Nama Penerima">
            <input id="swal-note" type="text" class="swal2-input" placeholder="Catatan (opsional)">`,
        confirmButtonText: 'Terima Stok',
        confirmButtonColor: '#10b981',
        showCancelButton: true,
        preConfirm: () => {
            const qty = parseInt(document.getElementById('swal-qty').value);
            const user = document.getElementById('swal-user').value;
            if(!qty || qty <= 0) { Swal.showValidationMessage('Jumlah harus lebih dari 0'); return false; }
            if(!user) { Swal.showValidationMessage('Nama penerima wajib diisi'); return false; }
            return { quantity: qty, user_name: user, note: document.getElementById('swal-note').value };
        }
    });
    if(formValues) {
        try {
            const res = await fetch(`/api/consumables/${id}/restock`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(formValues) });
            const data = await res.json();
            if(!res.ok) return Swal.fire('Gagal', data.error, 'error');
            Swal.fire('Terima Stok Berhasil!', data.message, 'success');
            fetchData();
        } catch(err) { Swal.fire('Error', 'Gagal memproses.', 'error'); }
    }
};

window.openEditConsumable = function(id) {
    const c = consumables.find(x => x.id === id);
    if(!c) return;
    document.getElementById('editConsumableId').value = c.id;
    document.getElementById('editConsumableName').value = c.name;
    document.getElementById('editConsumableCategory').value = c.category;
    document.getElementById('editConsumableUnit').value = c.unit;
    document.getElementById('editConsumableStock').value = c.stock;
    document.getElementById('editConsumableMinStock').value = c.min_stock;
    document.getElementById('editConsumableLocation').value = c.location || '';
    document.getElementById('editConsumableModal').classList.add('active');
};

window.deleteConsumable = async function(id) {
    const res = await Swal.fire({ title: 'Hapus Bahan?', text: `Hapus ${id} secara permanen?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: 'Hapus' });
    if(res.isConfirmed) {
        await fetch(`/api/consumables/${id}`, { method: 'DELETE' });
        Swal.fire('Terhapus!', 'Data bahan berhasil dihapus.', 'success');
        fetchData();
    }
};

window.viewItemLogs = async function(id) {
    const item = consumables.find(c => c.id === id);
    try {
        const res = await fetch(`/api/consumable-logs/${id}`);
        const logs = await res.json();
        if(logs.length === 0) return Swal.fire('Riwayat', 'Belum ada riwayat untuk item ini.', 'info');
        const html = `<div style="text-align:left; max-height:300px; overflow-y:auto;">
            <table style="width:100%; font-size:13px; border-collapse:collapse;">
                <tr style="border-bottom:1px solid #e2e8f0;"><th style="padding:6px;">Aksi</th><th style="padding:6px;">Jml</th><th style="padding:6px;">Oleh</th><th style="padding:6px;">Tgl</th></tr>
                ${logs.map(l => `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:6px;">${l.action === 'USE' ? '📤 Ambil' : '📥 Terima'}</td>
                    <td style="padding:6px; font-weight:600; color:${l.action === 'USE' ? '#ef4444' : '#10b981'};">${l.action === 'USE' ? '-' : '+'}${l.quantity}</td>
                    <td style="padding:6px;">${l.user_name || '-'}</td>
                    <td style="padding:6px; font-size:11px; color:#64748b;">${l.created_at || '-'}</td>
                </tr>`).join('')}
            </table>
        </div>`;
        Swal.fire({ title: `Riwayat: ${item?.name || id}`, html: html, width: 500, confirmButtonColor: '#4F46E5' });
    } catch(err) { Swal.fire('Error', 'Gagal memuat riwayat.', 'error'); }
};

window.viewConsumableLogs = async function() {
    try {
        const res = await fetch('/api/consumable-logs');
        const logs = await res.json();
        if(logs.length === 0) return Swal.fire('Riwayat', 'Belum ada riwayat pemakaian.', 'info');
        const html = `<div style="text-align:left; max-height:400px; overflow-y:auto;">
            <table style="width:100%; font-size:13px; border-collapse:collapse;">
                <tr style="border-bottom:2px solid #e2e8f0;"><th style="padding:8px;">Item</th><th style="padding:8px;">Aksi</th><th style="padding:8px;">Jml</th><th style="padding:8px;">Oleh</th><th style="padding:8px;">Tgl</th></tr>
                ${logs.slice(0,30).map(l => `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:6px; font-weight:500;">${l.item_name || l.consumable_id}</td>
                    <td style="padding:6px;">${l.action === 'USE' ? '📤 Ambil' : '📥 Terima'}</td>
                    <td style="padding:6px; font-weight:600; color:${l.action === 'USE' ? '#ef4444' : '#10b981'};">${l.action === 'USE' ? '-' : '+'}${l.quantity} ${l.unit || ''}</td>
                    <td style="padding:6px;">${l.user_name || '-'}</td>
                    <td style="padding:6px; font-size:11px; color:#64748b;">${l.created_at || '-'}</td>
                </tr>`).join('')}
            </table>
        </div>`;
        Swal.fire({ title: '📋 Riwayat Pemakaian Bahan', html: html, width: 650, confirmButtonColor: '#4F46E5' });
    } catch(err) { Swal.fire('Error', 'Gagal memuat riwayat.', 'error'); }
};
