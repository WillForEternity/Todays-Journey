// --- background-customizer.js ---
// --- Background Customization Module ---
const BackgroundCustomizer = {};

// --- DOM Elements ---
BackgroundCustomizer.dom = {
    pictureBtn: document.getElementById('pictureBtn'),
    customizerModal: document.getElementById('customizerModal'),
    customizerCloseBtn: document.getElementById('customizerCloseBtn'),
    customToggle: document.getElementById('customToggle'),
    // Image upload elements
    backgroundUploadBtn: document.getElementById('backgroundUploadBtn'),
    backgroundImageInput: document.getElementById('backgroundImageInput'),
    backgroundPreview: document.getElementById('backgroundPreview'),
    removeBackgroundBtn: document.getElementById('removeBackgroundBtn')
};

// --- State ---
BackgroundCustomizer.state = {
    customBackgroundEnabled: false,
    backgroundImage: null, // Will store the background image data URL
};

// --- Core Customizer Functions ---

/**
 * Opens the background customizer modal.
 */
BackgroundCustomizer.openCustomizer = () => {
    const { customizerModal } = BackgroundCustomizer.dom;
    if (!customizerModal) return;
    customizerModal.classList.add('visible');
};

/**
 * Closes the background customizer modal.
 */
BackgroundCustomizer.closeCustomizer = () => {
    const { customizerModal } = BackgroundCustomizer.dom;
    if (!customizerModal) return;
    customizerModal.classList.remove('visible');
};

/**
 * Handles the picture icon animation on mouse enter.
 */
BackgroundCustomizer.handlePictureHoverIn = () => {
    const pictureEmoji = BackgroundCustomizer.dom.pictureBtn?.querySelector('.picture-emoji');
    if (pictureEmoji) {
        pictureEmoji.style.transform = 'scale(1.2)';
        pictureEmoji.style.transition = 'transform 0.3s ease';
    }
};

/**
 * Handles the picture icon animation on mouse leave.
 */
BackgroundCustomizer.handlePictureHoverOut = () => {
    const pictureEmoji = BackgroundCustomizer.dom.pictureBtn?.querySelector('.picture-emoji');
    if (pictureEmoji) {
        pictureEmoji.style.transform = 'scale(1)';
        pictureEmoji.style.transition = 'transform 0.3s ease';
    }
};

/**
 * Toggles the custom background setting.
 */
BackgroundCustomizer.toggleCustomBackground = () => {
    const isCustomEnabled = BackgroundCustomizer.dom.customToggle.checked;
    BackgroundCustomizer.state.customBackgroundEnabled = isCustomEnabled;
    
    // Save preference to localStorage
    try {
        localStorage.setItem('customBackground', isCustomEnabled ? 'true' : 'false');
    } catch (e) {
        console.warn("Could not save custom background preference:", e);
    }
    
    // Future implementation: This will handle applying the custom background
    console.log(`Custom background ${isCustomEnabled ? 'enabled' : 'disabled'}`);
};

/**
 * Triggers the file input click event to open the file dialog.
 */
BackgroundCustomizer.openFileDialog = () => {
    if (BackgroundCustomizer.dom.backgroundImageInput) {
        BackgroundCustomizer.dom.backgroundImageInput.click();
    }
};

/**
 * Handles the image file selection and preview.
 */
BackgroundCustomizer.handleImageSelection = (event) => {
    const fileInput = event.target;
    const file = fileInput.files[0];
    
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const imageDataUrl = e.target.result;
            BackgroundCustomizer.setBackgroundImage(imageDataUrl);
        };
        
        reader.readAsDataURL(file);
    } else {
        console.warn('Selected file is not an image.');
    }
};

/**
 * Sets the background image and updates the preview.
 * @param {string} imageDataUrl - The data URL of the image
 */
BackgroundCustomizer.setBackgroundImage = (imageDataUrl) => {
    // Store the image data
    BackgroundCustomizer.state.backgroundImage = imageDataUrl;
    
    // Update preview
    const { backgroundPreview, removeBackgroundBtn } = BackgroundCustomizer.dom;
    
    // Clear current preview
    backgroundPreview.innerHTML = '';
    
    // Create and add the image
    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.alt = 'Background Preview';
    backgroundPreview.appendChild(img);
    
    // Enable remove button
    removeBackgroundBtn.disabled = false;
    
    // Save to localStorage for persistence
    try {
        localStorage.setItem('backgroundImageData', imageDataUrl);
    } catch (e) {
        console.warn('Failed to save background image to localStorage, it might be too large:', e);
    }
};

