// Third Parties Management
console.log('✅ Third Parties script loaded');

let thirdParties = [];
let editingThirdPartyId = null;
let deletingThirdPartyId = null;

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

// Canonical third party types (stored in database - always English)
const THIRD_PARTY_TYPES_CANONICAL = [
    'MSF-Same Section',
    'MSF-Other Section',
    'Non-MSF',
    'MOH'
];

// Translate third party type from canonical English to display language
function translateThirdPartyType(canonical) {
    const map = {
        'MSF-Same Section': t('third_party_type_msf_same'),
        'MSF-Other Section': t('third_party_type_msf_other'),
        'Non-MSF': t('third_party_type_non_msf'),
        'MOH': t('third_party_type_moh')
    };
    return map[canonical] || canonical;
}

// Reverse translate: display language back to canonical English
function reverseTranslateThirdPartyType(translated) {
    const reverseMap = {};
    THIRD_PARTY_TYPES_CANONICAL.forEach(canonical => {
        const display = translateThirdPartyType(canonical);
        reverseMap[display.toLowerCase()] = canonical;
    });
    return reverseMap[translated.toLowerCase()] || translated;
}

// Initialize
async function initThirdPartiesPage() {
    console.log('🚀 Initializing third parties page...');
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadThirdParties();
}

// Load third parties
async function loadThirdParties() {
    const tbody = document.getElementById('third-parties-table-body');
    const countEl = document.getElementById('third-parties-count');

    try {
        console.log('📥 Loading third parties...');

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: #9CA3AF;">
                        <span>⏳ ${t('loading_third_parties')}</span>
                    </td>
                </tr>
            `;
        }

        const response = await fetch('/api/third-parties');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('📦 API Response:', result);

        if (result.success) {
            thirdParties = result.third_parties || [];
            console.log(`✅ Loaded ${thirdParties.length} third parties`);
            renderThirdPartiesTable();

            if (countEl) {
                countEl.textContent = thirdParties.length;
            }
        } else {
            throw new Error(result.message || 'Failed to load third parties');
        }
    } catch (error) {
        console.error('❌ Error loading third parties:', error);

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: #EF4444;">
                        <div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
                        <p style="font-weight: 600;">${t('error_loading_third_parties')}</p>
                        <p style="font-size: 0.9rem; color: #991B1B;">${error.message}</p>
                    </td>
                </tr>
            `;
        }

        if (countEl) {
            countEl.textContent = '0';
        }

        showNotification(t('error_loading_third_parties') + ': ' + error.message, 'error');
    }
}

