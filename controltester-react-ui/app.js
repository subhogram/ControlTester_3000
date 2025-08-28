// ControlTester 3000 Application Logic

// Application state
const appState = {
    currentStep: 1,
    selectedModel: null,
    uploadedFiles: {
        knowledgeBase: [],
        companyDocs: [],
        evidence: []
    },
    assessmentResults: [],
    isProcessing: false,
    processingStep: 0,
    sidebar: {
        collapsed: false,
        mobileOpen: false
    }
};

// API Configuration
const API_BASE_URL = 'http://localhost:8000';
const API_PARAMETERS = {
    selected_model: 'llama3.1:latest',
    batch_size: 15,
    delay_between_batches: 0.2,
    max_retries: 3
};

// Processing sequence configuration
const PROCESSING_SEQUENCE = [
    {
        step: 1,
        category: 'knowledgeBase',
        title: 'Building Knowledge Base',
        description: 'Processing security policies and standards'
        //endpoint: '/build-knowledge-base'
    },
    {
        step: 2, 
        category: 'companyDocs',
        title: 'Building Company Knowledge Base',
        description: 'Processing company documents and policies'
        //endpoint: '/build-knowledge-base'
    },
    {
        step: 3,
        category: 'evidence', 
        title: 'Building Evidence Knowledge Base',
        description: 'Processing evidence files for assessment'
        //endpoint: '/build-knowledge-base'
    },
    {
        step: 4,
        category: 'assessment',
        title: 'Running Assessment',
        description: 'Analyzing evidence against knowledge bases', 
        endpoint: '/assess-evidence'
    }
];

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing application...');
    // Add a small delay to ensure all elements are rendered
    setTimeout(initializeApp, 100);
});

function initializeApp() {
    console.log('Initializing ControlTester 3000...');
    try {
        setupNavigation();
        setupEventListeners();
        setupFileUploads();
        setupThemeToggle();
        setupSidebar();
        loadAvailableModels();
        showSection('dashboard');
        handleResponsiveDesign();
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Navigation Setup - Completely rewritten for reliability
function setupNavigation() {
   console.log('Setting up navigation system...');
    
    // Wait for DOM elements to be available
    setTimeout(() => {
        const sidebarLinks = document.querySelectorAll('.sidebar__link');
        console.log(`Found ${sidebarLinks.length} sidebar links`);
        
        // Remove any existing event listeners first
        sidebarLinks.forEach(link => {
            // Clone node to remove all event listeners
            const newLink = link.cloneNode(true);
            link.parentNode.replaceChild(newLink, link);
        });
        
        // Re-query after cloning
        const cleanSidebarLinks = document.querySelectorAll('.sidebar__link');
        
        cleanSidebarLinks.forEach((link, index) => {
            const section = link.getAttribute('data-section');
            console.log(`Setting up link ${index} for section: ${section}`);
            
            // Add new event listener
            link.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log(`Navigation clicked: ${section}`);
                
                // Special handling to ensure section exists
                if (!document.getElementById(section)) {
                    console.error(`Section ${section} does not exist! Creating it...`);
                    createMissingSection(section);
                }
                
                showSection(section);
            });
        });
        
        // Setup start audit button
        const startAuditBtn = document.querySelector('[data-action="start-audit"]');
        if (startAuditBtn) {
            startAuditBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Start audit button clicked');
                showSection('workflow');
            });
        }
        
        console.log('Navigation system setup complete');
    }, 200);
}

