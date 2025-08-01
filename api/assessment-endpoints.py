"""
Additional FastAPI endpoint for assess_evidence_with_kb() function
Add this to the existing api/main.py file (append to the existing code)
"""

# Additional imports needed for assessment endpoint
from utils.llm_chain import assess_evidence_with_kb
from langchain.schema import Document

# Additional Pydantic models for assessment endpoint
class AssessmentRequest(BaseModel):
    selected_model: str = Field(..., description="Ollama model for assessment")
    max_workers: int = Field(4, ge=1, le=20, description="Number of worker threads")

class AssessmentResponse(BaseModel):
    success: bool
    message: str
    assessment_results: List[Dict[str, Any]]
    processing_summary: Dict[str, Any]
    error_details: Optional[str] = None

# Assessment endpoint - ADD THIS TO THE EXISTING api/main.py FILE
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

# Additional endpoint for generating executive summary
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
        from utils.llm_chain import generate_executive_summary
        
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