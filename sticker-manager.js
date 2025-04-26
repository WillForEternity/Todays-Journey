/**
 * Sticker Manager Module
 * Handles sticker collection, upload, and storage functionality
 */

const StickerManager = {};

/**
 * Sticker manager state
 */
StickerManager.state = {
    stickers: [], // Array to hold sticker data objects
    placedStickers: [], // Array to hold placed sticker instances
    targetSlot: null, // Temporary storage for upload target
    currentView: 'calendar' // Default view
};

/**
 * DOM element references
 */
StickerManager.dom = {};

/**
 * Database configuration
 */
StickerManager.db = {
    name: 'stickersDB',
    version: 1,
    stickersStore: 'stickers',
    placedStickersStore: 'placedStickers'
};

/**
 * Initialize the sticker manager
 */
StickerManager.init = async () => {
    // Store DOM references
    StickerManager.dom = {
        stickerBtn: document.getElementById('stickerBtn'),
        stickerModal: document.getElementById('stickerModal'),
        closeStickerBtn: document.getElementById('closeStickerBtn'),
        stickerSlots: document.querySelectorAll('.sticker-slot'),
        stickerUpload: document.getElementById('stickerUpload'),
        viewToggleBtn: document.getElementById('viewToggleBtn')
    };

    // Load stickers from IndexedDB
    await StickerManager.loadStickers();

    // Add event listeners
    StickerManager.addEventListeners();

    // Initialize hover animations
    StickerManager.initHoverAnimations();
    
    // Listen for view changes
    StickerManager.dom.viewToggleBtn?.addEventListener('click', () => {
        // Wait a moment for the view to change, then re-render stickers
        setTimeout(() => {
            StickerManager.updateCurrentView();
            StickerManager.renderPlacedStickers();
        }, 100);
    });
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
 * Opens the IndexedDB database connection
 * @returns {Promise} Promise that resolves with the database connection
 */
StickerManager.openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(StickerManager.db.name, StickerManager.db.version);
        
        // Handle database upgrade (first time or version change)
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create object stores if they don't exist
            if (!db.objectStoreNames.contains(StickerManager.db.stickersStore)) {
                db.createObjectStore(StickerManager.db.stickersStore, { keyPath: 'index' });
            }
            
            if (!db.objectStoreNames.contains(StickerManager.db.placedStickersStore)) {
                db.createObjectStore(StickerManager.db.placedStickersStore, { keyPath: 'id' });
            }
        };
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        
        request.onerror = (event) => {
            console.error('Error opening IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
};

/**
 * Loads stickers from IndexedDB
 */
StickerManager.loadStickers = async () => {
    try {
        const db = await StickerManager.openDB();
        
        // Load sticker collection
        const stickerPromise = new Promise((resolve) => {
            const transaction = db.transaction(StickerManager.db.stickersStore, 'readonly');
            const store = transaction.objectStore(StickerManager.db.stickersStore);
            const request = store.getAll();
            
            request.onsuccess = () => {
                // Transform array of objects with index keys to an array with null slots
                const stickerData = [];
                request.result.forEach(item => {
                    // Ensure array is big enough
                    while (stickerData.length <= item.index) {
                        stickerData.push(null);
                    }
                    // Place item at its index position
                    stickerData[item.index] = item.data;
                });
                resolve(stickerData);
            };
            
            request.onerror = () => {
                console.error('Error loading stickers from IndexedDB');
                resolve([]);
            };
        });
        
        // Load placed stickers
        const placedStickerPromise = new Promise((resolve) => {
            const transaction = db.transaction(StickerManager.db.placedStickersStore, 'readonly');
            const store = transaction.objectStore(StickerManager.db.placedStickersStore);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                console.error('Error loading placed stickers from IndexedDB');
                resolve([]);
            };
        });
        
        // Wait for both operations to complete
        const [stickers, placedStickers] = await Promise.all([stickerPromise, placedStickerPromise]);
        
        // Update state
        StickerManager.state.stickers = stickers;
        StickerManager.state.placedStickers = placedStickers;
        
        // Render stickers
        StickerManager.renderStickers();
        StickerManager.renderPlacedStickers();
        
    } catch (error) {
        console.error('Error in loadStickers:', error);
    }
};

