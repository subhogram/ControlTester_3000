"""
Risk Control Matrix (RCM) Compliance Analysis - Backend Engine
Pure backend logic for analyzing RCM compliance against regulatory frameworks.
No API code - that belongs in rcm_api.py
"""

import os
import json
import re
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from collections import defaultdict
from datetime import datetime

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_EMBEDDING_MODEL = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')
# ------------------------------------------------------------------
# LAZY IMPORTS - Optimize Docker build time
# ------------------------------------------------------------------
def get_ollama_llm(model: str, temperature: float = 0.1):
    """Lazy load Ollama LLM."""
    from langchain_community.llms import Ollama
    return Ollama(
        model=model, 
        base_url=OLLAMA_BASE_URL, 
        temperature=temperature
    )


def get_ollama_embeddings(model: str = OLLAMA_EMBEDDING_MODEL):
    """Lazy load Ollama embeddings."""
    from langchain_community.embeddings import OllamaEmbeddings
    return OllamaEmbeddings(
        model=model, 
        base_url=OLLAMA_BASE_URL
    )


def get_text_splitter():
    """Lazy load text splitter."""
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    return RecursiveCharacterTextSplitter(
        chunk_size=int(os.getenv("CHUNK_SIZE", "3000")),
        chunk_overlap=int(os.getenv("CHUNK_OVERLAP", "600")),
        separators=["\n\n", "\n", ". ", " ", ""]
    )


def get_cosine_similarity():
    """Lazy load cosine similarity function."""
    from sklearn.metrics.pairwise import cosine_similarity
    return cosine_similarity


def load_document(file_path: str, filename: str):
    """Load document using appropriate loader."""
    from langchain_community.document_loaders import PyPDFLoader, TextLoader
    
    try:
        if file_path.endswith(".pdf"):
            loader = PyPDFLoader(file_path)
        elif file_path.endswith((".txt", ".md")):
            loader = TextLoader(file_path)
        else:
            raise ValueError(f"Unsupported file format: {file_path}")
        
        docs = loader.load()
        for doc in docs:
            doc.metadata["source"] = filename
        
        return docs
    except Exception as e:
        print(f"[ERROR] Failed to load {filename}: {e}")
        return []


# ------------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------------
SIM_THRESHOLD = float(os.getenv("SIM_THRESHOLD", "0.68"))
COMPLIANCE_THRESHOLD = float(os.getenv("COMPLIANCE_THRESHOLD", "0.75"))  # 75% match = compliant

# Control domains with risk categories
RISK_CONTROL_DOMAINS = {
    "governance": {
        "keywords": ["governance", "board", "committee", "oversight", "management"],
        "risk_category": "Strategic Risk"
    },
    "access_control": {
        "keywords": ["access", "authentication", "authorization", "mfa", "privilege"],
        "risk_category": "Security Risk"
    },
    "data_protection": {
        "keywords": ["data loss", "dlp", "encryption", "confidentiality", "privacy"],
        "risk_category": "Data Risk"
    },
    "network_security": {
        "keywords": ["network", "firewall", "segmentation", "intrusion", "perimeter"],
        "risk_category": "Infrastructure Risk"
    },
    "incident_response": {
        "keywords": ["incident", "breach", "response", "recovery", "forensic"],
        "risk_category": "Operational Risk"
    },
    "business_continuity": {
        "keywords": ["continuity", "disaster recovery", "bcp", "dr", "resilience"],
        "risk_category": "Operational Risk"
    },
    "third_party": {
        "keywords": ["vendor", "third party", "outsourcing", "supplier", "service provider"],
        "risk_category": "Third Party Risk"
    },
    "change_management": {
        "keywords": ["change", "patch", "update", "deployment", "release"],
        "risk_category": "Operational Risk"
    },
    "vulnerability_management": {
        "keywords": ["vulnerability", "penetration", "assessment", "scanning", "patching"],
        "risk_category": "Security Risk"
    },
    "compliance": {
        "keywords": ["compliance", "regulatory", "audit", "legal", "standard"],
        "risk_category": "Compliance Risk"
    },
    "application_security": {
        "keywords": ["application", "software", "code", "development", "sdlc"],
        "risk_category": "Security Risk"
    },
    "cloud_security": {
        "keywords": ["cloud", "saas", "iaas", "paas", "multi-tenant"],
        "risk_category": "Infrastructure Risk"
    }
}


