// --- second-brain.js ---
// Manages Second Brain functionality: data extraction, LLM API integration, and chat interface

const SecondBrain = {};

// --- Second Brain DOM Elements ---
SecondBrain.dom = {
    // Will be initialized in init()
    chatButton: null,
    chatModal: null,
    chatInput: null,
    chatMessages: null,
    chatSendButton: null,
    apiKeyInput: null,
    apiProviderSelect: null,
    apiEndpointInput: null,
    saveApiSettingsButton: null,
    systemPromptBeforeInput: null,
    systemPromptAfterInput: null,
    chatSettings: null,
    toggleSettingsBtn: null,
    clearChatButton: null, // New property
};

// --- Second Brain State ---
SecondBrain.state = {
    isInitialized: false,
    apiKey: '',
    apiProvider: 'openai', // Default provider
    apiEndpoint: 'https://api.openai.com/v1/chat/completions', // Default endpoint
    messages: [], // Chat history
    isProcessing: false,
    systemPromptBefore: `You are a helpful AI assistant with access to both 
    calendar (tasks) and notes data. Without any external hints or regex, evaluate 
    the user’s request and decide whether to use calendar data only, notes data only, 
    both, or neither. Respond using only the selected data sections. If the user’s 
    request does not clearly ask for data, ask a clarifying follow-up. Prioritize 
    accuracy and brevity; do not fabricate or assume any data.`,
    systemPromptAfter: 'Make sure everything is accurate.',
    apiSettingsExpanded: false, // Whether API settings panel is expanded
};

// --- Second Brain Configuration ---
SecondBrain.config = {
    API_PROVIDERS: {
        openai: {
            name: 'OpenAI',
            defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
            defaultModel: 'gpt-4o',
        },
        anthropic: {
            name: 'Anthropic',
            defaultEndpoint: 'https://api.anthropic.com/v1/messages',
            defaultModel: 'claude-3-sonnet-20240229',
        },
        custom: {
            name: 'Custom Provider',
            defaultEndpoint: '',
            defaultModel: '',
        }
    },
    MAX_CONTEXT_LENGTH: 16000, // Maximum number of tokens to send to the API
    SETTINGS_KEY: 'secondBrainSettings',
    SYSTEM_PROMPTS_KEY: 'secondBrainSystemPrompts',
};

// --- Data Extraction Functions ---

/**
 * Extracts all tasks from the calendar
 * @returns {Promise<Array>} Array of task objects
 */
SecondBrain.extractTasks = async () => {
    try {
        // Use the existing DB action to get all tasks
        const tasks = await App.dbAction(App.config.TASK_STORE_NAME, 'readonly', 'getAll');
        
        // Verify that tasks contain all expected properties
        const validatedTasks = tasks.map(task => {
            // Ensure all essential properties are present
            return {
                id: task.id || '',
                text: task.text || '',
                date: task.date || task.originalDate || '',
                originalDate: task.originalDate || task.date || '',
                completed: !!task.completed,
                important: !!task.important,
                time: task.time || null,
                location: task.location || null,
                recurring: !!task.isRecurringWeekly,
                customColor: task.customColor || 'default',
                createdAt: task.createdAt || 0,
                updatedAt: task.updatedAt || 0
            };
        }).filter(task => task.text && (task.date || task.originalDate));
        
        return validatedTasks;
    } catch (error) {
        console.error('Error extracting tasks:', error);
        return [];
    }
};

/**
 * Extracts all notes from the notes app
 * @returns {Promise<Array>} Array of note objects
 */
SecondBrain.extractNotes = async () => {
    try {
        // Use the existing DB action to get all notes
        const notes = await App.dbAction(App.config.NOTE_STORE_NAME, 'readonly', 'getAll');
        
        // Verify that notes contain all expected properties
        const validatedNotes = notes.map(note => {
            return {
                id: note.id || '',
                folderId: note.folderId || '',
                title: note.title || 'Untitled Note',
                content: note.content || '',
                createdAt: note.createdAt || 0,
                lastModified: note.updatedAt || note.lastModified || note.createdAt || 0
            };
        }).filter(note => note.id && note.folderId);
        
        return validatedNotes;
    } catch (error) {
        console.error('Error extracting notes:', error);
        return [];
    }
};

/**
 * Extracts all folders from the notes app
 * @returns {Promise<Array>} Array of folder objects
 */
