// User Management
console.log('✅ User Management script loaded');

let users = [];
let editingUserId = null;
let deletingUserId = null;
let currentUserId = null;

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
async function initUserManagementPage() {
    console.log('🚀 Initializing user management page...');
    await new Promise(resolve => setTimeout(resolve, 100));
    const hasAccess = await checkPermissions();

    if (hasAccess) {
        await loadUsers();
        attachEventHandlers();
    }
}

// Check permissions
async function checkPermissions() {
    try {
        const response = await fetch('/api/user-role');
        const data = await response.json();
        const role = data.role.toLowerCase();
        const isAdmin = (role === 'administrator' || role === 'hq');

        if (!isAdmin) {
            document.getElementById('access-denied').style.display = 'block';
            document.getElementById('users-content').style.display = 'none';
            return false;
        } else {
            document.getElementById('access-denied').style.display = 'none';
            document.getElementById('users-content').style.display = 'block';
            return true;
        }
    } catch (error) {
        console.error('Error checking permissions:', error);
        document.getElementById('access-denied').style.display = 'block';
        return false;
    }
}

// Attach event handlers
function attachEventHandlers() {
    const form = document.getElementById('user-form');
    if (form) {
        form.addEventListener('submit', saveUser);
    }
}

// Load users
async function loadUsers() {
    try {
        console.log('📥 Loading users...');
        const response = await fetch('/api/users');
        const result = await response.json();

        if (result.success) {
            users = result.data;
            currentUserId = result.current_user_id;
            console.log(`✅ Loaded ${users.length} users`);
            renderUsersTable();
        } else {
            showNotification(t('error-loading'), 'error');
        }
    } catch (error) {
        console.error('❌ Error loading users:', error);
        showNotification(t('error-loading') + ': ' + error.message, 'error');
        renderUsersTable();
    }
}

