import streamlit as st
from utils.find_llm import _ollama_models
from langchain_ollama import OllamaLLM
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import logging

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# KPMG color palette (approximate hex values)
KPMG_BLUE = "#00338d"
KPMG_LIGHT_BLUE = "#0077c8"
KPMG_GREY = "#f4f4f4"
KPMG_WHITE = "#ffffff"

def user_chat_box(message):
    st.markdown(
        f"""
        <div style="
            background-color: {KPMG_LIGHT_BLUE};
            color: {KPMG_WHITE};
            border-radius: 12px;
            padding: 12px 16px;
            margin-bottom: 8px;
            margin-left: 40px;
            text-align: right;
            box-shadow: 0 2px 8px rgba(0, 51, 141, 0.07);
            font-size: 1rem;">
            <b>You:</b> {message}
        </div>
        """,
        unsafe_allow_html=True,
    )

def bot_chat_box(message):
    st.markdown(
        f"""
        <div style="
            background-color: {KPMG_GREY};
            color: {KPMG_BLUE};
            border-radius: 12px;
            padding: 12px 16px;
            margin-bottom: 16px;
            margin-right: 40px;
            text-align: left;
            box-shadow: 0 2px 8px rgba(0, 51, 141, 0.04);
            font-size: 1rem;">
            <b>Bot:</b> {message}
        </div>
        """,
        unsafe_allow_html=True,
    )

def chat_with_bot(kb_vectorstore, company_kb_vectorstore, assessment, evid_vectorstore, merged_vectorstore, selected_model):    
    st.markdown(
        f"""
        <style>
        .stApp {{
            background-color: {KPMG_WHITE};
        }}
        /* Remove extra spacing between columns for buttons */
        div[data-testid="column"] {{
            padding-right: 0px !important;
            padding-left: 0px !important;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )

    if "chat_history" not in st.session_state:
        st.session_state["chat_history"] = []  

    # Use form so Enter submits as Send
    with st.form(key="chat_form", clear_on_submit=True):
        user_input = st.text_input("Ask a question about your audit:", key="chat_input")
        col1, col2, _ = st.columns([2, 2, 2])
        with col1:
            send_clicked = st.form_submit_button("📨 Send")
        with col2:
            clear_clicked = st.form_submit_button(
                "🧹 Clear Chat",
                disabled=len(st.session_state["chat_history"]) == 0,
                help="Clear the chat history",

            )

    if clear_clicked:
        st.session_state["chat_history"] = []
        if hasattr(st, "rerun"):
                st.rerun()
        else:
            st.experimental_rerun()

    if send_clicked and user_input.strip() != "":
        llm=OllamaLLM(model=selected_model)
        kb_contexts = kb_vectorstore.similarity_search(user_input, k=3)
        kb_context = "\n\n".join([c.page_content for c in kb_contexts])

        company_contexts = company_kb_vectorstore.similarity_search(user_input, k=3)
        company_kb_context = "\n\n".join([c.page_content for c in company_contexts])

        evid_contexts = evid_vectorstore.similarity_search(user_input, k=3)
        evid_context = "\n\n".join([c.page_content for c in evid_contexts])

        logger.info(f"Using model: {selected_model} for chat response")  

        cybersecurity_bot_prompt = PromptTemplate(
            input_variables=[
                "user_input",
                "kb_context",
                "company_kb_context",
                "evid_context"
            ],
            template="""
                    You are a highly capable cybersecurity assistant. You have access to the following contextual sources:

                    --- BASE CYBERSECURITY KNOWLEDGE ---
                    {kb_context}

                    --- COMPANY CYBERSECURITY POLICIES ---
                    {company_kb_context}

                    --- EVIDENCE (LOGS, FILES, OBSERVATIONS) ---
                    {evid_context}

                    --- USER QUESTION OR TASK ---
                    {user_input}

                    Instructions:
                    - Answer any question regarding cybersecurity, company policy, security audit, analysis of logs, compliance, or best practices, using the most relevant context above.
                    - If asked to perform an analysis, provide a thorough, step-by-step evaluation.
                    - If asked for a report or compliance summary, format your answer as a clear, well-structured analysis that can be directly used for PDF generation.
                    - Always reference the context you used in your answer.
                    - If information is missing, clearly state the assumptions or request clarification.

                    Your output should be to the point, detailed, actionable, tabular (if doing comparisions) and ready for inclusion in a professional PDF report.
                    """
        )

        chain = LLMChain(llm=llm, prompt=cybersecurity_bot_prompt)
      
        response = response = chain.run({
                "user_input": user_input,
                "kb_context": kb_context,
                "company_kb_context": company_kb_context,
                "evid_context": evid_context
            })
        logger.info(f"Generated Prompt: {cybersecurity_bot_prompt}")
        logger.info(f"User input: {user_input}")
        st.session_state["chat_history"].append({"user": user_input, "bot": response})
        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    # Display chat history with styled boxes
    for chat in reversed(st.session_state["chat_history"]):
        user_chat_box(chat["user"])
        bot_chat_box(chat["bot"])
