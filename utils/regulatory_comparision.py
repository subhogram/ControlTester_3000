from fastapi import FastAPI, UploadFile, File, Form
from typing import List
from pathlib import Path
import tempfile
import json
import numpy as np

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.llms import Ollama
from langchain_community.embeddings import OllamaEmbeddings
from sklearn.metrics.pairwise import cosine_similarity

app = FastAPI()


# =========================================================
# CONFIG
# =========================================================
OLLAMA_URL = "http://localhost:11434"

CHUNK_SIZE = 1400
CHUNK_OVERLAP = 200
SIM_THRESHOLD = 0.78


# =========================================================
# BASE AGENT
# =========================================================
class BaseAgent:
    def __init__(self, model: str):
        self.llm = Ollama(
            model=model,
            base_url=OLLAMA_URL,
            temperature=0.0,
        )


# =========================================================
# 🧩 1. INTERPRETER AGENT
# =========================================================
class InterpreterAgent(BaseAgent):
    def interpret(self, document_names):
        prompt = f"""
You are a cybersecurity regulatory analyst.

Based on the following regulations, infer:
- Regulatory intent
- Control strictness level
- Target industry
- Dominant control domains

Return JSON.
Documents:
{document_names}
"""
        return json.loads(self.llm.invoke(prompt))


# =========================================================
# 🔍 2. EXTRACTOR AGENT
# =========================================================
class ExtractorAgent(BaseAgent):
    def extract_controls(self, chunks):
        controls = []

        for c in chunks:
            prompt = f"""
Extract cybersecurity RISK CONTROL REQUIREMENTS only.

Return JSON list with:
- control_statement
- control_domain
- risk_addressed
- enforcement_level (Low/Medium/High)
- mandatory_keywords

TEXT:
\"\"\"{c.page_content}\"\"\"
"""
            try:
                result = json.loads(self.llm.invoke(prompt))
                for r in result:
                    r["source"] = c.metadata["source"]
                    controls.append(r)
            except Exception:
                continue

        return controls


# =========================================================
# ⚖️ 3. COMPARATOR AGENT
# =========================================================
class ComparatorAgent:
    def __init__(self, embed_model: str):
        self.embedder = OllamaEmbeddings(
            model=embed_model,
            base_url=OLLAMA_URL,
        )

    def embed(self, controls):
        return np.array(
            self.embedder.embed_documents(
                [c["control_statement"] for c in controls]
            )
        )

    def group_controls(self, controls, embeddings):
        sim = cosine_similarity(embeddings)
        visited, groups = set(), []

        for i in range(len(controls)):
            if i in visited:
                continue

            group = [i]
            visited.add(i)

            for j in range(len(controls)):
                if j not in visited and sim[i][j] >= SIM_THRESHOLD:
                    group.append(j)
                    visited.add(j)

            groups.append([controls[x] for x in group])

        return groups

    def stringency_score(self, c):
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

    def analyze(self, groups):
        analysis = []

        for g in groups:
            for c in g:
                c["stringency_score"] = self.stringency_score(c)

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
                            min(
                                c["stringency_score"] /
                                strongest["stringency_score"], 1
                            ) * 100, 2
                        )
                    }
                    for c in g
                ]
            })

        return analysis


# =========================================================
# 📝 4. REPORTER AGENT
# =========================================================
class ReporterAgent(BaseAgent):
    def generate(self, interpretation, analysis):
        prompt = f"""
You are a CISO producing a regulatory comparison report.

Interpretation:
{json.dumps(interpretation, indent=2)}

Analysis:
{json.dumps(analysis, indent=2)}

Provide:
- Common controls
- Differences
- Most stringent regulations
- Compliance percentages
- Risk impact
- Recommendations
"""
        return self.llm.invoke(prompt)


# =========================================================
# UTILS
# =========================================================
def save_uploads(files: List[UploadFile]) -> List[str]:
    paths = []

    for f in files:
        suffix = Path(f.filename).suffix or ".tmp"
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix
        ) as tmp:
            tmp.write(f.file.read())
            paths.append(tmp.name)

    return paths


def load_and_chunk(paths, filenames):
    docs = []
    for p, name in zip(paths, filenames):
        loader = PyPDFLoader(p) if p.endswith(".pdf") else TextLoader(p)
        loaded = loader.load()
        for d in loaded:
            d.metadata["source"] = name
        docs.extend(loaded)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    return splitter.split_documents(docs)



@app.post("/compare-regulations")
async def compare_regulations(
    selected_model: str = Form(...),
    max_workers: int = Form(4),  # reserved for future parallelism
    regulation_files: List[UploadFile] = File(...)
):
    # Save files
    filenames = [f.filename for f in regulation_files]
    paths = save_uploads(regulation_files)

    # Chunk documents
    chunks = load_and_chunk(paths, filenames)

    # Agents
    interpreter = InterpreterAgent(selected_model)
    extractor = ExtractorAgent(selected_model)
    comparator = ComparatorAgent(embed_model="nomic-embed-text")
    reporter = ReporterAgent(selected_model)

    # Pipeline
    interpretation = interpreter.interpret(filenames)
    controls = extractor.extract_controls(chunks)
    embeddings = comparator.embed(controls)
    groups = comparator.group_controls(controls, embeddings)
    analysis = comparator.analyze(groups)
    report = reporter.generate(interpretation, analysis)

    return {
        "model_used": selected_model,
        "documents": filenames,
        "extracted_controls": len(controls),
        "control_groups": len(groups),
        "analysis": analysis,
        "final_report": report
    }