// Section Navigation - Completely rewritten
function showSection(sectionId) {
    console.log(`=== Showing section: ${sectionId} ===`);
    
    if (!sectionId) {
        console.error('No sectionId provided');
        return;
    }
    
    try {
        // Hide all sections first
        const allSections = document.querySelectorAll('.section');
        console.log(`Found ${allSections.length} sections`);
        
        allSections.forEach(section => {
            if (section.classList.contains('active')) {
                console.log(`Hiding section: ${section.id}`);
            }
            section.classList.remove('active');
        });
        
        // Show target section
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
            console.log(`Successfully activated section: ${sectionId}`);
            
            // Update navigation visual state
            updateActiveNavLink(sectionId);
            
            // Close mobile sidebar
            if (window.innerWidth <= 768 && appState.sidebar.mobileOpen) {
                closeMobileSidebar();
            }
            
            // Special handling for workflow section
            if (sectionId === 'workflow') {
                console.log('Workflow section activated, ensuring step 1 is visible');
                setTimeout(() => {
                    goToStep(1);
                }, 100);
            }
        } else {
            console.error(`Target section not found: ${sectionId}`);
            // List all available sections for debugging
            console.log('Available sections:');
            allSections.forEach(section => {
                console.log(`- ${section.id}`);
            });
        }
    } catch (error) {
        console.error('Error in showSection:', error);
    }
}

function updateActiveNavLink(sectionId) {
    try {
        const navLinks = document.querySelectorAll('.sidebar__link');
        navLinks.forEach(link => {
            link.classList.remove('active');
            const linkSection = link.getAttribute('data-section');
            if (linkSection === sectionId) {
                link.classList.add('active');
                console.log(`Updated active state for nav link: ${sectionId}`);
            }
        });
    } catch (error) {
        console.error('Error updating active nav link:', error);
    }
}

// Event Listeners Setup
function setupEventListeners() {
    console.log('Setting up additional event listeners...');
    
    // Model selection
    setTimeout(() => {
        const modelSelect = document.getElementById('model-select');
        if (modelSelect) {
            modelSelect.addEventListener('change', function() {
                appState.selectedModel = this.value;
                API_PARAMETERS.selected_model = this.value;
                const nextBtn = document.getElementById('step-1-next');
                if (nextBtn) {
                    nextBtn.disabled = !this.value;
                }
                console.log('Model selected:', this.value);
            });
        }

        // Chat input
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }

        // Stepper clicks
        const stepperSteps = document.querySelectorAll('.stepper__step');
        stepperSteps.forEach(step => {
            step.addEventListener('click', function() {
                const stepNumber = parseInt(this.getAttribute('data-step'));
                if (stepNumber <= appState.currentStep || this.classList.contains('completed')) {
                    goToStep(stepNumber);
                }
            });
        });
    }, 300);

    // Global click handler for data-action buttons
    document.addEventListener('click', function(e) {
        const button = e.target.closest('[data-action]');
        if (!button) return;

        const action = button.getAttribute('data-action');
        const step = button.getAttribute('data-step');
        
        console.log('Global click handler - action:', action, 'step:', step);

        e.preventDefault();
        e.stopPropagation();

        switch (action) {
            case 'start-audit':
                console.log('Start audit action triggered');
                showSection('workflow');
                break;
                
            case 'next-step':
                if (step) {
                    nextStep(parseInt(step));
                }
                break;
                
            case 'prev-step':
                if (step) {
                    prevStep(parseInt(step));
                }
                break;
                
            case 'process-assessment':
                console.log('Process assessment action triggered');
                processAssessment();
                break;
                
            case 'view-results':
                console.log('View results action triggered');
                showSection('results');
                break;
                
            case 'send-message':
                sendMessage();
                break;
                
            case 'download-report':
                downloadReport();
                break;
                
            default:
                console.log('Unknown action:', action);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
        
        if (e.key === 'Escape' && appState.sidebar.mobileOpen) {
            closeMobileSidebar();
        }
    });

    console.log('Event listeners setup complete');
}

