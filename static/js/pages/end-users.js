// End Users Management
console.log('✅ End Users script loaded');

let endUsers = [];
let editingEndUserId  = null;
let deletingEndUserId = null;

// Translation helper
function t(key) {
    if (window.i18n && window.i18n.translations && window.i18n.translations[key]) {
        return window.i18n.translations[key];
    }
    return key;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function initEndUsersPage() {
    console.log('🚀 Initializing end users page...');
    await new Promise(resolve => setTimeout(resolve, 100));
    await euLoadEndUsers();
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function euLoadEndUsers() {
    const tbody   = document.getElementById('end-users-table-body');
    const countEl = document.getElementById('end-users-count');
    try {
        console.log('📥 Loading end users...');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:#9CA3AF">⏳ ${t('loading_end_users')}</td></tr>`;

        const response = await fetch('/api/end-users');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        console.log('📦 API Response:', result);

        if (result.success) {
            endUsers = result.end_users || [];
            console.log(`✅ Loaded ${endUsers.length} end users`);
            euRenderTable();
            if (countEl) countEl.textContent = endUsers.length;
        } else {
            throw new Error(result.message || 'Failed to load end users');
        }
    } catch (error) {
        console.error('❌ Error loading end users:', error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:#EF4444">❌ ${error.message}</td></tr>`;
        if (countEl) countEl.textContent = '0';
    }
}

// ── Render table ──────────────────────────────────────────────────────────────
function euRenderTable() {
    const tbody = document.getElementById('end-users-table-body');
    if (!tbody) return;
    if (endUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:3rem;color:#9CA3AF">
            <div style="font-size:3rem;margin-bottom:1rem">👥</div>
            <p>${t('no_end_users_found')}</p>
        </td></tr>`;
        return;
    }
    tbody.innerHTML = endUsers.map((user, i) => `
        <tr>
            <td style="text-align:center;font-weight:600;color:#6B7280">${i + 1}</td>
            <td style="font-weight:600;color:#1F3A8A">👤 ${euEsc(user.name)}</td>
            <td style="color:#6B7280;font-size:.9rem">${euEsc(user.user_type || '—')}</td>
            <td>
                <div style="display:flex;gap:.5rem;justify-content:center">
                    <button class="btn btn-sm btn-warning" onclick="euOpenEditModal(${user.end_user_id})" title="Edit">✏️</button>
                    <button class="btn btn-sm btn-danger"  onclick="euOpenDeleteModal(${user.end_user_id})" title="Delete">🗑️</button>
                </div>
            </td>
        </tr>`).join('');
}

// ── Add modal ──────────────────────────────────────────────────────────────────
function euOpenAddModal() {
    editingEndUserId = null;
    document.getElementById('modal-title').textContent        = t('add_end_user');
    document.getElementById('end-user-name').value            = '';
    document.getElementById('end-user-description').value     = '';
    document.getElementById('end-user-modal').style.display   = 'flex';
    setTimeout(() => document.getElementById('end-user-name').focus(), 100);
}

// ── Edit modal ─────────────────────────────────────────────────────────────────
function euOpenEditModal(endUserId) {
    const user = endUsers.find(u => u.end_user_id === endUserId);
    if (!user) return;
    editingEndUserId = endUserId;
    document.getElementById('modal-title').textContent        = t('edit_user');
    document.getElementById('end-user-name').value            = user.name;
    document.getElementById('end-user-description').value     = user.user_type || '';
    document.getElementById('end-user-modal').style.display   = 'flex';
    setTimeout(() => document.getElementById('end-user-name').focus(), 100);
}

// ── Close modal ────────────────────────────────────────────────────────────────
function euCloseModal() {
    document.getElementById('end-user-modal').style.display = 'none';
    editingEndUserId = null;
}

// ── Save ───────────────────────────────────────────────────────────────────────
async function euSaveEndUser() {
    const name        = document.getElementById('end-user-name').value.trim();
    const description = document.getElementById('end-user-description').value.trim();
    if (!name) { euNotify(t('name_required'), 'error'); return; }

    const saveBtn = document.getElementById('save-btn');
    const orig    = saveBtn.innerHTML;
    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `⏳ ${t('saving')}`;

        const url    = editingEndUserId ? `/api/end-users/${editingEndUserId}` : '/api/end-users';
        const method = editingEndUserId ? 'PUT' : 'POST';
        const resp   = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, user_type: description }),
        });
        const result = await resp.json();
        if (result.success) {
            euNotify(editingEndUserId ? t('end_user_updated_success') : t('end_user_added_success'), 'success');
            euCloseModal();
            await euLoadEndUsers();
        } else {
            throw new Error(result.message || 'Save failed');
        }
    } catch (error) {
        console.error('❌ Error saving end user:', error);
        euNotify((editingEndUserId ? t('error_updating_end_user') : t('error_adding_end_user')) + ': ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = orig;
    }
}

// ── Delete modal ───────────────────────────────────────────────────────────────
function euOpenDeleteModal(endUserId) {
    const user = endUsers.find(u => u.end_user_id === endUserId);
    if (!user) return;
    deletingEndUserId = endUserId;
    document.getElementById('delete-end-user-name').textContent = user.name;
    document.getElementById('delete-modal').style.display = 'flex';
}

function euCloseDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    deletingEndUserId = null;
}

async function euConfirmDelete() {
    if (!deletingEndUserId) return;
    const btn  = document.getElementById('confirm-delete-btn');
    const orig = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = `⏳ ${t('deleting')}`;
        const resp   = await fetch(`/api/end-users/${deletingEndUserId}`, { method: 'DELETE' });
        const result = await resp.json();
        if (result.success) {
            euNotify(t('end_user_deleted_success'), 'success');
            euCloseDeleteModal();
            await euLoadEndUsers();
        } else {
            throw new Error(result.message || 'Delete failed');
        }
    } catch (error) {
        console.error('❌ Error deleting end user:', error);
        euNotify(t('error_deleting_end_user') + ': ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function euEsc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function euNotify(message, type = 'info') {
    console.log(`📢 [${type}] ${message}`);
    const bg  = type==='error'?'#FEE2E2':type==='success'?'#D1FAE5':'#FEF3C7';
    const col = type==='error'?'#991B1B':type==='success'?'#065F46':'#92400E';
    const ic  = type==='error'?'❌':type==='success'?'✅':'ℹ️';
    const el  = document.createElement('div');
    el.style.cssText = `position:fixed;top:90px;right:20px;z-index:1001;padding:1rem 1.5rem;
        background:${bg};color:${col};border:2px solid ${col};border-radius:8px;
        box-shadow:0 4px 12px rgba(0,0,0,.15);display:flex;align-items:center;gap:.75rem;max-width:400px`;
    el.innerHTML = `<span style="font-size:1.5rem">${ic}</span><span>${message}</span>`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.animation = 'slideOut .3s ease-out'; setTimeout(() => el.remove(), 300); }, 4000);
}

// ── Keyboard / overlay close ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { euCloseModal(); euCloseDeleteModal(); }
});
document.addEventListener('click', e => {
    if (e.target.id === 'end-user-modal') euCloseModal();
    else if (e.target.id === 'delete-modal') euCloseDeleteModal();
});

// ── Global exports ────────────────────────────────────────────────────────────
window.initEndUsersPage   = initEndUsersPage;
window.euOpenAddModal     = euOpenAddModal;
window.euOpenEditModal    = euOpenEditModal;
window.euCloseModal       = euCloseModal;
window.euSaveEndUser      = euSaveEndUser;
window.euOpenDeleteModal  = euOpenDeleteModal;
window.euCloseDeleteModal = euCloseDeleteModal;
window.euConfirmDelete    = euConfirmDelete;

// ── Boot ──────────────────────────────────────────────────────────────────────
initEndUsersPage();
