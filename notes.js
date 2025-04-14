// --- notes.js ---
// Manages Notes View logic: folders, notes list, editor.

const NotesApp = {};

// --- Notes DOM Elements ---
NotesApp.dom = {
    notesViewContainer: App.dom.notesViewContainer, // Shared reference
    folderTreeUl: document.getElementById('folderTree'),
    addRootFolderBtn: document.getElementById('addRootFolderBtn'),
    foldersEmptyState: document.getElementById('foldersEmptyState'),
    noteListUl: document.getElementById('noteList'),
    notesListTitle: document.getElementById('notesListTitle'),
    addNoteBtn: document.getElementById('addNoteBtn'),
    notesListEmptyStatesContainer: document.getElementById('notesListEmptyStatesContainer'),
    notesSelectFolderEmptyState: document.getElementById('notesSelectFolderEmptyState'),
    notesInFolderEmptyState: document.getElementById('notesInFolderEmptyState'),
    editorPlaceholder: document.getElementById('editorPlaceholder'),
    noteEditorDiv: document.getElementById('noteEditor'),
    noteTitleInput: document.getElementById('noteTitleInput'),
    noteContentInput: document.getElementById('noteContentInput'),
    saveNoteBtn: document.getElementById('saveNoteBtn'),
    deleteNoteBtn: document.getElementById('deleteNoteBtn'),
    noteStatus: document.getElementById('noteStatus'),
    // Folder Input Elements
    notesSidebarActions: document.querySelector('.notes-sidebar-actions'),
    addFolderInputArea: document.getElementById('addFolderInputArea'),
    newFolderNameInput: document.getElementById('newFolderNameInput'),
    confirmAddFolderBtn: document.getElementById('confirmAddFolderBtn'),
    cancelAddFolderBtn: document.getElementById('cancelAddFolderBtn'),
};

// --- Notes State ---
NotesApp.state = {
    folders: [], // Array of folder objects {id, name, parentId, createdAt}
    notes: {}, // Map: { folderId: [noteObj, ...] }
    selectedFolderId: null, // ID of the currently selected folder (null if none)
    selectedNoteId: null,   // ID of the currently selected note (null if none)
    currentEditingNote: null, // A *copy* of the full note object being edited {id, folderId, title, content,...}
    noteChangeTimeout: null, // Timeout ID for debouncing save status message
    isInitialized: false,
    // Folder Input State
    isAddingFolder: false,     // Flag indicating if the add folder input is visible
    addFolderParentId: null, // ID of the folder to add into (null for root)
    targetFolderElement: null, // The LI element being added into (for visual styling)
    // Folder Expansion State
    expandedFolderIds: new Set(), // Set of folder IDs that are currently expanded
    // Concurrency Locks (simple flag mechanism to prevent rapid multi-clicks)
    deletingFolderId: null,
    deletingNoteId: null,
};

// --- Notes Configuration ---
NotesApp.config = {
    NOTE_SAVE_DEBOUNCE: App.config.NOTE_SAVE_DEBOUNCE, // Use shared config (1500ms)
};

// --- Notes DB Interaction (Uses Shared App.dbAction) ---
NotesApp.addFolderDB = (folder) => App.dbAction(App.config.FOLDER_STORE_NAME, 'readwrite', 'add', folder);
NotesApp.updateFolderDB = (folder) => App.dbAction(App.config.FOLDER_STORE_NAME, 'readwrite', 'put', folder);
NotesApp.deleteFolderDB = (folderId) => App.dbAction(App.config.FOLDER_STORE_NAME, 'readwrite', 'delete', folderId);
NotesApp.getAllFoldersDB = () => App.dbAction(App.config.FOLDER_STORE_NAME, 'readonly', 'getAll');
// *** Correct handling for null parentId query ***
NotesApp.getFoldersByParentDB = (parentId) => App.dbAction(App.config.FOLDER_STORE_NAME, 'readonly', 'getAllByIndex', { indexName: 'parentIdIndex', query: (parentId === null ? IDBKeyRange.only(null) : parentId) });

NotesApp.addNoteDB = (note) => App.dbAction(App.config.NOTE_STORE_NAME, 'readwrite', 'add', note);
NotesApp.updateNoteDB = (note) => App.dbAction(App.config.NOTE_STORE_NAME, 'readwrite', 'put', note);
NotesApp.deleteNoteDB = (noteId) => App.dbAction(App.config.NOTE_STORE_NAME, 'readwrite', 'delete', noteId);
NotesApp.getNoteByIdDB = (noteId) => App.dbAction(App.config.NOTE_STORE_NAME, 'readonly', 'get', noteId);
NotesApp.getNotesByFolderDB = (folderId) => App.dbAction(App.config.NOTE_STORE_NAME, 'readonly', 'getAllByIndex', { indexName: 'folderIdIndex', query: folderId });
NotesApp.deleteNotesByFolderDB = (folderId) => App.dbAction(App.config.NOTE_STORE_NAME, 'readwrite', 'deleteByIndex', { indexName: 'folderIdIndex', query: folderId });
NotesApp.getAllNotesDB = () => App.dbAction(App.config.NOTE_STORE_NAME, 'readonly', 'getAll');


