// Enhanced AI Agent Document Management Application with Fixed Error Handling

class DebugConsole {
    static instance = null;
    
    static getInstance() {
        if (!DebugConsole.instance) {
            DebugConsole.instance = new DebugConsole();
        }
        return DebugConsole.instance;
    }
    
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
    }
    
    log(message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { timestamp, message, data, type: 'log' };
        
        console.log(`[${timestamp}] ${message}`, data || '');
        this.addToPanel(logEntry);
        this.logs.push(logEntry);
        
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
    }
    
    error(message, error) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { 
            timestamp, 
            message, 
            data: error?.stack || error?.message || error, 
            type: 'error' 
        };
        
        console.error(`[${timestamp}] ERROR: ${message}`, error);
        this.addToPanel(logEntry);
        this.logs.push(logEntry);
        
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
    }
    
    addToPanel(logEntry) {
        const debugPanel = document.getElementById('debug-output');
        if (!debugPanel) return;
        
        const entry = document.createElement('div');
        entry.className = `debug-entry ${logEntry.type}`;
        entry.innerHTML = `
            <span class="debug-time">${logEntry.timestamp}</span>
            <span class="debug-message">${logEntry.message}</span>
            ${logEntry.data ? `<pre class="debug-data">${typeof logEntry.data === 'object' ? JSON.stringify(logEntry.data, null, 2) : logEntry.data}</pre>` : ''}
        `;
        
        debugPanel.appendChild(entry);
        debugPanel.scrollTop = debugPanel.scrollHeight;
        
        // Keep only last 50 entries in DOM for performance
        const entries = debugPanel.querySelectorAll('.debug-entry');
        if (entries.length > 50) {
            entries[0].remove();
        }
    }
    
    clear() {
        const debugPanel = document.getElementById('debug-output');
        if (debugPanel) {
            debugPanel.innerHTML = '';
        }
        this.logs = [];
    }
    
    downloadLogs() {
        const logData = this.logs.map(log => 
            `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}${log.data ? '\n' + (typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data) : ''}`
        ).join('\n\n');
        
        const blob = new Blob([logData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

class DocumentAPI {
    static baseUrl = 'http://localhost:8000';
    
    static async getModels() {
        const debug = DebugConsole.getInstance();
        debug.log('API: Fetching available models...');
        
        try {
            const response = await fetch(`${this.baseUrl}/models`);
            debug.log(`API: Models request response status: ${response.status}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            debug.log('API: Models response received', data);
            
            let models = [];
            if (Array.isArray(data)) {
                models = data;
            } else if (data.models && Array.isArray(data.models)) {
                models = data.models;
            } else if (data.data && Array.isArray(data.data)) {
                models = data.data;
            }
            
            debug.log(`API: Processed models list (${models.length} models)`, models);
            return models;
            
        } catch (error) {
            debug.error('API: Failed to fetch models', error);
            console.warn('API not available, using mock models:', error.message);
            
            // Return mock models for testing
            const mockModels = ['llama2', 'codellama', 'mistral', 'phi', 'qwen2'];
            debug.log('API: Using mock models for testing', mockModels);
            return mockModels;
        }
    }
    
    static async buildKnowledgeBase(files, kbType) {
        const debug = DebugConsole.getInstance();
        const sessionModel = sessionStorage.getItem('selectedModel');
        
        if (!sessionModel) {
            const error = new Error('No model selected for session');
            debug.error('API: Build knowledge base failed - no model selected', error);
            throw error;
        }
        
        try {
            const formData = new FormData();
            
            // Add files
            Array.from(files).forEach(file => {
                formData.append('files', file);
            });
            
            // Add parameters
            formData.append('selected_model', sessionModel);
            formData.append('kb_type', kbType);
            formData.append('batch_size', '15');
            formData.append('delay_between_batches', '0.2');
            formData.append('max_retries', '3');
            
            debug.log(`API: Building knowledge base - Type: ${kbType}, Model: ${sessionModel}, Files: ${files.length}`);
            
            const response = await fetch(`${this.baseUrl}/build-knowledge-base`, {
                method: 'POST',
                body: formData
            });
            
            debug.log(`API: Build request response status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                debug.error(`API: Build request failed (${response.status})`, errorText);
                throw new Error(`Build failed (${response.status}): ${errorText}`);
            }
            
            const result = await response.json();
            debug.log('API: Build response received', result);
            
            if (!result.success) {
                const error = new Error(result.error_details || result.message || 'Build failed');
                debug.error('API: Build reported failure', error);
                throw error;
            }
            
            debug.log('API: Knowledge base build completed successfully');
            return result;
            
        } catch (error) {
            debug.error('API: Build knowledge base error', error);
            
            if (error.message.includes('fetch')) {
                debug.log('API: Simulating build process for testing');
                // Simulate successful build for testing when API is not available
                await new Promise(resolve => setTimeout(resolve, 2000));
                const mockResult = {
                    success: true,
                    message: 'Knowledge base built successfully (simulated)',
                    vector_count: Math.floor(Math.random() * 500) + 100,
                    status: 'completed'
                };
                debug.log('API: Mock build result', mockResult);
                return mockResult;
            }
            
            throw error;
        }
    }
    
    static async saveVectorstore(kbType, dirPath) {
        const debug = DebugConsole.getInstance();
        
        try {
            const formData = new FormData();
            formData.append('kb_type', kbType);
            formData.append('dir_path', dirPath);
            
            debug.log(`API: Saving vectorstore - Type: ${kbType}, Path: ${dirPath}`);
            
            const response = await fetch(`${this.baseUrl}/save-vectorstore`, {
                method: 'POST',
                body: formData
            });
            
            debug.log(`API: Save request response status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                debug.error(`API: Save request failed (${response.status})`, errorText);
                
                if (response.status === 400 && errorText.includes('No vectorstore cached')) {
                    throw new Error(`Vectorstore not found in cache for ${kbType}. Build may have failed silently.`);
                }
                
                throw new Error(`Save failed (${response.status}): ${errorText}`);
            }
            
            const result = await response.json();
            debug.log('API: Save response received', result);
            
            if (!result.success) {
                const error = new Error(result.message || 'Save operation failed');
                debug.error('API: Save reported failure', error);
                throw error;
            }
            
            debug.log('API: Vectorstore save completed successfully');
            return result;
            
        } catch (error) {
            debug.error('API: Save vectorstore error', error);
            
            if (error.message.includes('fetch')) {
                debug.log('API: Simulating save process for testing');
                // Simulate successful save for testing when API is not available
                await new Promise(resolve => setTimeout(resolve, 1000));
                const mockResult = {
                    success: true,
                    message: 'Vectorstore saved successfully (simulated)',
                    path: dirPath,
                    status: 'saved'
                };
                debug.log('API: Mock save result', mockResult);
                return mockResult;
            }
            
            throw error;
        }
    }
    
    static async checkHealth() {
        const debug = DebugConsole.getInstance();
        
        try {
            debug.log('API: Checking health endpoint');
            const response = await fetch(`${this.baseUrl}/health`);
            const isHealthy = response.ok;
            debug.log(`API: Health check result: ${isHealthy ? 'healthy' : 'unhealthy'}`);
            return isHealthy;
        } catch (error) {
            debug.error('API: Health check failed', error);
            return false;
        }
    }
}

class UIManager {
    constructor() {
        this.processing = {};
        this.files = { general: [], company: [] };
        this.availableModels = [];
        this.selectedModel = null;
        this.modelLocked = false;
        this.currentDeletion = null;
        this.debug = DebugConsole.getInstance();
        this.maxFileSize = 10485760; // 10MB
        this.allowedTypes = [
            'application/pdf', 
            'text/plain', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
            'text/markdown',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
    }
    
    async init() {
        this.debug.log('UI: Initializing application');
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupApplication();
            });
        } else {
            this.setupApplication();
        }
    }
    
    async setupApplication() {
        this.debug.log('UI: Setting up application components');
        
        this.loadSessionModel();
        this.setupEventListeners();
        this.setupDebugConsole();
        this.updateAPIStatus(false);
        
        // Load models first, then check API
        await this.loadModels();
        await this.checkAPIConnection();
        
        this.updateModelDisplay();
        this.updateAllStatuses();
        
        this.debug.log('UI: Application setup completed');
    }
    
    setupDebugConsole() {
        const debugToggle = document.getElementById('debug-toggle');
        const debugPanel = document.getElementById('debug-panel');
        const debugClose = document.getElementById('debug-close');
        const debugClear = document.getElementById('debug-clear');
        const debugDownload = document.getElementById('debug-download');
        
        if (debugToggle && debugPanel) {
            debugToggle.addEventListener('click', () => {
                debugPanel.classList.toggle('hidden');
            });
        }
        
        if (debugClose && debugPanel) {
            debugClose.addEventListener('click', () => {
                debugPanel.classList.add('hidden');
            });
        }
        
        if (debugClear) {
            debugClear.addEventListener('click', () => {
                this.debug.clear();
            });
        }
        
        if (debugDownload) {
            debugDownload.addEventListener('click', () => {
                this.debug.downloadLogs();
            });
        }
    }
    
    async checkAPIConnection() {
        this.debug.log('UI: Checking API connection');
        const isHealthy = await DocumentAPI.checkHealth();
        this.updateAPIStatus(isHealthy);
        
        if (!isHealthy) {
            this.showToast('API server not available. Using demo mode with mock data.', 'warning', 6000);
        } else {
            this.showToast('Connected to API server successfully', 'success');
        }
    }

    updateCardStatus(sectionId, statusType, message) {
        const statusContainer = document.getElementById(`${sectionId}-status`);
        if (!statusContainer) {
            console.error(`Status container not found: ${sectionId}-status`);
            return;
        }
        
        const statusElement = statusContainer.querySelector('.status');
        if (!statusElement) {
            console.error(`Status element not found in: ${sectionId}-status`);
            return;
        }
        
        // Update text
        statusElement.textContent = message;
        
        // Update classes
        statusElement.className = `status status--${statusType}`;
        
        console.log(`Updated ${sectionId} status: ${message} (${statusType})`);
    }

    
    updateAPIStatus(isHealthy) {
        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        
        if (statusIndicator && statusText) {
            if (isHealthy) {
                statusIndicator.textContent = '🟢';
                statusText.textContent = 'API Connected';
            } else {
                statusIndicator.textContent = '🔴';
                statusText.textContent = 'API Disconnected';
            }
        }
    }
    
    loadSessionModel() {
        const storedModel = sessionStorage.getItem('selectedModel');
        if (storedModel) {
            this.selectedModel = storedModel;
            this.modelLocked = true;
            this.debug.log(`UI: Loaded session model: ${storedModel}`);
        }
    }
    
    validateSessionModel() {
        const model = sessionStorage.getItem('selectedModel');
        if (!model) {
            this.showToast('No model selected. Please select a model first.', 'error');
            return false;
        }
        
        if (!this.availableModels.includes(model)) {
            this.showToast('Selected model is no longer available. Please select a new model.', 'error');
            this.resetModelSelection();
            return false;
        }
        
        return true;
    }
    
    resetModelSelection() {
        this.selectedModel = null;
        this.modelLocked = false;
        sessionStorage.removeItem('selectedModel');
        this.updateModelDisplay();
        this.updateAllStatuses();
    }
    
    async loadModels() {
        this.debug.log('UI: Loading available models');
        this.showModelLoading(true);
        
        try {
            const models = await DocumentAPI.getModels();
            this.availableModels = Array.isArray(models) ? models : [];
            
            // Small delay to show loading state
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.populateModelSelect();
            this.validateCurrentModel();
            
            if (this.availableModels.length === 0) {
                this.showToast('No Ollama models available. Please ensure Ollama is running and models are installed.', 'error');
            } else {
                this.debug.log(`UI: Loaded ${this.availableModels.length} models`);
                this.showToast(`Loaded ${this.availableModels.length} available models`, 'success');
            }
        } catch (error) {
            this.debug.error('UI: Failed to load models', error);
            this.showToast(`Failed to load models: ${error.message}`, 'error');
            this.availableModels = [];
            this.populateModelSelect();
        } finally {
            this.showModelLoading(false);
        }
    }
    
    showModelLoading(isLoading) {
        const sessionModelSelect = document.getElementById('session-model-select');
        if (!sessionModelSelect) return;
        
        if (isLoading) {
            sessionModelSelect.innerHTML = '<option value="">Loading models...</option>';
            sessionModelSelect.disabled = true;
        }
    }
    
    validateCurrentModel() {
        if (this.selectedModel && !this.availableModels.includes(this.selectedModel)) {
            this.debug.log(`UI: Current model ${this.selectedModel} no longer available`);
            this.resetModelSelection();
            this.showToast('Previously selected model is no longer available. Please select a new model.', 'warning');
        }
    }
    
    populateModelSelect() {
        const sessionModelSelect = document.getElementById('session-model-select');
        const modelValidation = document.getElementById('model-validation');
        
        if (!sessionModelSelect) return;
        
        if (this.availableModels.length === 0) {
            sessionModelSelect.innerHTML = '<option value="">No models available</option>';
            sessionModelSelect.disabled = true;
            
            if (modelValidation) {
                modelValidation.innerHTML = '<div class="model-validation error">⚠️ No Ollama models found. Please ensure Ollama is running and models are installed.</div>';
            }
        } else {
            sessionModelSelect.innerHTML = '<option value="">Select Ollama Model...</option>' + 
                this.availableModels.map(model => 
                    `<option value="${model}">${model}</option>`
                ).join('');
            sessionModelSelect.disabled = this.modelLocked;
            
            if (modelValidation) {
                if (this.modelLocked && this.selectedModel) {
                    modelValidation.innerHTML = `<div class="model-validation success">✅ Model "${this.selectedModel}" is locked for this session</div>`;
                } else {
                    modelValidation.innerHTML = `<div class="model-validation warning">⚠️ Please select a model to enable document processing</div>`;
                }
            }
        }
    }
    
    updateModelDisplay() {
        const modelSelector = document.getElementById('model-selector');
        const selectedModelDisplay = document.getElementById('selected-model-display');
        const selectedModelName = document.getElementById('selected-model-name');
        
        if (this.modelLocked && this.selectedModel) {
            if (modelSelector) modelSelector.style.display = 'none';
            if (selectedModelDisplay) selectedModelDisplay.style.display = 'flex';
            if (selectedModelName) selectedModelName.textContent = this.selectedModel;
        } else {
            if (modelSelector) modelSelector.style.display = 'flex';
            if (selectedModelDisplay) selectedModelDisplay.style.display = 'none';
        }
    }
    
    setupEventListeners() {
        this.debug.log('UI: Setting up event listeners');
        
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
        const sessionModelSelect = document.getElementById('session-model-select');
        if (sessionModelSelect) {
            sessionModelSelect.addEventListener('change', (e) => {
                const selectedModel = e.target.value;
                if (selectedModel) {
                    this.selectedModel = selectedModel;
                    this.modelLocked = true;
                    sessionStorage.setItem('selectedModel', selectedModel);
                    this.updateModelDisplay();
                    this.updateAllStatuses();
                    this.populateModelSelect();
                    this.showToast(`Model "${selectedModel}" selected and locked for session`, 'success');
                    this.debug.log(`UI: Model selected and locked: ${selectedModel}`);
                }
            });
        }
        
        // Change model button
        const changeModelBtn = document.getElementById('change-model-btn');
        if (changeModelBtn) {
            changeModelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.resetModelSelection();
                this.populateModelSelect();
                this.showToast('Model selection cleared. Please select a new model.', 'info');
                this.debug.log('UI: Model selection cleared');
            });
        }
        
        // File inputs
        this.setupFileInputs();
        
        // Drag and drop
        this.setupDragAndDrop('general-upload-area', 'general');
        this.setupDragAndDrop('company-upload-area', 'company');
        
        // Build buttons
        this.setupBuildButtons();
        
        // Modal handlers
        this.setupModalHandlers();
        
        // Browse buttons - setup after DOM is ready
        this.setupBrowseButtons();
    }
    
    setupFileInputs() {
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
    }
    
    setupBuildButtons() {
        const generalBuildBtn = document.getElementById('general-build-btn');
        const companyBuildBtn = document.getElementById('company-build-btn');
        
        if (generalBuildBtn) {
            generalBuildBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!generalBuildBtn.disabled && this.validateSessionModel()) {
                    this.buildAndSaveKnowledgeBase('general');
                }
            });
        }
        
        if (companyBuildBtn) {
            companyBuildBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!companyBuildBtn.disabled && this.validateSessionModel()) {
                    this.buildAndSaveKnowledgeBase('company');
                }
            });
        }
    }
    
    setupModalHandlers() {
        const cancelDelete = document.getElementById('cancel-delete');
        const confirmDelete = document.getElementById('confirm-delete');
        
        if (cancelDelete) {
            cancelDelete.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideModal('delete-modal');
            });
        }
        
        if (confirmDelete) {
            confirmDelete.addEventListener('click', (e) => {
                e.preventDefault();
                this.confirmDelete();
            });
        }
        
        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }
    
    async buildAndSaveKnowledgeBase(sectionId) {
        if (this.processing[sectionId]) {
            this.debug.log(`UI: ${sectionId} is already processing, skipping...`);
            return;
        }
        
        const files = this.files[sectionId];
        if (files.length === 0) {
            this.showToast('Please upload files first', 'error');
            return;
        }
        
        if (!this.selectedModel) {
            this.showToast('Please select a model first', 'error');
            return;
        }
        
        const config = {
            general: { kbType: 'global', savePath: 'saved_global_vectorstore' },
            company: { kbType: 'company', savePath: 'saved_company_vectorstore' }
        };
        
        const { kbType, savePath } = config[sectionId];
        
        this.processing[sectionId] = true;
        this.updateBuildButton(sectionId, true);
        
        // Show processing modal with progress
        this.showProcessingModal(sectionId, this.selectedModel);
        
        try {
            // Phase 1: Build Knowledge Base
            this.debug.log(`UI: Starting build for ${sectionId}...`);
            this.updateCardStatus(sectionId, 'processing', 'Building knowledge base...');
            this.updateStatus(sectionId, 'building', 'Building knowledge base...');
            this.updateProcessingModal('Building knowledge base...', '⚙️', 30);
            
            // Create files array with File objects
            const fileObjects = this.files[sectionId].map(doc => doc.file || new File(['test content'], doc.name, { type: doc.type }));
            const buildResult = await this.callBuildAPI(fileObjects, kbType);
            
            this.debug.log(`UI: Build completed for ${sectionId}:`, buildResult);
            
            // Validate build result
            if (!buildResult || !buildResult.success) {
                throw new Error('Build completed but reported failure');
            }
            
            const vectorCount = buildResult.vector_count || 0;
            this.updateStatus(sectionId, 'built', `Built successfully (${vectorCount} vectors)`);
            this.updateProcessingModal('Knowledge base built successfully', '✅', 60);
            
            // Small delay to ensure vectorstore is cached on server
            this.debug.log('UI: Waiting for vectorstore to be cached...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Phase 2: Save Vectorstore
            this.debug.log(`UI: Starting save for ${sectionId}...`);
            this.updateStatus(sectionId, 'saving', 'Saving to disk...');
            this.updateProcessingModal('Saving vectorstore to disk...', '💾', 80);
            
            const saveResult = await this.callSaveAPI(kbType, savePath);
            
            this.debug.log(`UI: Save completed for ${sectionId}:`, saveResult);
            
            // Validate save result
            if (!saveResult || !saveResult.success) {
                throw new Error('Save completed but reported failure');
            }
            
            // Success
            this.updateStatus(sectionId, 'completed', 'Built & saved successfully');
            this.showSavedPath(sectionId, saveResult.path || savePath, vectorCount);
            this.updateProcessingModal('Knowledge base built and saved successfully!', '🎉', 100);
            this.updateCardStatus(sectionId, 'success', 'Built & saved successfully');

            
            // Hide modal after showing success
            setTimeout(() => {
                this.hideModal('processing-modal');
                this.showToast(`${sectionId} knowledge base built and saved successfully!`, 'success');
            }, 2000);
            
        } catch (error) {
            this.debug.error(`UI: Build/Save failed for ${sectionId}:`, error);
            this.updateStatus(sectionId, 'error', `Failed: ${error.message}`);
            this.hideModal('processing-modal');
            this.updateCardStatus(sectionId, 'error', `Failed: ${error.message}`);
            this.showToast(`${sectionId} failed: ${error.message}`, 'error');
        } finally {
            this.processing[sectionId] = false;
            this.updateBuildButton(sectionId, false);
        }
    }
    
    showProcessingModal(section, model) {
        const modal = document.getElementById('processing-modal');
        const title = document.getElementById('processing-title');
        const status = document.getElementById('processing-status');
        const icon = document.getElementById('processing-icon');
        const progress = document.getElementById('progress-fill');
        const details = document.getElementById('processing-details');
        
        if (title) title.textContent = `Processing ${section.charAt(0).toUpperCase() + section.slice(1)} Documents`;
        if (status) status.textContent = 'Preparing to build knowledge base...';
        if (icon) icon.textContent = '🏗️';
        if (progress) progress.style.width = '10%';
        if (details) details.textContent = `Model: ${model} | Documents: ${this.files[section].length}`;
        
        this.showModal('processing-modal');
    }
    
    updateProcessingModal(statusText, iconText, progressPercent) {
        const status = document.getElementById('processing-status');
        const icon = document.getElementById('processing-icon');
        const progress = document.getElementById('progress-fill');
        
        if (status) status.textContent = statusText;
        if (icon) icon.textContent = iconText;
        if (progress) progress.style.width = `${progressPercent}%`;
    }
    
    async callBuildAPI(files, kbType) {
        try {
            const result = await DocumentAPI.buildKnowledgeBase(files, kbType);
            return result;
        } catch (error) {
            this.debug.error('UI: Build API call failed', error);
            throw error;
        }
    }
    
    async callSaveAPI(kbType, savePath) {
        try {
            const result = await DocumentAPI.saveVectorstore(kbType, savePath);
            return result;
        } catch (error) {
            this.debug.error('UI: Save API call failed', error);
            throw error;
        }
    }
    
    updateStatus(sectionId, statusType, message) {
        const buildStatus = document.getElementById(`${sectionId}-build-status`);
        const saveStatus = document.getElementById(`${sectionId}-save-status`);
        
        if (statusType === 'building') {
            if (buildStatus) {
                buildStatus.textContent = message;
                buildStatus.className = 'status-value building';
            }
            if (saveStatus) {
                saveStatus.textContent = 'Waiting...';
                saveStatus.className = 'status-value';
            }
        } else if (statusType === 'built') {
            if (buildStatus) {
                buildStatus.textContent = message;
                buildStatus.className = 'status-value built';
            }
        } else if (statusType === 'saving') {
            if (saveStatus) {
                saveStatus.textContent = message;
                saveStatus.className = 'status-value saving';
            }
        } else if (statusType === 'completed') {
            if (buildStatus) {
                buildStatus.textContent = 'Build completed';
                buildStatus.className = 'status-value completed';
            }
            if (saveStatus) {
                saveStatus.textContent = 'Saved successfully';
                saveStatus.className = 'status-value completed';
            }
        } else if (statusType === 'error') {
            if (buildStatus) {
                buildStatus.textContent = message;
                buildStatus.className = 'status-value error';
            }
            if (saveStatus) {
                saveStatus.textContent = 'Save failed';
                saveStatus.className = 'status-value error';
            }
        }
    }
    
    updateBuildButton(sectionId, isProcessing) {
        const btn = document.getElementById(`${sectionId}-build-btn`);
        if (!btn) return;
        
        if (isProcessing) {
            btn.disabled = true;
            btn.classList.add('loading');
            btn.textContent = 'Processing...';
        } else {
            btn.classList.remove('loading');
            btn.innerHTML = '🏗️ Build & Save Knowledge Base';
            this.updateAllStatuses(); // This will set proper disabled state
        }
    }
    
    showSavedPath(sectionId, path, vectorCount) {
        const savedPathEl = document.getElementById(`${sectionId}-saved-path`);
        const savedPathItem = document.getElementById(`${sectionId}-saved-path-item`);
        
        if (savedPathEl && savedPathItem) {
            savedPathEl.textContent = path || `saved_${sectionId}_vectorstore`;
            savedPathItem.style.display = 'flex';
        }
    }
    
    updateAllStatuses() {
        const sections = ['general', 'company'];
        
        sections.forEach(section => {
            const btn = document.getElementById(`${section}-build-btn`);
            const hint = document.getElementById(`${section}-build-hint`);
            
            if (!btn || !hint) return;
            
            const hasFiles = this.files[section].length > 0;
            const hasModel = this.selectedModel !== null;
            const isProcessing = this.processing[section];
            
            let shouldDisable = true;
            let hintText = '';
            
            if (!hasModel) {
                shouldDisable = true;
                hintText = 'Select a model above to enable building';
            } else if (!hasFiles) {
                shouldDisable = true;
                hintText = 'Upload documents to enable building';
            } else if (isProcessing) {
                shouldDisable = true;
                hintText = 'Processing...';
            } else {
                shouldDisable = false;
                hintText = `Ready to build with ${this.selectedModel}`;
            }
            
            btn.disabled = shouldDisable;
            hint.textContent = hintText;
        });
        
        this.updateDocumentCounts();
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
        
        area.addEventListener('dragover', () => {
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
            if (e.target.classList.contains('upload-link') || e.target.closest('.upload-link')) {
                return;
            }
            const fileInput = document.getElementById(`${section}-file-input`);
            if (fileInput) {
                fileInput.click();
            }
        });
    }
    
    setupBrowseButtons() {
        // General Documents browse button
        const generalUploadArea = document.getElementById('general-upload-area');
        const generalFileInput = document.getElementById('general-file-input');
        
        if (generalUploadArea && generalFileInput) {
            const generalBrowseBtn = generalUploadArea.querySelector('.upload-link');
            if (generalBrowseBtn) {
                generalBrowseBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.debug.log('UI: General browse button clicked');
                    generalFileInput.click();
                });
            }
        }

        // Company Documents browse button  
        const companyUploadArea = document.getElementById('company-upload-area');
        const companyFileInput = document.getElementById('company-file-input');
        
        if (companyUploadArea && companyFileInput) {
            const companyBrowseBtn = companyUploadArea.querySelector('.upload-link');
            if (companyBrowseBtn) {
                companyBrowseBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.debug.log('UI: Company browse button clicked');
                    companyFileInput.click();
                });
            }
        }
    }
    
    handleFileSelection(files, section) {
        const validFiles = this.validateFiles(files, section);
        
        validFiles.forEach(file => {
            this.addDocument(file, section);
        });
        
        this.updateAllStatuses();
        this.renderDocuments();
        
        if (validFiles.length > 0) {
            this.showToast(`Successfully added ${validFiles.length} file${validFiles.length > 1 ? 's' : ''} to ${section} documents`, 'success');
            this.debug.log(`UI: Added ${validFiles.length} files to ${section}`, validFiles.map(f => f.name));
        }
    }
    
    validateFiles(files, section) {
        const validFiles = [];
        const maxFiles = section === 'general' ? 20 : 50;
        const currentCount = this.files[section].length;
        
        for (const file of files) {
            if (currentCount + validFiles.length >= maxFiles) {
                this.showToast(`Maximum ${maxFiles} files allowed for ${section} documents`, 'error');
                break;
            }
            
            if (file.size > this.maxFileSize) {
                this.showToast(`File "${file.name}" is too large. Maximum size is 10MB.`, 'error');
                continue;
            }
            
            if (!this.allowedTypes.includes(file.type) && !this.isValidFileExtension(file.name, section)) {
                this.showToast(`File "${file.name}" has an unsupported format.`, 'error');
                continue;
            }
            
            if (this.files[section].some(doc => doc.name === file.name)) {
                this.showToast(`File "${file.name}" already exists.`, 'error');
                continue;
            }
            
            validFiles.push(file);
        }
        
        return validFiles;
    }
    
    isValidFileExtension(filename, section) {
        const generalExtensions = ['.pdf', '.txt', '.docx', '.md'];
        const companyExtensions = ['.pdf', '.txt', '.docx', '.md', '.xlsx'];
        const allowedExtensions = section === 'general' ? generalExtensions : companyExtensions;
        
        const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        return allowedExtensions.includes(extension);
    }
    
    addDocument(file, section) {
        const document = {
            id: this.generateId(),
            name: file.name,
            size: file.size,
            type: file.type,
            section: section,
            uploadedAt: new Date().toISOString(),
            file: file // Store actual file for API calls
        };
        
        this.files[section].push(document);
    }
    
    updateDocumentCounts() {
        const generalCount = this.files.general.length;
        const companyCount = this.files.company.length;
        
        const generalCountEl = document.getElementById('general-count');
        const companyCountEl = document.getElementById('company-count');
        
        if (generalCountEl) {
            generalCountEl.textContent = `${generalCount} document${generalCount !== 1 ? 's' : ''}`;
        }
        if (companyCountEl) {
            companyCountEl.textContent = `${companyCount} document${companyCount !== 1 ? 's' : ''}`;
        }
    }
    
    renderDocuments() {
        this.renderDocumentSection('general');
        this.renderDocumentSection('company');
    }
    
    renderDocumentSection(section) {
        const container = document.getElementById(`${section}-documents`);
        if (!container) return;
        
        const documents = this.files[section];
        
        if (documents.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--space-16);">No documents uploaded yet</p>';
            return;
        }
        
        container.innerHTML = documents.map(doc => {
            const fileIcon = this.getFileIcon(doc.name);
            const fileSize = this.formatFileSize(doc.size);
            const uploadDate = new Date(doc.uploadedAt).toLocaleDateString();
            
            return `
                <div class="document-item fade-in">
                    <div class="document-info">
                        <div class="document-icon">${fileIcon}</div>
                        <div class="document-details">
                            <h4>${doc.name}</h4>
                            <p>${fileSize} • Uploaded ${uploadDate}</p>
                        </div>
                    </div>
                    <div class="document-actions">
                        <button class="delete-btn" data-doc-id="${doc.id}" data-section="${section}" title="Delete document">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const docId = btn.dataset.docId;
                const section = btn.dataset.section;
                this.deleteDocument(docId, section);
            });
        });
    }
    
    deleteDocument(documentId, section) {
        const document = this.files[section].find(doc => doc.id === documentId);
        if (!document) return;
        
        this.currentDeletion = { id: documentId, section: section, name: document.name };
        this.showModal('delete-modal');
    }
    
    confirmDelete() {
        if (!this.currentDeletion) return;
        
        const { id, section } = this.currentDeletion;
        this.files[section] = this.files[section].filter(doc => doc.id !== id);
        
        this.updateAllStatuses();
        this.renderDocuments();
        this.hideModal('delete-modal');
        
        this.showToast(`Document "${this.currentDeletion.name}" has been deleted.`, 'success');
        this.debug.log(`UI: Deleted document: ${this.currentDeletion.name} from ${section}`);
        this.currentDeletion = null;
    }
    
    switchTab(tabId) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        const activeLink = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(tabId);
        if (activeContent) {
            activeContent.classList.add('active');
        }
        
        this.debug.log(`UI: Switched to tab: ${tabId}`);
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
    
    showToast(message, type = 'info', duration = 5000) {
        const toastContainer = this.getToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${this.getToastIcon(type)}</span>
                <div class="toast-body">
                    <div class="toast-message">${message}</div>
                    <div class="toast-time">${new Date().toLocaleTimeString()}</div>
                </div>
                <button class="toast-close">&times;</button>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        // Auto-remove
        setTimeout(() => {
            this.removeToast(toast);
        }, duration);
        
        // Manual close
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.removeToast(toast);
        });
    }
    
    removeToast(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
    
    getToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }
    
    getToastIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }
    
    getFileIcon(filename) {
        const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        const iconMap = {
            '.pdf': '📄',
            '.txt': '📝',
            '.docx': '📘',
            '.md': '📋',
            '.xlsx': '📊'
        };
        return iconMap[extension] || '📄';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// Initialize the application
let uiManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        uiManager = new UIManager();
        await uiManager.init();
        window.uiManager = uiManager; // For debugging
    });
} else {
    (async () => {
        uiManager = new UIManager();
        await uiManager.init();
        window.uiManager = uiManager; // For debugging
    })();
}