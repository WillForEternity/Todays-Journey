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
};

// --- Second Brain State ---
SecondBrain.state = {
    isInitialized: false,
    apiKey: '',
    apiProvider: 'openai', // Default provider
    apiEndpoint: 'https://api.openai.com/v1/chat/completions', // Default endpoint
    messages: [], // Chat history
    isProcessing: false,
    systemPromptBefore: 'You are a helpful AI assistant that has access to my tasks and notes data. Use this information to provide relevant and concise answers.',
    systemPromptAfter: 'Answer based only on the information provided in the context. Be concise and accurate.',
    apiSettingsExpanded: false, // Whether API settings panel is expanded
};

// --- Second Brain Configuration ---
SecondBrain.config = {
    API_PROVIDERS: {
        openai: {
            name: 'OpenAI',
            defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
            defaultModel: 'gpt-3.5-turbo',
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
        return tasks || [];
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
        return notes || [];
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
        return folders || [];
    } catch (error) {
        console.error('Error extracting folders:', error);
        return [];
    }
};

/**
 * Formats task and note data into a structured context for the LLM
 * @returns {Promise<string>} Formatted context string
 */
SecondBrain.formatDataForContext = async () => {
    try {
        // Extract all data
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

        // Get today's date for comparison
        const today = new Date();
        const todayString = CalendarApp.formatDate(today);

        // Format tasks section
        let tasksSection = '# TASKS\n\n';
        tasksSection += `## TODAY'S DATE: ${todayString}\n\n`;
        
        if (tasks.length === 0) {
            tasksSection += 'No tasks found.\n\n';
        } else {
            // Group tasks by date
            const tasksByDate = {};
            tasks.forEach(task => {
                if (!tasksByDate[task.date]) {
                    tasksByDate[task.date] = [];
                }
                tasksByDate[task.date].push(task);
            });

            // Helper function to parse and compare dates safely
            const compareDates = (dateStr1, dateStr2) => {
                // Convert YYYY-MM-DD to Date objects for proper comparison
                const [year1, month1, day1] = dateStr1.split('-').map(Number);
                const [year2, month2, day2] = dateStr2.split('-').map(Number);
                
                // Compare year first, then month, then day
                if (year1 !== year2) return year1 - year2;
                if (month1 !== month2) return month1 - month2;
                return day1 - day2;
            };

            // Format tasks by date
            Object.keys(tasksByDate).sort().forEach(date => {
                const isToday = date === todayString ? ' [TODAY]' : '';
                const isPast = compareDates(date, todayString) < 0 ? ' [PAST]' : '';
                const isFuture = compareDates(date, todayString) > 0 ? ' [FUTURE]' : '';
                const dateLabel = `${date}${isToday}${isPast}${isFuture}`;
                
                tasksSection += `## Date: ${dateLabel}\n\n`;
                tasksByDate[date].forEach(task => {
                    const status = task.completed ? '[COMPLETED]' : '[PENDING]';
                    const important = task.important ? '[IMPORTANT]' : '';
                    const recurring = task.recurring ? '[RECURRING]' : '';
                    const time = task.time ? `Time: ${task.time}` : '';
                    const location = task.location ? `Location: ${task.location}` : '';
                    
                    tasksSection += `- ${status} ${important} ${recurring} ${task.text} ${time} ${location}\n`;
                });
                tasksSection += '\n';
            });
        }

        // Format notes section
        let notesSection = '# NOTES\n\n';
        if (notes.length === 0) {
            notesSection += 'No notes found.\n\n';
        } else {
            // Group notes by folder
            const notesByFolder = {};
            notes.forEach(note => {
                if (!notesByFolder[note.folderId]) {
                    notesByFolder[note.folderId] = [];
                }
                notesByFolder[note.folderId].push(note);
            });

            // Format notes by folder
            Object.keys(notesByFolder).forEach(folderId => {
                const folderName = folderMap[folderId] || 'Unfiled';
                notesSection += `## Folder: ${folderName}\n\n`;
                
                notesByFolder[folderId].forEach(note => {
                    notesSection += `### ${note.title}\n`;
                    notesSection += `${note.content}\n\n`;
                });
            });
        }

        return tasksSection + notesSection;
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
            SecondBrain.state.systemPromptBefore = parsedPrompts.before || SecondBrain.state.systemPromptBefore;
            SecondBrain.state.systemPromptAfter = parsedPrompts.after || SecondBrain.state.systemPromptAfter;
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
    
    // Update system prompts if inputs exist
    if (systemPromptBeforeInput) {
        SecondBrain.state.systemPromptBefore = systemPromptBeforeInput.value.trim();
    }
    if (systemPromptAfterInput) {
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
    const { apiKey, apiProvider, apiEndpoint } = SecondBrain.state;
    
    if (!apiKey) {
        throw new Error('API key is required. Please set it in the settings.');
    }
    
    // Prepare headers based on the provider
    let headers = {
        'Content-Type': 'application/json',
    };
    
    // Prepare the request body based on the provider
    let requestBody = {};
    
    // Combine system prompts for cleaner instructions
    const systemInstructions = `${SecondBrain.state.systemPromptBefore}\n\n${SecondBrain.state.systemPromptAfter}`;
    
    if (apiProvider === 'openai') {
        headers['Authorization'] = `Bearer ${apiKey}`;
        requestBody = {
            model: SecondBrain.config.API_PROVIDERS.openai.defaultModel,
            messages: [
                { role: 'system', content: systemInstructions },
                { role: 'user', content: context },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 1000
        };
    } else if (apiProvider === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        
        // For Anthropic, we need to structure the messages differently
        // Since it doesn't have a separate system role, we include instructions in the user message
        requestBody = {
            model: SecondBrain.config.API_PROVIDERS.anthropic.defaultModel,
            messages: [
                { 
                    role: 'user', 
                    content: `${SecondBrain.state.systemPromptBefore}\n\nHere is the context information:\n${context}\n\nUser query: ${userMessage}\n\nRemember: ${SecondBrain.state.systemPromptAfter}`
                }
            ],
            max_tokens: 1000
        };
    } else {
        // Custom provider - assume OpenAI-like format but allow for customization
        headers['Authorization'] = `Bearer ${apiKey}`;
        requestBody = {
            model: 'default-model',
            messages: [
                { role: 'system', content: systemInstructions },
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
        // Get context data
        const context = await SecondBrain.formatDataForContext();
        
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

// --- Event Listeners ---

/**
 * Sets up event listeners for the chat UI
 */
SecondBrain.setupEventListeners = () => {
    const { 
        chatButton, chatModal, chatInput, chatSendButton,
        apiProviderSelect, saveApiSettingsButton, toggleSettingsBtn
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
