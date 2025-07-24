import time
from utils.assessment_schema import Assessment
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings, OllamaLLM
import logging
from langchain.schema import Document
from langchain.prompts import PromptTemplate
import re
from langchain.output_parsers import PydanticOutputParser
from langchain.prompts import PromptTemplate
from pydantic import ValidationError
import os

# Get Ollama base URL from environment variable
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')

import warnings
import json
warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")


embeddings = OllamaEmbeddings(model="bge-m3:latest",base_url=OLLAMA_BASE_URL)  # Ensure faiss-gpu is installed for GPU usage
llm = OllamaLLM(model="bge-m3:latest", base_url=OLLAMA_BASE_URL, temperature = 0)

def initialize(selected_model):
    """
    Initializes the embeddings and llm objects with the selected_model.
    This function should be called from app.py with the desired model name.
    """
    
    global llm
    llm = OllamaLLM(model=selected_model, base_url=OLLAMA_BASE_URL)
    
# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# LangChain components
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,  # Larger chunks for policy context
    chunk_overlap=100,
    length_function=len,    
    add_start_index=True,
    separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""]    
)

# ----------------- BASE KNOWLEDGE BASE BUILDER -----------------------

def build_knowledge_base(docs, selected_model, batch_size=5, delay_between_batches=1.0, max_retries=3):
    """
    Build a FAISS vectorstore from a list of documents with timeout handling.
    This is a drop-in replacement for your existing function.
    """
    initialize(selected_model)
    start = time.time()
    all_documents = []

    # Extract and split texts into Document objects
    for i, doc in enumerate(docs):
        try:
            if not doc.page_content.strip():
                continue
            splits = text_splitter.split_text(doc.page_content)
            meta = getattr(doc, "metadata", {}) if hasattr(doc, "metadata") else {}
            
            for split in splits:
                all_documents.append(Document(page_content=split, metadata=meta))
                
        except Exception as e:
            logger.error(f"Error processing document {i}: {e}")

    if not all_documents:
        raise ValueError("No valid content found in input documents.")

    logger.info(f"Processing {len(all_documents)} documents in batches of {batch_size}")

    # Process in batches to avoid timeouts
    try:
        kb_vectorstore = None
        total_batches = (len(all_documents) + batch_size - 1) // batch_size
        
        for batch_idx in range(0, len(all_documents), batch_size):
            batch_docs = all_documents[batch_idx:batch_idx + batch_size]
            current_batch_num= (batch_idx // batch_size) + 1
            
            logger.info(f"Processing batch {current_batch_num}/{total_batches} ({len(batch_docs)} documents)")
            
            # Retry logic for each batch
            batch_success = False
            for attempt in range(max_retries):
                try:
                    if kb_vectorstore is None:
                        # Create initial vectorstore from first batch
                        kb_vectorstore = FAISS.from_documents(batch_docs, embeddings)
                    else:
                        # Create temporary vectorstore for this batch and merge
                        temp_vectorstore = FAISS.from_documents(batch_docs, embeddings)
                        kb_vectorstore.merge_from(temp_vectorstore)
                    
                    batch_success = True
                    break  # Success, exit retry loop
                    
                except Exception as e:
                    logger.warning(f"Batch {current_batch_num} attempt {attempt + 1} failed: {e}")
                    if attempt < max_retries - 1:
                        # Exponential backoff
                        wait_time = delay_between_batches * (2 ** attempt)
                        logger.info(f"Retrying in {wait_time:.1f} seconds...")
                        time.sleep(wait_time)
                    else:
                        logger.error(f"Batch {current_batch_num} failed after {max_retries} attempts")
                        raise
            
            if not batch_success:
                raise Exception(f"Failed to process batch {current_batch_num}")
            
            # Delay between batches (except for the last one)
            if current_batch_num < total_batches:
                logger.debug(f"Waiting {delay_between_batches}s before next batch...")
                time.sleep(delay_between_batches)

        logger.info(f"Vector store built successfully with {kb_vectorstore.index.ntotal} vectors.")
        
    except Exception as e:
        logger.critical(f"Vector store creation failed: {e}")
        raise

    total_time = time.time() - start
    logger.info(f"Knowledge base built in {total_time:.2f} seconds.")
    return kb_vectorstore


# ----------------- ASSESS EVIDENCE WITH KNOWLEDGE BASE -----------------
import re
import json
import io
from PIL import Image, ImageDraw, ImageFont

def extract_and_validate_json(text):
    """
    Extracts the first JSON object from text and tries to fix common LLM mistakes.
    Returns a Python dict if successful, else raises ValueError.
    """
    # Extract the first {...} block
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in LLM output.")
    json_str = match.group(0)

    # Remove trailing commas before } or ]
    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

    # Replace single quotes with double quotes (if any)
    json_str = json_str.replace("'", '"')

    # Try to parse
    try:
        return json.loads(json_str)
    except Exception as e:
        raise ValueError(f"Could not parse JSON after cleaning: {e}")

def _assess_single_evidence(evid_text, kb_vectorstore, company_kb_vectorstore, chunk_index=0, doc_index=0):
    try:
        parser = PydanticOutputParser(pydantic_object=Assessment)        

        base_contexts = kb_vectorstore.similarity_search(evid_text, k=5)
        knowledge_base_context = "\n\n".join([getattr(c, "page_content", str(c)) for c in base_contexts])

        company_contexts = company_kb_vectorstore.similarity_search(evid_text, k=5)
        company_knowledge_base_context = "\n\n".join([getattr(c, "page_content", str(c)) for c in company_contexts])

        prompt = PromptTemplate(
            template = """
            You are a cybersecurity audit analyst responsible for creating audit workbooks and performing evidence-based risk and control assessments.

            You have access to the following context sources:

            ### GLOBAL RISK AND CONTROL STANDARDS
            {knowledge_base_context}

            ### COMPANY-SPECIFIC RISK AND CONTROL STANDARDS (CRI PROFILE)
            {company_knowledge_base_context}

            You must assess the following evidence snippet:

            ### EVIDENCE SNIPPET
            {evid_text}

            ---

            ## INSTRUCTIONS

            ### 1. CONTROL FRAMEWORK ALIGNMENT
            - Compare global standards with company-specific controls
            - Identify gaps, overlaps, or conflicts
            - Prioritize based on criticality and regulatory impact
            - Create a unified control testing matrix

            ### 2. EVIDENCE ANALYSIS
            - Categorize the evidence by control domain (e.g., access control, data protection)
            - Map evidence to specific control objectives
            - Assess completeness, implementation, and effectiveness
            - Highlight any missing or insufficient documentation

            ### 3. LOG ANALYSIS FOCUS
            - Identify relevant control testing statements from the COMPANY-SPECIFIC RISK AND CONTROL STANDARDS (CRI PROFILE)
            - Evaluate whether the relevant policies are being enforced effectively
            - Match log entries to expected behaviors based on standards
            - Determine compliance status and associated risk
            - Provide a clear rationale and suggest improvements

            ### 4. CONTROL TESTING METHODOLOGY
            - **Design Adequacy**: Does the policy/control meet expectations?
            - **Implementation**: Has it been applied correctly?
            - **Effectiveness**: Is it working consistently?
            - **Compensating Controls**: If gaps exist, what alternatives are in place?

            ### 5. RISK ASSESSMENT STRATEGY
            - Use quantitative metrics if available
            - Apply qualitative judgment where metrics are missing
            - Consider interdependent risks and the current threat landscape

            ### 6. WHEN FACED WITH CONFLICT OR INSUFFICIENT EVIDENCE
            - Prefer regulatory/global standards over internal policy
            - Escalate major interpretation issues
            - Document limitations if evidence is incomplete
            - Suggest additional evidence or compensating controls

            ---

            ## OUTPUT FORMAT (REQUIRED)

            Return your answer strictly as a JSON object matching the following schema:

            {format_instructions}

            ### FIELD-BY-FIELD OUTPUT EXPECTATIONS

            **1. CONTROL STATEMENT**
            - Extract the exact control statement (verbatim) from the COMPANY-SPECIFIC RISK AND CONTROL STANDARDS (CRI PROFILE) that is most relevant to the evidence.

            **2. ASSESSMENT RESULT**
            - Compliance Status: One of COMPLIANT, NON-COMPLIANT, PARTIALLY COMPLIANT
            - Risk Level: One of CRITICAL, HIGH, MEDIUM, LOW

            **3. LOG EVIDENCE**
            - Source File: Name of the log file
            - Relevant Log Entries: Copy log lines (with timestamps) that support the assessment

            **4. ASSESSMENT RATIONALE**
            - For NON-COMPLIANT: Provide 'Why it failed', 'Gap analysis', and 'Impact'
            - For COMPLIANT: Provide 'Evidence of compliance' and 'Effectiveness assessment'

            **5. IMPROVEMENT RECOMMENDATIONS**
            - Mandatory Improvements (if non-compliant): List of corrective actions with references and timelines
            - Enhancement Opportunities: Optional improvements even if compliant, referencing global best practices

            ---

            ### IMPORTANT:

            - Respond only with a **valid JSON object**, matching the schema exactly.
            - Do **not** include explanations, markdown, or commentary.
            - Use `""` for any missing string, and `[]` for any missing list values.
            - Ensure the object can be parsed directly into the Pydantic model without transformation.

            ### Perform an exhaustive and comprehensive assessment based on the above.
            """,
            input_variables=["knowledge_base_context", "company_knowledge_base_context", "evid_text"],
            partial_variables={"format_instructions": parser.get_format_instructions()}
        )

        formatted_prompt = prompt.format(
            knowledge_base_context=knowledge_base_context,
            company_knowledge_base_context=company_knowledge_base_context,
            evid_text=evid_text
        )

        response = llm.invoke(formatted_prompt)
        parsed = parser.parse(response)
        
        return {
            "assessment": parsed.json()
        }
    except ValidationError as ve:
        logging.error(f"Validation failed for chunk {chunk_index} (doc {doc_index}): {ve}")
        return {
            "assessment": f"ValidationError: {ve}"
        }
    except Exception as e:
        logging.error(f"Assessment failed for chunk {chunk_index} (doc {doc_index}): {e}")
        return {
            "assessment": f"Error: {e}"
        }

def render_text_to_image(evidence_docs, font_size=14, width=1200, bg_color="white", text_color="black"):

        

        # Prepare the text content for the screenshot
        evidence_docs_content = "\n\n".join(
            f"Doc {i}:\n{getattr(doc, 'page_content', str(doc))[:2000]}"  # Limit to 2000 chars per doc for brevity
            for i, doc in enumerate(evidence_docs)
        ) 

        # Use a monospace font for clarity
        try:
            font = ImageFont.truetype("DejaVuSansMono.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()
        # Estimate height
        lines = evidence_docs_content.splitlines()
        # Use getbbox to determine line height (compatible with Pillow >= 10)
        bbox = font.getbbox("A")
        line_height = (bbox[3] - bbox[1]) + 2
        img_height = line_height * (len(lines) + 2)
        img = Image.new("RGB", (width, img_height), color=bg_color)
        draw = ImageDraw.Draw(img)
        y = 5
        for line in lines:
            draw.text((5, y), line, font=font, fill=text_color)
            y += line_height
        return img

def assess_evidence_with_kb(evidence_docs, kb_vectorstore, company_kb_vectorstore, max_workers=4):
    start = time.time()
    evid_texts, chunk_origin = [], []    

    for i, doc in enumerate(evidence_docs):
        try:
            if not doc.page_content.strip():
                logger.warning(f"Evidence document {i} is empty and skipped.")
                continue
            splits = text_splitter.split_text(doc.page_content)
            evid_texts.extend(splits)
            chunk_origin.extend([i] * len(splits))
            logger.info(f"Evidence document {i} split into {len(splits)} chunks.")
        except Exception as e:
            logger.error(f"Error splitting evidence document {i}: {e}")

    if not evid_texts:
        logger.warning("No valid evidence found.")
        return []

    logger.info(f"Assessing {len(evid_texts)} evidence chunks using {max_workers} threads...")
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(_assess_single_evidence, evid_texts[i], kb_vectorstore, company_kb_vectorstore, i, chunk_origin[i])
            for i in range(len(evid_texts))
        ]
        for future in as_completed(futures):
            results.append(future.result())

    logger.info(f"Assessment completed in {time.time() - start:.2f} seconds.")
    return results

#------------------ Generate Executive summary -----------------

def generate_executive_summary(assessments):
    all_text = "\n\n".join(
        json.dumps(a["assessment"], indent=2) if isinstance(a["assessment"], dict) else str(a["assessment"])
        for a in assessments if "assessment" in a
    )
    prompt = f"""
            You are a cybersecurity audit assistant. Given the following detailed control assessments, produce an Executive Summary section for an audit report. Your summary must include:
            - Overall risk assessment and control maturity rating
            - Key findings summary with high/medium/low risk classifications
            - Critical recommendations requiring immediate attention

            Assessments:
            {all_text}

            Write the summary in clear, professional language. Do not include your thought statements
            """
    summary = llm.invoke(prompt)
    return {
        "executive_summary": summary
    }