// Sidebar Functionality
function setupSidebar() {
    console.log('Setting up sidebar...');
    
    setTimeout(() => {
        const sidebarToggleHeader = document.getElementById('sidebar-toggle-header');
        const sidebar = document.getElementById('sidebar');

        if (sidebarToggleHeader && sidebar) {
            sidebarToggleHeader.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Sidebar toggle clicked');
                toggleSidebar();
            });

            setupSidebarTooltips();

            document.addEventListener('click', function(e) {
                if (window.innerWidth <= 768 && appState.sidebar.mobileOpen) {
                    if (!sidebar.contains(e.target) && !sidebarToggleHeader.contains(e.target)) {
                        closeMobileSidebar();
                    }
                }
            });

            if (window.innerWidth <= 768) {
                appState.sidebar.collapsed = false;
                appState.sidebar.mobileOpen = false;
                updateSidebarClasses();
            }
        }

        createSidebarOverlay();
        console.log('Sidebar setup complete');
    }, 100);
}

function toggleSidebar() {
    if (window.innerWidth <= 768) {
        appState.sidebar.mobileOpen = !appState.sidebar.mobileOpen;
        updateSidebarClasses();
        updateOverlay();
    } else {
        appState.sidebar.collapsed = !appState.sidebar.collapsed;
        updateSidebarClasses();
        hideTooltip();
    }
    console.log('Sidebar toggled:', appState.sidebar);
}

function closeMobileSidebar() {
    appState.sidebar.mobileOpen = false;
    updateSidebarClasses();
    updateOverlay();
}

function updateSidebarClasses() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('collapsed', appState.sidebar.collapsed);
    sidebar.classList.toggle('mobile-open', appState.sidebar.mobileOpen);
    
    if (window.innerWidth <= 768) {
        sidebar.classList.add('mobile-hidden');
        sidebar.classList.toggle('mobile-hidden', !appState.sidebar.mobileOpen);
    } else {
        sidebar.classList.remove('mobile-hidden', 'mobile-open');
    }
}

function createSidebarOverlay() {
    let overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebar-overlay';
        overlay.addEventListener('click', closeMobileSidebar);
        document.body.appendChild(overlay);
    }
}

function updateOverlay() {
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        overlay.classList.toggle('active', appState.sidebar.mobileOpen && window.innerWidth <= 768);
    }
}

// Sidebar Tooltips
function setupSidebarTooltips() {
    const sidebarLinks = document.querySelectorAll('.sidebar__link');
    let tooltipTimeout;

    sidebarLinks.forEach(link => {
        link.addEventListener('mouseenter', function(e) {
            if (appState.sidebar.collapsed && window.innerWidth > 768) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = setTimeout(() => {
                    showTooltip(this, this.getAttribute('title'));
                }, 500);
            }
        });

        link.addEventListener('mouseleave', function() {
            clearTimeout(tooltipTimeout);
            hideTooltip();
        });
    });
}

function showTooltip(element, text) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip || !text) return;

    tooltip.textContent = text;
    tooltip.classList.add('show');

    const rect = element.getBoundingClientRect();
    tooltip.style.left = (rect.right + 12) + 'px';
    tooltip.style.top = (rect.top + (rect.height / 2) - 15) + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.classList.remove('show');
    }
}

// Responsive Design Handler
function handleResponsiveDesign() {
    function checkScreenSize() {
        if (window.innerWidth <= 768) {
            appState.sidebar.collapsed = false;
            if (!appState.sidebar.mobileOpen) {
                appState.sidebar.mobileOpen = false;
            }
        } else {
            appState.sidebar.mobileOpen = false;
            updateOverlay();
        }
        
        updateSidebarClasses();
        hideTooltip();
    }

    window.addEventListener('resize', checkScreenSize);
    checkScreenSize();
}

// Stepper Functionality
function nextStep(stepNumber) {
    console.log('Moving to next step:', stepNumber);
    if (validateCurrentStep()) {
        appState.currentStep = stepNumber;
        goToStep(stepNumber);
        updateStepperProgress();
    } else {
        console.log('Current step validation failed');
        showErrorMessage('Please complete the current step before proceeding.');
    }
}

