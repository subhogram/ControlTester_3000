# --- Integration in app.py for ControlTester, RiskScorer, PolicyQA agent ---
import streamlit as st
from utils.integration_agent import integrate_audit_agent

# Add a mode selector to top of Streamlit UI
mode = st.sidebar.selectbox("Select Chatbot Mode", ["All", "Policy Q&A", "Control Testing", "Risk Scoring"], index=0)
framework = st.sidebar.selectbox("Assessment Framework", ["NIST_CSF", "SOC2", "ISO_27001"], index=0)

# In the chat or Q&A panel
chat_input = st.text_input("Ask a question or request an audit:")
chat_button = st.button("Send")

if chat_button and chat_input:
    # Map mode to context_type
    if mode == "Policy Q&A":
        context_type = "policy"
    elif mode == "Control Testing":
        context_type = "control"
    elif mode == "Risk Scoring":
        context_type = "risk"
    else:
        context_type = None
    
    response = integrate_audit_agent(st.session_state, st.session_state.get('kb_vectorstore'), st.session_state.get('company_kb_vectorstore'), st.session_state.get('evid_vectorstore'), st.session_state.get('selected_model'), chat_input, assessment_framework=framework, context_type=context_type)
    st.markdown(f"**Response:**")
    st.write(response)

    # Optionally: display structured results
def render_structured_response(response):
    if not response:
        return
    t = response.get('type')
    result = response.get('result')
    if t == 'policy_qa':
        st.markdown(f"*{result.get('answer')}*")
        if result.get('sources'):
            st.markdown("**Sources:**")
            for src in result['sources']:
                st.code(src)
    elif t == 'control_test':
        st.markdown("**Control Test Results:**")
        for entry in result.get('control_results', []):
            st.write(f"{entry['control_id']} — {entry['effectiveness_rating']}: {entry['status']}")
            st.write(entry['findings'])
    elif t == 'risk_scoring':
        st.markdown("**Risk Assessment Summary:**")
        st.json(result.get('summary', {}))
        st.markdown("**Top Risks:**")
        for risk in result.get('top_risks', []):
            st.write(risk['risk_name'], '-', risk['risk_level'], risk['description'])

# Call render_structured_response() after receiving response
if chat_button and chat_input:
    render_structured_response(response)

# --- End app.py integration point ---
