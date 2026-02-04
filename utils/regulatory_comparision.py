import os
import json
import numpy as np
from pathlib import Path
from typing import List, Dict

from langchain_community.llms import Ollama
from langchain_community.embeddings import OllamaEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from sklearn.metrics.pairwise import cosine_similarity


# ------------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------------
SIM_THRESHOLD = 0.78
CHUNK_SIZE = 1400
CHUNK_OVERLAP = 200
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


# ------------------------------------------------------------------
# AGENTS
# ------------------------------------------------------------------
class InterpreterAgent:
    def __init__(self, model: str):
        self.llm = Ollama(model=model, base_url=OLLAMA_URL)

    def run(self, document_names: List[str]) -> Dict:
        prompt = f"""
        You are a cybersecurity regulatory analyst.

        Infer:
        - Regulatory intent
        - Target industry
        - Control domains
        - Expected strictness

        Documents:
        {document_names}

        Return JSON only.
        """
        raw = self.llm.invoke(prompt)
        parsed = safe_json_loads(raw)

        if not parsed:
            parsed = {
                "regulatory_intent": "Unable to confidently infer intent",
                "target_industry": "Unknown",
                "control_domains": [],
                "expected_strictness": "Unknown",
                "raw_llm_output": raw
            }

        return parsed



class ExtractorAgent:
    def __init__(self, model: str):
        self.llm = Ollama(model=model, base_url=OLLAMA_URL)

    def run(self, chunks):
        controls = []

        for c in chunks:
            prompt = f"""
                Extract ONLY cybersecurity RISK CONTROL REQUIREMENTS.

                Return JSON list with:
                - control_statement
                - control_domain
                - risk_addressed
                - enforcement_level
                - mandatory_keywords

                TEXT:
                \"\"\"{c.page_content}\"\"\"
                """
            try:
                raw = self.llm.invoke(prompt)
                parsed = safe_json_loads(raw, default=[])

                if not isinstance(parsed, list):
                    parsed = []

                for p in parsed:
                    p["source"] = c.metadata["source"]
                    controls.append(p)

            except Exception:
                continue

        return controls


class ComparatorAgent:
    def __init__(self, embed_model="nomic-embed-text"):
        self.embedder = OllamaEmbeddings(
            model=embed_model,
            base_url=OLLAMA_URL
        )

    def _stringency(self, c):
        score = 0
        kw = c.get("mandatory_keywords", "").lower()

        if "shall" in kw or "must" in kw:
            score += 3
        elif "should" in kw:
            score += 1

        score += {"high": 3, "medium": 2}.get(
            c.get("enforcement_level", "").lower(), 1
        )

        score *= min(len(c["control_statement"]) / 200, 1.5)
        return round(score, 2)

    def run(self, controls):
        if not controls or len(controls) < 2:
            return []

        embeddings = np.array(
            self.embedder.embed_documents(
                [c["control_statement"] for c in controls]
            )
        )

        if embeddings.ndim != 2 or embeddings.shape[0] < 2:
            return []

        sim = cosine_similarity(embeddings)
        visited, groups = set(), []

        for i in range(len(controls)):
            if i in visited:
                continue
            grp = [i]
            visited.add(i)
            for j in range(len(controls)):
                if j not in visited and sim[i][j] >= SIM_THRESHOLD:
                    grp.append(j)
                    visited.add(j)
            groups.append([controls[x] for x in grp])

        analysis = []

        for g in groups:
            for c in g:
                c["stringency_score"] = self._stringency(c)

            strongest = max(g, key=lambda x: x["stringency_score"])

            analysis.append({
                "control_domain": strongest["control_domain"],
                "risk": strongest["risk_addressed"],
                "baseline_control": strongest,
                "comparisons": [
                    {
                        "source": c["source"],
                        "stringency_score": c["stringency_score"],
                        "compliance_%": round(
                            min(c["stringency_score"] /
                                strongest["stringency_score"], 1) * 100, 2
                        )
                    }
                    for c in g
                ]
            })

        return analysis


class ReporterAgent:
    def __init__(self, model: str):
        self.llm = Ollama(model=model, base_url=OLLAMA_URL)

    def run(self, interpretation, analysis):
        prompt = f"""
You are a CISO.

Create a regulatory comparison report covering:
- Common controls
- Differences
- Most stringent regulation
- Compliance percentages
- Risk implications
- Recommendations

Interpretation:
{json.dumps(interpretation, indent=2)}

Analysis:
{json.dumps(analysis, indent=2)}
"""
        return self.llm.invoke(prompt)


# ------------------------------------------------------------------
# PIPELINE ENTRYPOINT (THIS IS WHAT API CALLS)
# ------------------------------------------------------------------
def compare_regulatory_documents(
    file_paths: List[str],
    filenames: List[str],
    selected_model: str
) -> Dict:
    # Load documents
    docs = []
    for path, name in zip(file_paths, filenames):
        loader = PyPDFLoader(path) if path.endswith(".pdf") else TextLoader(path)
        loaded = loader.load()
        for d in loaded:
            d.metadata["source"] = name
        docs.extend(loaded)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP
    )
    chunks = splitter.split_documents(docs)

    # Agents
    interpreter = InterpreterAgent(selected_model)
    extractor = ExtractorAgent(selected_model)
    comparator = ComparatorAgent()
    reporter = ReporterAgent(selected_model)

    interpretation = interpreter.run(filenames)
    controls = extractor.run(chunks)
    analysis = comparator.run(controls)

    if not analysis:
        return {
            "documents": filenames,
            "extracted_controls": 0,
            "control_groups": 0,
            "interpretation": interpretation,
            "analysis": [],
            "final_report": (
                "No comparable cybersecurity risk controls could be reliably "
                "extracted from the provided documents. This may indicate that "
                "the documents are descriptive in nature, lack explicit control "
                "statements, or require manual interpretation."
            )
        }

    report = reporter.run(interpretation, analysis)

    if not controls:
        interpretation["warning"] = (
            "No explicit risk control statements were extracted. "
            "Downstream comparison may be limited."
        )



    return {
        "documents": filenames,
        "extracted_controls": len(controls),
        "control_groups": len(analysis),
        "interpretation": interpretation,
        "analysis": analysis,
        "final_report": report
    }

import re

def safe_json_loads(llm_output: str, default=None):
    """
    Safely extract JSON from LLM output.
    Handles:
    - Empty output
    - Markdown fenced JSON
    - Extra commentary
    """
    if not llm_output or not llm_output.strip():
        return default

    # Remove markdown fences
    llm_output = llm_output.strip()
    llm_output = re.sub(r"```json|```", "", llm_output, flags=re.IGNORECASE).strip()

    # Try direct parse
    try:
        return json.loads(llm_output)
    except json.JSONDecodeError:
        pass

    # Try extracting first JSON object
    match = re.search(r"\{.*\}", llm_output, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return default