// --- Notes Data Loading & Processing ---
/** Loads all folders and notes from DB, populates state */
NotesApp.loadNotesData = async () => {
    try {
        App.setLoadingState(true, "Loading notes data...");

        // 1. Load Folders
        const foldersFromDB = await NotesApp.getAllFoldersDB();
        // Filter out potentially invalid entries and ensure parentId is null if missing
        NotesApp.state.folders = foldersFromDB
            .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string')
            .map(f => ({
                id: f.id,
                name: f.name,
                parentId: f.parentId ?? null, // Default to null if undefined/null
                createdAt: f.createdAt || Date.now(),
            }));
        NotesApp.state.folders.sort((a, b) => a.name.localeCompare(b.name)); // Keep sorted alphabetically
        console.log("Notes: Folders loaded from DB:", NotesApp.state.folders.length);
        const existingFolderIds = new Set(NotesApp.state.folders.map(f => f.id));

        // 2. Load Notes and Group by folderId
        const allNotesFromDB = await NotesApp.getAllNotesDB();
        NotesApp.state.notes = {}; // Reset map before population
        const orphanNoteIdsToDelete = []; // Collect notes whose folders don't exist

        allNotesFromDB.forEach(note => {
            // Basic validation - ensure folderId exists, even if null
            if (!note || typeof note.id !== 'string' || typeof note.folderId === 'undefined') {
                console.warn("Note missing ID or folderId, skipping:", note);
                return;
            }
            // Check if note's folder exists (only if folderId is not null)
            if (note.folderId !== null && !existingFolderIds.has(note.folderId)) {
                console.warn(`Note ${note.id} ("${note.title}") belongs to non-existent folder ${note.folderId}. Marking for deletion.`);
                orphanNoteIdsToDelete.push(note.id);
                return; // Skip adding to state
            }

            // Ensure standard note structure
            const validNote = {
                id: note.id,
                folderId: note.folderId, // Keep potentially null folderId
                title: note.title ?? "Untitled Note",
                content: note.content ?? "",
                createdAt: note.createdAt || Date.now(),
                updatedAt: note.updatedAt || note.createdAt || Date.now(),
            };

            // Group notes by folderId (using null as a key if needed)
            const groupingKey = validNote.folderId;
            if (!NotesApp.state.notes[groupingKey]) {
                NotesApp.state.notes[groupingKey] = [];
            }
            NotesApp.state.notes[groupingKey].push(validNote);
        });

        // Sort notes within each folder group (by updated time descending)
        Object.values(NotesApp.state.notes).forEach(notesInFolder => {
            notesInFolder.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        });

        console.log("Notes: Notes loaded and grouped:", allNotesFromDB.length - orphanNoteIdsToDelete.length, "valid notes in", Object.keys(NotesApp.state.notes).length, "groupings.");

        // 3. Delete Orphan Notes (optional but recommended for cleanup)
        if (orphanNoteIdsToDelete.length > 0) {
            console.log(`Attempting to delete ${orphanNoteIdsToDelete.length} orphan notes...`);
            const deletePromises = orphanNoteIdsToDelete.map(id =>
                NotesApp.deleteNoteDB(id).catch(err => console.error(`Error deleting orphan note ${id}:`, err))
            );
            await Promise.all(deletePromises);
            console.log("Orphan note cleanup complete.");
        }

    } catch (error) {
        console.error("Notes: Failed to load notes data:", error);
        // Set default empty state on critical failure
        NotesApp.state.folders = [];
        NotesApp.state.notes = {};
        alert("Error loading notes data. Check console for details.");
    } finally {
        App.setLoadingState(false); // Ensure loading state is always cleared
    }
};


// --- Notes Rendering Functions ---

/** Renders the nested folder structure in the sidebar */
NotesApp.renderFolderTree = () => {
    const { folderTreeUl, foldersEmptyState } = NotesApp.dom;
    if (!folderTreeUl || !foldersEmptyState) {
        console.error("Missing folder tree DOM elements.");
        return;
    }

    folderTreeUl.innerHTML = ''; // Clear previous tree

    const folders = NotesApp.state.folders;
    const hasFolders = folders.length > 0;

    foldersEmptyState.style.display = hasFolders ? 'none' : 'flex';
    folderTreeUl.style.display = hasFolders ? '' : 'none';

    if (hasFolders) {
        // Build a map of parentId -> [childFolder, ...] for efficient lookup
        const childrenMap = {};
        folders.forEach(f => {
            const parentIdKey = f.parentId === null ? 'root' : f.parentId; // Use 'root' for top-level
            if (!childrenMap[parentIdKey]) childrenMap[parentIdKey] = [];
            childrenMap[parentIdKey].push(f);
        });

        // Sort children within each level
        for (const parentIdKey in childrenMap) {
            childrenMap[parentIdKey].sort((a, b) => a.name.localeCompare(b.name));
        }

        // Render root level folders first
        const rootFolders = childrenMap['root'] || [];
        rootFolders.forEach(folder => {
            const folderEl = renderFolder(folder, childrenMap);
            folderTreeUl.appendChild(folderEl);
        });
    }
    
    // Helper function to render a folder and return its DOM element
    function renderFolder(folder, childrenMap) {
        // Check if this folder has children
        const hasChildren = (childrenMap[folder.id]?.length > 0);
        const isExpanded = NotesApp.state.expandedFolderIds.has(folder.id);
        
        // Create folder container (holds the folder item and its children)
        const folderContainer = document.createElement('div');
        folderContainer.className = 'folder-container';
        folderContainer.dataset.folderId = folder.id;
        
        // Create the folder item (LI element)
        const li = NotesApp.createFolderListItem(folder, hasChildren, isExpanded);
        folderContainer.appendChild(li);
        
        // If this folder has children, render them in a subfolder container
        if (hasChildren) {
            // Create subfolder container (UL) to hold children
            const subfolderContainer = document.createElement('ul');
            subfolderContainer.className = 'subfolder-container';
            subfolderContainer.dataset.parentId = folder.id;
            
            // Apply visibility based on expansion state
            subfolderContainer.style.display = isExpanded ? '' : 'none';
            
            // Render each child folder
            const children = childrenMap[folder.id] || [];
            children.forEach(childFolder => {
                const childEl = renderFolder(childFolder, childrenMap);
                subfolderContainer.appendChild(childEl);
            });
            
            // Add the subfolder container after the folder item
            folderContainer.appendChild(subfolderContainer);
        }
        
        return folderContainer;
    }
    
    // Make sure Feather icons are properly rendered
    if (typeof feather !== 'undefined') {
        try {
            setTimeout(() => feather.replace(), 0); // Use setTimeout to ensure DOM is ready
        } catch (e) {
            console.error("Error replacing feather icons:", e);
        }
    }
};