/**
 * Removes the background image and resets the preview.
 */
BackgroundCustomizer.removeBackgroundImage = () => {
    // Clear state
    BackgroundCustomizer.state.backgroundImage = null;
    
    // Reset preview
    const { backgroundPreview, removeBackgroundBtn } = BackgroundCustomizer.dom;
    backgroundPreview.innerHTML = '<span class="upload-placeholder">Preview</span>';
    
    // Disable remove button
    removeBackgroundBtn.disabled = true;
    
    // Remove from localStorage
    try {
        localStorage.removeItem('backgroundImageData');
    } catch (e) {
        console.warn('Failed to remove background image from localStorage:', e);
    }
};

/**
 * Initializes the background customizer module.
 */
BackgroundCustomizer.init = () => {
    console.log("Initializing Background Customizer module");
    
    // Set up event listeners
    if (BackgroundCustomizer.dom.pictureBtn) {
        BackgroundCustomizer.dom.pictureBtn.addEventListener('click', BackgroundCustomizer.openCustomizer);
        BackgroundCustomizer.dom.pictureBtn.addEventListener('mouseenter', BackgroundCustomizer.handlePictureHoverIn);
        BackgroundCustomizer.dom.pictureBtn.addEventListener('mouseleave', BackgroundCustomizer.handlePictureHoverOut);
    }
    
    if (BackgroundCustomizer.dom.customizerCloseBtn) {
        BackgroundCustomizer.dom.customizerCloseBtn.addEventListener('click', BackgroundCustomizer.closeCustomizer);
    }
    
    if (BackgroundCustomizer.dom.customizerModal) {
        BackgroundCustomizer.dom.customizerModal.addEventListener('click', (event) => {
            if (event.target === BackgroundCustomizer.dom.customizerModal) {
                BackgroundCustomizer.closeCustomizer();
            }
        });
    }
    
    // Setup custom toggle
    if (BackgroundCustomizer.dom.customToggle) {
        // Set initial state based on localStorage
        let isCustomEnabled = false;
        try {
            isCustomEnabled = localStorage.getItem('customBackground') === 'true';
        } catch (e) {
            console.warn("Could not read custom background preference from localStorage:", e);
        }
        
        BackgroundCustomizer.dom.customToggle.checked = isCustomEnabled;
        BackgroundCustomizer.state.customBackgroundEnabled = isCustomEnabled;
        
        // Add event listener for toggle changes
        BackgroundCustomizer.dom.customToggle.addEventListener('change', BackgroundCustomizer.toggleCustomBackground);
    }
    
    // Setup image upload functionality
    if (BackgroundCustomizer.dom.backgroundUploadBtn) {
        BackgroundCustomizer.dom.backgroundUploadBtn.addEventListener('click', BackgroundCustomizer.openFileDialog);
    }
    
    if (BackgroundCustomizer.dom.backgroundImageInput) {
        BackgroundCustomizer.dom.backgroundImageInput.addEventListener('change', BackgroundCustomizer.handleImageSelection);
    }
    
    if (BackgroundCustomizer.dom.removeBackgroundBtn) {
        BackgroundCustomizer.dom.removeBackgroundBtn.addEventListener('click', BackgroundCustomizer.removeBackgroundImage);
    }
    
    // Load background image from localStorage if available
    try {
        const savedImageData = localStorage.getItem('backgroundImageData');
        if (savedImageData) {
            BackgroundCustomizer.setBackgroundImage(savedImageData);
        }
    } catch (e) {
        console.warn('Failed to load background image from localStorage:', e);
    }
    
    // Setup keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Close Customizer Modal on Escape
        if (event.key === 'Escape' && BackgroundCustomizer.dom.customizerModal?.classList.contains('visible')) {
            BackgroundCustomizer.closeCustomizer();
        }
    });
    
    console.log("Background Customizer module initialized");
};

// Expose the module globally
window.BackgroundCustomizer = BackgroundCustomizer;

// Initialize on DOMContentLoaded (if not being initialized from elsewhere)
document.addEventListener('DOMContentLoaded', () => {
    // Will be initialized by App.init() in view-toggle.js
    // This is just a fallback if for some reason that doesn't happen
    setTimeout(() => {
        if (!BackgroundCustomizer.initialized) {
            console.log("Background Customizer module not initialized by App. Initializing now.");
            BackgroundCustomizer.init();
            BackgroundCustomizer.initialized = true;
        }
    }, 1000);
});
