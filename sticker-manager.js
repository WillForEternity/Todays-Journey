/**
 * Sticker Manager Module
 * Handles sticker collection, upload, and storage functionality
 */

const StickerManager = {};

/**
 * Sticker manager state
 */
StickerManager.state = {
    stickers: [] // Array to hold sticker data objects
};

/**
 * DOM element references
 */
StickerManager.dom = {};

/**
 * Initialize the sticker manager
 */
StickerManager.init = () => {
    // Store DOM references
    StickerManager.dom = {
        stickerBtn: document.getElementById('stickerBtn'),
        stickerModal: document.getElementById('stickerModal'),
        closeStickerBtn: document.getElementById('closeStickerBtn'),
        stickerSlots: document.querySelectorAll('.sticker-slot'),
        stickerUpload: document.getElementById('stickerUpload')
    };

    // Load stickers from localStorage
    StickerManager.loadStickers();

    // Add event listeners
    StickerManager.addEventListeners();

    // Initialize hover animations
    StickerManager.initHoverAnimations();
};

/**
 * Set up event listeners
 */
StickerManager.addEventListeners = () => {
    const { stickerBtn, closeStickerBtn, stickerSlots, stickerUpload, stickerModal } = StickerManager.dom;

    // Open sticker modal
    stickerBtn?.addEventListener('click', StickerManager.openStickerManager);

    // Close sticker modal
    closeStickerBtn?.addEventListener('click', StickerManager.closeStickerManager);
    
    // Close modal when clicking outside of it
    stickerModal?.addEventListener('click', (e) => {
        // Only close if the click is directly on the modal overlay
        // not on any of its children
        if (e.target === stickerModal) {
            StickerManager.closeStickerManager();
        }
    });

    // Slot click handlers
    stickerSlots?.forEach(slot => {
        slot.addEventListener('click', (e) => {
            if (e.target.closest('.sticker-remove-btn')) {
                // Handle remove button click
                const slotIndex = parseInt(slot.dataset.slot);
                StickerManager.removeSticker(slotIndex);
            } else {
                // Handle slot click for upload
                const slotIndex = parseInt(slot.dataset.slot);
                StickerManager.triggerUpload(slotIndex);
            }
        });

        // Add mousedown event for drag start
        const preview = slot.querySelector('.sticker-preview');
        if (preview) {
            preview.addEventListener('mousedown', (e) => {
                const slotIndex = parseInt(slot.dataset.slot);
                const stickerData = StickerManager.state.stickers[slotIndex];
                
                if (stickerData) {
                    // Prevent default drag behavior
                    e.preventDefault();
                    
                    // Start drag operation
                    StickerManager.startDraggingSticker(e, stickerData);
                }
            });
        }
    });

    // File upload handler
    stickerUpload?.addEventListener('change', StickerManager.handleStickerUpload);
};

/**
 * Initialize hover animations for sticker button
 */
StickerManager.initHoverAnimations = () => {
    const { stickerBtn } = StickerManager.dom;
    
    stickerBtn?.addEventListener('mouseenter', StickerManager.handleStickerHoverIn);
    stickerBtn?.addEventListener('mouseleave', StickerManager.handleStickerHoverOut);
};

/**
 * Handles the sticker icon animation on mouse enter
 */
StickerManager.handleStickerHoverIn = () => {
    const stickerEmoji = StickerManager.dom.stickerBtn?.querySelector('.sticker-emoji');
    if (stickerEmoji) {
        // First, set up the expansion animation
        stickerEmoji.style.transition = 'transform 0.2s ease';
        stickerEmoji.style.transform = 'scale(1.2)';
        
        // After expansion, do the first jump
        setTimeout(() => {
            stickerEmoji.style.transition = 'transform 0.15s ease-out';
            stickerEmoji.style.transform = 'scale(1.2) translateY(-5px)';
            
            // Then back down
            setTimeout(() => {
                stickerEmoji.style.transition = 'transform 0.15s ease-in';
                stickerEmoji.style.transform = 'scale(1.2) translateY(0px)';
                
                // Second jump
                setTimeout(() => {
                    stickerEmoji.style.transition = 'transform 0.15s ease-out';
                    stickerEmoji.style.transform = 'scale(1.2) translateY(-5px)';
                    
                    // Final position back down
                    setTimeout(() => {
                        stickerEmoji.style.transition = 'transform 0.15s ease-in';
                        stickerEmoji.style.transform = 'scale(1.2) translateY(0px)';
                    }, 150);
                }, 150);
            }, 150);
        }, 200); // Wait for expansion to complete (200ms)
    }
};

/**
 * Handles the sticker icon animation on mouse leave
 */
StickerManager.handleStickerHoverOut = () => {
    const stickerEmoji = StickerManager.dom.stickerBtn?.querySelector('.sticker-emoji');
    if (stickerEmoji) {
        // Reset immediately to normal state
        stickerEmoji.style.transition = 'transform 0.3s ease';
        stickerEmoji.style.transform = 'scale(1) translateY(0px)';
    }
};

/**
 * Opens the sticker manager modal
 */
StickerManager.openStickerManager = () => {
    const { stickerModal } = StickerManager.dom;
    if (!stickerModal) return;
    stickerModal.classList.add('visible');
    
    // Refresh the icons since we just made the modal visible
    feather.replace();
};

/**
 * Closes the sticker manager modal
 */
StickerManager.closeStickerManager = () => {
    const { stickerModal } = StickerManager.dom;
    if (!stickerModal) return;
    stickerModal.classList.remove('visible');
};