function prevStep(stepNumber) {
    console.log('Moving to previous step:', stepNumber);
    appState.currentStep = stepNumber;
    goToStep(stepNumber);
    updateStepperProgress();
}

function goToStep(stepNumber) {
    console.log('Going to step:', stepNumber);
    
    try {
        // Hide all step contents
        const stepContents = document.querySelectorAll('.step-content');
        stepContents.forEach(content => {
            content.classList.remove('active');
        });
        
        // Show target step content
        const targetStep = document.getElementById(`step-${stepNumber}`);
        if (targetStep) {
            targetStep.classList.add('active');
            console.log(`Activated step ${stepNumber}`);
        } else {
            console.error(`Step ${stepNumber} not found`);
            return;
        }
        
        // Update stepper visual state
        const stepperSteps = document.querySelectorAll('.stepper__step');
        stepperSteps.forEach((step, index) => {
            const stepNum = index + 1;
            step.classList.remove('active', 'completed');
            
            if (stepNum === stepNumber) {
                step.classList.add('active');
            } else if (stepNum < stepNumber) {
                step.classList.add('completed');
            }
        });
    } catch (error) {
        console.error('Error in goToStep:', error);
    }
}

function updateStepperProgress() {
    const stepperSteps = document.querySelectorAll('.stepper__step');
    stepperSteps.forEach((step, index) => {
        const stepNum = index + 1;
        if (stepNum < appState.currentStep) {
            step.classList.add('completed');
            step.classList.remove('active');
        } else if (stepNum === appState.currentStep) {
            step.classList.add('active');
            step.classList.remove('completed');
        } else {
            step.classList.remove('active', 'completed');
        }
    });
}

// Validation
function validateCurrentStep() {
    switch (appState.currentStep) {
        case 1:
            return appState.selectedModel !== null && appState.selectedModel !== '';
        case 2:
            return appState.uploadedFiles.knowledgeBase.length > 0;
        case 3:
            return appState.uploadedFiles.companyDocs.length > 0;
        case 4:
            return appState.uploadedFiles.evidence.length > 0;
        default:
            return true;
    }
}

// File Upload Setup
function setupFileUploads() {
    console.log('Setting up file uploads...');
    
    setTimeout(() => {
        const uploadZones = [
            { id: 'kb-upload', type: 'knowledgeBase', fileListId: 'kb-files', nextBtnId: 'step-2-next' },
            { id: 'company-upload', type: 'companyDocs', fileListId: 'company-files', nextBtnId: 'step-3-next' },
            { id: 'evidence-upload', type: 'evidence', fileListId: 'evidence-files', nextBtnId: 'step-4-next' }
        ];

        uploadZones.forEach(zone => {
            const uploadZone = document.getElementById(zone.id);
            const fileInput = uploadZone?.querySelector('.file-input');
            
            if (uploadZone && fileInput) {
                setupDragAndDrop(uploadZone, fileInput, zone.type, zone.fileListId, zone.nextBtnId);
                fileInput.addEventListener('change', function() {
                    console.log(`Files selected for ${zone.type}:`, this.files.length);
                    handleFileSelection(this.files, zone.type, zone.fileListId, zone.nextBtnId);
                });
            }
        });
        
        console.log('File uploads setup complete');
    }, 400);
}

function setupDragAndDrop(uploadZone, fileInput, type, fileListId, nextBtnId) {
    uploadZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        console.log(`Files dropped for ${type}:`, e.dataTransfer.files.length);
        handleFileSelection(e.dataTransfer.files, type, fileListId, nextBtnId);
    });

    uploadZone.addEventListener('click', function(e) {
        if (e.target === fileInput) return;
        fileInput.click();
    });
}

