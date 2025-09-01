// Complete AI Document Management & Assessment System (with Chat + Auto Vectorstore Load)
// - Preserves existing UI design and behaviors
// - On init: checks & loads saved vectorstores (global/company) and updates UI
// - Multi-file uploads for KB and Assessment
// - Uses selected model from Model Configuration (sessionStorage.selectedModel)
// - Robust null-safe DOM access to avoid "Cannot set properties of null"

// ============ Debug Console ============

class DebugConsole {
    static instance = null;
    static getInstance() {
        if (!DebugConsole.instance) DebugConsole.instance = new DebugConsole();
        return DebugConsole.instance;
    }
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
    }
    log(message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        const entry = { timestamp, message, data, type: "log" };
        console.log(`[${timestamp}] ${message}`, data ?? "");
        this._append(entry);
    }
    error(message, error) {
        const timestamp = new Date().toLocaleTimeString();
        const entry = { timestamp, message, data: error?.stack || error?.message || error, type: "error" };
        console.error(`[${timestamp}] ERROR: ${message}`, error);
        this._append(entry);
    }
    _append(entry) {
        const panel = document.getElementById("debug-output");
        if (panel) {
            const div = document.createElement("div");
            div.className = `debug-entry ${entry.type}`;
            div.innerHTML = `
        <span class="debug-time">${entry.timestamp}</span>
        <span class="debug-message">${entry.message}</span>
        ${entry.data ? `<div class="debug-data">${typeof entry.data === "object" ? JSON.stringify(entry.data, null, 2) : String(entry.data)}</div>` : ""}
      `;
            panel.appendChild(div);
            panel.scrollTop = panel.scrollHeight;
            const keep = panel.querySelectorAll(".debug-entry");
            if (keep.length > 50) keep[0].remove();
        }
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
    }
    clear() {
        const panel = document.getElementById("debug-output");
        if (panel) panel.innerHTML = "";
        this.logs = [];
    }
    downloadLogs() {
        const txt = this.logs.map(l => `[${l.timestamp}] ${l.type.toUpperCase()}: ${l.message}${l.data ? `\n${typeof l.data === "object" ? JSON.stringify(l.data, null, 2) : l.data}` : ""}`).join("\n\n");
        const blob = new Blob([txt], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: `debug-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt` });
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }
}

// ============ API Layer ============

class DocumentAPI {
    static baseUrl = "http://localhost:8000";

    static async checkHealth() {
        const debug = DebugConsole.getInstance();
        try {
            const r = await fetch(`${this.baseUrl}/health`);
            debug.log(`API: /health -> ${r.status}`);
            return r.ok;
        } catch (e) {
            debug.error("API: health failed", e);
            return false;
        }
    }

