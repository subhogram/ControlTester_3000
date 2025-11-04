/**
 * API Layer for ControlTester 3000 Agentic AI Platform
 * Handles all communication with the backend services
 * Based on existing API patterns from the original codebase
 */

class DocumentAPI {
    static baseUrl = "http://localhost:8000";

    /**
     * Check if the API server is healthy
     */
    static async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            return response.ok;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    /**
     * Get available Ollama models
     */
    static async getModels() {
        try {
            const response = await fetch(`${this.baseUrl}/models`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const models = Array.isArray(data) ? data : (data.models || data.data || []);
            return models;
        } catch (error) {
            console.error('Failed to fetch models:', error);
            // Return fallback models if API fails
            return ["llama3.2:latest", "llama3.1:8b", "llama3.1:70b", "mistral:7b", "codellama:13b"];
        }
    }

    /**
     * Check and load existing vectorstores (global/company) into server cache
     */
    static async checkExistingVectorstores(preferredModel = null) {
        const result = {
            general: { exists: false, path: null, vector_count: 0, last_modified: null },
            company: { exists: false, path: null, vector_count: 0, last_modified: null }
        };

        try {
            let modelName = preferredModel;
            if (!modelName) {
                const models = await this.getModels();
                modelName = models?.[0] || "llama3.2:latest";
            }

            const checks = [
                { type: "general", path: "saved_global_vectorstore", kb_type: "global" },
                { type: "company", path: "saved_company_vectorstore", kb_type: "company" }
            ];

            for (const check of checks) {
                try {
                    const formData = new FormData();
                    formData.append("dir_path", check.path);
                    formData.append("kb_type", check.kb_type);
                    formData.append("model_name", modelName);

                    const response = await fetch(`${this.baseUrl}/load-vectorstore`, {
                        method: "POST",
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data?.success) {
                            result[check.type] = {
                                exists: true,
                                path: check.path,
                                vector_count: data.ntotal ?? data.vector_count ?? 0,
                                last_modified: new Date().toISOString()
                            };
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to load ${check.type} vectorstore:`, error);
                }
            }

            return result;
        } catch (error) {
            console.error('Failed to check existing vectorstores:', error);
            return result;
        }
    }

    /**
     * Build knowledge base from uploaded files
     */
    static async buildKnowledgeBase(files, kbType, selectedModel, options = {}) {
        if (!selectedModel) {
            throw new Error("No model selected");
        }
        if (!files?.length) {
            throw new Error("No files to build KB");
        }

        const formData = new FormData();
        for (const file of files) {
            formData.append("files", file);
        }
        formData.append("selected_model", selectedModel);
        formData.append("kb_type", kbType); // "global" | "company" | "chat_attachment"
        formData.append("batch_size", String(options.batch_size ?? 15));
        formData.append("delay_between_batches", String(options.delay_between_batches ?? 0.2));
        formData.append("max_retries", String(options.max_retries ?? 3));

        const response = await fetch(`${this.baseUrl}/build-knowledge-base`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Build failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error_details || data.message || "Build failed");
        }

        return data;
    }

    /**
     * Save vectorstore to specified directory
     */
    static async saveVectorstore(kbType, dirPath) {
        const formData = new FormData();
        formData.append("kb_type", kbType);
        formData.append("dir_path", dirPath);

        const response = await fetch(`${this.baseUrl}/save-vectorstore`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Save failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || "Save failed");
        }

        return data;
    }

    /**
     * Run evidence assessment on uploaded files
     */
    static async runAssessment(files, selectedModel, maxWorkers = 4) {
        if (!selectedModel) {
            throw new Error("No model selected");
        }
        if (!files?.length) {
            throw new Error("No files for assessment");
        }

        const formData = new FormData();
        formData.append("selected_model", selectedModel);
        formData.append("max_workers", String(maxWorkers));
        for (const file of files) {
            formData.append("evidence_files", file);
        }

        const response = await fetch(`${this.baseUrl}/assess-evidence`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Assessment failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error_details || data.message || "Assessment failed");
        }

        return data;
    }

    /**
     * Download generated report
     */
    static async downloadReport(filename) {
        const url = `${this.baseUrl}/download-report?filename=${encodeURIComponent(filename)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Download failed (${response.status})`);
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the URL object
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    }

    /**
     * Send chat message to AI assistant
     */
    static async chat(userInput, options = {}) {
        const selectedModel = sessionStorage.getItem("selectedModel");
        if (!selectedModel) {
            throw new Error("Please select a model before chatting.");
        }

        const payload = {
            selected_model: selectedModel,
            user_input: userInput
        };

        // Include chat attachment vectorstore if present
        const chatPath = options.chat_path ?? sessionStorage.getItem("chatAttachmentPath");
        if (chatPath) {
            payload.chat_kb_path = chatPath;
        }

        const response = await fetch(`${this.baseUrl}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Chat failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Chat failed");
        }

        return data;
    }

    /**
     * Upload files for chat attachment
     */
    static async uploadChatAttachment(files, selectedModel) {
        if (!selectedModel) {
            throw new Error("No model selected");
        }
        if (!files?.length) {
            throw new Error("No files to upload");
        }

        const kbType = "chat_attachment";
        const saveDir = "chat_attachment_vectorstore";

        // Build knowledge base for chat attachments
        const buildResult = await this.buildKnowledgeBase(files, kbType, selectedModel);
        
        // Save the vectorstore
        await this.saveVectorstore(kbType, saveDir);
        
        // Store path in session for chat use
        sessionStorage.setItem("chatAttachmentPath", saveDir);

        return {
            success: true,
            vector_count: buildResult.vector_count ?? 0,
            path: saveDir,
            files: files.map(f => ({ name: f.name, size: f.size }))
        };
    }

    /**
     * Clear chat attachments
     */
    static clearChatAttachments() {
        sessionStorage.removeItem("chatAttachmentPath");
    }
}

// Export for use in other modules
window.DocumentAPI = DocumentAPI;