/** Creates a single folder list item (LI) element with content and actions */
NotesApp.createFolderListItem = (folder, hasChildren = false, isExpanded = false) => {
    const li = document.createElement('li');
    li.classList.add('folder-item');
    li.dataset.folderId = folder.id;

    // Apply styles based on state
    if (folder.id === NotesApp.state.selectedFolderId) li.classList.add('selected');
    if (NotesApp.state.isAddingFolder && NotesApp.state.addFolderParentId === folder.id) li.classList.add('adding-subfolder');
    if (isExpanded) li.classList.add('expanded');

    // Folder Content (Icon + Name)
    const content = document.createElement('div');
    content.classList.add('folder-content');
    
    // Use proper Feather icons based on expansion state and children
    const iconElement = document.createElement('i');
    
    // Choose the appropriate folder icon based on state
    let folderIcon;
    if (hasChildren) {
        folderIcon = isExpanded ? 'folder-minus' : 'folder-plus';
    } else {
        folderIcon = 'folder';
    }
    
    iconElement.setAttribute('data-feather', folderIcon);
    content.appendChild(iconElement);
    
    // Add folder name as a separate span
    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name';
    nameSpan.textContent = folder.name;
    content.appendChild(nameSpan);
    
    // Click listener for selecting and expanding/collapsing the folder
    content.addEventListener('click', (e) => {
        if (NotesApp.state.isAddingFolder) return;
        
        if (hasChildren && e.target === iconElement || e.target.closest('svg')) {
            // Click on the icon toggles expansion for folders with children
            NotesApp.toggleFolderExpansion(folder.id);
            e.stopPropagation(); // Don't select the folder when toggling expansion
        } else {
            // Click elsewhere selects the folder
            NotesApp.selectFolder(folder.id);
        }
    });

    // Folder Actions (Add Subfolder, Delete)
    const actions = document.createElement('div');
    actions.classList.add('folder-actions');

    // Add Subfolder Button (with Feather icon)
    const addBtn = document.createElement('button');
    addBtn.className = 'add-subfolder-btn';
    addBtn.title = 'Add Subfolder';
    
    const addIcon = document.createElement('i');
    addIcon.setAttribute('data-feather', 'folder-plus');
    addBtn.appendChild(addIcon);
    
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering folder selection
        // We need to pass the folder ID directly instead of relying on DOM structure
        NotesApp.showAddFolderInput(folder.id, li);
    });
    actions.appendChild(addBtn);

    // Delete Button (with Feather icon)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-folder-btn';
    deleteBtn.title = 'Delete Folder';
    
    const deleteIcon = document.createElement('i');
    deleteIcon.setAttribute('data-feather', 'trash-2');
    deleteBtn.appendChild(deleteIcon);
    
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering folder selection
        NotesApp.handleDeleteFolder(folder.id, folder.name);
    });
    actions.appendChild(deleteBtn);

    li.appendChild(content);
    li.appendChild(actions);
    return li;
};

/** Toggles the expansion state of a folder */
NotesApp.toggleFolderExpansion = (folderId) => {
    const isCurrentlyExpanded = NotesApp.state.expandedFolderIds.has(folderId);
    
    if (isCurrentlyExpanded) {
        // Collapse the folder
        NotesApp.state.expandedFolderIds.delete(folderId);
    } else {
        // Expand the folder
        NotesApp.state.expandedFolderIds.add(folderId);
    }
    
    // Re-render the folder tree to update visuals
    NotesApp.renderFolderTree();
};

/** Renders the list of notes for the currently selected folder */
NotesApp.renderNoteList = () => {
    const {
        noteListUl, notesListTitle, addNoteBtn, notesListEmptyStatesContainer,
        notesSelectFolderEmptyState, notesInFolderEmptyState
    } = NotesApp.dom;
    const selectedFolderId = NotesApp.state.selectedFolderId;

    // --- Check required DOM elements ---
    if (!noteListUl || !notesListTitle || !addNoteBtn || !notesListEmptyStatesContainer || !notesSelectFolderEmptyState || !notesInFolderEmptyState) {
         console.error("Missing required DOM elements for note list rendering.");
         return;
    }

    // --- Reset UI State ---
    noteListUl.innerHTML = ''; // Clear the list
    noteListUl.style.display = 'none'; // Hide list initially
    notesListEmptyStatesContainer.style.display = 'flex'; // Show empty state container initially
    notesSelectFolderEmptyState.style.display = 'none'; // Hide specific empty states
    notesInFolderEmptyState.style.display = 'none';
    addNoteBtn.disabled = true; // Disable add note button initially

    // --- Determine Content Based on Selection ---
    if (selectedFolderId === null) { // Case 1: No folder selected (Root)
        notesListTitle.textContent = 'Notes';
        notesSelectFolderEmptyState.style.display = 'flex'; // Show "Select a folder"
    } else { // Case 2: A specific folder is selected
        const folder = NotesApp.state.folders.find(f => f.id === selectedFolderId);
        if (!folder) { // Safety check: selected folder exists in state
             console.error(`Selected folder ${selectedFolderId} not found in state.`);
             notesListTitle.textContent = 'Error: Folder Not Found';
             // Consider resetting selection: NotesApp.selectFolder(null);
        } else { // Folder found, render its notes
            notesListTitle.textContent = `Notes in ${NotesApp.escapeHtml(folder.name)}`;
            addNoteBtn.disabled = false; // Enable adding notes

            const notesInFolder = NotesApp.state.notes[selectedFolderId] || [];
            // Ensure notes are sorted by most recently updated
            notesInFolder.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

            if (notesInFolder.length === 0) {
                notesInFolderEmptyState.style.display = 'flex'; // Show "No notes in this folder"
            } else {
                notesListEmptyStatesContainer.style.display = 'none'; // Hide empty state container
                noteListUl.style.display = ''; // Show the list
                notesInFolder.forEach(note => {
                    const li = NotesApp.createNoteListItem(note);
                    noteListUl.appendChild(li);
                });
            }
        }
    }
};

/** Creates a single note list item (LI) element */
NotesApp.createNoteListItem = (note) => {
    const li = document.createElement('li');
    li.classList.add('note-list-item');
    li.dataset.noteId = note.id;
    if (note.id === NotesApp.state.selectedNoteId) li.classList.add('selected');

    const title = note.title || 'Untitled Note';
    // Generate a preview: first line or first 60 chars, add ellipsis if needed
    const contentPreview = note.content ? (note.content.split('\n')[0] || note.content).substring(0, 60) : '';
    const previewText = contentPreview + ((note.content?.length > 60 || (note.content && note.content.includes('\n') && contentPreview === note.content.split('\n')[0])) ? '...' : '');

    li.innerHTML = `
        <h4>${NotesApp.escapeHtml(title)}</h4>
        <p>${NotesApp.escapeHtml(previewText) || 'No content'}</p>
    `;
    li.addEventListener('click', () => NotesApp.selectNote(note.id));

    // Handle animation for newly added notes
    if (note.justAdded) {
        li.classList.add('newly-added');
        delete note.justAdded; // Remove flag after adding class so it doesn't re-animate
        // Remove animation class after it finishes
        li.addEventListener('animationend', () => li.classList.remove('newly-added'), { once: true });
    }
    return li;
};