/**
 * Loads stickers from localStorage
 */
StickerManager.loadStickers = () => {
    try {
        const savedStickers = localStorage.getItem('stickerData');
        if (savedStickers) {
            StickerManager.state.stickers = JSON.parse(savedStickers);
            StickerManager.renderStickers();
        }
    } catch (error) {
        console.error('Error loading stickers from localStorage:', error);
    }
};

/**
 * Saves stickers to localStorage
 */
StickerManager.saveStickers = () => {
    try {
        localStorage.setItem('stickerData', JSON.stringify(StickerManager.state.stickers));
    } catch (error) {
        console.error('Error saving stickers to localStorage:', error);
    }
};

/**
 * Renders stickers in their slots
 */
StickerManager.renderStickers = () => {
    const { stickerSlots } = StickerManager.dom;
    const { stickers } = StickerManager.state;

    stickerSlots?.forEach(slot => {
        const slotIndex = parseInt(slot.dataset.slot);
        const stickerData = stickers[slotIndex];
        
        const placeholder = slot.querySelector('.sticker-upload-placeholder');
        const preview = slot.querySelector('.sticker-preview');
        const removeBtn = slot.querySelector('.sticker-remove-btn');
        
        if (stickerData) {
            // Sticker exists for this slot
            preview.src = stickerData.imageData;
            preview.style.display = 'block';
            removeBtn.style.display = 'flex';
            placeholder.style.display = 'none';
        } else {
            // No sticker for this slot
            preview.style.display = 'none';
            removeBtn.style.display = 'none';
            placeholder.style.display = 'flex';
        }
    });
};

/**
 * Triggers the file upload dialog for a specific slot
 * @param {number} slotIndex - The index of the slot to upload to
 */
StickerManager.triggerUpload = (slotIndex) => {
    const { stickerUpload } = StickerManager.dom;
    
    // Store the target slot index temporarily
    StickerManager.state.targetSlot = slotIndex;
    
    // Trigger file upload dialog
    stickerUpload?.click();
};

/**
 * Handles the sticker file upload
 */
StickerManager.handleStickerUpload = (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const imageData = e.target.result;
        const slotIndex = StickerManager.state.targetSlot;
        
        // Create sticker data object
        const stickerData = {
            id: `sticker-${Date.now()}`,
            name: file.name,
            imageData: imageData,
            uploadDate: new Date().toISOString()
        };
        
        // Ensure stickers array is large enough
        while (StickerManager.state.stickers.length <= slotIndex) {
            StickerManager.state.stickers.push(null);
        }
        
        // Store the sticker data
        StickerManager.state.stickers[slotIndex] = stickerData;
        
        // Save to localStorage
        StickerManager.saveStickers();
        
        // Update the UI
        StickerManager.renderStickers();
        
        // Clear the file input for next use
        event.target.value = '';
    };
    
    reader.readAsDataURL(file);
};

/**
 * Removes a sticker from a slot
 * @param {number} slotIndex - The index of the slot to remove the sticker from
 */
StickerManager.removeSticker = (slotIndex) => {
    if (slotIndex >= 0 && slotIndex < StickerManager.state.stickers.length) {
        // Remove the sticker
        StickerManager.state.stickers[slotIndex] = null;
        
        // Save to localStorage
        StickerManager.saveStickers();
        
        // Update the UI
        StickerManager.renderStickers();
    }
};

/**
 * Creates a floating sticker element that follows the cursor
 * @param {MouseEvent} initialEvent - The mousedown event that initiated the drag
 * @param {Object} stickerData - The sticker data object
 */
StickerManager.startDraggingSticker = (initialEvent, stickerData) => {
    // Close the sticker modal
    StickerManager.closeStickerManager();
    
    // Create a floating sticker element
    const floatingSticker = document.createElement('div');
    floatingSticker.className = 'floating-sticker';
    floatingSticker.style.position = 'fixed';
    floatingSticker.style.pointerEvents = 'none';
    floatingSticker.style.zIndex = '9999';
    floatingSticker.style.width = '100px';
    floatingSticker.style.height = '100px';
    floatingSticker.style.transform = 'translate(-50%, -50%)';
    
    // Create image element
    const img = document.createElement('img');
    img.src = stickerData.imageData;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    
    // Add image to floating sticker
    floatingSticker.appendChild(img);
    
    // Add to document body
    document.body.appendChild(floatingSticker);
    
    // Position at initial cursor position
    floatingSticker.style.left = `${initialEvent.clientX}px`;
    floatingSticker.style.top = `${initialEvent.clientY}px`;
    
    // Function to move the sticker with the cursor
    const moveSticker = (e) => {
        floatingSticker.style.left = `${e.clientX}px`;
        floatingSticker.style.top = `${e.clientY}px`;
    };
    
    // Function to end the drag operation
    const endDrag = () => {
        // Remove floating sticker
        floatingSticker.remove();
        
        // Remove event listeners
        document.removeEventListener('mousemove', moveSticker);
        document.removeEventListener('mouseup', endDrag);
        
        // Here we'd implement the drop functionality in the future
        console.log('Sticker drag ended. Drop functionality will be implemented later.');
    };
    
    // Add event listeners for dragging and releasing
    document.addEventListener('mousemove', moveSticker);
    document.addEventListener('mouseup', endDrag);
};

// Initialize on document ready
document.addEventListener('DOMContentLoaded', () => {
    StickerManager.init();
});
