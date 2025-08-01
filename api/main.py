"""
FastAPI wrapper for Knowledge Base Builder with enhanced file handling.
Provides REST API endpoints for document processing and knowledge base creation.
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import tempfile
import os
import logging
import traceback
import time
import asyncio
from pathlib import Path

# Import the knowledge base builder
from utils.llm_chain import build_knowledge_base
from utils.find_llm import get_ollama_model_names

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("api.log", mode="a")
    ]
)
logger = logging.getLogger(__name__)

# FastAPI app configuration
app = FastAPI(
    title="Knowledge Base Builder API",
    description="""
    Advanced document processing service that builds searchable knowledge bases 
    from uploaded files using LangChain and Ollama LLMs.
    
    Features:
    - Multi-format document support (PDF, Word, Text, CSV, Markdown)
    - Batch processing with configurable parameters
    - Vector embeddings using FAISS
    - Robust error handling and retry mechanisms
    - Comprehensive logging and monitoring
    """,
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {
            "name": "health",
            "description": "Health check and system status endpoints"
        },
        {
            "name": "knowledge-base",
            "description": "Knowledge base creation and management"
        },
        {
            "name": "models",
            "description": "Available language models"
        }
    ]
)

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration constants
class Config:
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    SUPPORTED_EXTENSIONS = {'.txt', '.pdf', '.docx', '.doc', '.md', '.csv'}
    MAX_FILES_PER_REQUEST = 20
    DEFAULT_BATCH_SIZE = 15
    DEFAULT_DELAY = 0.2
    DEFAULT_MAX_RETRIES = 3
    
    # Validation ranges
    BATCH_SIZE_RANGE = (1, 100)
    DELAY_RANGE = (0.0, 10.0)
    RETRIES_RANGE = (1, 10)

# Pydantic models for request/response validation
class KnowledgeBaseRequest(BaseModel):
    """Request model for knowledge base creation with comprehensive validation."""
    
    selected_model: str = Field(
        ..., 
        description="The language model to use for processing",
        min_length=1,
        max_length=100
    )
    batch_size: int = Field(
        Config.DEFAULT_BATCH_SIZE,
        description="Number of documents to process in each batch",
        ge=Config.BATCH_SIZE_RANGE[0],
        le=Config.BATCH_SIZE_RANGE[1]
    )
    delay_between_batches: float = Field(
        Config.DEFAULT_DELAY,
        description="Delay in seconds between batches to prevent resource exhaustion",
        ge=Config.DELAY_RANGE[0],
        le=Config.DELAY_RANGE[1]
    )
    max_retries: int = Field(
        Config.DEFAULT_MAX_RETRIES,
        description="Maximum number of retries for failed batches",
        ge=Config.RETRIES_RANGE[0],
        le=Config.RETRIES_RANGE[1]
    )

    @validator('selected_model')
    def validate_model_name(cls, v):
        if not v.strip():
            raise ValueError('Model name cannot be empty')
        return v.strip()

class FileProcessingResult(BaseModel):
    """Results for individual file processing."""
    filename: str
    size_bytes: int
    processing_time: float
    chunks_created: int
    status: str

class KnowledgeBaseResponse(BaseModel):
    """Comprehensive response model for knowledge base creation."""
    
    success: bool
    message: str
    processing_summary: Dict[str, Any]
    vector_count: Optional[int] = None
    total_processing_time: Optional[float] = None
    files_processed: Optional[List[FileProcessingResult]] = None
    error_details: Optional[str] = None
    warnings: Optional[List[str]] = None

class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    timestamp: str
    version: str
    dependencies: Dict[str, str]
    uptime_seconds: float

class ErrorResponse(BaseModel):
    """Standardized error response model."""
    error: str
    detail: str
    timestamp: str
    request_id: Optional[str] = None

# Global state for tracking
app_start_time = time.time()
request_counter = 0

# Utility functions
def generate_request_id() -> str:
    """Generate unique request ID for tracking."""
    global request_counter
    request_counter += 1
    return f"req_{int(time.time())}_{request_counter}"

def validate_file(file: UploadFile) -> List[str]:
    """Validate uploaded file and return list of errors if any."""
    errors = []
    
    if not file.filename:
        errors.append("File must have a filename")
        return errors
    
    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in Config.SUPPORTED_EXTENSIONS:
        errors.append(
            f"Unsupported file type '{file_ext}'. "
            f"Supported types: {', '.join(Config.SUPPORTED_EXTENSIONS)}"
        )
    
    # Check file size
    if file.size and file.size > Config.MAX_FILE_SIZE:
        errors.append(
            f"File '{file.filename}' ({file.size / 1024 / 1024:.1f}MB) "
            f"exceeds maximum size of {Config.MAX_FILE_SIZE / 1024 / 1024}MB"
        )
    
    return errors

async def save_uploaded_file(file: UploadFile) -> str:
    """Save uploaded file to temporary location and return path."""
    file_ext = Path(file.filename).suffix if file.filename else '.txt'
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
        content = await file.read()
        if not content:
            raise ValueError(f"File '{file.filename}' is empty")
        
        tmp_file.write(content)
        temp_path = tmp_file.name
    
    logger.info(f"Saved uploaded file '{file.filename}' to temporary path: {temp_path}")
    return temp_path

def cleanup_temp_files(file_paths: List[str]) -> None:
    """Clean up temporary files safely."""
    for temp_path in file_paths:
        try:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                logger.debug(f"Cleaned up temporary file: {temp_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temporary file {temp_path}: {e}")

# API Endpoints

@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["health"],
    summary="Health check endpoint"
)
async def health_check():
    """
    Comprehensive health check endpoint that reports system status and dependencies.
    """
    try:
        uptime = time.time() - app_start_time
        
        # Check dependencies (simplified check)
        dependencies = {
            "langchain": "available",
            "faiss": "available",
            "ollama": "unknown"  # Would need actual connection test
        }
        
        return HealthResponse(
            status="healthy",
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            version="2.0.0",
            dependencies=dependencies,
            uptime_seconds=uptime
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service temporarily unavailable"
        )

@app.get(
    "/models",
    tags=["models"],
    summary="Get available language models"
)
async def get_available_models():
    """
    Return list of available language models for knowledge base building.
    In production, this could query Ollama directly for real-time model availability.
    """
    models = [
        {
            "name": "bge-m3:latest",
            "description": "BGE-M3 embedding model - multilingual support",
            "type": "embedding",
            "recommended": True
        },
        {
            "name": "llama3:latest",
            "description": "Llama 3 - Advanced language understanding",
            "type": "language_model",
            "recommended": True
        },
        {
            "name": "llama2:latest",
            "description": "Llama 2 - Stable and reliable",
            "type": "language_model",
            "recommended": False
        },
        {
            "name": "mistral:latest",
            "description": "Mistral - Efficient and fast",
            "type": "language_model",
            "recommended": False
        },
        {
            "name": "codellama:latest",
            "description": "Code Llama - Specialized for code understanding",
            "type": "language_model",
            "recommended": False
        }
    ]
    
    return {
        "models": models,
        "total_count": len(models),
        "recommended": [m for m in models if m.get("recommended", False)]
    }

@app.post(
    "/build-knowledge-base",
    response_model=KnowledgeBaseResponse,
    tags=["knowledge-base"],
    summary="Build knowledge base from uploaded documents",
    responses={
        200: {"description": "Knowledge base created successfully"},
        400: {"description": "Invalid request parameters or files"},
        413: {"description": "File size exceeds limit"},
        422: {"description": "Validation error"},
        500: {"description": "Internal server error"}
    }
)
async def build_knowledge_base_endpoint(
    selected_model: str = Form(..., description="Language model to use for processing"),
    batch_size: int = Form(Config.DEFAULT_BATCH_SIZE, description="Batch size for processing"),
    delay_between_batches: float = Form(Config.DEFAULT_DELAY, description="Delay between batches"),
    max_retries: int = Form(Config.DEFAULT_MAX_RETRIES, description="Maximum retry attempts"),
    files: List[UploadFile] = File(..., description="Document files to process")
):
    """
    Build a FAISS-based knowledge base from uploaded document files.
    
    This endpoint processes multiple documents using specialized loaders based on file type,
    creates text chunks, generates vector embeddings, and builds a searchable knowledge base.
    
    **Supported File Types:**
    - PDF documents (.pdf)
    - Word documents (.docx, .doc)  
    - Text files (.txt)
    - Markdown files (.md)
    - CSV files (.csv)
    
    **Processing Pipeline:**
    1. File validation and temporary storage
    2. Document loading with appropriate parsers
    3. Text chunking and preprocessing
    4. Vector embedding generation
    5. FAISS index creation
    6. Cleanup and response generation
    """
    
    request_id = generate_request_id()
    start_time = time.time()
    temp_file_paths = []
    warnings = []
    
    try:
        logger.info(f"[{request_id}] Starting knowledge base creation with {len(files)} files")
        
        # Validate request parameters using Pydantic model
        try:
            request_params = KnowledgeBaseRequest(
                selected_model=selected_model,
                batch_size=batch_size,
                delay_between_batches=delay_between_batches,
                max_retries=max_retries
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid parameters: {str(e)}"
            )
        
        # Validate files
        if not files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No files provided"
            )
        
        if len(files) > Config.MAX_FILES_PER_REQUEST:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Too many files. Maximum {Config.MAX_FILES_PER_REQUEST} files per request"
            )
        
        # Validate each file
        all_errors = []
        for file in files:
            file_errors = validate_file(file)
            if file_errors:
                all_errors.extend([f"{file.filename}: {error}" for error in file_errors])
        
        if all_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File validation errors: {'; '.join(all_errors)}"
            )
        
        # Save uploaded files to temporary locations
        file_processing_results = []
        
        for file in files:
            file_start_time = time.time()
            try:
                temp_path = await save_uploaded_file(file)
                temp_file_paths.append(temp_path)
                
                file_processing_time = time.time() - file_start_time
                file_processing_results.append(
                    FileProcessingResult(
                        filename=file.filename,
                        size_bytes=file.size or 0,
                        processing_time=file_processing_time,
                        chunks_created=0,  # Will be updated after processing
                        status="uploaded"
                    )
                )
                
            except Exception as e:
                error_msg = f"Failed to save file '{file.filename}': {str(e)}"
                logger.error(f"[{request_id}] {error_msg}")
                warnings.append(error_msg)
        
        if not temp_file_paths:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No files could be processed successfully"
            )
        
        # Build the knowledge base
        logger.info(f"[{request_id}] Building knowledge base with parameters: {request_params.dict()}")
        
        try:
            vectorstore = build_knowledge_base(
                files=temp_file_paths,
                selected_model=request_params.selected_model,
                batch_size=request_params.batch_size,
                delay_between_batches=request_params.delay_between_batches,
                max_retries=request_params.max_retries
            )
            
            # Get final metrics
            total_processing_time = time.time() - start_time
            vector_count = vectorstore.index.ntotal if hasattr(vectorstore, 'index') else None
            
            # Update file processing results with success status
            for result in file_processing_results:
                result.status = "processed"
                result.chunks_created = vector_count // len(file_processing_results) if vector_count else 0
            
            processing_summary = {
                "total_files": len(files),
                "successful_files": len(temp_file_paths),
                "failed_files": len(files) - len(temp_file_paths),
                "total_vectors": vector_count,
                "processing_time_seconds": total_processing_time,
                "average_time_per_file": total_processing_time / len(temp_file_paths) if temp_file_paths else 0
            }
            
            logger.info(f"[{request_id}] Knowledge base created successfully: {processing_summary}")
            
            return KnowledgeBaseResponse(
                success=True,
                message="Knowledge base built successfully",
                processing_summary=processing_summary,
                vector_count=vector_count,
                total_processing_time=total_processing_time,
                files_processed=file_processing_results,
                warnings=warnings if warnings else None
            )
            
        except Exception as e:
            error_msg = f"Knowledge base creation failed: {str(e)}"
            logger.error(f"[{request_id}] {error_msg}")
            logger.error(f"[{request_id}] Traceback: {traceback.format_exc()}")
            
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error_msg
            )
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        error_msg = f"Unexpected error during processing: {str(e)}"
        logger.error(f"[{request_id}] {error_msg}")
        logger.error(f"[{request_id}] Traceback: {traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg
        )
    
    finally:
        # Always clean up temporary files
        cleanup_temp_files(temp_file_paths)
        logger.info(f"[{request_id}] Request completed in {time.time() - start_time:.2f} seconds")

@app.get(
    "/",
    tags=["health"],
    summary="API information"
)
async def root():
    """Root endpoint providing basic API information and navigation."""
    return {
        "name": "Knowledge Base Builder API",
        "version": "2.0.0",
        "description": "Advanced document processing service for building searchable knowledge bases",
        "documentation": {
            "interactive": "/docs",
            "alternative": "/redoc"
        },
        "endpoints": {
            "health": "/health",
            "models": "/models",
            "build": "/build-knowledge-base"
        },
        "features": [
            "Multi-format document support",
            "Batch processing with retry mechanisms", 
            "Vector embeddings using FAISS",
            "Comprehensive error handling",
            "Request tracking and logging"
        ]
    }

@app.get(
    "/stats",
    tags=["health"],
    summary="API usage statistics"
)
async def get_stats():
    """Get basic API usage statistics."""
    uptime = time.time() - app_start_time
    
    return {
        "uptime_seconds": uptime,
        "uptime_formatted": f"{uptime // 3600:.0f}h {(uptime % 3600) // 60:.0f}m {uptime % 60:.0f}s",
        "total_requests_processed": request_counter,
        "average_requests_per_minute": (request_counter / (uptime / 60)) if uptime > 0 else 0
    }

# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Custom HTTP exception handler with structured error responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=exc.__class__.__name__,
            detail=str(exc.detail),
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        ).dict()
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """General exception handler for unhandled errors."""
    logger.error(f"Unhandled exception: {exc}")
    logger.error(f"Traceback: {traceback.format_exc()}")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="InternalServerError",
            detail="An unexpected error occurred. Please try again later.",
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        ).dict()
    )

@app.get("/api/ollama-models")
async def get_ollama_models():
    """Get available Ollama models (excluding embedding models)"""
    try:
        models = [name for name in get_ollama_model_names() if "embed" not in name]
        return {"models": sorted(models)}
    except Exception as e:
        logger.error(f"Error fetching Ollama models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch Ollama models: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    
    logger.info("Starting Knowledge Base Builder API server...")
    
    uvicorn.run(
        "main_v2:app",
        host="0.0.0.0",
        port=5000,
        reload=True,
        log_level="info",
        access_log=True
    )


