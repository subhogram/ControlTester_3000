import streamlit as st
from utils.find_llm import _ollama_models
from langchain_ollama import OllamaEmbeddings, OllamaLLM
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import logging
import os

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

def chat_with_bot(kb_vectorstore, company_kb_vectorstore, assessment, evid_vectorstore, chat_attachment_vectorstore, selected_model):    
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
        embedding_model = OllamaEmbeddings(model="llama3:latest", base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434'))
        cybersecurity_bot_prompt, response = chat_with_ai(kb_vectorstore, company_kb_vectorstore, evid_vectorstore, chat_attachment_vectorstore, selected_model, user_input,embedding_model)
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

def chat_with_ai(kb_vectorstore, company_kb_vectorstore, evid_vectorstore, chat_attachment_vectorstore, selected_model, user_input,embedding_model = None):
    ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    llm = OllamaLLM(model=selected_model, base_url=ollama_base_url)

    # Default embedding model (must be SAME one used when building vectorstores!)
    if embedding_model is None:
        embedding_model = OllamaEmbeddings(model="llama3:latest", base_url=ollama_base_url)

    # Debug: check FAISS dimension consistency
    def safe_similarity_search(store, query):
        if store is None:
            return []
        try:
            test_vec = embedding_model.embed_query("dimension check")
            if len(test_vec) != store.index.d:
                raise ValueError(
                    f"Embedding dimension mismatch: model={len(test_vec)}, faiss={store.index.d}. "
                    f"Rebuild the FAISS index with the correct embedding model."
                )
            return store.similarity_search(query, k=3)
        except Exception as e:
            logger.error(f"Error during similarity search: {e}")
            return []

    kb_contexts = safe_similarity_search(kb_vectorstore, user_input)
    company_contexts = safe_similarity_search(company_kb_vectorstore, user_input)
    evid_contexts = safe_similarity_search(evid_vectorstore, user_input)
    chat_file_contexts = safe_similarity_search(chat_attachment_vectorstore, user_input) if chat_attachment_vectorstore else []

    kb_context = "\n\n".join([c.page_content for c in kb_contexts]) if kb_contexts else None
    company_kb_context = "\n\n".join([c.page_content for c in company_contexts]) if company_contexts else None
    evid_context = "\n\n".join([c.page_content for c in evid_contexts]) if evid_contexts else None

    logger.info(f"Using model: {selected_model} for chat response")  

    cybersecurity_bot_prompt = PromptTemplate(
            input_variables=[
                "user_input",
                "kb_context",
                "company_kb_context",
                "evid_context",
                "chat_file_contexts"
            ],
            template="""
                    You are a highly capable cybersecurity assistant. You have access to the following contextual sources:
                    You have a base level understanding of cybersecurity risk and control policies from : {kb_context}
                    You have an understanding of company-specific policies, procedures, and guidelines from : {company_kb_context}
                    You have access to the following uploaded files context : {chat_file_contexts}
                    You have access to the following log evidences : {evid_context}                   
                    --- USER QUESTION OR TASK ---
                    {user_input}
                    Instructions:
                    - Answer any question regarding cybersecurity, company policy, security audit, analysis of logs, compliance, or best practices, using the most relevant source above.                   
                    - If asked to perform an analysis, provide a thorough, step-by-step evaluation.
                    - If asked for a report or compliance summary, format your answer as a clear, well-structured analysis that can be directly used for generation.
                    - Always reference the context you used in your answer.
                    - If information is missing, clearly state the assumptions or request clarification.
                    - For all other cases, including but not limited to recommendations, factual queries and more, you provide insightful and in-depth responses. Your goal is to leave the user feeling like no stone has been left unturned. Responses that are too short are lazy. DO NOT be lazy. Be thoughtful.
                    - If asked about something you do not understand or is out of scope, just reply with "Sorry! I don't understand this"
                    - For small talk, like 'Hi' or 'Hello' just reply with "Hi! How may I assist you today?".
                    Your output should be comprehensive, detailed, actionable, tabular (if doing comparisions).
                    """
        )

    chain = LLMChain(llm=llm, prompt=cybersecurity_bot_prompt)
      
    response = response = chain.run({
                "user_input": user_input,
                "kb_context": kb_context,
                "company_kb_context": company_kb_context,
                "evid_context": evid_context,
                "chat_file_contexts": chat_file_contexts
            })
        
    return cybersecurity_bot_prompt,response