SecondBrain.extractFolders = async () => {
    try {
        // Use the existing DB action to get all folders
        const folders = await App.dbAction(App.config.FOLDER_STORE_NAME, 'readonly', 'getAll');
        
        // Verify that folders contain all expected properties
        const validatedFolders = folders.map(folder => {
            return {
                id: folder.id || '',
                name: folder.name || 'Unnamed Folder',
                parentId: folder.parentId, // Can be null for root folders
                createdAt: folder.createdAt || 0
            };
        }).filter(folder => folder.id && folder.name);
        
        return validatedFolders;
    } catch (error) {
        console.error('Error extracting folders:', error);
        return [];
    }
};

/**
 * Formats task and note data into a structured context for the LLM
 * @param {boolean} includeCalendar - Whether to include calendar data
 * @param {boolean} includeNotes - Whether to include notes data
 * @returns {Promise<string>} Formatted context string
 */
SecondBrain.formatDataForContext = async (includeCalendar = true, includeNotes = true) => {
    try {
        // Extract all data with validation
        const [tasks, notes, folders] = await Promise.all([
            SecondBrain.extractTasks(),
            SecondBrain.extractNotes(),
            SecondBrain.extractFolders()
        ]);

        // Create a map of folder IDs to folder names for easier reference
        const folderMap = {};
        folders.forEach(folder => {
            folderMap[folder.id] = folder.name;
        });

        // Get current date information
        const currentDate = new Date();
        const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // Format for display
        const currentDateFormatted = currentDate.toLocaleDateString('en-US', { 
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        const currentTimeFormatted = currentDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        let context = '';
        
        // Add current date information at the top
        context += `CURRENT DATE: ${currentDateFormatted}\n`;
        context += `CURRENT TIME: ${currentTimeFormatted}\n\n`;

        // Organize tasks section
        if (includeCalendar) {
            if (tasks.length > 0) {
                context += 'TASKS:\n';
                
                // Group tasks by date, handling both recurring and non-recurring
                const tasksByDate = {};
                
                tasks.forEach(task => {
                    // Use the correct date field
                    const dateKey = task.date || task.originalDate || '';
                    if (!dateKey) return; // Skip tasks without date
                    
                    if (!tasksByDate[dateKey]) {
                        tasksByDate[dateKey] = [];
                    }
                    tasksByDate[dateKey].push(task);
                    
                    // For recurring tasks, also add them to future dates if they match pattern
                    if (task.recurring && task.originalDate) {
                        // Add recurring instances for the next 4 weeks for visualization
                        const originalDate = new Date(task.originalDate + 'T00:00:00');
                        if (!isNaN(originalDate.getTime())) {
                            for (let i = 1; i <= 4; i++) {
                                const futureDate = new Date(originalDate);
                                futureDate.setDate(futureDate.getDate() + (i * 7)); // Weekly recurrence
                                const futureDateStr = futureDate.toISOString().split('T')[0];
                                
                                // Skip if it would create duplication in the future
                                if (futureDateStr === dateKey) continue;
                                
                                // Only add future dates if they're within a reasonable range (4 weeks)
                                const timeDiff = futureDate.getTime() - today.getTime();
                                const dayDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));
                                if (dayDiff >= 0 && dayDiff <= 28) {
                                    if (!tasksByDate[futureDateStr]) {
                                        tasksByDate[futureDateStr] = [];
                                    }
                                    // Create a virtual instance of the recurring task
                                    const recurringInstance = {
                                        ...task,
                                        date: futureDateStr,
                                        isVirtualRecurringInstance: true
                                    };
                                    tasksByDate[futureDateStr].push(recurringInstance);
                                }
                            }
                        }
                    }
                });
                
                // Process each date's tasks
                Object.keys(tasksByDate).sort().forEach(date => {
                    // Calculate relationship to today
                    let dateRelation = '';
                    
                    try {
                        const taskDate = new Date(date + 'T00:00:00');
                        const diffTime = taskDate.getTime() - today.getTime();
                        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                        
                        if (diffDays === 0) {
                            dateRelation = ' (TODAY)';
                        } else if (diffDays === 1) {
                            dateRelation = ' (TOMORROW)';
                        } else if (diffDays === -1) {
                            dateRelation = ' (YESTERDAY)';
                        } else if (diffDays > 1 && diffDays < 7) {
                            dateRelation = ` (THIS WEEK, in ${diffDays} days)`;
                        } else if (diffDays < 0 && diffDays > -7) {
                            dateRelation = ` (LAST WEEK, ${Math.abs(diffDays)} days ago)`;
                        } else if (diffDays >= 7 && diffDays < 14) {
                            dateRelation = ' (NEXT WEEK)';
                        }
                    } catch (e) {
                        // In case of date parsing errors
                        dateRelation = '';
                    }
                    
                    // Format date more readably
                    const dateObj = new Date(date);
                    const formattedDate = dateObj.toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                    });
                    
                    context += `  ${formattedDate}${dateRelation}:\n`;
                    
                    // Count completed and pending tasks
                    const completedTasks = tasksByDate[date].filter(t => t.completed);
                    const pendingTasks = tasksByDate[date].filter(t => !t.completed);
                    
                    // Display important tasks first
                    const importantPending = pendingTasks.filter(t => t.important);
                    const normalPending = pendingTasks.filter(t => !t.important);
                    
                    // Add important pending tasks
                    if (importantPending.length > 0) {
                        importantPending.forEach(task => {
                            const recurring = task.recurring ? '(recurring)' : '';
                            const time = task.time ? `@${task.time}` : '';
                            const location = task.location ? `at ${task.location}` : '';
                            context += `    ⭐ ${task.text} ${time} ${location} ${recurring}\n`;
                        });
                    }
                    
                    // Add normal pending tasks
                    if (normalPending.length > 0) {
                        normalPending.forEach(task => {
                            const recurring = task.recurring ? '(recurring)' : '';
                            const time = task.time ? `@${task.time}` : '';
                            const location = task.location ? `at ${task.location}` : '';
                            context += `    • ${task.text} ${time} ${location} ${recurring}\n`;
                        });
                    }
                    
                    // Add completed tasks (summarized if many)
                    if (completedTasks.length > 0) {
                        if (completedTasks.length <= 3) {
                            completedTasks.forEach(task => {
                                context += `    ✓ ${task.text}\n`;
                            });
                        } else {
                            context += `    ✓ ${completedTasks.length} completed tasks\n`;
                        }
                    }
                    
                    context += '\n';
                });
            } else {
                context += 'TASKS: None\n\n';
            }
        }

        // Organize notes section
        if (includeNotes) {
            if (notes.length > 0) {
                context += 'NOTES:\n';
                
                // Build folder hierarchy
                const folderHierarchy = {};
                const rootFolders = [];
                
                // First pass: create folder objects with children arrays
                folders.forEach(folder => {
                    folderHierarchy[folder.id] = {
                        ...folder,
                        children: [],
                        notes: []
                    };
                });
                
                // Second pass: link children to parents
                folders.forEach(folder => {
                    if (folder.parentId === null || folder.parentId === undefined) {
                        rootFolders.push(folderHierarchy[folder.id]);
                    } else if (folderHierarchy[folder.parentId]) {
                        folderHierarchy[folder.parentId].children.push(folderHierarchy[folder.id]);
                    } else {
                        // Orphaned folder, treat as root
                        rootFolders.push(folderHierarchy[folder.id]);
                    }
                });
                
                // Assign notes to their folders
                notes.forEach(note => {
                    if (folderHierarchy[note.folderId]) {
                        folderHierarchy[note.folderId].notes.push(note);
                    }
                });
                
                // Sort notes by lastModified date
                Object.values(folderHierarchy).forEach(folder => {
                    folder.notes.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
                });
                
                // Generate folder output recursively
                const processFolderHierarchy = (folder, depth = 1) => {
                    const indent = '  '.repeat(depth);
                    
                    // Output folder name
                    context += `${indent}${folder.name}:\n`;
                    
                    // Process notes in this folder
                    if (folder.notes.length > 0) {
                        folder.notes.forEach(note => {
                            // Add note title
                            context += `${indent}  "${note.title}":\n`;
                            
                            // Compress note content
                            let content = note.content || '';
                            
                            // Remove excessive whitespace
                            content = content.replace(/\n{3,}/g, '\n\n');
                            
                            // Extract key information: first paragraph and any lists or code blocks
                            const lines = content.split('\n');
                            let firstParagraph = '';
                            const keyLines = [];
                            
                            // Find the first non-empty paragraph
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].trim() !== '') {
                                    // Check if it's a heading, bullet point, etc.
                                    if (!lines[i].startsWith('#') && !lines[i].startsWith('-') && !lines[i].startsWith('*')) {
                                        firstParagraph = lines[i];
                                        break;
                                    }
                                }
                            }
                            
                            // Collect headings, bullet points, and code blocks
                            let inCodeBlock = false;
                            for (let i = 0; i < lines.length; i++) {
                                const line = lines[i].trim();
                                if (line.startsWith('```')) {
                                    inCodeBlock = !inCodeBlock;
                                    keyLines.push(line);
                                } else if (inCodeBlock || line.startsWith('#') || line.startsWith('-') || line.startsWith('*')) {
                                    keyLines.push(line);
                                }
                            }
                            
                            // Add first paragraph if it exists
                            if (firstParagraph) {
                                context += `${indent}    ${firstParagraph}\n`;
                            }
                            
                            // Add summary of key lines if they exist
                            if (keyLines.length > 0) {
                                // If there are many key lines, summarize them
                                if (keyLines.length > 10) {
                                    // Count headings
                                    const headings = keyLines.filter(l => l.startsWith('#')).length;
                                    // Count list items
                                    const listItems = keyLines.filter(l => l.startsWith('-') || l.startsWith('*')).length;
                                    // Count code blocks (pairs of ```)
                                    const codeBlocks = keyLines.filter(l => l.startsWith('```')).length / 2;
                                    
                                    context += `${indent}    [Contains ${headings} headings, ${listItems} list items, ${codeBlocks} code blocks]\n`;
                                } else {
                                    // Add a few representative key lines
                                    let headingFound = false;
                                    for (let i = 0; i < Math.min(keyLines.length, 5); i++) {
                                        if (keyLines[i].startsWith('#')) {
                                            headingFound = true;
                                            context += `${indent}    ${keyLines[i]}\n`;
                                        }
                                    }
                                    
                                    if (!headingFound && keyLines.length > 0) {
                                        // Add a representative bullet point if no headings
                                        const bulletLine = keyLines.find(l => l.startsWith('-') || l.startsWith('*'));
                                        if (bulletLine) {
                                            context += `${indent}    ${bulletLine} ...\n`;
                                        }
                                    }
                                }
                            }
                            
                            // Add note metadata
                            if (note.lastModified) {
                                const lmDate = new Date(note.lastModified);
                                const lastModifiedDate = lmDate.toLocaleDateString('en-US', {
                                    month: 'short', day: 'numeric', year: 'numeric'
                                });
                                const lastModifiedTime = lmDate.toLocaleTimeString('en-US', {
                                    hour: '2-digit', minute: '2-digit'
                                });
                                context += `${indent}    [Last modified: ${lastModifiedDate} ${lastModifiedTime}]\n`;
                            }
                            
                            context += '\n';
                        });
                    }
                    
                    // Process subfolders
                    if (folder.children.length > 0) {
                        folder.children.forEach(child => {
                            processFolderHierarchy(child, depth + 1);
                        });
                    }
                };
                
                // Generate output for all root folders
                rootFolders.forEach(folder => {
                    processFolderHierarchy(folder);
                });
                
            } else {
                context += 'NOTES: None\n';
            }
        }

        // Add data statistics to help the model understand the scale
        const stats = {
            totalTasks: tasks.length,
            completedTasks: tasks.filter(t => t.completed).length,
            pendingTasks: tasks.filter(t => !t.completed).length,
            importantTasks: tasks.filter(t => t.important).length,
            recurringTasks: tasks.filter(t => t.recurring).length,
            totalNotes: notes.length,
            totalFolders: folders.length
        };
        
        context += '\nSUMMARY STATISTICS:\n';
        context += `  Total Tasks: ${stats.totalTasks} (${stats.completedTasks} completed, ${stats.pendingTasks} pending, ${stats.importantTasks} important, ${stats.recurringTasks} recurring)\n`;
        context += `  Total Notes: ${stats.totalNotes} in ${stats.totalFolders} folders\n`;

        return context;
    } catch (error) {
        console.error('Error formatting data for context:', error);
        return '# ERROR\nThere was an error retrieving your data.';
    }
};

