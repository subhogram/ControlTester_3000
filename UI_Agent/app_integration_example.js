// --- Integration in UI_Agent/app.js for ControlTester, RiskScorer, PolicyQA agent ---
import { integrateAuditAgent } from "./integration_agent";

function mapModeToContextType(mode) {
  if (mode === 'Policy Q&A') return 'policy';
  if (mode === 'Control Testing') return 'control';
  if (mode === 'Risk Scoring') return 'risk';
  return null;
}

// Handler for chatbox send or submit
async function onChatSubmit(chatInput, mode, framework, kbVector, companyVector, evidVector, selectedModel) {
  const contextType = mapModeToContextType(mode);
  // integrateAuditAgent is wrapped to invoke Python backend (via window.pywebview/api call or HTTP API)
  // This function must be wired in index.html or chat.js wherever user submits a question
  const response = await integrateAuditAgent({
    kb_vectorstore: kbVector,
    company_vectorstore: companyVector,
    evidence_docs: evidVector,
    selected_model: selectedModel,
    chat_input: chatInput,
    assessment_framework: framework,
    context_type: contextType,
  });

  renderStructuredResponse(response);
}

function renderStructuredResponse(response) {
  if (!response) return;
  let t = response.type;
  let result = response.result || {};
  if (t === 'policy_qa') {
    // Show answer and sources
    document.querySelector("#chat-response").innerText = result.answer;
    // Optionally display sources
  } else if (t === 'control_test') {
    // Render table or cards of control results
    // ...
  } else if (t === 'risk_scoring') {
    // Render summary and risks
    // ...
  }
}

// --- End UI_Agent/app.js integration point ---