    static async getModels() {
        const debug = DebugConsole.getInstance();
        debug.log("API: fetching models…");
        try {
            const r = await fetch(`${this.baseUrl}/models`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const models = Array.isArray(data) ? data : (data.models || data.data || []);
            debug.log("API: models", models);
            return models;
        } catch (e) {
            debug.error("API: getModels failed, using mock", e);
            return ["llama2", "mistral", "qwen2", "phi", "codellama"];
        }
    }

    // NEW: check & load saved vectorstores (global/company) into server cache.
    static async checkExistingVectorstores(preferredModel = null) {
        const debug = DebugConsole.getInstance();
        debug.log("API: Checking for existing vectorstores…");

        const result = {
            general: { exists: false, path: null, vector_count: 0, last_modified: null },
            company: { exists: false, path: null, vector_count: 0, last_modified: null }
        };

        try {
            let modelName = preferredModel;
            if (!modelName) {
                const models = await this.getModels();
                modelName = models?.[0] || "llama2";
            }

            const checks = [
                { type: "general", path: "saved_global_vectorstore", kb_type: "global" },
                { type: "company", path: "saved_company_vectorstore", kb_type: "company" }
            ];

            for (const check of checks) {
                try {
                    const form = new FormData();
                    form.append("dir_path", check.path);
                    form.append("kb_type", check.kb_type);
                    form.append("model_name", modelName);

                    const resp = await fetch(`${this.baseUrl}/load-vectorstore`, { method: "POST", body: form });
                    debug.log(`API: /load-vectorstore (${check.kb_type}) -> ${resp.status}`);

                    if (resp.ok) {
                        const data = await resp.json();
                        if (data?.success) {
                            result[check.type] = {
                                exists: true,
                                path: check.path,
                                vector_count: data.ntotal ?? data.vector_count ?? 0,
                                last_modified: new Date().toISOString()
                            };
                            debug.log(`API: Loaded ${check.kb_type} KB with ${result[check.type].vector_count} vectors.`);
                        } else {
                            debug.log(`API: ${check.kb_type} KB not loaded:`, data);
                        }
                    } else {
                        const err = await resp.text();
                        debug.log(`API: ${check.kb_type} KB load not OK: ${resp.status} ${err}`);
                    }
                } catch (e) {
                    debug.log(`API: Error checking ${check.kb_type} KB`, e?.message || e);
                }
            }

            return result;
        } catch (e) {
            debug.error("API: vectorstore check failed", e);
            // Return a conservative default (no mocks) to avoid confusing UI
            return result;
        }
    }

    static async buildKnowledgeBase(files, kbType, selectedModel, opts = {}) {
        const debug = DebugConsole.getInstance();
        if (!selectedModel) throw new Error("No model selected");
        if (!files?.length) throw new Error("No files to build KB");

        const form = new FormData();
        for (const f of files) form.append("files", f);
        form.append("selected_model", selectedModel);
        form.append("kb_type", kbType); // "global" | "company"
        form.append("batch_size", String(opts.batch_size ?? 15));
        form.append("delay_between_batches", String(opts.delay_between_batches ?? 0.2));
        form.append("max_retries", String(opts.max_retries ?? 3));

        const url = `${this.baseUrl}/build-knowledge-base`;
        debug.log(`API: POST ${url} (${kbType}) with ${files.length} files`);
        const r = await fetch(url, { method: "POST", body: form });
        if (!r.ok) {
            const t = await r.text();
            debug.error("API: build KB failed", t);
            throw new Error(`Build failed (${r.status}): ${t}`);
        }
        const data = await r.json();
        debug.log("API: build KB resp", data);
        if (!data.success) throw new Error(data.error_details || data.message || "Build failed");

        return data;
    }

    static async saveVectorstore(kbType, dirPath) {
        const debug = DebugConsole.getInstance();
        const form = new FormData();
        form.append("kb_type", kbType);
        form.append("dir_path", dirPath);
        debug.log(`API: save vectorstore (${kbType}) -> ${dirPath}`);
        const r = await fetch(`${this.baseUrl}/save-vectorstore`, { method: "POST", body: form });
        if (!r.ok) {
            const t = await r.text();
            debug.error("API: save vectorstore failed", t);
            throw new Error(`Save failed (${r.status}): ${t}`);
        }
        const data = await r.json();
        debug.log("API: save vectorstore resp", data);
        if (!data.success) throw new Error(data.message || "Save failed");
        return data;
    }

    static async runAssessment(files, selectedModel, maxWorkers = 4) {
        const debug = DebugConsole.getInstance();
        if (!selectedModel) throw new Error("No model selected");
        if (!files?.length) throw new Error("No files for assessment");

        const form = new FormData();
        form.append("selected_model", selectedModel);
        form.append("max_workers", String(maxWorkers));
        for (const f of files) form.append("evidence_files", f);

        const url = `${this.baseUrl}/assess-evidence`;
        debug.log(`API: POST ${url} with ${files.length} files`);
        const r = await fetch(url, { method: "POST", body: form });
        if (!r.ok) {
            const t = await r.text();
            debug.error("API: assess failed", t);
            throw new Error(`Assessment failed (${r.status}): ${t}`);
        }
        const data = await r.json();
        debug.log("API: assessment resp", data);
        if (!data.success) throw new Error(data.error_details || data.message || "Assessment failed");
        return data;
    }

    static async downloadReport(filename) {
        const debug = DebugConsole.getInstance();
        const url = `${this.baseUrl}/download-report?filename=${encodeURIComponent(filename)}`;
        debug.log(`API: download report ${filename}`);
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Download failed (${r.status})`);
        const blob = await r.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 0);
    }

    static async chat(userInput) {
        const debug = DebugConsole.getInstance();
        const selectedModel = sessionStorage.getItem("selectedModel");
        if (!selectedModel) throw new Error("Please select a model before chatting.");

        const payload = {
            selected_model: selectedModel,
            user_input: userInput, // server auto-loads saved vectorstores if present
        };

        const r = await fetch(`${this.baseUrl}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!r.ok) {
            const t = await r.text();
            debug.error("API: chat failed", t);
            throw new Error(`Chat failed (${r.status}): ${t}`);
        }
        const data = await r.json();
        debug.log("API: chat resp", data);
        if (!data.success) throw new Error(data.error || "Chat failed");
        return data;
    }
}

