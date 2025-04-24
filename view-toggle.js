// --- view-toggle.js ---
// --- Global Namespace for App ---
const App = {};

// --- Configuration & Constants ---
App.config = {
    DB_NAME: 'journeyNotesDB_v2', // Keep consistent name and version
    DB_VERSION: 2, // Incremented if schema changes
    TASK_STORE_NAME: 'tasks',
    FOLDER_STORE_NAME: 'folders',
    NOTE_STORE_NAME: 'notes',
    NOTE_SAVE_DEBOUNCE: 1500, // ms
};

// --- Shared State ---
App.state = {
    currentView: 'calendar', // 'calendar' or 'notes'
    db: null, // Database connection object
    // Data will be loaded into specific module states (CalendarApp.state, NotesApp.state)
};

// --- Shared DOM Elements ---
App.dom = {
    bodyElement: document.body,
    appHeader: document.querySelector('.app-header'),
    viewToggleBtn: document.getElementById('viewToggleBtn'),
    appTitle: document.getElementById('appTitle'),
    calendarViewContainer: document.querySelector('.app-container.calendar-view'),
    notesViewContainer: document.querySelector('.notes-app-container.notes-view'),
    // Modal overlay (referenced by calendar app)
    taskDetailsModal: document.getElementById('taskDetailsModal'),
    // Key Input elements for focusing
    taskInput: document.getElementById('taskInput'), // Calendar
    addRootFolderBtn: document.getElementById('addRootFolderBtn'), // Notes
    newFolderNameInput: document.getElementById('newFolderNameInput'), // Notes (hidden)
    addNoteBtn: document.getElementById('addNoteBtn'), // Notes
    noteTitleInput: document.getElementById('noteTitleInput') // Notes
};

// --- Shared Utility Functions ---

/**
 * Generates a simple unique ID.
 * @returns {string} A unique ID string.
 */
App.generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

/**
 * Re-renders Feather icons on the page. Should be called after adding new icons dynamically.
 */
App.refreshIcons = () => {
    if (typeof feather !== 'undefined' && typeof feather.replace === 'function') {
        try {
             feather.replace();
        } catch (error) {
            console.error("Feather icon replacement error:", error);
        }
    } else {
        // console.warn("Feather icons library not found or replace function missing.");
    }
};

/**
 * Sets a loading state indicator (basic console log version).
 * @param {boolean} isLoading - Whether loading is active.
 * @param {string} [message="Loading..."] - Message to display.
 */
App.setLoadingState = (isLoading, message = "Loading...") => {
    // Placeholder - enhance with a real UI indicator if needed
    if (isLoading) {
        console.log("Loading:", message);
        // Example: Add class to body for global spinner
        // App.dom.bodyElement.classList.add('is-loading');
    } else {
        console.log("Loading complete.");
        // Example: Remove class from body
        // App.dom.bodyElement.classList.remove('is-loading');
    }
};


// --- IndexedDB Management ---

/**
 * Opens and initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database object.
 */
