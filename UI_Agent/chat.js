/* Lightweight chat integration (no changes to existing app.js) */
(function () {

  function $(id) { return document.getElementById(id); }

  function setModelPill() {
    const el = $("chat-active-model");
    if (!el) return;
    const model = sessionStorage.getItem("selectedModel") || "—";
    el.textContent = model;
  }

  function appendMessage(role, text) {
    const wrap = $("chat-messages");
    if (!wrap) return;

    // Remove empty state if present
    const empty = wrap.querySelector(".chat-empty");
    if (empty) empty.remove();

    const msg = document.createElement("div");
    msg.className = `chat-msg ${role}`;
    msg.innerHTML = `
      <div class="chat-avatar">${role === "user" ? "🧑" : "🤖"}</div>
      <div class="chat-bubble">${escapeHtml(text)}</div>
    `;
    wrap.appendChild(msg);
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
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_model: model,
          user_input: text
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
    wireEvents();
  });
})();
