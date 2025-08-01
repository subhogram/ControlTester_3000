"""
Complete FastAPI wrapper for ControlTester_3000
File: api/main.py
Includes both build_knowledge_base() and assess_evidence_with_kb() endpoints
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import tempfile
import os
import time
import logging
import traceback
from pathlib import Path

# utils imports (leave unchanged in their folders)
from utils.llm_chain import build_knowledge_base, assess_evidence_with_kb, generate_executive_summary
from utils.find_llm import get_ollama_model_names
from langchain.schema import Document

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
    version="2.1.0",
    description="Cybersecurity audit service with knowledge base building and evidence assessment capabilities using LangChain & Ollama.",
    openapi_tags=[
        {"name": "meta", "description": "API information and health checks"},
        {"name": "models", "description": "Available language models"},
        {"name": "knowledge-base", "description": "Knowledge base creation"},
        {"name": "assessment", "description": "Evidence assessment and audit analysis"}
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------------
# Config & Helpers
# ----------------------------------------------------------------------------
class _Cfg:
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
    SUPPORTED_EXT = {".txt", ".pdf", ".doc", ".docx", ".md", ".csv"}
    MAX_FILES = 20
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
    assessment_results: List[Dict[str, Any]]
    processing_summary: Dict[str, Any]
    error_details: Optional[str] = None

# ----------------------------------------------------------------------------
# Validation helpers
# ----------------------------------------------------------------------------

def _validate_upload(file: UploadFile) -> List[str]:
    errs = []
    if not file.filename:
        errs.append("Missing filename")
        return errs
    ext = Path(file.filename).suffix.lower()
    if ext not in _Cfg.SUPPORTED_EXT:
        errs.append(f"Unsupported file type '{ext}'")
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
            "models": "/models"
        }
    }

@app.get("/health", tags=["meta"], summary="Health check")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": time.time() - app_start,
        "requests": request_counter
    }

@app.get("/models", tags=["models"], summary="Available Ollama models")
async def models():
    try:
        names = [m for m in get_ollama_model_names() if "embed" not in m]
        return {"models": names, "count": len(names)}
    except Exception as e:
        raise HTTPException(500, f"Failed fetching models: {e}")

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
    files: List[UploadFile] = File(...)
):
    """
    Build a FAISS-based knowledge base from uploaded document files.
    
    Supports PDF, Word, Text, CSV, and Markdown files. Creates vector embeddings
    using Ollama models and stores them in a FAISS index for similarity search.
    """
    rid = _req_id()
    t0 = time.time()
    logger.info(f"[{rid}] Received request with {len(files)} files")

    # Validate request params
    try:
        KBReq(
            selected_model=selected_model,
            batch_size=batch_size,
            delay_between_batches=delay_between_batches,
            max_retries=max_retries
        )
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    if len(files) > _Cfg.MAX_FILES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max {_Cfg.MAX_FILES} files per request")

    # Validate files
    errs: List[str] = []
    for f in files:
        errs.extend([f"{f.filename}: {e}" for e in _validate_upload(f)])
    if errs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "; ".join(errs))

    # Process files
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

        # Build knowledge base
        logger.info(f"[{rid}] Invoking build_knowledge_base with {len(file_objs)} files")
        vectorstore = build_knowledge_base(
            files=file_objs,
            selected_model=selected_model,
            batch_size=batch_size,
            delay_between_batches=delay_between_batches,
            max_retries=max_retries
        )

        vec_count = getattr(vectorstore.index, "ntotal", None)
        summary = {
            "files": len(file_objs),
            "vectors": vec_count,
            "processing_seconds": time.time() - t0,
            "model": selected_model
        }
        logger.info(f"[{rid}] Success — {summary}")
        return KBResp(
            success=True, 
            message="Knowledge base built", 
            processing_summary=summary, 
            vector_count=vec_count, 
            files_processed=file_results
        )

    except Exception as e:
        logger.error(f"[{rid}] Failed: {e}\n{traceback.format_exc()}")
        return KBResp(
            success=False, 
            message="Failed", 
            processing_summary={}, 
            error_details=str(e)
        )

    finally:
        # cleanup
        for fh in file_objs:
            try:
                fh.close()
            except Exception:
                pass
        for p in tmp_paths:
            try:
                os.unlink(p)
            except Exception:
                pass
        logger.info(f"[{rid}] Request finished in {time.time() - t0:.2f}s")

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
    selected_model: str = Form(..., description="Ollama model for assessment"),
    max_workers: int = Form(4, description="Number of worker threads"),
    evidence_files: List[UploadFile] = File(..., description="Evidence files to assess"),
    global_kb_files: List[UploadFile] = File(..., description="Global standards knowledge base files"),
    company_kb_files: List[UploadFile] = File(..., description="Company-specific knowledge base files")
):
    """
    Assess evidence files against global and company-specific knowledge bases.
    
    This endpoint:
    1. Builds two knowledge bases (global standards + company-specific)
    2. Processes evidence files into Document objects
    3. Performs cybersecurity audit assessment using LLM
    4. Returns detailed assessment results with compliance status and recommendations
    
    **Required File Groups:**
    - **Evidence Files**: Documents/logs to be assessed (PDF, TXT, CSV, etc.)
    - **Global KB Files**: Global risk and control standards documents  
    - **Company KB Files**: Company-specific policies and control standards
    
    **Assessment Output:**
    - Compliance status (COMPLIANT, NON-COMPLIANT, PARTIALLY COMPLIANT)
    - Risk levels (CRITICAL, HIGH, MEDIUM, LOW)
    - Control framework alignment
    - Improvement recommendations
    """
    
    rid = _req_id()
    t0 = time.time()
    logger.info(f"[{rid}] Assessment request: {len(evidence_files)} evidence, {len(global_kb_files)} global KB, {len(company_kb_files)} company KB files")

    # Validate parameters
    try:
        AssessmentRequest(selected_model=selected_model, max_workers=max_workers)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    # Validate we have all required file types
    if not evidence_files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evidence files are required")
    if not global_kb_files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Global knowledge base files are required")
    if not company_kb_files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Company knowledge base files are required")

    # Validate all uploaded files
    all_files = evidence_files + global_kb_files + company_kb_files
    if len(all_files) > _Cfg.MAX_FILES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Total files exceed limit ({_Cfg.MAX_FILES})")
    
    errs = []
    for f in all_files:
        errs.extend([f"{f.filename}: {e}" for e in _validate_upload(f)])
    if errs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "; ".join(errs))

    # File processing variables
    tmp_paths = []
    global_kb_objs = []
    company_kb_objs = []
    evidence_objs = []

    try:
        # Process global KB files
        logger.info(f"[{rid}] Processing {len(global_kb_files)} global KB files")
        for uf in global_kb_files:
            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(await uf.read())
            tmp.close()
            tmp_paths.append(tmp.name)
            global_kb_objs.append(open(tmp.name, "rb"))

        # Process company KB files  
        logger.info(f"[{rid}] Processing {len(company_kb_files)} company KB files")
        for uf in company_kb_files:
            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(await uf.read())
            tmp.close()
            tmp_paths.append(tmp.name)
            company_kb_objs.append(open(tmp.name, "rb"))

        # Process evidence files
        logger.info(f"[{rid}] Processing {len(evidence_files)} evidence files")
        for uf in evidence_files:
            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(await uf.read())
            tmp.close()
            tmp_paths.append(tmp.name)
            evidence_objs.append(open(tmp.name, "rb"))

        # Build global knowledge base
        logger.info(f"[{rid}] Building global knowledge base")
        global_vectorstore = build_knowledge_base(
            files=global_kb_objs,
            selected_model=selected_model,
            batch_size=_Cfg.DEFAULT_BATCH,
            delay_between_batches=_Cfg.DEFAULT_DELAY,
            max_retries=_Cfg.DEFAULT_RETRIES
        )

        # Build company knowledge base
        logger.info(f"[{rid}] Building company knowledge base")
        company_vectorstore = build_knowledge_base(
            files=company_kb_objs,
            selected_model=selected_model,
            batch_size=_Cfg.DEFAULT_BATCH,
            delay_between_batches=_Cfg.DEFAULT_DELAY,
            max_retries=_Cfg.DEFAULT_RETRIES
        )

        # Convert evidence files to Document objects
        logger.info(f"[{rid}] Converting evidence files to Documents")
        evidence_docs = []
        from utils.file_handlers import save_and_load_files
        loaded_evidence = save_and_load_files(evidence_objs)
        
        # Ensure we have Document objects
        for doc in loaded_evidence:
            if hasattr(doc, 'page_content'):
                evidence_docs.append(doc)
            else:
                # Convert to Document if needed
                evidence_docs.append(Document(page_content=str(doc), metadata={}))

        # Perform assessment
        logger.info(f"[{rid}] Performing evidence assessment")
        assessment_results = assess_evidence_with_kb(
            evidence_docs=evidence_docs,
            kb_vectorstore=global_vectorstore,
            company_kb_vectorstore=company_vectorstore,
            max_workers=max_workers
        )

        # Prepare response
        processing_summary = {
            "evidence_files": len(evidence_files),
            "global_kb_files": len(global_kb_files),
            "company_kb_files": len(company_kb_files),
            "evidence_documents": len(evidence_docs),
            "assessment_results": len(assessment_results),
            "global_vectors": getattr(global_vectorstore.index, "ntotal", 0),
            "company_vectors": getattr(company_vectorstore.index, "ntotal", 0),
            "processing_seconds": time.time() - t0,
            "model_used": selected_model,
            "max_workers": max_workers
        }

        logger.info(f"[{rid}] Assessment completed successfully: {processing_summary}")
        return AssessmentResponse(
            success=True,
            message="Evidence assessment completed successfully",
            assessment_results=assessment_results,
            processing_summary=processing_summary
        )

    except Exception as e:
        logger.error(f"[{rid}] Assessment failed: {e}\n{traceback.format_exc()}")
        return AssessmentResponse(
            success=False,
            message="Assessment failed",
            assessment_results=[],
            processing_summary={},
            error_details=str(e)
        )

    finally:
        # Cleanup file handles
        for fh in global_kb_objs + company_kb_objs + evidence_objs:
            try:
                fh.close()
            except Exception:
                pass
        
        # Cleanup temp files
        for p in tmp_paths:
            try:
                os.unlink(p)
            except Exception:
                pass
        
        logger.info(f"[{rid}] Assessment request completed in {time.time() - t0:.2f}s")

# ----------------------------------------------------------------------------
# Executive Summary Endpoint
# ----------------------------------------------------------------------------
@app.post(
    "/generate-summary",
    tags=["assessment"],
    summary="Generate executive summary from assessment results"  
)
async def generate_summary(assessment_results: List[Dict[str, Any]]):
    """
    Generate an executive summary from assessment results.
    
    Takes a list of assessment results and produces a high-level
    executive summary suitable for audit reports.
    """
    try:
        # Convert input to expected format
        formatted_results = []
        for result in assessment_results:
            formatted_results.append({"assessment": result})
        
        summary = generate_executive_summary(formatted_results)
        return {
            "success": True,
            "executive_summary": summary.get("executive_summary", ""),
            "input_count": len(assessment_results)
        }
    except Exception as e:
        logger.error(f"Summary generation failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "executive_summary": ""
        }

# ----------------------------------------------------------------------------
# Run with:  uvicorn api.main:app --reload
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=5000, reload=True)