// PDF Export functionality for Journey & Notes Planner
// Uses html2canvas for capturing the preview and jsPDF for creating the PDF

const PDFExport = {};

// Initialize the PDF Export module
PDFExport.init = () => {
    console.log("Initializing PDF Export module");
    
    // Load dependencies
    PDFExport.loadDependencies()
        .then(() => {
            // Setup event listeners once dependencies are loaded
            PDFExport.setupEventListeners();
            console.log("PDF Export module ready");
        })
        .catch(error => {
            console.error("Error initializing PDF Export module:", error);
        });
};

// Load the required libraries from CDN
PDFExport.loadDependencies = () => {
    return new Promise(async (resolve, reject) => {
        try {
            // Load jsPDF first
            if (typeof jspdf === 'undefined' && !document.getElementById('jspdf-script')) {
                await PDFExport.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf-script');
                console.log("jsPDF library loaded successfully");
            }
            
            // Then load html2canvas
            if (typeof html2canvas === 'undefined' && !document.getElementById('html2canvas-script')) {
                await PDFExport.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas-script');
                console.log("html2canvas library loaded successfully");
            }
            
            resolve();
        } catch (error) {
            console.error("Failed to load dependencies:", error);
            reject(error);
        }
    });
};

// Helper function to load a script
PDFExport.loadScript = (src, id) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.async = true;
        
        script.onload = () => resolve();
        script.onerror = (e) => reject(new Error(`Failed to load ${src}`));
        
        document.head.appendChild(script);
    });
};

// Set up the export button and event listeners
PDFExport.setupEventListeners = () => {
    // Create export button if it doesn't exist
    if (!document.getElementById('exportPdfBtn')) {
        const exportButton = document.createElement('button');
        exportButton.id = 'exportPdfBtn';
        exportButton.className = 'action-button';
        exportButton.title = 'Export as PDF';
        exportButton.innerHTML = '<i data-feather="file-text"></i> Export PDF';
        
        // Add the button to the note editor actions
        const actionBar = document.querySelector('.note-editor-actions');
        if (actionBar) {
            // Insert before the delete button
            const deleteBtn = document.getElementById('deleteNoteBtn');
            actionBar.insertBefore(exportButton, deleteBtn);
            App.refreshIcons();
        }
    }
    
    // Add click event listener
    const exportBtn = document.getElementById('exportPdfBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            showThemeSelectionModal();
        });
    }
};

// Function to get theme colors
const getThemeColors = (mode) => {
    if (mode === 'dark') {
        return {
            background: '#262626',
            text: '#ffffff',
            secondaryText: '#aaaaaa',
            accent: '#5ccfe6',
            headerText: '#5ccfe6',
            headerBorder: 'rgba(92, 207, 230, 0.3)',
            codeText: '#5ccfe6',
            codeBackground: 'rgba(92, 207, 230, 0.1)',
        };
    } else if (mode === 'light') {
        return {
            background: '#ffffff',
            text: '#000000',
            secondaryText: '#666666',
            accent: '#007bff',
            headerText: '#007bff',
            headerBorder: 'rgba(0, 123, 255, 0.3)',
            codeText: '#007bff',
            codeBackground: 'rgba(0, 123, 255, 0.1)',
        };
    } else {
        throw new Error(`Invalid theme mode: ${mode}`);
    }
};

