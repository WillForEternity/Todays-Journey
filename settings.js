// --- settings.js ---
// --- Settings Window Module ---
const Settings = {};

// --- DOM Elements ---
Settings.dom = {
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    settingsCloseBtn: document.getElementById('settingsCloseBtn'),
    themeToggle: document.getElementById('themeToggle')
};

// --- Core Settings Functions ---

/**
 * Opens the settings modal.
 */
Settings.openSettings = () => {
    const { settingsModal } = Settings.dom;
    if (!settingsModal) return;
    settingsModal.classList.add('visible');
};

/**
 * Closes the settings modal.
 */
Settings.closeSettings = () => {
    const { settingsModal } = Settings.dom;
    if (!settingsModal) return;
    settingsModal.classList.remove('visible');
};

/**
 * Handles the gear icon spin animation on mouse enter.
 */
Settings.handleSettingsHoverIn = () => {
    const gearEmoji = Settings.dom.settingsBtn?.querySelector('.gear-emoji');
    if (gearEmoji) {
        gearEmoji.style.transform = 'rotate(180deg)';
    }
};

/**
 * Handles the gear icon spin animation on mouse leave.
 */
Settings.handleSettingsHoverOut = () => {
    const gearEmoji = Settings.dom.settingsBtn?.querySelector('.gear-emoji');
    if (gearEmoji) {
        gearEmoji.style.transform = 'rotate(0deg)';
    }
};

// --- Theme Management ---

/**
 * Applies the selected theme (light or dark) to the application.
 * @param {boolean} isLightMode - Whether to apply light mode (true) or dark mode (false)
 */
Settings.applyTheme = (isLightMode) => {
    const root = document.documentElement;
    
    if (isLightMode) {
        // Apply light theme
        root.style.setProperty('--bg-color', 'var(--light-bg-color)');
        root.style.setProperty('--ui-bg-color', 'var(--light-ui-bg-color)');
        root.style.setProperty('--input-bg-color', 'var(--light-input-bg-color)');
        root.style.setProperty('--hover-bg-color', 'var(--light-hover-bg-color)');
        root.style.setProperty('--selected-bg-color', 'var(--light-selected-bg-color)');
        root.style.setProperty('--text-color', 'var(--light-text-color)');
    } else {
        // Apply dark theme (reset to default values)
        root.style.setProperty('--bg-color', '#171717');
        root.style.setProperty('--ui-bg-color', '#131313');
        root.style.setProperty('--input-bg-color', '#3c3c3c');
        root.style.setProperty('--hover-bg-color', '#37373d');
        root.style.setProperty('--selected-bg-color', '#4a4a4a');
        root.style.setProperty('--text-color', '#d4d4d4');
    }
    
    // Save theme preference
    try {
        localStorage.setItem('themeMode', isLightMode ? 'light' : 'dark');
    } catch (e) {
        console.warn("Could not save theme preference:", e);
    }
};

/**
 * Toggles between light and dark themes.
 */
Settings.toggleTheme = () => {
    const isLightMode = Settings.dom.themeToggle.checked;
    Settings.applyTheme(isLightMode);
};

/**
 * Initializes the theme based on saved preferences or system preference.
 */
Settings.initTheme = () => {
    let preferredTheme;
    
    // Try to load from localStorage
    try {
        preferredTheme = localStorage.getItem('themeMode');
    } catch (e) {
        console.warn("Could not read theme preference:", e);
    }
    
    // If no saved preference, check system preference
    if (!preferredTheme && window.matchMedia) {
        preferredTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    
    // Default to dark if nothing else
    if (!preferredTheme) {
        preferredTheme = 'dark';
    }
    
    // Set toggle state and apply theme
    if (Settings.dom.themeToggle) {
        Settings.dom.themeToggle.checked = preferredTheme === 'light';
        Settings.applyTheme(preferredTheme === 'light');
    }
};

/**
 * Initialize settings module.
 */
Settings.init = () => {
    console.log("Initializing Settings module");
    
    // Setup event listeners
    if (Settings.dom.settingsBtn) {
        Settings.dom.settingsBtn.addEventListener('click', Settings.openSettings);
        Settings.dom.settingsBtn.addEventListener('mouseenter', Settings.handleSettingsHoverIn);
        Settings.dom.settingsBtn.addEventListener('mouseleave', Settings.handleSettingsHoverOut);
    }
    
    if (Settings.dom.settingsCloseBtn) {
        Settings.dom.settingsCloseBtn.addEventListener('click', Settings.closeSettings);
    }
    
    if (Settings.dom.settingsModal) {
        Settings.dom.settingsModal.addEventListener('click', (event) => {
            if (event.target === Settings.dom.settingsModal) {
                Settings.closeSettings();
            }
        });
    }
    
    // Setup theme toggle
    if (Settings.dom.themeToggle) {
        Settings.dom.themeToggle.addEventListener('change', Settings.toggleTheme);
    }
    
    // Initialize theme
    Settings.initTheme();
    
    // Setup keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Close Settings Modal on Escape
        if (event.key === 'Escape' && Settings.dom.settingsModal?.classList.contains('visible')) {
            Settings.closeSettings();
        }
    });
    
    console.log("Settings module initialized");
};

// Expose the module globally
window.Settings = Settings;

// Initialize on DOMContentLoaded (if not being initialized from elsewhere)
document.addEventListener('DOMContentLoaded', () => {
    // Will be initialized by App.init() in view-toggle.js
    // This is just a fallback if for some reason that doesn't happen
    setTimeout(() => {
        if (!Settings.initialized) {
            console.log("Settings module not initialized by App. Initializing now.");
            Settings.init();
            Settings.initialized = true;
        }
    }, 1000);
});
