
import os
import logging
import streamlit as st
from langchain_ollama import OllamaLLM, OllamaEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.schema import Document
from datetime import datetime

logger = logging.getLogger(__name__)

KPMG_BLUE = "#00338d"
KPMG_COBALT = "#0091da"
KPMG_WHITE = "#ffffff"
KPMG_PURPLE = "#470a68"

def chat_with_bot(kb_vectorstore, company_kb_vectorstore, assessment, 
                  evid_vectorstore, chat_attachment_vectorstore, selected_model):
    """
    Enhanced chat function with full memory integration
    """
    st.markdown(
        f"""
        <style>
        .stApp {{
            background-color: {KPMG_WHITE};
        }}
        div[data-testid="column"] {{
            padding-right: 0px !important;
            padding-left: 0px !important;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )

    # Initialize chat history if not exists (backward compatibility)
    if "chat_history" not in st.session_state:
        st.session_state["chat_history"] = []

    # Use form for input
    with st.form(key="chat_form", clear_on_submit=True):
        user_input = st.text_input("Ask a question about your audit:", key="chat_input")
        col1, col2, col3 = st.columns([2, 2, 2])
        with col1:
            send_clicked = st.form_submit_button("📨 Send")
        with col2:
            clear_clicked = st.form_submit_button(
                "🧹 Clear Chat",
                disabled=len(st.session_state["chat_history"]) == 0,
                help="Clear the chat history and all memory",
            )
        with col3:
            export_clicked = st.form_submit_button(
                "📥 Export",
                disabled=len(st.session_state["chat_history"]) == 0,
                help="Export conversation history"
            )

    # Handle clear
    if clear_clicked:
        import app
        app.clear_all_memory()
        st.success("🧹 All chat history and memory cleared!")
        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    # Handle export
    if export_clicked:
        export_conversation_history()

    # Handle send
    if send_clicked and user_input.strip() != "":
        embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
        embedding_model = OllamaEmbeddings(
            model=embed_name,
            base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
        )

        # Add user message to enhanced history
        import app
        app.add_message_to_enhanced_history('user', user_input, {
            'kb_ready': st.session_state.get('kb_ready', False),
            'company_ready': st.session_state.get('company_files_ready', False),
            'evidence_ready': st.session_state.get('evidence_kb_ready', False)
        })

        logger.info(f"Processing user input with memory: {user_input[:50]}...")

        # Call enhanced chat with full context
        response = chat_with_ai_with_memory(
            kb_vectorstore,
            company_kb_vectorstore,
            evid_vectorstore,
            chat_attachment_vectorstore,
            selected_model,
            user_input,
            embedding_model
        )

        logger.info(f"Generated response length: {len(response)} characters")

        # Add bot response to enhanced history
        context_count = sum([
            kb_vectorstore is not None,
            company_kb_vectorstore is not None,
            evid_vectorstore is not None
        ])
        app.add_message_to_enhanced_history('assistant', response, {
            'model': selected_model,
            'context_sources_used': context_count
        })

        # Add to simple chat history (backward compatibility)
        st.session_state["chat_history"].append({"user": user_input, "bot": response})

        # Save to LangChain memory
        if 'conversation_memory' in st.session_state:
            st.session_state['conversation_memory'].save_context(
                {"input": user_input},
                {"output": response}
            )
            logger.info("Saved to LangChain memory")

        # Update conversation vectorstore
        update_conversation_vectorstore(user_input, response, embedding_model)

        if hasattr(st, "rerun"):
            st.rerun()
        else:
            st.experimental_rerun()

    # Display chat history with styled boxes
    for chat in reversed(st.session_state["chat_history"]):
        user_chat_box(chat["user"])
        bot_chat_box(chat["bot"])


def chat_with_ai_with_memory(kb_vectorstore, company_kb_vectorstore, evid_vectorstore,
                             chat_attachment_vectorstore, selected_model, user_input,
                             embedding_model=None):
    """
    Enhanced chat function with full memory and context integration
    """
    ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    llm = OllamaLLM(model=selected_model, base_url=ollama_base_url)

    # Default embedding model
    if embedding_model is None:
        embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
        embedding_model = OllamaEmbeddings(model=embed_name, base_url=ollama_base_url)

    # ========== GET ALL CONTEXTS ==========

    # 1. Recent conversation from LangChain memory
    conversation_history = ""
    if 'conversation_memory' in st.session_state:
        try:
            memory_vars = st.session_state['conversation_memory'].load_memory_variables({})
            memory_messages = memory_vars.get('chat_history', [])

            # Format messages for prompt
            if memory_messages:
                conversation_history = "\n".join([
                    f"{msg.type}: {msg.content}" if hasattr(msg, 'type') else str(msg)
                    for msg in memory_messages
                ])

            logger.info(f"Loaded {len(memory_messages)} messages from memory")
        except Exception as e:
            logger.error(f"Error loading memory: {e}")
            conversation_history = ""

    # 2. Semantically relevant past conversations
    past_relevant_context = ""
    if st.session_state.get('conversation_vectorstore'):
        try:
            past_relevant = st.session_state['conversation_vectorstore'].similarity_search(
                user_input, k=3
            )
            if past_relevant:
                past_relevant_context = "\n\n".join([
                    f"Past exchange: {doc.page_content}" 
                    for doc in past_relevant
                ])
                logger.info(f"Retrieved {len(past_relevant)} relevant past exchanges")
        except Exception as e:
            logger.error(f"Error retrieving from conversation vectorstore: {e}")

    # 3. Knowledge base contexts
    def safe_similarity_search(store, query):
        if store is None:
            return []
        try:
            test_vec = embedding_model.embed_query("dimension check")
            if len(test_vec) != store.index.d:
                logger.error(f"Embedding dimension mismatch")
                return []
            return store.similarity_search(query, k=3)
        except Exception as e:
            logger.error(f"Error during similarity search: {e}")
            return []

    kb_contexts = safe_similarity_search(kb_vectorstore, user_input)
    company_contexts = safe_similarity_search(company_kb_vectorstore, user_input)
    evid_contexts = safe_similarity_search(evid_vectorstore, user_input)
    chat_file_contexts = safe_similarity_search(chat_attachment_vectorstore, user_input) if chat_attachment_vectorstore else []

    # Format contexts
    kb_context = "\n\n".join([c.page_content for c in kb_contexts]) if kb_contexts else "No policy context available"
    company_kb_context = "\n\n".join([c.page_content for c in company_contexts]) if company_contexts else "No company context available"
    evid_context = "\n\n".join([c.page_content for c in evid_contexts]) if evid_contexts else "No evidence context available"
    chat_files_context = "\n\n".join([c.page_content for c in chat_file_contexts]) if chat_file_contexts else "No chat attachments"

    logger.info(f"Using model: {selected_model}")
    logger.info(f"Context sources - KB: {len(kb_contexts)}, Company: {len(company_contexts)}, Evidence: {len(evid_contexts)}")

    # ========== BUILD ENHANCED PROMPT ==========

    enhanced_prompt = f"""You are a highly capable cybersecurity assistant with comprehensive memory and context awareness.

=== KNOWLEDGE SOURCES ===

**Information Security Standards & Policies:**
{kb_context}

**Company-Specific Policies & Procedures:**
{company_kb_context}

**Security Logs & Evidence:**
{evid_context}

**Chat File Attachments:**
{chat_files_context}

=== CONVERSATION CONTEXT ===

**Recent Conversation History:**
{conversation_history if conversation_history else "No previous conversation"}

**Relevant Past Discussions:**
{past_relevant_context if past_relevant_context else "No relevant past discussions"}

=== CURRENT USER QUESTION ===
{user_input}

=== INSTRUCTIONS ===

1. Use ALL available context to provide the most comprehensive answer possible
2. Reference previous conversations when relevant (e.g., "As we discussed earlier...")
3. Cite your sources by mentioning which context you're using
4. Maintain conversation continuity - build upon previous answers for follow-up questions
5. Be specific and actionable with concrete recommendations
6. Acknowledge limitations if information is missing
7. Maintain a professional cybersecurity audit assistant tone

Your comprehensive response:"""

    try:
        response = llm.invoke(enhanced_prompt)
        return response
    except Exception as e:
        logger.error(f"Error generating response: {e}")
        return f"I apologize, but I encountered an error: {str(e)}"


def update_conversation_vectorstore(user_input, bot_response, embedding_model):
    """
    Add new conversation exchange to vectorstore for semantic retrieval
    """
    try:
        # Create conversation text with context
        conversation_text = f"""User Question: {user_input}

Assistant Response: {bot_response}

Context: This exchange occurred on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"""

        if st.session_state['conversation_vectorstore'] is None:
            # Create new vectorstore
            logger.info("Creating new conversation vectorstore")
            st.session_state['conversation_vectorstore'] = FAISS.from_texts(
                [conversation_text],
                embedding_model
            )
            logger.info("Conversation vectorstore created")
        else:
            # Add to existing vectorstore
            new_doc = [Document(
                page_content=conversation_text,
                metadata={
                    'timestamp': datetime.now().isoformat(),
                    'user_query': user_input[:100]
                }
            )]
            st.session_state['conversation_vectorstore'].add_documents(new_doc)
            logger.info(f"Vectorstore now has {st.session_state['conversation_vectorstore'].index.ntotal} vectors")

    except Exception as e:
        logger.error(f"Error updating conversation vectorstore: {e}")


def export_conversation_history():
    """Export conversation history to JSON"""
    import json

    if not st.session_state.get('enhanced_chat_history'):
        st.warning("No conversation history to export")
        return

    export_data = {
        'metadata': st.session_state['chat_metadata'],
        'conversation': st.session_state['enhanced_chat_history']
    }

    json_str = json.dumps(export_data, indent=2)

    st.download_button(
        label="📥 Download Conversation JSON",
        data=json_str,
        file_name=f"conversation_{st.session_state['chat_metadata']['session_id']}.json",
        mime="application/json"
    )

    logger.info("Conversation history exported")


def user_chat_box(message):
    """Display user message"""
    st.markdown(
        f"""
        <div style='background-color: {KPMG_COBALT}; color: white; padding: 15px; 
        border-radius: 10px; margin: 10px 0; text-align: right;'>
            <strong>You:</strong> {message}
        </div>
        """,
        unsafe_allow_html=True,
    )


def bot_chat_box(message):
    """Display bot message"""
    st.markdown(
        f"""
        <div style='background-color: #f0f0f0; color: black; padding: 15px; 
        border-radius: 10px; margin: 10px 0;'>
            <strong>Assistant:</strong> {message}
        </div>
        """,
        unsafe_allow_html=True,
    )