function handleFileSelection(files, type, fileListId, nextBtnId) {
    const validFiles = Array.from(files).filter(file => isValidFileType(file, type));
    
    if (validFiles.length !== files.length) {
        showErrorMessage('Some files were rejected due to invalid file types.');
    }

    validFiles.forEach(file => {
        const fileObj = {
            id: Date.now() + Math.random(),
            file: file,
            name: file.name,
            size: formatFileSize(file.size),
            type: file.type
        };
        
        appState.uploadedFiles[type].push(fileObj);
        console.log(`Added file ${file.name} to ${type}`);
    });

    updateFileList(type, fileListId);
    updateNextButtonState(type, nextBtnId);
}

function isValidFileType(file, uploadType) {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const allowedExtensions = {
        knowledgeBase: ['pdf', 'txt', 'csv', 'xlsx'],
        companyDocs: ['pdf', 'txt', 'csv', 'xlsx'],
        evidence: ['pdf', 'txt', 'csv', 'xlsx', 'jpeg', 'jpg']
    };

    return allowedExtensions[uploadType].includes(fileExtension);
}

function updateFileList(type, fileListId) {
    const fileListContainer = document.getElementById(fileListId);
    if (!fileListContainer) return;

    fileListContainer.innerHTML = '';
    
    appState.uploadedFiles[type].forEach(fileObj => {
        const fileElement = createFileElement(fileObj, type, fileListId);
        fileListContainer.appendChild(fileElement);
    });
}

