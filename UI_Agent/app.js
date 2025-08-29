// AI Agent Document Management Application - Real API Integration

class DocumentAPI {
    static baseUrl = 'http://localhost:8000';
    
    static async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Health check failed:', error);
            throw error;
        }
    }
    
    static async getModels() {
        try {
            const response = await fetch(`${this.baseUrl}/models`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch models:', error);
            throw error;
        }
    }
    
    static async buildKnowledgeBase(files, selectedModel, options = {}) {
        try {
            const formData = new FormData();
            
            // Add model and options
            formData.append('selected_model', selectedModel);
            formData.append('batch_size', options.batchSize || 15);
            formData.append('delay_between_batches', options.delayBetweenBatches || 0.2);
            formData.append('max_retries', options.maxRetries || 3);
            
            // Add all files
            for (const file of files) {
                formData.append('files', file);
            }
            
            const response = await fetch(`${this.baseUrl}/build-knowledge-base`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error ${response.status}: ${errorText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to build knowledge base:', error);
            throw error;
        }
    }
}

class DocumentManager {
    constructor() {
        this.files = {
            general: [],
            company: []
        };
        this.models = [];
        this.selectedModel = '';
        this.apiConnected = false;
        this.buildStates = [
            { state: 'idle', label: 'Ready to Build', color: '#6b7280', icon: '🏗️' },
            { state: 'uploading', label: 'Uploading to API...', color: '#f59e0b', icon: '⬆️' },
            { state: 'processing', label: 'Building Vectorstore...', color: '#3b82f6', icon: '⚙️' },
            { state: 'success', label: 'Knowledge Base Built', color: '#10b981', icon: '✅' },
            { state: 'error', label: 'Build Failed', color: '#ef4444', icon: '❌' }
        ];
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupApplication();
            });
        } else {
            this.setupApplication();
        }
    }

    async setupApplication() {
        this.setupEventListeners();
        this.updateFileCounts();
        await this.checkAPIConnection();
        await this.loadModels();
    }

    async checkAPIConnection() {
        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        const apiStatus = document.querySelector('.api-status');
        
        try {
            statusText.textContent = 'Connecting...';
            statusIndicator.textContent = '🟡';
            apiStatus.className = 'api-status api-checking';
            
            await DocumentAPI.checkHealth();
            
            this.apiConnected = true;
            statusText.textContent = 'Connected';
            statusIndicator.textContent = '🟢';
            apiStatus.className = 'api-status api-connected';
            
            this.showNotification('Successfully connected to FastAPI server', 'success');
        } catch (error) {
            this.apiConnected = false;
            statusText.textContent = 'Disconnected';
            statusIndicator.textContent = '🔴';
            apiStatus.className = 'api-status api-disconnected';
            
            this.showNotification(`Failed to connect to API: ${error.message}`, 'error');
        }
    }

    async loadModels() {
        const modelSelector = document.getElementById('model-selector');
        
        if (!this.apiConnected) {
            modelSelector.innerHTML = '<option value="">API not connected</option>';
            return;
        }
        
        try {
            modelSelector.innerHTML = '<option value="">Loading models...</option>';
            
            const response = await DocumentAPI.getModels();
            this.models = response.models || [];
            
            if (this.models.length === 0) {
                modelSelector.innerHTML = '<option value="">No models available</option>';
                this.showNotification('No Ollama models found. Please ensure Ollama is running with models installed.', 'warning');
                return;
            }
            
            modelSelector.innerHTML = '<option value="">Select a model...</option>' + 
                this.models.map(model => `<option value="${model}">${model}</option>`).join('');
            
            this.showNotification(`Loaded ${this.models.length} Ollama models`, 'success');
        } catch (error) {
            console.error('Failed to load models:', error);
            modelSelector.innerHTML = '<option value="">Failed to load models</option>';
            this.showNotification(`Failed to load models: ${error.message}`, 'error');
        }
    }

    setupEventListeners() {
        // Tab switching
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = e.currentTarget.dataset.tab;
                this.switchTab(tabId);
            });
        });

        // Model selection
        const modelSelector = document.getElementById('model-selector');
        modelSelector.addEventListener('change', (e) => {
            this.selectedModel = e.target.value;
            this.updateBuildButtons();
        });

        // Refresh models button
        const refreshButton = document.getElementById('refresh-models');
        refreshButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadModels();
        });

        // File input handlers
        const generalInput = document.getElementById('general-file-input');
        const companyInput = document.getElementById('company-file-input');

        if (generalInput) {
            generalInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelection(e.target.files, 'general');
                }
                e.target.value = '';
            });
        }

        if (companyInput) {
            companyInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelection(e.target.files, 'company');
                }
                e.target.value = '';
            });
        }

        // Drag and drop handlers
        this.setupDragAndDrop('general-upload-area', 'general');
        this.setupDragAndDrop('company-upload-area', 'company');

        // Build knowledge base buttons
        const buildGeneralBtn = document.getElementById('build-general-kb');
        const buildCompanyBtn = document.getElementById('build-company-kb');

        buildGeneralBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.buildKnowledgeBase('general');
        });

        buildCompanyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.buildKnowledgeBase('company');
        });

        // Browse buttons
        this.setupBrowseButtons();

        // Modal close handlers
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    setupBrowseButtons() {
        const generalUploadArea = document.getElementById('general-upload-area');
        const companyUploadArea = document.getElementById('company-upload-area');

        if (generalUploadArea) {
            const browseButton = generalUploadArea.querySelector('.upload-link');
            if (browseButton) {
                browseButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById('general-file-input').click();
                });
            }
        }

        if (companyUploadArea) {
            const browseButton = companyUploadArea.querySelector('.upload-link');
            if (browseButton) {
                browseButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById('company-file-input').click();
                });
            }
        }
    }

    setupDragAndDrop(areaId, section) {
        const area = document.getElementById(areaId);
        if (!area) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            area.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        area.addEventListener('dragover', (e) => {
            area.classList.add('drag-over');
        });

        area.addEventListener('dragleave', (e) => {
            if (!area.contains(e.relatedTarget)) {
                area.classList.remove('drag-over');
            }
        });

        area.addEventListener('drop', (e) => {
            area.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelection(files, section);
            }
        });

        area.addEventListener('click', (e) => {
            if (e.target.classList.contains('upload-link')) {
                return;
            }
            const fileInput = document.getElementById(`${section}-file-input`);
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    switchTab(tabId) {
        // Update nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        const activeLink = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(tabId);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    }

    handleFileSelection(files, section) {
        console.log(`Adding ${files.length} files to ${section} section`);
        
        const validFiles = this.validateFiles(files, section);
        
        // Add all valid files to the array (no limits)
        for (const file of validFiles) {
            this.files[section].push(file);
        }
        
        this.updateFileCounts();
        this.updateBuildButtons();
        
        this.showNotification(`Added ${validFiles.length} files to ${section} documents`, 'success');
    }

    validateFiles(files, section) {
        const validFiles = [];
        const allowedExtensions = section === 'general' 
            ? ['.pdf', '.txt', '.docx', '.md'] 
            : ['.pdf', '.txt', '.docx', '.md', '.xlsx'];

        for (const file of files) {
            // Check file type by extension (no size limits)
            const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            if (!allowedExtensions.includes(extension)) {
                this.showNotification(`File "${file.name}" has an unsupported format.`, 'error');
                continue;
            }

            // Check for duplicates
            if (this.files[section].some(f => f.name === file.name && f.size === file.size)) {
                this.showNotification(`File "${file.name}" already exists.`, 'warning');
                continue;
            }

            validFiles.push(file);
        }

        return validFiles;
    }

    updateFileCounts() {
        ['general', 'company'].forEach(section => {
            const files = this.files[section];
            const count = files.length;
            const totalSize = files.reduce((sum, file) => sum + file.size, 0);
            
            const countEl = document.getElementById(`${section}-count`);
            const sizeEl = document.getElementById(`${section}-size`);
            
            if (countEl) {
                countEl.textContent = `${count} files uploaded`;
            }
            
            if (sizeEl) {
                sizeEl.textContent = this.formatFileSize(totalSize);
            }
        });
    }

    updateBuildButtons() {
        ['general', 'company'].forEach(section => {
            const button = document.getElementById(`build-${section}-kb`);
            const hasFiles = this.files[section].length > 0;
            const hasModel = this.selectedModel && this.selectedModel !== '';
            const isConnected = this.apiConnected;
            
            button.disabled = !(hasFiles && hasModel && isConnected);
            
            // Update button text based on state
            const icon = button.querySelector('.btn-icon');
            if (!isConnected) {
                icon.textContent = '🔴';
                button.innerHTML = '<span class="btn-icon">🔴</span> API Disconnected';
            } else if (!hasModel) {
                icon.textContent = '⚙️';
                button.innerHTML = '<span class="btn-icon">⚙️</span> Select Model First';
            } else if (!hasFiles) {
                icon.textContent = '📁';
                button.innerHTML = '<span class="btn-icon">📁</span> Upload Files First';
            } else {
                icon.textContent = '🏗️';
                button.innerHTML = '<span class="btn-icon">🏗️</span> Build Knowledge Base';
            }
        });
    }

    async buildKnowledgeBase(section) {
        if (!this.apiConnected) {
            this.showNotification('API is not connected. Please check your connection.', 'error');
            return;
        }

        if (!this.selectedModel) {
            this.showNotification('Please select an Ollama model first.', 'error');
            return;
        }

        const files = this.files[section];
        if (files.length === 0) {
            this.showNotification('Please upload files first.', 'error');
            return;
        }

        try {
            // Show processing modal
            this.showProcessingModal(section);
            
            // Update status to uploading
            this.updateProcessingModal('⬆️', 'Uploading to API...', 10);
            this.updateSectionStatus(section, 'uploading', '⬆️ Uploading to API...');

            // Get build options
            const batchSize = parseInt(document.getElementById(`${section}-batch-size`).value) || 15;

            const options = {
                batchSize: batchSize,
                delayBetweenBatches: 0.2,
                maxRetries: 3
            };

            // Update status to processing
            this.updateProcessingModal('⚙️', 'Building Vectorstore...', 50);
            this.updateSectionStatus(section, 'processing', '⚙️ Building Vectorstore...');

            // Make real API call
            console.log(`Building knowledge base for ${section} with ${files.length} files and model ${this.selectedModel}`);
            
            const response = await DocumentAPI.buildKnowledgeBase(files, this.selectedModel, options);
            
            // Update to completion
            this.updateProcessingModal('✅', 'Knowledge Base Built Successfully!', 100);
            this.updateSectionStatus(section, 'success', '✅ Knowledge Base Built');

            // Show results
            this.showBuildResults(response, section);
            
            // Hide modal after showing results
            setTimeout(() => {
                this.hideModal('processing-modal');
            }, 2000);
            
            this.showNotification(`Successfully built knowledge base for ${section} documents!`, 'success');
            
        } catch (error) {
            console.error('Knowledge base build failed:', error);
            
            this.updateProcessingModal('❌', `Build Failed: ${error.message}`, 0);
            this.updateSectionStatus(section, 'error', '❌ Build Failed');
            
            setTimeout(() => {
                this.hideModal('processing-modal');
            }, 3000);
            
            this.showNotification(`Failed to build knowledge base: ${error.message}`, 'error');
        }
    }

    showProcessingModal(section) {
        const sectionName = section.charAt(0).toUpperCase() + section.slice(1) + ' Documents';
        document.getElementById('processing-section').textContent = sectionName;
        document.getElementById('processing-status').textContent = 'Preparing...';
        document.getElementById('processing-icon').textContent = '⚙️';
        document.getElementById('progress-fill').style.width = '0%';
        document.getElementById('processing-details').textContent = 'Initializing knowledge base build...';
        
        this.showModal('processing-modal');
    }

    updateProcessingModal(icon, status, progress) {
        document.getElementById('processing-icon').textContent = icon;
        document.getElementById('processing-status').textContent = status;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        
        const details = document.getElementById('processing-details');
        const timestamp = new Date().toLocaleTimeString();
        details.textContent += `\n[${timestamp}] ${status}`;
        details.scrollTop = details.scrollHeight;
    }

    updateSectionStatus(section, state, label) {
        const statusEl = document.getElementById(`${section}-status`);
        if (statusEl) {
            const stateClass = `status--${state}`;
            statusEl.innerHTML = `<span class="status ${stateClass}">${label}</span>`;
        }
    }

    showBuildResults(response, section) {
        const resultsContainer = document.getElementById('build-results');
        const resultsContent = document.getElementById('results-content');
        
        // Show results section
        resultsContainer.style.display = 'block';
        
        // Create results HTML
        const results = [
            { label: 'Section', value: section.toUpperCase() },
            { label: 'Vector Count', value: response.vector_count || 'N/A' },
            { label: 'Processing Time', value: response.processing_time ? `${response.processing_time}s` : 'N/A' },
            { label: 'Model Used', value: this.selectedModel },
            { label: 'Files Processed', value: this.files[section].length },
            { label: 'Status', value: response.success ? 'SUCCESS' : 'FAILED' }
        ];
        
        resultsContent.innerHTML = results.map(result => `
            <div class="result-item">
                <div class="result-label">${result.label}</div>
                <div class="result-value">${result.value}</div>
            </div>
        `).join('');
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth' });
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('show');
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 MB';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${icons[type]}</span>
                <span class="notification-message">${message}</span>
            </div>
        `;

        document.body.appendChild(notification);
        
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
}

// Initialize the application
let documentManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        documentManager = new DocumentManager();
        documentManager.init();
        window.documentManager = documentManager;
    });
} else {
    documentManager = new DocumentManager();
    documentManager.init();
    window.documentManager = documentManager;
}