/** Shows note content in the editor panel or displays the placeholder */
NotesApp.displayNoteContent = () => {
    const { editorPlaceholder, noteEditorDiv, noteTitleInput, noteContentInput, saveNoteBtn, deleteNoteBtn, noteStatus } = NotesApp.dom;
    if (!editorPlaceholder || !noteEditorDiv || !noteTitleInput || !noteContentInput || !saveNoteBtn || !deleteNoteBtn || !noteStatus) {
        console.error("Missing editor DOM elements.");
        return;
    }

    // Clear any pending status messages or timeouts
    clearTimeout(NotesApp.state.noteChangeTimeout);
    noteStatus.textContent = '';

    const note = NotesApp.state.currentEditingNote; // Use the copy in state

    if (NotesApp.state.selectedNoteId !== null && note) { // Check for both selected ID and the data copy
        // Show editor, hide placeholder
        noteEditorDiv.style.display = 'flex';
        editorPlaceholder.style.display = 'none';

        // Populate editor fields
        noteTitleInput.value = note.title || '';
        noteContentInput.value = note.content || '';

        // Enable/disable controls
        deleteNoteBtn.disabled = false;
        saveNoteBtn.disabled = true; // Assume no changes initially when loading
        noteTitleInput.readOnly = false;
        noteContentInput.readOnly = false;
    } else {
        // Show placeholder, hide editor
        noteEditorDiv.style.display = 'none';
        editorPlaceholder.style.display = 'flex';

        // Clear editor fields
        noteTitleInput.value = '';
        noteContentInput.value = '';

        // Disable controls
        noteTitleInput.readOnly = true;
        noteContentInput.readOnly = true;
        deleteNoteBtn.disabled = true;
        saveNoteBtn.disabled = true;

        // Ensure editing state is fully cleared if no note is selected
        if (NotesApp.state.selectedNoteId === null) {
            NotesApp.state.currentEditingNote = null;
        }
    }
    App.refreshIcons(); // Refresh save/delete icons
};

/** Convenience function to re-render all parts of the notes view if it's active */
NotesApp.renderFullNotesView = () => {
     if (App.state.currentView !== 'notes' || !NotesApp.state.isInitialized) return;
     console.log("Rendering full notes view...");
     NotesApp.renderFolderTree();
     NotesApp.renderNoteList(); 
     NotesApp.displayNoteContent();
     // Icons are refreshed within the sub-render functions where needed
};

/** Renders all the components of the Notes view */
NotesApp.renderNotesView = () => {
    console.log("Rendering complete Notes view...");
    
    // Render the folder tree first
    NotesApp.renderFolderTree();
    
    // Then render the note list based on selected folder
    NotesApp.renderNoteList();
    
    // Finally render note content based on selected note
    NotesApp.displayNoteContent();
    
    // Make sure Feather icons are properly rendered
    if (typeof feather !== 'undefined') {
        try {
            setTimeout(() => feather.replace(), 10); // Small delay to ensure DOM is updated
        } catch (e) {
            console.error("Error replacing feather icons in Notes view:", e);
        }
    }
};

// --- Notes Actions ---

/** Shows the inline input field for adding a new folder */
NotesApp.showAddFolderInput = (parentId = null, targetElement = null) => {
    const { addFolderInputArea, newFolderNameInput, notesSidebarActions, confirmAddFolderBtn, cancelAddFolderBtn, addRootFolderBtn } = NotesApp.dom;
    if (!addFolderInputArea || !newFolderNameInput || !notesSidebarActions || !confirmAddFolderBtn || !cancelAddFolderBtn || !addRootFolderBtn) return;

    // If already adding, just ensure focus
    if (NotesApp.state.isAddingFolder) {
        newFolderNameInput.focus();
        return;
    }

    // Hide any previously opened input cleanly first
    NotesApp.hideAddFolderInput(false); // Hide without triggering focus change yet

    // Set state for adding mode
    NotesApp.state.isAddingFolder = true;
    NotesApp.state.addFolderParentId = parentId;
    NotesApp.state.targetFolderElement = targetElement; // Store the folder item element

    // Update UI
    notesSidebarActions.classList.add('adding-folder'); // Hides the main "New Folder" button via CSS
    addFolderInputArea.style.display = 'flex';
    newFolderNameInput.value = '';
    newFolderNameInput.disabled = false; // Ensure input is usable
    confirmAddFolderBtn.disabled = false;
    cancelAddFolderBtn.disabled = false;

    // Visually indicate which folder we're adding into (if applicable)
    if (targetElement) {
        targetElement.classList.add('adding-subfolder');
    }

    App.refreshIcons(); // Render check/x icons inside the input area
    setTimeout(() => newFolderNameInput.focus(), 50); // Focus input after display change
};

/** Hides the inline folder input field and resets state */
NotesApp.hideAddFolderInput = (focusTriggerButton = true) => {
    const { addFolderInputArea, newFolderNameInput, notesSidebarActions, addRootFolderBtn } = NotesApp.dom;
    if (!NotesApp.state.isAddingFolder) return; // Already hidden

    if (addFolderInputArea) addFolderInputArea.style.display = 'none';
    if (newFolderNameInput) newFolderNameInput.value = ''; // Clear input
    if (notesSidebarActions) notesSidebarActions.classList.remove('adding-folder'); // Shows main "New Folder" button

    // Remove styling from parent LI if we were adding a subfolder
    if (NotesApp.state.targetFolderElement) {
        NotesApp.state.targetFolderElement.classList.remove('adding-subfolder');
    }

    const wasAddingSubfolder = !!NotesApp.state.addFolderParentId; // Check before resetting state

    // Reset state
    NotesApp.state.isAddingFolder = false;
    NotesApp.state.addFolderParentId = null;
    NotesApp.state.targetFolderElement = null;

    // Optionally refocus the main "New Folder" button, but only if we *weren't* adding a subfolder
    if (focusTriggerButton && !wasAddingSubfolder && addRootFolderBtn) {
         setTimeout(() => addRootFolderBtn.focus(), 50);
    }
    // If we were adding a subfolder, focus naturally returns to the sidebar generally.
};