App.openDB = () => {
    return new Promise((resolve, reject) => {
        console.log(`Opening database ${App.config.DB_NAME} version ${App.config.DB_VERSION}`);
        const request = indexedDB.open(App.config.DB_NAME, App.config.DB_VERSION);

        request.onerror = (event) => {
            console.error("Database error:", event.target.errorCode);
            reject("Database error: " + event.target.errorCode);
        };

        request.onsuccess = (event) => {
            App.state.db = event.target.result;
            console.log("Database opened successfully.");
            // Generic error handler for the connection
            App.state.db.onerror = (event) => {
                console.error("Generic Database Error:", event.target.error);
            };
            resolve(App.state.db);
        };

        request.onupgradeneeded = (event) => {
            console.log("Database upgrade needed.");
            const db = event.target.result;
            const transaction = event.target.transaction;
            if (!transaction) {
                console.error("Upgrade transaction is null!");
                reject("Upgrade failed: transaction missing.");
                return;
            }

             // --- Task Store ---
            if (!db.objectStoreNames.contains(App.config.TASK_STORE_NAME)) {
                const taskStore = db.createObjectStore(App.config.TASK_STORE_NAME, { keyPath: 'id' });
                taskStore.createIndex('dateIndex', 'originalDate', { unique: false });
                taskStore.createIndex('importantIndex', 'important', { unique: false });
                taskStore.createIndex('recurringIndex', 'isRecurringWeekly', { unique: false });
                console.log("Task object store created.");
            } else {
                 // Check/add indices if store exists (idempotent checks)
                 try {
                     const taskStore = transaction.objectStore(App.config.TASK_STORE_NAME);
                     if (!taskStore.indexNames.contains('dateIndex')) {
                         taskStore.createIndex('dateIndex', 'originalDate', { unique: false });
                     }
                     if (!taskStore.indexNames.contains('importantIndex')) {
                         taskStore.createIndex('importantIndex', 'important', { unique: false });
                     }
                     if (!taskStore.indexNames.contains('recurringIndex')) {
                        taskStore.createIndex('recurringIndex', 'isRecurringWeekly', { unique: false });
                     }
                     console.log("Task object store verified/updated.");
                 } catch (e) {
                     console.error("Error accessing/modifying existing task store:", e);
                     transaction.abort(); // Abort the transaction
                     reject(`Upgrade failed: error with task store - ${e.message}`);
                     return;
                 }
            }

            // --- Folder Store ---
            if (!db.objectStoreNames.contains(App.config.FOLDER_STORE_NAME)) {
                const folderStore = db.createObjectStore(App.config.FOLDER_STORE_NAME, { keyPath: 'id' });
                folderStore.createIndex('parentIdIndex', 'parentId', { unique: false });
                console.log("Folder object store created.");
            } else {
                 try {
                     const folderStore = transaction.objectStore(App.config.FOLDER_STORE_NAME);
                     if (!folderStore.indexNames.contains('parentIdIndex')) {
                         folderStore.createIndex('parentIdIndex', 'parentId', { unique: false });
                     }
                     console.log("Folder object store verified/updated.");
                 } catch (e) {
                      console.error("Error accessing/modifying existing folder store:", e);
                      transaction.abort();
                      reject(`Upgrade failed: error with folder store - ${e.message}`);
                      return;
                 }
            }

            // --- Note Store ---
            if (!db.objectStoreNames.contains(App.config.NOTE_STORE_NAME)) {
                const noteStore = db.createObjectStore(App.config.NOTE_STORE_NAME, { keyPath: 'id' });
                noteStore.createIndex('folderIdIndex', 'folderId', { unique: false });
                noteStore.createIndex('updatedAtIndex', 'updatedAt', { unique: false }); // Useful for sorting
                console.log("Note object store created.");
            } else {
                 try {
                     const noteStore = transaction.objectStore(App.config.NOTE_STORE_NAME);
                     if (!noteStore.indexNames.contains('folderIdIndex')) {
                         noteStore.createIndex('folderIdIndex', 'folderId', { unique: false });
                     }
                     if (!noteStore.indexNames.contains('updatedAtIndex')) {
                        noteStore.createIndex('updatedAtIndex', 'updatedAt', { unique: false });
                     }
                     console.log("Note object store verified/updated.");
                 } catch(e) {
                     console.error("Error accessing/modifying existing note store:", e);
                     transaction.abort();
                     reject(`Upgrade failed: error with note store - ${e.message}`);
                     return;
                 }
            }
            console.log("Database upgrade complete.");
        };
    });
};

/**
 * Generic IndexedDB action helper.
 * @param {string} storeName - The name of the object store.
 * @param {IDBTransactionMode} mode - 'readonly' or 'readwrite'.
 * @param {'add'|'put'|'delete'|'get'|'getAll'|'getAllByIndex'|'count'|'deleteByIndex'} action - The DB operation.
 * @param {any} [data] - Data for add/put, key for get/delete, or { indexName, query } for index operations.
 * @returns {Promise<any>} Result of the operation.
 */