// --- API Integration Functions ---

/**
 * Loads API settings from localStorage
 */
SecondBrain.loadApiSettings = () => {
    try {
        const settings = localStorage.getItem(SecondBrain.config.SETTINGS_KEY);
        if (settings) {
            const parsedSettings = JSON.parse(settings);
            SecondBrain.state.apiKey = parsedSettings.apiKey || '';
            SecondBrain.state.apiProvider = parsedSettings.apiProvider || 'openai';
            SecondBrain.state.apiEndpoint = parsedSettings.apiEndpoint || 
                SecondBrain.config.API_PROVIDERS[parsedSettings.apiProvider || 'openai'].defaultEndpoint;
        }
        
        // Load system prompts separately
        const systemPrompts = localStorage.getItem(SecondBrain.config.SYSTEM_PROMPTS_KEY);
        if (systemPrompts) {
            const parsedPrompts = JSON.parse(systemPrompts);
            if (parsedPrompts.before) {
                SecondBrain.state.systemPromptBefore = parsedPrompts.before;
            }
            if (parsedPrompts.after) {
                SecondBrain.state.systemPromptAfter = parsedPrompts.after;
            }
        }
    } catch (error) {
        console.error('Error loading API settings:', error);
    }
};

/**
 * Saves API settings to localStorage
 */
