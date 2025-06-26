from pydantic import BaseModel, Field
from typing import List

class AssessmentResult(BaseModel):
    Compliance_Status: str = Field(..., description="COMPLIANT | NON-COMPLIANT | PARTIALLY COMPLIANT")
    Risk_Level: str = Field(..., description="CRITICAL | HIGH | MEDIUM | LOW")

class AssessmentRationale(BaseModel):
    Why_it_failed: str
    Gap_analysis: str
    Impact: str
    Evidence_of_compliance: str
    Effectiveness_assessment: str

class LogEvidence(BaseModel):
    Source_File: str
    Relevant_Log_Entries: List[str]

class ImprovementRecommendations(BaseModel):
    Mandatory_Improvements: List[str]
    Enhancement_Opportunities: List[str]

class Assessment(BaseModel):
    control_statement: str
    assessment_result: AssessmentResult
    assessment_rationale: AssessmentRationale
    log_evidence: LogEvidence
    improvement_recommendation: ImprovementRecommendations
