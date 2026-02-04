"""
Complete FastAPI wrapper for ControlTester_3000 with Session & Memory Management
File: api/main.py
Includes session management, conversation memory, and enhanced chat capabilities
Phase 1 + Phase 2 implementation - FIXED VERSION
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from langchain_ollama import OllamaLLM, OllamaEmbeddings
from langchain_community.vectorstores import FAISS
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import tempfile
import os
import time
import logging
import traceback
from pathlib import Path
from utils.file_handlers import save_faiss_vectorstore, load_faiss_vectorstore

# utils imports
from utils.llm_chain import build_knowledge_base, assess_evidence_with_kb, generate_executive_summary
from utils.find_llm import get_ollama_model_names
from langchain.schema import Document
from utils.pdf_generator import generate_workbook

# Add for session management
from datetime import datetime
import uuid

# ----------------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("api.log", mode="a")
    ]
)
logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------------
# FastAPI instance & CORS
# ----------------------------------------------------------------------------
app = FastAPI(
    title="ControlTester 3000 API",
    version="2.2.0",
    description="Cybersecurity audit service with memory management, session handling, and multi-source context integration.",
    openapi_tags=[
        {"name": "meta", "description": "API information and health checks"},
        {"name": "models", "description": "Available language models"},
        {"name": "knowledge-base", "description": "Knowledge base creation"},
        {"name": "assessment", "description": "Evidence assessment and audit analysis"},
        {"name": "chat", "description": "Chat with memory and context"},
        {"name": "session", "description": "Session management"},
        {"name": "analysis", "description": "Query analysis for active feedback"}
    ]
)

# Candidate directories where generated reports may be stored inside the container
DEFAULT_REPORT_DIR = Path.cwd() / "app"
API_DIR = Path(__file__).parent
REPO_ROOT = Path.cwd()
REPORTS_DIRS = [DEFAULT_REPORT_DIR, API_DIR, REPO_ROOT]

try:
    DEFAULT_REPORT_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# SESSION & MEMORY MANAGEMENT
# ============================================================================

class SessionMemory:
    """
    Manages conversation memory per session.
    Each client gets a unique session_id and isolated memory.
    """
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}

    def create_session(self, session_id: str = None) -> str:
        """Create a new session with isolated memory"""
        if not session_id:
            session_id = str(uuid.uuid4())

        if session_id not in self.sessions:
            self.sessions[session_id] = {
                'created_at': datetime.now().isoformat(),
                'message_count': 0,
                'chat_history': [],
                'conversation_vectorstore': None,
                'last_activity': datetime.now().isoformat()
            }
            logger.info(f"Created new session: {session_id}")

        return session_id

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data"""
        return self.sessions.get(session_id)

    def add_message(self, session_id: str, role: str, content: str):
        """Add message to session history"""
        if session_id not in self.sessions:
            self.create_session(session_id)

        self.sessions[session_id]['chat_history'].append({
            'role': role,
            'content': content,
            'timestamp': datetime.now().isoformat()
        })
        self.sessions[session_id]['message_count'] += 1
        self.sessions[session_id]['last_activity'] = datetime.now().isoformat()

    def get_recent_history(self, session_id: str, k: int = 10) -> List[Dict]:
        """Get recent k messages from session"""
        session = self.get_session(session_id)
        if not session:
            return []
        return session['chat_history'][-k*2:]  # Get last k exchanges (user + assistant)

    def clear_session(self, session_id: str):
        """Clear session memory"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleared session: {session_id}")

    def update_vectorstore(self, session_id: str, vectorstore):
        """Update conversation vectorstore for session"""
        if session_id in self.sessions:
            self.sessions[session_id]['conversation_vectorstore'] = vectorstore

# Global session manager
session_manager = SessionMemory()

# ----------------------------------------------------------------------------
# Config & Helpers
# ----------------------------------------------------------------------------
class _Cfg:
    MAX_FILE_SIZE = 1024 * 1024 * 1024 
    MAX_FILES = None
    DEFAULT_BATCH = 15
    DEFAULT_DELAY = 0.2
    DEFAULT_RETRIES = 3

app_start = time.time()
request_counter = 0

def _req_id() -> str:
    global request_counter
    request_counter += 1
    return f"req_{int(time.time())}_{request_counter}"

# ----------------------------------------------------------------------------
# In-memory Vectorstore Cache
# ----------------------------------------------------------------------------
VECTORSTORE_CACHE: Dict[str, Any] = {"global": None, "company": None, "evidence": None, "chat": None}

# ----------------------------------------------------------------------------
# Pydantic models
# ----------------------------------------------------------------------------
class KBReq(BaseModel):
    selected_model: str = Field(..., description="Ollama model name")
    batch_size: int = Field(_Cfg.DEFAULT_BATCH, ge=1, le=100)
    delay_between_batches: float = Field(_Cfg.DEFAULT_DELAY, ge=0.0, le=10.0)
    max_retries: int = Field(_Cfg.DEFAULT_RETRIES, ge=1, le=10)

    @validator("selected_model")
    def _not_blank(cls, v):
        if not v.strip():
            raise ValueError("Model name must not be blank")
        return v.strip()

class FileResult(BaseModel):
    filename: str
    size_bytes: int
    status: str
    processing_time: float

class KBResp(BaseModel):
    success: bool
    message: str
    processing_summary: Dict[str, Any]
    vector_count: Optional[int] = None
    error_details: Optional[str] = None
    files_processed: Optional[List[FileResult]] = None

class AssessmentRequest(BaseModel):
    selected_model: str = Field(..., description="Ollama model for assessment")
    max_workers: int = Field(4, ge=1, le=20, description="Number of worker threads")

class AssessmentResponse(BaseModel):
    success: bool
    message: str
    workbook_path: Optional[str] = None
    processing_summary: Dict[str, Any]
    error_details: Optional[str] = None

class ChatRequest(BaseModel):
    selected_model: str = Field(..., description="Ollama model for chat")
    user_input: str = Field(..., description="User question or prompt")
    session_id: Optional[str] = Field(None, description="Session ID for conversation continuity")
    include_history: bool = Field(True, description="Whether to include conversation history")
    global_kb_path: Optional[str] = Field(None, description="Path to saved global FAISS KB")
    company_kb_path: Optional[str] = Field(None, description="Path to saved company FAISS KB")
    chat_kb_path: Optional[str] = Field(None, description="Path to saved chat attachments FAISS KB")
    evid_kb_path: Optional[str] = Field(None, description="Path to saved evidence FAISS KB")
    embedding_model: Optional[str] = Field(None, description="Optional embedding model name")

class ChatResponse(BaseModel):
    success: bool
    session_id: str
    response: Optional[str] = None
    error: Optional[str] = None
    message_count: int = 0
    loaded_paths: Optional[Dict[str, Optional[str]]] = None

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

# ----------------------------------------------------------------------------
# Validation helpers
# ----------------------------------------------------------------------------
def _validate_upload(file: UploadFile) -> List[str]:
    errs = []
    if not file.filename:
        errs.append("Missing filename")
        return errs
    if file.size and file.size > _Cfg.MAX_FILE_SIZE:
        size_mb = file.size / 1024 / 1024
        max_mb = _Cfg.MAX_FILE_SIZE / 1024 / 1024
        errs.append(f"File {file.filename} is {size_mb:.1f} MB (max {max_mb} MB)")
    return errs

# ----------------------------------------------------------------------------
# Meta Endpoints
# ----------------------------------------------------------------------------
@app.get("/", tags=["meta"], summary="API root")
async def root():
    return {
        "name": app.title,
        "version": app.version,
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "build_kb": "/build-knowledge-base",
            "assess": "/assess-evidence",
            "summary": "/generate-summary",
            "models": "/models",
            "chat": "/chat",
            "analyze": "/analyze-query",
            "session_create": "/session/create",
            "session_info": "/session/{session_id}",
            "session_clear": "/session/{session_id}",
            "session_history": "/session/{session_id}/history"
        }
    }

@app.get("/health", tags=["meta"], summary="Health check")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": time.time() - app_start,
        "requests": request_counter,
        "active_sessions": len(session_manager.sessions)
    }

@app.get("/models", tags=["models"], summary="Available Ollama models")
async def models():
    try:
        names = [m for m in get_ollama_model_names() if "embed" not in m]
        return {"models": names, "count": len(names)}
    except Exception as e:
        raise HTTPException(500, f"Failed fetching models: {e}")

# ============================================================================
# SESSION MANAGEMENT ENDPOINTS
# ============================================================================

@app.post("/session/create", tags=["session"])
async def create_session():
    """Create a new chat session"""
    session_id = session_manager.create_session()
    return {"session_id": session_id, "created_at": datetime.now().isoformat()}

@app.get("/session/{session_id}", tags=["session"])
async def get_session_info(session_id: str):
    """Get session information"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    return {
        "session_id": session_id,
        "created_at": session['created_at'],
        "message_count": session['message_count'],
        "last_activity": session['last_activity'],
        "has_vectorstore": session['conversation_vectorstore'] is not None
    }

