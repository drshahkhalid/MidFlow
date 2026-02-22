// Mission Details Management
console.log('✅ Mission Details script loaded');

let currentMissionId = null;
let isEditMode = false;
let canUpdate = false;

// Main initialization
async function initMissionDetailsPage() {
    console.log('🚀 Initializing mission details page...');
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadMissionDetails();
    attachFormHandlers();
}

// Attach form handlers
function attachFormHandlers() {
    console.log('📝 Attaching form handlers...');

    const form = document.getElementById('mission-details-form');
    if (form) {
        form.addEventListener('submit', saveMissionDetails);
        console.log('✅ Form submit handler attached');
    } else {
        console.error('❌ Form not found!');
        return;
    }

    // Auto-uppercase abbreviation
    const abbreviationInput = document.getElementById('mission-abbreviation');
    if (abbreviationInput) {
        abbreviationInput.addEventListener('input', function () {
            this.value = this.value.toUpperCase();
        });
    }
}

// Load mission details
async function loadMissionDetails() {
    try {
        console.log('🔍 Fetching mission details...');
        const response = await fetch('/api/mission-details');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('📦 API Response:', result);

        if (result.success && result.data) {
            console.log('✅ Mission found!');
            currentMissionId = result.data.id;
            isEditMode = true;

            populateMissionForm(result.data);
            updateStatusBadge('success');

            await checkUpdatePermission();
        } else {
            console.log('⚠️ No mission configured');
            isEditMode = false;
            currentMissionId = null;
            canUpdate = true;

            updateStatusBadge('error');
        }
    } catch (error) {
        console.error('❌ Error loading mission details:', error);
        showNotification('Error loading mission details: ' + error.message, 'error');
    }
}

// Update status badge
function updateStatusBadge(status) {
    const badge = document.getElementById('mission-status-badge');
    if (!badge) return;

    if (status === 'success') {
        badge.className = 'badge badge-success';
        const configuredText = document.querySelector('[data-i18n="configured"]')?.textContent || 'Configured';
        badge.innerHTML = `✅ ${configuredText}`;
    } else if (status === 'error') {
        badge.className = 'badge badge-error';
        // Badge already has proper data-i18n in HTML
        badge.querySelector('[data-i18n="not_configured"]').style.display = 'inline';
    }
    badge.style.display = 'inline-block';
}

// Check permissions
async function checkUpdatePermission() {
    try {
        const response = await fetch('/api/user-role');
        const data = await response.json();
        const role = data.role.toLowerCase();
        canUpdate = (role === 'administrator' || role === 'hq');

        if (!canUpdate) {
            console.log('🔒 User cannot update');
            disableFormFields();
        } else {
            enableFormFields();
        }
    } catch (error) {
        console.error('❌ Error checking permissions:', error);
        canUpdate = true;
    }
}

// Disable form
function disableFormFields() {
    const form = document.getElementById('mission-details-form');
    if (!form) return;

    form.querySelectorAll('input').forEach(input => {
        if (input.type !== 'hidden') {
            input.disabled = true;
            input.style.backgroundColor = '#F3F4F6';
            input.style.cursor = 'not-allowed';
        }
    });

    const submitBtn = document.getElementById('save-mission-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        const restrictedText = document.querySelector('[data-i18n="update_restricted_admin"]')?.textContent || 'Update Restricted to Administrators';
        submitBtn.innerHTML = `🔒 ${restrictedText}`;
        submitBtn.classList.remove('btn-success');
        submitBtn.classList.add('btn-secondary');
    }
}

// Enable form (for admins)
function enableFormFields() {
    const form = document.getElementById('mission-details-form');
    if (!form) return;

    form.querySelectorAll('input').forEach(input => {
        if (input.type !== 'hidden') {
            input.disabled = false;
            input.style.backgroundColor = '';
            input.style.cursor = '';
        }
    });

    const submitBtn = document.getElementById('save-mission-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        const saveText = document.querySelector('[data-i18n="save_mission_details"]')?.textContent || 'Save Mission Details';
        submitBtn.innerHTML = `💾 ${saveText}`;
        submitBtn.classList.remove('btn-secondary');
        submitBtn.classList.add('btn-success');
    }
}

