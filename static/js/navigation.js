// Navigation.js - Handles page loading and navigation
console.log('✅ Navigation.js loaded');

// Load page content dynamically
async function loadPage(pageName) {
    console.log(`📄 Loading page: ${pageName}`);

    // Special handling for dashboard
    if (pageName === 'dashboard') {
        showDashboard();
        return false;
    }

    // Hide dashboard, show loading
    const dashboard = document.getElementById('page-dashboard');
    const container = document.getElementById('dynamic-page-container');

    if (dashboard) {
        dashboard.classList.remove('active');
    }

    if (container) {
        container.innerHTML = '<div class="loading-spinner">Loading...</div>';
        container.style.display = 'block';
    }

    try {
        // Fetch page HTML
        const response = await fetch(`/page/${pageName}`);

        if (!response.ok) {
            throw new Error('Page not found');
        }

        const html = await response.text();
        container.innerHTML = html;

        // Update active nav link
        updateActiveNavLink(pageName);

        // Load page-specific JavaScript
        await loadPageScript(pageName);

        // **NEW: Re-initialize page if script already loaded**
        await reinitializePage(pageName);

        // Translate the newly loaded page
        if (typeof window.translatePage === 'function') {
            console.log('🌐 Translating dynamically loaded page...');
            window.translatePage();
        }

        // Close sidebar on mobile
        if (window.innerWidth <= 1024) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('active');
            }
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
        console.error('Error loading page:', error);
        container.innerHTML = `
            <div class="page-content active">
                <div class="page-header">
                    <h2>Page Not Found</h2>
                </div>
                <div class="coming-soon">
                    This page is under development. Coming soon!
                </div>
            </div>
        `;
    }

    return false;
}

// Show dashboard
function showDashboard() {
    console.log('🏠 Showing dashboard');

    const dashboard = document.getElementById('page-dashboard');
    const container = document.getElementById('dynamic-page-container');

    if (dashboard) {
        dashboard.classList.add('active');
    }

    if (container) {
        container.style.display = 'none';
    }

    // Update active nav link
    updateActiveNavLink('dashboard');

    // Translate dashboard if needed
    if (typeof window.translatePage === 'function') {
        window.translatePage();
    }
}

// Update active navigation link
function updateActiveNavLink(pageName) {
    // Remove active class from all nav links
    document.querySelectorAll('.nav-link, .nav-dashboard-link').forEach(link => {
        link.classList.remove('active');
    });

    // Add active class to current page link
    const activeLink = document.querySelector(`[data-page="${pageName}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    // For dynamically loaded pages, find by onclick attribute
    if (!activeLink) {
        document.querySelectorAll('.nav-link').forEach(link => {
            const onclickAttr = link.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(`'${pageName}'`)) {
                link.classList.add('active');
            }
        });
    }
}

// Load page-specific JavaScript
async function loadPageScript(pageName) {
    try {
        // Convert page-name to page-name.js (keep dashes)
        const scriptName = `${pageName}.js`;
        const scriptUrl = `/static/js/pages/${scriptName}`;

        console.log(`🔍 Attempting to load script: ${scriptUrl}`);

        // Check if script already loaded
        const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
        if (existingScript) {
            console.log('ℹ️ Script already loaded, skipping');
            return;
        }

        const response = await fetch(scriptUrl);

        if (response.ok) {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.async = false;
            document.body.appendChild(script);
            console.log(`✅ Loaded script: ${scriptName}`);
        } else {
            console.log(`ℹ️ No specific script for ${pageName}`);
        }
    } catch (error) {
        console.log(`ℹ️ No specific script for ${pageName}:`, error.message);
    }
}

// **NEW: Re-initialize page when navigating back to it**
async function reinitializePage(pageName) {
    // Wait a bit for HTML to be fully inserted
    await new Promise(resolve => setTimeout(resolve, 150));

    console.log(`🔄 Checking for initialization function for: ${pageName}`);

    // Map page names to their initialization functions
    const initFunctions = {
        'backup': 'initBackupPage',
        'restore': 'initRestorePage',
        'user-management': 'initUserManagementPage',
        'mission-details': 'initMissionDetailsPage',
        'projects': 'initProjectsPage'
        // Add more pages as you create them
    };

    const functionName = initFunctions[pageName];

    if (functionName && typeof window[functionName] === 'function') {
        console.log(`🔄 Re-initializing ${pageName}...`);
        try {
            await window[functionName]();
        } catch (error) {
            console.error(`Error re-initializing ${pageName}:`, error);
        }
    } else {
        console.log(`ℹ️ No re-initialization needed for ${pageName}`);
    }
}

// Toggle sidebar (for mobile)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
}

// Toggle navigation section (collapsible)
function toggleSection(header) {
    const section = header.parentElement;
    const content = section.querySelector('.nav-section-content');
    const arrow = header.querySelector('.nav-arrow');

    section.classList.toggle('active');

    if (section.classList.contains('active')) {
        content.style.maxHeight = content.scrollHeight + 'px';
        arrow.style.transform = 'rotate(180deg)';
    } else {
        content.style.maxHeight = '0';
        arrow.style.transform = 'rotate(0deg)';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('📄 DOM loaded, initializing navigation...');

    // Show dashboard by default
    showDashboard();

    // Expand all sections by default
    document.querySelectorAll('.nav-section').forEach(section => {
        section.classList.add('active');
        const content = section.querySelector('.nav-section-content');
        const arrow = section.querySelector('.nav-arrow');
        if (content) {
            content.style.maxHeight = content.scrollHeight + 'px';
        }
        if (arrow) {
            arrow.style.transform = 'rotate(180deg)';
        }
    });

    console.log('✅ Navigation initialized');
});

// Attach language button click handlers
document.addEventListener('DOMContentLoaded', function () {
    console.log('🎯 Attaching language button handlers...');

    // Wait for i18n to be available
    const attachLanguageHandlers = () => {
        if (typeof window.i18n === 'undefined') {
            console.log('⏳ Waiting for i18n...');
            setTimeout(attachLanguageHandlers, 100);
            return;
        }

        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const lang = this.getAttribute('data-lang');
                console.log('🖱️ Language button clicked:', lang);

                if (window.i18n && typeof window.i18n.setLanguage === 'function') {
                    window.i18n.setLanguage(lang);
                } else {
                    console.error('❌ i18n.setLanguage not available');
                }
            });

            console.log('✅ Handler attached to button:', btn.getAttribute('data-lang'));
        });

        console.log('✅ All language button handlers attached');
    };

    attachLanguageHandlers();
});