import os
import shutil
import streamlit as st
from utils.find_llm import _ollama_models
from utils.file_handlers import save_and_load_files
from utils.llm_chain import build_knowledge_base, assess_evidence_with_kb, generate_workbook, build_evidence_vectorstore
from utils.chat import chat_with_bot
import base64
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings
import requests
import json
import utils.llm_chain as llm_chain

import logging

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# ControlTester 3000 - Cyber Risk Audit Bot
# This is a Streamlit app for a Cyber Risk Audit Bot that allows users to upload policies and evidence files,
# train a knowledge base, assess evidence against the knowledge base, and generate an audit workbook.


VECTORSTORE_PATH = "saved_kb_vectorstore"
MODELS_PATH = "models"  

@st.cache_data(ttl=60)  # Cache for 60 seconds to avoid frequent API calls
def get_ollama_models():
    return _ollama_models()

st.set_page_config(page_title="Control Risk Audit Bot", layout="wide")
with open("kpmg_logo.png", "rb") as logo_file:
    logo_base64 = base64.b64encode(logo_file.read()).decode("utf-8")

st.markdown(
    f"""
    <div style="display: flex; align-items: center; justify-content: flex-end; padding: 12px 0 18px 0; border-bottom: 1px solid #eaeaea;">
        <img src="data:image/png;base64,{logo_base64}" alt="Logo" style="height:48px;">
    </div>
    """,
    unsafe_allow_html=True
)

st.title("🤖 Risk Control Audit Assistant")
st.markdown("Welcome to your Risk Control Assistant. Start by uploading your policies and evidence files below.")

# Check if Ollama is running and get available models
available_models = _ollama_models()
logger.info(f"Available Ollama models: {available_models}")
if not available_models:
    st.error(
        "🚨 **No LLM models found!**\n\n"
        "No Ollama models are available. Please ensure Ollama is running and at least one model is installed.",
        icon="🚨"
    )
    st.stop()


# Model selection
if 'model_selected' not in st.session_state:
    st.session_state['model_selected'] = False
if 'selected_model' not in st.session_state:
    st.session_state['selected_model'] = None


model_disabled = st.session_state['model_selected']

model_choice = st.selectbox(
    "Choose an Ollama model:",
    options=available_models,
    help="Select the Ollama model to use for embeddings and processing",
    disabled=model_disabled,
    key="model_choice"
)

ok_btn = st.button(
    "👍 Confirm Model",
    disabled=model_disabled or model_choice is None,
    help="Confirm model selection"
)

if ok_btn and not st.session_state['model_selected']:
    st.session_state['selected_model'] = model_choice
    st.session_state['model_selected'] = True
    if hasattr(st, "rerun"):
        st.rerun()
    else:
        st.experimental_rerun()

selected_model = st.session_state['selected_model']


# --- Load saved bot at app start ---
if os.path.exists(VECTORSTORE_PATH) and not st.session_state.get('kb_ready', False):
    
    st.session_state['kb_vectorstore'] = FAISS.load_local(
        VECTORSTORE_PATH,
        OllamaEmbeddings(model="llama2"),
        allow_dangerous_deserialization=True
    )
    st.session_state['kb_ready'] = True
    st.session_state['kb_loaded_from_saved'] = True