/**
 * Saves stickers to IndexedDB
 */
StickerManager.saveStickers = async () => {
    try {
        const db = await StickerManager.openDB();
        const transaction = db.transaction(StickerManager.db.stickersStore, 'readwrite');
        const store = transaction.objectStore(StickerManager.db.stickersStore);
        
        // Clear existing data
        store.clear();
        
        // Add new data (only non-null items)
        StickerManager.state.stickers.forEach((stickerData, index) => {
            if (stickerData) {
                store.add({ 
                    index: index, 
                    data: stickerData 
                });
            }
        });
        
        // Handle transaction completion
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                resolve();
            };
            
            transaction.onerror = (event) => {
                console.error('Error saving stickers to IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
        
    } catch (error) {
        console.error('Error in saveStickers:', error);
    }
};

/**
 * Saves placed stickers to IndexedDB
 */
StickerManager.savePlacedStickers = async () => {
    try {
        const db = await StickerManager.openDB();
        const transaction = db.transaction(StickerManager.db.placedStickersStore, 'readwrite');
        const store = transaction.objectStore(StickerManager.db.placedStickersStore);
        
        // Clear existing data
        store.clear();
        
        // Add new data
        StickerManager.state.placedStickers.forEach(sticker => {
            store.add(sticker);
        });
        
        // Handle transaction completion
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                resolve();
            };
            
            transaction.onerror = (event) => {
                console.error('Error saving placed stickers to IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
        
    } catch (error) {
        console.error('Error in savePlacedStickers:', error);
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
 * Renders placed stickers on the page
 */
StickerManager.renderPlacedStickers = () => {
    // First remove any existing placed stickers
    document.querySelectorAll('.sticker-instance').forEach(el => el.remove());
    
    // Get current view
    StickerManager.updateCurrentView();
    
    // Render each placed sticker, but only for the current view
    StickerManager.state.placedStickers.forEach(placedSticker => {
        // Only render if sticker belongs to current view
        if (placedSticker.view === StickerManager.state.currentView) {
            StickerManager.createStickerInstance(placedSticker);
        }
    });
};

/**
 * Updates the current view tracking based on what's visible
 */
StickerManager.updateCurrentView = () => {
    const calendarView = document.querySelector('.calendar-view');
    const notesView = document.querySelector('.notes-view');
    
    const isCalendarViewActive = getComputedStyle(calendarView).display !== 'none';
    const isNotesViewActive = getComputedStyle(notesView).display !== 'none';
    
    if (isCalendarViewActive) {
        StickerManager.state.currentView = 'calendar';
    } else if (isNotesViewActive) {
        StickerManager.state.currentView = 'notes';
    }
    
    console.log('Current view:', StickerManager.state.currentView);
};

/**
 * Creates a sticker instance element on the page
 * @param {Object} placedSticker - The placed sticker data
 * @returns {HTMLElement} - The created sticker element
 */
StickerManager.createStickerInstance = (placedSticker) => {
    // Create sticker instance element
    const stickerEl = document.createElement('div');
    stickerEl.className = 'sticker-instance';
    stickerEl.id = placedSticker.id;
    stickerEl.style.position = 'fixed';
    stickerEl.style.left = `${placedSticker.x}px`;
    stickerEl.style.top = `${placedSticker.y}px`;
    stickerEl.style.width = `${placedSticker.width}px`;
    stickerEl.style.height = `${placedSticker.height}px`;
    stickerEl.style.zIndex = placedSticker.zIndex;
    stickerEl.style.transform = 'translate(-50%, -50%)'; // Center the sticker at the placement point
    
    // Add a data attribute for the view
    stickerEl.dataset.view = placedSticker.view;
    
    // Create image element
    const img = document.createElement('img');
    img.src = placedSticker.imageData;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.draggable = false; // Prevent default drag behavior
    
    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'sticker-instance-delete';
    deleteBtn.innerHTML = '<i data-feather="x"></i>';
    deleteBtn.style.display = 'none'; // Hide by default, show on hover
    
    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'sticker-resize-handle';
    resizeHandle.style.display = 'none'; // Hide by default, show on hover
    
    // Add elements to sticker instance
    stickerEl.appendChild(img);
    stickerEl.appendChild(deleteBtn);
    stickerEl.appendChild(resizeHandle);
    
    // Add to the document body for global positioning
    document.body.appendChild(stickerEl);
    
    // Initialize feather icons for the delete button
    feather.replace();
    
    // Add hover effects
    stickerEl.addEventListener('mouseenter', () => {
        deleteBtn.style.display = 'flex';
        resizeHandle.style.display = 'block';
    });
    
    stickerEl.addEventListener('mouseleave', () => {
        deleteBtn.style.display = 'none';
        resizeHandle.style.display = 'none';
    });
    
    // Add delete handler
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering sticker click when clicking delete
        StickerManager.removePlacedSticker(placedSticker.id);
    });
    
    // Make sticker movable
    stickerEl.addEventListener('mousedown', (e) => {
        // Don't start moving if clicked on delete button or resize handle
        if (e.target.closest('.sticker-instance-delete') || e.target.closest('.sticker-resize-handle')) {
            return;
        }
        
        StickerManager.startMovingPlacedSticker(e, placedSticker);
    });
    
    // Make sticker resizable
    resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Prevent triggering move when resizing
        StickerManager.startResizingSticker(e, placedSticker, stickerEl);
    });
    
    return stickerEl;
};