// ============ UI Manager ============

class UIManager {
    constructor() {
        this.debug = DebugConsole.getInstance();
        this.availableModels = [];
        this.modelLocked = false;

        // Files
        this.files = { general: [], company: [] };
        this.assessmentFiles = [];

        // Chat
        this.chatHistory = []; // store objects {role:'user'|'assistant', text:'...'}
    }

    // ---------- Init ----------
    async init() {
        this.setupNav();
        this.setupModelUI();
        this.setupUploads();
        this.setupAssessmentUI();
        this.setupChatUI();

        const apiHealthy = await DocumentAPI.checkHealth();
        this.markAPIStatus(apiHealthy);

        await this.loadModels();
        this.restoreSessionModel();

        // NEW: Detect & load saved vectorstores into server cache, then reflect in UI
        if (apiHealthy) {
            await this.detectAndLoadVectorstores();
        }

        this.syncBuildButtons();
        this.syncAssessmentButtons();
        this.syncChatModelChip(); // ensure pill shows current model
    }

    _ext(name) {
        const parts = String(name).split(".");
        return parts.length > 1 ? parts.pop().toUpperCase() : "";
    }

    _fileEmoji(name) {
        const ext = this._ext(name).toLowerCase();
        switch (ext) {
            case "pdf": return "📄";
            case "txt": return "📝";
            case "doc":
            case "docx": return "📃";
            case "csv": return "🧾";
            case "xlsx": return "📊";
            case "md": return "🗒️";
            default: return "📁";
        }
    }


    // ---------- Helpers ----------
    $(id) { return document.getElementById(id); }
    showToast(msg, type = "info") {
        console[type === "error" ? "error" : "log"]("TOAST:", msg);
    }
    markAPIStatus(ok) {
        const el = this.$("api-status");
        if (!el) return;
        const ind = el.querySelector(".status-indicator");
        const txt = el.querySelector(".status-text");
        if (ind) ind.textContent = ok ? "🟢" : "🔴";
        if (txt) txt.textContent = ok ? "Connected" : "Offline (using fallbacks)";
    }

    // ---------- Navigation ----------
    setupNav() {
        const links = document.querySelectorAll(".nav-link");
        links.forEach(btn => {
            btn.addEventListener("click", () => {
                links.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                const tab = btn.getAttribute("data-tab");
                document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
                const panel = this.$(tab);
                if (panel) panel.classList.add("active");

                // When switching to Chat, ensure pill updates
                if (tab === "document-chat") this.syncChatModelChip();
            });
        });
    }

    // ---------- Model Selection ----------
    async loadModels() {
        const select = this.$("session-model-select");
        if (!select) return;
        const models = await DocumentAPI.getModels();
        this.availableModels = models;
        select.innerHTML = "";
        if (!models.length) {
            const opt = document.createElement("option");
            opt.value = ""; opt.textContent = "No models found";
            select.appendChild(opt);
        } else {
            select.appendChild(new Option("Select a model…", ""));
            for (const m of models) select.appendChild(new Option(m, m));
        }
    }

    setupModelUI() {
        const select = this.$("session-model-select");
        const changeBtn = this.$("change-model-btn");
        if (select) {
            select.addEventListener("change", e => {
                const m = e.target.value?.trim();
                if (!m) return;
                this.selectModel(m);
                this.syncChatModelChip(); // Null-safe update for chat pill
            });
        }
        if (changeBtn) {
            changeBtn.addEventListener("click", () => {
                sessionStorage.removeItem("selectedModel");
                this.modelLocked = false;
                this.updateModelDisplay();
                this.syncBuildButtons();
                this.syncAssessmentButtons();
                this.syncChatModelChip();
            });
        }
    }

    selectModel(model) {
        sessionStorage.setItem("selectedModel", model);
        this.modelLocked = true;
        this.updateModelDisplay();
        this.syncBuildButtons();
        this.syncAssessmentButtons();
        this.syncChatModelChip();
    }