App.dbAction = (storeName, mode, action, data) => {
    return new Promise((resolve, reject) => {
        if (!App.state.db) return reject("Database not initialized.");

        let transaction;
        try {
            transaction = App.state.db.transaction([storeName], mode);
        } catch (error) {
            console.error(`Error starting transaction (${mode} on ${storeName}):`, error);
            return reject(`Failed to start transaction: ${error.message}`);
        }

        const store = transaction.objectStore(storeName);
        let request;

        // Handle transaction errors globally for this operation
        transaction.onerror = (event) => {
            console.error(`DB Transaction Error (${action} on ${storeName}):`, event.target.error);
            reject(`Transaction error during ${action} on ${storeName}: ${event.target.error?.message || 'Unknown transaction error'}`);
        };
        // transaction.oncomplete = () => console.log(`${action} transaction completed on ${storeName}.`); // Optional: Can be noisy

        try {
            switch (action) {
                case 'add': request = store.add(data); break;
                case 'put': request = store.put(data); break;
                case 'delete': request = store.delete(data); break; // `data` is the key
                case 'get': request = store.get(data); break;       // `data` is the key
                case 'getAll': request = store.getAll(); break;
                case 'count': request = store.count(); break;
                case 'getAllByIndex':
                    if (!data || !data.indexName) return reject("Index name required for getAllByIndex");
                    const indexGetAll = store.index(data.indexName);
                    request = indexGetAll.getAll(data.query); // query can be undefined/null
                    break;
                case 'deleteByIndex': // Custom action needed for deleting multiple items by index
                    if (!data || !data.indexName || data.query === undefined) return reject("Index name and query required for deleteByIndex");
                    const indexDelete = store.index(data.indexName);
                    const cursorReq = indexDelete.openCursor(IDBKeyRange.only(data.query));
                    let deleteCount = 0;
                    const deleteErrors = [];

                    cursorReq.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const deleteReq = cursor.delete();
                            deleteReq.onerror = (e) => { // Add error handling for individual delete
                                const errorMsg = `Error deleting item with key ${cursor.primaryKey}: ${e.target.error}`;
                                console.error(errorMsg);
                                deleteErrors.push(errorMsg);
                                // Continue even if one delete fails
                            };
                            deleteReq.onsuccess = () => {
                                deleteCount++;
                            };
                            cursor.continue();
                        } else {
                            // End of cursor
                            // We resolve/reject inside the transaction's oncomplete/onerror handlers
                            // to ensure all deletes have been attempted.
                        }
                    };
                    cursorReq.onerror = (event) => {
                        // Error opening cursor is fatal for this action
                        reject(`Error opening cursor for deletion: ${event.target.error}`);
                    };
                    // Override transaction complete/error for this specific action
                    transaction.oncomplete = () => {
                        console.log(`Finished 'deleteByIndex'. Attempted: ${deleteCount}. Errors: ${deleteErrors.length}`);
                        if (deleteErrors.length > 0) {
                            // Resolve with partial success info? Or reject?
                            // Resolving with count might be misleading if there were errors.
                            // Let's reject if there were any errors.
                             reject(`deleteByIndex completed with ${deleteErrors.length} errors. First error: ${deleteErrors[0]}`);
                        } else {
                            resolve(deleteCount); // Resolve with the count deleted successfully
                        }
                    };
                     transaction.onerror = (event) => { // Ensure this specific onerror is used too
                         console.error(`DB Transaction Error during deleteByIndex on ${storeName}:`, event.target.error);
                         reject(`Transaction error during deleteByIndex: ${event.target.error?.message || 'Unknown transaction error'}`);
                     };

                    return; // Exit early as cursor logic handles resolution via transaction complete/error

                default:
                    reject(`Invalid DB action: ${action}`);
                    return;
            }

            // Standard request handlers (for non-cursor actions)
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => {
                console.error(`DB Request Error (${action} on ${storeName}):`, event.target.error);
                reject(`Error performing ${action} on ${storeName}: ${event.target.error?.message || 'Unknown request error'}`);
                // Prevent transaction error from also firing if possible
                event.stopPropagation();
                event.preventDefault();
            };

        } catch (error) {
            console.error(`Error preparing DB request (${action} on ${storeName}):`, error);
            reject(`Failed to prepare request: ${error.message}`);
            // Abort the transaction if the request couldn't even be created
            if (transaction && typeof transaction.abort === 'function') {
                 transaction.abort();
            }
        }
    });
};


// --- Settings Menu Functions ---
// Moved to settings.js

// --- Theme Management ---
// Moved to settings.js

// --- View Switching Logic ---

/**
 * Switches the application view between 'calendar' and 'notes'.
 * @param {'calendar' | 'notes'} viewName - The name of the view to switch to.
 * @param {boolean} [skipFocus=false] - If true, skips auto-focusing on input fields.
 */
