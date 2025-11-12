# Phase 2: Active Feedback Loops - Complete Implementation

This guide implements intelligent agent behavior where the assistant actively prompts users for missing files, clarifications, or additional context when needed.

---

## Overview

Phase 2 transforms your chat agent from passive to **proactive**:

- ✅ Detects missing knowledge bases (policies, company docs, evidence)
- ✅ Requests specific files with clear instructions
- ✅ Asks clarifying questions when user input is vague
- ✅ Manages conversation state machine
- ✅ Dynamic UI rendering based on agent needs
- ✅ Enhanced prompts for decision-making

---

## Architecture

```
User Query
    ↓
┌─────────────────────────────────┐
│ Agent Decision Engine           │
│ - Analyze query requirements    │
│ - Check available context       │
│ - Detect missing resources       │
└─────────────┬───────────────────┘
              ↓
    ┌─────────┴─────────┐
    │                   │
 Missing?            All Present?
    │                   │
    ↓                   ↓
┌───────────┐    ┌──────────────┐
│ Request   │    │ Process      │
│ Missing   │    │ Normally     │
│ Resources │    │              │
└───────────┘    └──────────────┘
```

---

# Part 1: Streamlit Implementation (app.py + utils/chat.py)

## 1.1 Add Agent State Management to `app.py`

Add after your existing session state initializations:

```python
# ============================================================================
# PHASE 2: AGENT STATE MANAGEMENT
# ============================================================================

def initialize_agent_state():
    """Initialize agent state for feedback loops"""
    
    if 'agent_pending_request' not in st.session_state:
        st.session_state['agent_pending_request'] = None
    
    if 'original_query' not in st.session_state:
        st.session_state['original_query'] = None
    
    if 'request_counter' not in st.session_state:
        st.session_state['request_counter'] = 0

# Call this after initialize_conversation_memory()
initialize_agent_state()
```

## 1.2 Add Decision Logic to `utils/chat.py`

Add these new functions to `utils/chat.py`:

