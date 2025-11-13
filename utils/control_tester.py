"""Control Testing Module for Cybersecurity Audit

Provides automated control testing capabilities including:
- Control effectiveness assessment
- Compliance verification
- Evidence validation
- Gap analysis
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
import json
from langchain_ollama import ChatOllama
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain

logger = logging.getLogger(__name__)

class ControlTester:
    """Automated cybersecurity control testing engine"""
    
    # Standard control frameworks
    FRAMEWORKS = {
        "NIST_CSF": ["Identify", "Protect", "Detect", "Respond", "Recover"],
        "ISO_27001": ["A.5", "A.6", "A.7", "A.8", "A.9", "A.10", "A.11", "A.12", "A.13", "A.14", "A.15", "A.16", "A.17", "A.18"],
        "SOC2": ["Security", "Availability", "Processing Integrity", "Confidentiality", "Privacy"],
        "CIS_CONTROLS": [f"Control {i}" for i in range(1, 19)]
    }
    
    def __init__(self, model_name: str, kb_vectorstore=None, company_vectorstore=None):
        """Initialize control tester
        
        Args:
            model_name: LLM model to use
            kb_vectorstore: Knowledge base vector store
            company_vectorstore: Company documents vector store
        """
        self.model_name = model_name
        self.kb_vectorstore = kb_vectorstore
        self.company_vectorstore = company_vectorstore
        self.llm = ChatOllama(model=model_name, temperature=0.1)
        
        logger.info(f"ControlTester initialized with model: {model_name}")
    
    def test_control(self, control_id: str, control_description: str, 
                    evidence_docs: List[Any], framework: str = "NIST_CSF") -> Dict[str, Any]:
        """Test a specific control against evidence
        
        Args:
            control_id: Control identifier (e.g., 'AC-1', 'PR.AC-1')
            control_description: Description of what the control requires
            evidence_docs: List of evidence documents
            framework: Control framework being used
            
        Returns:
            Dictionary containing test results
        """
        logger.info(f"Testing control {control_id} from {framework}")
        
        # Retrieve relevant context
        context = self._get_control_context(control_id, control_description)
        
        # Analyze evidence
        evidence_analysis = self._analyze_evidence_for_control(
            control_id, control_description, evidence_docs, context
        )
        
        # Determine control effectiveness
        effectiveness = self._assess_control_effectiveness(evidence_analysis)
        
        result = {
            "control_id": control_id,
            "framework": framework,
            "control_description": control_description,
            "test_date": datetime.now().isoformat(),
            "effectiveness_rating": effectiveness["rating"],
            "effectiveness_score": effectiveness["score"],
            "evidence_analysis": evidence_analysis,
            "findings": effectiveness["findings"],
            "recommendations": effectiveness["recommendations"],
            "status": effectiveness["status"]
        }
        
        logger.info(f"Control {control_id} test completed: {effectiveness['status']}")
        return result
    
    def test_control_framework(self, framework: str, evidence_docs: List[Any]) -> List[Dict[str, Any]]:
        """Test all controls in a framework
        
        Args:
            framework: Framework name (e.g., 'NIST_CSF', 'ISO_27001')
            evidence_docs: List of evidence documents
            
        Returns:
            List of test results for each control
        """
        logger.info(f"Testing full framework: {framework}")
        
        if framework not in self.FRAMEWORKS:
            raise ValueError(f"Unknown framework: {framework}. Supported: {list(self.FRAMEWORKS.keys())}")
        
        results = []
        controls = self._get_framework_controls(framework)
        
        for control in controls:
            try:
                result = self.test_control(
                    control["id"],
                    control["description"],
                    evidence_docs,
                    framework
                )
                results.append(result)
            except Exception as e:
                logger.error(f"Error testing control {control['id']}: {str(e)}")
                results.append({
                    "control_id": control["id"],
                    "framework": framework,
                    "status": "ERROR",
                    "error": str(e)
                })
        
        return results
    
    def _get_control_context(self, control_id: str, control_description: str) -> Dict[str, Any]:
        """Retrieve relevant context from knowledge bases"""
        context = {
            "policy_requirements": [],
            "company_documentation": [],
            "best_practices": []
        }
        
        # Query knowledge base
        if self.kb_vectorstore:
            try:
                query = f"{control_id}: {control_description}"
                kb_results = self.kb_vectorstore.similarity_search(query, k=3)
                context["policy_requirements"] = [doc.page_content for doc in kb_results]
            except Exception as e:
                logger.warning(f"KB search failed: {e}")
        
        # Query company docs
        if self.company_vectorstore:
            try:
                company_results = self.company_vectorstore.similarity_search(
                    f"Implementation of {control_id}", k=3
                )
                context["company_documentation"] = [doc.page_content for doc in company_results]
            except Exception as e:
                logger.warning(f"Company docs search failed: {e}")
        
        return context
    
    def _analyze_evidence_for_control(self, control_id: str, control_description: str,
                                     evidence_docs: List[Any], context: Dict) -> Dict[str, Any]:
        """Analyze evidence against control requirements"""
        
        prompt = PromptTemplate(
            input_variables=["control_id", "control_desc", "context", "evidence"],
            template="""You are a cybersecurity auditor analyzing evidence for control testing.

Control ID: {control_id}
Control Description: {control_desc}

Policy Requirements:
{context}

Evidence Provided:
{evidence}

