// End Users Management
console.log('✅ End Users script loaded');

let endUsers = [];
let editingEndUserId = null;
let deletingEndUserId = null;

// Translation helper
function t(key) {
    const element = document.getElementById(`trans-${key}`);
    if (element) {
        return element.textContent.trim();
    }
    if (window.i18n && window.i18n.translations && window.i18n.translations[key]) {
        return window.i18n.translations[key];
    }
    console.warn(`⚠️ Translation missing for: ${key}`);
    return key;
}

// Canonical user types (stored in database - always English)
const USER_TYPES_CANONICAL = [
    'Emergency Coordination',
    'Regular Coordination',
    'Emergency Project',
    'Regular Project',
    'Prepositioned Stock',
    'Staff Health'
];

// Translate user type from canonical English to display language
function translateUserType(canonical) {
    const map = {
        'Emergency Coordination': t('user_type_emergency_coordination'),
        'Regular Coordination': t('user_type_regular_coordination'),
        'Emergency Project': t('user_type_emergency_project'),
        'Regular Project': t('user_type_regular_project'),
        'Prepositioned Stock': t('user_type_prepositioned_stock'),
        'Staff Health': t('user_type_staff_health')
    };
    return map[canonical] || canonical;
}

// Reverse translate: display language back to canonical English
function reverseTranslateUserType(translated) {
    // Build reverse map
    const reverseMap = {};
    USER_TYPES_CANONICAL.forEach(canonical => {
        const display = translateUserType(canonical);
        reverseMap[display.toLowerCase()] = canonical;
    });
    return reverseMap[translated.toLowerCase()] || translated;
}

// Initialize
async function initEndUsersPage() {
    console.log('🚀 Initializing end users page...');
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadEndUsers();
}

// Load end users
async function loadEndUsers() {
    const tbody = document.getElementById('end-users-table-body');
    const countEl = document.getElementById('end-users-count');

    try {
        console.log('📥 Loading end users...');

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 2rem; color: #9CA3AF;">
                        <span>⏳ ${t('loading_end_users')}</span>
                    </td>
                </tr>
            `;
        }

        const response = await fetch('/api/end-users');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('📦 API Response:', result);

        if (result.success) {
            endUsers = result.end_users || [];
            console.log(`✅ Loaded ${endUsers.length} end users`);
            renderEndUsersTable();

            if (countEl) {
                countEl.textContent = endUsers.length;
            }
        } else {
            throw new Error(result.message || 'Failed to load end users');
        }
    } catch (error) {
        console.error('❌ Error loading end users:', error);

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 2rem; color: #EF4444;">
                        <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
                        <p style="font-weight: 600;">${t('error_loading_end_users')}</p>
                        <p style="font-size: 0.9rem; color: #991B1B;">${error.message}</p>
                    </td>
                </tr>
            `;
        }

        if (countEl) {
            countEl.textContent = '0';
        }

        showNotification(t('error_loading_end_users') + ': ' + error.message, 'error');
    }
}