/**
 * Removes a placed sticker from the page and storage
 * @param {string} stickerId - The ID of the sticker to remove
 */
StickerManager.removePlacedSticker = (stickerId) => {
    // Remove from DOM
    const stickerEl = document.getElementById(stickerId);
    if (stickerEl) {
        stickerEl.remove();
    }
    
    // Remove from state
    StickerManager.state.placedStickers = StickerManager.state.placedStickers.filter(
        sticker => sticker.id !== stickerId
    );
    
    // Save updated state
    StickerManager.savePlacedStickers();
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
        
        // Save to IndexedDB
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
        
        // Save to IndexedDB
        StickerManager.saveStickers();
        
        // Update the UI
        StickerManager.renderStickers();
    }
};

/**
 * Handle moving a placed sticker
 * @param {MouseEvent} initialEvent - The initial mousedown event
 * @param {Object} placedSticker - The placed sticker data
 */
StickerManager.startMovingPlacedSticker = (initialEvent, placedSticker) => {
    initialEvent.preventDefault();
    
    // Get the sticker element
    const stickerEl = document.getElementById(placedSticker.id);
    if (!stickerEl) return;
    
    // Remember initial mouse position
    const initialMouseX = initialEvent.clientX;
    const initialMouseY = initialEvent.clientY;
    
    // Get the sticker's current position
    const initialStickerX = placedSticker.x;
    const initialStickerY = placedSticker.y;
    
    // Create a "ghost" element for dragging
    const ghostEl = document.createElement('div');
    ghostEl.className = 'floating-sticker';
    ghostEl.style.position = 'fixed';
    ghostEl.style.left = `${initialStickerX}px`;
    ghostEl.style.top = `${initialStickerY}px`;
    ghostEl.style.width = `${placedSticker.width}px`;
    ghostEl.style.height = `${placedSticker.height}px`;
    ghostEl.style.zIndex = '9999';
    ghostEl.style.transform = 'translate(-50%, -50%)'; // Center the sticker at the placement point
    
    // Create image for ghost
    const img = document.createElement('img');
    img.src = placedSticker.imageData;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    ghostEl.appendChild(img);
    
    // Hide the original sticker during movement
    stickerEl.style.visibility = 'hidden';
    
    // Add ghost to body
    document.body.appendChild(ghostEl);
    
    // Track whether we've moved
    let hasMoved = false;
    
    // Function to move the ghost
    const moveGhost = (e) => {
        hasMoved = true;
        
        // Calculate new position based on mouse movement
        const dx = e.clientX - initialMouseX;
        const dy = e.clientY - initialMouseY;
        
        const newX = initialStickerX + dx;
        const newY = initialStickerY + dy;
        
        // Update ghost position
        ghostEl.style.left = `${newX}px`;
        ghostEl.style.top = `${newY}px`;
    };
    
    // Function to end movement
    const endMovement = (e) => {
        // Remove event listeners
        document.removeEventListener('mousemove', moveGhost);
        document.removeEventListener('mouseup', endMovement);
        
        // Remove ghost
        ghostEl.remove();
        
        // If we didn't actually move, just show the sticker again
        if (!hasMoved) {
            stickerEl.style.visibility = 'visible';
            return;
        }
        
        // Check if we're dropping onto a text input element 
        // If so, don't allow the drop
        const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
        
        // Check if the element or its parents are text inputs
        let currentElement = elementUnderCursor;
        let isTextInput = false;
        
        // Check up the DOM tree for text input elements
        while (currentElement && !isTextInput) {
            const tagName = currentElement.tagName.toLowerCase();
            if (
                tagName === 'input' || 
                tagName === 'textarea' || 
                currentElement.isContentEditable || 
                currentElement.classList.contains('note-editor-actions') ||
                currentElement.classList.contains('input-area')
            ) {
                isTextInput = true;
            }
            currentElement = currentElement.parentElement;
        }
        
        // Don't update position if we're over a text input
        if (isTextInput) {
            console.log('Cannot place sticker on text input elements');
            // Show original sticker again
            stickerEl.style.visibility = 'visible';
            return;
        }
        
        // Calculate new position
        const dx = e.clientX - initialMouseX;
        const dy = e.clientY - initialMouseY;
        
        const newX = initialStickerX + dx;
        const newY = initialStickerY + dy;
        
        // Update sticker position in state
        placedSticker.x = newX;
        placedSticker.y = newY;
        
        // Update DOM position
        stickerEl.style.left = `${newX}px`;
        stickerEl.style.top = `${newY}px`;
        stickerEl.style.visibility = 'visible';
        
        // Update state in IndexedDB
        StickerManager.savePlacedStickers();
    };
    
    // Add event listeners
    document.addEventListener('mousemove', moveGhost);
    document.addEventListener('mouseup', endMovement);
};