// Function to create and show theme selection modal
const showThemeSelectionModal = () => {
    // Create modal container
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'pdf-theme-modal-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.right = '0';
    modalOverlay.style.bottom = '0';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.zIndex = '10000';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'pdf-theme-modal';
    modalContent.style.backgroundColor = '#333';
    modalContent.style.borderRadius = '8px';
    modalContent.style.padding = '20px';
    modalContent.style.width = '400px';
    modalContent.style.maxWidth = '90%';
    modalContent.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    
    // Create modal header
    const modalHeader = document.createElement('h3');
    modalHeader.textContent = 'Choose PDF Theme';
    modalHeader.style.margin = '0 0 20px 0';
    modalHeader.style.color = '#fff';
    modalHeader.style.fontSize = '18px';
    modalHeader.style.fontWeight = 'normal';
    modalContent.appendChild(modalHeader);
    
    // Create theme options container
    const optionsContainer = document.createElement('div');
    optionsContainer.style.display = 'flex';
    optionsContainer.style.justifyContent = 'space-between';
    optionsContainer.style.gap = '15px';
    
    // Create dark theme option
    const darkOption = createThemeOption('dark', 'Dark Mode', '#262626', '#fff', '#5ccfe6');
    optionsContainer.appendChild(darkOption);
    
    // Create light theme option
    const lightOption = createThemeOption('light', 'Light Mode', '#fff', '#000', '#007bff');
    optionsContainer.appendChild(lightOption);
    
    modalContent.appendChild(optionsContainer);
    
    // Create buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.justifyContent = 'flex-end';
    buttonsContainer.style.marginTop = '20px';
    buttonsContainer.style.gap = '10px';
    
    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.backgroundColor = 'transparent';
    cancelButton.style.border = '1px solid #ccc';
    cancelButton.style.color = '#ccc';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.onclick = () => {
        document.body.removeChild(modalOverlay);
    };
    buttonsContainer.appendChild(cancelButton);
    
    // Export with selected theme
    let selectedTheme = 'dark'; // Default theme
    
    // Create export button
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export PDF';
    exportButton.style.backgroundColor = '#5ccfe6';
    exportButton.style.border = 'none';
    exportButton.style.color = '#000';
    exportButton.style.padding = '8px 16px';
    exportButton.style.borderRadius = '4px';
    exportButton.style.cursor = 'pointer';
    exportButton.style.fontWeight = 'bold';
    exportButton.onclick = () => {
        document.body.removeChild(modalOverlay);
        PDFExport.exportCurrentNote(selectedTheme);
    };
    buttonsContainer.appendChild(exportButton);
    
    modalContent.appendChild(buttonsContainer);
    modalOverlay.appendChild(modalContent);
    
    // Add click event to the theme options
    const options = [darkOption, lightOption];
    options.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            options.forEach(opt => {
                opt.style.border = '2px solid transparent';
                opt.style.transform = 'scale(1)';
            });
            
            // Add selected class to clicked option
            option.style.border = `2px solid ${option.dataset.accentColor}`;
            option.style.transform = 'scale(1.05)';
            
            // Update selected theme
            selectedTheme = option.dataset.theme;
        });
    });
    
    // Set dark mode as selected by default
    darkOption.style.border = `2px solid ${darkOption.dataset.accentColor}`;
    darkOption.style.transform = 'scale(1.05)';
    
    // Add modal to the body
    document.body.appendChild(modalOverlay);
};

// Helper function to create a theme option element
const createThemeOption = (theme, label, bgColor, textColor, accentColor) => {
    const option = document.createElement('div');
    option.className = 'theme-option';
    option.dataset.theme = theme;
    option.dataset.accentColor = accentColor;
    option.style.flex = '1';
    option.style.backgroundColor = bgColor;
    option.style.color = textColor;
    option.style.padding = '15px';
    option.style.borderRadius = '6px';
    option.style.cursor = 'pointer';
    option.style.border = '2px solid transparent';
    option.style.transition = 'all 0.2s ease';
    option.style.display = 'flex';
    option.style.flexDirection = 'column';
    option.style.alignItems = 'center';
    
    // Create preview of the theme
    const preview = document.createElement('div');
    preview.style.width = '100%';
    preview.style.height = '80px';
    preview.style.display = 'flex';
    preview.style.flexDirection = 'column';
    preview.style.marginBottom = '10px';
    
    // Title preview
    const titlePreview = document.createElement('div');
    titlePreview.textContent = 'Sample Title';
    titlePreview.style.fontWeight = 'bold';
    titlePreview.style.color = theme === 'dark' ? '#fff' : '#000';
    titlePreview.style.textAlign = 'center';
    titlePreview.style.borderBottom = `1px solid ${accentColor}`;
    titlePreview.style.paddingBottom = '5px';
    titlePreview.style.marginBottom = '5px';
    preview.appendChild(titlePreview);
    
    // Text preview
    const textPreview = document.createElement('div');
    textPreview.textContent = 'Sample note content';
    textPreview.style.fontSize = '10px';
    textPreview.style.color = theme === 'dark' ? '#ddd' : '#333';
    preview.appendChild(textPreview);
    
    // Code preview
    const codePreview = document.createElement('div');
    codePreview.textContent = 'code snippet';
    codePreview.style.color = accentColor;
    codePreview.style.fontSize = '10px';
    codePreview.style.backgroundColor = `${accentColor}20`;
    codePreview.style.padding = '2px';
    codePreview.style.borderRadius = '2px';
    codePreview.style.marginTop = '5px';
    codePreview.style.display = 'inline-block';
    preview.appendChild(codePreview);
    
    option.appendChild(preview);
    
    // Create label
    const labelElement = document.createElement('div');
    labelElement.textContent = label;
    labelElement.style.marginTop = '10px';
    labelElement.style.fontWeight = 'bold';
    option.appendChild(labelElement);
    
    return option;
};

