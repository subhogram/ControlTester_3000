"""
Audit Analyzer
Orchestrates per-control analysis using existing assess_evidence_with_kb()
Queries pre-loaded KB1 (global) and KB2 (company)
NO API CODE - pure analysis orchestration
"""

import os
from typing import Dict, List, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Lazy load dependencies
_llm_chain = None
_file_handlers = None

def get_llm_chain():
    """Lazy load llm_chain module."""
    global _llm_chain
    if _llm_chain is None:
        from utils import llm_chain as _llm_chain
    return _llm_chain

def get_file_wrapper_class():
    """Get FileWrapper class from main module."""
    # FileWrapper is defined in main.py, not file_handlers
    # We'll create a simple wrapper here instead
    class FileWrapper:
        def __init__(self, filepath, filename):
            self.name = filename
            self._path = filepath
        
        def read(self):
            with open(self._path, 'rb') as f:
                return f.read()
    
    return FileWrapper


def analyze_control_evidence(
    control: Dict[str, Any],
    evidence_files: List[Dict[str, str]],
    kb1_vectorstore,
    kb2_vectorstore,
    model: str
) -> Dict[str, Any]:
    """
    Analyze evidence for a single control against knowledge bases.
    
    Args:
        control: Control dict from test script
        evidence_files: List of dicts with {filename, tmp_path}
        kb1_vectorstore: Global knowledge base (FAISS)
        kb2_vectorstore: Company knowledge base (FAISS)
        model: LLM model name
    
    Returns:
        Analysis result dict with:
        {
            "control_id": str,
            "result": "PASS" | "FAIL" | "PARTIAL" | "NO_EVIDENCE",
            "observation": str,
            "kb1_reference": str,
            "kb2_reference": str,
            "recommendation": str,
            "exceptions": [str, ...],
            "evidence_analyzed": [str, ...]
        }
    """
    control_id = control.get("control_id", "UNKNOWN")
    
    logger.info(f"Analyzing control: {control_id}")
    
    # If no evidence, return NO_EVIDENCE
    if not evidence_files:
        return {
            "control_id": control_id,
            "result": "NO_EVIDENCE",
            "observation": "No evidence provided for this control",
            "kb1_reference": None,
            "kb2_reference": None,
            "recommendation": "Evidence must be provided to complete testing",
            "exceptions": ["No evidence uploaded"],
            "evidence_analyzed": []
        }
    
    try:
        llm_chain = get_llm_chain()
        FileWrapper = get_file_wrapper_class()
        
        # Load evidence files as FileWrapper objects
        evidence_wrappers = []
        evidence_filenames = []
        
        for ef in evidence_files:
            try:
                wrapper = FileWrapper(
                    filepath=ef['tmp_path'],
                    filename=ef['filename']
                )
                evidence_wrappers.append(wrapper)
                evidence_filenames.append(ef['filename'])
            except Exception as e:
                logger.error(f"Failed to load evidence {ef['filename']}: {e}")
        
        if not evidence_wrappers:
            return {
                "control_id": control_id,
                "result": "NO_EVIDENCE",
                "observation": "Evidence files could not be loaded",
                "kb1_reference": None,
                "kb2_reference": None,
                "recommendation": "Verify evidence file format and accessibility",
                "exceptions": ["Evidence load failed"],
                "evidence_analyzed": []
            }
        
        # Build evidence context from test script
        evidence_context = build_evidence_context(control)
        
        # Call existing assess_evidence_with_kb
        assessment_result = llm_chain.assess_evidence_with_kb(
            evidence_files=evidence_wrappers,
            kb_vectorstore=kb1_vectorstore,                # ✅ Correct
            company_kb_vectorstore=kb2_vectorstore,       # ✅ Correct
            evidence_context=evidence_context,
            selected_model=model 
        )
        
        # assess_evidence_with_kb returns a list of per-chunk dicts; flatten to string for parsing
        if isinstance(assessment_result, list):
            result_text = "\n\n".join(
                item["assessment"] if isinstance(item.get("assessment"), str) else str(item.get("assessment", ""))
                for item in assessment_result
            )
        else:
            result_text = str(assessment_result)

        # Parse assessment result
        parsed = parse_assessment_result(result_text, control)
        
        parsed["control_id"] = control_id
        parsed["evidence_analyzed"] = evidence_filenames
        
        logger.info(f"Control {control_id}: {parsed['result']}")
        
        return parsed
        
    except Exception as e:
        logger.error(f"Analysis failed for control {control_id}: {e}")
        return {
            "control_id": control_id,
            "result": "FAIL",
            "observation": f"Analysis error: {str(e)}",
            "kb1_reference": None,
            "kb2_reference": None,
            "recommendation": "Review control manually due to analysis error",
            "exceptions": [f"Analysis error: {str(e)}"],
            "evidence_analyzed": [ef['filename'] for ef in evidence_files]
        }


def build_evidence_context(control: Dict[str, Any]) -> str:
    """
    Build evidence context string from control details.
    This provides context to the LLM about what we're testing.
    """
    parts = []
    
    parts.append(f"Control ID: {control.get('control_id', 'N/A')}")
    parts.append(f"Control Description: {control.get('control_description', 'N/A')}")
    parts.append(f"Risk Statement: {control.get('risk_statement', 'N/A')}")
    parts.append(f"Test Objective: {control.get('test_objective', 'N/A')}")
    parts.append(f"Test Steps: {control.get('test_steps', 'N/A')}")
    parts.append(f"Evidence Required: {control.get('evidence_required', 'N/A')}")
    parts.append(f"Sample Size: {control.get('sample_size', 'N/A')}")
    parts.append(f"Control Owner: {control.get('control_owner', 'N/A')}")
    parts.append(f"Frequency: {control.get('frequency', 'N/A')}")
    
    return "\n".join(parts)