App.setView = (viewName, skipFocus = false) => {
    if (viewName !== 'calendar' && viewName !== 'notes') {
        console.warn(`Invalid view name: ${viewName}. Defaulting to calendar.`);
        viewName = 'calendar';
    }

    const isAlreadySet = viewName === App.state.currentView && App.dom.bodyElement.classList.contains(`${viewName}-view-active`);
    if (isAlreadySet) {
        return; // No change needed
    }

    console.log(`Switching view to: ${viewName}`);
    App.state.currentView = viewName;

    const isCalendar = viewName === 'calendar';
    const isNotes = viewName === 'notes';

    // --- Update Body Classes ---
    App.dom.bodyElement.classList.toggle('calendar-view-active', isCalendar);
    App.dom.bodyElement.classList.toggle('notes-view-active', isNotes);

    // --- Update Container Display ---
    if (App.dom.calendarViewContainer) {
        App.dom.calendarViewContainer.style.display = isCalendar ? 'grid' : 'none';
    } else { console.warn("Calendar container not found in DOM."); }

    if (App.dom.notesViewContainer) {
        App.dom.notesViewContainer.style.display = isNotes ? 'grid' : 'none';
    } else { console.warn("Notes container not found in DOM."); }


    // --- Update Header ---
    if (App.dom.appTitle) {
        // Set title when switching TO notes.
        // Calendar title is updated by its own render function.
        if (isNotes) {
            App.dom.appTitle.textContent = '[ Notes ]';
        }
        // Calendar title is set dynamically by CalendarApp.renderTaskList when view becomes active
    }
    if (App.dom.viewToggleBtn) {
        App.dom.viewToggleBtn.innerHTML = isCalendar
            ? '<i data-feather="calendar"></i>' // Show Calendar icon when in Calendar view
            : '<i data-feather="book"></i>'; // Show Notes icon when in Notes view
        App.dom.viewToggleBtn.title = isCalendar ? "Switch to Notes View" : "Switch to Calendar View";
    }

    // --- Refresh Icons ---
    App.refreshIcons();

    // --- Trigger Renders / Focus ---
    // Ensure modules and state are initialized before calling methods/accessing state
    if (isCalendar && typeof CalendarApp !== 'undefined' && CalendarApp.state?.isInitialized) {
         // Render the calendar view which also updates the H1 title via renderTaskList
         CalendarApp.renderCurrentCalendarView();
         
         // Only focus if skipFocus is false
         if (!skipFocus && App.dom.taskInput) {
             // Focus task input, slight delay can help ensure element is focusable after display change
             setTimeout(() => App.dom.taskInput.focus(), 0);
         }
    } else if (isNotes && typeof NotesApp !== 'undefined' && NotesApp.state?.isInitialized) {
         // Notes title is already set. Consider if full render needed every time.
         // NotesApp.renderFullNotesView();

         // Only apply focus logic if skipFocus is false
         if (!skipFocus) {
             let focused = false;
             // If adding folder input is visible, focus that
             if (NotesApp.state.isAddingFolder && App.dom.newFolderNameInput) {
                  setTimeout(() => App.dom.newFolderNameInput.focus(), 0);
                  focused = true;
             }
             // If no folder selected, focus Add Root Folder btn
             else if (!NotesApp.state.selectedFolderId && App.dom.addRootFolderBtn) {
                 setTimeout(() => App.dom.addRootFolderBtn.focus(), 0);
                 focused = true;
             }
             // If folder selected, but no note, focus Add Note btn (if enabled)
             else if (NotesApp.state.selectedFolderId && !NotesApp.state.selectedNoteId && App.dom.addNoteBtn && !App.dom.addNoteBtn.disabled) {
                 setTimeout(() => App.dom.addNoteBtn.focus(), 0);
                 focused = true;
             }
             // If note selected, focus title input
             else if (NotesApp.state.selectedNoteId && App.dom.noteTitleInput) {
                setTimeout(() => App.dom.noteTitleInput.focus(), 0);
                 focused = true;
             }
             // Fallback focus? Maybe sidebar container?
             // if (!focused) { setTimeout(() => NotesApp.dom.notesSidebar?.focus(), 0); }
         }
    }

     // --- Save Last View ---
     try {
        localStorage.setItem('lastActiveView', viewName);
     } catch (e) {
        console.warn("Could not save last view to localStorage:", e);
     }
};

/**
 * Toggles between the 'calendar' and 'notes' views.
 * @param {boolean} [skipFocus=true] - If true, skips auto-focusing on input fields.
 */
