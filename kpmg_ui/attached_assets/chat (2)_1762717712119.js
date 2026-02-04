/* Lightweight chat integration (no changes to existing app.js) */
(function () {

  function $(id) { return document.getElementById(id); }

  function setModelPill() {
    const el = $("chat-active-model");
    if (!el) return;
    const model = sessionStorage.getItem("selectedModel") || "—";
    el.textContent = model;
  }

  function renderMarkdownSafe(text) {
    try {
      // Prefer marked + DOMPurify if available
      if (window.marked) {
        if (typeof window.marked.setOptions === 'function') {
          window.marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false });
        }
        const rawHtml = (typeof window.marked.parse === 'function')
          ? window.marked.parse(String(text ?? ""))
          : window.marked(String(text ?? ""));
        const clean = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }) : rawHtml;
        // Ensure safe link targets
        const tmp = document.createElement('div');
        tmp.innerHTML = clean;
        tmp.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
        return tmp.innerHTML;
      }
    } catch { /* fall through to basic */ }

    // Basic fallback: escape then minimal formatting
    const safe = escapeHtml(String(text ?? ""));
    // linkify URLs
    const linkified = safe.replace(/(https?:\/\/[^\s)]+)(?![^<]*>|[^&]*;)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1<\/a>');
    // preserve newlines
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

      // Wrap code blocks with header (language + copy)
      el.querySelectorAll('pre > code').forEach(codeEl => {
        if (codeEl.closest('.code-block')) return; // already wrapped
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

    // Remove empty state if present
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
    const input = $("chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const model = sessionStorage.getItem("selectedModel");
    if (!model) {
      // Reuse UIManager toast if available; else alert
      try {
        window.uiManager?.showToast("Please select a session model first.", "warning");
      } catch { alert("Please select a session model first."); }
      return;
    }

    appendMessage("user", text);
    input.value = "";
    setSending(true);

    try {
      const chatPath = sessionStorage.getItem("chatAttachmentPath");
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_model: model,
          user_input: text,
          ...(chatPath ? { chat_kb_path: chatPath } : {})
          // server automatically loads saved vectorstores if present
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();

      if (data && data.success && data.response) {
        appendMessage("assistant", data.response);
      } else {
        const msg = data?.error || "No response from assistant.";
        appendMessage("assistant", msg);
      }
    } catch (err) {
      appendMessage("assistant", `⚠️ ${err.message || err}`);
    } finally {
      setSending(false);
      setModelPill();
    }
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
      clearBtn.addEventListener("click", () => {
        const wrap = $("chat-messages");
        if (wrap) wrap.innerHTML = `
          <div class="chat-empty">
            <div class="placeholder-icon">💬</div>
            <h3>Start chatting with your documents</h3>
            <p>Type a question below. The assistant will use your saved vectorstores if available.</p>
          </div>`;
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setModelPill();
    // If the unified UI manager is present, avoid wiring duplicate handlers
    if (window.uiManager && typeof window.uiManager.sendChatMessage === 'function') {
      return; // app.js handles chat events
    }
    wireEvents();
  });
})();