// Helper function to add page numbers
const addPageNumber = (pdf, pageNum, theme) => {
    pdf.setFont('helvetica');
    pdf.setFontSize(9);
    
    // Use appropriate text color based on theme
    if (theme.text === '#ffffff' || theme.text === 'white') {
        pdf.setTextColor(255, 255, 255);
    } else {
        pdf.setTextColor(0, 0, 0);
    }
    
    // Add page number at the bottom center
    pdf.text(`Page ${pageNum}`, 105, 290, { align: 'center' });
};

// Main export function with improved pagination
PDFExport.exportCurrentNote = async (mode = 'dark') => {
    // Check if required libraries are loaded
    if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
        console.error("Required libraries not loaded");
        alert("PDF export libraries not loaded. Please try again in a moment.");
        PDFExport.loadDependencies();
        return;
    }
    
    // Check if there's a note being edited
    if (!NotesApp || !NotesApp.state || !NotesApp.state.currentEditingNote) {
        alert("No note is currently open for export.");
        return;
    }
    
    const { noteContentInput, noteTitleInput, notePreview } = NotesApp.dom;
    const noteTitle = noteTitleInput.value || 'Untitled Note';
    const noteContent = noteContentInput.value;
    
    try {
        // Show export notification
        const notification = document.createElement('div');
        notification.className = 'pdf-export-notification';
        notification.textContent = `Preparing "${noteTitle}" for PDF...`;
        document.body.appendChild(notification);
        
        // Get theme colors based on mode
        const theme = getThemeColors(mode);
        
        // Process the note content to expand image references
        const processedContent = processContentForExport(noteContent);
        
        // Create PDF document with proper configuration
        const pdf = new jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true
        });
        
        // Convert theme.background hex to RGB for jsPDF
        let bgRGB = { r: 38, g: 38, b: 38 }; // Default
        if (theme.background.startsWith('#')) {
            const hex = theme.background.slice(1);
            bgRGB = {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
        
        // Define page dimensions and margins
        const pageWidth = 210;  // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const margin = {
            top: 30,     // Top margin in mm
            right: 25,   // Right margin in mm
            bottom: 30,  // Bottom margin in mm
            left: 25     // Left margin in mm
        };
        
        // Calculate content area dimensions
        const contentWidth = pageWidth - margin.left - margin.right;
        const contentHeight = pageHeight - margin.top - margin.bottom;
        
        // Parse and prepare the note content
        const formattedContent = NotesApp.formatNoteContent(processedContent);
        
        // Create a DOM parser to work with the formatted content
        const parser = new DOMParser();
        const contentDoc = parser.parseFromString(formattedContent, 'text/html');
        
        // Get all the block-level elements (paragraphs, headers, etc.)
        const elements = Array.from(contentDoc.body.children);
        
        // Initialize variables for pagination
        let currentPage = 1;
        let yPosition = margin.top;
        
        // Add the first page with background
        pdf.setFillColor(bgRGB.r, bgRGB.g, bgRGB.b);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        
        // Add title
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        
        // Set header color
        if (theme.text === '#ffffff' || theme.text === '#fff') {
            pdf.setTextColor(255, 255, 255);
        } else {
            pdf.setTextColor(0, 0, 0);
        }
        
        const titleText = noteTitle;
        pdf.text(titleText, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 10;
        
        // Add author and date
        const today = new Date();
        const formattedDate = today.toLocaleDateString(undefined, { 
            year: 'numeric', month: 'long', day: 'numeric' 
        });
        const authorDateText = `~# William Norden | ${formattedDate}`;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        // Set secondary text color
        if (theme.secondaryText.startsWith('#')) {
            const hex = theme.secondaryText.slice(1);
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            pdf.setTextColor(r, g, b);
        } else {
            pdf.setTextColor(170, 170, 170); // Default if conversion fails
        }
        
        pdf.text(authorDateText, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 8;
        
        // Add some space instead of divider
        yPosition += 10;
        
        // Set text color for main content
        if (theme.text === '#ffffff' || theme.text === '#fff') {
            pdf.setTextColor(255, 255, 255);
        } else {
            pdf.setTextColor(0, 0, 0);
        }
        
        // Process each element for content
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            
            // Check if we need to start a new page
            if (yPosition > pageHeight - margin.bottom - 15) {
                // Add page number to current page
                addPageNumber(pdf, currentPage, theme);
                
                // Add a new page
                pdf.addPage();
                currentPage++;
                
                // Fill background
                pdf.setFillColor(bgRGB.r, bgRGB.g, bgRGB.b);
                pdf.rect(0, 0, pageWidth, pageHeight, 'F');
                
                // Reset y position to top margin
                yPosition = margin.top;
            }
            
            // Handle different element types
            if (element.classList.contains('header-h1')) {
                // Handle H1 headers
                pdf.setFontSize(16); // Increased from 14
                pdf.setFont('helvetica', 'bold');
                
                // Set header color
                if (theme.headerText.startsWith('#')) {
                    const hex = theme.headerText.slice(1);
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    pdf.setTextColor(r, g, b);
                } else {
                    // Default cyan for header text
                    pdf.setTextColor(92, 207, 230);
                }
                
                pdf.text(element.textContent, margin.left, yPosition);
                // Reduce spacing between header text and underline
                yPosition += 3;
                
                // Add underline for h1 headers
                if (theme.headerText.startsWith('#')) {
                    const hex = theme.headerText.slice(1);
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    pdf.setDrawColor(r, g, b, 0.5);
                } else {
                    pdf.setDrawColor(92, 207, 230, 0.5);
                }
                pdf.setLineWidth(0.2);
                pdf.line(margin.left, yPosition, margin.left + 40, yPosition);
                // Same spacing after underline
                yPosition += 3;
                
            } else if (element.classList.contains('header-h2')) {
                // Handle H2 headers
                pdf.setFontSize(12);
                pdf.setFont('helvetica', 'bold');
                
                // Set header color
                if (theme.headerText.startsWith('#')) {
                    const hex = theme.headerText.slice(1);
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    pdf.setTextColor(r, g, b);
                } else {
                    // Default cyan for header text
                    pdf.setTextColor(92, 207, 230);
                }
                
                pdf.text(element.textContent, margin.left, yPosition);
                yPosition += 7;
                
            } else if (element.classList.contains('code-snippet')) {
                // Handle code snippets
                pdf.setFontSize(10);
                pdf.setFont('courier', 'normal');
                
                // Set code color
                if (theme.codeText.startsWith('#')) {
                    const hex = theme.codeText.slice(1);
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    pdf.setTextColor(r, g, b);
                } else {
                    // Default cyan for code
                    pdf.setTextColor(92, 207, 230);
                }
                
                // Add subtle background for code
                pdf.setFillColor(92, 207, 230, 0.1);
                const codeTextHeight = 6;
                pdf.roundedRect(margin.left - 2, yPosition - 5, contentWidth + 4, codeTextHeight + 6, 1, 1, 'F');
                
                pdf.text(element.textContent, margin.left, yPosition);
                yPosition += 10;
                
            } else if (element.classList.contains('note-image-container') || element.tagName === 'IMG' || element.querySelector('img')) {
                // Handle images
                let img = element.tagName === 'IMG' ? element : element.querySelector('img');
                
                // If we have a container with an image inside
                if (!img && element.classList.contains('note-image-container')) {
                    img = element.querySelector('img');
                }
                
                if (img && img.src) {
                    // Check if we need a new page
                    if (yPosition > pageHeight - margin.bottom - 50) { // Reserve more space for images
                        // Add page number to current page
                        addPageNumber(pdf, currentPage, theme);
                        
                        // Add a new page
                        pdf.addPage();
                        currentPage++;
                        
                        // Fill background
                        pdf.setFillColor(bgRGB.r, bgRGB.g, bgRGB.b);
                        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
                        
                        // Reset y position to top margin
                        yPosition = margin.top;
                    }
                    
                    try {
                        // Calculate image dimensions while maintaining aspect ratio
                        const maxWidth = contentWidth;
                        const maxHeight = 100; // Max height in mm for the image
                        
                        // Add image to PDF
                        pdf.addImage(
                            img.src, 
                            'JPEG', 
                            margin.left, 
                            yPosition, 
                            maxWidth, 
                            maxHeight, 
                            undefined, 
                            'FAST', 
                            0
                        );
                        
                        // Update y position with image height plus margin
                        yPosition += maxHeight + 10;
                    } catch (err) {
                        console.error('Error adding image to PDF:', err);
                        // Add an error placeholder instead
                        pdf.setTextColor(255, 0, 0);
                        pdf.text('[Image could not be processed]', margin.left, yPosition + 5);
                        yPosition += 10;
                    }
                }
                
            } else if (element.classList.contains('bullet')) {
                // Handle bullet points
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'normal');
                
                // Set text color
                if (theme.text === '#ffffff' || theme.text === '#fff') {
                    pdf.setTextColor(255, 255, 255);
                } else {
                    pdf.setTextColor(0, 0, 0);
                }
                
                // Calculate indentation
                const text = element.textContent;
                const indentMatch = text.match(/^(\s*)/);
                const indentLevel = indentMatch ? indentMatch[0].length / 2 : 0;
                const indentSize = 5; // mm per indent level
                
                // Add text only (no bullet dot)
                pdf.text(text.trim(), margin.left + (indentLevel * indentSize), yPosition);
                yPosition += 6;
                
            } else {
                // Handle regular paragraphs
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'normal');
                
                // Set text color
                if (theme.text === '#ffffff' || theme.text === '#fff') {
                    pdf.setTextColor(255, 255, 255);
                } else {
                    pdf.setTextColor(0, 0, 0);
                }
                
                // Check if the line contains inline code (text wrapped in backticks)
                const codeMatches = element.innerHTML.match(/`([^`]+)`/g);
                if (codeMatches) {
                    // Split the text by code segments
                    let parts = element.innerHTML.split(/(`[^`]+`)/g);
                    let xPos = margin.left;
                    let lineHeight = 6;
                    
                    // Set up text colors based on theme
                    const textRGB = theme.text === '#ffffff' || theme.text === '#fff' ? 
                        { r: 255, g: 255, b: 255 } : 
                        { r: 0, g: 0, b: 0 };
                    const codeColor = theme.codeText === '#5ccfe6' ? 
                        { r: 92, g: 207, b: 230 } : 
                        { r: 0, g: 123, b: 255 };
                    
                    for (let part of parts) {
                        // Check if this part is code (wrapped in backticks)
                        if (part.startsWith('`') && part.endsWith('`')) {
                            // Set code style (background rectangle first)
                            const codeText = part.substring(1, part.length - 1);
                            
                            // Get text width for the background rectangle
                            pdf.setFont('courier', 'normal');
                            pdf.setFontSize(10);
                            const textWidth = pdf.getTextWidth(codeText);
                            
                            // Draw code background rectangle
                            const bgColor = mode === 'dark' ? 
                                { r: 92, g: 207, b: 230, a: 0.1 } : // Dark mode - cyan with 10% opacity
                                { r: 0, g: 123, b: 255, a: 0.1 };   // Light mode - blue with 10% opacity
                            
                            // Set background rectangle with slight padding
                            pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
                            const padding = 2; // mm
                            const rectHeight = 5; // mm
                            pdf.rect(
                                xPos - padding/2, 
                                yPosition - rectHeight + padding/2, 
                                textWidth + padding, 
                                rectHeight, 
                                'F'
                            );
                            
                            // Set code text color
                            pdf.setTextColor(codeColor.r, codeColor.g, codeColor.b);
                            
                            // Draw code text
                            pdf.text(codeText, xPos, yPosition);
                            
                            // Update position
                            xPos += textWidth + padding;
                            
                            // Reset text color for normal text
                            pdf.setTextColor(textRGB.r, textRGB.g, textRGB.b);
                            pdf.setFont('helvetica', 'normal');
                            pdf.setFontSize(11);
                        } else if (part.trim() !== '') {
                            // Regular text
                            pdf.text(part, xPos, yPosition);
                            xPos += pdf.getTextWidth(part);
                        }
                    }
                    
                    // Move to next line
                    yPosition += lineHeight;
                } else {
                    // Handle potential text wrapping by breaking it into lines
                    const text = element.textContent;
                    const textWidth = pdf.getTextWidth(text);
                    
                    if (textWidth <= contentWidth) {
                        // Short enough to fit on one line
                        pdf.text(text, margin.left, yPosition);
                        yPosition += 6;
                    } else {
                        // Need to wrap text
                        const words = text.split(' ');
                        let currentLine = '';
                        
                        for (let j = 0; j < words.length; j++) {
                            const word = words[j];
                            const testLine = currentLine + (currentLine ? ' ' : '') + word;
                            const testWidth = pdf.getTextWidth(testLine);
                            
                            if (testWidth > contentWidth) {
                                // Check if we need a new page
                                if (yPosition > pageHeight - margin.bottom - 15) {
                                    // Add page number to current page
                                    addPageNumber(pdf, currentPage, theme);
                                    
                                    // Add a new page
                                    pdf.addPage();
                                    currentPage++;
                                    
                                    // Fill background
                                    pdf.setFillColor(bgRGB.r, bgRGB.g, bgRGB.b);
                                    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
                                    
                                    // Reset y position to top margin
                                    yPosition = margin.top;
                                }
                                
                                pdf.text(currentLine, margin.left, yPosition);
                                yPosition += 6;
                                currentLine = word;
                            } else {
                                currentLine = testLine;
                            }
                        }
                        
                        // Add the last line if any
                        if (currentLine) {
                            pdf.text(currentLine, margin.left, yPosition);
                            yPosition += 6;
                        }
                    }
                }
                
                // Add a bit of space after each element
                yPosition += 2;
            }
            
            // Add a bit of space after each element
            yPosition += 2;
        }
        
        // Add page number to the last page
        addPageNumber(pdf, currentPage, theme);
        
        // Generate PDF and trigger download
        const pdfBlob = pdf.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        
        // Create download link
        const link = document.createElement('a');
        link.href = pdfUrl;
        const safeFilename = noteTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.download = `${safeFilename}.pdf`;
        link.click();
        
        // Show success notification
        notification.textContent = `PDF exported successfully!`;
        notification.classList.add('success');
        
        // Clean up after delay
        setTimeout(() => {
            document.body.removeChild(notification);
            URL.revokeObjectURL(pdfUrl); // Clean up the blob URL
        }, 3000);
    
    } catch (error) {
        console.error('Error generating PDF:', error);
        const notification = document.createElement('div');
        notification.className = 'pdf-export-notification error';
        notification.textContent = `Error exporting PDF: ${error.message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }
};

// Helper function to process the raw note content to handle images
const processContentForExport = (content) => {
    if (!content || typeof content !== 'string') return content;
    
    // Access the image storage if available
    let imageStorage = {};
    if (typeof ImageHandler !== 'undefined' && typeof ImageHandler.getImageStorage === 'function') {
        imageStorage = ImageHandler.getImageStorage();
    }
    
    // Replace image ID markers with the full image data for PDF export
    return content.replace(/!\[image:(img_[0-9]+_[0-9]+)\]/g, (match, imageId) => {
        const imageData = imageStorage[imageId];
        if (imageData) {
            // Return the full image data for PDF processing
            return `![image](${imageData})`;
        } else {
            // If image data not found, return a placeholder
            return '![Image not available]';
        }
    });
};

// Call init when the document is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization to ensure NotesApp is fully initialized
    setTimeout(PDFExport.init, 1000);
});

// Expose the module globally
window.PDFExport = PDFExport;
