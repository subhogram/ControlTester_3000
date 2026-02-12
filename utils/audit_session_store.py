"""
Audit Session State Management
Backend logic for managing stateful audit sessions
NO API CODE - pure state management
"""

import os
import shutil
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from pathlib import Path
import uuid
import logging

logger = logging.getLogger(__name__)

# Configuration
AUDIT_SESSION_TTL_HOURS = int(os.getenv("AUDIT_SESSION_TTL_HOURS", "24"))
TEMP_DIR_BASE = Path(os.getenv("AUDIT_TEMP_DIR", "/tmp/audit_sessions"))


class AuditSessionStore:
    """
    Manages audit session state - separate from chat sessions.
    Each audit session is stateful and persists across multiple API calls.
    """
    
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        TEMP_DIR_BASE.mkdir(parents=True, exist_ok=True)
        logger.info(f"AuditSessionStore initialized. Temp dir: {TEMP_DIR_BASE}")
    
    def create_session(self, model: str, session_id: str = None) -> str:
        """
        Create a new audit session.
        
        Args:
            model: LLM model name
            session_id: Optional session ID, generates UUID if not provided
        
        Returns:
            session_id
        """
        if not session_id:
            session_id = str(uuid.uuid4())
        
        session_dir = TEMP_DIR_BASE / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        (session_dir / "evidence").mkdir(exist_ok=True)
        (session_dir / "output").mkdir(exist_ok=True)
        
        self.sessions[session_id] = {
            "session_id": session_id,
            "status": "awaiting_evidence",
            "created_at": datetime.now().isoformat(),
            "last_activity": datetime.now().isoformat(),
            "model": model,
            "test_script_filename": None,
            "controls": [],
            "evidence_manifest": {},
            "uploaded_files": {},
            "workpaper_path": None,
            "pdf_path": None,
            "analysis_complete": False,
            "temp_dir": str(session_dir)
        }
        
        logger.info(f"Created audit session: {session_id}")
        return session_id
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session by ID."""
        return self.sessions.get(session_id)
    
    def update_session(self, session_id: str, updates: Dict[str, Any]):
        """
        Update session fields.
        
        Args:
            session_id: Session ID
            updates: Dict of fields to update
        """
        if session_id not in self.sessions:
            raise ValueError(f"Session {session_id} not found")
        
        self.sessions[session_id].update(updates)
        self.sessions[session_id]["last_activity"] = datetime.now().isoformat()
    
    def set_test_script(self, session_id: str, filename: str, controls: List[Dict]):
        """
        Store parsed test script data.
        
        Args:
            session_id: Session ID
            filename: Original test script filename
            controls: List of parsed control dicts
        """
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Create evidence manifest from controls
        evidence_manifest = {}
        for control in controls:
            control_id = control.get("control_id", "UNKNOWN")
            evidence_manifest[control_id] = {
                "required_description": control.get("evidence_required", ""),
                "required_keywords": self._extract_keywords(
                    control.get("evidence_required", "")
                ),
                "status": "pending",
                "rejection_reason": None,
                "satisfied_by_file": None
            }
        
        self.update_session(session_id, {
            "test_script_filename": filename,
            "controls": controls,
            "evidence_manifest": evidence_manifest
        })
        
        logger.info(f"Session {session_id}: Set test script with {len(controls)} controls")
    
    def add_uploaded_file(
        self, 
        session_id: str, 
        filename: str,
        tmp_path: str,
        file_size: int,
        validation_result: Dict[str, Any]
    ):
        """
        Add validated uploaded file to session.
        
        Args:
            session_id: Session ID
            filename: Original filename
            tmp_path: Path to saved file
            file_size: File size in bytes
            validation_result: Dict from evidence validator
        """
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        uploaded_files = session.get("uploaded_files", {})
        uploaded_files[filename] = {
            "tmp_path": tmp_path,
            "file_size": file_size,
            "content_type_detected": validation_result.get("content_type_detected"),
            "validation_status": validation_result.get("validation_status"),
            "rejection_reason": validation_result.get("rejection_reason"),
            "satisfies_controls": validation_result.get("satisfies_controls", []),
            "content_preview": validation_result.get("content_preview", "")
        }
        
        # Update evidence manifest
        evidence_manifest = session.get("evidence_manifest", {})
        for control_id in validation_result.get("satisfies_controls", []):
            if control_id in evidence_manifest:
                if validation_result.get("validation_status") == "accepted":
                    evidence_manifest[control_id]["status"] = "received"
                    evidence_manifest[control_id]["satisfied_by_file"] = filename
                else:
                    evidence_manifest[control_id]["status"] = "rejected"
                    evidence_manifest[control_id]["rejection_reason"] = validation_result.get("rejection_reason")
        
        # Update status
        pending_count = sum(
            1 for v in evidence_manifest.values() if v["status"] == "pending"
        )
        new_status = "ready" if pending_count == 0 else "partially_received"
        
        self.update_session(session_id, {
            "uploaded_files": uploaded_files,
            "evidence_manifest": evidence_manifest,
            "status": new_status
        })
        
        logger.info(f"Session {session_id}: Added file {filename}, status now {new_status}")
    
    def get_pending_controls(self, session_id: str) -> List[Dict[str, Any]]:
        """Get list of controls still awaiting evidence."""
        session = self.get_session(session_id)
        if not session:
            return []
        
        pending = []
        evidence_manifest = session.get("evidence_manifest", {})
        controls = session.get("controls", [])
        
        for control in controls:
            control_id = control.get("control_id")
            manifest_entry = evidence_manifest.get(control_id, {})
            
            if manifest_entry.get("status") == "pending":
                pending.append({
                    "control_id": control_id,
                    "control_description": control.get("control_description", ""),
                    "evidence_required": control.get("evidence_required", ""),
                    "status": "pending"
                })
        
        return pending
    
    def get_evidence_summary(self, session_id: str) -> Dict[str, int]:
        """Get summary counts of evidence status."""
        session = self.get_session(session_id)
        if not session:
            return {"total_controls": 0, "received": 0, "pending": 0, "rejected": 0}
        
        evidence_manifest = session.get("evidence_manifest", {})
        
        received = sum(1 for v in evidence_manifest.values() if v["status"] == "received")
        pending = sum(1 for v in evidence_manifest.values() if v["status"] == "pending")
        rejected = sum(1 for v in evidence_manifest.values() if v["status"] == "rejected")
        
        return {
            "total_controls": len(evidence_manifest),
            "received": received,
            "pending": pending,
            "rejected": rejected
        }
    
    def mark_analysis_complete(
        self, 
        session_id: str, 
        workpaper_path: str,
        pdf_path: Optional[str] = None
    ):
        """Mark session as analysis complete."""
        self.update_session(session_id, {
            "status": "complete",
            "analysis_complete": True,
            "workpaper_path": workpaper_path,
            "pdf_path": pdf_path
        })
        
        logger.info(f"Session {session_id}: Analysis marked complete")
    
    def clear_session(self, session_id: str):
        """Clear session and delete temp files."""
        session = self.get_session(session_id)
        if not session:
            logger.warning(f"Cannot clear session {session_id}: not found")
            return
        
        # Delete temp directory
        temp_dir = Path(session["temp_dir"])
        if temp_dir.exists():
            try:
                shutil.rmtree(temp_dir)
                logger.info(f"Deleted temp dir: {temp_dir}")
            except Exception as e:
                logger.error(f"Failed to delete temp dir {temp_dir}: {e}")
        
        # Remove from memory
        del self.sessions[session_id]
        logger.info(f"Cleared session: {session_id}")
    
    def cleanup_expired_sessions(self):
        """Remove sessions older than TTL."""
        now = datetime.now()
        ttl = timedelta(hours=AUDIT_SESSION_TTL_HOURS)
        
        expired = []
        for session_id, session in self.sessions.items():
            created = datetime.fromisoformat(session["created_at"])
            if now - created > ttl:
                expired.append(session_id)
        
        for session_id in expired:
            logger.info(f"Expiring session {session_id} (TTL exceeded)")
            self.clear_session(session_id)
        
        if expired:
            logger.info(f"Cleaned up {len(expired)} expired sessions")
    
    def get_session_temp_dir(self, session_id: str) -> Optional[Path]:
        """Get temp directory path for session."""
        session = self.get_session(session_id)
        if not session:
            return None
        return Path(session["temp_dir"])
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract likely keywords from evidence requirement text."""
        if not text:
            return []
        
        # Simple keyword extraction - can be enhanced
        words = text.lower().replace(",", " ").replace(".", " ").split()
        
        # Filter common words
        stopwords = {"the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "showing", "that"}
        keywords = [w for w in words if len(w) > 3 and w not in stopwords]
        
        return keywords[:10]  # Top 10


# Global instance
audit_session_store = AuditSessionStore()
