/**
 * Chat Memory Manager for UI_Agent
 * Handles client-side session management and memory integration
 */

class ChatMemoryManager {
  constructor() {
    this.sessionId = this.loadOrCreateSession();
    this.messageCount = 0;
    this.apiBaseUrl = 'http://localhost:8000';
  }

  loadOrCreateSession() {
    // Try to load existing session from localStorage
    let sessionId = localStorage.getItem('chat_session_id');

    // Check if session is still valid (created within last 24 hours)
    const sessionTimestamp = localStorage.getItem('chat_session_timestamp');
    if (sessionId && sessionTimestamp) {
      const age = Date.now() - parseInt(sessionTimestamp);
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (age > maxAge) {
        // Session expired, create new one
        sessionId = null;
      }
    }

    if (!sessionId) {
      // Create new session
      sessionId = this.generateSessionId();
      localStorage.setItem('chat_session_id', sessionId);
      localStorage.setItem('chat_session_timestamp', Date.now().toString());
      console.log('Created new session:', sessionId);
    } else {
      console.log('Loaded existing session:', sessionId);
    }

    return sessionId;
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async createNewSession() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/session/create`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        this.sessionId = data.session_id;
        localStorage.setItem('chat_session_id', this.sessionId);
        localStorage.setItem('chat_session_timestamp', Date.now().toString());
        console.log('Created new server session:', this.sessionId);
        return this.sessionId;
      }
    } catch (error) {
      console.error('Failed to create server session:', error);
      // Fall back to client-side session
      this.sessionId = this.generateSessionId();
      return this.sessionId;
    }
  }

  async sendMessage(userInput, model) {
    const payload = {
      selected_model: model,
      user_input: userInput,
      session_id: this.sessionId,
      include_history: true
    };

    // Add vectorstore paths if available
    const chatPath = sessionStorage.getItem('chatAttachmentPath');
    if (chatPath) {
      payload.chat_kb_path = chatPath;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();

      if (data.success && data.response) {
        this.messageCount = data.message_count;
        return {
          success: true,
          response: data.response,
          sessionId: data.session_id,
          messageCount: data.message_count
        };
      } else {
        return {
          success: false,
          error: data.error || 'No response from assistant'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getSessionInfo() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/session/${this.sessionId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to get session info:', error);
    }
    return null;
  }

  async clearSession() {
    try {
      await fetch(`${this.apiBaseUrl}/session/${this.sessionId}`, {
        method: 'DELETE'
      });

      // Create new session
      await this.createNewSession();
      this.messageCount = 0;

      return true;
    } catch (error) {
      console.error('Failed to clear session:', error);
      return false;
    }
  }

  async getHistory(limit = 50) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/session/${this.sessionId}/history?limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        return data.messages;
      }
    } catch (error) {
      console.error('Failed to get history:', error);
    }
    return [];
  }

  displaySessionInfo() {
    const infoEl = document.getElementById('session-info');
    if (infoEl) {
      infoEl.innerHTML = `
        <div class="session-badge">
          <span class="session-id">Session: ${this.sessionId.slice(-8)}</span>
          <span class="message-count">${this.messageCount} messages</span>
        </div>
      `;
    }
  }
}

// Export for use in other modules
window.ChatMemoryManager = ChatMemoryManager;