/**
 * Creates a floating sticker element that follows the cursor
 * @param {MouseEvent} initialEvent - The mousedown event that initiated the drag
 * @param {Object} stickerData - The sticker data object
 */
StickerManager.startDraggingSticker = (initialEvent, stickerData) => {
    // Close the sticker modal
    StickerManager.closeStickerManager();
    
    // Update current view
    StickerManager.updateCurrentView();
    
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
    const endDrag = (e) => {
        // Remove floating sticker
        floatingSticker.remove();
        
        // Remove event listeners
        document.removeEventListener('mousemove', moveSticker);
        document.removeEventListener('mouseup', endDrag);
        
        // Check if we're dropping onto a text input element 
        // If so, don't allow the drop
        const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
        
        // Check if the element or its parents are text inputs
        let currentElement = elementUnderCursor;
        let isTextInput = false;
        
        // Check up the DOM tree for text input elements
        while (currentElement && !isTextInput) {
            const tagName = currentElement.tagName.toLowerCase();
            if (
                tagName === 'input' || 
                tagName === 'textarea' || 
                currentElement.isContentEditable || 
                currentElement.classList.contains('note-editor-actions') ||
                currentElement.classList.contains('input-area')
            ) {
                isTextInput = true;
            }
            currentElement = currentElement.parentElement;
        }
        
        // Don't place sticker if we're over a text input
        if (isTextInput) {
            console.log('Cannot place sticker on text input elements');
            return;
        }
        
        // Create the placed sticker object
        const placedSticker = {
            id: `placed-sticker-${Date.now()}`,
            imageData: stickerData.imageData,
            x: e.clientX, // Use the exact cursor position
            y: e.clientY,
            width: 100,
            height: 100,
            zIndex: 1000, // High enough to be above most content
            originalStickerId: stickerData.id,
            view: StickerManager.state.currentView // Store which view this sticker belongs to
        };
        
        // Add to placed stickers array
        StickerManager.state.placedStickers.push(placedSticker);
        
        // Save to IndexedDB
        StickerManager.savePlacedStickers();
        
        // Create sticker instance in the DOM
        StickerManager.createStickerInstance(placedSticker);
        
        console.log('Sticker placed successfully in', placedSticker.view, 'view at', e.clientX, e.clientY);
    };
    
    // Add event listeners for dragging and releasing
    document.addEventListener('mousemove', moveSticker);
    document.addEventListener('mouseup', endDrag);
};

