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
    settingsSavedMessage: null, // New property
};

// --- Second Brain State ---
SecondBrain.state = {
    isInitialized: false,
    apiKey: '',
    apiProvider: 'gemini', // Default provider changed to gemini
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent', // Updated to specific experimental model
    messages: [], // Chat history
    isProcessing: false,
    systemPromptBefore: `You are a helpful AI assistant with access to calendar tasks and notes data.

FORMATTING INSTRUCTIONS:
- Feel free to use emojis to make your responses more engaging
- NEVER use asterisks (*) in your responses
- NEVER use markdown formatting of any kind
- Use simple line breaks for formatting
- For lists, use only simple dashes (-) or numbers (1., 2.)
- For emphasis, use capitalization instead of formatting
- Keep your tone friendly and conversational

When responding to user queries:
1. Determine if you need calendar data, notes data, both, or neither
2. Provide only relevant information from the selected data
3. If the user's request is unclear, ask a specific follow-up question
4. Be concise and accurate; never fabricate information`,
    systemPromptAfter: 'Make sure everything is accurate.',
    apiSettingsExpanded: false, // Whether API settings panel is expanded
};

// --- Second Brain Configuration ---
SecondBrain.config = {
    API_PROVIDERS: {
        gemini: {
            name: 'Google Gemini 2.5 Pro (Experimental)',
            defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent',
            defaultModel: 'gemini-2.5-pro-exp-03-25',
        },
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
        // Load all settings from a single storage location
        const settings = localStorage.getItem(SecondBrain.config.SETTINGS_KEY);
        if (settings) {
            const parsedSettings = JSON.parse(settings);
            
            // Load API settings
            SecondBrain.state.apiKey = parsedSettings.apiKey || '';
            SecondBrain.state.apiProvider = parsedSettings.apiProvider || 'gemini';
            SecondBrain.state.apiEndpoint = parsedSettings.apiEndpoint || 
                SecondBrain.config.API_PROVIDERS[parsedSettings.apiProvider || 'gemini'].defaultEndpoint;
            
            // Load system prompts if they exist
            if (parsedSettings.systemPromptBefore) {
                SecondBrain.state.systemPromptBefore = parsedSettings.systemPromptBefore;
            }
            if (parsedSettings.systemPromptAfter) {
                SecondBrain.state.systemPromptAfter = parsedSettings.systemPromptAfter;
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
        // Save all settings to a single storage location
        const settings = {
            apiKey: SecondBrain.state.apiKey,
            apiProvider: SecondBrain.state.apiProvider,
            apiEndpoint: SecondBrain.state.apiEndpoint,
            systemPromptBefore: SecondBrain.state.systemPromptBefore,
            systemPromptAfter: SecondBrain.state.systemPromptAfter
        };
        
        localStorage.setItem(SecondBrain.config.SETTINGS_KEY, JSON.stringify(settings));
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
        systemPromptAfterInput,
        chatSettings
    } = SecondBrain.dom;
    
    SecondBrain.state.apiKey = apiKeyInput.value.trim();
    SecondBrain.state.apiProvider = apiProviderSelect.value;
    SecondBrain.state.apiEndpoint = apiEndpointInput.value.trim() || 
        SecondBrain.config.API_PROVIDERS[apiProviderSelect.value].defaultEndpoint;
    SecondBrain.state.systemPromptBefore = systemPromptBeforeInput.value.trim();
    SecondBrain.state.systemPromptAfter = systemPromptAfterInput.value.trim();
    
    SecondBrain.saveApiSettings();
    
    // Show confirmation message
    const settingsSavedMessage = SecondBrain.dom.settingsSavedMessage;
    if (settingsSavedMessage) {
        settingsSavedMessage.style.display = 'inline-block';
        
        // Hide after 3 seconds
        setTimeout(() => {
            settingsSavedMessage.style.display = 'none';
        }, 3000);
    }
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
    
    if (apiProvider === 'gemini') {
        headers['x-goog-api-key'] = apiKey;
        requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: `${combinedSystemPrompt}\n\n${context}\n\n${userMessage}` }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4000, // Increased from 1000 to 4000
                stopSequences: ["STOP_SEQUENCE_THAT_WILL_NEVER_APPEAR"] // Ensures we get complete responses
            }
        };
    } else if (apiProvider === 'openai') {
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
    
    // Add retry logic for API calls
    const maxRetries = 3;
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount < maxRetries) {
        try {
            console.log(`API attempt ${retryCount + 1}/${maxRetries} to ${apiEndpoint}`);
            
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`API error (attempt ${retryCount + 1}/${maxRetries}):`, response.status, response.statusText, errorData);
                throw new Error(`API request failed: ${response.status} ${response.statusText} ${JSON.stringify(errorData)}`);
            }
            
            const data = await response.json();
            console.log('API response received:', data);
            
            // Extract the response text based on the provider
            let responseText = '';
            
            if (apiProvider === 'gemini') {
                if (!data.candidates || !data.candidates.length) {
                    console.error('No candidates in Gemini response:', data);
                    throw new Error('No candidates in Gemini response');
                }
                
                const candidate = data.candidates[0];
                if (!candidate.content || !candidate.content.parts || !candidate.content.parts.length) {
                    console.error('Invalid candidate structure in Gemini response:', candidate);
                    throw new Error('Invalid candidate structure in Gemini response');
                }
                
                responseText = candidate.content.parts[0].text;
                
                // Check if the response appears to be cut off
                if (!responseText) {
                    console.error('Empty text in Gemini response part:', candidate.content.parts[0]);
                    throw new Error('Empty text in Gemini response part');
                }
                
                // Check for common signs of truncation
                const truncationIndicators = [
                    /\.\.\.$/, // Ends with ellipsis
                    /[,;:]$/, // Ends with comma, semicolon, or colon
                    /^.*[a-zA-Z]$/ // Ends with a letter (no punctuation)
                ];
                
                const mightBeTruncated = truncationIndicators.some(pattern => pattern.test(responseText.trim()));
                
                if (mightBeTruncated && !responseText.includes('To be continued') && candidate.finishReason === 'MAX_TOKENS') {
                    console.warn('Response appears to be truncated. Adding a note to the user.');
                    responseText += '\n\n[Note: The AI\'s response was cut off due to length limits. You may want to ask for the rest or rephrase your question to get a more concise answer.]';
                }
            } else if (apiProvider === 'openai') {
                if (!data.choices || !data.choices.length || !data.choices[0].message) {
                    console.error('Invalid OpenAI response structure:', data);
                    throw new Error('Invalid OpenAI response structure');
                }
                responseText = data.choices[0].message.content;
            } else if (apiProvider === 'anthropic') {
                if (!data.content || !data.content.length) {
                    console.error('Invalid Anthropic response structure:', data);
                    throw new Error('Invalid Anthropic response structure');
                }
                responseText = data.content[0].text;
            } else {
                // Try to extract from a generic response structure
                responseText = 
                    (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) ||
                    (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
                    (data.content && data.content[0] && data.content[0].text) ||
                    (data.response) ||
                    JSON.stringify(data);
            }
            
            if (!responseText) {
                console.error('Empty response text after extraction:', data);
                throw new Error('Empty response text after extraction');
            }
            
            console.log('Successfully extracted response text');
            return responseText;
        } catch (error) {
            lastError = error;
            console.error(`API call attempt ${retryCount + 1}/${maxRetries} failed:`, error);
            retryCount++;
            
            if (retryCount < maxRetries) {
                // Add exponential backoff with jitter
                const delay = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 10000);
                console.log(`Retrying in ${Math.round(delay/1000)} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    console.error('All API call attempts failed:', lastError);
    return 'Sorry, I was unable to get a response from the AI service after multiple attempts. Please try again later.';
};

// --- UI Functions ---

/**
 * Creates and adds the chat button to the app header
 */
SecondBrain.attachChatButton = () => {
    const chatButton = document.getElementById('brainBtn');
    console.log('Attaching brain button', chatButton); // Debug log
    if (chatButton) {
        chatButton.addEventListener('click', SecondBrain.showChatModal);
        // Add hover animations
        chatButton.addEventListener('mouseenter', SecondBrain.handleBrainHoverIn);
        chatButton.addEventListener('mouseleave', SecondBrain.handleBrainHoverOut);
        // Store reference
        SecondBrain.dom.chatButton = chatButton;
        console.log('Brain button attached successfully'); // Debug log
    } else {
        console.error('Brain button not found!'); // Debug log
    }
};

/**
 * Handles the brain icon animation on mouse enter - a gentle pulsing effect
 */
SecondBrain.handleBrainHoverIn = () => {
    const brainEmoji = SecondBrain.dom.chatButton?.querySelector('.brain-emoji');
    console.log('Brain hover in triggered', brainEmoji); // Debug log
    if (brainEmoji) {
        // Scale up with a gentle pulse
        brainEmoji.style.transition = 'transform 0.2s ease';
        brainEmoji.style.transform = 'scale(1.2)';
        
        // Add a subtle pulse effect
        setTimeout(() => {
            brainEmoji.style.transition = 'transform 0.3s ease';
            brainEmoji.style.transform = 'scale(1.25)';
            
            setTimeout(() => {
                brainEmoji.style.transition = 'transform 0.3s ease';
                brainEmoji.style.transform = 'scale(1.2)';
            }, 300);
        }, 200);
    }
};

/**
 * Handles the brain icon animation on mouse leave
 */
SecondBrain.handleBrainHoverOut = () => {
    const brainEmoji = SecondBrain.dom.chatButton?.querySelector('.brain-emoji');
    if (brainEmoji) {
        // Reset to normal state
        brainEmoji.style.transition = 'transform 0.3s ease';
        brainEmoji.style.transform = 'scale(1)';
    }
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
                <button class="close-button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div class="chat-container">
                <div class="chat-messages" id="chatMessages">
                    <div class="chat-message system-message">
                        <div class="message-content">
                            Welcome to your Second Brain! I can help you with your tasks and notes. What would you like to know?
                        </div>
                    </div>
                </div>
                <div class="chat-input-area">
                    <div class="chat-input-container">
                        <textarea id="chatInput" placeholder="Ask me anything about your tasks and notes..." rows="1"></textarea>
                        <button id="chatSendButton" class="chat-send-button">
                            <i data-feather="send"></i>
                        </button>
                    </div>
                    <div class="settings-toggle">
                        <button id="toggleSettingsBtn" class="toggle-settings-button">
                            <i data-feather="settings" class="settings-icon"></i>
                            <span>API Settings</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="chat-settings" id="chatSettings">
                <h4>API Configuration</h4>
                <div class="settings-group">
                    <label for="apiProviderSelect">API Provider</label>
                    <select id="apiProviderSelect">
                        <option value="gemini">Google Gemini 2.5 Pro (Experimental)</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="custom">Custom Provider</option>
                    </select>
                </div>
                <div class="settings-group">
                    <label for="apiKeyInput">API Key</label>
                    <input type="password" id="apiKeyInput" placeholder="Enter your API key">
                </div>
                <div class="settings-group">
                    <label for="apiEndpointInput">API Endpoint</label>
                    <input type="text" id="apiEndpointInput" placeholder="API endpoint URL" value="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent">
                </div>
                <div class="settings-group">
                    <label for="systemPromptBeforeInput">System Prompt (Before Context)</label>
                    <textarea id="systemPromptBeforeInput" placeholder="Enter system prompt that appears before the context" rows="2"></textarea>
                </div>
                <div class="settings-group">
                    <label for="systemPromptAfterInput">System Prompt (After Context)</label>
                    <textarea id="systemPromptAfterInput" placeholder="Enter system prompt that appears after the context" rows="2"></textarea>
                </div>
                <div id="settingsSavedMessage" class="settings-saved-message" style="display: none;">Settings saved successfully!</div>
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
    SecondBrain.dom.settingsSavedMessage = document.getElementById('settingsSavedMessage'); // New property
    
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
    apiProviderSelect.value = SecondBrain.state.apiProvider || 'gemini';
    
    // Always use the latest endpoint from the config
    apiEndpointInput.value = SecondBrain.config.API_PROVIDERS[SecondBrain.state.apiProvider || 'gemini'].defaultEndpoint;
    
    // Always load the current system prompts from state (which includes user customizations)
    systemPromptBeforeInput.value = SecondBrain.state.systemPromptBefore || '';
    systemPromptAfterInput.value = SecondBrain.state.systemPromptAfter || '';
    
    // Set settings panel expanded state based on saved state
    if (chatSettings) {
        // Use classList to add/remove the expanded class based on state
        if (SecondBrain.state.apiSettingsExpanded) {
            chatSettings.classList.add('expanded');
        } else {
            chatSettings.classList.remove('expanded');
        }
        
        // Ensure the settings icon is consistent
        const toggleSettingsBtn = SecondBrain.dom.toggleSettingsBtn;
        if (toggleSettingsBtn) {
            const settingsIcon = toggleSettingsBtn.querySelector('.settings-icon');
            if (settingsIcon) {
                settingsIcon.setAttribute('data-feather', 'settings');
                App.refreshIcons();
            }
        }
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
    
    // Process content to completely strip all markdown formatting and emojis
    const processedContent = SecondBrain.addMessageToChat.stripMarkdown(content);
    
    contentEl.innerHTML = processedContent;
    
    messageEl.appendChild(contentEl);
    chatMessages.appendChild(messageEl);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Add to messages state
    SecondBrain.state.messages.push({ role, content });
};

/**
 * Process content to handle markdown formatting and hex symbols
 * This function will remove markdown syntax but allow emojis
 * @param {string} text - The text to process
 * @returns {string} - The processed text
 */
SecondBrain.addMessageToChat.stripMarkdown = (text) => {
    if (!text) return '';
    
    return text
        // Remove or replace all markdown formatting
        .replace(/\*/g, '') // Remove asterisks completely
        .replace(/_/g, '') // Remove underscores
        .replace(/\*\*/g, '') // Remove double asterisks
        .replace(/\#/g, '') // Remove hashtags
        .replace(/\`\`\`[\s\S]*?\`\`\`/g, (match) => match.replace(/\`\`\`/g, '')) // Remove code block markers
        .replace(/\`/g, '') // Remove inline code markers
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)') // Convert markdown links to plain text
        .replace(/\!\[([^\]]+)\]\(([^)]+)\)/g, 'Image: $1 ($2)') // Convert markdown images to plain text
        // Only remove hex representations, not actual emojis
        .replace(/<0x[A-Fa-f0-9]+>/g, '') // Remove hex representations like <0xF0><0x9F>
        .replace(/\n/g, '<br>'); // Replace newlines with <br> tags
};

/**
 * Shows an enhanced loading indicator in the chat
 */
SecondBrain.showLoadingIndicator = () => {
    const { chatMessages } = SecondBrain.dom;
    if (!chatMessages) return;
    
    const loadingEl = document.createElement('div');
    loadingEl.className = 'chat-message assistant-message loading';
    loadingEl.innerHTML = `
        <div class="message-content">
            <div class="typing-indicator">
                <div class="dots-container">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;
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
    const userMessage = chatInput.value.trim();
    
    if (!userMessage || SecondBrain.state.isProcessing) return;
    
    SecondBrain.state.isProcessing = true;
    
    // Add user message to chat
    SecondBrain.addMessageToChat(userMessage, 'user');
    
    // Clear input
    chatInput.value = '';
    
    // Show loading indicator
    SecondBrain.showLoadingIndicator();
    
    // Determine what data to include in context
    const includeCalendar = true; // Always include calendar for now
    const includeNotes = true;    // Always include notes for now
    
    // Format data for context
    SecondBrain.formatDataForContext(includeCalendar, includeNotes)
        .then(context => {
            // Send to LLM
            return SecondBrain.sendToLLM(userMessage, context);
        })
        .then(response => {
            // Remove loading indicator
            SecondBrain.removeLoadingIndicator();
            
            // Add assistant message to chat
            SecondBrain.addMessageToChat(response, 'assistant');
            
            // Reset processing state
            SecondBrain.state.isProcessing = false;
        })
        .catch(error => {
            console.error('Error in message handling:', error);
            
            // Remove loading indicator
            SecondBrain.removeLoadingIndicator();
            
            // Add error message to chat
            const errorMessage = error.message || 'An error occurred while processing your request.';
            
            // Create a more user-friendly error message
            let userFriendlyError = 'Sorry, I encountered an issue while processing your request.';
            
            if (errorMessage.includes('API key')) {
                userFriendlyError = 'Please check your API key in the settings. It appears to be missing or invalid.';
            } else if (errorMessage.includes('API request failed')) {
                userFriendlyError = 'There was a problem connecting to the AI service. This could be due to network issues or service unavailability.';
            } else if (errorMessage.includes('truncated') || errorMessage.includes('cut off')) {
                userFriendlyError = 'Your question generated a very long response that was cut off. Try asking a more specific question.';
            }
            
            // Add the technical details for debugging
            userFriendlyError += '\n\nTechnical details: ' + errorMessage;
            
            // Add as system message with error class
            const messageEl = document.createElement('div');
            messageEl.className = 'chat-message system-message error';
            
            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            contentEl.textContent = userFriendlyError;
            
            messageEl.appendChild(contentEl);
            SecondBrain.dom.chatMessages.appendChild(messageEl);
            
            // Scroll to bottom
            SecondBrain.dom.chatMessages.scrollTop = SecondBrain.dom.chatMessages.scrollHeight;
            
            // Reset processing state
            SecondBrain.state.isProcessing = false;
        });
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
 * Toggles the API settings panel with animation
 */
SecondBrain.toggleApiSettings = () => {
    const { chatSettings, toggleSettingsBtn } = SecondBrain.dom;
    if (!chatSettings || !toggleSettingsBtn) return;
    
    const settingsIcon = toggleSettingsBtn.querySelector('.settings-icon');
    
    // Using classList to add/remove the expanded class based on state
    const isExpanded = chatSettings.classList.toggle('expanded');
    SecondBrain.state.apiSettingsExpanded = isExpanded;
    
    // Always keep the settings icon
    if (settingsIcon) {
        settingsIcon.setAttribute('data-feather', 'settings');
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
        SecondBrain.attachChatButton();
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
