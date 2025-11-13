/* Enhanced chat with Phase 2 active feedback loop */
(function () {
  let memoryManager = null;
  let agentState = null;

  function $(id) { return document.getElementById(id); }

  function initManagers() {
    if (window.ChatMemoryManager) {
      memoryManager = new window.ChatMemoryManager();
      memoryManager.displaySessionInfo();
      console.log('Memory manager initialized');
    }

    if (window.AgentStateManager) {
      agentState = new window.AgentStateManager();
      agentState.loadPendingRequest();
      console.log('Agent state manager initialized');

      // Check if there's a pending request to render
      if (agentState.hasPendingRequest()) {
        renderPendingRequest();
      }
    }
  }

  function setModelPill() {
    const el = $("chat-active-model");
    if (!el) return;
    const model = sessionStorage.getItem("selectedModel") || "—";
    el.textContent = model;
  }

  function renderMarkdownSafe(text) {
    try {
      if (window.marked) {
        if (typeof window.marked.setOptions === 'function') {
          window.marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false });
        }
        const rawHtml = (typeof window.marked.parse === 'function')
          ? window.marked.parse(String(text ?? ""))
          : window.marked(String(text ?? ""));
        const clean = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }) : rawHtml;
        const tmp = document.createElement('div');
        tmp.innerHTML = clean;
        tmp.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
        return tmp.innerHTML;
      }
    } catch { /* fall through */ }

    const safe = escapeHtml(String(text ?? ""));
    const linkified = safe.replace(/(https?:\/\/[^\s)]+)(?![^<]*>|[^&]*;)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1<\/a>');
    return linkified.replace(/\n/g, '<br>');
  }

  function enhanceBubble(el) {
    try {
      if (!el) return;
      if (window.hljs) {
        el.querySelectorAll('pre code').forEach(block => {
          try { window.hljs.highlightElement(block); } catch { /* noop */ }
        });
      }

      el.querySelectorAll('pre > code').forEach(codeEl => {
        if (codeEl.closest('.code-block')) return;
        const preEl = codeEl.parentElement;
        if (!preEl) return;

        let lang = 'text';
        const m = String(codeEl.className || '').match(/(?:language|lang)-([a-z0-9_+-]+)/i);
        if (m && m[1]) lang = m[1].toLowerCase();

        const container = document.createElement('div');
        container.className = 'code-block';
        const header = document.createElement('div');
        header.className = 'code-header';
        const langEl = document.createElement('span');
        langEl.className = 'code-lang';
        langEl.textContent = lang;
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'code-copy';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(codeEl.innerText);
            copyBtn.textContent = 'Copied';
            copyBtn.classList.add('copied');
            setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1500);
          } catch {
            copyBtn.textContent = 'Failed';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
          }
        });
        header.appendChild(langEl);
        header.appendChild(copyBtn);

        preEl.replaceWith(container);
        container.appendChild(header);
        container.appendChild(preEl);
      });
    } catch { /* ignore */ }
  }

  function appendMessage(role, text) {
    const wrap = $("chat-messages");
    if (!wrap) return;

    const empty = wrap.querySelector(".chat-empty");
    if (empty) empty.remove();

    const msg = document.createElement("div");
    msg.className = `chat-msg ${role}`;
    const bubble = (role === "assistant") ? renderMarkdownSafe(text) : escapeHtml(text);
    msg.innerHTML = `
      <div class="chat-avatar">${role === "user" ? "🧑" : "🤖"}</div>
      <div class="chat-bubble">${bubble}</div>
    `;
    wrap.appendChild(msg);
    if (role === 'assistant') {
      const b = msg.querySelector('.chat-bubble');
      if (b) { b.classList.add('md'); enhanceBubble(b); }
    }
    wrap.scrollTop = wrap.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setSending(state) {
    const btn = $("chat-send");
    const spinner = document.querySelector(".send-spinner");
    const label = document.querySelector(".send-label");
    const input = $("chat-input");
    if (btn) btn.disabled = state;
    if (input) input.disabled = state;
    if (spinner) spinner.hidden = !state;
    if (label) label.hidden = state;
  }

  async function sendMessage(e) {
    if (e) e.preventDefault();

    const input = $('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const model = sessionStorage.getItem('selectedModel');
    if (!model) {
      showToast('Please select a model first', 'warning');
      return;
    }

    // PHASE 2: Check context status
    const kbLoaded = sessionStorage.getItem('kbReady') === 'true';
    const companyLoaded = sessionStorage.getItem('companyReady') === 'true';
    const evidenceLoaded = sessionStorage.getItem('evidenceReady') === 'true';

    appendMessage('user', text);
    input.value = '';
    setSending(true);

    try {
      // PHASE 2: Analyze query first
      if (agentState) {
        const analysis = await agentState.analyzeQuery(
          text, kbLoaded, companyLoaded, evidenceLoaded
        );

        if (analysis.needsAction) {
          // Agent needs something - render request UI
          agentState.setPendingRequest(analysis.request, text);
          appendMessage('assistant', analysis.request.message);
          renderPendingRequest();
          setSending(false);
          return;
        }
      }

      // Can proceed normally
      let result;
      if (memoryManager) {
        result = await memoryManager.sendMessage(text, model);
        if (result.success) {
          appendMessage('assistant', result.response);
          memoryManager.displaySessionInfo();
        } else {
          appendMessage('assistant', `⚠️ ${result.error}`);
        }
      } else {
        // Fallback
        const res = await fetch('http://localhost:8000/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selected_model: model,
            user_input: text
          })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.success && data.response) {
          appendMessage('assistant', data.response);
        } else {
          appendMessage('assistant', data.error || 'No response');
        }
      }
    } catch (err) {
      appendMessage('assistant', `⚠️ ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  function renderPendingRequest() {
    const request = agentState.getPendingRequest();
    if (!request) return;

    const chatMessages = $('chat-messages');
    const chatForm = $('chat-form');

    if (!chatMessages || !chatForm) return;

    // Hide normal chat form
    chatForm.style.display = 'none';

    // Create pending request UI
    const pendingUI = document.createElement('div');
    pendingUI.id = 'pending-request-ui';
    pendingUI.className = 'pending-request-container';

    if (request.type === 'file_upload') {
      pendingUI.innerHTML = `
        <div class="pending-request-header">
          <h4>📁 Agent Request: Files Needed</h4>
        </div>
        <div class="pending-request-body">
          <p>${escapeHtml(request.message)}</p>
          <input type="file" id="agent-file-upload" 
                 accept="${request.accepted_types.map(t => '.' + t).join(',')}"
                 multiple />
          <div class="pending-actions">
            <button id="submit-files-btn" class="btn-primary">✅ Submit Files</button>
            <button id="cancel-request-btn" class="btn-secondary">❌ Cancel</button>
          </div>
        </div>
      `;
    } else if (request.type === 'clarification') {
      pendingUI.innerHTML = `
        <div class="pending-request-header">
          <h4>⚠️ Agent Request: Clarification Needed</h4>
        </div>
        <div class="pending-request-body">
          <p>${escapeHtml(request.message)}</p>
          <textarea id="clarification-input" rows="3" 
                    placeholder="Please provide more details..."></textarea>
          <div class="pending-actions">
            <button id="submit-clarification-btn" class="btn-primary">✅ Submit</button>
            <button id="cancel-request-btn" class="btn-secondary">❌ Cancel</button>
          </div>
        </div>
      `;
    }

    // Remove existing pending UI if any
    const existing = $('pending-request-ui');
    if (existing) existing.remove();

    // Insert before chat messages
    chatMessages.parentElement.insertBefore(pendingUI, chatMessages);

    // Wire events
    const cancelBtn = $('cancel-request-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        agentState.clearPendingRequest();
        pendingUI.remove();
        chatForm.style.display = 'block';
      });
    }

    if (request.type === 'file_upload') {
      const submitBtn = $('submit-files-btn');
      const fileInput = $('agent-file-upload');

      if (submitBtn && fileInput) {
        submitBtn.addEventListener('click', async () => {
          const files = fileInput.files;
          if (!files || files.length === 0) {
            showToast('Please select files first', 'warning');
            return;
          }

          await handleFileUpload(files, request);
        });
      }
    } else if (request.type === 'clarification') {
      const submitBtn = $('submit-clarification-btn');
      const clarificationInput = $('clarification-input');

      if (submitBtn && clarificationInput) {
        submitBtn.addEventListener('click', async () => {
          const clarification = clarificationInput.value.trim();
          if (!clarification) {
            showToast('Please provide clarification', 'warning');
            return;
          }

          await handleClarification(clarification);
        });
      }
    }
  }

  async function handleFileUpload(files, request) {
    const formData = new FormData();
    for (let file of files) {
      formData.append('files', file);
    }

    const model = sessionStorage.getItem('selectedModel');
    formData.append('selected_model', model);
    formData.append('kb_type', request.file_category);

    try {
      setSending(true);
      showToast('Processing files...', 'info');

      const response = await fetch('http://localhost:8000/build-knowledge-base', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('File upload failed');

      const data = await response.json();

      if (data.success) {
        // Update session storage
        if (request.missing_type === 'policy_documents') {
          sessionStorage.setItem('kbReady', 'true');
        } else if (request.missing_type === 'evidence_files') {
          sessionStorage.setItem('evidenceReady', 'true');
        } else if (request.missing_type === 'company_documents') {
          sessionStorage.setItem('companyReady', 'true');
        }

        showToast('Files processed successfully!', 'success');

        // Now retry original query
        await retryOriginalQuery();
      } else {
        throw new Error(data.error_details || 'Processing failed');
      }
    } catch (error) {
      showToast(`Upload error: ${error.message}`, 'error');
      appendMessage('assistant', `⚠️ File upload error: ${error.message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleClarification(clarification) {
    const originalQuery = agentState.getOriginalQuery();
    const enhancedQuery = `${originalQuery}\n\nAdditional context: ${clarification}`;

    // Clear pending request
    agentState.clearPendingRequest();
    const pendingUI = $('pending-request-ui');
    if (pendingUI) pendingUI.remove();
    $('chat-form').style.display = 'block';

    // Send enhanced query
    appendMessage('user', `[Clarified] ${enhancedQuery}`);

    try {
      setSending(true);
      const model = sessionStorage.getItem('selectedModel');

      if (memoryManager) {
        const result = await memoryManager.sendMessage(enhancedQuery, model);
        if (result.success) {
          appendMessage('assistant', result.response);
          memoryManager.displaySessionInfo();
        } else {
          appendMessage('assistant', `⚠️ ${result.error}`);
        }
      }
    } catch (error) {
      appendMessage('assistant', `⚠️ ${error.message}`);
    } finally {
      setSending(false);
    }
  }

  async function retryOriginalQuery() {
    const originalQuery = agentState.getOriginalQuery();

    // Clear pending request UI
    agentState.clearPendingRequest();
    const pendingUI = $('pending-request-ui');
    if (pendingUI) pendingUI.remove();
    $('chat-form').style.display = 'block';

    appendMessage('user', `[After uploading files] ${originalQuery}`);

    try {
      setSending(true);
      const model = sessionStorage.getItem('selectedModel');

      if (memoryManager) {
        const result = await memoryManager.sendMessage(originalQuery, model);
        if (result.success) {
          appendMessage('assistant', result.response);
          memoryManager.displaySessionInfo();
        } else {
          appendMessage('assistant', `⚠️ ${result.error}`);
        }
      }
    } catch (error) {
      appendMessage('assistant', `⚠️ ${error.message}`);
    } finally {
      setSending(false);
    }
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function wireEvents() {
    const form = $("chat-form");
    const input = $("chat-input");
    const clearBtn = $("chat-clear");

    if (form) form.addEventListener("submit", sendMessage);

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          form?.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        if (memoryManager) {
          await memoryManager.clearSession();
        }
        if (agentState) {
          agentState.clearPendingRequest();
        }

        const wrap = $("chat-messages");
        if (wrap) {
          wrap.innerHTML = `
            <div class="chat-empty">
              <div class="placeholder-icon">💬</div>
              <h3>Start chatting with your documents</h3>
              <p>Your conversation history is maintained for better context.</p>
            </div>
          `;
        }

        // Remove pending UI if present
        const pendingUI = $('pending-request-ui');
        if (pendingUI) pendingUI.remove();
        $('chat-form').style.display = 'block';
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initManagers();
    setModelPill();

    if (window.uiManager && typeof window.uiManager.sendChatMessage === 'function') {
      return;
    }
    wireEvents();
  });
})();
