import streamlit as st
from utils.find_llm import _ollama_models
from langchain_ollama import OllamaLLM
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


def chat_with_bot(kb_vectorstore, assessment, ed_vectorstore, selected_model):    
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

        ed_contexts = ed_vectorstore.similarity_search(user_input, k=3)
        ed_context = "\n\n".join([c.page_content for c in ed_contexts])

        logger.info(f"Using model: {selected_model} for chat response")      
        
        # Use both the knowledge base and the assessment for context
       
        prompt = (
            f"You are an information security audit assistant.\n"
            f"You possess deep knowledge of cyber security risk control policies and reports.\n"
            f"You possess skills of cyber crisis leadership and strategic planning for risk analysis, resilience design and control implementation and document writing.\n"
            f"1. You will gain insights and knowledge from Policy context and evaluate the scenarios from the evidence context to answer the user question.\n"
            f"2. If the user refers to a file name, quote the file name and its associated context and metadata to answer accurately.\n"
            f"3. If user asks question not related to context, just say that 'I don't know' but don't make up an answer on your own.\n"
            f"4. When doing comparison, try to answer in a tabular format with rows and columns.\n"
            f"5. Try to answer in visually appealing manner with markdown formatting, tables, bullet points, and other formatting techniques.\n"
            f"6. Always quote policy/regulatory statements and file name from Policy Context (with metadata) when making an answer.\n"
            f"7. Always quote evidence statements and file name from Evidence Context (with metadata) when making an answer.\n"
            f"User question: {user_input}\n"
            f"Policy Context (with metadata):\n{kb_context}\n"
            f"Evidence Context (with metadata):\n{ed_context}\n"
        )

        if(assessment is not None and len(assessment) > 0):
            assessment_context = "\n\n".join(a['assessment'] for a in assessment[:3])
            prompt.join(
                f"5. You need to provide summarized analytical answers based on assessment report by tallying them to context.\n"
                f"Assessment report:\n{assessment_context}\n\n")

              
        response = llm.invoke(prompt)
        logger.info(f"Generated Prompt: {prompt}")
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