```python
# ============================================================================
# PHASE 2: AGENT DECISION LOGIC
# ============================================================================

def analyze_query_needs(user_input: str, kb_vectorstore, company_kb_vectorstore, 
                       evid_vectorstore) -> dict:
    """
    Analyze user query to determine if agent can proceed or needs additional context.
    
    Returns:
        dict with keys:
            - can_proceed: bool
            - missing_context: list of missing resource types
            - clarification_needed: bool
            - reasoning: str explaining the decision
    """
    needs = {
        'can_proceed': True,
        'missing_context': [],
        'clarification_needed': False,
        'reasoning': ''
    }
    
    query_lower = user_input.lower()
    
    # Define keyword patterns for different contexts
    policy_keywords = ['policy', 'policies', 'standard', 'standards', 'guideline', 
                      'compliance', 'regulation', 'requirement', 'framework']
    evidence_keywords = ['assess', 'audit', 'test', 'verify', 'evidence', 'log', 
                        'logs', 'analyze', 'review', 'check', 'examine', 'investigate']
    company_keywords = ['company', 'organization', 'soc', 'soc2', 'cri', 'profile',
                       'specific', 'our', 'internal']
    
    # Check for missing knowledge bases
    if any(keyword in query_lower for keyword in policy_keywords):
        if not kb_vectorstore:
            needs['can_proceed'] = False
            needs['missing_context'].append('policy_documents')
            needs['reasoning'] = 'Query requires security policies/standards but none are loaded'
    
    if any(keyword in query_lower for keyword in evidence_keywords):
        if not evid_vectorstore:
            needs['can_proceed'] = False
            needs['missing_context'].append('evidence_files')
            needs['reasoning'] = 'Query requires evidence/log files for assessment but none are loaded'
    
    if any(keyword in query_lower for keyword in company_keywords):
        if not company_kb_vectorstore:
            needs['can_proceed'] = False
            needs['missing_context'].append('company_documents')
            needs['reasoning'] = 'Query requires company-specific documents but none are loaded'
    
    # Check for vague queries
    words = user_input.strip().split()
    if len(words) < 3:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is too vague or short to determine intent'
    
    # Check for generic/ambiguous queries
    generic_patterns = ['help', 'hi', 'hello', 'what can you do', 'explain', 'tell me']
    if any(pattern in query_lower for pattern in generic_patterns) and len(words) < 5:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is generic and needs more specific context'
    
    logger.info(f"Query analysis: can_proceed={needs['can_proceed']}, "
               f"missing={needs['missing_context']}, needs_clarification={needs['clarification_needed']}")
    
    return needs


def create_agent_request(needs: dict) -> dict:
    """
    Create a structured request for user to provide missing context.
    
    Args:
        needs: Output from analyze_query_needs()
    
    Returns:
        dict with request details or None if no request needed
    """
    if not needs['missing_context'] and not needs['clarification_needed']:
        return None
    
    if needs['clarification_needed']:
        return {
            'type': 'clarification',
            'message': generate_clarification_message(needs['reasoning']),
            'request_id': st.session_state.get('request_counter', 0)
        }
    
    if needs['missing_context']:
        # Map missing context to file requirements
        file_requirements = {
            'policy_documents': {
                'description': 'information security policies and standards',
                'examples': 'ISO 27001, NIST frameworks, security policies',
                'accepted_types': ['pdf', 'txt', 'docx', 'xlsx'],
                'category': 'policy'
            },
            'evidence_files': {
                'description': 'security logs, audit evidence, or system outputs',
                'examples': 'access logs, firewall logs, configuration files',
                'accepted_types': ['log', 'txt', 'csv', 'pdf', 'json'],
                'category': 'evidence'
            },
            'company_documents': {
                'description': 'company-specific documents',
                'examples': 'SOC 2 reports, CRI profiles, internal policies',
                'accepted_types': ['pdf', 'txt', 'docx', 'xlsx'],
                'category': 'company'
            }
        }
        
        # Get first missing item (handle one at a time)
        missing_type = needs['missing_context'][0]
        file_req = file_requirements.get(missing_type, {
            'description': 'required files',
            'examples': 'relevant documentation',
            'accepted_types': ['pdf', 'txt'],
            'category': 'general'
        })
        
        message = generate_file_request_message(missing_type, file_req, needs['reasoning'])
        
        return {
            'type': 'file_upload',
            'message': message,
            'file_category': file_req['category'],
            'accepted_types': file_req['accepted_types'],
            'missing_type': missing_type,
            'request_id': st.session_state.get('request_counter', 0)
        }
    
    return None


def generate_clarification_message(reasoning: str) -> str:
    """Generate a helpful clarification message"""
    base_message = "I'd like to help you better. "
    
    suggestions = [
        "Could you please provide more details about what you'd like to know?",
        "",
        "For example, you could ask:",
        "• 'What are the key access control policies?'",
        "• 'Assess my firewall logs for compliance'",
        "• 'Compare our practices with SOC 2 requirements'"
    ]
    
    return base_message + "\n".join(suggestions)


def generate_file_request_message(missing_type: str, file_req: dict, reasoning: str) -> str:
    """Generate a clear file request message"""
    
    message_templates = {
        'policy_documents': """📋 **Missing Security Policies**

To answer your question, I need access to your security policies and standards.

**What I need:**
{description}

**Examples:**
{examples}

**How to proceed:**
1. Upload your policy documents using the file uploader below
2. Accepted formats: {formats}
3. I'll process them and answer your question

{reasoning}""",
        
        'evidence_files': """🔍 **Missing Evidence Files**

To perform the assessment you requested, I need the relevant evidence or log files.

**What I need:**
{description}

**Examples:**
{examples}

**How to proceed:**
1. Upload your log/evidence files using the file uploader below
2. Accepted formats: {formats}
3. I'll analyze them against the security standards

{reasoning}""",
        
        'company_documents': """🏢 **Missing Company Documents**

To provide company-specific guidance, I need your organization's documentation.

**What I need:**
{description}

**Examples:**
{examples}

**How to proceed:**
1. Upload your company documents using the file uploader below
2. Accepted formats: {formats}
3. I'll tailor my response to your organization

{reasoning}"""
    }
    
    template = message_templates.get(missing_type, 
                                    "I need {description} to proceed. Please upload files ({formats}).")
    
    formats = ', '.join(file_req['accepted_types'])
    
    return template.format(
        description=file_req['description'],
        examples=file_req['examples'],
        formats=formats.upper(),
        reasoning=f"\n*Why: {reasoning}*" if reasoning else ""
    )
```

## 1.3 Enhanced Chat Function with Decision Logic

Replace your `chat_with_bot` function in `utils/chat.py` with this enhanced version:

```python
def chat_with_bot(kb_vectorstore, company_kb_vectorstore, assessment, 
                  evid_vectorstore, chat_attachment_vectorstore, selected_model):
    """
    Enhanced chat function with active feedback loop.
    Analyzes user queries and requests missing context before proceeding.
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

    if "chat_history" not in st.session_state:
        st.session_state["chat_history"] = []

    # Check if agent is waiting for user input
    if st.session_state.get('agent_pending_request'):
        render_pending_request_ui(
            kb_vectorstore, company_kb_vectorstore, evid_vectorstore,
            chat_attachment_vectorstore, selected_model
        )
        return

    # Normal chat flow
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

    if clear_clicked:
        import app
        app.clear_all_memory()
        st.session_state['agent_pending_request'] = None
        st.session_state['original_query'] = None
        st.success("🧹 All chat history and memory cleared!")
        st.rerun()
    
    if export_clicked:
        export_conversation_history()

    if send_clicked and user_input.strip() != "":
        embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
        embedding_model = OllamaEmbeddings(
            model=embed_name,
            base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
        )
        
        # PHASE 2: Analyze query before proceeding
        needs = analyze_query_needs(
            user_input,
            kb_vectorstore,
            company_kb_vectorstore,
            evid_vectorstore
        )
        
        # Create agent request if needed
        agent_request = create_agent_request(needs)
        
        if not needs['can_proceed'] or needs['clarification_needed']:
            # Cannot proceed - request missing context
            st.session_state['agent_pending_request'] = agent_request
            st.session_state['original_query'] = user_input
            st.session_state['request_counter'] += 1
            
            # Add to chat history
            st.session_state["chat_history"].append({
                "user": user_input,
                "bot": agent_request['message']
            })
            
            logger.info(f"Agent requesting: {agent_request['type']}")
            st.rerun()
        else:
            # Can proceed normally
            import app
            app.add_message_to_enhanced_history('user', user_input, {
                'kb_ready': kb_vectorstore is not None,
                'company_ready': company_kb_vectorstore is not None,
                'evidence_ready': evid_vectorstore is not None
            })
            
            response = chat_with_ai_with_memory(
                kb_vectorstore,
                company_kb_vectorstore,
                evid_vectorstore,
                chat_attachment_vectorstore,
                selected_model,
                user_input,
                embedding_model
            )
            
            app.add_message_to_enhanced_history('assistant', response, {
                'model': selected_model
            })
            
            st.session_state["chat_history"].append({"user": user_input, "bot": response})
            
            if 'conversation_memory' in st.session_state:
                st.session_state['conversation_memory'].save_context(
                    {"input": user_input},
                    {"output": response}
                )
            
            update_conversation_vectorstore(user_input, response, embedding_model)
            st.rerun()

    # Display chat history
    for chat in reversed(st.session_state["chat_history"]):
        user_chat_box(chat["user"])
        bot_chat_box(chat["bot"])


def render_pending_request_ui(kb_vectorstore, company_kb_vectorstore, evid_vectorstore,
                               chat_attachment_vectorstore, selected_model):
    """Render UI for pending agent request (file upload or clarification)"""
    
    request = st.session_state['agent_pending_request']
    original_query = st.session_state.get('original_query', '')
    
    if request['type'] == 'file_upload':
        st.warning("📁 **The assistant needs additional files to continue**")
        st.info(request['message'])
        
        # Show file uploader
        uploaded_files = st.file_uploader(
            f"Upload {request['file_category']} files",
            type=request['accepted_types'],
            accept_multiple_files=True,
            key=f"agent_request_upload_{request['request_id']}"
        )
        
        col1, col2 = st.columns([1, 3])
        with col1:
            submit_files = st.button("✅ Submit Files", disabled=not uploaded_files)
        with col2:
            cancel = st.button("❌ Cancel")
        
        if cancel:
            st.session_state['agent_pending_request'] = None
            st.session_state['original_query'] = None
            st.info("Request cancelled. You can ask a different question.")
            st.rerun()
        
        if submit_files and uploaded_files:
            # Process uploaded files
            with st.spinner("Processing uploaded files..."):
                missing_type = request['missing_type']
                
                if missing_type == 'policy_documents':
                    from utils.llm_chain import build_knowledge_base
                    kb_vectorstore = build_knowledge_base(uploaded_files, selected_model)
                    st.session_state['kb_vectorstore'] = kb_vectorstore
                    st.session_state['kb_ready'] = True
                    st.success("✅ Policy documents processed!")
                
                elif missing_type == 'evidence_files':
                    from utils.llm_chain import build_knowledge_base
                    evid_vectorstore = build_knowledge_base(uploaded_files, selected_model)
                    st.session_state['evid_vectorstore'] = evid_vectorstore
                    st.session_state['evidence_kb_ready'] = True
                    st.success("✅ Evidence files processed!")
                
                elif missing_type == 'company_documents':
                    from utils.llm_chain import build_knowledge_base
                    company_kb_vectorstore = build_knowledge_base(uploaded_files, selected_model)
                    st.session_state['company_kb_vectorstore'] = company_kb_vectorstore
                    st.session_state['company_files_ready'] = True
                    st.success("✅ Company documents processed!")
            
            # Clear pending request
            st.session_state['agent_pending_request'] = None
            
            # Now process the original query
            st.info("Files processed! Now answering your original question...")
            
            embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
            embedding_model = OllamaEmbeddings(
                model=embed_name,
                base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
            )
            
            # Get updated vectorstores
            kb_vectorstore = st.session_state.get('kb_vectorstore')
            company_kb_vectorstore = st.session_state.get('company_kb_vectorstore')
            evid_vectorstore = st.session_state.get('evid_vectorstore')
            
            response = chat_with_ai_with_memory(
                kb_vectorstore,
                company_kb_vectorstore,
                evid_vectorstore,
                chat_attachment_vectorstore,
                selected_model,
                original_query,
                embedding_model
            )
            
            st.session_state["chat_history"].append({
                "user": f"[After uploading files] {original_query}",
                "bot": response
            })
            
            st.session_state['original_query'] = None
            st.rerun()
    
    elif request['type'] == 'clarification':
        st.warning("⚠️ **The assistant needs clarification**")
        st.info(request['message'])
        
        clarification = st.text_input(
            "Please provide more details:",
            key=f"clarification_input_{request['request_id']}"
        )
        
        col1, col2 = st.columns([1, 3])
        with col1:
            submit_clarification = st.button("✅ Submit", disabled=not clarification)
        with col2:
            cancel = st.button("❌ Cancel")
        
        if cancel:
            st.session_state['agent_pending_request'] = None
            st.session_state['original_query'] = None
            st.info("Request cancelled.")
            st.rerun()
        
        if submit_clarification and clarification:
            # Combine original query with clarification
            enhanced_query = f"{original_query}\n\nAdditional context: {clarification}"
            
            st.session_state['agent_pending_request'] = None
            st.session_state['original_query'] = None
            
            embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
            embedding_model = OllamaEmbeddings(
                model=embed_name,
                base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
            )
            
            response = chat_with_ai_with_memory(
                kb_vectorstore,
                company_kb_vectorstore,
                evid_vectorstore,
                chat_attachment_vectorstore,
                selected_model,
                enhanced_query,
                embedding_model
            )
            
            st.session_state["chat_history"].append({
                "user": enhanced_query,
                "bot": response
            })
            
            st.rerun()
```