/**
 * Handle resizing a placed sticker
 * @param {MouseEvent} initialEvent - The initial mousedown event
 * @param {Object} placedSticker - The placed sticker data
 * @param {HTMLElement} stickerEl - The sticker element
 */
StickerManager.startResizingSticker = (initialEvent, placedSticker, stickerEl) => {
    initialEvent.preventDefault();
    
    // Remember initial mouse position
    const initialMouseX = initialEvent.clientX;
    const initialMouseY = initialEvent.clientY;
    
    // Get the sticker's current dimensions
    const initialWidth = placedSticker.width;
    const initialHeight = placedSticker.height;
    
    // Create an overlay to prevent unwanted interactions during resize
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '9998';
    overlay.style.cursor = 'nwse-resize'; // Diagonal resize cursor
    document.body.appendChild(overlay);
    
    // Function to handle resize
    const resizeSticker = (e) => {
        // Calculate distance moved
        const dx = e.clientX - initialMouseX;
        const dy = e.clientY - initialMouseY;
        
        // Calculate new dimensions (maintain aspect ratio)
        // We'll use the larger of the two deltas to determine scaling
        const maxDelta = Math.max(Math.abs(dx), Math.abs(dy));
        const scaleFactor = dx > 0 && dy > 0 ? 1 : -1; // Growing or shrinking
        
        // Don't allow sticker to get too small
        const minSize = 40;
        const maxSize = 400;
        
        let newWidth = initialWidth + (maxDelta * scaleFactor);
        let newHeight = initialHeight + (maxDelta * scaleFactor);
        
        // Enforce min/max size
        if (newWidth < minSize) newWidth = minSize;
        if (newHeight < minSize) newHeight = minSize;
        if (newWidth > maxSize) newWidth = maxSize;
        if (newHeight > maxSize) newHeight = maxSize;
        
        // Update element dimensions
        stickerEl.style.width = `${newWidth}px`;
        stickerEl.style.height = `${newHeight}px`;
    };
    
    // Function to end resize
    const endResize = () => {
        // Remove event listeners
        document.removeEventListener('mousemove', resizeSticker);
        document.removeEventListener('mouseup', endResize);
        
        // Remove overlay
        overlay.remove();
        
        // Update sticker data
        placedSticker.width = parseInt(stickerEl.style.width);
        placedSticker.height = parseInt(stickerEl.style.height);
        
        // Save to IndexedDB
        StickerManager.savePlacedStickers();
    };
    
    // Add event listeners
    document.addEventListener('mousemove', resizeSticker);
    document.addEventListener('mouseup', endResize);
};

// Initialize on document ready
document.addEventListener('DOMContentLoaded', () => {
    StickerManager.init();
});