SecondBrain.saveApiSettings = () => {
    try {
        const settings = {
            apiKey: SecondBrain.state.apiKey,
            apiProvider: SecondBrain.state.apiProvider,
            apiEndpoint: SecondBrain.state.apiEndpoint,
        };
        localStorage.setItem(SecondBrain.config.SETTINGS_KEY, JSON.stringify(settings));
        
        // Save system prompts separately
        const systemPrompts = {
            before: SecondBrain.state.systemPromptBefore,
            after: SecondBrain.state.systemPromptAfter
        };
        localStorage.setItem(SecondBrain.config.SYSTEM_PROMPTS_KEY, JSON.stringify(systemPrompts));
    } catch (error) {
        console.error('Error saving API settings:', error);
    }
};

/**
 * Updates API settings from form inputs
 */
SecondBrain.updateApiSettings = () => {
    const { 
        apiKeyInput, 
        apiProviderSelect, 
        apiEndpointInput,
        systemPromptBeforeInput,
        systemPromptAfterInput 
    } = SecondBrain.dom;
    
    SecondBrain.state.apiKey = apiKeyInput.value.trim();
    SecondBrain.state.apiProvider = apiProviderSelect.value;
    SecondBrain.state.apiEndpoint = apiEndpointInput.value.trim();
    
    // Update system prompts from inputs
    if (systemPromptBeforeInput && systemPromptBeforeInput.value.trim()) {
        SecondBrain.state.systemPromptBefore = systemPromptBeforeInput.value.trim();
    }
    
    if (systemPromptAfterInput && systemPromptAfterInput.value.trim()) {
        SecondBrain.state.systemPromptAfter = systemPromptAfterInput.value.trim();
    }
    
    SecondBrain.saveApiSettings();
    
    // Show confirmation message
    const messageEl = document.createElement('div');
    messageEl.className = 'settings-saved-message';
    messageEl.textContent = 'Settings saved!';
    apiKeyInput.parentNode.appendChild(messageEl);
    
    // Remove message after 3 seconds
    setTimeout(() => {
        messageEl.remove();
    }, 3000);
};

