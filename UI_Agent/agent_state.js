/**
 * Agent State Manager - Phase 2
 * Handles active feedback loop state for the chat agent
 */

class AgentStateManager {
  constructor() {
    this.pendingRequest = null;
    this.originalQuery = null;
    this.apiBaseUrl = 'http://localhost:8000';
  }

  async analyzeQuery(userInput, kbLoaded, companyLoaded, evidenceLoaded) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/analyze-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_input: userInput,
          kb_loaded: kbLoaded,
          company_loaded: companyLoaded,
          evidence_loaded: evidenceLoaded
        })
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.can_proceed || data.clarification_needed) {
        this.pendingRequest = data.agent_request;
        this.originalQuery = userInput;
        return {
          needsAction: true,
          request: data.agent_request,
          reasoning: data.reasoning
        };
      }

      return { needsAction: false };
    } catch (error) {
      console.error('Query analysis error:', error);
      return { needsAction: false, error: error.message };
    }
  }

  setPendingRequest(request, originalQuery) {
    this.pendingRequest = request;
    this.originalQuery = originalQuery;
    localStorage.setItem('agent_pending_request', JSON.stringify(request));
    localStorage.setItem('agent_original_query', originalQuery);
    console.log('Pending request set:', request.type);
  }

  clearPendingRequest() {
    this.pendingRequest = null;
    this.originalQuery = null;
    localStorage.removeItem('agent_pending_request');
    localStorage.removeItem('agent_original_query');
    console.log('Pending request cleared');
  }

  loadPendingRequest() {
    const requestStr = localStorage.getItem('agent_pending_request');
    const queryStr = localStorage.getItem('agent_original_query');

    if (requestStr && queryStr) {
      try {
        this.pendingRequest = JSON.parse(requestStr);
        this.originalQuery = queryStr;
        console.log('Loaded pending request from storage');
        return true;
      } catch (e) {
        console.error('Error loading pending request:', e);
        this.clearPendingRequest();
        return false;
      }
    }
    return false;
  }

  hasPendingRequest() {
    return this.pendingRequest !== null;
  }

  getPendingRequest() {
    return this.pendingRequest;
  }

  getOriginalQuery() {
    return this.originalQuery;
  }
}

// Export
window.AgentStateManager = AgentStateManager;