// Render table
function renderEndUsersTable() {
    const tbody = document.getElementById('end-users-table-body');

    if (!tbody) return;

    if (endUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 3rem; color: #9CA3AF;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">👥</div>
                    <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">${t('no_end_users_found')}</p>
                    <p style="font-size: 0.9rem;">${t('click_add_first')}</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = endUsers.map((user, index) => {
        // Translate user type for display
        const translatedType = translateUserType(user.user_type);

        return `
            <tr>
                <td style="text-align: center; font-weight: 600; color: #6B7280;">${index + 1}</td>
                <td style="font-weight: 600; color: #1F3A8A;">
                    <span style="font-size: 1.2rem; margin-right: 0.5rem;">👤</span>
                    ${escapeHtml(user.name)}
                </td>
                <td>
                    <span class="badge badge-info">${escapeHtml(translatedType)}</span>
                </td>
                <td>
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="btn btn-sm btn-warning" onclick="openEditModal(${user.end_user_id})" title="Edit">
                            ✏️
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="openDeleteModal(${user.end_user_id})" title="Delete">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Open add modal
function openAddModal() {
    editingEndUserId = null;

    document.getElementById('modal-title').textContent = t('add_end_user');
    document.getElementById('end-user-name').value = '';

    // Populate dropdown with translated options
    const select = document.getElementById('end-user-type');
    select.innerHTML = USER_TYPES_CANONICAL.map(canonical => {
        const translated = translateUserType(canonical);
        return `<option value="${escapeHtml(canonical)}">${escapeHtml(translated)}</option>`;
    }).join('');

    document.getElementById('end-user-modal').style.display = 'flex';

    setTimeout(() => {
        document.getElementById('end-user-name').focus();
    }, 100);
}

// Open edit modal
function openEditModal(endUserId) {
    const user = endUsers.find(u => u.end_user_id === endUserId);

    if (!user) {
        showNotification(t('error_loading_end_users'), 'error');
        return;
    }

    editingEndUserId = endUserId;

    document.getElementById('modal-title').textContent = t('edit_user');
    document.getElementById('end-user-name').value = user.name;

    // Populate dropdown with translated options
    const select = document.getElementById('end-user-type');
    select.innerHTML = USER_TYPES_CANONICAL.map(canonical => {
        const translated = translateUserType(canonical);
        const selected = canonical === user.user_type ? 'selected' : '';
        return `<option value="${escapeHtml(canonical)}" ${selected}>${escapeHtml(translated)}</option>`;
    }).join('');

    document.getElementById('end-user-modal').style.display = 'flex';

    setTimeout(() => {
        document.getElementById('end-user-name').focus();
    }, 100);
}

// Close modal
function closeModal() {
    document.getElementById('end-user-modal').style.display = 'none';
    editingEndUserId = null;
}

// Save end user (add or edit)
async function saveEndUser() {
    const name = document.getElementById('end-user-name').value.trim();
    const userTypeCanonical = document.getElementById('end-user-type').value; // Already canonical English

    if (!name) {
        showNotification(t('name_required'), 'error');
        return;
    }

    if (!userTypeCanonical) {
        showNotification(t('user_type_required'), 'error');
        return;
    }

    const saveBtn = document.getElementById('save-btn');
    const originalHTML = saveBtn.innerHTML;

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `⏳ ${t('saving')}`;

        const url = editingEndUserId
            ? `/api/end-users/${editingEndUserId}`
            : '/api/end-users';

        const method = editingEndUserId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                user_type: userTypeCanonical  // Send canonical English to backend
            })
        });

        const result = await response.json();

        if (result.success) {
            const successMsg = editingEndUserId
                ? t('end_user_updated_success')
                : t('end_user_added_success');

            showNotification(successMsg, 'success');
            closeModal();
            await loadEndUsers();
        } else {
            throw new Error(result.message || 'Save failed');
        }
    } catch (error) {
        console.error('❌ Error saving end user:', error);
        const errorMsg = editingEndUserId
            ? t('error_updating_end_user')
            : t('error_adding_end_user');
        showNotification(errorMsg + ': ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
    }
}

// Open delete modal
function openDeleteModal(endUserId) {
    const user = endUsers.find(u => u.end_user_id === endUserId);

    if (!user) {
        showNotification(t('error_loading_end_users'), 'error');
        return;
    }

    deletingEndUserId = endUserId;
    document.getElementById('delete-end-user-name').textContent = user.name;
    document.getElementById('delete-modal').style.display = 'flex';
}

// Close delete modal
function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    deletingEndUserId = null;
}

// Confirm delete
async function confirmDelete() {
    if (!deletingEndUserId) return;

    const deleteBtn = document.getElementById('confirm-delete-btn');
    const originalHTML = deleteBtn.innerHTML;

    try {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = `⏳ ${t('deleting')}`;

        const response = await fetch(`/api/end-users/${deletingEndUserId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showNotification(t('end_user_deleted_success'), 'success');
            closeDeleteModal();
            await loadEndUsers();
        } else {
            throw new Error(result.message || 'Delete failed');
        }
    } catch (error) {
        console.error('❌ Error deleting end user:', error);
        showNotification(t('error_deleting_end_user') + ': ' + error.message, 'error');
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalHTML;
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show notification
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
        closeModal();
        closeDeleteModal();
    }
});

// Close modal on overlay click
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('popup-overlay')) {
        if (e.target.id === 'end-user-modal') {
            closeModal();
        } else if (e.target.id === 'delete-modal') {
            closeDeleteModal();
        }
    }
});

// Make functions globally accessible
window.initEndUsersPage = initEndUsersPage;
window.openAddModal = openAddModal;
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.saveEndUser = saveEndUser;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;

// Initialize
initEndUsersPage();