/** Handles the confirmation (Save button or Enter key) for adding a folder */
NotesApp.confirmAddFolder = async () => {
    const { newFolderNameInput, confirmAddFolderBtn, cancelAddFolderBtn } = NotesApp.dom;
    if (!NotesApp.state.isAddingFolder || !newFolderNameInput || !confirmAddFolderBtn || !cancelAddFolderBtn) return;

    const folderName = newFolderNameInput.value.trim();
    if (!folderName) {
        alert("Folder name cannot be empty.");
        newFolderNameInput.focus();
        return;
    }

    const parentId = NotesApp.state.addFolderParentId; // Get parentId from state

    // Disable controls during async operation
    newFolderNameInput.disabled = true;
    confirmAddFolderBtn.disabled = true;
    cancelAddFolderBtn.disabled = true;
    App.setLoadingState(true, "Adding folder...");

    try {
        // Delegate actual add logic to handleAddFolder
        const newFolder = await NotesApp.handleAddFolder(folderName, parentId);
        NotesApp.hideAddFolderInput(false); // Hide input on success (no focus trigger)
        // Re-render the folder tree to show the new subfolder
        NotesApp.renderFolderTree();
        // Select the newly created folder after re-rendering
        setTimeout(() => NotesApp.selectFolder(newFolder.id), 10);
    } catch (error) {
        // Error already logged/alerted by handleAddFolder
        console.error("Folder addition confirmation failed:", error);
        // Re-enable controls so user can fix/cancel if the operation failed but input is still visible
        if (NotesApp.state.isAddingFolder) { // Check if still in adding state
            newFolderNameInput.disabled = false;
            confirmAddFolderBtn.disabled = false;
            cancelAddFolderBtn.disabled = false;
            newFolderNameInput.focus(); // Focus back on input for correction
        }
    } finally {
        App.setLoadingState(false);
        // Ensure controls are re-enabled if an error occurred and we are somehow still in adding mode
        if (NotesApp.state.isAddingFolder) {
            if(newFolderNameInput) newFolderNameInput.disabled = false;
            if(confirmAddFolderBtn) confirmAddFolderBtn.disabled = false;
            if(cancelAddFolderBtn) cancelAddFolderBtn.disabled = false;
        }
    }
};

/** Creates folder object, adds to DB & state, re-renders tree. Throws error on failure. */
NotesApp.handleAddFolder = async (name, parentId) => {
    const newFolder = {
        id: App.generateId(),
        name: name,
        parentId: parentId, // Will be null for root folders
        createdAt: Date.now()
    };

    try {
        await NotesApp.addFolderDB(newFolder);
        console.log("Notes: Folder added to DB:", newFolder.id, `(Parent: ${parentId})`);
        // Update state
        NotesApp.state.folders.push(newFolder);
        NotesApp.state.folders.sort((a, b) => a.name.localeCompare(b.name)); // Keep state sorted
        NotesApp.renderFolderTree(); // Update UI
        return newFolder; // Return the created folder object on success
    } catch (error) {
        console.error("Notes: Failed to add folder to DB/State:", error);
        alert(`Error saving folder "${name}": ${error.message || error}`);
        throw error; // Propagate the error back to the caller (confirmAddFolder)
    }
};

/** Selects a folder (or null to deselect/show root) */
NotesApp.selectFolder = (folderId) => { // folderId can be null
    // If user clicks a folder while the input is open, cancel the add operation first
    if (NotesApp.state.isAddingFolder) {
        NotesApp.hideAddFolderInput(false); // Hide without focusing trigger button
    }

    // No change if already selected
    if (NotesApp.state.selectedFolderId === folderId) return;

    // Check for unsaved changes in the editor *before* switching
    if (NotesApp.state.currentEditingNote && !NotesApp.dom.saveNoteBtn?.disabled) {
        if (!confirm("You have unsaved changes in the current note. Discard changes and switch folders?")) {
            return; // User cancelled the switch
        }
    }

    // Update state
    NotesApp.state.selectedFolderId = folderId;
    NotesApp.state.selectedNoteId = null; // Always deselect the note when changing folder
    NotesApp.state.currentEditingNote = null; // Clear the editing buffer
    console.log("Notes: Folder selected:", folderId === null ? "None (Root)" : folderId);

    // Update visual selection in the folder tree UI
    document.querySelectorAll('.folder-item.selected').forEach(el => el.classList.remove('selected'));
    if (folderId !== null) { // Only add 'selected' class if a specific folder is chosen
        const selectedLi = NotesApp.dom.folderTreeUl?.querySelector(`.folder-item[data-folder-id="${folderId}"]`);
        if (selectedLi) selectedLi.classList.add('selected');
    }

    // Re-render the note list and editor panels
    NotesApp.renderNoteList(); // Updates list, title, add button
    NotesApp.displayNoteContent(); // Shows placeholder or clears editor
};