## 1.4 Enhanced Chat Prompt (Phase 2)

Update the prompt in `chat_with_ai_with_memory` function:

```python
def chat_with_ai_with_memory(kb_vectorstore, company_kb_vectorstore, evid_vectorstore,
                             chat_attachment_vectorstore, selected_model, user_input,
                             embedding_model=None):
    """Enhanced chat with decision-making awareness"""
    
    # ... (existing context loading code) ...
    
    # PHASE 2: Enhanced prompt with decision-making guidance
    enhanced_prompt = f"""You are a highly capable cybersecurity assistant with comprehensive memory and context awareness.

You have been designed to provide accurate, actionable guidance based on available information. If you lack necessary context, you should clearly state what is missing rather than guessing.

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

**Context-Aware Responding:**
1. Use ALL available context to provide the most comprehensive answer possible
2. Reference previous conversations when relevant (e.g., "As we discussed earlier...")
3. Cite your sources by mentioning which context you're using (policies, company docs, evidence, past discussion)
4. Maintain conversation continuity - build upon previous answers for follow-up questions

**Quality Guidelines:**
5. Be specific and actionable with concrete recommendations
6. Use bullet points, numbered lists, and tables where appropriate
7. Provide examples when explaining concepts
8. If information is partially available, answer what you can and note what's missing

**Professional Standards:**
9. Maintain a professional cybersecurity audit assistant tone
10. Acknowledge limitations - if critical information is missing, state it clearly
11. Never hallucinate or invent information
12. When unsure, ask clarifying questions or suggest next steps

**Response Format:**
- For policy questions: Quote relevant sections and provide interpretation
- For assessments: Provide structured analysis with findings and recommendations
- For comparisons: Use tables to show differences
- For follow-ups: Build on previous context seamlessly

Your comprehensive response:"""
    
    # ... (rest of the function remains the same) ...
```

---

# Part 2: FastAPI Backend Implementation (api/main.py)

## 2.1 Add Query Analysis Endpoint

Add these models and endpoint to `api/main.py`:

```python
# ============================================================================
# PHASE 2: QUERY ANALYSIS MODELS
# ============================================================================

class QueryAnalysisRequest(BaseModel):
    user_input: str = Field(..., description="User query to analyze")
    kb_loaded: bool = Field(False, description="Whether knowledge base is loaded")
    company_loaded: bool = Field(False, description="Whether company KB is loaded")
    evidence_loaded: bool = Field(False, description="Whether evidence KB is loaded")

class QueryAnalysisResponse(BaseModel):
    can_proceed: bool
    missing_context: List[str]
    clarification_needed: bool
    reasoning: str
    agent_request: Optional[Dict[str, Any]] = None

# ============================================================================
# PHASE 2: ANALYSIS ENDPOINT
# ============================================================================

@app.post("/analyze-query", response_model=QueryAnalysisResponse, tags=["analysis"])
async def analyze_query(request: QueryAnalysisRequest):
    """
    Analyze user query to determine if agent can proceed or needs additional context.
    This enables the active feedback loop.
    """
    needs = {
        'can_proceed': True,
        'missing_context': [],
        'clarification_needed': False,
        'reasoning': ''
    }
    
    query_lower = request.user_input.lower()
    
    # Define keyword patterns
    policy_keywords = ['policy', 'policies', 'standard', 'standards', 'guideline', 
                      'compliance', 'regulation', 'requirement', 'framework']
    evidence_keywords = ['assess', 'audit', 'test', 'verify', 'evidence', 'log', 
                        'logs', 'analyze', 'review', 'check', 'examine']
    company_keywords = ['company', 'organization', 'soc', 'soc2', 'cri', 'profile',
                       'specific', 'our', 'internal']
    
    # Check for missing knowledge bases
    if any(keyword in query_lower for keyword in policy_keywords):
        if not request.kb_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('policy_documents')
            needs['reasoning'] = 'Query requires security policies but none are loaded'
    
    if any(keyword in query_lower for keyword in evidence_keywords):
        if not request.evidence_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('evidence_files')
            needs['reasoning'] = 'Query requires evidence files but none are loaded'
    
    if any(keyword in query_lower for keyword in company_keywords):
        if not request.company_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('company_documents')
            needs['reasoning'] = 'Query requires company documents but none are loaded'
    
    # Check for vague queries
    words = request.user_input.strip().split()
    if len(words) < 3:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is too short or vague'
    
    # Create agent request if needed
    agent_request = None
    if not needs['can_proceed'] or needs['clarification_needed']:
        agent_request = create_agent_request_api(needs)
    
    return QueryAnalysisResponse(
        can_proceed=needs['can_proceed'],
        missing_context=needs['missing_context'],
        clarification_needed=needs['clarification_needed'],
        reasoning=needs['reasoning'],
        agent_request=agent_request
    )

def create_agent_request_api(needs: dict) -> dict:
    """Create agent request for API"""
    if needs['clarification_needed']:
        return {
            'type': 'clarification',
            'message': 'Please provide more details about what you would like to know.'
        }
    
    if needs['missing_context']:
        file_map = {
            'policy_documents': {
                'category': 'policy',
                'types': ['pdf', 'txt', 'docx'],
                'description': 'security policies and standards'
            },
            'evidence_files': {
                'category': 'evidence',
                'types': ['log', 'txt', 'csv', 'pdf'],
                'description': 'security logs and evidence files'
            },
            'company_documents': {
                'category': 'company',
                'types': ['pdf', 'txt', 'docx'],
                'description': 'company-specific documents'
            }
        }
        
        missing = needs['missing_context'][0]
        file_info = file_map.get(missing, {})
        
        return {
            'type': 'file_upload',
            'message': f"To proceed, please upload {file_info.get('description', 'required files')}.",
            'file_category': file_info.get('category', 'general'),
            'accepted_types': file_info.get('types', ['pdf', 'txt']),
            'missing_type': missing
        }
    
    return None
```

## 2.2 Update Chat Endpoint to Use Analysis

Modify your existing `/chat` endpoint to check analysis first:

```python
@app.post("/chat", response_model=ChatResponse, tags=["chat"])
async def chat_with_memory(request: ChatRequest):
    """Enhanced chat with pre-flight analysis check"""
    
    # ... (existing session and setup code) ...
    
    # PHASE 2: Pre-flight check
    # The frontend should call /analyze-query first, but we can double-check here
    kb_loaded = bool(loaded_stores['global'])
    company_loaded = bool(loaded_stores['company'])
    evidence_loaded = bool(loaded_stores['evidence'])
    
    # Quick validation
    query_lower = request.user_input.lower()
    needs_kb = any(w in query_lower for w in ['policy', 'standard', 'compliance'])
    needs_evidence = any(w in query_lower for w in ['assess', 'audit', 'log'])
    needs_company = any(w in query_lower for w in ['company', 'soc', 'cri'])
    
    if (needs_kb and not kb_loaded) or (needs_evidence and not evidence_loaded) or (needs_company and not company_loaded):
        # Return error suggesting missing context
        missing = []
        if needs_kb and not kb_loaded:
            missing.append('policies')
        if needs_evidence and not evidence_loaded:
            missing.append('evidence')
        if needs_company and not company_loaded:
            missing.append('company documents')
        
        return ChatResponse(
            success=False,
            session_id=session_id,
            error=f"Missing required context: {', '.join(missing)}. Please upload the necessary files first.",
            message_count=session.get('message_count', 0)
        )
    
    # ... (continue with normal chat processing) ...
```

---

# Part 3: Frontend Integration (UI_Agent/)

## 3.1 Create Agent State Manager (`UI_Agent/agent_state.js`)

Create new file `UI_Agent/agent_state.js`:

```javascript
/**
 * Agent State Manager
 * Handles active feedback loop state for the chat agent
 */

class AgentStateManager {
  constructor() {
    this.pendingRequest = null;
    this.originalQuery = null;
  }

  async analyzeQuery(userInput, kbLoaded, companyLoaded, evidenceLoaded) {
    try {
      const response = await fetch('http://localhost:8000/analyze-query', {
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
  }

  clearPendingRequest() {
    this.pendingRequest = null;
    this.originalQuery = null;
    localStorage.removeItem('agent_pending_request');
    localStorage.removeItem('agent_original_query');
  }

  loadPendingRequest() {
    const requestStr = localStorage.getItem('agent_pending_request');
    const queryStr = localStorage.getItem('agent_original_query');
    
    if (requestStr && queryStr) {
      this.pendingRequest = JSON.parse(requestStr);
      this.originalQuery = queryStr;
      return true;
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
```

## 3.2 Update Chat Interface (`UI_Agent/chat.js`)

Modify your `chat.js` to integrate agent state:

