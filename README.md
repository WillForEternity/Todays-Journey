# Journey & Notes Planner

A single-page web application for managing your tasks and notes with a clean, intuitive interface.

## Features

### Calendar View
- Create daily tasks with optional time settings and locations
- Mark tasks as important or completed
- Recurring weekly task support
- Calendar navigation with month view
- Special styling for timeless tasks
- Customizable task colors
- Location badges for easy visual organization
- Important tasks sidebar for quick access to starred items

### Notes View
- Hierarchical folder organization
- Collapsible folder tree
- Create, edit and delete notes within folders
- Notes saveable and stored in IndexedDB
- Markdown formatting support
- Image embedding capability
- Preview mode toggle for rendered markdown
- Last edited timestamps for notes saved and displayed

### PDF Export
- Export notes as professionally formatted PDF documents
- Multiple theme options (light/dark)
- Optional logo inclusion
- Smart pagination handling
- Code blocks with background colors that span multiple pages
- Proper text wrapping for long code lines
- Syntax highlighting via monospace font and colored backgrounds
- Even padding throughout document
- Different margins for first page vs. subsequent pages
- Page numbers for easy navigation
- Professional header formatting
- Consistent spacing throughout exported documents

### Application Settings
- Dark/Light theme toggle with persistent preference
- Clean settings interface with animated gear icon

### AI Chat (Second Brain)
- Chat interface powered by AI, accessing your calendar and notes
- Clear Chat button to reset conversation (welcome message retained)
- Configurable system prompts and API settings
- Contextual responses using both tasks and notes data
- Automatic inclusion of last modified timestamps

### Sticker Feature
- Upload, place, and manage stickers around your journal entries
- Drag-and-drop placement with resizing and customization

## UI Features
- Clean, minimalist design
- Responsive layout
- Smooth animations and transitions
- Unified color scheme
- Interactive elements with visual feedback
- Persistent view preferences

## Technical Details

- Built with vanilla JavaScript, HTML5, and CSS3
- Local storage using IndexedDB for persistence
- No external dependencies (except Feather icons for UI)
- Responsive design
- Modular code architecture

## Getting Started

Simply open the `index.html` file in a modern web browser to start using the application.

## Storage

All your data is stored locally in your browser using IndexedDB. No data is sent to external servers.