/** Handles deletion of a folder and recursively deletes all its contents (subfolders and notes) */
NotesApp.handleDeleteFolder = async (folderId, folderName) => {
    // Prevent concurrent delete operations on the same folder
    if (NotesApp.state.deletingFolderId === folderId) return;

    // Confirmation dialog
    if (!confirm(`DELETE FOLDER\n\nAre you sure you want to delete the folder "${folderName}"?\n\nWARNING: This will permanently delete this folder AND ALL subfolders and notes contained within it.\n\nThis action cannot be undone.`)) {
        return;
    }

    NotesApp.state.deletingFolderId = folderId; // Set lock
    App.setLoadingState(true, `Deleting folder "${folderName}" and its contents...`);

    try {
        const foldersToDeleteIds = new Set();
        const notesToDeleteIds = new Set();
        const foldersToProcess = [folderId]; // Stack for iterative traversal

        // 1. Find all descendant folders and notes recursively
        while (foldersToProcess.length > 0) {
            const currentFolderId = foldersToProcess.pop();
            if (foldersToDeleteIds.has(currentFolderId)) continue; // Already processed

            foldersToDeleteIds.add(currentFolderId);

            // Find notes directly in this folder
            try {
                // Use DB for accuracy during delete.
                const notesInFolder = await NotesApp.getNotesByFolderDB(currentFolderId);
                notesInFolder.forEach(note => notesToDeleteIds.add(note.id));
            } catch(e){ console.error(`Error getting notes for folder ${currentFolderId} during delete traversal:`, e); /* Continue deletion */ }

            // Find immediate subfolders
            try {
                const subfolders = await NotesApp.getFoldersByParentDB(currentFolderId);
                subfolders.forEach(sub => {
                    if (!foldersToDeleteIds.has(sub.id)) { // Avoid cycles if data is weird
                        foldersToProcess.push(sub.id);
                    }
                });
             } catch(e){ console.error(`Error getting subfolders for folder ${currentFolderId} during delete traversal:`, e); /* Continue deletion */ }
        }

        console.log("Notes: Folders identified for deletion:", Array.from(foldersToDeleteIds));
        console.log("Notes: Notes identified for deletion:", Array.from(notesToDeleteIds));

        // 2. Perform Deletions from Database
        const deletePromises = [];
        // Delete all identified notes
        notesToDeleteIds.forEach(noteId => {
            deletePromises.push(
                NotesApp.deleteNoteDB(noteId).catch(err => console.error(`DB Error deleting note ${noteId}:`, err))
            );
        });
        // Delete all identified folders
        foldersToDeleteIds.forEach(fId => {
            deletePromises.push(
                NotesApp.deleteFolderDB(fId).catch(err => console.error(`DB Error deleting folder ${fId}:`, err))
            );
        });

        await Promise.all(deletePromises);
        console.log("Notes: DB deletion requests completed for folder and contents.");

        // 3. Update State
        // Remove deleted folders from state array
        NotesApp.state.folders = NotesApp.state.folders.filter(f => !foldersToDeleteIds.has(f.id));
        // Remove entries for deleted folders from the notes map
        foldersToDeleteIds.forEach(fId => {
            delete NotesApp.state.notes[fId];
        });

        // 4. Update UI
        // If the currently selected folder was one of the deleted ones, deselect it
        if (foldersToDeleteIds.has(NotesApp.state.selectedFolderId)) {
            console.log("Deleted folder was selected, deselecting...");
            NotesApp.selectFolder(null); // This will trigger re-render of list/editor
        } else {
            // Otherwise, just re-render the folder tree as the selection is still valid
             NotesApp.renderFolderTree();
        }
        // Note: renderNoteList and displayNoteContent are handled by selectFolder(null) if needed.

    } catch (error) {
        console.error("Notes: Critical error during folder deletion process:", error);
        alert(`Error deleting folder "${folderName}". Some items might not have been deleted. Please check the console and consider refreshing. ${error.message || error}`);
        // Attempt to refresh UI to reflect potentially partial state
        NotesApp.renderFullNotesView();
    } finally {
        App.setLoadingState(false);
        NotesApp.state.deletingFolderId = null; // Release lock
    }
};

/** Handles adding a new, empty note to the currently selected folder */
NotesApp.handleAddNote = async () => {
    const folderId = NotesApp.state.selectedFolderId;
    if (folderId === null) {
        alert("Please select a folder before adding a note.");
        return;
    }

    // Check for unsaved changes before creating a new note
     if (NotesApp.state.currentEditingNote && !NotesApp.dom.saveNoteBtn?.disabled) {
         if (!confirm("You have unsaved changes in the current note. Discard changes and create a new note?")) {
             return; // User cancelled
         }
     }

    const now = Date.now();
    const newNote = {
        id: App.generateId(),
        folderId: folderId,
        title: "Untitled Note",
        content: "",
        createdAt: now,
        updatedAt: now,
        justAdded: true // Flag for animation
    };

    App.setLoadingState(true, "Adding new note...");
    try {
        // Delegate actual add logic to handleAddNote
        await NotesApp.addNoteDB(newNote);
        console.log("Notes: Note added to DB:", newNote.id, `in folder ${folderId}`);

        // Add to state
        if (!NotesApp.state.notes[folderId]) {
            NotesApp.state.notes[folderId] = [];
        }
        // Add to the beginning of the array for immediate visibility after sort
        NotesApp.state.notes[folderId].unshift(newNote);
        // No need to re-sort immediately as it will be selected next

        NotesApp.renderNoteList(); // Re-render list (includes animation via 'justAdded')
        NotesApp.selectNote(newNote.id, true); // Select the new note, force show editor

        // Focus the title input for immediate editing
        setTimeout(() => NotesApp.dom.noteTitleInput?.focus(), 50);

    } catch (error) {
        console.error("Notes: Failed to add note:", error);
        alert(`Error creating new note: ${error.message || error}`);
        delete newNote.justAdded; // Clean flag if add failed before render/select
    } finally {
        App.setLoadingState(false);
    }
};

/** Selects a note for editing, loading its content into the editor */
NotesApp.selectNote = async (noteId, forceShowEditor = false) => {
    if (!noteId) {
        console.warn("selectNote called with null/undefined noteId");
        return;
    }
    // Avoid re-selecting the same note unless forced (e.g., after adding)
    if (NotesApp.state.selectedNoteId === noteId && !forceShowEditor) return;

    // Check for unsaved changes *before* switching
    if (NotesApp.state.currentEditingNote && !NotesApp.dom.saveNoteBtn?.disabled) {
        if (!confirm("You have unsaved changes in the current note. Discard changes and switch notes?")) {
            return; // User cancelled the switch
        }
    }

    const folderId = NotesApp.state.selectedFolderId;
    // This check should ideally be redundant if note list items are only clickable when a folder is selected
    if (folderId === null) {
        console.error("Cannot select note - no folder selected. State inconsistency?");
        return;
    }

    let noteData = null;
    // Try to find the note in the current folder's state data first
    const folderNotes = NotesApp.state.notes[folderId];
    if (folderNotes) {
        noteData = folderNotes.find(n => n.id === noteId);
    }

    // If not found in state (e.g., data inconsistency, cache issue), try fetching directly from DB
    if (!noteData) {
         console.warn(`Note ${noteId} not found in state for folder ${folderId}. Attempting DB fetch.`);
         App.setLoadingState(true, "Loading note data...");
         try {
             noteData = await NotesApp.getNoteByIdDB(noteId);
             if (!noteData) {
                 throw new Error(`Note with ID ${noteId} not found in the database.`);
             }
             // Verify it belongs to the currently selected folder (important!)
             if (noteData.folderId !== folderId) {
                 throw new Error(`Note ${noteId} found but belongs to folder ${noteData.folderId}, not the selected folder ${folderId}.`);
             }
             // If found and correct, add it to the state map (or update if somehow outdated)
             if (!NotesApp.state.notes[folderId]) NotesApp.state.notes[folderId] = [];
             const existingIndex = NotesApp.state.notes[folderId].findIndex(n => n.id === noteId);
             if (existingIndex > -1) {
                 NotesApp.state.notes[folderId][existingIndex] = noteData; // Update existing
             } else {
                 NotesApp.state.notes[folderId].push(noteData); // Add if missing
             }
             // Re-sort and re-render the list now that the note is present
             NotesApp.state.notes[folderId].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
             NotesApp.renderNoteList(); // Update UI list
             console.log(`Note ${noteId} fetched from DB and added/updated in state.`);

         } catch (dbError) {
             console.error("Error fetching note from DB:", dbError);
             alert(`Error loading note: ${dbError.message}. Returning to folder view.`);
             NotesApp.state.selectedNoteId = null; // Deselect note
             NotesApp.state.currentEditingNote = null; // Clear editing buffer
             NotesApp.displayNoteContent(); // Show placeholder
             App.setLoadingState(false);
             return; // Stop execution
         } finally {
            App.setLoadingState(false);
         }
     }

    // If we have noteData (either from state or DB fetch)
    // Update state: select the note ID and store a *copy* for editing comparison
    NotesApp.state.selectedNoteId = noteId;
    NotesApp.state.currentEditingNote = { ...noteData }; // Create a shallow copy
    console.log("Notes: Note selected:", noteId);

    // Update UI selection in the note list
    document.querySelectorAll('.note-list-item.selected').forEach(el => el.classList.remove('selected'));
    const selectedLi = NotesApp.dom.noteListUl?.querySelector(`.note-list-item[data-note-id="${noteId}"]`);
    if (selectedLi) selectedLi.classList.add('selected');

    // Display the note content in the editor
    NotesApp.displayNoteContent();
};

