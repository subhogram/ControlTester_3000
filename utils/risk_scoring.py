"""Risk Scoring Engine for Cybersecurity Assessment

Provides quantitative risk analysis including:
- Risk identification and categorization
- Likelihood and impact assessment
- Risk scoring and prioritization
- Risk heat map generation
"""

import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import json
from langchain_ollama import ChatOllama
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain

logger = logging.getLogger(__name__)

class RiskScorer:
    """Cybersecurity risk scoring and analysis engine"""
    
    # Risk categories
    RISK_CATEGORIES = [
        "Operational",
        "Compliance",
        "Financial",
        "Reputational",
        "Strategic",
        "Technical"
    ]
    
    # Likelihood levels (1-5)
    LIKELIHOOD_LEVELS = {
        "Rare": 1,
        "Unlikely": 2,
        "Possible": 3,
        "Likely": 4,
        "Almost Certain": 5
    }
    
    # Impact levels (1-5)
    IMPACT_LEVELS = {
        "Negligible": 1,
        "Minor": 2,
        "Moderate": 3,
        "Major": 4,
        "Catastrophic": 5
    }
    
    def __init__(self, model_name: str, kb_vectorstore=None, company_vectorstore=None):
        """Initialize risk scorer
        
        Args:
            model_name: LLM model to use
            kb_vectorstore: Knowledge base vector store
            company_vectorstore: Company documents vector store
        """
        self.model_name = model_name
        self.kb_vectorstore = kb_vectorstore
        self.company_vectorstore = company_vectorstore
        self.llm = ChatOllama(model=model_name, temperature=0.2)
        
        logger.info(f"RiskScorer initialized with model: {model_name}")
    
    def identify_risks(self, assessment_data: Dict[str, Any], 
                       evidence_docs: List[Any]) -> List[Dict[str, Any]]:
        """Identify risks from assessment data and evidence
        
        Args:
            assessment_data: Control assessment results
            evidence_docs: Evidence documents
            
        Returns:
            List of identified risks
        """
        logger.info("Identifying risks from assessment data")
        
        risks = []
        
        # Extract risks from failed/partial controls
        if isinstance(assessment_data, list):
            for item in assessment_data:
                if isinstance(item, dict):
                    control_id = item.get("control_id", "Unknown")
                    findings = item.get("findings", [])
                    status = item.get("status", "")
                    
                    if status in ["FAIL", "PARTIAL"]:
                        risk = self._create_risk_from_control(
                            control_id, findings, item
                        )
                        if risk:
                            risks.append(risk)
        
        # Analyze evidence for additional risks
        additional_risks = self._analyze_evidence_for_risks(evidence_docs)
        risks.extend(additional_risks)
        
        logger.info(f"Identified {len(risks)} risks")
        return risks
    
    def score_risk(self, risk: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate risk score
        
        Args:
            risk: Risk information
            
        Returns:
            Risk with calculated scores
        """
        # Get or assess likelihood and impact
        likelihood = risk.get("likelihood", self._assess_likelihood(risk))
        impact = risk.get("impact", self._assess_impact(risk))
        
        # Convert to numeric if needed
        if isinstance(likelihood, str):
            likelihood = self.LIKELIHOOD_LEVELS.get(likelihood, 3)
        if isinstance(impact, str):
            impact = self.IMPACT_LEVELS.get(impact, 3)
        
        # Calculate risk score (1-25)
        risk_score = likelihood * impact
        
        # Determine risk level
        if risk_score >= 20:
            risk_level = "Critical"
            priority = "P1"
        elif risk_score >= 15:
            risk_level = "High"
            priority = "P2"
        elif risk_score >= 10:
            risk_level = "Medium"
            priority = "P3"
        elif risk_score >= 5:
            risk_level = "Low"
            priority = "P4"
        else:
            risk_level = "Very Low"
            priority = "P5"
        
        # Update risk with scoring information
        risk.update({
            "likelihood": likelihood,
            "likelihood_label": self._get_label_from_value(likelihood, self.LIKELIHOOD_LEVELS),
            "impact": impact,
            "impact_label": self._get_label_from_value(impact, self.IMPACT_LEVELS),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "priority": priority,
            "scored_date": datetime.now().isoformat()
        })
        
        return risk
    
    def score_all_risks(self, risks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Score all identified risks
        
        Args:
            risks: List of risks to score
            
        Returns:
            List of scored risks
        """
        scored_risks = []
        for risk in risks:
            try:
                scored_risk = self.score_risk(risk)
                scored_risks.append(scored_risk)
            except Exception as e:
                logger.error(f"Error scoring risk {risk.get('risk_id', 'unknown')}: {e}")
                risk["scoring_error"] = str(e)
                scored_risks.append(risk)
        
        # Sort by risk score (highest first)
        scored_risks.sort(key=lambda x: x.get("risk_score", 0), reverse=True)
        
        return scored_risks
    
    def generate_risk_summary(self, scored_risks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate summary statistics for risks
        
        Args:
            scored_risks: List of scored risks
            
        Returns:
            Risk summary statistics
        """
        total_risks = len(scored_risks)
        
        if total_risks == 0:
            return {
                "total_risks": 0,
                "risk_breakdown": {},
                "category_breakdown": {},
                "average_risk_score": 0,
                "highest_risk_score": 0
            }
        
        # Count by risk level
        risk_breakdown = {
            "Critical": 0,
            "High": 0,
            "Medium": 0,
            "Low": 0,
            "Very Low": 0
        }
        
        # Count by category
        category_breakdown = {cat: 0 for cat in self.RISK_CATEGORIES}
        
        total_score = 0
        highest_score = 0
        
        for risk in scored_risks:
            level = risk.get("risk_level", "Low")
            if level in risk_breakdown:
                risk_breakdown[level] += 1
            
            category = risk.get("category", "Technical")
            if category in category_breakdown:
                category_breakdown[category] += 1
            
            score = risk.get("risk_score", 0)
            total_score += score
            highest_score = max(highest_score, score)
        
        return {
            "total_risks": total_risks,
            "risk_breakdown": risk_breakdown,
            "category_breakdown": category_breakdown,
            "average_risk_score": round(total_score / total_risks, 2),
            "highest_risk_score": highest_score,
            "critical_risk_count": risk_breakdown["Critical"],
            "high_risk_count": risk_breakdown["High"]
        }
    
    def _create_risk_from_control(self, control_id: str, findings: List[str],
                                  control_data: Dict) -> Optional[Dict[str, Any]]:
        """Create a risk from a control failure"""
        if not findings:
            return None
        
        risk_description = f"Control {control_id} deficiency: {'; '.join(findings[:2])}"
        
        return {
            "risk_id": f"RISK-{control_id}-{datetime.now().strftime('%Y%m%d')}",
            "risk_name": f"{control_id} Control Gap",
            "description": risk_description,
            "category": "Compliance",
            "source_control": control_id,
            "findings": findings,
            "identified_date": datetime.now().isoformat()
        }
    
    def _analyze_evidence_for_risks(self, evidence_docs: List[Any]) -> List[Dict[str, Any]]:
        """Analyze evidence documents for additional risks"""
        risks = []
        
        prompt = PromptTemplate(
            input_variables=["evidence"],
            template="""Analyze the following evidence for cybersecurity risks:

{evidence}

Identify specific security risks, vulnerabilities, or concerns.
For each risk, provide:
- Risk name
- Description
- Category (Operational/Compliance/Financial/Reputational/Strategic/Technical)

Provide response as JSON array:
[
  {{
    "risk_name": "Risk Name",
    "description": "Description",
    "category": "Category"
  }}
]
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        
        # Sample evidence for analysis
        evidence_sample = "\n".join([str(doc)[:300] for doc in evidence_docs[:3]])
        
        try:
            result = chain.run(evidence=evidence_sample)
            identified_risks = json.loads(result)
            
            for idx, risk in enumerate(identified_risks):
                risk["risk_id"] = f"RISK-EVID-{idx+1}-{datetime.now().strftime('%Y%m%d')}"
                risk["identified_date"] = datetime.now().isoformat()
                risks.append(risk)
                
        except Exception as e:
            logger.warning(f"Evidence risk analysis failed: {e}")
        
        return risks
    
    def _assess_likelihood(self, risk: Dict[str, Any]) -> int:
        """Assess likelihood of risk occurrence"""
        # Use LLM to assess if not already provided
        description = risk.get("description", "")
        findings = risk.get("findings", [])
        
        # Simple heuristic based on findings count
        if len(findings) >= 3:
            return 4  # Likely
        elif len(findings) >= 2:
            return 3  # Possible
        else:
            return 2  # Unlikely
    
    def _assess_impact(self, risk: Dict[str, Any]) -> int:
        """Assess impact of risk"""
        category = risk.get("category", "Technical")
        
        # Impact varies by category
        impact_map = {
            "Financial": 4,
            "Compliance": 4,
            "Reputational": 4,
            "Strategic": 3,
            "Operational": 3,
            "Technical": 2
        }
        
        return impact_map.get(category, 3)
    
    def _get_label_from_value(self, value: int, mapping: Dict[str, int]) -> str:
        """Get label from numeric value"""
        for label, val in mapping.items():
            if val == value:
                return label
        return "Unknown"


def perform_risk_assessment(assessment_data: Dict[str, Any], 
                           evidence_docs: List[Any],
                           model_name: str,
                           kb_vectorstore=None,
                           company_vectorstore=None) -> Dict[str, Any]:
    """Perform complete risk assessment
    
    Args:
        assessment_data: Control assessment results
        evidence_docs: Evidence documents
        model_name: LLM model name
        kb_vectorstore: Knowledge base vector store
        company_vectorstore: Company documents vector store
        
    Returns:
        Complete risk assessment report
    """
    scorer = RiskScorer(model_name, kb_vectorstore, company_vectorstore)
    
    # Identify risks
    risks = scorer.identify_risks(assessment_data, evidence_docs)
    
    # Score all risks
    scored_risks = scorer.score_all_risks(risks)
    
    # Generate summary
    summary = scorer.generate_risk_summary(scored_risks)
    
    return {
        "assessment_date": datetime.now().isoformat(),
        "summary": summary,
        "risks": scored_risks,
        "top_risks": scored_risks[:10]  # Top 10 risks
    }