```javascript
/* Enhanced chat with active feedback loop */
(function () {
  let memoryManager = null;
  let agentState = null;

  function $(id) { return document.getElementById(id); }

  function initManagers() {
    if (window.ChatMemoryManager) {
      memoryManager = new window.ChatMemoryManager();
      memoryManager.displaySessionInfo();
    }
    
    if (window.AgentStateManager) {
      agentState = new window.AgentStateManager();
      agentState.loadPendingRequest();
      
      // Check if there's a pending request to render
      if (agentState.hasPendingRequest()) {
        renderPendingRequest();
      }
    }
  }

  // ... (keep existing helper functions) ...

  async function sendMessage(e) {
    if (e) e.preventDefault();
    
    const input = $('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const model = sessionStorage.getItem('selectedModel');
    if (!model) {
      showToast('Please select a model first', 'warning');
      return;
    }

    // Check context status
    const kbLoaded = sessionStorage.getItem('kbReady') === 'true';
    const companyLoaded = sessionStorage.getItem('companyReady') === 'true';
    const evidenceLoaded = sessionStorage.getItem('evidenceReady') === 'true';

    appendMessage('user', text);
    input.value = '';
    setSending(true);

    try {
      // PHASE 2: Analyze query first
      if (agentState) {
        const analysis = await agentState.analyzeQuery(
          text, kbLoaded, companyLoaded, evidenceLoaded
        );

        if (analysis.needsAction) {
          // Agent needs something - render request UI
          agentState.setPendingRequest(analysis.request, text);
          appendMessage('assistant', analysis.request.message);
          renderPendingRequest();
          setSending(false);
          return;
        }
      }

      // Can proceed normally
      let result;
      if (memoryManager) {
        result = await memoryManager.sendMessage(text, model);
        if (result.success) {
          appendMessage('assistant', result.response);
          memoryManager.displaySessionInfo();
        } else {
          appendMessage('assistant', `⚠️ ${result.error}`);
        }
      } else {
        // Fallback
        const res = await fetch('http://localhost:8000/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selected_model: model,
            user_input: text
          })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        if (data.success && data.response) {
          appendMessage('assistant', data.response);
        } else {
          appendMessage('assistant', data.error || 'No response');
        }
      }
    } catch (err) {
      appendMessage('assistant', `⚠️ ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  function renderPendingRequest() {
    const request = agentState.getPendingRequest();
    if (!request) return;

    const chatMessages = $('chat-messages');
    const chatForm = $('chat-form');
    
    if (!chatMessages || !chatForm) return;

    // Hide normal chat form
    chatForm.style.display = 'none';

    // Create pending request UI
    const pendingUI = document.createElement('div');
    pendingUI.id = 'pending-request-ui';
    pendingUI.className = 'pending-request-container';

    if (request.type === 'file_upload') {
      pendingUI.innerHTML = `
        <div class="pending-request-header">
          <h4>📁 Agent Request: Files Needed</h4>
        </div>
        <div class="pending-request-body">
          <p>${escapeHtml(request.message)}</p>
          <input type="file" id="agent-file-upload" 
                 accept="${request.accepted_types.map(t => '.' + t).join(',')}"
                 multiple />
          <div class="pending-actions">
            <button id="submit-files-btn" class="btn-primary">✅ Submit Files</button>
            <button id="cancel-request-btn" class="btn-secondary">❌ Cancel</button>
          </div>
        </div>
      `;
    } else if (request.type === 'clarification') {
      pendingUI.innerHTML = `
        <div class="pending-request-header">
          <h4>⚠️ Agent Request: Clarification Needed</h4>
        </div>
        <div class="pending-request-body">
          <p>${escapeHtml(request.message)}</p>
          <textarea id="clarification-input" rows="3" 
                    placeholder="Please provide more details..."></textarea>
          <div class="pending-actions">
            <button id="submit-clarification-btn" class="btn-primary">✅ Submit</button>
            <button id="cancel-request-btn" class="btn-secondary">❌ Cancel</button>
          </div>
        </div>
      `;
    }

    // Remove existing pending UI if any
    const existing = $('pending-request-ui');
    if (existing) existing.remove();

    // Insert before chat messages
    chatMessages.parentElement.insertBefore(pendingUI, chatMessages);

    // Wire events
    const cancelBtn = $('cancel-request-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        agentState.clearPendingRequest();
        pendingUI.remove();
        chatForm.style.display = 'block';
      });
    }

    if (request.type === 'file_upload') {
      const submitBtn = $('submit-files-btn');
      const fileInput = $('agent-file-upload');
      
      if (submitBtn && fileInput) {
        submitBtn.addEventListener('click', async () => {
          const files = fileInput.files;
          if (!files || files.length === 0) {
            showToast('Please select files first', 'warning');
            return;
          }

          await handleFileUpload(files, request);
        });
      }
    } else if (request.type === 'clarification') {
      const submitBtn = $('submit-clarification-btn');
      const clarificationInput = $('clarification-input');
      
      if (submitBtn && clarificationInput) {
        submitBtn.addEventListener('click', async () => {
          const clarification = clarificationInput.value.trim();
          if (!clarification) {
            showToast('Please provide clarification', 'warning');
            return;
          }

          await handleClarification(clarification);
        });
      }
    }
  }

  async function handleFileUpload(files, request) {
    const formData = new FormData();
    for (let file of files) {
      formData.append('files', file);
    }
    
    formData.append('selected_model', sessionStorage.getItem('selectedModel'));
    formData.append('kb_type', request.file_category);

    try {
      setSending(true);
      const response = await fetch('http://localhost:8000/build-knowledge-base', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('File upload failed');

      const data = await response.json();
      
      if (data.success) {
        // Update session storage
        if (request.missing_type === 'policy_documents') {
          sessionStorage.setItem('kbReady', 'true');
        } else if (request.missing_type === 'evidence_files') {
          sessionStorage.setItem('evidenceReady', 'true');
        } else if (request.missing_type === 'company_documents') {
          sessionStorage.setItem('companyReady', 'true');
        }

        showToast('Files processed successfully!', 'success');
        
        // Now retry original query
        await retryOriginalQuery();
      }
    } catch (error) {
      appendMessage('assistant', `⚠️ File upload error: ${error.message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleClarification(clarification) {
    const originalQuery = agentState.getOriginalQuery();
    const enhancedQuery = `${originalQuery}\n\nAdditional context: ${clarification}`;
    
    // Clear pending request
    agentState.clearPendingRequest();
    const pendingUI = $('pending-request-ui');
    if (pendingUI) pendingUI.remove();
    $('chat-form').style.display = 'block';

    // Send enhanced query
    appendMessage('user', enhancedQuery);
    
    try {
      setSending(true);
      const model = sessionStorage.getItem('selectedModel');
      
      if (memoryManager) {
        const result = await memoryManager.sendMessage(enhancedQuery, model);
        if (result.success) {
          appendMessage('assistant', result.response);
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function retryOriginalQuery() {
    const originalQuery = agentState.getOriginalQuery();
    
    // Clear pending request UI
    agentState.clearPendingRequest();
    const pendingUI = $('pending-request-ui');
    if (pendingUI) pendingUI.remove();
    $('chat-form').style.display = 'block';

    appendMessage('user', `[After uploading files] ${originalQuery}`);
    
    try {
      setSending(true);
      const model = sessionStorage.getItem('selectedModel');
      
      if (memoryManager) {
        const result = await memoryManager.sendMessage(originalQuery, model);
        if (result.success) {
          appendMessage('assistant', result.response);
        }
      }
    } finally {
      setSending(false);
    }
  }

  function showToast(message, type = 'info') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ... (keep existing wireEvents and other functions) ...

  document.addEventListener('DOMContentLoaded', () => {
    initManagers();
    setModelPill();
    wireEvents();
  });
})();
```

## 3.3 Add CSS Styles (`UI_Agent/style.css`)

Add these styles:

```css
/* Phase 2: Pending Request UI Styles */
.pending-request-container {
  background: #fff3cd;
  border: 2px solid #ffc107;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
}

.pending-request-header h4 {
  margin: 0 0 12px 0;
  color: #856404;
}

.pending-request-body {
  color: #856404;
}

.pending-request-body p {
  margin-bottom: 16px;
  line-height: 1.6;
}

#agent-file-upload,
#clarification-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #ffc107;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 14px;
}

#clarification-input {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.pending-actions {
  display: flex;
  gap: 12px;
}

.btn-primary {
  background: #00338d;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #00245a;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #5a6268;
}

/* Toast notifications */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 16px 24px;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  z-index: 10000;
  animation: slideIn 0.3s ease-out;
}

.toast-success {
  background: #28a745;
}

.toast-warning {
  background: #ffc107;
  color: #856404;
}

.toast-error {
  background: #dc3545;
}

.toast.fade-out {
  animation: slideOut 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(400px);
    opacity: 0;
  }
}
```

## 3.4 Update HTML (`UI_Agent/index.html`)

Add the new script:

```html
<!-- Add before chat.js -->
<script src=\"agent_state.js\"></script>
<script src=\"chat_memory.js\"></script>
<script src=\"chat.js\"></script>
```

---

# Testing Phase 2

## Test 1: Missing Policy Documents
1. Clear all uploaded files
2. Ask: \"What are the access control policies?\"
3. ✅ Expected: Agent requests policy documents with file uploader
4. Upload a policy file
5. ✅ Expected: Agent processes file and answers original question

## Test 2: Missing Evidence Files
1. Clear evidence files
2. Ask: \"Assess my firewall logs for compliance\"
3. ✅ Expected: Agent requests log/evidence files
4. Upload log files
5. ✅ Expected: Agent performs assessment

## Test 3: Vague Query
1. Type: \"help\"
2. ✅ Expected: Agent asks for clarification with examples
3. Provide: \"I want to know about password policies\"
4. ✅ Expected: Agent answers with password policy details

## Test 4: Missing Company Docs
1. Ask: \"Compare our practices with SOC 2\"
2. ✅ Expected: Agent requests company documents
3. Upload company docs
4. ✅ Expected: Agent performs comparison

## Test 5: Multi-Step Workflow
1. Ask vague question
2. Provide clarification
3. Agent realizes files are missing
4. Upload files
5. ✅ Expected: Agent successfully completes full workflow

---

# Summary

## What's Implemented

✅ **Streamlit**
- Agent decision logic (`analyze_query_needs`, `create_agent_request`)
- Pending request UI rendering
- File upload handling for missing context
- Clarification input handling
- Enhanced prompts

✅ **FastAPI Backend**
- `/analyze-query` endpoint
- Query analysis logic
- Pre-flight checks in chat endpoint

✅ **Frontend (UI_Agent)**
- `AgentStateManager` class
- Pre-flight query analysis
- Dynamic UI rendering (file upload/clarification)
- File upload and retry logic
- Enhanced user experience

## Architecture Flow

```
User Query → Agent Analysis → Missing Context?
                                     ↓
                            Yes              No
                             ↓               ↓
                    Request Files/      Process
                    Clarification       Normally
                             ↓
                    User Provides
                             ↓
                    Retry Original Query
```

## Next Steps

After Phase 2 is tested:
- Phase 3: Proactive suggestions and workflow guidance
- Advanced state machine for complex multi-turn workflows
- Analytics on user interaction patterns

---

**Questions or issues?** Open an issue with \"Phase 2\" in the title.