@app.delete("/session/{session_id}", tags=["session"])
async def clear_session(session_id: str):
    """Clear session memory"""
    session_manager.clear_session(session_id)
    return {"success": True, "message": f"Session {session_id} cleared"}

@app.get("/session/{session_id}/history", tags=["session"])
async def get_session_history(session_id: str, limit: int = 50):
    """Get session conversation history"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    history = session['chat_history'][-limit:]
    return {"session_id": session_id, "messages": history, "total": len(history)}

# ============================================================================
# PHASE 2: HELPER FUNCTION
# ============================================================================

def create_agent_request_api(needs: dict) -> dict:
    """Create agent request for API"""
    if needs['clarification_needed']:
        return {
            'type': 'clarification',
            'message': 'Please provide more details about what you would like to know. For example, you could ask about specific security policies, request an assessment of evidence files, or inquire about company-specific compliance requirements.'
        }

    if needs['missing_context']:
        file_map = {
            'policy_documents': {
                'category': 'policy',
                'types': ['pdf', 'txt', 'docx'],
                'description': 'security policies and standards (e.g., ISO 27001, NIST frameworks)'
            },
            'evidence_files': {
                'category': 'evidence',
                'types': ['log', 'txt', 'csv', 'pdf'],
                'description': 'security logs and evidence files (e.g., access logs, firewall logs)'
            },
            'company_documents': {
                'category': 'company',
                'types': ['pdf', 'txt', 'docx', 'xlsx'],
                'description': 'company-specific documents (e.g., SOC 2 reports, CRI profiles)'
            }
        }

        missing = needs['missing_context'][0]
        file_info = file_map.get(missing, {})

        return {
            'type': 'file_upload',
            'message': f"To proceed with your request, I need {file_info.get('description', 'required files')}. Please upload the necessary files.",
            'file_category': file_info.get('category', 'general'),
            'accepted_types': file_info.get('types', ['pdf', 'txt']),
            'missing_type': missing
        }

    return None

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
                      'compliance', 'regulation', 'requirement', 'framework', 'iso', 'nist']
    evidence_keywords = ['assess', 'audit', 'test', 'verify', 'evidence', 'log', 
                        'logs', 'analyze', 'review', 'check', 'examine', 'investigate']
    company_keywords = ['company', 'organization', 'soc', 'soc2', 'cri', 'profile',
                       'specific', 'our', 'internal', 'organizational']

    # Check for missing knowledge bases
    if any(keyword in query_lower for keyword in policy_keywords):
        if not request.kb_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('policy_documents')
            needs['reasoning'] = 'Query requires security policies/standards but none are loaded'

    if any(keyword in query_lower for keyword in evidence_keywords):
        if not request.evidence_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('evidence_files')
            needs['reasoning'] = 'Query requires evidence/log files for assessment but none are loaded'

    if any(keyword in query_lower for keyword in company_keywords):
        if not request.company_loaded:
            needs['can_proceed'] = False
            needs['missing_context'].append('company_documents')
            needs['reasoning'] = 'Query requires company-specific documents but none are loaded'

    # Check for vague queries
    words = request.user_input.strip().split()
    if len(words) < 3:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is too short or vague to determine intent'

    # Check for generic queries
    generic_patterns = ['help', 'hi', 'hello', 'what can you do', 'explain']
    if any(pattern in query_lower for pattern in generic_patterns) and len(words) < 5:
        needs['clarification_needed'] = True
        needs['reasoning'] = 'Query is generic and needs more specific context'

    # Create agent request if needed
    agent_request = None
    if not needs['can_proceed'] or needs['clarification_needed']:
        agent_request = create_agent_request_api(needs)

    logger.info(f"Query analysis: can_proceed={needs['can_proceed']}, missing={needs['missing_context']}, clarification={needs['clarification_needed']}")

    return QueryAnalysisResponse(
        can_proceed=needs['can_proceed'],
        missing_context=needs['missing_context'],
        clarification_needed=needs['clarification_needed'],
        reasoning=needs['reasoning'],
        agent_request=agent_request
    )

# ============================================================================
# ENHANCED CHAT ENDPOINT WITH MEMORY (FIXED)
# ============================================================================

@app.post("/chat", response_model=ChatResponse, tags=["chat"], summary="Chat with memory")
async def chat_with_memory(request: ChatRequest):
    """
    Enhanced chat endpoint with conversation memory.
    Maintains per-session history and semantic retrieval.

    ALL BUSINESS LOGIC IS DELEGATED TO utils/chat.py
    This endpoint only handles HTTP concerns: validation, session mgmt, error handling
    """
    rid = _req_id()
    logger.info(f"[{rid}] Chat request - model: {request.selected_model}, session: {request.session_id}")

    # ========================================================================
    # IMPORT CHAT LOGIC FROM utils/chat.py
    # ========================================================================
    from utils.chat import chat_with_ai_with_memory, update_conversation_vectorstore_api

    # Validate input
    try:
        request.selected_model = request.selected_model.strip()
        request.user_input = request.user_input.strip()
        if not request.selected_model or not request.user_input:
            raise ValueError("selected_model and user_input are required")
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    # Create or get session
    session_id = request.session_id or session_manager.create_session()
    session = session_manager.get_session(session_id)
    if not session:
        session_id = session_manager.create_session(session_id)
        session = session_manager.get_session(session_id)

    # Setup paths
    request.global_kb_path = request.global_kb_path or "saved_global_vectorstore"
    request.company_kb_path = request.company_kb_path or "saved_company_vectorstore"
    request.chat_kb_path = request.chat_kb_path or "chat_attachment_vectorstore"

    base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    embed_name = request.embedding_model or os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
    embeddings_for_load = OllamaEmbeddings(model=embed_name, base_url=base_url)

    # Load vectorstores
    loaded_stores: Dict[str, Any] = {"global": None, "company": None, "evidence": None, "chat": None}
    loaded_paths: Dict[str, Optional[str]] = {"global": None, "company": None, "evidence": None, "chat": None}

    try:
        if request.global_kb_path and Path(request.global_kb_path).exists():
            loaded_stores['global'] = load_faiss_vectorstore(request.global_kb_path, embeddings_for_load)
            loaded_paths['global'] = request.global_kb_path
        if request.company_kb_path and Path(request.company_kb_path).exists():
            loaded_stores['company'] = load_faiss_vectorstore(request.company_kb_path, embeddings_for_load)
            loaded_paths['company'] = request.company_kb_path
        if request.evid_kb_path and Path(request.evid_kb_path).exists():
            loaded_stores['evidence'] = load_faiss_vectorstore(request.evid_kb_path, embeddings_for_load)
            loaded_paths['evidence'] = request.evid_kb_path
        if request.chat_kb_path and Path(request.chat_kb_path).exists():
            loaded_stores['chat'] = load_faiss_vectorstore(request.chat_kb_path, embeddings_for_load)
            loaded_paths['chat'] = request.chat_kb_path

        # Use cached evidence if available
        if VECTORSTORE_CACHE["evidence"]:
            loaded_stores['evidence'] = VECTORSTORE_CACHE["evidence"]
            loaded_paths['evidence'] = "in-memory"
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Vectorstore loading error: {e}")

    try:
        # ========================================================================
        # CALL THE MAIN CHAT LOGIC FROM utils/chat.py
        # All prompt construction, LLM invocation, and context handling happens here
        # ========================================================================
        response_text = chat_with_ai_with_memory(
            kb_vectorstore=loaded_stores['global'],
            company_kb_vectorstore=loaded_stores['company'],
            evid_vectorstore=loaded_stores['evidence'],
            chat_attachment_vectorstore=loaded_stores['chat'],
            selected_model=request.selected_model,
            user_input=request.user_input,
            session_manager=session_manager,
            session_id=session_id,
            embedding_model=embeddings_for_load,
            include_history=request.include_history
        )

        # Save to session memory
        session_manager.add_message(session_id, "user", request.user_input)
        session_manager.add_message(session_id, "assistant", response_text)

        # ========================================================================
        # UPDATE CONVERSATION VECTORSTORE USING UTILITY FUNCTION
        # ========================================================================
        update_conversation_vectorstore_api(
            user_input=request.user_input,
            bot_response=response_text,
            session_manager=session_manager,
            session_id=session_id,
            embedding_model=embeddings_for_load
        )

        return ChatResponse(
            success=True,
            session_id=session_id,
            response=response_text,
            message_count=session['message_count'],
            loaded_paths=loaded_paths
        )

    except Exception as e:
        logger.error(f"Chat error: {e}")
        return ChatResponse(
            success=False,
            session_id=session_id,
            error=str(e),
            message_count=session.get('message_count', 0),
            loaded_paths=loaded_paths
        )


# ----------------------------------------------------------------------------
# Knowledge Base Building Endpoint
# ----------------------------------------------------------------------------
@app.post(
    "/build-knowledge-base",
    response_model=KBResp,
    tags=["knowledge-base"],
    summary="Build a knowledge base from uploaded files"
)
async def build_kb(
    selected_model: str = Form(...),
    batch_size: int = Form(_Cfg.DEFAULT_BATCH),
    delay_between_batches: float = Form(_Cfg.DEFAULT_DELAY),
    max_retries: int = Form(_Cfg.DEFAULT_RETRIES),
    files: List[UploadFile] = File(...),
    kb_type: str = Form("global", description="Type of KB: global/company/evidence")
):
    rid = _req_id()
    t0 = time.time()
    logger.info(f"[{rid}] Received request with {len(files)} files for kb_type={kb_type}")

    try:
        KBReq(
            selected_model=selected_model,
            batch_size=batch_size,
            delay_between_batches=delay_between_batches,
            max_retries=max_retries
        )
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    if _Cfg.MAX_FILES and len(files) > _Cfg.MAX_FILES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max {_Cfg.MAX_FILES} files per request")

    errs: List[str] = []
    for f in files:
        errs.extend([f"{f.filename}: {e}" for e in _validate_upload(f)])
    if errs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "; ".join(errs))

    tmp_paths: List[str] = []
    file_objs: List[Any] = []
    file_results: List[FileResult] = []

    try:
        for uf in files:
            start = time.time()
            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(await uf.read())
            tmp.close()
            tmp_paths.append(tmp.name)
            fh = open(tmp.name, "rb")
            file_objs.append(fh)
            file_results.append(FileResult(
                filename=uf.filename,
                size_bytes=uf.size or 0,
                status="saved",
                processing_time=time.time() - start
            ))

        vectorstore = build_knowledge_base(
            files=file_objs,
            selected_model=selected_model,
            batch_size=batch_size,
            delay_between_batches=delay_between_batches,
            max_retries=max_retries
        )

        VECTORSTORE_CACHE[kb_type] = vectorstore

        vec_count = getattr(vectorstore.index, "ntotal", None)
        summary = {
            "files": len(file_objs),
            "vectors": vec_count,
            "processing_seconds": time.time() - t0,
            "model": selected_model
        }
        return KBResp(
            success=True, 
            message="Knowledge base built", 
            processing_summary=summary, 
            vector_count=vec_count, 
            files_processed=file_results
        )
    except Exception as e:
        return KBResp(
            success=False, 
            message="Failed", 
            processing_summary={}, 
            error_details=str(e)
        )
    finally:
        for fh in file_objs:
            try: fh.close()
            except Exception: pass
        for p in tmp_paths:
            try: os.unlink(p)
            except Exception: pass

# ----------------------------------------------------------------------------
# Evidence Assessment Endpoint
# ----------------------------------------------------------------------------
@app.post(
    "/assess-evidence",
    response_model=AssessmentResponse,
    tags=["assessment"],
    summary="Assess evidence files against knowledge bases"
)
async def assess_evidence(
    selected_model: str = Form(...),
    max_workers: int = Form(4),
    evidence_files: List[UploadFile] = File(...)    
):   
    t0 = time.time()

    try:
        AssessmentRequest(selected_model=selected_model, max_workers=max_workers)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    if not evidence_files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evidence files are required")  

    evidence_objs: List[Any] = []
    tmp_paths: List[str] = []       
    file_results: List[FileResult] = []
    base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    embed_name = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
    embeddings_for_load = OllamaEmbeddings(model=embed_name, base_url=base_url)

    try:  
        for uf in evidence_files:
            start = time.time()
            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            content = await uf.read()
            tmp.write(content)
            tmp.close()
            tmp_paths.append(tmp.name)

            # Create a file-like object that save_and_load_files expects
            class FileWrapper:
                def __init__(self, filepath, filename):
                    self.name = filename  # Original filename for extension detection
                    self._path = filepath

                def read(self):
                    with open(self._path, 'rb') as f:
                        return f.read()

            evidence_objs.append(FileWrapper(tmp.name, uf.filename))
            file_results.append(FileResult(
                filename=uf.filename,
                size_bytes=len(content),
                status="saved",
                processing_time=time.time() - start
            ))

        global_vectorstore = load_faiss_vectorstore("saved_global_vectorstore", embeddings_for_load)
        if not global_vectorstore:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "global vectorstores are required")
        VECTORSTORE_CACHE["global"] = global_vectorstore        

        company_vectorstore = load_faiss_vectorstore("saved_company_vectorstore", embeddings_for_load)
        if not company_vectorstore:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "company vectorstores are required")
        VECTORSTORE_CACHE["company"] = company_vectorstore

        evidence_vectorstore = build_knowledge_base(
            files=evidence_objs,
            selected_model=selected_model,
            batch_size=_Cfg.DEFAULT_BATCH,
            delay_between_batches=_Cfg.DEFAULT_DELAY,
            max_retries=_Cfg.DEFAULT_RETRIES
        )
        VECTORSTORE_CACHE["evidence"] = evidence_vectorstore

        # Get assessment results
        assessment_results = assess_evidence_with_kb(
            evidence_files=evidence_objs,
            kb_vectorstore=global_vectorstore,
            company_kb_vectorstore=company_vectorstore,
            selected_model=selected_model,
            max_workers=max_workers
        )

        assessment_summary = generate_executive_summary(assessment_results,selected_model)
        assessment_results.append(assessment_summary)
        workbook_path = generate_workbook(assessment_results, None)

        processing_summary = {
            "evidence_files": len(evidence_files),
            "evidence_documents": len(evidence_files),
            "assessment_results": len(assessment_results),
            "workbook_path": workbook_path,
            "global_vectors": getattr(global_vectorstore.index, "ntotal", 0),
            "company_vectors": getattr(company_vectorstore.index, "ntotal", 0),
            "processing_seconds": time.time() - t0,
            "model_used": selected_model,
            "max_workers": max_workers
        }

        return AssessmentResponse(
            success=True,
            message="Evidence assessment completed successfully",
            workbook_path=workbook_path,
            processing_summary=processing_summary
        )
    except Exception as e:
        logger.error(f"Assessment failed: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return AssessmentResponse(
            success=False,
            message="Assessment failed",
            processing_summary={},
            error_details=str(e)
        )
    finally:
        # Clean up temp files only (FileWrapper objects don't need closing)
        for p in tmp_paths:
            try: os.unlink(p)
            except Exception: pass

# ----------------------------------------------------------------------------
# Executive Summary Endpoint
# ----------------------------------------------------------------------------
@app.post("/generate-summary", tags=["assessment"])
async def generate_summary(selected_model, assessment_results: List[Dict[str, Any]]):
    try:
        formatted_results = [{"assessment": r} for r in assessment_results]
        summary = generate_executive_summary(formatted_results,selected_model)
        return {"success": True,"executive_summary": summary.get("executive_summary", ""),"input_count": len(assessment_results)}
    except Exception as e:
        return {"success": False,"error": str(e),"executive_summary": ""}

# ----------------------------------------------------------------------------
# Report download endpoint
# ----------------------------------------------------------------------------
@app.get("/download-report", tags=["assessment"])
async def download_report(filename: str):
    rid = _req_id()
    logger.info(f"[{rid}] Download request for: {filename}")
    if not filename or '/' in filename or '\\' in filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid filename")
    found_path = None
    for d in REPORTS_DIRS:
        candidate = d / filename
        if candidate.exists() and candidate.is_file():
            found_path = candidate
            break
    if not found_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    if found_path.suffix.lower() != '.pdf':
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only PDF reports can be downloaded")
    return FileResponse(path=str(found_path), filename=filename, media_type='application/pdf')

# ----------------------------------------------------------------------------
# FAISS Vectorstore Save/Load Endpoints
# ----------------------------------------------------------------------------
@app.post("/save-vectorstore", tags=["knowledge-base"])
async def save_vectorstore_api(
    dir_path: str = Form(...),
    kb_type: str = Form("global")
):
    try:
        if kb_type == "evidence":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Evidence KB is only available in memory and cannot be saved to disk"
            )
        vs = VECTORSTORE_CACHE.get(kb_type)
        if vs is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"No vectorstore cached for {kb_type}")
        saved_path = save_faiss_vectorstore(vs, dir_path)
        return {"success": True, "path": saved_path, "kb_type": kb_type}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@app.post("/load-vectorstore", tags=["knowledge-base"])
async def load_vectorstore_api(
    dir_path: str = Form(...),
    kb_type: str = Form("global"),
    model_name: str = Form(...)
):
    try:
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        embeddings = OllamaEmbeddings(model=model_name, base_url=base_url)
        vs = load_faiss_vectorstore(dir_path, embeddings)
        VECTORSTORE_CACHE[kb_type] = vs
        return {"success": True,"path": dir_path,"kb_type": kb_type,"ntotal": getattr(vs.index, "ntotal", None)}
    except FileNotFoundError as fe:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(fe))
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

# ----------------------------------------------------------------------------
# Run with:  uvicorn api.main:app --reload
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn    
    uvicorn.run("api.main:app", host="0.0.0.0", port=5000, reload=True)
