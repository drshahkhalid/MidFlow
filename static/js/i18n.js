// Internationalization (i18n) Module
const i18n = {
    currentLanguage: window.initialLanguage || 'en', // Use pre-loaded language
    translations: {},

    // Load translations
    async loadTranslations(lang) {
        try {
            console.log(`📥 Loading translations for: ${lang}`);
            const response = await fetch(`/static/translations/${lang}.json`);
            this.translations = await response.json();
            this.currentLanguage = lang;

            // Save language preference to localStorage
            localStorage.setItem('app_language', lang);

            console.log(`✅ Translations loaded for ${lang}:`, Object.keys(this.translations).length, 'keys');

            // Update page content
            this.translatePage();

            // Update active language button
            this.updateLanguageButtons(lang);

            // Dispatch custom event for other scripts to know language changed
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));

        } catch (error) {
            console.error(`❌ Error loading translations for ${lang}:`, error);
        }
    },

    // Translate all elements with data-i18n attribute
    translatePage() {
        console.log('🔄 Translating page...');

        // Translate text content
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (this.translations[key]) {
                element.innerHTML = this.translations[key];
            } else {
                console.warn(`⚠️ Translation missing for key: ${key}`);
            }
        });

        // Translate placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (this.translations[key]) {
                element.placeholder = this.translations[key];
            }
        });

        // Translate titles
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            if (this.translations[key]) {
                element.title = this.translations[key];
            }
        });

        console.log('✅ Page translated');
    },

    // Update active language button styling
    updateLanguageButtons(lang) {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.getAttribute('data-lang') === lang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    // Set language (called from buttons)
    async setLanguage(lang) {
        console.log(`🌐 Changing language to: ${lang}`);

        // Update backend (fire-and-forget, don't block UI)
        fetch('/api/set-language', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang })
        }).catch(error => {
            console.error('Error updating language on backend:', error);
        });

        // Load new translations immediately
        await this.loadTranslations(lang);

        console.log('✅ Language changed successfully');
    },

    // Get current language
    getCurrentLanguage() {
        return this.currentLanguage;
    },

    // Initialize i18n
    async init() {
        console.log('🚀 Initializing i18n...');
        console.log('📌 Initial language from window:', window.initialLanguage);

        // Use the pre-loaded language from window.initialLanguage
        const initialLang = window.initialLanguage || localStorage.getItem('app_language') || 'en';

        console.log(`✅ Loading language: ${initialLang}`);
        await this.loadTranslations(initialLang);

        console.log('✅ i18n initialized');
    }
};

// Initialize i18n IMMEDIATELY (don't wait for DOMContentLoaded if possible)
if (document.readyState === 'loading') {
    // Still loading, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
        i18n.init();
    });
} else {
    // DOM already loaded, init immediately
    i18n.init();
}

// Make i18n available globally
window.i18n = i18n;
window.translatePage = () => i18n.translatePage();
window.changeLanguage = (lang) => i18n.setLanguage(lang);