Analyze the evidence and provide:
1. Whether the evidence adequately demonstrates control implementation
2. Specific evidence items that support the control
3. Any gaps or missing evidence
4. Quality and completeness of evidence

Provide your analysis in JSON format:
{{
  "evidence_adequate": true/false,
  "supporting_evidence": ["item1", "item2"],
  "gaps": ["gap1", "gap2"],
  "evidence_quality": "High/Medium/Low",
  "completeness_percentage": 0-100
}}
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        
        # Prepare evidence summary
        evidence_summary = "\n".join([str(doc)[:500] for doc in evidence_docs[:5]])
        context_summary = json.dumps(context, indent=2)
        
        try:
            result = chain.run(
                control_id=control_id,
                control_desc=control_description,
                context=context_summary,
                evidence=evidence_summary
            )
            
            # Parse JSON response
            analysis = json.loads(result)
            return analysis
        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM response as JSON, using text analysis")
            return {
                "evidence_adequate": False,
                "supporting_evidence": [],
                "gaps": ["Unable to parse evidence"],
                "evidence_quality": "Unknown",
                "completeness_percentage": 0,
                "raw_analysis": result
            }
        except Exception as e:
            logger.error(f"Evidence analysis failed: {e}")
            return {
                "evidence_adequate": False,
                "gaps": [f"Analysis error: {str(e)}"],
                "evidence_quality": "Unknown",
                "completeness_percentage": 0
            }
    
    def _assess_control_effectiveness(self, evidence_analysis: Dict) -> Dict[str, Any]:
        """Assess overall control effectiveness based on evidence analysis"""
        
        completeness = evidence_analysis.get("completeness_percentage", 0)
        evidence_quality = evidence_analysis.get("evidence_quality", "Low")
        evidence_adequate = evidence_analysis.get("evidence_adequate", False)
        gaps = evidence_analysis.get("gaps", [])
        
        # Calculate effectiveness score (0-100)
        score = completeness
        
        # Adjust for quality
        quality_multipliers = {"High": 1.0, "Medium": 0.8, "Low": 0.6, "Unknown": 0.5}
        score *= quality_multipliers.get(evidence_quality, 0.5)
        
        # Determine rating and status
        if score >= 90 and evidence_adequate:
            rating = "Effective"
            status = "PASS"
        elif score >= 70:
            rating = "Partially Effective"
            status = "PARTIAL"
        else:
            rating = "Ineffective"
            status = "FAIL"
        
        findings = []
        recommendations = []
        
        if not evidence_adequate:
            findings.append("Insufficient evidence to demonstrate control effectiveness")
            recommendations.append("Collect additional evidence documenting control implementation")
        
        if gaps:
            findings.extend(gaps)
            recommendations.append("Address identified gaps in control implementation")
        
        if evidence_quality in ["Low", "Unknown"]:
            findings.append(f"Evidence quality is {evidence_quality}")
            recommendations.append("Improve evidence collection and documentation processes")
        
        return {
            "rating": rating,
            "score": round(score, 2),
            "status": status,
            "findings": findings,
            "recommendations": recommendations
        }
    
    def _get_framework_controls(self, framework: str) -> List[Dict[str, str]]:
        """Get list of controls for a framework"""
        
        # This is a simplified version. In production, load from comprehensive control database
        controls = []
        
        if framework == "NIST_CSF":
            controls = [
                {"id": "PR.AC-1", "description": "Identities and credentials are issued, managed, verified, revoked, and audited"},
                {"id": "PR.AC-3", "description": "Remote access is managed"},
                {"id": "PR.DS-1", "description": "Data-at-rest is protected"},
                {"id": "DE.CM-1", "description": "The network is monitored to detect potential cybersecurity events"},
                {"id": "RS.AN-1", "description": "Notifications from detection systems are investigated"},
            ]
        elif framework == "SOC2":
            controls = [
                {"id": "CC6.1", "description": "Logical and physical access controls"},
                {"id": "CC6.6", "description": "Encryption of data at rest and in transit"},
                {"id": "CC7.2", "description": "Security monitoring and incident response"},
            ]
        
        return controls


def run_control_tests(evidence_docs: List[Any], framework: str, model_name: str,
                      kb_vectorstore=None, company_vectorstore=None) -> Dict[str, Any]:
    """Run automated control tests
    
    Args:
        evidence_docs: List of evidence documents
        framework: Framework to test against
        model_name: LLM model name
        kb_vectorstore: Knowledge base vector store
        company_vectorstore: Company documents vector store
        
    Returns:
        Dictionary containing all test results
    """
    tester = ControlTester(model_name, kb_vectorstore, company_vectorstore)
    results = tester.test_control_framework(framework, evidence_docs)
    
    # Calculate summary statistics
    total_controls = len(results)
    passed = sum(1 for r in results if r.get("status") == "PASS")
    partial = sum(1 for r in results if r.get("status") == "PARTIAL")
    failed = sum(1 for r in results if r.get("status") == "FAIL")
    
    avg_score = sum(r.get("effectiveness_score", 0) for r in results) / total_controls if total_controls > 0 else 0
    
    return {
        "framework": framework,
        "test_date": datetime.now().isoformat(),
        "summary": {
            "total_controls": total_controls,
            "passed": passed,
            "partial": partial,
            "failed": failed,
            "pass_rate": round((passed / total_controls * 100), 2) if total_controls > 0 else 0,
            "average_score": round(avg_score, 2)
        },
        "control_results": results
    }
