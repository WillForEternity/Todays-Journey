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

// Main export function
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
        
        // Create a temporary container for rendering the preview
        const container = document.createElement('div');
        container.className = 'pdf-preview-container';
        container.style.backgroundColor = theme.background;
        container.style.padding = '30mm 25mm'; // Standard document margins
        container.style.boxSizing = 'border-box';
        container.style.position = 'fixed';
        container.style.zIndex = '-9999'; // Hide from view
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = '210mm'; // A4 width
        container.style.color = theme.text;
        
        // Create title section with professional styling
        const titleElement = document.createElement('div');
        titleElement.className = 'pdf-title';
        titleElement.style.fontSize = '16pt';
        titleElement.style.fontWeight = 'bold';
        titleElement.style.marginBottom = '10mm'; // Reduced from 15mm
        titleElement.style.color = theme.text;
        titleElement.style.textAlign = 'center'; // Center-aligned title is standard in professional documents
        titleElement.textContent = noteTitle;
        container.appendChild(titleElement);
        
        // Add author and date under the title
        const dateElement = document.createElement('div');
        dateElement.style.fontSize = '10pt';
        dateElement.style.color = theme.secondaryText;
        dateElement.style.textAlign = 'center';
        dateElement.style.marginBottom = '8mm'; // Reduced from 15mm
        const today = new Date();
        const formattedDate = today.toLocaleDateString(undefined, { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        dateElement.innerHTML = `~# William Norden <span style="margin: 0 5px;">|</span> ${formattedDate}`;
        container.appendChild(dateElement);
        
        // Create a standard horizontal divider
        const divider = document.createElement('hr');
        divider.style.border = 'none';
        divider.style.height = '1px';
        divider.style.backgroundColor = theme.accent;
        divider.style.margin = '0 0 10mm 0'; // Reduced from 15mm
        divider.style.opacity = '0.5'; // Subtle divider
        container.appendChild(divider);
        
        // Create content container with professional styling
        const contentElement = document.createElement('div');
        contentElement.className = 'note-preview';
        
        // Get the actual computed styles from the editor/preview
        const noteStyles = window.getComputedStyle(noteContentInput);
        const previewStyles = notePreview ? window.getComputedStyle(notePreview) : null;
        
        // Use the font from the actual UI elements
        contentElement.style.fontFamily = previewStyles ? previewStyles.fontFamily : noteStyles.fontFamily;
        contentElement.style.fontSize = '11pt';
        contentElement.style.lineHeight = '1.5';
        contentElement.style.color = theme.text;
        contentElement.style.backgroundColor = 'transparent';
        contentElement.style.whiteSpace = 'pre-wrap';
        
        // Format content with the same function used in the preview
        contentElement.innerHTML = NotesApp.formatNoteContent(noteContent);
        container.appendChild(contentElement);
        
        // Get font family for consistent use
        const fontFamily = contentElement.style.fontFamily || 
                           getComputedStyle(document.body).fontFamily || 
                           'Consolas, "Courier New", monospace';
        
        // Add styling for the specific theme
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            .pdf-preview-container {
                background-color: ${theme.background};
                color: ${theme.text};
                border: none;
                outline: none;
                box-shadow: none;
                font-family: ${fontFamily};
            }
            .pdf-preview-container .header-h1 {
                font-size: 14pt;
                font-weight: bold;
                margin: 16pt 0 10pt;
                color: ${theme.headerText};
                border: none;
                background: transparent;
                padding: 0 0 3pt 0;
                font-family: ${fontFamily};
                border-bottom: 1px solid ${theme.headerBorder};
            }
            .pdf-preview-container .header-h2 {
                font-size: 12pt;
                font-weight: bold;
                margin: 14pt 0 8pt;
                color: ${theme.headerText};
                border: none;
                background: transparent;
                padding: 0;
                font-family: ${fontFamily};
            }
            .pdf-preview-container .code-snippet {
                font-family: ${fontFamily};
                color: ${theme.codeText};
                background-color: ${theme.codeBackground};
                padding: 1pt 3pt;
                border-radius: 2pt;
                border: none;
                font-size: 10pt;
            }
            .pdf-preview-container p.bullet {
                margin: 0 0 6pt;
                font-family: ${fontFamily};
                white-space: pre-wrap;
                color: ${theme.text};
                border: none;
                background: transparent;
                padding: 0;
            }
            
            /* Standard paragraph styling */
            .pdf-preview-container p {
                margin: 0 0 8pt 0;
                color: ${theme.text};
                border: none;
                background: transparent;
                padding: 0;
                box-shadow: none;
                font-family: ${fontFamily};
                line-height: 1.5;
            }
            
            /* Override */
            .pdf-preview-container * {
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
                background-color: transparent !important;
            }
            
            /* Only exceptions */
            .pdf-preview-container .code-snippet {
                background-color: ${theme.codeBackground} !important;
                padding: 1pt 3pt !important;
            }
        `;
        container.appendChild(styleElement);
        
        // Add to document for rendering
        document.body.appendChild(container);
        
        // Update notification
        notification.textContent = `Capturing preview for "${noteTitle}"...`;
        
        // Short delay to ensure rendering
        setTimeout(async () => {
            try {
                // Capture the preview with html2canvas with optimized settings for dark background
                const canvas = await html2canvas(container, {
                    scale: 2, // Higher resolution
                    useCORS: true,
                    logging: false,
                    backgroundColor: theme.background,
                    removeContainer: false,
                    allowTaint: true,
                    foreignObjectRendering: false, // More compatible rendering
                    onclone: function(clonedDoc) {
                        // Ensure the cloned document also has the dark background
                        const clonedContainer = clonedDoc.querySelector('.pdf-preview-container');
                        if (clonedContainer) {
                            clonedContainer.style.backgroundColor = theme.background;
                            
                            // Apply dark background to all elements inside
                            const elements = clonedContainer.querySelectorAll('*');
                            elements.forEach(el => {
                                // Only override background if it's not dark
                                const bgColor = getComputedStyle(el).backgroundColor;
                                if (bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' &&
                                    bgColor !== 'rgb(38, 38, 38)' && bgColor !== '#262626') {
                                    el.style.backgroundColor = 'transparent';
                                }
                            });
                        }
                    }
                });
                
                // Update notification
                notification.textContent = `Creating PDF for "${noteTitle}"...`;
                
                // Convert to PDF using jsPDF
                const { jsPDF } = jspdf;
                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4',
                    putOnlyUsedFonts: true,
                    compress: true
                });
                
                // Set background color for all pages to dark
                pdf.setFillColor(theme.background);
                pdf.rect(0, 0, 210, 297, 'F'); // Fill the entire page with dark background
                
                // Calculate dimensions
                const imgWidth = 210; // A4 width (mm)
                const pageHeight = 297; // A4 height (mm)
                const imgHeight = canvas.height * imgWidth / canvas.width;
                
                // Add image to PDF - with no additional padding or margins
                const imgData = canvas.toDataURL('image/png', 1.0); // Use PNG for better transparency
                pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
                
                // If content overflows the first page, add additional pages with dark background
                let heightLeft = imgHeight;
                let position = 0;
                
                heightLeft -= pageHeight;
                position = -pageHeight; // Negative because we're moving upward in the canvas
                
                while (heightLeft >= 0) {
                    pdf.addPage();
                    // Fill new page with dark background
                    pdf.setFillColor(theme.background);
                    pdf.rect(0, 0, 210, 297, 'F');
                    // Add content
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                    position -= pageHeight;
                }
                
                // Save the PDF
                pdf.save(`${noteTitle}.pdf`);
                
                // Update notification
                notification.textContent = `PDF export complete!`;
                setTimeout(() => {
                    notification.style.opacity = '0';
                    setTimeout(() => notification.remove(), 500);
                }, 1500);
                
                // Clean up
                document.body.removeChild(container);
                
            } catch (error) {
                console.error("Error capturing preview:", error);
                alert("Error creating PDF. Please try again.");
                document.body.removeChild(container);
            }
        }, 300); // Give time for rendering
        
    } catch (error) {
        console.error("Error in PDF export:", error);
        alert("An error occurred during PDF export. Please try again.");
    }
};

// Call init when the document is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization to ensure NotesApp is fully initialized
    setTimeout(PDFExport.init, 1000);
});

// Expose the module globally
window.PDFExport = PDFExport;