    restoreSessionModel() {
        const saved = sessionStorage.getItem("selectedModel");
        if (saved) {
            this.modelLocked = true;
            const sel = this.$("session-model-select");
            if (sel) sel.value = saved;
        }
        this.updateModelDisplay();
    }

    updateModelDisplay() {
        const selected = sessionStorage.getItem("selectedModel");
        const initialSel = this.$("initial-model-selector");
        const selectedView = this.$("selected-model-display");
        const name = this.$("selected-model-name");
        const hintGeneral = this.$("general-build-hint");
        const hintCompany = this.$("company-build-hint");
        const hintAssess = this.$("assessment-build-hint");

        if (selected && this.modelLocked) {
            if (initialSel) initialSel.style.display = "none";
            if (selectedView) selectedView.style.display = "";
            if (name) name.textContent = selected;
            if (hintGeneral) hintGeneral.textContent = "Ready to build";
            if (hintCompany) hintCompany.textContent = "Ready to build";
            if (hintAssess) hintAssess.textContent = "Ready to assess";
        } else {
            if (initialSel) initialSel.style.display = "";
            if (selectedView) selectedView.style.display = "none";
            if (name) name.textContent = "";
            if (hintGeneral) hintGeneral.textContent = "Select a model above to enable building";
            if (hintCompany) hintCompany.textContent = "Select a model above to enable building";
            if (hintAssess) hintAssess.textContent = "Select a model above to enable assessment";
        }
        this.syncChatModelChip();
    }

    validateSessionModel() {
        const m = sessionStorage.getItem("selectedModel");
        return !!m;
    }

    // Null-safe: updates the chat model pill if present
    syncChatModelChip() {
        const chip =
            this.$("chat-active-model") ||
            this.$("chat-model-chip") ||
            this.$("selected-model-name"); // fallback
        if (!chip) return;
        chip.textContent = sessionStorage.getItem("selectedModel") || "—";
    }

    // ---------- NEW: Detect & load saved vectorstores on init ----------
    async detectAndLoadVectorstores() {
        try {
            const preferred = sessionStorage.getItem("selectedModel") || null;
            const res = await DocumentAPI.checkExistingVectorstores(preferred);

            // Update UI for GLOBAL (general)
            this._reflectKBStatus("general", res.general);
            // Update UI for COMPANY
            this._reflectKBStatus("company", res.company);

            // Small toast summary
            const loaded = ["general", "company"].filter(k => res[k].exists).length;
            if (loaded > 0) {
                this.showToast(`Loaded ${loaded} saved knowledge base${loaded > 1 ? "s" : ""} into cache.`, "success");
            } else {
                this.showToast("No saved knowledge bases found.", "info");
            }
        } catch (e) {
            this.debug.error("Detect/load vectorstores failed", e);
        }
    }

    _reflectKBStatus(kind, info) {
        // kind: "general" | "company"
        const kbStatus = this.$(`${kind}-kb-status`);
        const vecCount = this.$(`${kind}-vector-count`);
        const savePathItem = this.$(`${kind}-save-path-item`);
        const savePath = this.$(`${kind}-save-path`);

        if (info.exists) {
            if (kbStatus) kbStatus.textContent = "Loaded";
            if (vecCount) vecCount.textContent = String(info.vector_count ?? 0);
            if (savePath) savePath.textContent = info.path || "";
            if (savePathItem) savePathItem.style.display = "";
        } else {
            if (kbStatus) kbStatus.textContent = "Not found";
            if (vecCount) vecCount.textContent = "0";
            if (savePath) savePath.textContent = "";
            if (savePathItem) savePathItem.style.display = "none";
        }
    }

    // ---------- Uploads (General/Company) ----------
    setupUploads() {
        this._wireDropZone("general-upload-area", "general", "general-docs-container", "general-count");
        this._wireDropZone("company-upload-area", "company", "company-docs-container", "company-count");

        const generalBtn = this.$("general-build-btn");
        const companyBtn = this.$("company-build-btn");
        if (generalBtn) generalBtn.addEventListener("click", () => this.handleBuildKB("general"));
        if (companyBtn) companyBtn.addEventListener("click", () => this.handleBuildKB("company"));

        const generalClear = this.$("general-clear-files");
        if (generalClear) {
            generalClear.addEventListener("click", () => {
                this.files.general = [];
                this._renderFileList("general", "general-docs-container", "general-count");
                this.syncBuildButtons();
            });
        }

        const companyClear = this.$("company-clear-files");
        if (companyClear) {
            companyClear.addEventListener("click", () => {
                this.files.company = [];
                this._renderFileList("company", "company-docs-container", "company-count");
                this.syncBuildButtons();
            });
        }

    }