function createFileElement(fileObj, type, fileListId) {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'uploaded-file';
    fileDiv.innerHTML = `
        <div class="uploaded-file__info">
            <i class="fas ${getFileIcon(fileObj.name)} uploaded-file__icon"></i>
            <div>
                <div class="uploaded-file__name">${fileObj.name}</div>
                <div class="uploaded-file__size">${fileObj.size}</div>
            </div>
        </div>
        <button class="uploaded-file__remove" data-file-id="${fileObj.id}" data-file-type="${type}" data-file-list="${fileListId}">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    const removeBtn = fileDiv.querySelector('.uploaded-file__remove');
    removeBtn.addEventListener('click', function() {
        removeFile(this.getAttribute('data-file-id'), this.getAttribute('data-file-type'), this.getAttribute('data-file-list'));
    });
    
    return fileDiv;
}

function getFileIcon(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const iconMap = {
        pdf: 'fa-file-pdf',
        txt: 'fa-file-alt',
        csv: 'fa-file-csv',
        xlsx: 'fa-file-excel',
        jpeg: 'fa-file-image',
        jpg: 'fa-file-image'
    };
    return iconMap[extension] || 'fa-file';
}

function removeFile(fileId, type, fileListId) {
    appState.uploadedFiles[type] = appState.uploadedFiles[type].filter(file => file.id != fileId);
    updateFileList(type, fileListId);
    
    const nextBtnId = {
        knowledgeBase: 'step-2-next',
        companyDocs: 'step-3-next',
        evidence: 'step-4-next'
    }[type];
    
    updateNextButtonState(type, nextBtnId);
    console.log(`Removed file ${fileId} from ${type}`);
}

function updateNextButtonState(type, nextBtnId) {
    const nextBtn = document.getElementById(nextBtnId);
    if (nextBtn) {
        nextBtn.disabled = appState.uploadedFiles[type].length === 0;
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// API Integration Functions
async function loadAvailableModels() {
    try {
        const response = await fetch(`${API_BASE_URL}/models`);
        if (response.ok) {
            const models = await response.json();
            populateModelSelect(models.models);
        } 
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

function populateModelSelect(models) {
    setTimeout(() => {
        const modelSelect = document.getElementById('model-select');
        if (modelSelect) {
            modelSelect.innerHTML = '<option value="">Select a model...</option>';
            
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelSelect.appendChild(option);
            });
        }
    }, 500);
}

// Sequential Knowledge Base Building
async function buildKnowledgeBaseForCategory(category, files) {
    const formData = new FormData();
    formData.append('selected_model', API_PARAMETERS.selected_model);
    formData.append('batch_size', API_PARAMETERS.batch_size);
    formData.append('delay_between_batches', API_PARAMETERS.delay_between_batches);
    formData.append('max_retries', API_PARAMETERS.max_retries);
    
    files.forEach(fileObj => {
        formData.append('files', fileObj.file);
    });

    let retries = 0;
    while (retries < API_PARAMETERS.max_retries) {
        try {
            const response = await fetch(`${API_BASE_URL}/build-knowledge-base`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                return result;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            retries++;
            console.error(`Attempt ${retries} failed for ${category}:`, error);
            
            if (retries < API_PARAMETERS.max_retries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            } else {
                throw error;
            }
        }
    }
}

async function runAssessment() {
    const formData = new FormData();
    formData.append('selected_model', API_PARAMETERS.selected_model);

    appState.uploadedFiles.knowledgeBase.forEach(fileObj => {
        formData.append('global_kb_files', fileObj.file);
    });
    appState.uploadedFiles.companyDocs.forEach(fileObj => {
        formData.append('company_kb_files', fileObj.file);
    });
    appState.uploadedFiles.evidence.forEach(fileObj => {
        formData.append('evidence_files', fileObj.file);
    });


    try {
        const response = await fetch(`${API_BASE_URL}/assess-evidence`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Assessment results:', result);
            appState.assessmentResults = result;
            return result;
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error running assessment:', error);
        throw error;
    }
}



// Main Process Assessment Function
async function processAssessment() {
    console.log('Starting assessment process...');
    
    if (!validateAllFiles()) {
        showErrorMessage('Please upload files in at least one category and select a model before proceeding.');
        return;
    }

    appState.isProcessing = true;
    appState.processingStep = 0;
    goToStep(5);
    initializeProcessingUI();

    try {
        for (let i = 0; i < PROCESSING_SEQUENCE.length; i++) {
            const sequenceItem = PROCESSING_SEQUENCE[i];
            appState.processingStep = i + 1;
            
            updateProcessingStatus(sequenceItem);
            
            if (sequenceItem.category === 'assessment') {
                const assessmentResult = await runAssessment();
                updateStepSuccess(sequenceItem, assessmentResult);
            } else {
                const files = appState.uploadedFiles[sequenceItem.category];
                if (files.length > 0) {
                    const result = await buildKnowledgeBaseForCategory(sequenceItem.category, files);
                    updateStepSuccess(sequenceItem, result);
                } else {
                    updateStepSkipped(sequenceItem);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        completeProcessing();
        showSuccessMessage('Assessment completed successfully! View results in the Results section.');
        
    } catch (error) {
        console.error('Assessment process failed:', error);
        showProcessingError(error);
        appState.isProcessing = false;
    }
}

function validateAllFiles() {
    return appState.selectedModel && (
        appState.uploadedFiles.knowledgeBase.length > 0 ||
        appState.uploadedFiles.companyDocs.length > 0 ||
        appState.uploadedFiles.evidence.length > 0
    );
}

// Processing UI Management
function initializeProcessingUI() {
    const statusContainer = document.getElementById('processing-status');
    if (!statusContainer) return;
    
    statusContainer.innerHTML = `
        <div class="processing-header">
            <h3>Processing Assessment</h3>
            <div class="overall-progress">
                <div class="progress-bar">
                    <div class="progress-bar__fill" id="overall-progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-text" id="overall-progress-text">0% Complete</span>
            </div>
        </div>
        <div class="processing-steps" id="processing-steps"></div>
    `;
    
    const stepsContainer = document.getElementById('processing-steps');
    PROCESSING_SEQUENCE.forEach(seq => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'processing-step';
        stepDiv.id = `processing-step-${seq.step}`;
        stepDiv.innerHTML = `
            <div class="processing-step__icon">
                <i class="fas fa-clock" id="step-icon-${seq.step}"></i>
            </div>
            <div class="processing-step__content">
                <div class="processing-step__title">${seq.title}</div>
                <div class="processing-step__description">${seq.description}</div>
                <div class="processing-step__status" id="step-status-${seq.step}">Pending</div>
            </div>
        `;
        stepsContainer.appendChild(stepDiv);
    });
    
    statusContainer.classList.remove('hidden');
}

function updateProcessingStatus(sequenceItem) {
    const stepElement = document.getElementById(`processing-step-${sequenceItem.step}`);
    const statusElement = document.getElementById(`step-status-${sequenceItem.step}`);
    const iconElement = document.getElementById(`step-icon-${sequenceItem.step}`);
    
    if (stepElement && statusElement && iconElement) {
        stepElement.className = 'processing-step active';
        statusElement.textContent = 'Processing...';
        iconElement.className = 'fas fa-spinner fa-spin';
    }
    
    updateOverallProgress();
}

function updateStepSuccess(sequenceItem, result) {
    const stepElement = document.getElementById(`processing-step-${sequenceItem.step}`);
    const statusElement = document.getElementById(`step-status-${sequenceItem.step}`);
    const iconElement = document.getElementById(`step-icon-${sequenceItem.step}`);
    
    if (stepElement && statusElement && iconElement) {
        stepElement.className = 'processing-step completed';
        statusElement.textContent = 'Completed';
        iconElement.className = 'fas fa-check-circle';
    }
    
    updateOverallProgress();
}

function updateStepSkipped(sequenceItem) {
    const stepElement = document.getElementById(`processing-step-${sequenceItem.step}`);
    const statusElement = document.getElementById(`step-status-${sequenceItem.step}`);
    const iconElement = document.getElementById(`step-icon-${sequenceItem.step}`);
    
    if (stepElement && statusElement && iconElement) {
        stepElement.className = 'processing-step skipped';
        statusElement.textContent = 'Skipped (No files)';
        iconElement.className = 'fas fa-minus-circle';
    }
    
    updateOverallProgress();
}

function updateOverallProgress() {
    const progressFill = document.getElementById('overall-progress-fill');
    const progressText = document.getElementById('overall-progress-text');
    
    if (progressFill && progressText) {
        const percentage = Math.round((appState.processingStep / PROCESSING_SEQUENCE.length) * 100);
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}% Complete`;
    }
}