/**
 * Sends a message to the LLM API
 * @param {string} userMessage - The user's message
 * @param {string} context - The context data from tasks and notes
 * @returns {Promise<string>} The LLM's response
 */
SecondBrain.sendToLLM = async (userMessage, context) => {
    const { apiKey, apiProvider, apiEndpoint, systemPromptBefore, systemPromptAfter } = SecondBrain.state;
    
    if (!apiKey) {
        throw new Error('API key is required. Please set it in the settings.');
    }
    
    // Prepare headers based on the provider
    let headers = {
        'Content-Type': 'application/json',
    };
    
    // Prepare the request body based on the provider
    let requestBody = {};
    
    // Create a combined message that includes the instruction to follow the system prompt after
    const combinedSystemPrompt = `${systemPromptBefore}\n\nAfter providing your response, follow this instruction but DO NOT include it in your response: ${systemPromptAfter}`;
    
    if (apiProvider === 'openai') {
        headers['Authorization'] = `Bearer ${apiKey}`;
        requestBody = {
            model: SecondBrain.config.API_PROVIDERS.openai.defaultModel,
            messages: [
                { role: 'system', content: combinedSystemPrompt },
                { role: 'user', content: context },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 1000
        };
    } else if (apiProvider === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        requestBody = {
            model: SecondBrain.config.API_PROVIDERS.anthropic.defaultModel,
            messages: [
                { role: 'user', content: `${combinedSystemPrompt}\n\n${context}\n\n${userMessage}` }
            ],
            max_tokens: 1000
        };
    } else {
        // Custom provider - assume OpenAI-like format but allow for customization
        headers['Authorization'] = `Bearer ${apiKey}`;
        requestBody = {
            model: 'default-model',
            messages: [
                { role: 'system', content: combinedSystemPrompt },
                { role: 'user', content: context },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 1000
        };
    }
    
    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API request failed: ${response.status} ${response.statusText} ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Extract the response text based on the provider
        let responseText = '';
        if (apiProvider === 'openai') {
            responseText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        } else if (apiProvider === 'anthropic') {
            responseText = data.content && data.content[0] && data.content[0].text;
        } else {
            // Try to extract from a generic response structure
            responseText = 
                (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
                (data.content && data.content[0] && data.content[0].text) ||
                (data.response) ||
                JSON.stringify(data);
        }
        
        return responseText || 'No response from API';
    } catch (error) {
        console.error('Error sending message to LLM:', error);
        throw error;
    }
};

// --- UI Functions ---

/**
 * Creates and adds the chat button to the app header
 */
SecondBrain.createChatButton = () => {
    const chatButton = document.createElement('button');
    chatButton.id = 'brainBtn';
    chatButton.className = 'brain-button';
    chatButton.innerHTML = '<span class="brain-emoji">🧠</span>';
    chatButton.title = 'Second Brain';
    
    // Insert before settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn && settingsBtn.parentNode) {
        settingsBtn.parentNode.insertBefore(chatButton, settingsBtn);
    } else {
        // Fallback - append to app header
        const appHeader = document.querySelector('.app-header');
        if (appHeader) {
            appHeader.appendChild(chatButton);
        }
    }
    
    SecondBrain.dom.chatButton = chatButton;
};

/**
 * Creates the chat modal UI
 */
SecondBrain.createChatModal = () => {
    const modal = document.createElement('div');
    modal.id = 'chatModal';
    modal.className = 'modal-overlay';
    
    modal.innerHTML = `
        <div class="modal-dialog chat-modal">
            <div class="chat-header">
                <h3>Second Brain</h3>
                <button id="clearChatButton" class="clear-chat-button">Clear Chat</button>
                <button class="close-button">&times;</button>
            </div>
            <div class="chat-container">
                <div class="chat-messages" id="chatMessages">
                    <div class="chat-message system-message">
                        <div class="message-content">
                            Welcome to your Second Brain! I can help you with your tasks and notes. What would you like to know?
                        </div>
                    </div>
                </div>
                <div class="chat-input-container">
                    <textarea id="chatInput" placeholder="Ask me anything about your tasks and notes..." rows="2"></textarea>
                    <button id="chatSendButton" class="chat-send-button">
                        <i data-feather="send"></i>
                    </button>
                </div>
            </div>
            <div class="chat-settings-header">
                <button id="toggleSettingsBtn" class="toggle-settings-button">
                    <span>API Settings</span>
                    <i data-feather="chevron-down" class="settings-icon"></i>
                </button>
            </div>
            <div class="chat-settings" id="chatSettings" style="display: none;">
                <div class="settings-group">
                    <label for="apiProviderSelect">API Provider:</label>
                    <select id="apiProviderSelect">
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="custom">Custom Provider</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label for="apiKeyInput">API Key:</label>
                    <input type="password" id="apiKeyInput" placeholder="Enter your API key">
                </div>
                <div class="settings-group">
                    <label for="apiEndpointInput">API Endpoint:</label>
                    <input type="text" id="apiEndpointInput" placeholder="API endpoint URL">
                </div>
                <div class="settings-group">
                    <label for="systemPromptBeforeInput">System Prompt Before:</label>
                    <textarea id="systemPromptBeforeInput" placeholder="Enter the system prompt before the context" rows="2"></textarea>
                </div>
                <div class="settings-group">
                    <label for="systemPromptAfterInput">System Prompt After:</label>
                    <textarea id="systemPromptAfterInput" placeholder="Enter the system prompt after the response" rows="2"></textarea>
                </div>
                <button id="saveApiSettingsButton" class="save-settings-button">Save Settings</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Store DOM references
    SecondBrain.dom.chatModal = modal;
    SecondBrain.dom.chatMessages = document.getElementById('chatMessages');
    SecondBrain.dom.chatInput = document.getElementById('chatInput');
    SecondBrain.dom.chatSendButton = document.getElementById('chatSendButton');
    SecondBrain.dom.apiKeyInput = document.getElementById('apiKeyInput');
    SecondBrain.dom.apiProviderSelect = document.getElementById('apiProviderSelect');
    SecondBrain.dom.apiEndpointInput = document.getElementById('apiEndpointInput');
    SecondBrain.dom.systemPromptBeforeInput = document.getElementById('systemPromptBeforeInput');
    SecondBrain.dom.systemPromptAfterInput = document.getElementById('systemPromptAfterInput');
    SecondBrain.dom.saveApiSettingsButton = document.getElementById('saveApiSettingsButton');
    SecondBrain.dom.chatSettings = document.getElementById('chatSettings');
    SecondBrain.dom.toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
    SecondBrain.dom.clearChatButton = document.getElementById('clearChatButton'); // New property
    
    // Initialize feather icons
    App.refreshIcons();
};

/**
 * Shows the chat modal
 */
SecondBrain.showChatModal = () => {
    const { chatModal, apiKeyInput, apiProviderSelect, apiEndpointInput, chatInput, systemPromptBeforeInput, systemPromptAfterInput, chatSettings } = SecondBrain.dom;
    
    if (!chatModal) return;
    
    // Load current API settings into form
    apiKeyInput.value = SecondBrain.state.apiKey || '';
    apiProviderSelect.value = SecondBrain.state.apiProvider || 'openai';
    apiEndpointInput.value = SecondBrain.state.apiEndpoint || 
        SecondBrain.config.API_PROVIDERS[SecondBrain.state.apiProvider || 'openai'].defaultEndpoint;
        
    // Always load the current system prompts from state (which includes user customizations)
    systemPromptBeforeInput.value = SecondBrain.state.systemPromptBefore || '';
    systemPromptAfterInput.value = SecondBrain.state.systemPromptAfter || '';
    
    // Set settings panel display based on state
    if (chatSettings) {
        chatSettings.style.display = SecondBrain.state.apiSettingsExpanded ? 'block' : 'none';
    }
    
    // Show the modal
    chatModal.classList.add('visible');
    
    // Focus the chat input
    setTimeout(() => {
        chatInput.focus();
    }, 100);
};

/**
 * Hides the chat modal
 */
SecondBrain.hideChatModal = () => {
    const { chatModal } = SecondBrain.dom;
    if (!chatModal) return;
    chatModal.classList.remove('visible');
};

/**
 * Adds a message to the chat UI
 * @param {string} content - The message content
 * @param {string} role - The message role ('user' or 'assistant')
 */
SecondBrain.addMessageToChat = (content, role) => {
    const { chatMessages } = SecondBrain.dom;
    if (!chatMessages) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${role}-message`;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.innerHTML = content.replace(/\n/g, '<br>');
    
    messageEl.appendChild(contentEl);
    chatMessages.appendChild(messageEl);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Add to messages state
    SecondBrain.state.messages.push({ role, content });
};

/**
 * Shows a loading indicator in the chat
 */
SecondBrain.showLoadingIndicator = () => {
    const { chatMessages } = SecondBrain.dom;
    if (!chatMessages) return;
    
    const loadingEl = document.createElement('div');
    loadingEl.className = 'chat-message assistant-message loading';
    loadingEl.innerHTML = '<div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
    loadingEl.id = 'loadingIndicator';
    
    chatMessages.appendChild(loadingEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

/**
 * Removes the loading indicator from the chat
 */
SecondBrain.removeLoadingIndicator = () => {
    const loadingEl = document.getElementById('loadingIndicator');
    if (loadingEl) {
        loadingEl.remove();
    }
};

/**
 * Handles sending a message to the LLM
 */
SecondBrain.handleSendMessage = async () => {
    const { chatInput } = SecondBrain.dom;
    if (!chatInput) return;
    
    const message = chatInput.value.trim();
    if (!message || SecondBrain.state.isProcessing) return;
    
    // Clear input
    chatInput.value = '';
    
    // Add user message to chat
    SecondBrain.addMessageToChat(message, 'user');
    
    // Show loading indicator
    SecondBrain.showLoadingIndicator();
    SecondBrain.state.isProcessing = true;
    
    try {
        // Always include both calendar and notes; LLM prompt will direct selection
        const context = await SecondBrain.formatDataForContext(true, true);
        
        // Send to LLM
        const response = await SecondBrain.sendToLLM(message, context);
        
        // Remove loading indicator
        SecondBrain.removeLoadingIndicator();
        
        // Add assistant response to chat
        SecondBrain.addMessageToChat(response, 'assistant');
    } catch (error) {
        console.error('Error sending message:', error);
        
        // Remove loading indicator
        SecondBrain.removeLoadingIndicator();
        
        // Add error message to chat
        SecondBrain.addMessageToChat(`Error: ${error.message}`, 'system-message error');
    } finally {
        SecondBrain.state.isProcessing = false;
    }
};

/**
 * Updates the API endpoint when the provider changes
 */
SecondBrain.handleProviderChange = () => {
    const { apiProviderSelect, apiEndpointInput } = SecondBrain.dom;
    const provider = apiProviderSelect.value;
    
    if (provider && SecondBrain.config.API_PROVIDERS[provider]) {
        apiEndpointInput.value = SecondBrain.config.API_PROVIDERS[provider].defaultEndpoint || '';
    }
};

/**
 * Toggles the API settings panel
 */
SecondBrain.toggleApiSettings = () => {
    const { chatSettings, toggleSettingsBtn } = SecondBrain.dom;
    if (!chatSettings || !toggleSettingsBtn) return;
    
    const settingsIcon = toggleSettingsBtn.querySelector('.settings-icon');
    
    if (chatSettings.style.display === 'none') {
        chatSettings.style.display = 'block';
        SecondBrain.state.apiSettingsExpanded = true;
        // Replace the icon with the up chevron
        if (settingsIcon) {
            settingsIcon.setAttribute('data-feather', 'chevron-up');
        }
    } else {
        chatSettings.style.display = 'none';
        SecondBrain.state.apiSettingsExpanded = false;
        // Replace the icon with the down chevron
        if (settingsIcon) {
            settingsIcon.setAttribute('data-feather', 'chevron-down');
        }
    }
    
    // Re-render the Feather icons
    App.refreshIcons();
};

/**
 * Clears the chat history
 */
SecondBrain.clearChatHistory = () => {
    const { chatMessages } = SecondBrain.dom;
    if (!chatMessages) return;
    
    // Preserve the initial system welcome message
    const systemMsgEl = chatMessages.querySelector('.system-message');
    const systemHTML = systemMsgEl ? systemMsgEl.outerHTML : '';
    chatMessages.innerHTML = systemHTML;
    
    // Reset messages state
    SecondBrain.state.messages = [];
};

// --- Event Listeners ---

/**
 * Sets up event listeners for the chat UI
 */
SecondBrain.setupEventListeners = () => {
    const { 
        chatButton, chatModal, chatInput, chatSendButton,
        apiProviderSelect, saveApiSettingsButton, toggleSettingsBtn,
        clearChatButton // New property
    } = SecondBrain.dom;
    
    // Chat button click
    chatButton.addEventListener('click', SecondBrain.showChatModal);
    
    // Close button click
    const closeButton = chatModal.querySelector('.close-button');
    closeButton.addEventListener('click', SecondBrain.hideChatModal);
    
    // Click outside modal to close
    chatModal.addEventListener('click', (event) => {
        if (event.target === chatModal) {
            SecondBrain.hideChatModal();
        }
    });
    
    // Send button click
    chatSendButton.addEventListener('click', SecondBrain.handleSendMessage);
    
    // Enter key in chat input
    chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            SecondBrain.handleSendMessage();
        }
    });
    
    // API provider change
    apiProviderSelect.addEventListener('change', SecondBrain.handleProviderChange);
    
    // Save API settings button click
    saveApiSettingsButton.addEventListener('click', SecondBrain.updateApiSettings);
    
    // Toggle API settings button click
    toggleSettingsBtn.addEventListener('click', SecondBrain.toggleApiSettings);
    
    // Clear chat button click
    clearChatButton.addEventListener('click', SecondBrain.clearChatHistory);
    
    // Escape key to close modal
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && chatModal.classList.contains('visible')) {
            SecondBrain.hideChatModal();
        }
    });
};

// --- Initialization ---

/**
 * Initializes the Second Brain module
 */
SecondBrain.init = () => {
    console.log('Initializing Second Brain Module...');
    
    try {
        // Load API settings
        SecondBrain.loadApiSettings();
        
        // Create UI elements
        SecondBrain.createChatButton();
        SecondBrain.createChatModal();
        
        // Setup event listeners
        SecondBrain.setupEventListeners();
        
        SecondBrain.state.isInitialized = true;
        console.log('Second Brain Module Initialized Successfully.');
    } catch (error) {
        console.error('Second Brain Module Initialization Failed:', error);
    }
};

// Export the module
window.SecondBrain = SecondBrain;