def parse_assessment_result(raw_result: str, control: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse assessment result from assess_evidence_with_kb.
    
    The function returns a markdown/text result. We need to extract:
    - Overall pass/fail conclusion
    - Key observations
    - KB references
    - Recommendations
    - Exceptions
    """
    result_lower = raw_result.lower()
    
    # Determine result
    result = "PARTIAL"  # Default
    
    if any(word in result_lower for word in ["pass", "compliant", "effective", "satisfactory"]):
        if not any(word in result_lower for word in ["not pass", "non-compliant", "ineffective", "exception", "deficiency"]):
            result = "PASS"
    
    if any(word in result_lower for word in ["fail", "non-compliant", "ineffective", "deficiency", "exception"]):
        result = "FAIL"
    
    if "partial" in result_lower or "partially" in result_lower:
        result = "PARTIAL"
    
    # Extract key sections
    kb1_ref = extract_section(raw_result, ["global policy", "global standard", "kb1", "industry standard"])
    kb2_ref = extract_section(raw_result, ["company policy", "company standard", "kb2", "internal policy"])
    
    # Extract recommendations
    recommendation = extract_section(raw_result, ["recommendation", "suggest", "improve", "should"])
    if not recommendation:
        if result == "FAIL":
            recommendation = "Address identified deficiencies and retest"
        elif result == "PARTIAL":
            recommendation = "Complete remaining requirements to achieve full compliance"
        else:
            recommendation = "Continue monitoring control effectiveness"
    
    # Extract exceptions
    exceptions = extract_exceptions(raw_result)
    
    return {
        "result": result,
        "observation": raw_result[:500],  # First 500 chars as summary
        "kb1_reference": kb1_ref,
        "kb2_reference": kb2_ref,
        "recommendation": recommendation,
        "exceptions": exceptions
    }


def extract_section(text: str, keywords: List[str]) -> Optional[str]:
    """Extract section from text based on keywords."""
    text_lower = text.lower()
    lines = text.split('\n')
    
    for idx, line in enumerate(lines):
        line_lower = line.lower()
        if any(kw in line_lower for kw in keywords):
            # Found keyword, collect next 2-3 lines
            section_lines = []
            for i in range(idx, min(idx + 3, len(lines))):
                if lines[i].strip():
                    section_lines.append(lines[i].strip())
            if section_lines:
                return " ".join(section_lines)[:200]
    
    return None


def extract_exceptions(text: str) -> List[str]:
    """Extract exception/deficiency statements from text."""
    exceptions = []
    lines = text.split('\n')
    
    exception_keywords = ["exception", "deficiency", "issue", "gap", "missing", "not found", "does not"]
    
    for line in lines:
        line_lower = line.lower()
        if any(kw in line_lower for kw in exception_keywords):
            cleaned = line.strip().lstrip('-•*').strip()
            if cleaned and len(cleaned) > 10:
                exceptions.append(cleaned[:150])
    
    return exceptions[:5]  # Max 5 exceptions


def analyze_all_controls(
    session_data: Dict[str, Any],
    kb1_vectorstore,
    kb2_vectorstore,
    model: str
) -> List[Dict[str, Any]]:
    """
    Analyze all controls in a session.
    
    Args:
        session_data: Full session dict from AuditSessionStore
        kb1_vectorstore: Global KB
        kb2_vectorstore: Company KB
        model: LLM model name
    
    Returns:
        List of analysis results (one per control)
    """
    controls = session_data.get("controls", [])
    uploaded_files = session_data.get("uploaded_files", {})
    
    logger.info(f"Analyzing {len(controls)} controls")
    
    results = []
    
    for control in controls:
        control_id = control.get("control_id")
        
        # Find evidence files for this control
        evidence_for_control = []
        for filename, file_data in uploaded_files.items():
            if control_id in file_data.get("satisfies_controls", []):
                evidence_for_control.append({
                    "filename": filename,
                    "tmp_path": file_data["tmp_path"]
                })
        
        # Analyze
        result = analyze_control_evidence(
            control=control,
            evidence_files=evidence_for_control,
            kb1_vectorstore=kb1_vectorstore,
            kb2_vectorstore=kb2_vectorstore,
            model=model
        )
        
        results.append(result)
    
    return results


def generate_overall_summary(analysis_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate overall summary from all control analysis results.
    
    Returns:
        {
            "controls_tested": int,
            "controls_with_evidence": int,
            "controls_without_evidence": int,
            "overall_result": str,
            "pass_count": int,
            "fail_count": int,
            "partial_count": int,
            "no_evidence_count": int
        }
    """
    total = len(analysis_results)
    
    pass_count = sum(1 for r in analysis_results if r["result"] == "PASS")
    fail_count = sum(1 for r in analysis_results if r["result"] == "FAIL")
    partial_count = sum(1 for r in analysis_results if r["result"] == "PARTIAL")
    no_evidence_count = sum(1 for r in analysis_results if r["result"] == "NO_EVIDENCE")
    
    controls_with_evidence = total - no_evidence_count
    
    # Determine overall result
    if no_evidence_count == total:
        overall_result = "NO_EVIDENCE"
    elif fail_count > 0:
        overall_result = "NON_COMPLIANT"
    elif partial_count > 0:
        overall_result = "PARTIALLY_COMPLIANT"
    else:
        overall_result = "COMPLIANT"
    
    return {
        "controls_tested": total,
        "controls_with_evidence": controls_with_evidence,
        "controls_without_evidence": no_evidence_count,
        "overall_result": overall_result,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "partial_count": partial_count,
        "no_evidence_count": no_evidence_count
    }