/** Saves the currently edited note (title and content) to DB and state */
NotesApp.handleSaveNote = async () => {
    const { currentEditingNote, selectedNoteId, selectedFolderId } = NotesApp.state;
    const { saveNoteBtn, noteStatus, noteTitleInput, noteContentInput } = NotesApp.dom;
    // Only proceed if a note is loaded and elements exist
    if (!currentEditingNote || selectedNoteId === null || selectedFolderId === null || !saveNoteBtn || !noteStatus || !noteTitleInput || !noteContentInput) {
        console.warn("Save attempt failed: No note selected or editor elements missing.");
        return;
    }

    const updatedTitle = noteTitleInput.value.trim(); // Trim whitespace from title
    const updatedContent = noteContentInput.value; // Keep content as is (including whitespace)

    // Check if any changes were actually made compared to the initial state copy
    if (currentEditingNote.title === updatedTitle && currentEditingNote.content === updatedContent) {
        saveNoteBtn.disabled = true; // Disable save button again
        noteStatus.textContent = 'No changes detected';
        clearTimeout(NotesApp.state.noteChangeTimeout);
        NotesApp.state.noteChangeTimeout = setTimeout(() => {
            if (noteStatus.textContent === 'No changes detected') noteStatus.textContent = ''; // Clear after a delay
        }, NotesApp.config.NOTE_SAVE_DEBOUNCE);
        return; // Exit if no changes
    }

    // Prepare the updated note object
    const noteToUpdate = {
        ...currentEditingNote, // Copy existing properties (id, folderId, createdAt)
        title: updatedTitle || "Untitled Note", // Use "Untitled Note" if title is empty
        content: updatedContent,
        updatedAt: Date.now() // Set new update timestamp
    };

    App.setLoadingState(true, "Saving note...");
    saveNoteBtn.disabled = true; // Disable save button during operation
    noteStatus.textContent = 'Saving...';

    try {
        await NotesApp.updateNoteDB(noteToUpdate);
        console.log("Notes: Note updated in DB:", selectedNoteId);

        // Update the state:
        // 1. Update the 'currentEditingNote' copy to reflect the saved state
        NotesApp.state.currentEditingNote = { ...noteToUpdate };
        // 2. Find and update the note within the main `notes` map
        const folderNotes = NotesApp.state.notes[selectedFolderId];
        const noteIndex = folderNotes?.findIndex(n => n.id === selectedNoteId);
        if (noteIndex > -1) {
            folderNotes[noteIndex] = { ...noteToUpdate }; // Update the object in the array
            // Re-sort the notes in the current folder based on the new update time
            folderNotes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        } else {
            console.warn("Saved note could not be found in the state map for its folder! State might be inconsistent.");
            // Attempt recovery? Fetch all notes for folder again? For now, just log.
        }

        // Update UI:
        NotesApp.renderNoteList(); // Re-render list to reflect potential order change and preview update
        // Re-apply selection class which might be lost during re-render
        const selectedLi = NotesApp.dom.noteListUl?.querySelector(`.note-list-item[data-note-id="${selectedNoteId}"]`);
        if (selectedLi) selectedLi.classList.add('selected');

        // Update status message
        noteStatus.textContent = 'Saved!';
        clearTimeout(NotesApp.state.noteChangeTimeout);
        NotesApp.state.noteChangeTimeout = setTimeout(() => {
            if (noteStatus.textContent === 'Saved!') noteStatus.textContent = ''; // Clear after delay
        }, NotesApp.config.NOTE_SAVE_DEBOUNCE);
        // Save button remains disabled as the current state matches the editor

    } catch (error) {
        console.error("Notes: Failed to save note:", error);
        alert(`Error saving note: ${error.message || error}.`);
        noteStatus.textContent = 'Save failed!';
        saveNoteBtn.disabled = false; // Re-enable save button on failure so user can retry
    } finally {
        App.setLoadingState(false);
    }
};

