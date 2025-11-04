/**
 * Workflow Manager for ControlTester 3000 Agentic AI Platform
 * Handles workflow-specific logic for Knowledge Base, Policy Training, and Evidence Analysis
 */

class WorkflowManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.activeWorkflow = null;
        this.workflowState = {
            knowledge: { files: [], status: 'idle' },
            policy: { files: [], status: 'idle' },
            evidence: { files: [], status: 'idle', analysisScope: '' }
        };
    }

    /**
     * Initialize workflow manager
     */
    init() {
        this.setupWorkflowHandlers();
        console.log('Workflow Manager initialized');
    }

    /**
     * Setup workflow-specific event handlers
     */
    setupWorkflowHandlers() {
        // Listen for chat messages that trigger workflows
        document.addEventListener('chatMessage', (event) => {
            this.handleChatWorkflowTrigger(event.detail);
        });
    }

    /**
     * Handle workflow triggers from chat messages
     */
    handleChatWorkflowTrigger(message) {
        const text = message.content.toLowerCase();
        
        if (text.includes('/knowledge') || text.includes('knowledge base')) {
            this.triggerKnowledgeWorkflow();
        } else if (text.includes('/policy') || text.includes('company policy')) {
            this.triggerPolicyWorkflow();
        } else if (text.includes('/evidence') || text.includes('evidence analysis')) {
            this.triggerEvidenceWorkflow();
        } else if (text.includes('/audit') || text.includes('audit workbook')) {
            this.triggerAuditWorkflow();
        }
    }

    /**
     * Trigger Knowledge Base Training workflow
     */
    async triggerKnowledgeWorkflow() {
        this.activeWorkflow = 'knowledge';
        
        const workflowCard = this.createKnowledgeWorkflowCard();
        this.uiManager.addChatMessage('assistant', '', workflowCard);
    }

    /**
     * Trigger Policy Training workflow
     */
    async triggerPolicyWorkflow() {
        this.activeWorkflow = 'policy';
        
        const workflowCard = this.createPolicyWorkflowCard();
        this.uiManager.addChatMessage('assistant', '', workflowCard);
    }

    /**
     * Trigger Evidence Analysis workflow
     */
    async triggerEvidenceWorkflow() {
        this.activeWorkflow = 'evidence';
        
        const workflowCard = this.createEvidenceWorkflowCard();
        this.uiManager.addChatMessage('assistant', '', workflowCard);
    }

    /**
     * Trigger Audit Workbook workflow
     */
    async triggerAuditWorkflow() {
        // Audit is part of evidence analysis
        await this.triggerEvidenceWorkflow();
    }

    /**
     * Create Knowledge Base Training workflow card
     */
    createKnowledgeWorkflowCard() {
        const cardHtml = `
            <div class="workflow-card knowledge-base">
                <div class="workflow-header">
                    <div class="workflow-icon">🎓</div>
                    <div class="workflow-title">Knowledge Base Training</div>
                    <div class="workflow-status status-active">Active</div>
                </div>
                
                <div class="document-category-selector">
                    <div class="category-option selected" data-category="knowledge">
                        <span class="category-icon">📚</span>
                        <div class="category-name">Knowledge Base</div>
                        <div class="category-desc">General documents, manuals, guides</div>
                    </div>
                    <div class="category-option" data-category="policy">
                        <span class="category-icon">🏢</span>
                        <div class="category-name">Company Policy</div>
                        <div class="category-desc">Policies, procedures, standards</div>
                    </div>
                    <div class="category-option" data-category="evidence">
                        <span class="category-icon">🔍</span>
                        <div class="category-name">Evidence</div>
                        <div class="category-desc">Logs, audit trails, evidence</div>
                    </div>
                </div>
                
                <div class="upload-area" data-workflow="knowledge">
                    <div class="upload-icon">📁</div>
                    <div class="upload-text">Drag & drop knowledge base documents here</div>
                    <div class="upload-hint">or click to browse</div>
                    <div class="supported-formats">
                        <span class="format-tag">PDF</span>
                        <span class="format-tag">DOCX</span>
                        <span class="format-tag">TXT</span>
                        <span class="format-tag">MD</span>
                        <span class="format-tag">XLSX</span>
                    </div>
                </div>
                
                <div class="file-list" id="knowledge-file-list" style="display: none;"></div>
                
                <div class="action-buttons">
                    <button class="btn btn-primary" data-action="start-training" data-workflow="knowledge">
                        Start Training
                    </button>
                    <button class="btn btn-secondary" data-action="configure" data-workflow="knowledge">
                        Configure Settings
                    </button>
                </div>
            </div>
        `;
        
        return this.createWorkflowCardElement(cardHtml);
    }

    /**
     * Create Policy Training workflow card
     */
    createPolicyWorkflowCard() {
        const cardHtml = `
            <div class="workflow-card company-policy">
                <div class="workflow-header">
                    <div class="workflow-icon">🏢</div>
                    <div class="workflow-title">Company Policy Training</div>
                    <div class="workflow-status status-active">Active</div>
                </div>
                
                <div class="upload-area" data-workflow="policy">
                    <div class="upload-icon">🏢</div>
                    <div class="upload-text">Drag & drop company policy documents here</div>
                    <div class="upload-hint">or click to browse</div>
                    <div class="supported-formats">
                        <span class="format-tag">PDF</span>
                        <span class="format-tag">DOCX</span>
                        <span class="format-tag">TXT</span>
                        <span class="format-tag">MD</span>
                        <span class="format-tag">XLSX</span>
                    </div>
                </div>
                
                <div class="file-list" id="policy-file-list" style="display: none;"></div>
                
                <div class="action-buttons">
                    <button class="btn btn-primary" data-action="start-training" data-workflow="policy">
                        Start Policy Training
                    </button>
                    <button class="btn btn-secondary" data-action="configure" data-workflow="policy">
                        Configure Settings
                    </button>
                </div>
            </div>
        `;
        
        return this.createWorkflowCardElement(cardHtml);
    }

    /**
     * Create Evidence Analysis workflow card
     */
    createEvidenceWorkflowCard() {
        const cardHtml = `
            <div class="workflow-card evidence-analysis">
                <div class="workflow-header">
                    <div class="workflow-icon">⚖️</div>
                    <div class="workflow-title">Evidence Analysis & Audit Workbook</div>
                    <div class="workflow-status status-active">Active</div>
                </div>
                
                <div class="evidence-form">
                    <div class="form-group">
                        <label class="form-label">Evidence Type</label>
                        <select class="form-input" id="evidence-type">
                            <option value="database">Database Access Logs</option>
                            <option value="password">Password Audit Logs</option>
                            <option value="system">System Security Logs</option>
                            <option value="authentication">Authentication Logs</option>
                            <option value="mixed">Mixed Evidence</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Analysis Scope</label>
                        <textarea class="form-textarea" id="analysis-scope" 
                                  placeholder="Describe what compliance aspects to focus on (e.g., unauthorized access, password policy violations, suspicious activities)">
                        </textarea>
                    </div>
                </div>
                
                <div class="upload-area" data-workflow="evidence">
                    <div class="upload-icon">🔍</div>
                    <div class="upload-text">Upload evidence files (logs, databases, audit trails)</div>
                    <div class="upload-hint">Multiple file types supported for comprehensive analysis</div>
                    <div class="supported-formats">
                        <span class="format-tag">LOG</span>
                        <span class="format-tag">CSV</span>
                        <span class="format-tag">JSON</span>
                        <span class="format-tag">XML</span>
                        <span class="format-tag">TXT</span>
                        <span class="format-tag">XLSX</span>
                    </div>
                </div>
                
                <div class="file-list" id="evidence-file-list" style="display: none;"></div>
                
                <div class="action-buttons">
                    <button class="btn btn-primary" data-action="generate-audit" data-workflow="evidence">
                        Generate Audit Workbook
                    </button>
                    <button class="btn btn-secondary" data-action="advanced-analysis" data-workflow="evidence">
                        Advanced Analysis
                    </button>
                </div>
            </div>
        `;
        
        return this.createWorkflowCardElement(cardHtml);
    }

    /**
     * Create workflow card DOM element with event listeners
     */
    createWorkflowCardElement(htmlString) {
        const container = document.createElement('div');
        container.innerHTML = htmlString;
        const card = container.firstElementChild;
        
        // Setup event listeners for the workflow card
        this.setupWorkflowCardListeners(card);
        
        return card;
    }

    /**
     * Setup event listeners for workflow cards
     */
    setupWorkflowCardListeners(card) {
        // Upload area click handlers
        const uploadArea = card.querySelector('.upload-area');
        if (uploadArea) {
            uploadArea.addEventListener('click', () => {
                this.triggerFileUploadForWorkflow(uploadArea.dataset.workflow);
            });
            
            // Drag and drop handlers
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('drag-over');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('drag-over');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                const files = Array.from(e.dataTransfer.files || []);
                if (files.length > 0) {
                    this.handleWorkflowFileUpload(uploadArea.dataset.workflow, files);
                }
            });
        }
        
        // Category selection handlers
        const categoryOptions = card.querySelectorAll('.category-option');
        categoryOptions.forEach(option => {
            option.addEventListener('click', () => {
                categoryOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                const category = option.dataset.category;
                this.updateUploadAreaForCategory(card, category);
            });
        });
        
        // Action button handlers
        const actionButtons = card.querySelectorAll('.btn[data-action]');
        actionButtons.forEach(button => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                const workflow = button.dataset.workflow;
                this.handleWorkflowAction(workflow, action, card);
            });
        });
    }

    /**
     * Update upload area based on selected category
     */
    updateUploadAreaForCategory(card, category) {
        const uploadArea = card.querySelector('.upload-area');
        const uploadIcon = uploadArea.querySelector('.upload-icon');
        const uploadText = uploadArea.querySelector('.upload-text');
        
        const categoryData = {
            knowledge: {
                icon: '📚',
                text: 'Drag & drop knowledge base documents here'
            },
            policy: {
                icon: '🏢',
                text: 'Drag & drop company policy documents here'
            },
            evidence: {
                icon: '🔍',
                text: 'Drag & drop evidence files (logs, databases) here'
            }
        };
        
        const data = categoryData[category];
        if (data) {
            uploadIcon.textContent = data.icon;
            uploadText.textContent = data.text;
            uploadArea.dataset.workflow = category;
        }
    }

    /**
     * Trigger file upload for specific workflow
     */
    triggerFileUploadForWorkflow(workflowType) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        
        // Set accept types based on workflow
        switch (workflowType) {
            case 'knowledge':
            case 'policy':
                fileInput.accept = '.pdf,.docx,.txt,.md,.xlsx';
                break;
            case 'evidence':
                fileInput.accept = '.log,.csv,.json,.xml,.txt,.xlsx,.pdf';
                break;
            default:
                fileInput.accept = '.pdf,.docx,.txt,.xlsx,.log,.csv,.json,.xml,.md';
        }
        
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
                this.handleWorkflowFileUpload(workflowType, files);
            }
        });
        
        fileInput.click();
    }

    /**
     * Handle file upload for workflow
     */
    async handleWorkflowFileUpload(workflowType, files) {
        if (!this.uiManager.selectedModel) {
            this.uiManager.showToast('Please select a model before uploading files.', 'warning');
            return;
        }
        
        try {
            // Add files to workflow state
            this.workflowState[workflowType].files.push(...files);
            
            // Update file list display
            this.updateFileListDisplay(workflowType, files);
            
            this.uiManager.showToast(`Added ${files.length} file(s) to ${workflowType} workflow`, 'success');
            
        } catch (error) {
            console.error('Workflow file upload error:', error);
            this.uiManager.showToast(`File upload failed: ${error.message}`, 'error');
        }
    }

    /**
     * Update file list display in workflow card
     */
    updateFileListDisplay(workflowType, newFiles) {
        const fileListId = `${workflowType}-file-list`;
        const fileList = document.getElementById(fileListId);
        
        if (!fileList) return;
        
        const allFiles = this.workflowState[workflowType].files;
        
        if (allFiles.length === 0) {
            fileList.style.display = 'none';
            return;
        }
        
        fileList.style.display = 'block';
        fileList.innerHTML = '';
        
        allFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-icon">${this.getFileEmoji(file.name)}</div>
                <div class="file-info">
                    <div class="file-name">${this.escapeHtml(file.name)}</div>
                    <div class="file-size">${this.formatFileSize(file.size)}</div>
                </div>
                <div class="file-status status-complete">Ready</div>
            `;
            fileList.appendChild(fileItem);
        });
    }

    /**
     * Handle workflow actions (buttons)
     */
    async handleWorkflowAction(workflowType, action, card) {
        switch (action) {
            case 'start-training':
                await this.startTraining(workflowType, card);
                break;
            case 'generate-audit':
                await this.generateAuditWorkbook(workflowType, card);
                break;
            case 'configure':
                this.showWorkflowConfiguration(workflowType);
                break;
            case 'advanced-analysis':
                this.showAdvancedAnalysis(workflowType);
                break;
            default:
                console.warn('Unknown workflow action:', action);
        }
    }

    /**
     * Start training workflow
     */
    async startTraining(workflowType, card) {
        const files = this.workflowState[workflowType].files;
        
        if (!files.length) {
            this.uiManager.showToast('Please upload files before starting training.', 'warning');
            return;
        }
        
        if (!this.uiManager.selectedModel) {
            this.uiManager.showToast('Please select a model before starting training.', 'warning');
            return;
        }
        
        try {
            // Update button state
            const button = card.querySelector('[data-action="start-training"]');
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'Training...';
            
            // Update workflow status
            const status = card.querySelector('.workflow-status');
            status.className = 'workflow-status status-processing';
            status.textContent = 'Processing';
            
            // Determine KB type
            const kbType = workflowType === 'knowledge' ? 'global' : 'company';
            const saveDir = workflowType === 'knowledge' ? 'saved_global_vectorstore' : 'saved_company_vectorstore';
            
            // Build knowledge base
            const buildResult = await DocumentAPI.buildKnowledgeBase(files, kbType, this.uiManager.selectedModel);
            
            // Save vectorstore
            await DocumentAPI.saveVectorstore(kbType, saveDir);
            
            // Update UI with success
            status.className = 'workflow-status status-active';
            status.textContent = 'Completed';
            
            // Add completion message
            this.uiManager.addChatMessage('assistant', 
                `✅ ${workflowType} training completed successfully! ` +
                `Processed ${files.length} files and created ${buildResult.vector_count || 0} vectors.`
            );
            
            // Clear workflow files
            this.workflowState[workflowType].files = [];
            
        } catch (error) {
            console.error('Training failed:', error);
            
            // Update UI with error
            const status = card.querySelector('.workflow-status');
            status.className = 'workflow-status status-error';
            status.textContent = 'Failed'; 
            
            this.uiManager.showToast(`Training failed: ${error.message}`, 'error');
            
        } finally {
            // Reset button
            const button = card.querySelector('[data-action="start-training"]');
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    /**
     * Generate audit workbook
     */
    async generateAuditWorkbook(workflowType, card) {
        const files = this.workflowState[workflowType].files;
        
        if (!files.length) {
            this.uiManager.showToast('Please upload evidence files before generating audit workbook.', 'warning');
            return;
        }
        
        if (!this.uiManager.selectedModel) {
            this.uiManager.showToast('Please select a model before generating audit workbook.', 'warning');
            return;
        }
        
        try {
            // Update button state
            const button = card.querySelector('[data-action="generate-audit"]');
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'Generating...';
            
            // Update workflow status
            const status = card.querySelector('.workflow-status');
            status.className = 'workflow-status status-processing';
            status.textContent = 'Analyzing';
            
            // Get analysis scope if provided
            const scopeTextarea = card.querySelector('#analysis-scope');
            const analysisScope = scopeTextarea ? scopeTextarea.value.trim() : '';
            
            // Run assessment
            const assessmentResult = await DocumentAPI.runAssessment(files, this.uiManager.selectedModel, 4);
            
            // Update UI with success
            status.className = 'workflow-status status-active';
            status.textContent = 'Completed';
            
            // Add completion message with download link
            let completionMessage = `✅ Evidence analysis completed successfully! ` +
                `Analyzed ${files.length} files and generated comprehensive audit workbook.`;
            
            if (assessmentResult.workbook_path) {
                completionMessage += ` <br><br>
                    <button class="btn btn-primary" onclick="DocumentAPI.downloadReport('${assessmentResult.workbook_path}')">
                        📥 Download Audit Workbook
                    </button>`;
            }
            
            this.uiManager.addChatMessage('assistant', completionMessage);
            
            // Clear workflow files
            this.workflowState[workflowType].files = [];
            
        } catch (error) {
            console.error('Audit generation failed:', error);
            
            // Update UI with error
            const status = card.querySelector('.workflow-status');
            status.className = 'workflow-status status-error';
            status.textContent = 'Failed';
            
            this.uiManager.showToast(`Audit generation failed: ${error.message}`, 'error');
            
        } finally {
            // Reset button
            const button = card.querySelector('[data-action="generate-audit"]');
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    /**
     * Show workflow configuration options
     */
    showWorkflowConfiguration(workflowType) {
        this.uiManager.showToast('Workflow configuration coming soon!', 'info');
    }

    /**
     * Show advanced analysis options
     */
    showAdvancedAnalysis(workflowType) {
        this.uiManager.showToast('Advanced analysis options coming soon!', 'info');
    }

    /**
     * Get emoji for file type
     */
    getFileEmoji(filename) {
        const ext = filename.split('.').pop()?.toLowerCase();
        const emojiMap = {
            'pdf': '📄',
            'doc': '📄',
            'docx': '📃',
            'txt': '📝',
            'md': '🗒️',
            'csv': '🧾',
            'xlsx': '📊',
            'log': '📃',
            'json': '📜',
            'xml': '📜'
        };
        return emojiMap[ext] || '📁';
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Escape HTML characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get current workflow state
     */
    getWorkflowState() {
        return {
            activeWorkflow: this.activeWorkflow,
            workflowState: this.workflowState
        };
    }

    /**
     * Reset workflow state
     */
    resetWorkflow(workflowType) {
        if (this.workflowState[workflowType]) {
            this.workflowState[workflowType].files = [];
            this.workflowState[workflowType].status = 'idle';
            
            if (workflowType === 'evidence') {
                this.workflowState[workflowType].analysisScope = '';
            }
        }
    }

    /**
     * Reset all workflows
     */
    resetAllWorkflows() {
        Object.keys(this.workflowState).forEach(workflow => {
            this.resetWorkflow(workflow);
        });
        this.activeWorkflow = null;
    }
}

// Export for use in other modules
window.WorkflowManager = WorkflowManager;