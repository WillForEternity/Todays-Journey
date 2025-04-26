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
    
    // Apply or remove the background based on toggle state
    if (isCustomEnabled && BackgroundCustomizer.state.backgroundImage) {
        BackgroundCustomizer.applyBackground(BackgroundCustomizer.state.backgroundImage);
    } else {
        BackgroundCustomizer.removeBackgroundFromUI();
    }
    
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
    
    // If the custom background is enabled, apply it right away
    if (BackgroundCustomizer.state.customBackgroundEnabled) {
        BackgroundCustomizer.applyBackground(imageDataUrl);
    }
};

/**
 * Applies the background image to the task panel.
 * @param {string} imageDataUrl - The data URL of the image
 */
BackgroundCustomizer.applyBackground = (imageDataUrl) => {
    const dailyTasksPanel = document.querySelector('.daily-tasks-panel');
    if (!dailyTasksPanel) {
        console.warn('Daily tasks panel not found');
        return;
    }
    
    // Apply background image to the daily tasks panel
    dailyTasksPanel.style.backgroundImage = `url(${imageDataUrl})`;
    dailyTasksPanel.style.backgroundSize = 'cover';
    dailyTasksPanel.style.backgroundPosition = 'center';
    dailyTasksPanel.style.backgroundRepeat = 'no-repeat';
    
    // Add a semi-transparent overlay to ensure text remains readable
    dailyTasksPanel.classList.add('with-background-image');
    
    // Analyze the brightness of the image and set appropriate text color
    BackgroundCustomizer.analyzeImageBrightness(imageDataUrl);
};

/**
 * Analyzes the brightness of an image and sets appropriate text color.
 * @param {string} imageDataUrl - The data URL of the image
 */
BackgroundCustomizer.analyzeImageBrightness = (imageDataUrl) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageDataUrl;
    
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to a small sample (we don't need full resolution for this)
        canvas.width = Math.min(img.width, 100);
        canvas.height = Math.min(img.height, 100);
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let totalBrightness = 0;
        const pixelCount = data.length / 4; // RGBA values (4 values per pixel)
        
        // Calculate average brightness using the luminance formula
        for (let i = 0; i < data.length; i += 4) {
            // Luminance formula (perceived brightness): 0.299*R + 0.587*G + 0.114*B
            const brightness = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
            totalBrightness += brightness;
        }
        
        const averageBrightness = totalBrightness / pixelCount;
        console.log('Average brightness:', averageBrightness);
        
        // Apply dark or light text based on brightness threshold
        const dailyTasksPanel = document.querySelector('.daily-tasks-panel');
        if (dailyTasksPanel) {
            // Remove any existing text color classes
            dailyTasksPanel.classList.remove('dark-background', 'light-background');
            
            // Add appropriate class based on brightness (threshold of 0.5)
            if (averageBrightness < 0.5) {
                dailyTasksPanel.classList.add('dark-background');
            } else {
                dailyTasksPanel.classList.add('light-background');
            }
        }
    };
    
    img.onerror = (e) => {
        console.error('Error analyzing image brightness:', e);
    };
};

/**
 * Removes the background image from the UI.
 */
BackgroundCustomizer.removeBackgroundFromUI = () => {
    const dailyTasksPanel = document.querySelector('.daily-tasks-panel');
    if (!dailyTasksPanel) return;
    
    // Remove background image
    dailyTasksPanel.style.backgroundImage = '';
    dailyTasksPanel.style.backgroundSize = '';
    dailyTasksPanel.style.backgroundPosition = '';
    dailyTasksPanel.style.backgroundRepeat = '';
    
    // Remove the classes that apply the overlay and text colors
    dailyTasksPanel.classList.remove('with-background-image', 'dark-background', 'light-background');
};

/**
 * Removes the background image and resets the preview.
 */
BackgroundCustomizer.removeBackgroundImage = () => {
    BackgroundCustomizer.state.backgroundImage = null;
    
    // Clear preview
    const { backgroundPreview, removeBackgroundBtn } = BackgroundCustomizer.dom;
    backgroundPreview.innerHTML = '';
    backgroundPreview.insertAdjacentHTML('beforeend', '<span class="upload-placeholder">Preview</span>');
    
    // Remove background from UI if it's enabled
    if (BackgroundCustomizer.state.customBackgroundEnabled) {
        BackgroundCustomizer.removeBackgroundFromUI();
    }
    
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
            
            // If the custom background was enabled, apply it
            if (BackgroundCustomizer.state.customBackgroundEnabled) {
                BackgroundCustomizer.applyBackground(savedImageData);
            }
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