# ------------------------------------------------------------------
# UTILITY FUNCTIONS
# ------------------------------------------------------------------
def safe_json_loads(llm_output: str, default=None):
    """Safely extract JSON from LLM output."""
    if not llm_output or not llm_output.strip():
        return default

    llm_output = llm_output.strip()
    llm_output = re.sub(r"```json|```", "", llm_output, flags=re.IGNORECASE).strip()

    try:
        return json.loads(llm_output)
    except json.JSONDecodeError:
        pass

    match = re.search(r"[\[{].*[\]}]", llm_output, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return default


def classify_domain(text: str) -> Tuple[str, str]:
    """Classify control into domain and risk category."""
    text_lower = text.lower()
    scores = defaultdict(int)
    
    for domain, config in RISK_CONTROL_DOMAINS.items():
        for keyword in config["keywords"]:
            if keyword in text_lower:
                scores[domain] += 1
    
    if not scores:
        return "general", "Operational Risk"
    
    best_domain = max(scores.items(), key=lambda x: x[1])[0]
    risk_category = RISK_CONTROL_DOMAINS[best_domain]["risk_category"]
    
    return best_domain, risk_category


# ------------------------------------------------------------------
# REGULATORY REQUIREMENT EXTRACTOR
# ------------------------------------------------------------------
class RegulatoryRequirementExtractor:
    """Extracts requirements from regulatory documents."""
    
    def __init__(self, model: str):
        self.model = model

    def run(self, chunks: List) -> List[Dict]:
        """Extract regulatory requirements."""
        llm = get_ollama_llm(self.model, temperature=0.1)
        requirements = []
        
        print(f"[INFO] Extracting regulatory requirements from {len(chunks)} chunks")
        
        for i in range(0, len(chunks), 5):  # Batch processing
            batch = chunks[i:i + 5]
            batch_text = "\n\n---CHUNK---\n\n".join([c.page_content[:1000] for c in batch])
            
            prompt = f"""Extract all technology risk control REQUIREMENTS from regulatory text.

For each requirement, return JSON object:
{{
  "requirement_id": "unique_id",
  "requirement_statement": "exact requirement text",
  "control_domain": "governance|access_control|data_protection|network_security|incident_response|business_continuity|third_party|change_management|vulnerability_management|compliance|application_security|cloud_security",
  "risk_addressed": "specific risk this requirement mitigates",
  "mandatory": true/false,
  "frequency": "if specified (e.g., 'annually', 'quarterly', 'continuous')",
  "metrics": ["measurable criteria if any"],
  "enforcement_keywords": ["shall", "must", "should", "may"],
  "applicable_to": "who must comply (e.g., 'all financial institutions', 'banks')"
}}

Return JSON array. If none found, return [].

TEXT:
{batch_text}

Return ONLY JSON array:"""

            try:
                raw = llm.invoke(prompt)
                parsed = safe_json_loads(raw, default=[])
                
                if not isinstance(parsed, list):
                    parsed = []
                
                for req in parsed:
                    req["source_document"] = batch[0].metadata["source"]
                    
                    # Auto-classify if needed
                    if not req.get("control_domain"):
                        domain, risk_cat = classify_domain(req.get("requirement_statement", ""))
                        req["control_domain"] = domain
                        req["risk_category"] = risk_cat
                    else:
                        req["risk_category"] = RISK_CONTROL_DOMAINS.get(
                            req["control_domain"], {}
                        ).get("risk_category", "Operational Risk")
                    
                    requirements.append(req)
                    
            except Exception as e:
                print(f"[WARN] Batch {i} requirement extraction failed: {e}")
                continue
            
            if i % 25 == 0:
                print(f"[INFO] Processed {i}/{len(chunks)} chunks, {len(requirements)} requirements")
        
        print(f"[INFO] Extracted {len(requirements)} regulatory requirements")
        return requirements


# ------------------------------------------------------------------
# RCM CONTROL EXTRACTOR
# ------------------------------------------------------------------
class RCMControlExtractor:
    """Extracts controls from organization's RCM."""
    
    def __init__(self, model: str):
        self.model = model

    def run(self, chunks: List) -> List[Dict]:
        """Extract RCM controls."""
        llm = get_ollama_llm(self.model, temperature=0.1)
        controls = []
        
        print(f"[INFO] Extracting RCM controls from {len(chunks)} chunks")
        
        for i in range(0, len(chunks), 3):
            batch = chunks[i:i + 3]
            batch_text = "\n\n---CHUNK---\n\n".join([c.page_content[:1200] for c in batch])
            
            prompt = f"""Extract EXISTING CONTROLS from Risk Control Matrix (RCM).

For each control, return JSON object:
{{
  "control_id": "control reference/ID from RCM",
  "control_name": "control name/title",
  "control_description": "what the control does",
  "control_domain": "governance|access_control|data_protection|network_security|incident_response|business_continuity|third_party|change_management|vulnerability_management|compliance|application_security|cloud_security",
  "risk_addressed": "risk this control mitigates",
  "control_type": "preventive|detective|corrective",
  "implementation_status": "implemented|partially_implemented|not_implemented|planned",
  "frequency": "how often executed (e.g., 'daily', 'monthly', 'continuous')",
  "owner": "control owner (role/department)",
  "evidence": "evidence of implementation",
  "testing_frequency": "how often tested",
  "last_tested": "last test date if mentioned",
  "effectiveness_rating": "if mentioned (e.g., 'effective', 'needs improvement')"
}}

Return JSON array. If none found, return [].

RCM TEXT:
{batch_text}

Return ONLY JSON array:"""

            try:
                raw = llm.invoke(prompt)
                parsed = safe_json_loads(raw, default=[])
                
                if not isinstance(parsed, list):
                    parsed = []
                
                for control in parsed:
                    control["source_document"] = batch[0].metadata["source"]
                    
                    # Auto-classify domain
                    if not control.get("control_domain"):
                        domain, risk_cat = classify_domain(
                            control.get("control_description", "") + " " + 
                            control.get("control_name", "")
                        )
                        control["control_domain"] = domain
                        control["risk_category"] = risk_cat
                    else:
                        control["risk_category"] = RISK_CONTROL_DOMAINS.get(
                            control["control_domain"], {}
                        ).get("risk_category", "Operational Risk")
                    
                    controls.append(control)
                    
            except Exception as e:
                print(f"[WARN] Batch {i} RCM extraction failed: {e}")
                continue
            
            if i % 15 == 0:
                print(f"[INFO] Processed {i}/{len(chunks)} chunks, {len(controls)} controls")
        
        print(f"[INFO] Extracted {len(controls)} RCM controls")
        return controls


# ------------------------------------------------------------------
# COMPLIANCE ANALYZER
# ------------------------------------------------------------------
class ComplianceAnalyzer:
    """Analyzes compliance gaps between RCM and regulatory requirements."""
    
    def __init__(self, model: str):
        self.model = model
        self.embedder = get_ollama_embeddings()

    def analyze_compliance(
        self, 
        regulatory_requirements: List[Dict], 
        rcm_controls: List[Dict]
    ) -> Dict:
        """
        Analyze compliance and identify gaps.
        """
        print(f"[INFO] Analyzing compliance: {len(regulatory_requirements)} requirements vs {len(rcm_controls)} controls")
        
        # Group by domain
        requirements_by_domain = defaultdict(list)
        controls_by_domain = defaultdict(list)
        
        for req in regulatory_requirements:
            requirements_by_domain[req["control_domain"]].append(req)
        
        for ctrl in rcm_controls:
            controls_by_domain[ctrl["control_domain"]].append(ctrl)
        
        # Analyze each domain
        domain_analyses = {}
        all_gaps = []
        all_compliant = []
        all_partial = []
        
        for domain in set(list(requirements_by_domain.keys()) + list(controls_by_domain.keys())):
            domain_reqs = requirements_by_domain.get(domain, [])
            domain_ctrls = controls_by_domain.get(domain, [])
            
            print(f"[INFO] Analyzing domain: {domain} ({len(domain_reqs)} reqs, {len(domain_ctrls)} controls)")
            
            domain_result = self._analyze_domain(domain, domain_reqs, domain_ctrls)
            domain_analyses[domain] = domain_result
            
            all_gaps.extend(domain_result["gaps"])
            all_compliant.extend(domain_result["compliant_requirements"])
            all_partial.extend(domain_result["partially_compliant"])
        
        # Calculate overall metrics
        total_requirements = len(regulatory_requirements)
        compliant_count = len(all_compliant)
        partial_count = len(all_partial)
        gap_count = len(all_gaps)
        
        compliance_percentage = round((compliant_count / total_requirements * 100), 2) if total_requirements > 0 else 0
        
        return {
            "domain_analyses": domain_analyses,
            "overall_metrics": {
                "total_requirements": total_requirements,
                "total_controls": len(rcm_controls),
                "compliant_requirements": compliant_count,
                "partially_compliant": partial_count,
                "gap_requirements": gap_count,
                "compliance_percentage": compliance_percentage,
                "risk_score": self._calculate_risk_score(all_gaps)
            },
            "gaps": all_gaps,
            "compliant": all_compliant,
            "partial": all_partial
        }

    def _analyze_domain(
        self, 
        domain: str, 
        requirements: List[Dict], 
        controls: List[Dict]
    ) -> Dict:
        """Analyze compliance for a specific domain."""
        
        if not requirements:
            return {
                "domain": domain,
                "requirement_count": 0,
                "control_count": len(controls),
                "compliance_status": "N/A - No requirements",
                "gaps": [],
                "compliant_requirements": [],
                "partially_compliant": [],
                "recommendations": []
            }
        
        if not controls:
            # All requirements are gaps
            gaps = [{
                "requirement": req,
                "gap_type": "missing_control",
                "severity": "high" if req.get("mandatory", False) else "medium",
                "matched_controls": [],
                "coverage_percentage": 0
            } for req in requirements]
            
            return {
                "domain": domain,
                "requirement_count": len(requirements),
                "control_count": 0,
                "compliance_status": "Non-Compliant",
                "compliance_percentage": 0,
                "gaps": gaps,
                "compliant_requirements": [],
                "partially_compliant": [],
                "recommendations": self._generate_domain_recommendations(domain, gaps, [])
            }
        
        # Match requirements to controls using embeddings
        matches = self._match_requirements_to_controls(requirements, controls)
        
        gaps = []
        compliant = []
        partial = []
        
        for req, matched_controls, similarity in matches:
            if not matched_controls or similarity < 0.5:
                # No match - gap
                gaps.append({
                    "requirement": req,
                    "gap_type": "missing_control",
                    "severity": "high" if req.get("mandatory", False) else "medium",
                    "matched_controls": [],
                    "coverage_percentage": 0,
                    "similarity_score": similarity
                })
            elif similarity >= COMPLIANCE_THRESHOLD:
                # Good match - compliant
                compliant.append({
                    "requirement": req,
                    "matched_controls": matched_controls,
                    "coverage_percentage": round(similarity * 100, 1),
                    "status": "compliant"
                })
            else:
                # Partial match - needs improvement
                partial.append({
                    "requirement": req,
                    "gap_type": "partial_coverage",
                    "severity": "medium",
                    "matched_controls": matched_controls,
                    "coverage_percentage": round(similarity * 100, 1),
                    "similarity_score": similarity
                })
        
        compliance_pct = round((len(compliant) / len(requirements) * 100), 2) if requirements else 0
        
        return {
            "domain": domain,
            "requirement_count": len(requirements),
            "control_count": len(controls),
            "compliance_status": self._get_compliance_status(compliance_pct),
            "compliance_percentage": compliance_pct,
            "gaps": gaps,
            "compliant_requirements": compliant,
            "partially_compliant": partial,
            "recommendations": self._generate_domain_recommendations(domain, gaps, partial)
        }

    def _match_requirements_to_controls(
        self, 
        requirements: List[Dict], 
        controls: List[Dict]
    ) -> List[Tuple[Dict, List[Dict], float]]:
        """Match requirements to controls using semantic similarity."""
        
        if not requirements or not controls:
            return [(req, [], 0.0) for req in requirements]
        
        try:
            # Create embeddings
            req_texts = [req.get("requirement_statement", "") for req in requirements]
            ctrl_texts = [
                ctrl.get("control_description", "") + " " + ctrl.get("control_name", "") 
                for ctrl in controls
            ]
            
            req_embeddings = np.array(self.embedder.embed_documents(req_texts))
            ctrl_embeddings = np.array(self.embedder.embed_documents(ctrl_texts))
            
            # Calculate similarities
            cosine_sim = get_cosine_similarity()
            similarities = cosine_sim(req_embeddings, ctrl_embeddings)
            
            # Match each requirement
            matches = []
            for i, req in enumerate(requirements):
                # Find controls above threshold
                matched_indices = np.where(similarities[i] >= 0.5)[0]
                matched_controls = [controls[j] for j in matched_indices]
                
                # Best similarity score
                best_similarity = float(np.max(similarities[i])) if len(similarities[i]) > 0 else 0.0
                
                matches.append((req, matched_controls, best_similarity))
            
            return matches
            
        except Exception as e:
            print(f"[WARN] Matching failed: {e}")
            return [(req, [], 0.0) for req in requirements]

    def _calculate_risk_score(self, gaps: List[Dict]) -> str:
        """Calculate overall risk score based on gaps."""
        if not gaps:
            return "Low"
        
        high_severity = sum(1 for g in gaps if g.get("severity") == "high")
        total_gaps = len(gaps)
        
        if high_severity >= 10 or total_gaps >= 20:
            return "Critical"
        elif high_severity >= 5 or total_gaps >= 10:
            return "High"
        elif total_gaps >= 5:
            return "Medium"
        else:
            return "Low"

    def _get_compliance_status(self, percentage: float) -> str:
        """Get compliance status from percentage."""
        if percentage >= 90:
            return "Compliant"
        elif percentage >= 75:
            return "Largely Compliant"
        elif percentage >= 50:
            return "Partially Compliant"
        else:
            return "Non-Compliant"

    def _generate_domain_recommendations(
        self, 
        domain: str, 
        gaps: List[Dict], 
        partial: List[Dict]
    ) -> List[Dict]:
        """Generate improvement recommendations for a domain."""
        recommendations = []
        
        # High priority gaps
        high_priority_gaps = [g for g in gaps if g.get("severity") == "high"]
        if high_priority_gaps:
            recommendations.append({
                "priority": "Critical",
                "recommendation": f"Implement controls for {len(high_priority_gaps)} mandatory requirements in {domain}",
                "affected_requirements": [g["requirement"]["requirement_statement"][:100] + "..." for g in high_priority_gaps[:3]],
                "estimated_effort": "High"
            })
        
        # Partial coverage improvements
        if partial:
            recommendations.append({
                "priority": "High",
                "recommendation": f"Enhance {len(partial)} partially compliant controls in {domain}",
                "affected_requirements": [p["requirement"]["requirement_statement"][:100] + "..." for p in partial[:3]],
                "estimated_effort": "Medium"
            })
        
        return recommendations


# ------------------------------------------------------------------
# REMEDIATION SUGGESTER
# ------------------------------------------------------------------
class RemediationSuggester:
    """Generates detailed remediation suggestions for gaps."""
    
    def __init__(self, model: str):
        self.model = model

    def generate_suggestions(
        self, 
        gaps: List[Dict], 
        domain_analyses: Dict
    ) -> Dict[str, List[Dict]]:
        """Generate remediation suggestions for all gaps."""
        
        llm = get_ollama_llm(self.model, temperature=0.3)
        
        suggestions_by_domain = defaultdict(list)
        
        # Group gaps by domain
        gaps_by_domain = defaultdict(list)
        for gap in gaps:
            domain = gap["requirement"].get("control_domain", "general")
            gaps_by_domain[domain].append(gap)
        
        # Generate suggestions per domain
        for domain, domain_gaps in gaps_by_domain.items():
            print(f"[INFO] Generating remediation for {domain}: {len(domain_gaps)} gaps")
            
            # Batch process gaps
            for i in range(0, len(domain_gaps), 3):
                batch_gaps = domain_gaps[i:i+3]
                
                gap_descriptions = []
                for idx, gap in enumerate(batch_gaps):
                    req = gap["requirement"]
                    gap_descriptions.append(
                        f"{idx+1}. Requirement: {req.get('requirement_statement', '')[:200]}\n"
                        f"   Gap Type: {gap.get('gap_type', 'unknown')}\n"
                        f"   Severity: {gap.get('severity', 'unknown')}"
                    )
                
                prompt = f"""You are a cybersecurity compliance consultant. Generate detailed remediation suggestions.

Domain: {domain}

Gaps identified:
{chr(10).join(gap_descriptions)}

For EACH gap, provide remediation suggestion as JSON:
{{
  "gap_number": 1,
  "control_to_implement": "specific control name",
  "implementation_steps": ["step 1", "step 2", "step 3"],
  "responsible_party": "who should implement (role)",
  "estimated_timeline": "timeframe",
  "resources_needed": ["resource 1", "resource 2"],
  "industry_best_practices": ["practice 1", "practice 2"],
  "tools_or_solutions": ["tool/solution suggestions"],
  "success_metrics": ["how to measure success"],
  "priority": "Critical|High|Medium|Low"
}}

Return JSON array with suggestions:"""

                try:
                    raw = llm.invoke(prompt)
                    parsed = safe_json_loads(raw, default=[])
                    
                    if not isinstance(parsed, list):
                        parsed = []
                    
                    # Match suggestions to gaps
                    for idx, suggestion in enumerate(parsed):
                        if idx < len(batch_gaps):
                            gap_with_suggestion = {
                                **batch_gaps[idx],
                                "remediation": suggestion
                            }
                            suggestions_by_domain[domain].append(gap_with_suggestion)
                    
                except Exception as e:
                    print(f"[WARN] Remediation generation failed for {domain} batch {i}: {e}")
                    # Add gaps without suggestions
                    for gap in batch_gaps:
                        gap_with_suggestion = {
                            **gap,
                            "remediation": {
                                "control_to_implement": "Implement control to address requirement",
                                "priority": gap.get("severity", "medium").title()
                            }
                        }
                        suggestions_by_domain[domain].append(gap_with_suggestion)
        
        return dict(suggestions_by_domain)


# ------------------------------------------------------------------
# REPORT GENERATOR
# ------------------------------------------------------------------
class ComplianceReportGenerator:
    """Generates comprehensive compliance reports."""
    
    def __init__(self, model: str):
        self.model = model

    def generate_executive_summary(
        self, 
        compliance_analysis: Dict,
        remediation_suggestions: Dict
    ) -> str:
        """Generate executive summary."""
        
        llm = get_ollama_llm(self.model, temperature=0.2)
        
        metrics = compliance_analysis["overall_metrics"]
        
        prompt = f"""Generate an executive summary for RCM compliance analysis.

Overall Metrics:
- Total Regulatory Requirements: {metrics['total_requirements']}
- Total RCM Controls: {metrics['total_controls']}
- Compliance Percentage: {metrics['compliance_percentage']}%
- Compliant Requirements: {metrics['compliant_requirements']}
- Gap Requirements: {metrics['gap_requirements']}
- Risk Score: {metrics['risk_score']}

Total Remediation Items: {sum(len(v) for v in remediation_suggestions.values())}

Create a concise executive summary covering:
1. Overall compliance status (2-3 sentences)
2. Key findings (3-4 bullet points)
3. Critical gaps (top 3)
4. Recommended immediate actions (3 items)
5. Overall risk assessment

Format in markdown. Be professional and concise."""

        try:
            return llm.invoke(prompt)
        except Exception as e:
            return f"# Executive Summary\n\nCompliance Rate: {metrics['compliance_percentage']}%\nRisk Score: {metrics['risk_score']}\n\nError generating detailed summary: {e}"

    def generate_domain_report(
        self, 
        domain: str, 
        domain_analysis: Dict,
        domain_suggestions: List[Dict]
    ) -> str:
        """Generate detailed report for a domain."""
        
        llm = get_ollama_llm(self.model, temperature=0.2)
        
        prompt = f"""Generate detailed compliance report for domain: {domain}

Domain Analysis:
- Requirements: {domain_analysis['requirement_count']}
- Controls: {domain_analysis['control_count']}
- Compliance Status: {domain_analysis['compliance_status']}
- Compliance %: {domain_analysis.get('compliance_percentage', 'N/A')}
- Gaps: {len(domain_analysis['gaps'])}
- Partially Compliant: {len(domain_analysis['partially_compliant'])}

Remediation items: {len(domain_suggestions)}

Create a detailed domain report in markdown with:

## {domain.replace('_', ' ').title()}

### Compliance Status
[Overall status and percentage]

### Key Findings
[3-5 bullet points]

### Gaps Identified
[Summarize gap types and severity]

### Compliance Strengths
[What's working well]

### Improvement Areas
[What needs attention]

### Priority Actions
[Top 3 immediate actions with timeline]

Be specific and actionable."""

        try:
            return llm.invoke(prompt)
        except Exception as e:
            return f"## {domain}\n\nCompliance: {domain_analysis.get('compliance_percentage', 'N/A')}%\n\nError: {e}"

    def generate_full_report(
        self,
        regulatory_docs: List[str],
        rcm_doc: str,
        compliance_analysis: Dict,
        remediation_suggestions: Dict
    ) -> str:
        """Generate complete compliance report."""
        
        print("[INFO] Generating comprehensive compliance report")
        
        # Executive summary
        exec_summary = self.generate_executive_summary(compliance_analysis, remediation_suggestions)
        
        # Domain reports
        domain_reports = []
        for domain, analysis in compliance_analysis["domain_analyses"].items():
            suggestions = remediation_suggestions.get(domain, [])
            report = self.generate_domain_report(domain, analysis, suggestions)
            domain_reports.append(report)
        
        # Compile full report
        report = f"""# Risk Control Matrix (RCM) Compliance Analysis Report

**Generated:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

**Regulatory Frameworks Analyzed:**
{chr(10).join(f"- {doc}" for doc in regulatory_docs)}

**Organization's RCM:**
- {rcm_doc}

---

{exec_summary}

---

# Detailed Domain Analysis

{chr(10).join(domain_reports)}

---

# Remediation Action Plan

## Summary by Priority

"""
        
        # Add remediation summary
        all_suggestions = [s for domain_list in remediation_suggestions.values() for s in domain_list]
        
        by_priority = defaultdict(list)
        for sugg in all_suggestions:
            priority = sugg.get("remediation", {}).get("priority", "Medium")
            by_priority[priority].append(sugg)
        
        for priority in ["Critical", "High", "Medium", "Low"]:
            if priority in by_priority:
                count = len(by_priority[priority])
                report += f"\n### {priority} Priority ({count} items)\n\n"
                
                for i, sugg in enumerate(by_priority[priority][:5], 1):  # Top 5
                    req_stmt = sugg["requirement"]["requirement_statement"][:150]
                    control = sugg.get("remediation", {}).get("control_to_implement", "Implement control")
                    report += f"{i}. **{control}**\n   - Requirement: {req_stmt}...\n"
                    
                    steps = sugg.get("remediation", {}).get("implementation_steps", [])
                    if steps:
                        report += f"   - Steps: {', '.join(steps[:2])}\n"
                    
                    report += "\n"
        
        report += "\n---\n\n*End of Report*"
        
        return report


# ------------------------------------------------------------------
# MAIN PIPELINE
# ------------------------------------------------------------------
def analyze_rcm_compliance(
    regulatory_file_paths: List[str],
    regulatory_filenames: List[str],
    rcm_file_path: str,
    rcm_filename: str,
    selected_model: str = "llama3"
) -> Dict:
    """
    Main backend pipeline for RCM compliance analysis.
    
    Args:
        regulatory_file_paths: List of file paths to regulatory documents
        regulatory_filenames: List of filenames for regulatory documents
        rcm_file_path: Path to RCM document
        rcm_filename: Filename of RCM document
        selected_model: LLM model to use
    
    Returns:
        Dict containing compliance analysis results
    """
    
    print(f"[INFO] Starting RCM compliance analysis with model: {selected_model}")
    print(f"[INFO] Regulatory documents: {regulatory_filenames}")
    print(f"[INFO] RCM document: {rcm_filename}")
    
    # 1. Load regulatory documents
    regulatory_docs = []
    for path, name in zip(regulatory_file_paths, regulatory_filenames):
        docs = load_document(path, name)
        regulatory_docs.extend(docs)
        print(f"[INFO] Loaded {len(docs)} pages from {name}")
    
    if not regulatory_docs:
        return {
            "success": False, 
            "error": "Failed to load any regulatory documents"
        }
    
    # 2. Load RCM document
    rcm_docs = load_document(rcm_file_path, rcm_filename)
    
    if not rcm_docs:
        return {
            "success": False, 
            "error": f"Failed to load RCM document: {rcm_filename}"
        }
    
    print(f"[INFO] Loaded {len(rcm_docs)} pages from RCM")
    
    # 3. Split documents into chunks
    splitter = get_text_splitter()
    regulatory_chunks = splitter.split_documents(regulatory_docs)
    rcm_chunks = splitter.split_documents(rcm_docs)
    
    print(f"[INFO] Regulatory chunks: {len(regulatory_chunks)}")
    print(f"[INFO] RCM chunks: {len(rcm_chunks)}")
    
    # 4. Extract regulatory requirements
    req_extractor = RegulatoryRequirementExtractor(selected_model)
    regulatory_requirements = req_extractor.run(regulatory_chunks)
    
    if not regulatory_requirements:
        print("[WARNING] No regulatory requirements extracted")
    
    # 5. Extract RCM controls
    rcm_extractor = RCMControlExtractor(selected_model)
    rcm_controls = rcm_extractor.run(rcm_chunks)
    
    if not rcm_controls:
        print("[WARNING] No RCM controls extracted")
    
    # 6. Analyze compliance and identify gaps
    compliance_analyzer = ComplianceAnalyzer(selected_model)
    compliance_analysis = compliance_analyzer.analyze_compliance(
        regulatory_requirements, 
        rcm_controls
    )
    
    # 7. Generate remediation suggestions for gaps
    remediation_suggester = RemediationSuggester(selected_model)
    remediation_suggestions = remediation_suggester.generate_suggestions(
        compliance_analysis["gaps"],
        compliance_analysis["domain_analyses"]
    )
    
    # 8. Generate comprehensive compliance report
    report_generator = ComplianceReportGenerator(selected_model)
    final_report = report_generator.generate_full_report(
        regulatory_filenames,
        rcm_filename,
        compliance_analysis,
        remediation_suggestions
    )
    
    # 9. Return complete analysis results
    return {
        "success": True,
        "analysis_timestamp": datetime.now().isoformat(),
        "model_used": selected_model,
        "regulatory_documents": regulatory_filenames,
        "rcm_document": rcm_filename,
        "regulatory_requirements_count": len(regulatory_requirements),
        "rcm_controls_count": len(rcm_controls),
        "compliance_analysis": compliance_analysis,
        "remediation_suggestions": remediation_suggestions,
        "final_report": final_report,
        "metadata": {
            "regulatory_chunks": len(regulatory_chunks),
            "rcm_chunks": len(rcm_chunks),
            "regulatory_pages": len(regulatory_docs),
            "rcm_pages": len(rcm_docs)
        }
    }


# ------------------------------------------------------------------
# UTILITY FUNCTIONS FOR EXTERNAL USE
# ------------------------------------------------------------------
def save_compliance_artifacts(result: Dict, output_dir: str = "./compliance_output"):
    """
    Save compliance analysis artifacts to disk.
    
    Args:
        result: Analysis result from analyze_rcm_compliance()
        output_dir: Directory to save artifacts
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # Save full JSON analysis
    with open(f"{output_dir}/full_analysis.json", "w") as f:
        json.dump(result, f, indent=2, default=str)
    
    # Save compliance report
    with open(f"{output_dir}/compliance_report.md", "w") as f:
        f.write(result.get("final_report", "No report generated"))
    
    # Save remediation action plan
    with open(f"{output_dir}/remediation_plan.json", "w") as f:
        json.dump(result.get("remediation_suggestions", {}), f, indent=2, default=str)
    
    # Save gap analysis
    with open(f"{output_dir}/gap_analysis.json", "w") as f:
        json.dump({
            "overall_metrics": result["compliance_analysis"]["overall_metrics"],
            "gaps_by_domain": {
                domain: analysis["gaps"]
                for domain, analysis in result["compliance_analysis"]["domain_analyses"].items()
            }
        }, f, indent=2, default=str)
    
    # Save compliance summary
    with open(f"{output_dir}/compliance_summary.json", "w") as f:
        json.dump({
            "compliance_percentage": result["compliance_analysis"]["overall_metrics"]["compliance_percentage"],
            "compliant_requirements": result["compliance_analysis"]["overall_metrics"]["compliant_requirements"],
            "gap_requirements": result["compliance_analysis"]["overall_metrics"]["gap_requirements"],
            "risk_score": result["compliance_analysis"]["overall_metrics"]["risk_score"],
            "domains": {
                domain: {
                    "compliance_percentage": analysis.get("compliance_percentage", 0),
                    "status": analysis.get("compliance_status", "Unknown"),
                    "gap_count": len(analysis.get("gaps", []))
                }
                for domain, analysis in result["compliance_analysis"]["domain_analyses"].items()
            }
        }, f, indent=2, default=str)
    
    print(f"[INFO] Compliance artifacts saved to {output_dir}")
    
    return output_dir