/**
 * image-handler.js
 * Handles image upload, processing, and display for the notes editor.
 * Supports drag & drop, paste, and screenshot integration.
 */

const ImageHandler = (() => {
    // Private variables
    let noteContentInput = null;
    let notePreview = null;
    let imageStorage = {};
    const DB_NAME = 'noteImagesDB', DB_VERSION = 1, STORE_NAME = 'noteImages';

    // Open or upgrade IndexedDB for image storage
    const openImageDB = () => new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    // Load all stored images into memory
    const loadImageStorage = async () => {
        try {
            const db = await openImageDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const all = await new Promise((res, rej) => {
                const r = store.getAll();
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
            all.forEach(item => { imageStorage[item.id] = item.data; });
        } catch (e) {
            console.error('Failed to load images from IndexedDB:', e);
        }
    };

    // Save a single image to IndexedDB
    const saveImageToDB = async (id, data) => {
        try {
            const db = await openImageDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put({ id, data });
        } catch (e) {
            console.error('Failed to save image to IndexedDB:', e);
        }
    };

    // Load existing images on init
    loadImageStorage();

    /**
     * Initialize image handling functionality
     * @param {Object} options - Configuration options
     */
    const init = (options = {}) => {
        // Store references to DOM elements
        noteContentInput = options.noteContentInput || document.getElementById('noteContentInput');
        notePreview = options.notePreview || document.getElementById('notePreview');
        
        if (!noteContentInput) {
            console.error('ImageHandler: Note content input element not found');
            return;
        }
        
        // Initialize event listeners
        setupDragAndDropHandlers();
        setupPasteHandlers();
        
        console.log('ImageHandler: Initialized successfully');
    };
    
    /**
     * Set up drag and drop event handlers for the note editor
     */
    const setupDragAndDropHandlers = () => {
        // Prevent default behavior to enable drop
        noteContentInput.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            noteContentInput.classList.add('image-drop-active');
        });
        
        // Remove highlight when dragging leaves
        noteContentInput.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            noteContentInput.classList.remove('image-drop-active');
        });
        
        // Handle the actual drop
        noteContentInput.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            noteContentInput.classList.remove('image-drop-active');
            
            handleDroppedFiles(e.dataTransfer.files);
        });
    };
    
    /**
     * Set up paste event handlers for the note editor
     */
    const setupPasteHandlers = () => {
        noteContentInput.addEventListener('paste', (e) => {
            // Check if paste contains images
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            let hasImage = false;
            
            for (const item of items) {
                if (item.type.indexOf('image') === 0) {
                    hasImage = true;
                    const blob = item.getAsFile();
                    processImage(blob);
                    // Don't prevent default to allow text pasting to continue
                }
            }
            
            // If user pasted an image, prevent the default paste behavior
            if (hasImage) {
                e.preventDefault();
            }
        });
    };
    
    /**
     * Process dropped files (handling both single and multiple files)
     * @param {FileList} files - List of dropped files
     */
    const handleDroppedFiles = (files) => {
        if (!files || files.length === 0) return;
        
        for (const file of files) {
            // Process only image files
            if (file.type.startsWith('image/')) {
                processImage(file);
            }
        }
    };
    
    /**
     * Process and embed an image into the note
     * @param {File|Blob} imageFile - The image file to process
     */
    const processImage = (imageFile) => {
        if (!imageFile || !imageFile.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result; // Base64 data URI
            insertImageIntoNote(imageData);
        };
        reader.onerror = (error) => {
            console.error('Error reading image file:', error);
            alert('Failed to process image. Please try again.');
        };
        
        // Read the image file as a data URL (base64)
        reader.readAsDataURL(imageFile);
    };
    
    /**
     * Insert an image into the note at the current cursor position
     * @param {string} imageData - Base64 encoded image data
     */
    const insertImageIntoNote = (imageData) => {
        if (!noteContentInput || !imageData) return;
        
        // Generate a unique ID for this image
        const imageId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        
        // Store the full image data in our storage object
        imageStorage[imageId] = imageData;
        saveImageToDB(imageId, imageData);
        
        // Create a special marker for the image with just the ID
        // Format: ![image:ID]
        const imageTag = `\n![image:${imageId}]\n`;
        
        // Get cursor position
        const cursorPos = noteContentInput.selectionStart;
        const textBefore = noteContentInput.value.substring(0, cursorPos);
        const textAfter = noteContentInput.value.substring(cursorPos);
        
        // Insert image tag at cursor position
        noteContentInput.value = textBefore + imageTag + textAfter;
        
        // Set cursor position after the inserted image
        const newCursorPos = cursorPos + imageTag.length;
        noteContentInput.selectionStart = newCursorPos;
        noteContentInput.selectionEnd = newCursorPos;
        
        // Trigger change event to update preview and save
        noteContentInput.dispatchEvent(new Event('input'));
        
        // Focus back on the input
        noteContentInput.focus();
    };
    
    /**
     * Format note content with image support
     * This extends the existing NotesApp.formatNoteContent function
     * @param {string} content - The note content to format
     * @returns {string} - Formatted HTML with images
     */
    const formatNoteContentWithImages = (content) => {
        if (!content) return '';
        
        // First apply the original formatting from NotesApp
        let formatted = NotesApp.formatNoteContent(content);
        
        // Process image tags for preview/PDF rendering
        // Replace ![image:ID] with actual image elements using the stored data
        formatted = formatted.replace(/!\[image:(img_[0-9]+_[0-9]+)\]/g, (match, imageId) => {
            const imageData = imageStorage[imageId];
            if (imageData) {
                return `<div class="note-image-container"><img src="${imageData}" class="note-image" alt="Note image"></div>`;
            } else {
                return '<div class="note-image-placeholder">[Image not found]</div>';
            }
        });
        
        return formatted;
    };
    
    /**
     * Override the NotesApp.formatNoteContent function to add image support
     * This should be called after initialization
     */
    const extendNoteFormatting = () => {
        if (typeof NotesApp !== 'undefined' && NotesApp.formatNoteContent) {
            // Store the original formatting function
            const originalFormatNoteContent = NotesApp.formatNoteContent;
            
            // Override with our enhanced version
            NotesApp.formatNoteContent = (content) => {
                // First apply the original formatting
                let formatted = originalFormatNoteContent(content);
                
                // Then process image tags for image IDs in our storage
                formatted = formatted.replace(/!\[image:(img_[0-9]+_[0-9]+)\]/g, (match, imageId) => {
                    const imageData = imageStorage[imageId];
                    if (imageData) {
                        return `<div class="note-image-container"><img src="${imageData}" class="note-image" alt="Note image"></div>`;
                    } else {
                        return '<div class="note-image-placeholder">[Image not found]</div>';
                    }
                });
                
                // Highlight single-quoted references as inline code snippets
                formatted = formatted.replace(/'([A-Za-z0-9_\/\.\-]+)'/g, (m, p1) => `<span class="code-snippet">${p1}</span>`);
                
                // For backward compatibility, also handle inline base64 data
                formatted = formatted.replace(/!\[image\]\((data:image\/[^)]+)\)/g, 
                    '<div class="note-image-container"><img src="$1" class="note-image" alt="Note image"></div>');
                
                return formatted;
            };
            
            console.log('ImageHandler: Extended note formatting with image support');
        } else {
            console.error('ImageHandler: Could not extend note formatting - NotesApp not found');
        }
    };
    
    /**
     * Save the note content, ensuring image data is properly stored
     * @param {string} content - The note content
     * @returns {string} - Content with any new image data stored separately
     */
    const prepareContentForSaving = (content) => {
        if (!content) return content;
        
        // Extract any inline base64 images and convert them to our ID format
        const processedContent = content.replace(/!\[image\]\((data:image\/[^)]+)\)/g, (match, imageData) => {
            // Generate ID for this previously inline image
            const imageId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            // Store the data
            imageStorage[imageId] = imageData;
            // Return the shorter ID format
            return `![image:${imageId}]`;
        });
        
        return processedContent;
    };
    
    /**
     * Load images from a note into our storage
     * @param {string} content - The note content to process
     * @returns {string} - The same content, but with images loaded into memory
     */
    const loadImagesFromContent = (content) => {
        if (!content) return content;
        
        // Look for image IDs and ensure they're in our storage
        content.replace(/!\[image:(img_[0-9]+_[0-9]+)\]/g, (match, imageId) => {
            // Check if we already have this image in storage
            if (!imageStorage[imageId]) {
                // If not, it might be in the database as a full image
                // We'll handle this in the NotesApp.loadNote function
                console.log(`Image ${imageId} not found in storage`);
            }
            return match; // Just for the regex, doesn't modify content
        });
        
        return content;
    };
    
    /**
     * Extract image data from content when loading a note
     * @param {Object} note - The note object with content
     * @returns {Object} - The same note with images processed
     */
    const processNoteOnLoad = (note) => {
        if (!note || !note.content) return note;
        
        // Extract image data to our storage if it's using the old format
        note.content = note.content.replace(/!\[image\]\((data:image\/[^)]+)\)/g, (match, imageData) => {
            // Generate ID for this previously inline image
            const imageId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            // Store the data
            imageStorage[imageId] = imageData;
            // Return the shorter ID format
            return `![image:${imageId}]`;
        });
        
        // Also load any existing image IDs into our storage
        loadImagesFromContent(note.content);
        
        return note;
    };
    
    /**
     * Hook into NotesApp to handle images when loading and saving notes
     */
    const integrateWithNotesApp = () => {
        if (typeof NotesApp === 'undefined') {
            console.error('ImageHandler: NotesApp not available for integration');
            return;
        }
        
        // Store original loadNote function
        const originalLoadNote = NotesApp.loadNote;
        
        // Override loadNote to process images
        NotesApp.loadNote = function(noteId) {
            // Call original function first
            const result = originalLoadNote.call(NotesApp, noteId);
            
            // Process note content if a note was loaded
            if (NotesApp.state.currentEditingNote) {
                processNoteOnLoad(NotesApp.state.currentEditingNote);
                
                // Update the editor content if needed
                if (NotesApp.dom.noteContentInput && NotesApp.state.currentEditingNote.content) {
                    NotesApp.dom.noteContentInput.value = NotesApp.state.currentEditingNote.content;
                }
            }
            
            return result;
        };
        
        // Store original saveNote function
        const originalSaveNote = NotesApp.saveNote;
        
        // Override saveNote to process images
        NotesApp.saveNote = function(note) {
            // Process the note content before saving
            if (note && note.content) {
                note.content = prepareContentForSaving(note.content);
            }
            
            // Call original function with processed note
            return originalSaveNote.call(NotesApp, note);
        };
        
        console.log('ImageHandler: Integrated with NotesApp for loading and saving notes');
    };
    
    /**
     * Add necessary CSS styles for image handling
     */
    const addStyles = () => {
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            .image-drop-active {
                border: 2px dashed #5ccfe6 !important;
                background-color: rgba(92, 207, 230, 0.1) !important;
            }
            
            .note-image-container {
                display: block;
                margin: 10px 0;
                max-width: 100%;
                text-align: center;
            }
            
            .note-image {
                max-width: 100%;
                max-height: 500px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            }
            
            /* Style for image in preview mode */
            .note-preview .note-image-container {
                background-color: transparent;
            }
            
            /* Ensure images are properly included in PDF export */
            .pdf-preview-container .note-image {
                max-width: 100%;
                height: auto;
            }
        `;
        document.head.appendChild(styleElement);
    };
    
    // Public API
    return {
        init,
        extendNoteFormatting,
        addStyles,
        processImage,
        formatNoteContentWithImages,
        prepareContentForSaving,
        loadImagesFromContent,
        processNoteOnLoad,
        integrateWithNotesApp,
        // Expose storage for debugging and PDF export access
        getImageStorage: () => imageStorage
    };
})();

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for NotesApp to be initialized first
    if (typeof NotesApp !== 'undefined' && NotesApp.dom) {
        ImageHandler.init({
            noteContentInput: NotesApp.dom.noteContentInput,
            notePreview: NotesApp.dom.notePreview
        });
        ImageHandler.extendNoteFormatting();
        ImageHandler.addStyles();
        ImageHandler.integrateWithNotesApp();
    } else {
        // If NotesApp is not available yet, wait for it
        window.addEventListener('NotesAppReady', () => {
            ImageHandler.init({
                noteContentInput: NotesApp.dom.noteContentInput,
                notePreview: NotesApp.dom.notePreview
            });
            ImageHandler.extendNoteFormatting();
            ImageHandler.addStyles();
            ImageHandler.integrateWithNotesApp();
        });
    }
});