# --- Step 1: Upload Knowledge Base Documents ---
with st.expander("1️⃣ Upload policy documents", expanded=True):
    
    policy_files = st.file_uploader(
        "Upload Information Security Policies, SOC 2 Reports, or CRI Profiles (PDF, TXT, CSV, XLSX)",
        type=["pdf", "txt", "csv", "xlsx"], accept_multiple_files=True
    )

    # --- Training & Bot Controls ---
    if 'kb_ready' not in st.session_state:
        st.session_state['kb_ready'] = False
    if 'assessment_done' not in st.session_state:
        st.session_state['assessment_done'] = False
    if 'kb_loaded_from_saved' not in st.session_state:
        st.session_state['kb_loaded_from_saved'] = False
    if 'bot_trained_success' not in st.session_state:
        st.session_state['bot_trained_success'] = False
    if 'assessment' not in st.session_state:
        st.session_state['assessment'] = None
    if 'kb_vectorstore' not in st.session_state:
        st.session_state['kb_vectorstore'] = None
    if 'ed_vectorstore' not in st.session_state:
        st.session_state['ed_vectorstore'] = None

     # --- Dynamic Button States ---
    train_disabled = not (policy_files and len(policy_files) > 0)
    save_disabled = not st.session_state.get('bot_trained_success', False)
    delete_disabled = not os.path.exists(VECTORSTORE_PATH)

    col1, col2, col3 = st.columns([2, 2, 2])
    with col1:
        train_btn = st.button(
            "🔄 Train model",
            help="Train bot on uploaded documents",
            disabled=train_disabled,
            key="train_btn"
        )
    with col2:
        save_btn = st.button(
            "💾 Save model",
            disabled=save_disabled,
            help="Save the trained model",
            key="save_btn"
        )
    with col3:
        delete_btn = st.button(
            "🗑️ Delete saved model",
            disabled=delete_disabled,
            help="Delete the saved model",
            key="delete_btn"
        ) 

   # Train bot on KB
    if train_btn:
        with st.spinner("Processing and indexing knowledge base..."):
            kb_docs = save_and_load_files(policy_files)
            llm_chain.initialize(selected_model)
            kb_vectorstore = llm_chain.build_knowledge_base(kb_docs)            
            st.session_state['kb_vectorstore'] = kb_vectorstore
            st.session_state['kb_ready'] = True
            st.session_state['bot_trained_success'] = True  # <-- enable Save on next rerun!
            st.session_state['bot_saved'] = False  # Not yet saved after new training
            st.session_state['kb_loaded_from_saved'] = False
        # Optionally force a rerun so Save enables immediately
        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    # Save trained bot
    if save_btn and not save_disabled:
        if 'kb_vectorstore' in st.session_state and st.session_state['kb_vectorstore'] is not None:
            st.session_state['kb_vectorstore'].save_local(VECTORSTORE_PATH)
            st.success("💾 Trained bot saved successfully!")
            st.session_state['bot_trained_success'] = False
            st.session_state['bot_saved'] = True
            st.session_state['kb_loaded_from_saved'] = True
        else:
            st.error("No trained model to save. Please train the model first.")
        
        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    # Delete previous trained bot
    if delete_btn and not delete_disabled:
        if os.path.exists(VECTORSTORE_PATH):
            shutil.rmtree(VECTORSTORE_PATH)
            st.success("🗑️ Previous trained model deleted successfully.")
            st.session_state['kb_ready'] = False
            st.session_state['kb_vectorstore'] = None
            st.session_state['bot_trained_success'] = False
            st.session_state['bot_saved'] = False
            st.session_state['kb_loaded_from_saved'] = False
        else:
            st.info("No saved model found to delete.")

        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    # Show persistent training success message
    if st.session_state.get('bot_trained_success', False):
        st.success("✅ Model trained and ready!")
    elif st.session_state.get('bot_saved', False):
        st.info("💾 A trained model is saved, ready for use.")
    elif st.session_state.get('kb_loaded_from_saved', False):
        st.warning("💽 A saved trained model is loaded and ready for use.")
    else:
        st.warning("🚫 No trained model loaded. Please train or load a saved model.")

# --- Step 2: Upload Evidence Files ---
with st.expander("2️⃣ Upload evidence files", expanded=True):   
    evidence_files = st.file_uploader(
        "Upload Evidence (Logs, Configs, Screenshots - PDF, TXT, CSV, XLSX, JPEG)",
        type=["pdf", "txt", "csv", "xlsx", "jpeg", "jpg"], accept_multiple_files=True
    )
                
    evidence_ready = st.session_state.get('kb_ready') and (evidence_files is not None and len(evidence_files) > 0)
    process_btn = st.button("🧮 Process evidence & generate workbook", disabled=not evidence_ready, help="Assess uploaded evidence using the knowledge base and generate an audit workbook.")

    if process_btn and evidence_ready:
        with st.spinner("Assessing evidence using knowledge base..."):
            evidence_docs = save_and_load_files(evidence_files)
            ed_vectorstore = build_evidence_vectorstore(evidence_docs)
            assessment = assess_evidence_with_kb(
                evidence_docs,
                st.session_state['kb_vectorstore']
            )
            workbook_path = generate_workbook(assessment)
            st.session_state['assessment'] = assessment
            st.session_state['workbook_path'] = workbook_path
            st.session_state['assessment_done'] = True
            st.session_state['ed_vectorstore'] = ed_vectorstore
        st.success("✅ Evidence processed! Audit workbook ready.")
        st.info("You can now download the audit workbook and chat with the assistant.")  

# --- Step 3: Download ---
if st.session_state.get('assessment_done'):
    with st.expander("3️⃣ Download audit workbook", expanded=True):
        st.subheader("Download Cyber Risk Audit Workbook")
        with open(st.session_state['workbook_path'], "rb") as f:
            st.download_button("⬇️ Download audit workbook", f, file_name="CyberRisk_Audit_Workbook.pdf")       
else:
    with st.expander("3️⃣ Download audit workbook", expanded=False):
        st.info("Process documents first for report generation.")

# --- Step 4: Chat with the Bot ---

with st.expander("4️⃣ Chat with the agent", expanded=True): 
     # Get available models
    if model_disabled:
        st.toast(f"Currently selected model: **{selected_model}**") 

    st.subheader("Chat with the Audit Bot")
    chat_with_bot(st.session_state['kb_vectorstore'], st.session_state['assessment'], st.session_state['ed_vectorstore'],st.session_state['selected_model'])
    if st.session_state.get('assessment_done') or st.session_state.get('kb_ready'):
        st.info("You can now ask questions about your audit and evidence. The bot will assist you based on the knowledge base and processed evidence.")
    else:
        st.warning("Please upload policies and evidence files, then train the bot to start chatting.")