function completeProcessing() {
    appState.isProcessing = false;
    updateOverallProgress();
    
    setTimeout(() => {
        const statusContainer = document.getElementById('processing-status');
        if (statusContainer) {
            statusContainer.innerHTML = `
                <div class="processing-complete">
                    <div class="success-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3>Assessment Complete!</h3>
                    <p>All knowledge bases have been built and assessment is complete.</p>
                </div>
            `;
        }
    }, 1000);
}

function showProcessingError(error) {
    const statusContainer = document.getElementById('processing-status');
    if (statusContainer) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'processing-error';
        errorDiv.innerHTML = `
            <div class="error-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h4>Processing Error</h4>
            <p>${error.message}</p>
            <button class="btn btn--outline btn--sm" onclick="retryAssessment()">
                <i class="fas fa-redo"></i> Retry
            </button>
        `;
        statusContainer.appendChild(errorDiv);
    }
}

function retryAssessment() {
    const errorElements = document.querySelectorAll('.processing-error');
    errorElements.forEach(el => el.remove());
    processAssessment();
}

// Utility Functions
async function downloadReport() {
    
    const workbook = appState.assessmentResults.workbook_path;
    console.log('Downloading report from:', workbook);
    try {
        const response = await fetch(`${API_BASE_URL}/download-report?filename=${encodeURIComponent(workbook)}`, {
            method: 'GET'
        });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = workbook.split('/').pop();
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            showErrorMessage('Failed to download report.');
        }
    } catch (error) {
        console.error('Error downloading report:', error);
        showErrorMessage('Error downloading report.');
    }
}



// Chat Functionality