// Populate form
function populateMissionForm(data) {
    console.log('📝 Populating form:', data);

    const fields = {
        'mission-id': data.id,
        'mission-name': data.mission_name,
        'mission-abbreviation': data.mission_abbreviation,
        'lead-time': data.lead_time_months || 0,
        'cover-period': data.cover_period_months || 0,
        'security-stock': data.security_stock_months || 0
    };

    Object.keys(fields).forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.value = fields[fieldId] !== null ? fields[fieldId] : '';
        }
    });
}

// Save mission
async function saveMissionDetails(event) {
    event.preventDefault();

    if (isEditMode && !canUpdate) {
        showNotification('Only administrators can update mission details', 'error');
        return;
    }

    const formData = {
        mission_name: document.getElementById('mission-name').value.trim(),
        mission_abbreviation: document.getElementById('mission-abbreviation').value.trim().toUpperCase(),
        lead_time_months: parseInt(document.getElementById('lead-time').value) || 0,
        cover_period_months: parseInt(document.getElementById('cover-period').value) || 0,
        security_stock_months: parseInt(document.getElementById('security-stock').value) || 0
    };

    // Validate
    if (!formData.mission_name || !formData.mission_abbreviation || !formData.cover_period_months) {
        showNotification('Please fill in all required fields (marked with *)', 'error');
        return;
    }

    if (formData.lead_time_months < 0 || formData.lead_time_months > 36) {
        showNotification('Lead Time must be between 0 and 36 months', 'error');
        return;
    }

    if (formData.cover_period_months < 0 || formData.cover_period_months > 36) {
        showNotification('Cover Period must be between 0 and 36 months', 'error');
        return;
    }

    if (formData.security_stock_months < 0 || formData.security_stock_months > 36) {
        showNotification('Security Stock must be between 0 and 36 months', 'error');
        return;
    }

    const wasFirstTimeSetup = !isEditMode;

    try {
        const saveBtn = document.getElementById('save-mission-btn');
        const savingText = document.querySelector('[data-i18n="saving"]')?.textContent || 'Saving...';

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `⏳ ${savingText}`;
        }

        let response;
        if (isEditMode && currentMissionId) {
            response = await fetch(`/api/mission-details/${currentMissionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        } else {
            response = await fetch('/api/mission-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        }

        const result = await response.json();

        if (result.success) {
            showNotification(result.message || 'Mission details saved!', 'success');

            // Reload mission details to refresh the page state
            await loadMissionDetails();

            if (wasFirstTimeSetup) {
                // First-time setup - redirect to dashboard after delay
                setTimeout(() => {
                    showNotification('Setup complete! Redirecting...', 'success');
                    setTimeout(() => {
                        if (typeof loadPage === 'function') {
                            loadPage('dashboard');
                        } else {
                            window.location.href = '/';
                        }
                    }, 1000);
                }, 1500);
            }
        } else {
            showNotification(result.message || 'Error saving', 'error');
            if (saveBtn) {
                saveBtn.disabled = false;
                const saveText = document.querySelector('[data-i18n="save_mission_details"]')?.textContent || 'Save Mission Details';
                saveBtn.innerHTML = `💾 ${saveText}`;
            }
        }
    } catch (error) {
        console.error('❌ Error saving:', error);
        showNotification('Error: ' + error.message, 'error');

        const saveBtn = document.getElementById('save-mission-btn');
        if (saveBtn) {
            saveBtn.disabled = false;
            const saveText = document.querySelector('[data-i18n="save_mission_details"]')?.textContent || 'Save Mission Details';
            saveBtn.innerHTML = `💾 ${saveText}`;
        }
    }
}

// Notification
function showNotification(message, type = 'info') {
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
        animation: slideIn 0.3s ease-out;
    `;

    notification.innerHTML = `<span style="font-size: 1.5rem;">${icon}</span><span>${message}</span>`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Initialize
initMissionDetailsPage();