const API_URL = 'http://localhost:5000/api';
let authToken = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null'); // ← TAMBAHIN INI

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginTab').style.background = '#2196F3';
    document.getElementById('loginTab').style.color = 'white';
    document.getElementById('registerTab').style.background = '#ddd';
    document.getElementById('registerTab').style.color = 'black';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('registerTab').style.background = '#2196F3';
    document.getElementById('registerTab').style.color = 'white';
    document.getElementById('loginTab').style.background = '#ddd';
    document.getElementById('loginTab').style.color = 'black';
}

async function doLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { alert('Email dan password harus diisi!'); return; }
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.error) { alert(data.message); return; }
        
        authToken = data.token;
        currentUser = data.user; // ← SIMPAN DATA USER
        localStorage.setItem('token', authToken);
        localStorage.setItem('currentUser', JSON.stringify(data.user)); // ← SIMPAN KE LOCALSTORAGE
        
        showDashboard(); // ← PAKAI FUNCTION INI
        alert('Login berhasil! 🌸');
    } catch (error) {
        alert('Gagal terhubung ke server');
    }
}

async function doRegister() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    if (!name || !email || !password) { alert('Semua field harus diisi!'); return; }
    if (password.length < 6) { alert('Password minimal 6 karakter!'); return; }
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await response.json();
        if (data.error) { alert(data.message); return; }
        alert('Registrasi berhasil! Silakan login.');
        showLogin();
    } catch (error) {
        alert('Gagal terhubung ke server');
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    
    // Reset tampilan avatar ke default
    const avatarDisplay = document.getElementById('avatarDisplay');
    if (avatarDisplay) {
        avatarDisplay.style.backgroundImage = '';
        avatarDisplay.textContent = '🌸';
    }
    
    document.getElementById('authBox').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('userArea').style.display = 'none';
}

// Tampilkan dashboard
function showDashboard() {
    document.getElementById('authBox').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('userArea').style.display = 'flex';
    
    // Update nama user di navbar
    if (currentUser) {
        document.getElementById('userNameDisplay').textContent = currentUser.name;
    }
    
    // Load avatar untuk user ini
    loadAvatar();
    
    // Load data dashboard
    loadStorageInfo();
    loadFiles();
}

async function uploadFiles() {
    const fileInput = document.getElementById('fileInput');
    const files = fileInput.files;
    if (files.length === 0) { alert('Pilih file dulu!'); return; }
    
    const statusDiv = document.getElementById('uploadStatus');
    
    for (let file of files) {
        statusDiv.textContent = 'Uploading ' + file.name + '...';
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch(`${API_URL}/files/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` },
                body: formData
            });
            const data = await response.json();
            if (data.error) { statusDiv.textContent = 'Gagal: ' + data.message; return; }
            statusDiv.textContent = file.name + ' berhasil diupload! ✅';
        } catch (error) {
            statusDiv.textContent = 'Gagal upload';
        }
    }
    setTimeout(() => { loadFiles(); loadStorageInfo(); statusDiv.textContent = ''; }, 1500);
}

