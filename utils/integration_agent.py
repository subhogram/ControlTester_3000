import streamlit as st
from utils.control_tester import ControlTester, run_control_tests
from utils.risk_scoring import RiskScorer, perform_risk_assessment
from utils.policy_qa import PolicyQA
import logging

logger = logging.getLogger(__name__)

# Unified Audit Bot Agent - Streamlit Integration
class ControlAuditAgent:
    def __init__(self, model_name, kb_vectorstore=None, company_vectorstore=None):
        self.model_name = model_name
        self.kb_vectorstore = kb_vectorstore
        self.company_vectorstore = company_vectorstore
        self.control_tester = ControlTester(model_name, kb_vectorstore, company_vectorstore)
        self.risk_scorer = RiskScorer(model_name, kb_vectorstore, company_vectorstore)
        self.policy_qa = PolicyQA(model_name, kb_vectorstore, company_vectorstore)

    def route_query(self, query, context_type=None, evidence_docs=None, framework=None):
        """Route chatbot query to appropriate module"""
        query_lower = query.lower()
        # Default routing logic
        if context_type == 'policy' or any(x in query_lower for x in ['policy', 'require', 'compliance']):
            result = self.policy_qa.answer_question(query)
            return {"type": "policy_qa", "result": result}
        elif context_type == 'control' or any(x in query_lower for x in ['test', 'control', 'evidence', 'assess']):
            if not framework:
                framework = "NIST_CSF"
            results = run_control_tests(evidence_docs, framework, self.model_name, self.kb_vectorstore, self.company_vectorstore)
            return {"type": "control_test", "result": results}
        elif context_type == 'risk' or 'risk' in query_lower:
            assessment = None
            if evidence_docs and framework:
                assessment_results = run_control_tests(evidence_docs, framework, self.model_name, self.kb_vectorstore, self.company_vectorstore)
                assessment = assessment_results['control_results']
            else:
                assessment = []
            risk_report = perform_risk_assessment(assessment, evidence_docs or [], self.model_name, self.kb_vectorstore, self.company_vectorstore)
            return {"type": "risk_scoring", "result": risk_report}
        else:
            # fallback to policy QA
            result = self.policy_qa.answer_question(query)
            return {"type": "policy_qa", "result": result}

# Streamlit app integration utility

def integrate_audit_agent(st_state, kb_vectorstore, company_vectorstore, evidence_docs, selected_model, chat_input, assessment_framework=None, context_type=None):
    """Integrate ControlAuditAgent for chatbot and audit workflows"""
    agent = ControlAuditAgent(selected_model, kb_vectorstore, company_vectorstore)
    response = agent.route_query(chat_input, context_type=context_type, evidence_docs=evidence_docs, framework=assessment_framework)
    return response

# Usage Example in app.py or Streamlit app panel:
# response = integrate_audit_agent(st.session_state, st.session_state['kb_vectorstore'], st.session_state['company_kb_vectorstore'], evidence_docs, selected_model, chat_input, assessment_framework='NIST_CSF', context_type='control')
# st.write(response)
