// Backup Management
console.log('✅ Backup script loaded');

let backups = [];
let deletingBackup = null;

// Translation helper
function t(key) {
    const element = document.getElementById(`trans-${key}`);
    if (element) {
        return element.textContent;
    }
    if (window.i18n && window.i18n.translations && window.i18n.translations[key]) {
        return window.i18n.translations[key];
    }
    console.warn(`⚠️ Translation missing for: ${key}`);
    return key;
}

// Initialize
async function initBackupPage() {
    console.log('🚀 Initializing backup page...');
    await new Promise(resolve => setTimeout(resolve, 100));

    // No access restrictions - all users can backup
    // Hide access denied if it exists (backward compatibility)
    const accessDenied = document.getElementById('access-denied');
    if (accessDenied) {
        accessDenied.style.display = 'none';
    }

    // Show backup content
    const backupContent = document.getElementById('backup-content');
    if (backupContent) {
        backupContent.style.display = 'block';
    }

    await loadDatabaseInfo();
    await loadBackups();
}


// Load database info
async function loadDatabaseInfo() {
    try {
        // This is a placeholder - you can create an API endpoint to get actual DB stats
        document.getElementById('db-users-count').textContent = '-';
        document.getElementById('db-projects-count').textContent = '-';
        document.getElementById('db-items-count').textContent = '-';
        document.getElementById('db-size').textContent = '-';

        // You can add API endpoint /api/database/stats to get real numbers
    } catch (error) {
        console.error('Error loading database info:', error);
    }
}

// Create backup
async function createBackup() {
    const createBtn = document.getElementById('create-backup-btn');
    const originalHTML = createBtn.innerHTML;

    try {
        createBtn.disabled = true;
        createBtn.querySelector('[data-i18n="create_backup"]').textContent = t('creating');

        const response = await fetch('/api/backup/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            showNotification(t('backup-success'), 'success');

            // Auto-download the backup
            window.location.href = result.download_url;

            // Reload backups list
            await loadBackups();
        } else {
            showNotification(result.message || t('error-creating'), 'error');
        }
    } catch (error) {
        console.error('❌ Error creating backup:', error);
        showNotification(t('error-creating') + ': ' + error.message, 'error');
    } finally {
        createBtn.disabled = false;
        createBtn.innerHTML = originalHTML;
    }
}

// Load backups list
async function loadBackups() {
    const tbody = document.getElementById('backups-table-body');
    const countEl = document.getElementById('backup-count');

    try {
        console.log('📥 Loading backups...');

        // Show loading state
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: #9CA3AF;">
                        <span>⏳ Loading backups...</span>
                    </td>
                </tr>
            `;
        }

        const response = await fetch('/api/backup/list');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        console.log('📦 API Response:', result);

        if (result.success) {
            backups = result.backups || [];
            console.log(`✅ Loaded ${backups.length} backups`);
            renderBackupsTable();
        } else {
            throw new Error(result.message || 'Failed to load backups');
        }
    } catch (error) {
        console.error('❌ Error loading backups:', error);

        // Show error in table
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: #EF4444;">
                        <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
                        <p style="font-weight: 600;">Error loading backups</p>
                        <p style="font-size: 0.9rem; color: #991B1B;">${error.message}</p>
                    </td>
                </tr>
            `;
        }

        if (countEl) {
            countEl.textContent = '0';
        }

        showNotification(t('error-loading') + ': ' + error.message, 'error');
    }
}

// Render backups table
function renderBackupsTable() {
    const tbody = document.getElementById('backups-table-body');
    const countEl = document.getElementById('backup-count');

    if (countEl) {
        countEl.textContent = backups.length;
    }

    if (!tbody) return;

    if (backups.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 3rem; color: #9CA3AF;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">💾</div>
                    <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">${t('no-backups')}</p>
                    <p style="font-size: 0.9rem;">${t('click-create')}</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = backups.map((backup, index) => `
        <tr>
            <td style="text-align: center; font-weight: 600; color: #6B7280;">${index + 1}</td>
            <td>
                <div style="font-weight: 600; color: #1F3A8A;">
                    <span style="font-size: 1.2rem; margin-right: 0.5rem;">📦</span>
                    ${escapeHtml(backup.filename)}
                </div>
            </td>
            <td>
                <span class="badge badge-info">${formatFileSize(backup.size)}</span>
            </td>
            <td style="font-size: 0.9rem; color: #6B7280;">
                ${formatDate(backup.created_at)}
            </td>
            <td>
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-sm btn-success" onclick="downloadBackup('${backup.filename}')" title="Download">
                        ⬇️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBackup('${backup.filename}')" title="Delete">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Download backup
function downloadBackup(filename) {
    console.log('📥 Downloading backup:', filename);
    window.location.href = `/api/backup/download/${filename}`;
    showNotification(t('downloading'), 'info');
}

// Delete backup
function deleteBackup(filename) {
    deletingBackup = filename;

    const backupNameEl = document.getElementById('delete-backup-name');
    if (backupNameEl) {
        backupNameEl.textContent = filename;
    }

    const modal = document.getElementById('delete-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Close delete modal
function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    deletingBackup = null;
}

// Confirm delete
async function confirmDelete() {
    if (!deletingBackup) return;

    const deleteBtn = document.getElementById('confirm-delete-btn');
    const deletingText = t('deleting');
    const originalHTML = deleteBtn.innerHTML;

    try {
        deleteBtn.disabled = true;
        deleteBtn.querySelector('[data-i18n="delete_backup"]').textContent = deletingText;

        const response = await fetch(`/api/backup/delete/${deletingBackup}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showNotification(t('delete-success'), 'success');
            closeDeleteModal();
            await loadBackups();
        } else {
            showNotification(result.message || t('error-deleting'), 'error');
        }
    } catch (error) {
        console.error('❌ Error deleting backup:', error);
        showNotification(t('error-deleting') + ': ' + error.message, 'error');
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalHTML;
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Notification
function showNotification(message, type = 'info') {
    console.log(`📢 [${type}] ${message}`);

    const notification = document.createElement('div');
    const bgColor = type === 'error' ? '#FEE2E2' : type === 'success' ? '#D1FAE5' : '#FEF3C7';
    const textColor = type === 'error' ? '#991B1B' : type === 'success' ? '#065F46' : '#92400E';
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';

    notification.style.cssText = `
        position: fixed; top: 90px; right: 20px; z-index: 1001;
        padding: 1rem 1.5rem; font-size: 1rem;
        background: ${bgColor}; color: ${textColor};
        border: 2px solid ${textColor}; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex; align-items: center; gap: 0.75rem;
        max-width: 400px;
        animation: slideIn 0.3s ease-out;
    `;

    notification.innerHTML = `<span style="font-size: 1.5rem;">${icon}</span><span>${message}</span>`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Close modal on Escape
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeDeleteModal();
    }
});

// Close modal on overlay click
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('popup-overlay')) {
        closeDeleteModal();
    }
});



// Make init function globally accessible for re-initialization
window.initBackupPage = initBackupPage;

// Initialize on first load
initBackupPage();