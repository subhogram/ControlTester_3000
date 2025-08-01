"""
Rewritten FastAPI wrapper for utils.llm_chain.build_knowledge_base()
File path: api/main.py
This version fixes the file-handling mismatch and ensures the endpoint works out of the box.
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
from utils.llm_chain import build_knowledge_base
from utils.find_llm import get_ollama_model_names

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
    title="Knowledge Base Builder API",
    version="2.1.0",
    description="Service that converts uploaded documents into a FAISS-backed knowledge base using LangChain & Ollama."
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
# Endpoints
# ----------------------------------------------------------------------------

@app.get("/", tags=["meta"], summary="API root")
async def root():
    return {
        "name": app.title,
        "version": app.version,
        "docs": "/docs",
        "health": "/health",
        "build": "/build-knowledge-base"
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

# Core endpoint ----------------------------------------------------------------
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
    rid = _req_id()
    t0 = time.time()
    logger.info(f"[{rid}] Received request with {len(files)} files")

    # ---------------------------------- validate request params
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

    # ---------------------------------- validate files
    errs: List[str] = []
    for f in files:
        errs.extend([f"{f.filename}: {e}" for e in _validate_upload(f)])
    if errs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "; ".join(errs))

    # ---------------------------------- persist uploads to tmp + reopen for utils
    tmp_paths: List[str] = []
    file_objs: List[Any] = []  # will hold open file handles
    file_results: List[FileResult] = []

    try:
        for uf in files:
            start = time.time()
            ext = Path(uf.filename).suffix or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(await uf.read())
            tmp.close()
            tmp_paths.append(tmp.name)
            fh = open(tmp.name, "rb")  # utils.save_and_load_files expects .name & .read()
            file_objs.append(fh)
            file_results.append(FileResult(
                filename=uf.filename,
                size_bytes=uf.size or 0,
                status="saved",
                processing_time=time.time() - start
            ))

        # ---------------------------------- call knowledge-base builder (sync code)
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
        return KBResp(success=True, message="Knowledge base built", processing_summary=summary, vector_count=vec_count, files_processed=file_results)

    except Exception as e:
        logger.error(f"[{rid}] Failed: {e}\n{traceback.format_exc()}")
        return KBResp(success=False, message="Failed", processing_summary={}, error_details=str(e))

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
# Run with:  uvicorn api.main:app --reload
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=5000, reload=True)