/** Deletes the currently selected note from DB and state */
NotesApp.handleDeleteNote = async () => {
    const { currentEditingNote, selectedNoteId, selectedFolderId } = NotesApp.state;

    // Prevent concurrent deletes or deleting when nothing is selected
    if (!currentEditingNote || selectedNoteId === null || selectedFolderId === null || NotesApp.state.deletingNoteId === selectedNoteId) return;

    if (!confirm(`DELETE NOTE\n\nAre you sure you want to permanently delete the note "${currentEditingNote.title || 'Untitled Note'}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    NotesApp.state.deletingNoteId = selectedNoteId; // Set lock
    App.setLoadingState(true, "Deleting note...");
    // Disable editor buttons while deleting
    if(NotesApp.dom.saveNoteBtn) NotesApp.dom.saveNoteBtn.disabled = true;
    if(NotesApp.dom.deleteNoteBtn) NotesApp.dom.deleteNoteBtn.disabled = true;

    try {
        await NotesApp.deleteNoteDB(selectedNoteId);
        console.log("Notes: Note deleted from DB:", selectedNoteId);

        // Remove from state map
        if (NotesApp.state.notes[selectedFolderId]) {
            NotesApp.state.notes[selectedFolderId] = NotesApp.state.notes[selectedFolderId].filter(n => n.id !== selectedNoteId);
        }

        // Clear selection state
        NotesApp.state.selectedNoteId = null;
        NotesApp.state.currentEditingNote = null;

        // Update UI
        NotesApp.renderNoteList(); // Re-render list without the deleted note
        NotesApp.displayNoteContent(); // Show the placeholder

    } catch (error) {
        console.error("Notes: Failed to delete note:", error);
        alert(`Error deleting note: ${error.message || error}.`);
        // Re-enable delete button if deletion failed
        if(NotesApp.dom.deleteNoteBtn) NotesApp.dom.deleteNoteBtn.disabled = false;
    } finally {
        App.setLoadingState(false);
        NotesApp.state.deletingNoteId = null; // Release lock
        // Ensure save button is appropriately disabled after clearing selection
        if(NotesApp.dom.saveNoteBtn) NotesApp.dom.saveNoteBtn.disabled = true;
    }
};

/** Updates save button state and status message based on editor input changes */
NotesApp.handleNoteInputChange = () => {
    const { currentEditingNote } = NotesApp.state;
    const { saveNoteBtn, noteStatus, noteTitleInput, noteContentInput } = NotesApp.dom;
    // Only proceed if a note is loaded and elements exist
    if (!currentEditingNote || !saveNoteBtn || !noteStatus || !noteTitleInput || !noteContentInput) return;

    // Compare current editor values with the stored state copy
    const titleChanged = currentEditingNote.title !== noteTitleInput.value.trim();
    const contentChanged = currentEditingNote.content !== noteContentInput.value;
    const hasChanges = titleChanged || contentChanged;

    saveNoteBtn.disabled = !hasChanges; // Enable save button only if there are changes

    clearTimeout(NotesApp.state.noteChangeTimeout); // Clear previous status timeout
    if (hasChanges) {
        noteStatus.textContent = 'Unsaved changes';
        // No timeout needed for "Unsaved changes" - it persists until saved or reverted
    } else {
        noteStatus.textContent = ''; // Clear status if no changes (or changes reverted)
    }
};

// --- Utility ---
/** Basic HTML escaping function */
NotesApp.escapeHtml = (unsafe) => {
    if (unsafe === null || typeof unsafe === 'undefined') return '';
    // Correctly replace special characters with their HTML entities
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;"); // Use the numeric entity for '
};

// --- Notes Event Listeners Setup ---
NotesApp.setupEventListeners = () => {
    const {
        addRootFolderBtn, addNoteBtn, saveNoteBtn, deleteNoteBtn,
        noteTitleInput, noteContentInput,
        confirmAddFolderBtn, cancelAddFolderBtn, newFolderNameInput
    } = NotesApp.dom;

    addRootFolderBtn?.addEventListener('click', () => NotesApp.showAddFolderInput(null));
    addNoteBtn?.addEventListener('click', NotesApp.handleAddNote);
    saveNoteBtn?.addEventListener('click', NotesApp.handleSaveNote);
    deleteNoteBtn?.addEventListener('click', NotesApp.handleDeleteNote);

    noteTitleInput?.addEventListener('input', NotesApp.handleNoteInputChange);
    noteContentInput?.addEventListener('input', NotesApp.handleNoteInputChange);

    // Folder Input Listeners
    confirmAddFolderBtn?.addEventListener('click', NotesApp.confirmAddFolder);
    cancelAddFolderBtn?.addEventListener('click', () => NotesApp.hideAddFolderInput(true));
    newFolderNameInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            NotesApp.confirmAddFolder();
        }
    });
    // Escape key handled globally in App.init

     // Save Note Shortcut
     document.addEventListener('keydown', (event) => {
        if (App.state.currentView !== 'notes') return; // Only active in notes view

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            // Check if focus is NOT on an input other than the note editor inputs
             const isEditorInputFocused = document.activeElement === noteTitleInput || document.activeElement === noteContentInput;
             const isOtherInputFocused = document.activeElement?.tagName === 'INPUT' && !isEditorInputFocused || document.activeElement?.tagName === 'TEXTAREA' && !isEditorInputFocused;

            if (!isOtherInputFocused) {
                event.preventDefault();
                if (saveNoteBtn && !saveNoteBtn.disabled) {
                    console.log("Save shortcut triggered.");
                    NotesApp.handleSaveNote();
                } else {
                     console.log("Save shortcut ignored, no unsaved changes or button disabled.");
                }
            } else {
                 console.log("Save shortcut ignored (focus on other input like folder name).");
            }
        }
    });
    // Folder/note list item clicks handled dynamically in creation functions
    // Parent button click handled dynamically in renderNoteList
};


// --- Notes Initialization ---
NotesApp.init = async () => {
    console.log("Initializing Notes Module...");
    App.setLoadingState(true, "Initializing notes..."); // Indicate notes-specific loading

    try {
        await NotesApp.loadNotesData(); // Load all folders and notes from DB into state
        NotesApp.setupEventListeners(); // Setup listeners for buttons, inputs, shortcuts
        NotesApp.state.isInitialized = true;
        
        // Render the Notes view immediately after initialization
        NotesApp.renderNotesView();
        
        console.log("Notes Module Initialized Successfully.");
        // Initial rendering is triggered by App.setView after all modules are initialized.
    } catch (error) {
        console.error("Notes Module Initialization Failed:", error);
        if (NotesApp.dom.notesViewContainer) {
            NotesApp.dom.notesViewContainer.innerHTML = `<div style="color: #ff6b6b; padding: 20px;">Notes failed to initialize. Check console.</div>`;
        }
         throw error; // Re-throw to let App.init catch it for the global error display
    } finally {
         App.setLoadingState(false); // Clear loading state specifically for notes init
    }
    return Promise.resolve(); // Signal completion
};