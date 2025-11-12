# Phase 1: Chat History Context Management - Complete Implementation Guide

## Overview

This guide implements conversation memory and context management for ControlTester_3000. After implementation, your chat agent will:

- ✅ Remember previous conversations (last 10 exchanges)
- ✅ Semantically search through entire conversation history  
- ✅ Integrate conversation context with knowledge bases
- ✅ Display memory statistics to users
- ✅ Export conversation history

## Architecture

```
┌─────────────────────────────────────────────────┐
│         User Input                              │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  ConversationBufferWindowMemory                 │
│  (Last 10 message pairs)                        │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  Conversation Vectorstore (FAISS)               │
│  (Semantic retrieval of all past exchanges)     │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  Context Integration                            │
│  • KB Vectorstore                               │
│  • Company KB Vectorstore                       │
│  • Evidence Vectorstore                         │
│  • Conversation Memory                          │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  LLM Response with Full Context                 │
└─────────────────────────────────────────────────┘
```

## Step 1: Modify `app.py`

### 1.1 Add New Imports (Top of file)

```python
# Add after your existing imports
from langchain.memory import ConversationBufferWindowMemory, ConversationSummaryBufferMemory
from langchain_community.chat_message_histories import StreamlitChatMessageHistory
from datetime import datetime
```

### 1.2 Add Memory Initialization Functions

Add this code **after** the `MODELS_PATH` definition and **before** `st.set_page_config`:

```python
# ============================================================================
# PHASE 1: CONVERSATION MEMORY INITIALIZATION
# ============================================================================

def initialize_conversation_memory():
    """
    Initialize all memory systems for the chat.
    This runs once when the app starts.
    """
    
    # 1. LangChain conversation memory - keeps last K exchanges
    if 'conversation_memory' not in st.session_state:
        logger.info("Initializing conversation memory")
        message_history = StreamlitChatMessageHistory(key="chat_messages_history")
        st.session_state['conversation_memory'] = ConversationBufferWindowMemory(
            chat_memory=message_history,
            k=10,  # Keep last 10 message pairs
            return_messages=True,
            memory_key="chat_history",
            input_key="input",
            output_key="output"
        )
    
    # 2. Conversation vectorstore for semantic retrieval
    if 'conversation_vectorstore' not in st.session_state:
        st.session_state['conversation_vectorstore'] = None
        logger.info("Conversation vectorstore initialized as None")
    
    # 3. Enhanced chat history with metadata
    if 'enhanced_chat_history' not in st.session_state:
        st.session_state['enhanced_chat_history'] = []
        st.session_state['chat_metadata'] = {
            'session_id': datetime.now().strftime('%Y%m%d_%H%M%S'),
            'total_messages': 0,
            'session_start': datetime.now().isoformat()
        }
        logger.info(f"Enhanced chat history initialized for session: {st.session_state['chat_metadata']['session_id']}")

def clear_all_memory():
    """Clear all memory systems"""
    logger.info("Clearing all memory systems")
    
    # Clear LangChain memory
    if 'conversation_memory' in st.session_state:
        st.session_state['conversation_memory'].clear()
    
    # Clear conversation vectorstore
    st.session_state['conversation_vectorstore'] = None
    
    # Clear enhanced history
    st.session_state['enhanced_chat_history'] = []
    st.session_state['chat_metadata']['total_messages'] = 0
    
    # Clear old chat history (backward compatibility)
    st.session_state['chat_history'] = []
    
    logger.info("All memory systems cleared")

def add_message_to_enhanced_history(role, content, metadata=None):
    """Add message to enhanced chat history with full metadata"""
    message = {
        'role': role,
        'content': content,
        'timestamp': datetime.now().isoformat(),
        'message_id': st.session_state['chat_metadata']['total_messages'],
        'metadata': metadata or {}
    }
    
    st.session_state['enhanced_chat_history'].append(message)
    st.session_state['chat_metadata']['total_messages'] += 1
    
    logger.info(f"Added {role} message #{message['message_id']} to enhanced history")

# Initialize memory at module level
initialize_conversation_memory()
```

### 1.3 Replace Step 4 Chat Section

Replace your existing `# --- Step 4: Chat with the Bot ---` section with:

```python
# --- Step 4: Chat with the Bot (ENHANCED WITH MEMORY) ---
with st.expander("4️⃣ Chat with the agent", expanded=True):
    if model_disabled:
        st.toast(f"Currently selected model: **{selected_model}**")

    st.subheader("Chat with the Audit Bot")
    
    # Display conversation statistics
    if st.session_state['chat_metadata']['total_messages'] > 0:
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Messages", st.session_state['chat_metadata']['total_messages'])
        with col2:
            session_id = st.session_state['chat_metadata']['session_id'][-8:]
            st.metric("Session", session_id)
        with col3:
            context_count = sum([
                st.session_state.get('kb_ready', False),
                st.session_state.get('company_files_ready', False),
                st.session_state.get('evidence_kb_ready', False)
            ])
            st.metric("Context Sources", f"{context_count}/3")
    
    # Call enhanced chat function
    chat_with_bot(
        st.session_state['kb_vectorstore'],
        st.session_state['company_kb_vectorstore'],
        st.session_state['assessment'],
        st.session_state['evid_vectorstore'],
        None,
        st.session_state['selected_model']
    )
    
    # Show contextual information
    if st.session_state.get('assessment_done') or st.session_state.get('kb_ready') or st.session_state.get('company_files_ready'):
        st.info("💡 The bot has access to conversation history and can reference previous discussions.")
    else:
        st.warning("Please upload policies and files, then train the bot to start chatting.")
    
    # Display memory statistics in expander
    if st.session_state['chat_metadata']['total_messages'] > 0:
        with st.expander("📊 Memory Statistics", expanded=False):
            st.write("**Session Information:**")
            st.json(st.session_state['chat_metadata'])
            
            # Show memory contents
            if 'conversation_memory' in st.session_state:
                try:
                    memory_vars = st.session_state['conversation_memory'].load_memory_variables({})
                    st.write("**Loaded Memory Variables:**")
                    st.write(f"History length: {len(str(memory_vars.get('chat_history', '')))} characters")
                except Exception as e:
                    st.write(f"Memory status: {str(e)}")
            
            # Show vectorstore status
            if st.session_state['conversation_vectorstore']:
                st.write(f"**Conversation Vectorstore:** {st.session_state['conversation_vectorstore'].index.ntotal} vectors")
            else:
                st.write("**Conversation Vectorstore:** Not yet created")
```

## Step 2: Modify `utils/chat.py`

### 2.1 Add New Imports (Top of file)

```python
# Add after your existing imports
from langchain.schema import Document
from datetime import datetime
```

### 2.2 Update `chat_with_bot` Function

Replace your entire `chat_with_bot` function with this enhanced version:

```python
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
```

### 2.3 Add New Enhanced Chat Function

Add this new function after `chat_with_bot`:

```python
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
    
    # 3. Knowledge base contexts (your existing code)
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
```

### 2.4 Add Vectorstore Update Function

Add this new function:

```python
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
```

### 2.5 Add Export Function

Add this new function:

```python
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
```

## Testing Phase 1

### Test 1: Basic Memory
1. Start the app
2. Upload policies
3. Ask: "What are the key security policies?"
4. Ask: "What did we just discuss?"
   - ✅ Expected: Bot references the previous exchange

### Test 2: Follow-up Questions
1. Ask: "What is access control?"
2. Ask: "Can you elaborate on that?"
3. Ask: "What are best practices for the previous topic?"
   - ✅ Expected: Bot understands context from previous messages

### Test 3: Memory Persistence
1. Have a 10+ message conversation
2. Ask about something from message #2
   - ✅ Expected: Bot retrieves from conversation vectorstore

### Test 4: Memory Statistics
1. Check the metrics displayed (Messages, Session, Context Sources)
2. Click on "Memory Statistics" expander
   - ✅ Expected: See session info and vectorstore count

### Test 5: Clear Memory
1. Have a conversation
2. Click "Clear Chat"
   - ✅ Expected: All history cleared, memory reset

### Test 6: Context Integration
1. Upload policies, company docs, and evidence
2. Ask a question requiring all three
   - ✅ Expected: Bot uses all contexts + conversation history

## Troubleshooting

### Issue: Import errors for StreamlitChatMessageHistory
**Solution:** Ensure you have langchain-community installed:
```bash
pip install langchain-community
```

### Issue: Memory not persisting
**Solution:** Check that `initialize_conversation_memory()` is called at module level in app.py

### Issue: Vectorstore dimension mismatch
**Solution:** Ensure the same embedding model is used throughout. Check `OLLAMA_EMBEDDING_MODEL` environment variable.

### Issue: Clear button not working
**Solution:** Verify the import statement `import app` works in utils/chat.py

## Expected Behavior After Phase 1

✅ Bot remembers previous exchanges (last 10 message pairs)
✅ Bot can reference specific past discussions
✅ Semantic search through entire conversation history
✅ Memory statistics visible to user
✅ Conversation context integrated with knowledge bases
✅ Export functionality for conversation history

## Next Steps

Once Phase 1 is tested and working:
- **Phase 2** will add active feedback loops where the agent can request files or clarifications
- **Phase 3** will add proactive suggestions and workflow guidance

---

**Need Help?** Open an issue in the repository with Phase 1 in the title.