// Render table
function renderThirdPartiesTable() {
    const tbody = document.getElementById('third-parties-table-body');

    if (!tbody) return;

    if (thirdParties.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem; color: #9CA3AF;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🏢</div>
                    <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">${t('no_third_parties_found')}</p>
                    <p style="font-size: 0.9rem;">${t('click_add_first_third_party')}</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = thirdParties.map((party, index) => {
        // Translate type for display
        const translatedType = translateThirdPartyType(party.type);

        return `
            <tr>
                <td style="text-align: center; font-weight: 600; color: #6B7280;">${index + 1}</td>
                <td style="font-weight: 600; color: #1F3A8A;">
                    <span style="font-size: 1.2rem; margin-right: 0.5rem;">🏢</span>
                    ${escapeHtml(party.name)}
                </td>
                <td>
                    <span class="badge badge-info">${escapeHtml(translatedType)}</span>
                </td>
                <td>${escapeHtml(party.city || '-')}</td>
                <td>${escapeHtml(party.contact_person || '-')}</td>
                <td style="color: #2563EB;">${escapeHtml(party.email || '-')}</td>
                <td style="font-family: monospace;">${escapeHtml(party.phone || '-')}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="btn btn-sm btn-warning" onclick="openEditModal(${party.third_party_id})" title="Edit">
                            ✏️
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="openDeleteModal(${party.third_party_id})" title="Delete">
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
    editingThirdPartyId = null;

    document.getElementById('modal-title').textContent = t('add_third_party');
    document.getElementById('third-party-name').value = '';
    document.getElementById('third-party-city').value = '';
    document.getElementById('third-party-address').value = '';
    document.getElementById('third-party-contact').value = '';
    document.getElementById('third-party-email').value = '';
    document.getElementById('third-party-phone').value = '';

    // Populate dropdown with translated options
    const select = document.getElementById('third-party-type');
    select.innerHTML = THIRD_PARTY_TYPES_CANONICAL.map(canonical => {
        const translated = translateThirdPartyType(canonical);
        return `<option value="${escapeHtml(canonical)}">${escapeHtml(translated)}</option>`;
    }).join('');

    document.getElementById('third-party-modal').style.display = 'flex';

    setTimeout(() => {
        document.getElementById('third-party-name').focus();
    }, 100);
}

// Open edit modal
function openEditModal(thirdPartyId) {
    const party = thirdParties.find(p => p.third_party_id === thirdPartyId);

    if (!party) {
        showNotification(t('error_loading_third_parties'), 'error');
        return;
    }

    editingThirdPartyId = thirdPartyId;

    document.getElementById('modal-title').textContent = t('edit_third_party');
    document.getElementById('third-party-name').value = party.name;
    document.getElementById('third-party-city').value = party.city || '';
    document.getElementById('third-party-address').value = party.address || '';
    document.getElementById('third-party-contact').value = party.contact_person || '';
    document.getElementById('third-party-email').value = party.email || '';
    document.getElementById('third-party-phone').value = party.phone || '';

    // Populate dropdown with translated options
    const select = document.getElementById('third-party-type');
    select.innerHTML = THIRD_PARTY_TYPES_CANONICAL.map(canonical => {
        const translated = translateThirdPartyType(canonical);
        const selected = canonical === party.type ? 'selected' : '';
        return `<option value="${escapeHtml(canonical)}" ${selected}>${escapeHtml(translated)}</option>`;
    }).join('');

    document.getElementById('third-party-modal').style.display = 'flex';

    setTimeout(() => {
        document.getElementById('third-party-name').focus();
    }, 100);
}

// Close modal
function closeModal() {
    document.getElementById('third-party-modal').style.display = 'none';
    editingThirdPartyId = null;
}

// Save third party (add or edit)
async function saveThirdParty() {
    const name = document.getElementById('third-party-name').value.trim();
    const typeCanonical = document.getElementById('third-party-type').value; // Already canonical English
    const city = document.getElementById('third-party-city').value.trim();
    const address = document.getElementById('third-party-address').value.trim();
    const contactPerson = document.getElementById('third-party-contact').value.trim();
    const email = document.getElementById('third-party-email').value.trim();
    const phone = document.getElementById('third-party-phone').value.trim();

    if (!name) {
        showNotification(t('name_required'), 'error');
        return;
    }

    if (!typeCanonical) {
        showNotification(t('type_required'), 'error');
        return;
    }

    const saveBtn = document.getElementById('save-btn');
    const originalHTML = saveBtn.innerHTML;

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `⏳ ${t('saving')}`;

        const url = editingThirdPartyId
            ? `/api/third-parties/${editingThirdPartyId}`
            : '/api/third-parties';

        const method = editingThirdPartyId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                type: typeCanonical,  // Send canonical English to backend
                city: city,
                address: address,
                contact_person: contactPerson,
                email: email,
                phone: phone
            })
        });

        const result = await response.json();

        if (result.success) {
            const successMsg = editingThirdPartyId
                ? t('third_party_updated_success')
                : t('third_party_added_success');

            showNotification(successMsg, 'success');
            closeModal();
            await loadThirdParties();
        } else {
            throw new Error(result.message || 'Save failed');
        }
    } catch (error) {
        console.error('❌ Error saving third party:', error);
        const errorMsg = editingThirdPartyId
            ? t('error_updating_third_party')
            : t('error_adding_third_party');
        showNotification(errorMsg + ': ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
    }
}

// Open delete modal
function openDeleteModal(thirdPartyId) {
    const party = thirdParties.find(p => p.third_party_id === thirdPartyId);

    if (!party) {
        showNotification(t('error_loading_third_parties'), 'error');
        return;
    }

    deletingThirdPartyId = thirdPartyId;
    document.getElementById('delete-third-party-name').textContent = party.name;
    document.getElementById('delete-modal').style.display = 'flex';
}

// Close delete modal
function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    deletingThirdPartyId = null;
}

// Confirm delete
async function confirmDelete() {
    if (!deletingThirdPartyId) return;

    const deleteBtn = document.getElementById('confirm-delete-btn');
    const originalHTML = deleteBtn.innerHTML;

    try {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = `⏳ ${t('deleting')}`;

        const response = await fetch(`/api/third-parties/${deletingThirdPartyId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showNotification(t('third_party_deleted_success'), 'success');
            closeDeleteModal();
            await loadThirdParties();
        } else {
            throw new Error(result.message || 'Delete failed');
        }
    } catch (error) {
        console.error('❌ Error deleting third party:', error);
        showNotification(t('error_deleting_third_party') + ': ' + error.message, 'error');
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
        if (e.target.id === 'third-party-modal') {
            closeModal();
        } else if (e.target.id === 'delete-modal') {
            closeDeleteModal();
        }
    }
});

// Make functions globally accessible
window.initThirdPartiesPage = initThirdPartiesPage;
window.openAddModal = openAddModal;
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.saveThirdParty = saveThirdParty;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;

// Initialize
initThirdPartiesPage();