function addChatMessage(message, sender) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = `chat-message chat-message--${sender}`;
    
    const avatarIcon = sender === 'user' ? 'fa-user' : 'fa-robot';
    
    messageElement.innerHTML = `
        <div class="chat-message__avatar">
            <i class="fas ${avatarIcon}"></i>
        </div>
        <div class="chat-message__content">
            <p>${message}</p>
        </div>
    `;

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageElement;
}

async function generateAIResponse(userMessage) {
    const payload = {
        user_input: userMessage,
        selected_model: API_PARAMETERS.selected_model || ''
    };

    try {
        const resp = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Try to parse JSON response from API
        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
            // Specific handling for 422 Unprocessable Entity
            if (resp.status === 422) {
                const details = data ? JSON.stringify(data) : resp.statusText;
                throw new Error(`Chat API validation error (422): ${details}`);
            }
            if (data && data.error) throw new Error(data.error);
            throw new Error(`Chat API error: ${resp.status} ${resp.statusText}`);
        }

        if (!data) {
            throw new Error('Empty response from chat API');
        }

        // ChatResponse shape: { success, prompt, response, error, loaded_paths }
        if (data.success) {
            return data.response || data.prompt || '';
        } else {
            // API reported failure
            return data.error || 'Chat API returned an error';
        }

    } catch (err) {
        console.error('generateAIResponse error:', err);
        return `Error: ${err.message}`;
    }
}

// Make sendMessage async so it can await the AI response and update the UI element
async function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    
    if (!chatInput || !chatMessages) return;
    
    const message = chatInput.value.trim();
    if (!message) return;

    addChatMessage(message, 'user');
    chatInput.value = '';

    // Add a placeholder assistant message and keep reference for update
    const placeholder = addChatMessage('...', 'assistant');

    try {
        // Ensure a model is selected to satisfy API's required field
        if (!API_PARAMETERS.selected_model || API_PARAMETERS.selected_model === '') {
            throw new Error('No model selected. Please select a model before chatting.');
        }

        const aiText = await generateAIResponse(message);
        if (placeholder) {
            const content = placeholder.querySelector('.chat-message__content p');
            if (content) content.textContent = aiText;
        } else {
            addChatMessage(aiText, 'assistant');
        }
    } catch (err) {
        const errorText = `Error: ${err.message || err}`;
        if (placeholder) {
            const content = placeholder.querySelector('.chat-message__content p');
            if (content) content.textContent = errorText;
        } else {
            addChatMessage(errorText, 'assistant');
        }
    }
}

// Theme Toggle
function setupThemeToggle() {
    setTimeout(() => {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', function(e) {
                e.preventDefault();
                toggleTheme();
            });
            
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const savedTheme = prefersDark ? 'dark' : 'light';
            document.documentElement.setAttribute('data-color-scheme', savedTheme);
            updateThemeIcon(savedTheme);
        }
    }, 100);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-color-scheme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-color-scheme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
}

function showErrorMessage(message) {
    removeMessages();
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const activeStepContent = document.querySelector('.step-content.active .card__body') ||
                             document.querySelector('.section.active .section__header').parentNode;
    if (activeStepContent) {
        activeStepContent.insertBefore(errorDiv, activeStepContent.firstChild);
    }
    
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

function showSuccessMessage(message) {
    removeMessages();
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    const activeStepContent = document.querySelector('.step-content.active .card__body') ||
                             document.querySelector('.section.active .section__header').parentNode;
    if (activeStepContent) {
        activeStepContent.insertBefore(successDiv, activeStepContent.firstChild);
    }
    
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.remove();
        }
    }, 5000);
}

function removeMessages() {
    document.querySelectorAll('.error-message, .success-message').forEach(msg => {
        msg.remove();
    });
}

// Global function exports
window.showSection = showSection;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.processAssessment = processAssessment;
window.sendMessage = sendMessage;
window.removeFile = removeFile;
window.toggleTheme = toggleTheme;
window.toggleSidebar = toggleSidebar;
window.retryAssessment = retryAssessment;