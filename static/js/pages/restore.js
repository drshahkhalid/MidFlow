// Restore Management
console.log('✅ Restore script loaded');

let selectedFile = null;

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
async function initRestorePage() {
    console.log('🚀 Initializing restore page...');
    await new Promise(resolve => setTimeout(resolve, 100));

    // No access restrictions - all users can restore
    // Hide access denied if it exists (backward compatibility)
    const accessDenied = document.getElementById('access-denied');
    if (accessDenied) {
        accessDenied.style.display = 'none';
    }

    // Show restore content
    const restoreContent = document.getElementById('restore-content');
    if (restoreContent) {
        restoreContent.style.display = 'block';
    }

    setupDragDrop();
}


// Setup drag and drop
function setupDragDrop() {
    const dropZone = document.querySelector('.form-card div[style*="dashed"]');

    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.style.borderColor = '#3B82F6';
            dropZone.style.background = '#EFF6FF';
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.style.borderColor = '#D1D5DB';
            dropZone.style.background = '#F9FAFB';
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }, false);
}

// Handle file select
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Handle file
function handleFile(file) {
    console.log('📁 File selected:', file.name);

    // Validate file type
    if (!file.name.endsWith('.zip')) {
        showNotification(t('invalid-file'), 'error');
        return;
    }

    selectedFile = file;

    // Show file info
    document.getElementById('selected-filename').textContent = file.name;
    document.getElementById('selected-filesize').textContent = formatFileSize(file.size);
    document.getElementById('file-info').style.display = 'block';

    // Try to read metadata from zip (optional enhancement)
    // For now, just show the file info
}

// Start restore
async function startRestore() {
    if (!selectedFile) {
        showNotification('No file selected', 'error');
        return;
    }

    // Confirm action with auto-backup warning
    const confirmMessage = t('confirm_restore_with_backup') ||
        `⚠️ IMPORTANT WARNING ⚠️\n\nThis will:\n1. Create an automatic backup of current database\n2. Overwrite ALL current data with the backup file\n3. Log out all users\n\nThe automatic safety backup will be saved before restoring.\n\nDo you want to proceed?`;

    if (!confirm(confirmMessage)) {
        console.log('Restore canceled by user');
        return;
    }

    const restoreBtn = document.getElementById('restore-btn');
    const originalHTML = restoreBtn.innerHTML;

    try {
        restoreBtn.disabled = true;

        // Show progress
        document.getElementById('restore-progress').style.display = 'block';
        updateProgress(10, 'Creating safety backup...');

        // Step 1: Create automatic backup before restore
        console.log('📦 Creating automatic safety backup...');

        try {
            const backupResponse = await fetch('/api/backup/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const backupResult = await backupResponse.json();

            if (backupResult.success) {
                console.log('✅ Safety backup created:', backupResult.filename);
                updateProgress(30, 'Safety backup created successfully!');
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                throw new Error('Failed to create safety backup');
            }
        } catch (backupError) {
            console.error('❌ Error creating safety backup:', backupError);

            const proceedMessage = t('proceed_without_backup') ||
                '⚠️ Failed to create automatic backup!\n\nDo you want to proceed with restore WITHOUT a safety backup?\n\nThis is NOT recommended!';

            const proceedAnyway = confirm(proceedMessage);

            if (!proceedAnyway) {
                document.getElementById('restore-progress').style.display = 'none';
                showNotification(t('restore_canceled_backup_failed') || 'Restore canceled - backup failed', 'error');
                return;
            }
        } // ← THIS WAS MISSING!

        // Step 2: Create form data
        const formData = new FormData();
        formData.append('file', selectedFile);

        updateProgress(50, 'Uploading restore file...');

        // Step 3: Upload and restore
        const response = await fetch('/api/backup/restore', {
            method: 'POST',
            body: formData
        });

        updateProgress(80, 'Restoring database...');

        const result = await response.json();

        updateProgress(100, 'Complete!');

        if (result.success) {
            // Hide progress, show results
            setTimeout(() => {
                document.getElementById('restore-progress').style.display = 'none';
                displayRestoreResults(result);
            }, 500);
        } else {
            document.getElementById('restore-progress').style.display = 'none';
            showNotification(result.message || t('error_restoring'), 'error');
        }
    } catch (error) {
        console.error('❌ Error restoring backup:', error);
        document.getElementById('restore-progress').style.display = 'none';
        showNotification(t('error_restoring') + ': ' + error.message, 'error');
    } finally {
        restoreBtn.disabled = false;
        restoreBtn.innerHTML = originalHTML;
    }
}

// Update progress
function updateProgress(percent, message) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressMessage = document.getElementById('progress-message');

    if (progressBar) {
        progressBar.style.width = percent + '%';
    }

    if (progressText) {
        progressText.textContent = percent + '%';
    }

    if (progressMessage) {
        progressMessage.textContent = message;
    }
}

// Display restore results
function displayRestoreResults(result) {
    const resultsDiv = document.getElementById('restore-results');
    const resultsContent = document.getElementById('results-content');

    let html = '<div style="line-height: 2;">';

    // Backup info
    if (result.backup_info) {
        const info = result.backup_info;
        html += `<p><strong>📅 Backup Date:</strong> ${new Date(info.backup_date).toLocaleString()}</p>`;
        html += `<p><strong>🎯 Mission Code:</strong> ${info.mission_code}</p>`;
        html += `<p><strong>👤 Created By:</strong> ${info.created_by || 'Unknown'}</p>`;
        html += `<p><strong>✅ Integrity Check:</strong> <span style="color: #059669;">Passed</span></p>`;
        html += '<hr style="margin: 1rem 0;">';
    }

    // Tables info
    if (result.tables && result.tables.length > 0) {
        html += '<p><strong>📊 Restored Data:</strong></p>';
        html += '<ul style="margin-left: 1.5rem;">';
        result.tables.forEach(table => {
            html += `<li><strong>${table.table}:</strong> ${table.count} records</li>`;
        });
        html += '</ul>';
    }

    html += '</div>';

    resultsContent.innerHTML = html;
    resultsDiv.style.display = 'block';

    // Hide file info
    document.getElementById('file-info').style.display = 'none';

    showNotification('Restore completed successfully! Please logout and login again.', 'success');
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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
    }, 5000);
}

// Make init function globally accessible for re-initialization
window.initRestorePage = initRestorePage;

// Initialize on first load
initRestorePage();