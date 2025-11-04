/**
 * UI Manager for ControlTester 3000 Agentic AI Platform
 * Handles all UI interactions, state management, and user interface updates
 */

class UIManager {
    constructor() {
        this.selectedModel = null;
        this.chatHistory = [];
        this.currentFiles = [];
        this.chatAttachments = [];
        this.isTyping = false;
    }

    /**
     * Initialize the UI Manager
     */
    async init() {
        await this.initializeSidebar();
        await this.initializeModelSelector();
        await this.initializeChatInput();
        await this.initializeFileHandling();
        await this.loadAvailableModels();
        await this.checkAPIHealth();
        await this.loadExistingVectorstores();
        
        this.restoreSessionData();
        this.setupEventListeners();
        
        console.log('UI Manager initialized successfully');
    }

    /**
     * Initialize sidebar functionality
     */
    initializeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebarToggle');
        
        if (!sidebar || !toggleBtn) {
            console.warn('Sidebar elements not found');
            return;
        }

        // Load saved sidebar state
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
        }

        // Toggle sidebar on button click
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const collapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', collapsed);
        });

        // Agent selection
        const agentItems = document.querySelectorAll('.agent-item');
        agentItems.forEach(item => {
            item.addEventListener('click', () => {
                // Remove active from all agents
                agentItems.forEach(agent => agent.classList.remove('active'));
                // Add active to clicked agent
                item.classList.add('active');
                
                const agentType = item.getAttribute('data-agent');
                this.handleAgentSelection(agentType);
            });
        });
    }

    /**
     * Initialize model selector dropdown
     */
    initializeModelSelector() {
        const dropdownBtn = document.getElementById('modelDropdownBtn');
        const dropdown = document.getElementById('modelDropdown');
        const overlay = document.getElementById('modalOverlay');
        
        if (!dropdownBtn || !dropdown || !overlay) {
            console.warn('Model selector elements not found');
            return;
        }

        // Toggle dropdown
        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleModelDropdown();
        });

        // Close dropdown when clicking overlay
        overlay.addEventListener('click', () => {
            this.closeModelDropdown();
        });

        // Model option selection
        const modelOptions = dropdown.querySelectorAll('.model-option');
        modelOptions.forEach(option => {
            option.addEventListener('click', () => {
                const modelName = option.getAttribute('data-model');
                const modelIcon = option.getAttribute('data-icon');
                const modelSize = option.getAttribute('data-size');
                
                this.selectModel(modelName, modelIcon, modelSize);
            });
        });

        // Close dropdown on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModelDropdown();
            }
        });
    }

    /**
     * Initialize chat input functionality
     */
    initializeChatInput() {
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const attachBtn = document.getElementById('attachBtn');
        const voiceBtn = document.getElementById('voiceBtn');
        
        if (!chatInput || !sendBtn) {
            console.warn('Chat input elements not found');
            return;
        }

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            this.autoResizeTextarea(chatInput);
            this.updateSendButtonState();
        });

        // Send message on Enter (without Shift)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Send button click
        sendBtn.addEventListener('click', () => {
            this.sendMessage();
        });

        // Attach file button
        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                this.triggerFileUpload();
            });
        }

        // Voice input button (placeholder)
        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => {
                this.showToast('Voice input coming soon!', 'info');
            });
        }

        // Quick action buttons
        const quickActions = document.querySelectorAll('.quick-action');
        quickActions.forEach(action => {
            action.addEventListener('click', () => {
                const command = action.getAttribute('data-command');
                this.insertQuickCommand(command);
            });
        });

        // Initialize textarea height
        this.autoResizeTextarea(chatInput);
        this.updateSendButtonState();
    }

    /**
     * Initialize file handling
     */
    initializeFileHandling() {
        const fileInput = document.getElementById('fileInput');
        
        if (!fileInput) {
            console.warn('File input element not found');
            return;
        }

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
                this.handleFileSelection(files);
            }
            // Reset input for next selection
            fileInput.value = '';
        });

        // Drag and drop for chat messages area
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.addEventListener('dragover', (e) => {
                e.preventDefault();
                chatMessages.classList.add('drag-over');
            });

            chatMessages.addEventListener('dragleave', () => {
                chatMessages.classList.remove('drag-over');
            });

            chatMessages.addEventListener('drop', (e) => {
                e.preventDefault();
                chatMessages.classList.remove('drag-over');
                
                const files = Array.from(e.dataTransfer.files || []);
                if (files.length > 0) {
                    this.handleFileSelection(files);
                }
            });
        }
    }

    /**
     * Load available models from API
     */
    async loadAvailableModels() {
        try {
            const models = await DocumentAPI.getModels();
            this.updateModelDropdown(models);
        } catch (error) {
            console.error('Failed to load models:', error);
            this.showToast('Failed to load models. Using fallbacks.', 'warning');
        }
    }

    /**
     * Check API health status
     */
    async checkAPIHealth() {
        try {
            const isHealthy = await DocumentAPI.checkHealth();
            this.updateAPIStatus(isHealthy);
        } catch (error) {
            console.error('API health check failed:', error);
            this.updateAPIStatus(false);
        }
    }

    /**
     * Load existing vectorstores
     */
    async loadExistingVectorstores() {
        try {
            const vectorstores = await DocumentAPI.checkExistingVectorstores(this.selectedModel);
            this.updateVectorstoreStatus(vectorstores);
        } catch (error) {
            console.error('Failed to load existing vectorstores:', error);
        }
    }

    /**
     * Setup additional event listeners
     */
    setupEventListeners() {
        // Window resize handler
        window.addEventListener('resize', () => {
            this.handleWindowResize();
        });

        // Page visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refreshConnectionStatus();
            }
        });
    }

    /**
     * Restore session data
     */
    restoreSessionData() {
        // Restore selected model
        const savedModel = sessionStorage.getItem('selectedModel');
        const savedModelIcon = sessionStorage.getItem('selectedModelIcon');
        const savedModelSize = sessionStorage.getItem('selectedModelSize');
        
        if (savedModel) {
            this.selectedModel = savedModel;
            this.updateSelectedModelDisplay(savedModel, savedModelIcon, savedModelSize);
        }

        // Restore chat history (if any)
        try {
            const savedHistory = localStorage.getItem('chatHistory');
            if (savedHistory) {
                this.chatHistory = JSON.parse(savedHistory);
                this.renderChatHistory();
            }
        } catch (error) {
            console.warn('Failed to restore chat history:', error);
        }
    }

    /**
     * Toggle model dropdown
     */
    toggleModelDropdown() {
        const dropdownBtn = document.getElementById('modelDropdownBtn');
        const dropdown = document.getElementById('modelDropdown');
        const overlay = document.getElementById('modalOverlay');
        
        const isOpen = dropdown.classList.contains('show');
        
        if (isOpen) {
            this.closeModelDropdown();
        } else {
            dropdown.classList.add('show');
            dropdownBtn.classList.add('active');
            overlay.classList.add('show');
        }
    }

    /**
     * Close model dropdown
     */
    closeModelDropdown() {
        const dropdownBtn = document.getElementById('modelDropdownBtn');
        const dropdown = document.getElementById('modelDropdown');
        const overlay = document.getElementById('modalOverlay');
        
        dropdown.classList.remove('show');
        dropdownBtn.classList.remove('active');
        overlay.classList.remove('show');
    }

    /**
     * Select a model
     */
    selectModel(modelName, modelIcon, modelSize) {
        this.selectedModel = modelName;
        
        // Save to session storage
        sessionStorage.setItem('selectedModel', modelName);
        sessionStorage.setItem('selectedModelIcon', modelIcon);
        sessionStorage.setItem('selectedModelSize', modelSize);
        
        // Update UI
        this.updateSelectedModelDisplay(modelName, modelIcon, modelSize);
        this.updateModelDropdownSelection(modelName);
        this.updateSendButtonState();
        
        // Close dropdown
        this.closeModelDropdown();
        
        this.showToast(`Model selected: ${modelName}`, 'success');
    }

    /**
     * Update selected model display
     */
    updateSelectedModelDisplay(modelName, modelIcon, modelSize) {
        const modelNameEl = document.getElementById('selectedModelName');
        const modelIconEl = document.querySelector('.model-icon');
        
        if (modelNameEl) {
            modelNameEl.textContent = modelName || 'Select Model';
        }
        
        if (modelIconEl && modelIcon) {
            modelIconEl.textContent = modelIcon;
        }
    }

    /**
     * Update model dropdown selection state
     */
    updateModelDropdownSelection(selectedModel) {
        const modelOptions = document.querySelectorAll('.model-option');
        modelOptions.forEach(option => {
            const modelName = option.getAttribute('data-model');
            if (modelName === selectedModel) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    /**
     * Update model dropdown with available models
     */
    updateModelDropdown(models) {
        const dropdown = document.getElementById('modelDropdown');
        if (!dropdown || !models.length) return;
        
        // Keep the header
        const header = dropdown.querySelector('.dropdown-header');
        dropdown.innerHTML = '';
        if (header) dropdown.appendChild(header);
        
        // Add model options
        models.forEach(model => {
            const option = document.createElement('button');
            option.className = 'model-option';
            option.setAttribute('data-model', model);
            option.setAttribute('data-icon', '🤖');
            option.setAttribute('data-size', 'Unknown');
            
            option.innerHTML = `
                <span class="model-option-icon">🤖</span>
                <div class="model-option-info">
                    <div class="model-option-name">${model}</div>
                    <div class="model-status">Available</div>
                </div>
                <span class="model-size">-</span>
            `;
            
            option.addEventListener('click', () => {
                this.selectModel(model, '🤖', 'Unknown');
            });
            
            dropdown.appendChild(option);
        });
    }

    /**
     * Auto-resize textarea based on content
     */
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        const newHeight = Math.min(Math.max(textarea.scrollHeight, 80), 200);
        textarea.style.height = newHeight + 'px';
    }

    /**
     * Update send button state based on input and model selection
     */
    updateSendButtonState() {
        const sendBtn = document.getElementById('sendBtn');
        const chatInput = document.getElementById('chatInput');
        
        if (sendBtn && chatInput) {
            const hasText = chatInput.value.trim().length > 0;
            const hasModel = this.selectedModel !== null;
            sendBtn.disabled = !hasText || !hasModel || this.isTyping;
        }
    }

    /**
     * Insert quick command into chat input
     */
    insertQuickCommand(command) {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = command + ' ';
            chatInput.focus();
            this.autoResizeTextarea(chatInput);
            this.updateSendButtonState();
        }
    }

    /**
     * Trigger file upload dialog
     */
    triggerFileUpload() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Handle file selection
     */
    async handleFileSelection(files) {
        if (!this.selectedModel) {
            this.showToast('Please select a model before uploading files.', 'warning');
            return;
        }

        try {
            this.showToast(`Uploading ${files.length} file(s)...`, 'info');
            
            // Upload files as chat attachments
            const result = await DocumentAPI.uploadChatAttachment(files, this.selectedModel);
            
            this.chatAttachments = files;
            this.showAttachmentIndicator(files.length);
            
            this.showToast(`Successfully uploaded ${files.length} file(s)`, 'success');
            
            // Add a message to chat showing uploaded files
            const fileNames = files.map(f => f.name).join(', ');
            this.addChatMessage('system', `📎 Uploaded ${files.length} file(s): ${fileNames}`);
            
        } catch (error) {
            console.error('File upload failed:', error);
            this.showToast(`File upload failed: ${error.message}`, 'error');
        }
    }

    /**
     * Show attachment indicator
     */
    showAttachmentIndicator(count) {
        // This could be implemented to show a badge or indicator
        // For now, we'll just update the attach button title
        const attachBtn = document.getElementById('attachBtn');
        if (attachBtn) {
            attachBtn.title = `${count} file(s) attached`;
            attachBtn.style.background = 'var(--color-success)';
            attachBtn.style.color = 'white';
        }
    }

    /**
     * Clear attachment indicator
     */
    clearAttachmentIndicator() {
        const attachBtn = document.getElementById('attachBtn');
        if (attachBtn) {
            attachBtn.title = 'Attach file';
            attachBtn.style.background = '';
            attachBtn.style.color = '';
        }
    }

    /**
     * Send chat message
     */
    async sendMessage() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;
        
        const message = chatInput.value.trim();
        if (!message) return;
        
        if (!this.selectedModel) {
            this.showToast('Please select a model before sending a message.', 'warning');
            return;
        }

        // Clear input and update UI state
        chatInput.value = '';
        this.autoResizeTextarea(chatInput);
        this.isTyping = true;
        this.updateSendButtonState();
        
        // Add user message to chat
        this.addChatMessage('user', message);
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Send message to API
            const response = await DocumentAPI.chat(message);
            
            // Remove typing indicator
            this.hideTypingIndicator();
            
            // Add assistant response
            this.addChatMessage('assistant', response.response || 'No response received.');
            
            // Clear attachments after successful send
            if (this.chatAttachments.length > 0) {
                DocumentAPI.clearChatAttachments();
                this.chatAttachments = [];
                this.clearAttachmentIndicator();
            }
            
        } catch (error) {
            console.error('Chat error:', error);
            this.hideTypingIndicator();
            this.addChatMessage('assistant', `⚠️ Error: ${error.message}`);
        } finally {
            this.isTyping = false;
            this.updateSendButtonState();
            chatInput.focus();
        }
    }

    /**
     * Add message to chat
     */
    addChatMessage(role, content) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        // Remove welcome message if present
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        if (welcomeMessage && role !== 'system') {
            welcomeMessage.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const avatar = role === 'user' ? '👤' : (role === 'system' ? '🔔' : '🤖');
        const avatarClass = role === 'user' ? 'avatar-user' : 'avatar-assistant';
        
        const timestamp = new Date().toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });
        
        const processedContent = role === 'assistant' ? this.processMarkdown(content) : this.escapeHtml(content);
        
        messageDiv.innerHTML = `
            <div class="message-avatar ${avatarClass}">${avatar}</div>
            <div class="message-content">
                <div class="message-text">${processedContent}</div>
                <div class="message-time">${timestamp}</div>
            </div>
        `;
        
        chatMessages.appendChild(messageDiv);
        
        // Enhanced code blocks for assistant messages
        if (role === 'assistant') {
            this.enhanceCodeBlocks(messageDiv);
        }
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Save to history
        this.chatHistory.push({ role, content, timestamp });
        this.saveChatHistory();
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typingIndicator';
        typingDiv.innerHTML = `
            🤖 Assistant is thinking...
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    /**
     * Process markdown for assistant messages
     */
    processMarkdown(text) {
        try {
            if (window.marked) {
                if (typeof window.marked.setOptions === 'function') {
                    window.marked.setOptions({
                        gfm: true,
                        breaks: true,
                        headerIds: false,
                        mangle: false
                    });
                }
                
                const rawHtml = typeof window.marked.parse === 'function' 
                    ? window.marked.parse(text)
                    : window.marked(text);
                
                const cleanHtml = window.DOMPurify 
                    ? window.DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } })
                    : rawHtml;
                
                return cleanHtml;
            }
        } catch (error) {
            console.warn('Markdown processing failed:', error);
        }
        
        // Fallback: simple text processing
        return this.escapeHtml(text).replace(/\n/g, '<br>');
    }

    /**
     * Enhance code blocks with syntax highlighting and copy buttons
     */
    enhanceCodeBlocks(messageElement) {
        try {
            // Syntax highlighting
            if (window.hljs) {
                messageElement.querySelectorAll('pre code').forEach(block => {
                    try {
                        window.hljs.highlightElement(block);
                    } catch (error) {
                        console.warn('Syntax highlighting failed:', error);
                    }
                });
            }
            
            // Add copy buttons to code blocks
            messageElement.querySelectorAll('pre > code').forEach(codeEl => {
                if (codeEl.closest('.code-block')) return; // Already processed
                
                const preEl = codeEl.parentElement;
                if (!preEl) return;
                
                // Create wrapper
                const wrapper = document.createElement('div');
                wrapper.className = 'code-block';
                
                // Create header with copy button
                const header = document.createElement('div');
                header.className = 'code-header';
                
                const lang = this.detectLanguage(codeEl.className);
                const langSpan = document.createElement('span');
                langSpan.className = 'code-lang';
                langSpan.textContent = lang;
                
                const copyBtn = document.createElement('button');
                copyBtn.className = 'code-copy';
                copyBtn.textContent = 'Copy';
                copyBtn.addEventListener('click', () => this.copyCodeToClipboard(codeEl, copyBtn));
                
                header.appendChild(langSpan);
                header.appendChild(copyBtn);
                
                // Wrap the pre element
                preEl.replaceWith(wrapper);
                wrapper.appendChild(header);
                wrapper.appendChild(preEl);
            });
        } catch (error) {
            console.warn('Code block enhancement failed:', error);
        }
    }

    /**
     * Detect programming language from className
     */
    detectLanguage(className) {
        const match = className.match(/(?:language|lang)-([a-z0-9_+-]+)/i);
        return match ? match[1].toLowerCase() : 'text';
    }

    /**
     * Copy code to clipboard
     */
    async copyCodeToClipboard(codeElement, button) {
        try {
            await navigator.clipboard.writeText(codeElement.textContent);
            button.textContent = 'Copied!';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = 'Copy';
                button.classList.remove('copied');
            }, 2000);
        } catch (error) {
            console.warn('Copy to clipboard failed:', error);
            button.textContent = 'Failed';
            setTimeout(() => {
                button.textContent = 'Copy';
            }, 2000);
        }
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
     * Handle agent selection
     */
    handleAgentSelection(agentType) {
        console.log(`Selected agent: ${agentType}`);
        
        // Update chat title
        const chatTitle = document.querySelector('.chat-title');
        if (chatTitle) {
            const agentNames = {
                'chat': 'Chat Agent',
                'knowledge': 'Knowledge Training Agent',
                'policy': 'Policy Training Agent',
                'evidence': 'Evidence Analysis Agent'
            };
            chatTitle.textContent = agentNames[agentType] || 'Chat Agent';
        }
        
        // Could trigger different workflows based on agent type
        // For now, all agents use the same chat interface
    }

    /**
     * Update API status indicator
     */
    updateAPIStatus(isHealthy) {
        // Implementation would update any API status indicators
        console.log(`API Status: ${isHealthy ? 'Healthy' : 'Offline'}`);
    }

    /**
     * Update vectorstore status
     */
    updateVectorstoreStatus(vectorstores) {
        console.log('Vectorstore status:', vectorstores);
        // Implementation would update any vectorstore status indicators
    }

    /**
     * Handle window resize
     */
    handleWindowResize() {
        // Handle any responsive adjustments
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            this.autoResizeTextarea(chatInput);
        }
    }

    /**
     * Refresh connection status
     */
    async refreshConnectionStatus() {
        await this.checkAPIHealth();
    }

    /**
     * Render chat history
     */
    renderChatHistory() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages || !this.chatHistory.length) return;
        
        // Clear existing messages except welcome
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        chatMessages.innerHTML = '';
        if (welcomeMessage) {
            chatMessages.appendChild(welcomeMessage);
        }
        
        // Render history
        this.chatHistory.forEach(msg => {
            this.addChatMessage(msg.role, msg.content);
        });
    }

    /**
     * Save chat history to localStorage
     */
    saveChatHistory() {
        try {
            // Keep only last 50 messages to avoid storage issues
            const recentHistory = this.chatHistory.slice(-50);
            localStorage.setItem('chatHistory', JSON.stringify(recentHistory));
        } catch (error) {
            console.warn('Failed to save chat history:', error);
        }
    }

    /**
     * Clear chat history
     */
    clearChatHistory() {
        this.chatHistory = [];
        localStorage.removeItem('chatHistory');
        
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="message welcome-message">
                    <div class="message-avatar avatar-assistant">🤖</div>
                    <div class="message-content">
                        <div class="message-text">
                            Welcome to ControlTester 3000! I can help you with three main workflows:
                            <br><br>
                            <strong>📚 Knowledge Base Training:</strong> Upload general documents to build a comprehensive knowledge base
                            <br>
                            <strong>🏢 Company Policy Training:</strong> Upload company-specific policies for specialized training
                            <br>
                            <strong>⚖️ Evidence Analysis:</strong> Upload password logs, database logs, or other evidence for audit workbook generation
                            <br><br>
                            What would you like to start with? You can also toggle the sidebar using the ≡ button for more space.
                        </div>
                        <div class="message-time">Just now</div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        console.log(`Toast (${type}): ${message}`);
        
        // Create toast element if it doesn't exist
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                pointer-events: none;
            `;
            document.body.appendChild(toastContainer);
        }
        
        // Create toast
        const toast = document.createElement('div');
        toast.style.cssText = `
            background: ${type === 'error' ? 'var(--color-error)' : 
                        type === 'warning' ? 'var(--color-warning)' : 
                        type === 'success' ? 'var(--color-success)' : 'var(--color-primary)'};
            color: white;
            padding: 12px 16px;
            border-radius: var(--radius-md);
            margin-bottom: 8px;
            box-shadow: var(--shadow-lg);
            pointer-events: auto;
            animation: slideInRight 0.3s ease-out;
            max-width: 300px;
            word-wrap: break-word;
        `;
        toast.textContent = message;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }
        }, 5000);
        
        // Add animations to document if not present
        if (!document.getElementById('toastAnimations')) {
            const style = document.createElement('style');
            style.id = 'toastAnimations';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Get current state for debugging
     */
    getState() {
        return {
            selectedModel: this.selectedModel,
            chatHistoryLength: this.chatHistory.length,
            attachmentsCount: this.chatAttachments.length,
            isTyping: this.isTyping
        };
    }
}

// Export for use in other modules
window.UIManager = UIManager;