async function loadFiles() {
    try {
        const response = await fetch(`${API_URL}/files`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        document.getElementById('totalFiles').textContent = data.total || 0;
        const fileListDiv = document.getElementById('fileList');
        
        if (!data.files || data.files.length === 0) {
            fileListDiv.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Belum ada file</p>';
            return;
        }
        
        fileListDiv.innerHTML = data.files.map(file => `
            <div class="file-item">
                <div>
                    <strong>📄 ${file.name}</strong>
                    <br>
                    <small style="color:#666;">${file.size_readable}</small>
                </div>
                <div>
                    <button onclick="downloadFile('${file.name}')" class="btn-action btn-download">Download</button>
                    <button onclick="deleteFile('${file.name}')" class="btn-action btn-delete">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
    }
}

async function downloadFile(filename) {
    try {
        const response = await fetch(`${API_URL}/files/download/${filename}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (data.download_url) {
            window.open(data.download_url, '_blank');
        } else {
            alert('Gagal download');
        }
    } catch (error) {
        alert('Gagal download');
    }
}

async function deleteFile(filename) {
    if (!confirm('Yakin hapus ' + filename + '?')) return;
    try {
        const response = await fetch(`${API_URL}/files/delete/${filename}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (data.error) { alert(data.message); return; }
        alert('File dihapus');
        loadFiles();
        loadStorageInfo();
    } catch (error) {
        alert('Gagal hapus file');
    }
}

async function loadStorageInfo() {
    try {
        const response = await fetch(`${API_URL}/storage/info`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        document.getElementById('storageInfo').textContent = data.used_readable + ' / ' + data.limit_readable;
        document.getElementById('storageBar').style.width = data.percentage + '%';
    } catch (error) {
        console.error(error);
    }
}

// ============================================
// FITUR FOTO PROFIL
// ============================================

// Default avatar lucu
// ============================================
// AVATAR PER USER (disimpan berdasarkan email)
// ============================================

const defaultAvatars = [
    '🌸', '💕', '🎀', '🦄', '🍰', '💖', '✨', '🌈', 
    '🐰', '🍭', '💝', '🧸', '🩷', '🎂', '🍬', '🐱',
    '🐶', '🍩', '🎪', '🌟', '💎', '🎯', '🌷', '🎵'
];

function getRandomAvatar() {
    return defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];
}

// Simpan avatar berdasarkan email user
function getAvatarKey() {
    const email = currentUser?.email || 'default';
    return `avatar_${email}`;
}

function getAvatarImgKey() {
    const email = currentUser?.email || 'default';
    return `avatarImg_${email}`;
}

function getAvatarTypeKey() {
    const email = currentUser?.email || 'default';
    return `avatarType_${email}`;
}

function changeAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgUrl = e.target.result;
            
            // Simpan per user
            localStorage.setItem(getAvatarImgKey(), imgUrl);
            localStorage.setItem(getAvatarTypeKey(), 'image');
            
            const avatarDisplay = document.getElementById('avatarDisplay');
            if (avatarDisplay) {
                avatarDisplay.style.backgroundImage = `url(${imgUrl})`;
                avatarDisplay.style.backgroundSize = 'cover';
                avatarDisplay.style.backgroundPosition = 'center';
                avatarDisplay.textContent = '';
            }
            
            alert('Foto profil berhasil diupdate! 🌸');
        };
        reader.readAsDataURL(file);
    }
}

function resetAvatar() {
    localStorage.removeItem(getAvatarImgKey());
    localStorage.removeItem(getAvatarTypeKey());
    
    const newAvatar = getRandomAvatar();
    localStorage.setItem(getAvatarKey(), newAvatar);
    
    const avatarDisplay = document.getElementById('avatarDisplay');
    if (avatarDisplay) {
        avatarDisplay.style.backgroundImage = '';
        avatarDisplay.textContent = newAvatar;
    }
}

function loadAvatar() {
    const avatarType = localStorage.getItem(getAvatarTypeKey());
    const avatarDisplay = document.getElementById('avatarDisplay');
    
    if (!avatarDisplay) return;
    
    if (avatarType === 'image') {
        const imgUrl = localStorage.getItem(getAvatarImgKey());
        if (imgUrl) {
            avatarDisplay.style.backgroundImage = `url(${imgUrl})`;
            avatarDisplay.style.backgroundSize = 'cover';
            avatarDisplay.style.backgroundPosition = 'center';
            avatarDisplay.textContent = '';
        }
    } else {
        const savedAvatar = localStorage.getItem(getAvatarKey());
        if (savedAvatar) {
            avatarDisplay.textContent = savedAvatar;
        } else {
            // Avatar baru untuk user baru
            const newAvatar = getRandomAvatar();
            localStorage.setItem(getAvatarKey(), newAvatar);
            avatarDisplay.textContent = newAvatar;
        }
    }
}

window.onload = function() {
    if (authToken && currentUser) {
        showDashboard();
    } else {
        // Tampilkan halaman login
        document.getElementById('authBox').style.display = 'block';
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('userArea').style.display = 'none';
    }
    
    // Load avatar kalau user sudah tersimpan
    if (currentUser) {
        loadAvatar();
    }
};