// Render users table
function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    const countEl = document.getElementById('user-count');

    if (countEl) {
        countEl.textContent = users.length;
    }

    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: #9CA3AF;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">👥</div>
                    <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">${t('no-users')}</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map((user, index) => {
        const roleColors = {
            'HQ': 'badge-success',
            'Coordinator': 'badge-primary',
            'Manager': 'badge-info',
            'Supervisor': 'badge-warning'
        };
        const roleClass = roleColors[user.role] || 'badge-secondary';
        const isCurrentUser = user.id === currentUserId;

        return `
        <tr ${isCurrentUser ? 'style="background: #F0F9FF;"' : ''}>
            <td style="text-align: center; font-weight: 600; color: #6B7280;">${index + 1}</td>
            <td>
                <div style="font-weight: 600; color: #1F3A8A;">
                    ${escapeHtml(user.username)}
                    ${isCurrentUser ? '<span class="badge badge-info" style="margin-left: 0.5rem;">YOU</span>' : ''}
                </div>
            </td>
            <td>
                <span class="badge ${roleClass}">${escapeHtml(user.role)}</span>
            </td>
            <td>
                <span style="font-size: 0.9rem; color: #6B7280;">${user.language.toUpperCase()}</span>
            </td>
            <td style="font-size: 0.9rem; color: #6B7280;">
                ${formatDate(user.created_at)}
            </td>
            <td>
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-sm btn-primary" onclick="editUser(${user.id})" title="${t('edit-user')}">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})" 
                        title="${t('delete_user')}" ${isCurrentUser ? 'disabled' : ''}>
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Open modal
function openUserModal() {
    console.log('📝 Opening user modal...');
    editingUserId = null;

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        const addNewText = document.querySelector('[data-i18n="add_new_user"]')?.textContent || 'Add New User';
        modalTitle.textContent = addNewText;
    }

    document.getElementById('user-form').reset();
    document.getElementById('user-id').value = '';
    document.getElementById('user-language').value = 'en';

    document.getElementById('user-password').required = true;
    document.getElementById('confirm-password').required = true;
    document.getElementById('password-required').style.display = 'inline';
    document.getElementById('confirm-password-required').style.display = 'inline';

    const modal = document.getElementById('user-modal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('username').focus(), 100);
    }
}

// Close modal
function closeUserModal() {
    const modal = document.getElementById('user-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    editingUserId = null;
}

// Edit user
function editUser(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) {
        showNotification(t('user-not-found'), 'error');
        return;
    }

    editingUserId = userId;

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        modalTitle.textContent = t('edit-user');
    }

    document.getElementById('user-id').value = user.id;
    document.getElementById('username').value = user.username;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-language').value = user.language || 'en';
    document.getElementById('user-password').value = '';
    document.getElementById('confirm-password').value = '';

    document.getElementById('user-password').required = false;
    document.getElementById('confirm-password').required = false;
    document.getElementById('password-required').style.display = 'none';
    document.getElementById('confirm-password-required').style.display = 'none';

    const modal = document.getElementById('user-modal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('username').focus(), 100);
    }
}

// Save user
async function saveUser(event) {
    event.preventDefault();

    const password = document.getElementById('user-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (password || confirmPassword) {
        if (password !== confirmPassword) {
            showNotification(t('passwords-no-match'), 'error');
            return;
        }
        if (password.length < 6) {
            showNotification(t('password-min'), 'error');
            return;
        }
    }

    if (!editingUserId && !password) {
        showNotification(t('password-min'), 'error');
        return;
    }

    const formData = {
        username: document.getElementById('username').value.trim(),
        role: document.getElementById('user-role').value,
        language: document.getElementById('user-language').value
    };

    if (password) {
        formData.password = password;
    }

    if (!formData.username || !formData.role) {
        showNotification(t('username-role-required'), 'error');
        return;
    }

    const saveBtn = document.getElementById('save-user-btn');
    const savingText = t('saving');
    const originalHTML = saveBtn.innerHTML;

    try {
        saveBtn.disabled = true;
        saveBtn.querySelector('[data-i18n="save_user"]').textContent = savingText;

        let response;
        if (editingUserId) {
            response = await fetch(`/api/users/${editingUserId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        } else {
            response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        }

        const result = await response.json();

        if (result.success) {
            showNotification(result.message || t('save_user'), 'success');
            closeUserModal();
            await loadUsers();
        } else {
            showNotification(result.message || t('error-saving'), 'error');
        }
    } catch (error) {
        console.error('❌ Error saving user:', error);
        showNotification(t('error-saving') + ': ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
    }
}

// Delete user
function deleteUser(userId) {
    if (userId === currentUserId) {
        showNotification(t('cannot-delete-self'), 'error');
        return;
    }

    const user = users.find(u => u.id === userId);
    if (!user) {
        showNotification(t('user-not-found'), 'error');
        return;
    }

    deletingUserId = userId;

    const userNameEl = document.getElementById('delete-user-name');
    if (userNameEl) {
        userNameEl.textContent = `${user.username} (${user.role})`;
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
    deletingUserId = null;
}

// Confirm delete
async function confirmDelete() {
    if (!deletingUserId) return;

    const deleteBtn = document.getElementById('confirm-delete-btn');
    const deletingText = t('deleting');
    const originalHTML = deleteBtn.innerHTML;

    try {
        deleteBtn.disabled = true;
        deleteBtn.querySelector('[data-i18n="delete_user"]').textContent = deletingText;

        const response = await fetch(`/api/users/${deletingUserId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showNotification(result.message || t('delete_user'), 'success');
            closeDeleteModal();
            await loadUsers();
        } else {
            showNotification(result.message || t('error-deleting'), 'error');
        }
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        showNotification(t('error-deleting') + ': ' + error.message, 'error');
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

// Close modals on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeUserModal();
        closeDeleteModal();
    }
});

// Close modals on overlay click
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('popup-overlay')) {
        closeUserModal();
        closeDeleteModal();
    }
});


// Make init function globally accessible for re-initialization
window.initUserManagementPage = initUserManagementPage;

// Initialize on first load
initUserManagementPage();