App.toggleView = (skipFocus = true) => {
    // If notes view is active AND the folder input is shown, cancel adding first
    if (App.state.currentView === 'notes' && typeof NotesApp !== 'undefined' && NotesApp.state?.isAddingFolder) {
        NotesApp.hideAddFolderInput(false); // Hide without focusing trigger
    }
    // Then toggle the view
    App.setView(App.state.currentView === 'calendar' ? 'notes' : 'calendar', skipFocus);
};


// --- Initialization ---

/**
 * Main application initialization function.
 */
App.init = async () => {
    console.log("Initializing application...");
    App.setLoadingState(true, "Initializing...");

    try {
        // 1. Open Database
        await App.openDB();
        if (!App.state.db) throw new Error("Database connection failed.");
        console.log("DB Opened.");

        // 2. Initialize Modules (they handle their own data loading)
        let calendarInitPromise = Promise.resolve();
        let notesInitPromise = Promise.resolve();

        if (typeof CalendarApp !== 'undefined' && typeof CalendarApp.init === 'function') {
            calendarInitPromise = CalendarApp.init().then(() => console.log("Calendar module initialized."));
        } else {
            console.warn("CalendarApp module not found or init function missing.");
        }

        if (typeof NotesApp !== 'undefined' && typeof NotesApp.init === 'function') {
            notesInitPromise = NotesApp.init().then(() => console.log("Notes module initialized."));
        } else {
            console.warn("NotesApp module not found or init function missing.");
        }

        // Wait for both modules to initialize
        await Promise.all([calendarInitPromise, notesInitPromise]);
        console.log("All modules initialized.");


        // 3. Determine and Set Initial View (DOM manipulation happens AFTER modules are ready)
        let lastView = 'calendar'; // Default
        try {
            const storedView = localStorage.getItem('lastActiveView');
            if (storedView === 'calendar' || storedView === 'notes') {
                lastView = storedView;
            }
        } catch (e) {
            console.warn("Could not read last view from localStorage:", e);
        }

        // Set the view (this will handle DOM classes, display, titles, icons, focus)
        App.setView(lastView, true); // Pass true for skipFocus to prevent auto-focusing on page load
        console.log(`Initial view set to: ${App.state.currentView}`);


        // 4. Setup Global Event Listeners
        App.dom.viewToggleBtn?.addEventListener('click', App.toggleView);

        // Initialize Settings module if available
        if (typeof Settings !== 'undefined' && typeof Settings.init === 'function') {
            Settings.init();
            console.log("Settings module initialized");
        } else {
            console.warn("Settings module not found or init function missing");
        }

        document.addEventListener('keydown', (event) => {
            // Close Calendar Task Details Modal on Escape
            if (event.key === 'Escape' && App.dom.taskDetailsModal?.classList.contains('visible')) {
                if (typeof CalendarApp !== 'undefined' && typeof CalendarApp.closeModal === 'function') {
                     CalendarApp.closeModal();
                }
            }
            // Close Notes Add Folder Input on Escape (Global fallback)
             else if (event.key === 'Escape' && App.state.currentView === 'notes' && typeof NotesApp !== 'undefined' && NotesApp.state?.isAddingFolder) {
                 NotesApp.hideAddFolderInput(true); // Focus trigger button
             }
            // Note save shortcut (Ctrl+S) is handled within NotesApp
        });

        window.addEventListener('beforeunload', () => {
            try {
                 localStorage.setItem('lastActiveView', App.state.currentView);
            } catch (e) {
                console.warn("Could not save last view state on unload:", e);
            }
        });

        // 5. Initial Icon Render (already done by setView)
        // App.refreshIcons(); - Called within setView

        console.log("Application initialization complete.");

    } catch (error) {
        console.error("Application Initialization Failed:", error);
        App.dom.bodyElement.innerHTML = `<div style="color: #ff6b6b; background: #2a2a2d; border: 1px solid #ff6b6b; padding: 20px; margin: 20px; text-align: center; border-radius: 5px;">
            <h2 style="margin-bottom: 10px;">Application Initialization Failed</h2>
            <p style="margin-bottom: 15px;">Could not initialize the database or load application components. Please check the console for errors and try refreshing.</p>
            <pre style="text-align: left; background: #1e1e1e; padding: 10px; border-radius: 3px; font-size: 0.9em; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word;">${error.stack || error.message}</pre>
        </div>`;
    } finally {
        App.setLoadingState(false);
    }
};

// Note: Initialization is triggered by DOMContentLoaded in index.html calling App.init