    _wireDropZone(areaId, bucket, listId, countId) {
        const area = this.$(areaId);
        if (!area) return;

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.multiple = true;
        fileInput.accept = ".pdf,.txt,.doc,.docx,.md,.csv,.xlsx";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);

        const browseBtn = area.querySelector(".upload-link");
        if (browseBtn) browseBtn.addEventListener("click", (e) => {
            e.preventDefault();
            fileInput.click();
        });

        area.addEventListener("dragover", (e) => {
            e.preventDefault();
            area.classList.add("dragging");
        });
        area.addEventListener("dragleave", () => area.classList.remove("dragging"));
        area.addEventListener("drop", (e) => {
            e.preventDefault();
            area.classList.remove("dragging");
            const files = Array.from(e.dataTransfer.files || []);
            this._addFiles(bucket, files, listId, countId);
        });

        fileInput.addEventListener("change", (e) => {
            const files = Array.from(e.target.files || []);
            this._addFiles(bucket, files, listId, countId);
            fileInput.value = ""; // reset
        });
    }

    _addFiles(bucket, files, listId, countId) {
        if (!files?.length) return;
        this.files[bucket].push(...files);
        this._renderFileList(bucket, listId, countId);
        this.syncBuildButtons();
    }

    _renderFileList(bucket, listId, countId) {
        const cont = this.$(listId);
        const countEl = this.$(countId);
        const items = this.files[bucket];

        const clearBtn = this.$(`${bucket}-clear-files`);
        if (clearBtn) clearBtn.style.display = items.length ? "" : "none";


        if (countEl) {
            countEl.textContent = items.length
                ? `${items.length} file(s) ready`
                : "No documents uploaded yet";
        }
        if (!cont) return;

        cont.classList.add("document-list");
        cont.innerHTML = "";

        if (!items.length) {
            cont.innerHTML = `<p class="no-docs">No documents uploaded yet</p>`;
            return;
        }

        items.forEach((f, idx) => {
            const item = document.createElement("div");
            item.className = "doc-item";
            item.innerHTML = `
      <div class="doc-left">
        <div class="doc-icon">${this._fileEmoji(f.name)}</div>
        <div class="doc-meta">
          <div class="doc-name" title="${this._escape(f.name)}">${this._escape(f.name)}</div>
          <div class="doc-sub">${this._ext(f.name) || "FILE"} · ${this._prettyBytes(f.size)}</div>
        </div>
      </div>
      <div class="doc-right">#${idx + 1}</div>
    `;
            cont.appendChild(item);
        });
    }


    _prettyBytes(n) {
        if (!n && n !== 0) return "";
        const u = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(n) / Math.log(1024));
        return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
    }

    syncBuildButtons() {
        const selected = this.validateSessionModel();
        const genBtn = this.$("general-build-btn");
        const comBtn = this.$("company-build-btn");
        if (genBtn) genBtn.disabled = !(selected && this.files.general.length);
        if (comBtn) comBtn.disabled = !(selected && this.files.company.length);
    }

    async handleBuildKB(kind) {
        try {
            const btn = this.$(kind === "general" ? "general-build-btn" : "company-build-btn");
            if (btn) { btn.disabled = true; btn.textContent = "Building…"; }
            const selected = sessionStorage.getItem("selectedModel");
            const files = this.files[kind];
            const kbType = (kind === "general") ? "global" : "company";
            const saveDir = (kbType === "global") ? "saved_global_vectorstore" : "saved_company_vectorstore";

            const buildRes = await DocumentAPI.buildKnowledgeBase(files, kbType, selected);
            await DocumentAPI.saveVectorstore(kbType, saveDir);

            // Update status
            const kbStatus = this.$(`${kind}-kb-status`);
            const vecCount = this.$(`${kind}-vector-count`);
            const savePathItem = this.$(`${kind}-save-path-item`);
            const savePath = this.$(`${kind}-save-path`);

            if (kbStatus) kbStatus.textContent = "Built & Saved";
            if (vecCount) vecCount.textContent = String(buildRes.vector_count ?? buildRes?.processing_summary?.vectors ?? 0);
            if (savePath) savePath.textContent = saveDir;
            if (savePathItem) savePathItem.style.display = "";

            this.showToast(`Knowledge base (${kbType}) built successfully.`, "success");
        } catch (e) {
            this.showToast(e.message || String(e), "error");
            this.debug.error("Build KB error", e);
        } finally {
            const btn = this.$(kind === "general" ? "general-build-btn" : "company-build-btn");
            if (btn) { btn.disabled = false; btn.textContent = "🏗️ Build & Save Knowledge Base"; }
        }
    }

    // ---------- Assessment ----------
    setupAssessmentUI() {
        // Dropzone
        const area = this.$("assessment-upload-area");
        if (area) {
            const fileInput = document.createElement("input");
            fileInput.type = "file"; fileInput.multiple = true;
            fileInput.accept = ".pdf,.txt,.doc,.docx,.md,.csv,.xlsx";
            fileInput.style.display = "none";
            document.body.appendChild(fileInput);

            const browseBtn = area.querySelector(".upload-link");
            if (browseBtn) browseBtn.addEventListener("click", (e) => {
                e.preventDefault(); fileInput.click();
            });

            area.addEventListener("dragover", (e) => { e.preventDefault(); area.classList.add("dragging"); });
            area.addEventListener("dragleave", () => area.classList.remove("dragging"));
            area.addEventListener("drop", (e) => {
                e.preventDefault(); area.classList.remove("dragging");
                const files = Array.from(e.dataTransfer.files || []);
                this._addAssessmentFiles(files);
            });

            fileInput.addEventListener("change", (e) => {
                const files = Array.from(e.target.files || []);
                this._addAssessmentFiles(files);
                fileInput.value = "";
            });
        }

        // Clear files
        const clearBtn = this.$("assessment-remove-file");
        if (clearBtn) clearBtn.addEventListener("click", () => {
            this.assessmentFiles = [];
            this._renderAssessmentFiles();
            this.syncAssessmentButtons();
        });

        // Run
        const runBtn = this.$("run-assessment-btn");
        if (runBtn) runBtn.addEventListener("click", () => this.handleAssessment());
    }

    _addAssessmentFiles(files) {
        if (!files?.length) return;
        this.assessmentFiles.push(...files);
        this._renderAssessmentFiles();
        this.syncAssessmentButtons();
    }

    _renderAssessmentFiles() {
        const wrap = this.$("assessment-file-display");
        const list = this.$("assessment-files-list");
        const count = this.$("assessment-count");
        if (!wrap || !list || !count) return;

        list.classList.add("document-list");
        list.innerHTML = "";

        if (!this.assessmentFiles.length) {
            wrap.style.display = "none";
            count.textContent = "No documents selected";
            return;
        }

        wrap.style.display = "";
        count.textContent = `${this.assessmentFiles.length} file(s) selected`;

        this.assessmentFiles.forEach((f, idx) => {
            const el = document.createElement("div");
            el.className = "doc-item";
            el.innerHTML = `
      <div class="doc-left">
        <div class="doc-icon">${this._fileEmoji(f.name)}</div>
        <div class="doc-meta">
          <div class="doc-name" title="${this._escape(f.name)}">${this._escape(f.name)}</div>
          <div class="doc-sub">${this._ext(f.name) || "FILE"} · ${this._prettyBytes(f.size)}</div>
        </div>
      </div>
      <div class="doc-right">#${idx + 1}</div>
    `;
            list.appendChild(el);
        });
    }


    syncAssessmentButtons() {
        const runBtn = this.$("run-assessment-btn");
        const ok = this.validateSessionModel() && this.assessmentFiles.length > 0;
        if (runBtn) runBtn.disabled = !ok;
    }

    async handleAssessment() {
        const runBtn = this.$("run-assessment-btn");
        const status = this.$("assessment-status");
        try {
            if (runBtn) { runBtn.disabled = true; runBtn.textContent = "Running…"; }
            if (status) status.textContent = "⏳ Processing";
            const selected = sessionStorage.getItem("selectedModel");
            const res = await DocumentAPI.runAssessment(this.assessmentFiles, selected, 4);

            if (status) status.textContent = "✅ Completed";
            this.showToast("Assessment completed.", "success");

            // attach a download button/link
            const cardBody = runBtn?.closest(".card-body") || this.$("document-assessment");
            if (res.workbook_path && cardBody) {
                let dl = this.$("assessment-download-btn");
                if (!dl) {
                    dl = document.createElement("button");
                    dl.id = "assessment-download-btn";
                    dl.className = "btn btn--secondary btn--full-width";
                    dl.textContent = "⬇️ Download Report";
                    dl.addEventListener("click", () => DocumentAPI.downloadReport(res.workbook_path));
                    cardBody.appendChild(dl);
                } else {
                    dl.onclick = () => DocumentAPI.downloadReport(res.workbook_path);
                }
            }
        } catch (e) {
            if (status) status.textContent = "❌ Failed";
            this.showToast(e.message || String(e), "error");
            this.debug.error("Assessment error", e);
        } finally {
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = "📊 Run Assessment"; }
        }
    }

    // ---------- Chat ----------
    setupChatUI() {
        const form = this.$("chat-form");
        const input = this.$("chat-input");
        const clear = this.$("chat-clear");

        if (form) form.addEventListener("submit", (e) => {
            e.preventDefault();
            this.sendChatMessage();
        });
        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChatMessage();
                }
            });
        }
        if (clear) {
            clear.addEventListener("click", () => {
                this.chatHistory = [];
                const msgs = this.$("chat-messages");
                if (msgs) {
                    msgs.innerHTML = `
            <div class="chat-empty">
              <div class="placeholder-icon">💬</div>
              <h3>Start chatting with your documents</h3>
              <p>Type a question below. The assistant will use your saved vectorstores if available.</p>
            </div>`;
                }
            });
        }
    }

    addChatMessage(role, text) {
        const wrap = this.$("chat-messages");
        if (!wrap) return;
        const empty = wrap.querySelector(".chat-empty");
        if (empty) empty.remove();

        const row = document.createElement("div");
        row.className = `chat-msg ${role}`;
        row.innerHTML = `
      <div class="chat-avatar">${role === "user" ? "🧑" : "🤖"}</div>
      <div class="chat-bubble">${this._escape(text)}</div>
    `;
        wrap.appendChild(row);
        wrap.scrollTop = wrap.scrollHeight;
    }

    async sendChatMessage() {
        const input = this.$("chat-input");
        const btn = this.$("chat-send");
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        if (!this.validateSessionModel()) {
            this.showToast("Please select a model before chatting.", "warning");
            return;
        }

        // UI state
        input.disabled = true;
        if (btn) { btn.disabled = true; this._toggleSendSpinner(true); }

        // Show user's message
        this.addChatMessage("user", text);
        input.value = "";

        try {
            // Build a lightweight conversation context to send
            const MAX_TURNS = 6;
            const recent = this.chatHistory.slice(-MAX_TURNS * 2);
            const context = recent.map(m => (m.role === "user" ? `User: ${m.text}` : `Assistant: ${m.text}`)).join("\n");
            const composed = context ? `${context}\nUser: ${text}` : text;

            const res = await DocumentAPI.chat(composed);
            const reply = res.response || "No response.";
            this.addChatMessage("assistant", reply);

            // Persist local chat memory
            this.chatHistory.push({ role: "user", text });
            this.chatHistory.push({ role: "assistant", text: reply });
        } catch (e) {
            this.addChatMessage("assistant", `⚠️ ${e.message || String(e)}`);
            this.debug.error("Chat error", e);
        } finally {
            if (btn) { btn.disabled = false; this._toggleSendSpinner(false); }
            input.disabled = false;
            input.focus();
            this.syncChatModelChip(); // keep pill accurate
        }
    }

    _toggleSendSpinner(isLoading) {
        const spinner = document.querySelector(".send-spinner");
        const label = document.querySelector(".send-label");
        if (spinner) spinner.hidden = !isLoading;
        if (label) label.hidden = !!isLoading;
    }

    _escape(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}

// ============ Bootstrap ============
window.uiManager = new UIManager();
document.addEventListener("DOMContentLoaded", () => {
    window.uiManager.init().catch(e => {
        DebugConsole.getInstance().error("Init failed", e);
        alert("App failed to initialize. Check console/logs.");
    });
});
