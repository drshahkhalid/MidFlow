// Projects Management
console.log('✅ Projects script loaded');

let projects = [];
let editingProjectId = null;
let deletingProjectId = null;

// Translation helper
function t(key) {
    const element = document.getElementById(`trans-${key}`);
    if (element) {
        return element.textContent;
    }
    // Fallback to window.i18n if available
    if (window.i18n && window.i18n.translations && window.i18n.translations[key]) {
        return window.i18n.translations[key];
    }
    console.warn(`⚠️ Translation missing for: ${key}`);
    return key;
}

// Initialize
async function initProjectsPage() {
    console.log('🚀 Initializing projects page...');
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadProjects();
    attachEventHandlers();
    checkPermissions();
}

// Check permissions
async function checkPermissions() {
    try {
        const response = await fetch('/api/user-role');
        const data = await response.json();
        const role = data.role.toLowerCase();
        const isAdmin = (role === 'administrator' || role === 'hq');

        const addBtn = document.getElementById('add-project-btn');
        if (addBtn && !isAdmin) {
            addBtn.disabled = true;
            addBtn.innerHTML = `🔒 ${t('admin-only')}`;
            addBtn.style.cursor = 'not-allowed';
        }
    } catch (error) {
        console.error('Error checking permissions:', error);
    }
}

// Attach event handlers
function attachEventHandlers() {
    const form = document.getElementById('project-form');
    if (form) {
        form.addEventListener('submit', saveProject);
    }

    const codeInput = document.getElementById('project-code');
    if (codeInput) {
        codeInput.addEventListener('input', function () {
            this.value = this.value.toUpperCase();
        });
    }
}

// Load projects
async function loadProjects() {
    try {
        console.log('📥 Loading projects...');
        const response = await fetch('/api/projects');
        const result = await response.json();

        if (result.success) {
            projects = result.data;
            console.log(`✅ Loaded ${projects.length} projects`);
            renderProjectsTable();
        } else {
            showNotification(t('error-loading'), 'error');
        }
    } catch (error) {
        console.error('❌ Error loading projects:', error);
        showNotification(t('error-loading') + ': ' + error.message, 'error');
        renderProjectsTable(); // Show empty state
    }
}

// Render projects table
function renderProjectsTable() {
    const tbody = document.getElementById('projects-table-body');
    const countEl = document.getElementById('project-count');

    if (countEl) {
        countEl.textContent = projects.length;
    }

    if (!tbody) return;

    if (projects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: #9CA3AF;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📋</div>
                    <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">${t('no-projects')}</p>
                    <p style="font-size: 0.9rem;">${t('click-add')}</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = projects.map((project, index) => `
        <tr>
            <td style="text-align: center; font-weight: 600; color: #6B7280;">${index + 1}</td>
            <td>
                <div style="font-weight: 600; color: #1F3A8A;">${escapeHtml(project.project_name)}</div>
            </td>
            <td>
                <span class="badge badge-info">${escapeHtml(project.project_code)}</span>
            </td>
            <td>
                <div style="color: #6B7280; font-size: 0.9rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${project.description ? escapeHtml(project.description) : `<em style="color: #9CA3AF;">${t('no-description')}</em>`}
                </div>
            </td>
            <td style="font-size: 0.9rem; color: #6B7280;">
                ${project.created_by_name || t('unknown')}
            </td>
            <td>
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-sm btn-primary" onclick="editProject(${project.id})" title="${t('edit_project')}">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProject(${project.id})" title="${t('delete_project')}">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Open modal
function openProjectModal() {
    editingProjectId = null;

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        const addNewText = document.querySelector('[data-i18n="add_new_project"]')?.textContent || 'Add New Project';
        modalTitle.textContent = addNewText;
    }

    document.getElementById('project-form').reset();
    document.getElementById('project-id').value = '';

    const modal = document.getElementById('project-modal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('project-name').focus(), 100);
    }
}

// Close modal
function closeProjectModal() {
    const modal = document.getElementById('project-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    editingProjectId = null;
}

// Edit project
function editProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) {
        showNotification(t('project-not-found'), 'error');
        return;
    }

    editingProjectId = projectId;

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        const editText = t('edit-project');
        modalTitle.textContent = editText;
    }

    document.getElementById('project-id').value = project.id;
    document.getElementById('project-name').value = project.project_name;
    document.getElementById('project-code').value = project.project_code;
    document.getElementById('project-description').value = project.description || '';

    const modal = document.getElementById('project-modal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('project-name').focus(), 100);
    }
}

// Save project
async function saveProject(event) {
    event.preventDefault();

    const formData = {
        project_name: document.getElementById('project-name').value.trim(),
        project_code: document.getElementById('project-code').value.trim().toUpperCase(),
        description: document.getElementById('project-description').value.trim()
    };

    // Validate
    if (!formData.project_name || !formData.project_code) {
        showNotification(t('name-code-required'), 'error');
        return;
    }

    const saveBtn = document.getElementById('save-project-btn');
    const savingText = t('saving');
    const originalHTML = saveBtn.innerHTML;

    try {
        saveBtn.disabled = true;
        saveBtn.querySelector('[data-i18n="save_project"]').textContent = savingText;

        let response;
        if (editingProjectId) {
            // Update
            response = await fetch(`/api/projects/${editingProjectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        } else {
            // Create
            response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
        }

        const result = await response.json();

        if (result.success) {
            showNotification(result.message || t('save_project'), 'success');
            closeProjectModal();
            await loadProjects();
        } else {
            showNotification(result.message || t('error-saving'), 'error');
        }
    } catch (error) {
        console.error('❌ Error saving project:', error);
        showNotification(t('error-saving') + ': ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
    }
}

// Delete project
function deleteProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) {
        showNotification(t('project-not-found'), 'error');
        return;
    }

    deletingProjectId = projectId;

    const projectNameEl = document.getElementById('delete-project-name');
    if (projectNameEl) {
        projectNameEl.textContent = `${project.project_name} (${project.project_code})`;
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
    deletingProjectId = null;
}

// Confirm delete
async function confirmDelete() {
    if (!deletingProjectId) return;

    const deleteBtn = document.getElementById('confirm-delete-btn');
    const deletingText = t('deleting');
    const originalHTML = deleteBtn.innerHTML;

    try {
        deleteBtn.disabled = true;
        deleteBtn.querySelector('[data-i18n="delete_project"]').textContent = deletingText;

        const response = await fetch(`/api/projects/${deletingProjectId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showNotification(result.message || t('delete_project'), 'success');
            closeDeleteModal();
            await loadProjects();
        } else {
            showNotification(result.message || t('error-deleting'), 'error');
        }
    } catch (error) {
        console.error('❌ Error deleting project:', error);
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
        closeProjectModal();
        closeDeleteModal();
    }
});

// Close modals on overlay click
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('popup-overlay')) {
        closeProjectModal();
        closeDeleteModal();
    }
});

// Initialize
initProjectsPage();