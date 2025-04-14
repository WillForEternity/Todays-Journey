// --- script.js ---
// === Calendar Application Module ===
const CalendarApp = {};

// --- Calendar DOM Elements ---
CalendarApp.dom = {
    // Task input elements
    taskInput: document.getElementById('taskInput'),
    addButton: document.getElementById('addButton'),
    importantCheckbox: document.getElementById('importantCheckbox'),
    importantCheckboxLabel: document.getElementById('importantCheckbox')?.parentElement,
    
    // Task list elements
    taskList: document.getElementById('taskList'),
    importantList: document.getElementById('importantList'),
    dailyTasksTitle: document.getElementById('dailyTasksTitle'),
    dailyEmptyState: document.getElementById('dailyEmptyState'),
    importantEmptyState: document.getElementById('importantEmptyState'),
    
    // Calendar elements
    calendarGrid: document.getElementById('calendarGrid'),
    monthYear: document.getElementById('monthYear'),
    prevMonthBtn: document.getElementById('prevMonthBtn'),
    nextMonthBtn: document.getElementById('nextMonthBtn'),
    
    // Shared elements
    appTitle: App.dom.appTitle,
    calendarViewContainer: App.dom.calendarViewContainer,
    
    // Modal elements
    taskDetailsModal: App.dom.taskDetailsModal,
    modalTimeInput: document.getElementById('modalTimeInput'),
    modalRecurringCheckbox: document.getElementById('modalRecurringCheckbox'),
    recurringNote: document.querySelector('.modal-recurring-note'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
};

// --- Calendar State ---
CalendarApp.state = {
    selectedDate: null, // Initialized in init
    currentCalendarDate: new Date(), // Tracks the displayed calendar month/year
    allTasks: {}, // In-memory map: { "YYYY-MM-DD": [taskObj, ...] }
    tempTaskDataForModal: {},
    isInitialized: false,
};

// --- Calendar Configuration ---
CalendarApp.config = {
    MAX_TASKS_FOR_FULL_OPACITY: 5,
    MIN_TASK_OPACITY: 0.15,
    MAX_TASK_OPACITY: 0.85,
};

// --- Date Helpers (Specific to Calendar Needs) ---
CalendarApp.getTodayDateString = () => CalendarApp.formatDate(new Date());

CalendarApp.formatDate = (date) => { // Uses local date parts but constructs YYYY-MM-DD string
    if (!(date instanceof Date) || isNaN(date)) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`; // Fallback to today
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

CalendarApp.parseDateString = (dateString) => { // Parses YYYY-MM-DD into a UTC Date object
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return null;
    }
    const parts = dateString.split('-');
    const date = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    if (isNaN(date.getTime()) || date.getUTCFullYear() !== parseInt(parts[0], 10) || date.getUTCMonth() !== parseInt(parts[1], 10) - 1 || date.getUTCDate() !== parseInt(parts[2], 10)) {
        console.error("Date string parsing resulted in invalid date:", dateString);
        return null;
    }
    return date;
};

CalendarApp.formatDateUTC = (date) => { // Format date object to YYYY-MM-DD using UTC methods
    if (!(date instanceof Date) || isNaN(date)) {
        return null;
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};


// --- Calendar DB Interaction (Uses Shared App.dbAction) ---

CalendarApp.addTaskDB = (task) => App.dbAction(App.config.TASK_STORE_NAME, 'readwrite', 'add', task);
CalendarApp.updateTaskDB = (task) => App.dbAction(App.config.TASK_STORE_NAME, 'readwrite', 'put', task);
CalendarApp.deleteTaskDB = (taskId) => App.dbAction(App.config.TASK_STORE_NAME, 'readwrite', 'delete', taskId);
CalendarApp.getAllTasksDB = () => App.dbAction(App.config.TASK_STORE_NAME, 'readonly', 'getAll');

// --- Calendar Data Loading & Processing ---

/**
 * Loads tasks from DB and populates the in-memory map.
 */
CalendarApp.loadTasks = async () => {
    try {
        const tasksFromDB = await CalendarApp.getAllTasksDB();
        console.log("Calendar: Tasks loaded from DB:", tasksFromDB.length);

        let needsDBUpdate = false;
        const updatePromises = [];
        const validTasks = [];

        tasksFromDB.forEach(task => {
            let taskModified = false;
            if (typeof task.id === 'undefined') { console.warn("Task missing ID, skipping:", task); return; }
            if (typeof task.originalDate === 'undefined' || !/^\d{4}-\d{2}-\d{2}$/.test(task.originalDate)) { console.warn("Task missing or invalid originalDate, skipping:", task); return; }
            if (typeof task.text === 'undefined') task.text = "Untitled Task";

            if (typeof task.isRecurringWeekly === 'undefined') { task.isRecurringWeekly = false; taskModified = true; }
            if (task.time === "") { task.time = null; taskModified = true; }
            if (typeof task.important === 'undefined') { task.important = false; taskModified = true; }
            if (typeof task.completed === 'undefined') { task.completed = false; taskModified = true; }
            if (typeof task.createdAt === 'undefined') { task.createdAt = Date.now(); taskModified = true; }
             if (typeof task.updatedAt === 'undefined') { task.updatedAt = task.createdAt || Date.now(); taskModified = true; } // Add updatedAt

            validTasks.push(task);

            if (taskModified) {
                needsDBUpdate = true;
                updatePromises.push(CalendarApp.updateTaskDB(task).catch(err => console.error("Task migration update error:", task.id, err)));
            }
        });

        if (needsDBUpdate) {
            console.log("Calendar: Migrating task structure in DB...");
            await Promise.all(updatePromises);
            console.log("Calendar: Task migration updates complete.");
        }

        CalendarApp.state.allTasks = CalendarApp.reconstructAllTasksMap(validTasks);
        console.log("Calendar: In-memory task map reconstructed:", Object.keys(CalendarApp.state.allTasks).length, "dates with tasks.");

    } catch (error) {
        console.error("Calendar: Failed to load tasks:", error);
        CalendarApp.state.allTasks = {};
    }
};

/**
 * Reconstructs the allTasks map from a flat array of tasks.
 * @param {Array<object>} tasksFromDB - Array of task objects from the DB.
 * @returns {object} The reconstructed allTasks map.
 */
CalendarApp.reconstructAllTasksMap = (tasksFromDB) => {
    const taskMap = {};
    tasksFromDB.forEach(task => {
        const dateKey = task.originalDate;
        if (!taskMap[dateKey]) {
            taskMap[dateKey] = [];
        }
        taskMap[dateKey].push(task);
    });
     // Sort tasks within each date
     Object.values(taskMap).forEach(tasksOnDate => {
         tasksOnDate.sort((a, b) => {
             const timeA = a.time; const timeB = b.time;
             if (timeA && timeB) return timeA.localeCompare(timeB);
             if (timeA && !timeB) return -1;
             if (!timeA && timeB) return 1;
             return (a.createdAt || 0) - (b.createdAt || 0) || (a.id || '').localeCompare(b.id || '');
         });
     });
    return taskMap;
};

/**
 * Gets tasks for a specific date, including recurring ones.
 * @param {string} targetDateString - The date in "YYYY-MM-DD" format.
 * @returns {Array<object>} Sorted array of task objects for the date.
 */
CalendarApp.getTasksForDate = (targetDateString) => {
    const targetDateObj = CalendarApp.parseDateString(targetDateString);
    if (!targetDateObj) return [];

    const targetDayOfWeek = targetDateObj.getUTCDay();

    const explicitTasks = (CalendarApp.state.allTasks[targetDateString] || []).map(task => ({
        ...task,
        isInstance: false
    }));

    const recurringInstances = [];
    Object.keys(CalendarApp.state.allTasks).forEach(storedDateString => {
        if (storedDateString >= targetDateString) return;

        const storedDateObj = CalendarApp.parseDateString(storedDateString);
        if (storedDateObj) {
            const storedDayOfWeek = storedDateObj.getUTCDay();
            if (storedDayOfWeek === targetDayOfWeek) {
                (CalendarApp.state.allTasks[storedDateString] || []).forEach(task => {
                    if (task.isRecurringWeekly) {
                        const alreadyExists = explicitTasks.some(et => et.id === task.id);
                        if (!alreadyExists) {
                            recurringInstances.push({ ...task, isInstance: true });
                        }
                    }
                });
            }
        }
    });

     const combinedTasks = [...explicitTasks, ...recurringInstances];
     combinedTasks.sort((a, b) => {
        const timeA = a.time; const timeB = b.time;
        if (timeA && timeB) return timeA.localeCompare(timeB);
        if (timeA && !timeB) return -1;
        if (!timeA && timeB) return 1;
        return (a.createdAt || 0) - (b.createdAt || 0) || (a.id || '').localeCompare(b.id || '');
    });

    return combinedTasks;
};


// --- Calendar Rendering Functions ---

/**
 * Renders the calendar grid for the given year and month.
 * @param {number} year - Full year.
 * @param {number} month - 0-indexed month (0-11).
 */
CalendarApp.renderCalendar = (year, month) => {
    const { calendarGrid, monthYear } = CalendarApp.dom;
    if (!calendarGrid || !monthYear) { return; }

    calendarGrid.innerHTML = '';

    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(header => {
        const div = document.createElement('div');
        div.classList.add('calendar-day-header');
        div.textContent = header;
        calendarGrid.appendChild(div);
    });

    const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
    if (isNaN(firstDayOfMonth.getTime())) { console.error("Invalid date for calendar render"); return; }
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const startDayOfWeek = firstDayOfMonth.getUTCDay();

    monthYear.textContent = firstDayOfMonth.toLocaleDateString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const todayString = CalendarApp.getTodayDateString();
    const selectedDate = CalendarApp.state.selectedDate;

    const prevMonthLastDay = new Date(Date.UTC(year, month, 0));
    const daysInPrevMonth = prevMonthLastDay.getUTCDate();

    // Prev month padding
    for (let i = 0; i < startDayOfWeek; i++) {
        const day = daysInPrevMonth - startDayOfWeek + 1 + i;
        const div = document.createElement('div');
        div.classList.add('calendar-day', 'other-month');
        div.textContent = day;
        const prevMonthDate = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(prevMonthDate.getTime())) {
            const prevMonthDateString = CalendarApp.formatDateUTC(prevMonthDate);
            if (prevMonthDateString === todayString) div.classList.add('today');
        }
        calendarGrid.appendChild(div);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const div = document.createElement('div');
        div.classList.add('calendar-day');
        div.textContent = day;
        const currentDate = new Date(Date.UTC(year, month, day));
        if (isNaN(currentDate.getTime())) continue;

        const currentDateString = CalendarApp.formatDateUTC(currentDate);
        if (!currentDateString) continue;

        div.dataset.date = currentDateString;

        if (currentDateString === todayString) div.classList.add('today');
        if (currentDateString === selectedDate) div.classList.add('selected-day');

        div.style.removeProperty('--task-alpha');
        delete div.dataset.taskCount;

        if (currentDateString !== selectedDate) {
            const tasksForDay = CalendarApp.getTasksForDate(currentDateString);
            const taskCount = tasksForDay.length;

            if (taskCount > 0) {
                const { MAX_TASKS_FOR_FULL_OPACITY, MIN_TASK_OPACITY, MAX_TASK_OPACITY } = CalendarApp.config;
                let alpha = MAX_TASK_OPACITY; // Default to max if limit is 1 or less
                if (MAX_TASKS_FOR_FULL_OPACITY > 1) {
                    const progress = Math.min(taskCount, MAX_TASKS_FOR_FULL_OPACITY) / MAX_TASKS_FOR_FULL_OPACITY;
                     alpha = MIN_TASK_OPACITY + progress * (MAX_TASK_OPACITY - MIN_TASK_OPACITY);
                }
                alpha = Math.max(MIN_TASK_OPACITY, Math.min(MAX_TASK_OPACITY, alpha));
                div.style.setProperty('--task-alpha', alpha.toFixed(3));
                div.dataset.taskCount = taskCount;
            }
        }

        div.addEventListener('click', () => {
            CalendarApp.selectCalendarDate(currentDateString);
        });
        calendarGrid.appendChild(div);
    }

     // Next month padding
    const gridCellsFilled = startDayOfWeek + daysInMonth;
    const remainingCells = (7 - (gridCellsFilled % 7)) % 7;
    for (let i = 1; i <= remainingCells; i++) {
        const div = document.createElement('div');
        div.classList.add('calendar-day', 'other-month');
        div.textContent = i;
         const nextMonthDate = new Date(Date.UTC(year, month + 1, i));
         if (!isNaN(nextMonthDate.getTime())) {
             const nextMonthDateString = CalendarApp.formatDateUTC(nextMonthDate);
             if (nextMonthDateString === todayString) div.classList.add('today');
         }
        calendarGrid.appendChild(div);
    }
};

/**
 * Renders the task list for the currently selected date AND updates the H1 title.
 */
CalendarApp.renderTaskList = () => {
    const { taskList, dailyEmptyState, taskInput, importantCheckbox } = CalendarApp.dom;
    const dateString = CalendarApp.state.selectedDate;
    const { appTitle } = App.dom; // Get shared H1

    if (!taskList || !dailyEmptyState || !dateString || !appTitle) {
         console.error("Missing DOM elements (taskList, dailyEmptyState, appTitle) or selected date for renderTaskList");
         return;
    }

    taskList.innerHTML = '';

    // --- Update H1 Title ---
    let titleText = '';
    const todayString = CalendarApp.getTodayDateString();
    if (dateString === todayString) {
        titleText = "Today's Journey";
    } else {
        const parsedDate = CalendarApp.parseDateString(dateString);
        if (parsedDate) {
            titleText = `Journey for ${parsedDate.toLocaleDateString('default', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`;
        } else {
            titleText = `Journey for ${dateString}`; // Fallback
        }
    }
    // Only update H1 if the calendar view is actually active
    if (App.state.currentView === 'calendar') {
         appTitle.textContent = titleText;
    }
    // --- End Title Update ---

    // Get and Render Tasks
    const tasksToDisplay = CalendarApp.getTasksForDate(dateString);

    if (tasksToDisplay.length === 0) {
        dailyEmptyState.style.display = 'flex';
        taskList.style.display = 'none';
    } else {
         dailyEmptyState.style.display = 'none';
         taskList.style.display = '';
         tasksToDisplay.forEach(task => {
            const li = CalendarApp.createTaskListItem(task, dateString);
            taskList.appendChild(li);
        });
    }

     // Reset input area
     if(taskInput) taskInput.value = '';
     if(importantCheckbox) importantCheckbox.checked = false;
     CalendarApp.updateImportantInputStar();

     App.refreshIcons(); // Refresh delete icons etc.
};

/**
 * Renders the list of important tasks in the sidebar.
 */
CalendarApp.renderImportantTasks = () => {
    const { importantList, importantEmptyState } = CalendarApp.dom;
    if (!importantList || !importantEmptyState) return;

    importantList.innerHTML = '';
    const importantTasksFound = [];

    Object.keys(CalendarApp.state.allTasks).forEach(originalDate => {
        (CalendarApp.state.allTasks[originalDate] || []).forEach(task => {
            if (task.important) {
                importantTasksFound.push(task);
            }
        });
    });

    importantTasksFound.sort((a, b) => {
         const dateAValid = /^\d{4}-\d{2}-\d{2}$/.test(a.originalDate);
         const dateBValid = /^\d{4}-\d{2}-\d{2}$/.test(b.originalDate);
         if (!dateAValid && !dateBValid) return 0;
         if (!dateAValid) return 1;
         if (!dateBValid) return -1;

         const dateComparison = a.originalDate.localeCompare(b.originalDate);
         if (dateComparison !== 0) return dateComparison;
         const timeA = a.time; const timeB = b.time;
         if (timeA && timeB) return timeA.localeCompare(timeB);
         if (timeA && !timeB) return -1;
         if (!timeA && timeB) return 1;
         return (a.createdAt || 0) - (b.createdAt || 0) || (a.id || '').localeCompare(b.id || '');
     });

    if (importantTasksFound.length === 0) {
         importantEmptyState.style.display = 'flex';
         importantList.style.display = 'none';
    } else {
        importantEmptyState.style.display = 'none';
        importantList.style.display = '';
        importantTasksFound.forEach(taskInfo => {
             const li = CalendarApp.createImportantTaskListItem(taskInfo);
             importantList.appendChild(li);
         });
    }
     // Refresh icons if any were used inside list items (currently none here)
     // App.refreshIcons();
};

/**
 * Creates an LI element for a task in the main daily list.
 * @param {object} task - The task object.
 * @param {string} displayDate - The date the list is currently showing.
 * @returns {HTMLLIElement} The created list item element.
 */
CalendarApp.createTaskListItem = (task, displayDate) => {
     const li = document.createElement('li');
     li.classList.toggle('completed', !!task.completed);
     li.classList.toggle('is-recurring-instance', !!task.isInstance);
     li.classList.toggle('timeless-task', !task.time); // Add class for tasks without a time
     li.dataset.taskId = task.id;
     li.dataset.originalDate = task.originalDate;

     const contentWrapper = document.createElement('div');
     contentWrapper.className = 'task-content-wrapper';
     if (task.time) {
         const timeSpan = document.createElement('span');
         timeSpan.className = 'task-time';
         timeSpan.textContent = task.time;
         contentWrapper.appendChild(timeSpan);
     }
    const textSpan = document.createElement('span');
    textSpan.className = 'task-text';
    textSpan.textContent = task.text;
    contentWrapper.appendChild(textSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'task-actions';

     const importantBtn = document.createElement('span');
     importantBtn.className = 'important-star';
     importantBtn.innerHTML = task.important ? '★' : '☆';
     importantBtn.classList.toggle('is-important', !!task.important);
     importantBtn.title = task.important ? "Mark as not important" : "Mark as important";
     importantBtn.addEventListener('click', (e) => {
         e.stopPropagation();
         const liElement = e.target.closest('li');
         if (liElement?.dataset.taskId && liElement?.dataset.originalDate) {
             CalendarApp.toggleTaskImportance(liElement.dataset.taskId, liElement.dataset.originalDate);
         }
     });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = `<i data-feather="trash-2"></i>`; // Updated to trash-2 for consistency
    deleteBtn.title = "Delete task";
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const liElement = e.target.closest('li');
         if (liElement?.dataset.taskId && liElement?.dataset.originalDate) {
            CalendarApp.handleDeleteTask(liElement.dataset.taskId, liElement.dataset.originalDate, displayDate);
        }
    });

    actionsDiv.appendChild(importantBtn);
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(contentWrapper);
    li.appendChild(actionsDiv);

     li.addEventListener('click', (event) => {
         if (!actionsDiv.contains(event.target)) {
            if (li.dataset.taskId && li.dataset.originalDate) {
                CalendarApp.toggleTaskCompletion(li.dataset.taskId, li.dataset.originalDate);
            }
         }
     });

    return li;
};

/**
 * Creates an LI element for the Important Tasks sidebar list.
 * @param {object} taskInfo - The task object.
 * @returns {HTMLLIElement} The created list item element.
 */
CalendarApp.createImportantTaskListItem = (taskInfo) => {
    const li = document.createElement('li');
    li.classList.toggle('completed', !!taskInfo.completed);
    li.dataset.taskId = taskInfo.id;
    li.dataset.taskDate = taskInfo.originalDate;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'task-content-wrapper';
    if (taskInfo.time) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'task-time';
        timeSpan.textContent = taskInfo.time;
        contentWrapper.appendChild(timeSpan);
    }
    const textSpan = document.createElement('span');
    textSpan.className = 'task-text';
    textSpan.textContent = taskInfo.text;
    contentWrapper.appendChild(textSpan);

    const dateSpan = document.createElement('span');
    dateSpan.className = 'task-date';
    const parsedDate = CalendarApp.parseDateString(taskInfo.originalDate);
    dateSpan.textContent = parsedDate
        ? `(${parsedDate.toLocaleDateString('default', { month: 'short', day: 'numeric', timeZone: 'UTC' })})`
        : `(${taskInfo.originalDate})`;

    li.appendChild(contentWrapper);
    li.appendChild(dateSpan);

    li.addEventListener('click', () => {
        CalendarApp.navigateToTaskDate(taskInfo.originalDate);
    });

    return li;
};

/**
 * Helper to update the visual state of the star next to the task input.
 */
CalendarApp.updateImportantInputStar = () => {
    const { importantCheckboxLabel, importantCheckbox } = CalendarApp.dom;
    if (!importantCheckboxLabel || !importantCheckbox) return;
    const starSpan = importantCheckboxLabel.querySelector('.star');
    if (starSpan) {
        starSpan.innerHTML = importantCheckbox.checked ? '★' : '☆';
        starSpan.style.color = importantCheckbox.checked ? 'var(--important-color)' : '#666';
    }
};

/**
 * Renders the current calendar view (calendar + task list + important tasks).
 */
CalendarApp.renderCurrentCalendarView = () => {
    // Check if the calendar view is active before rendering to save resources
    // This is useful if switching views triggers renders defensively
    if (App.state.currentView !== 'calendar') {
        // console.log("Skipping calendar render, view not active.");
        return;
    }

    // Ensure state and DOM are ready (especially after init)
    if (!CalendarApp.state.isInitialized || !CalendarApp.state.selectedDate) {
        console.warn("Attempted to render calendar view before initialization or date selection.");
        return;
    }

    const year = CalendarApp.state.currentCalendarDate.getUTCFullYear();
    const month = CalendarApp.state.currentCalendarDate.getUTCMonth();
    CalendarApp.renderCalendar(year, month);
    CalendarApp.renderTaskList(); // Renders for selectedDate AND updates H1
    CalendarApp.renderImportantTasks();
};


// --- Calendar Actions ---

/**
 * Selects a date on the calendar, updates state, and re-renders.
 * @param {string} dateString - The date to select ("YYYY-MM-DD").
 */
CalendarApp.selectCalendarDate = (dateString) => {
    if (dateString === CalendarApp.state.selectedDate) return;
    CalendarApp.state.selectedDate = dateString;
    console.log("Calendar date selected:", dateString);
    // Re-render the whole view
    CalendarApp.renderCurrentCalendarView();
};

/**
 * Navigates the calendar display to the month/year of a specific task date and selects it.
 * @param {string} dateString - The target date ("YYYY-MM-DD").
 */
CalendarApp.navigateToTaskDate = (dateString) => {
    const targetDate = CalendarApp.parseDateString(dateString);
    if (!targetDate) return;
    // Update the calendar display month/year
    CalendarApp.state.currentCalendarDate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1));
    // Select the date (will trigger full re-render)
    CalendarApp.selectCalendarDate(dateString);
};

/**
 * Opens the task details modal to collect time/recurring info.
 */
CalendarApp.handleAddTaskRequest = () => {
    const { taskInput, importantCheckbox } = CalendarApp.dom;
    if(!taskInput || !importantCheckbox) return;

    const text = taskInput.value.trim();
    const isImportant = importantCheckbox.checked;
    if (!text) {
        alert("Please enter task text.");
        taskInput.focus();
        return;
    }
    CalendarApp.state.tempTaskDataForModal = { text, isImportant };
    CalendarApp.openModal();
};

/**
 * Finalizes adding a task after modal confirmation. Adds to DB and updates UI.
 */
CalendarApp.finalizeTaskAddition = async () => {
    const { modalTimeInput, modalRecurringCheckbox } = CalendarApp.dom;
    const { text, isImportant } = CalendarApp.state.tempTaskDataForModal;
    const selectedDate = CalendarApp.state.selectedDate;

    if (!text || !selectedDate || !modalTimeInput || !modalRecurringCheckbox) {
        console.error("Error: Task text, selected date or modal elements missing for finalization.");
        CalendarApp.closeModal();
        return;
    }

    const timeValue = modalTimeInput.value;
    const time = timeValue ? timeValue : null;
    const isRecurringWeekly = modalRecurringCheckbox.checked;

    const newTask = {
        id: App.generateId(),
        originalDate: selectedDate,
        text,
        completed: false,
        important: isImportant,
        time,
        isRecurringWeekly,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    App.setLoadingState(true, "Adding task...");
    try {
        // For a recurring task, we store the original date and a marker that it's recurring
        if (isRecurringWeekly) {
            newTask.originalDate = selectedDate; // Store original day
        }
        
        // Store the task
        await CalendarApp.addTaskDB(newTask);
        
        // Get the existing task list
        const existingTasks = CalendarApp.state.allTasks[selectedDate] || [];
        
        // Add the new task to state
        CalendarApp.state.allTasks[selectedDate] = [
            ...existingTasks, 
            newTask
        ].sort((a, b) => {
            // Keep sorting consistent with renderTaskList
            const timeA = a.time;
            const timeB = b.time;
            if (timeA && timeB) return timeA.localeCompare(timeB);
            if (timeA && !timeB) return -1;
            if (!timeA && timeB) return 1;
            return (a.createdAt || 0) - (b.createdAt || 0) || (a.id || '').localeCompare(b.id || '');
        });

        CalendarApp.renderCurrentCalendarView();
        CalendarApp.closeModal();
    } catch (error) {
        console.error("Calendar: Failed to add task:", error);
        alert("Error saving task. Please try again.");
    } finally {
        App.setLoadingState(false);
    }
};

/**
 * Toggles the completion status of a task.
 * @param {string} taskId - The ID of the task.
 * @param {string} originalDate - The original date the task belongs to.
 */
CalendarApp.toggleTaskCompletion = async (taskId, originalDate) => {
     const task = CalendarApp.findTaskInMemory(taskId, originalDate);
     if (task) {
         const originalCompletedState = !!task.completed;
         task.completed = !originalCompletedState;
         task.updatedAt = Date.now();

         // Optimistic UI update
         CalendarApp.renderTaskList(); // Renders based on current state
         CalendarApp.renderImportantTasks(); // Update if shown in important list

         try {
            await CalendarApp.updateTaskDB(task);
            console.log("Calendar: Task completion updated in DB:", taskId, task.completed);
         } catch (error) {
            console.error("Calendar: Failed to update task completion:", error);
            // Revert state on error
            task.completed = originalCompletedState;
             task.updatedAt = Date.now(); // Or use previous timestamp?
            alert("Error updating task status. Please try again.");
            // Re-render to show reverted state
            CalendarApp.renderTaskList();
            CalendarApp.renderImportantTasks();
         }
    } else {
        console.warn("Calendar: Task not found for completion toggle:", taskId, originalDate);
    }
};

/**
 * Toggles the importance status of a task.
 * @param {string} taskId - The ID of the task.
 * @param {string} originalDate - The original date the task belongs to.
 */
 CalendarApp.toggleTaskImportance = async (taskId, originalDate) => {
     const task = CalendarApp.findTaskInMemory(taskId, originalDate);
     if (task) {
        const originalImportance = !!task.important;
        task.important = !originalImportance;
        task.updatedAt = Date.now();

        // Optimistic UI update
        CalendarApp.renderTaskList();
        CalendarApp.renderImportantTasks(); // Important list MUST be updated

         try {
             await CalendarApp.updateTaskDB(task);
             console.log("Calendar: Task importance updated in DB:", taskId, task.important);
         } catch(error) {
            console.error("Calendar: Failed to update task importance:", error);
            // Revert state
            task.important = originalImportance;
             task.updatedAt = Date.now();
            alert("Error updating task importance. Please try again.");
             // Re-render
             CalendarApp.renderTaskList();
             CalendarApp.renderImportantTasks();
         }
     } else {
         console.warn("Calendar: Task not found for importance toggle:", taskId, originalDate);
     }
 };

/**
 * Initiates the task deletion process (handles animation).
 * @param {string} taskId - The ID of the task.
 * @param {string} originalDate - The original date the task belongs to.
 * @param {string} displayDate - The date currently shown in the task list.
 */
CalendarApp.handleDeleteTask = (taskId, originalDate, displayDate) => {
    if (!CalendarApp.dom.taskList) return;
    // Find the specific LI instance in the currently displayed list
    const listItem = CalendarApp.dom.taskList.querySelector(`li[data-task-id="${taskId}"][data-original-date="${originalDate}"]`);
    const currentSelectedDate = CalendarApp.state.selectedDate;

     // Animate only if the item is currently visible in the main list
     if (listItem && displayDate === currentSelectedDate) {
         listItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
         listItem.style.opacity = '0';
         listItem.style.transform = 'translateX(20px)';
         listItem.addEventListener('transitionend', () => {
             // Check parentElement as removeTaskData might have already run via fallback
             if (listItem.parentElement) {
                 CalendarApp.removeTaskData(taskId, originalDate);
             }
         }, { once: true });
         // Fallback if transitionend doesn't fire reliably
         setTimeout(() => {
              if (listItem.parentElement) {
                  console.warn("TransitionEnd fallback triggered for task delete animation.");
                  CalendarApp.removeTaskData(taskId, originalDate);
              }
          }, 350);
     } else {
         // If item not visible (e.g., deleting a recurring task instance not shown today), remove data directly
         CalendarApp.removeTaskData(taskId, originalDate);
     }
};

/**
 * Removes task data from DB and memory, then updates UI.
 * @param {string} taskId - The ID of the task.
 * @param {string} originalDate - The original date the task belongs to.
 */
CalendarApp.removeTaskData = async (taskId, originalDate) => {
    // Prevent double execution if called rapidly
    if (CalendarApp.state.deletingTaskId === taskId) return;
    CalendarApp.state.deletingTaskId = taskId; // Simple lock

    try {
        App.setLoadingState(true, "Deleting task...");
        await CalendarApp.deleteTaskDB(taskId);
        console.log("Calendar: Task deleted from DB:", taskId);

        // Remove from in-memory map
        let taskRemoved = false;
        if (CalendarApp.state.allTasks[originalDate]) {
            const initialLength = CalendarApp.state.allTasks[originalDate].length;
            CalendarApp.state.allTasks[originalDate] = CalendarApp.state.allTasks[originalDate].filter(task => task.id !== taskId);
            taskRemoved = CalendarApp.state.allTasks[originalDate].length < initialLength;
            if (CalendarApp.state.allTasks[originalDate].length === 0) {
                delete CalendarApp.state.allTasks[originalDate];
            }
        }

        if (taskRemoved) {
            console.log("Calendar: Task removed from memory:", taskId);
            // Re-render UI ONLY if the current view is calendar
            if (App.state.currentView === 'calendar') {
                CalendarApp.renderCurrentCalendarView();
            }
        } else {
            console.warn("Calendar: Task to delete not found in memory:", taskId, originalDate);
             // Still re-render to be safe if view is active
             if (App.state.currentView === 'calendar') {
                 CalendarApp.renderCurrentCalendarView();
            }
        }

    } catch (error) {
        console.error("Calendar: Failed to delete task:", error);
        alert("Error deleting task. Please try again.");
        // Re-render to ensure consistency if delete failed
        if (App.state.currentView === 'calendar') {
            CalendarApp.renderCurrentCalendarView();
        }
    } finally {
         App.setLoadingState(false);
         delete CalendarApp.state.deletingTaskId; // Release lock
    }
};

/** Finds a task in the local in-memory map. */
CalendarApp.findTaskInMemory = (taskId, originalDate) => {
    if (!CalendarApp.state.allTasks[originalDate]) return null;
    return CalendarApp.state.allTasks[originalDate].find(task => task.id === taskId);
};


// --- Calendar Modal Control ---

CalendarApp.openModal = () => {
    const { modalTimeInput, modalRecurringCheckbox, recurringNote, taskDetailsModal } = CalendarApp.dom;
    if (!taskDetailsModal || !modalTimeInput || !modalRecurringCheckbox || !recurringNote) return;
    
    modalTimeInput.value = '';
    modalRecurringCheckbox.checked = false;
    recurringNote.style.display = 'none';
    taskDetailsModal.classList.add('visible');
    setTimeout(() => modalTimeInput.focus(), 50); // Slight delay for focus
};

CalendarApp.closeModal = () => {
    const { taskDetailsModal } = CalendarApp.dom;
    if (!taskDetailsModal) return;
    taskDetailsModal.classList.remove('visible');
    CalendarApp.state.tempTaskDataForModal = {};
};

// --- Calendar Event Listeners Setup ---
CalendarApp.setupEventListeners = () => {
    const {
        addButton, taskInput, importantCheckbox, prevMonthBtn, nextMonthBtn,
        modalConfirmBtn, modalCancelBtn, taskDetailsModal, modalRecurringCheckbox, recurringNote
    } = CalendarApp.dom;

    addButton?.addEventListener('click', CalendarApp.handleAddTaskRequest);
    taskInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            CalendarApp.handleAddTaskRequest();
        }
    });

    prevMonthBtn?.addEventListener('click', () => {
        const { currentCalendarDate } = CalendarApp.state;
        const newDate = new Date(Date.UTC(
            currentCalendarDate.getUTCFullYear(),
            currentCalendarDate.getUTCMonth() - 1,
            1
        ));
        CalendarApp.state.currentCalendarDate = newDate;
        CalendarApp.renderCurrentCalendarView(); // Update full calendar view including tasks
    });

    nextMonthBtn?.addEventListener('click', () => {
        const { currentCalendarDate } = CalendarApp.state;
        const newDate = new Date(Date.UTC(
            currentCalendarDate.getUTCFullYear(),
            currentCalendarDate.getUTCMonth() + 1,
            1
        ));
        CalendarApp.state.currentCalendarDate = newDate;
        CalendarApp.renderCurrentCalendarView(); // Update full calendar view including tasks
    });

    modalConfirmBtn?.addEventListener('click', CalendarApp.finalizeTaskAddition);
    modalCancelBtn?.addEventListener('click', CalendarApp.closeModal);

    taskDetailsModal?.addEventListener('click', (event) => {
        if (event.target === taskDetailsModal) {
            CalendarApp.closeModal();
        }
    });
    
    modalRecurringCheckbox?.addEventListener('change', (e) => {
        if (e.target.checked) {
            recurringNote.style.display = 'block';
        } else {
            recurringNote.style.display = 'none';
        }
    });
    // Escape key for modal is handled globally in view-toggle.js
};

// --- Calendar Initialization ---
CalendarApp.init = async () => {
    console.log("Initializing Calendar Module...");
    // Loading state managed by App.init

    // Set initial dates
    const today = new Date();
    CalendarApp.state.selectedDate = CalendarApp.getTodayDateString();
    CalendarApp.state.currentCalendarDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));

    await CalendarApp.loadTasks();

    // Setup event listeners
    CalendarApp.setupEventListeners();

    CalendarApp.state.isInitialized = true;

    // Initial render is triggered by App.setView after all modules are initialized.
    // if (App.state.currentView === 'calendar') {
    //     CalendarApp.renderCurrentCalendarView();
    // }

    return Promise.resolve();
};