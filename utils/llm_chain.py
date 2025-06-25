import os
import time
import tempfile
import pandas as pd
from utils.assessment_schema import Assessment
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings, OllamaLLM, ChatOllama
from langchain.chains import LLMChain
from ollama import chat, ChatResponse
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak, HRFlowable, Table, TableStyle)
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
import logging
from langchain.schema import Document
from langchain.prompts import PromptTemplate
import threading
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass
from queue import Queue
import re
from langchain.output_parsers import PydanticOutputParser
from langchain.prompts import PromptTemplate
from langchain_community.llms import Ollama  # Or your wrapper for ChatOllama
from pydantic import ValidationError

from itertools import islice

import warnings
import json
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Frame
import datetime
warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")


embeddings = OllamaEmbeddings(model="bge-m3:latest")  # Ensure faiss-gpu is installed for GPU usage
llm = OllamaLLM(model="llama3", temperature = 0)

def initialize(selected_model):
    """
    Initializes the embeddings and llm objects with the selected_model.
    This function should be called from app.py with the desired model name.
    """
    
    global llm
    llm = OllamaLLM(model=selected_model)
    
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

def build_knowledge_base(docs, batch_size=5, delay_between_batches=1.0, max_retries=3):
    """
    Build a FAISS vectorstore from a list of documents with timeout handling.
    This is a drop-in replacement for your existing function.
    """

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

# ------------------- COMPANY KNOWLEDGE BASE BUILDER -------------------

company_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,  # Larger chunks for policy context
    chunk_overlap=100,
    length_function=len,
    add_start_index=True,
    separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""]
)

def build_company_knowledge_base(
    docs,
    max_workers=8,
    max_retries=2,
    retry_delay=0.5,
    batch_size=10,
    batch_vectorstore=True,
    batch_vectorstore_size=1000,
):
    """
    Builds a knowledge base vectorstore from the provided documents using the company-specific text splitter.
    Processes documents in parallel using threads, with batch processing and a max retries option for each document.
    To avoid server/terminal timeouts, optionally builds the vectorstore in batches and merges them at the end.
    Returns the vectorstore object.
    """
    start = time.time()
    all_texts = []
    all_metadatas = []
    total_chunks = 0
    processed_files = 0

    def process_doc_with_retries(i, doc):
        last_exception = None
        for attempt in range(max_retries + 1):
            try:
                if not doc.page_content.strip():
                    logger.warning(f"Document {i} is empty and skipped.")
                    return [], []
                splits = company_text_splitter.split_text(doc.page_content)
                meta = getattr(doc, "metadata", {}) if hasattr(doc, "metadata") else {}
                doc_texts = []
                doc_metas = []
                for split_idx, split in enumerate(splits):
                    if not split.strip():
                        continue
                    split_metadata = meta.copy()
                    split_metadata["split_index"] = split_idx
                    split_metadata["total_splits"] = len(splits)
                    doc_texts.append(split)
                    doc_metas.append(split_metadata)
                return doc_texts, doc_metas
            except Exception as e:
                last_exception = e
                logger.error(f"Error processing document {i} (attempt {attempt + 1}/{max_retries + 1}): {e}")
                if attempt < max_retries:
                    time.sleep(retry_delay)
        logger.critical(f"Document {i} failed after {max_retries + 1} attempts: {last_exception}")
        return [], []

    def batch(iterable, n):
        """Yield successive n-sized batches from iterable."""
        for i in range(0, len(iterable), n):
            yield iterable[i:i + n]

    total_batches = (len(docs) + batch_size - 1) // batch_size
    current_batch_num = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for doc_batch in batch(list(enumerate(docs)), batch_size):
            current_batch_num += 1
            batch_docs = [doc for _, doc in doc_batch]
            logger.info(
                f"Processing batch {current_batch_num}/{total_batches} ({len(batch_docs)} documents)"
            )
            future_to_index = {
                executor.submit(process_doc_with_retries, i, doc): i
                for i, doc in doc_batch
            }
            for future in as_completed(future_to_index):
                i = future_to_index[future]
                try:
                    doc_texts, doc_metas = future.result()
                    if doc_texts:
                        all_texts.extend(doc_texts)
                        all_metadatas.extend(doc_metas)
                        processed_files += 1
                        total_chunks += len(doc_texts)
                except Exception as exc:
                    logger.error(f"Document {i} generated an exception: {exc}")

    if not all_texts:
        raise ValueError("No valid content found in input documents.")

    logger.info(f"Processed {processed_files} files into {total_chunks} chunks")

    # To avoid server/terminal timeouts, build the vectorstore in batches and merge if necessary
    try:
        if batch_vectorstore and len(all_texts) > batch_vectorstore_size:
            logger.info(
                f"Building vectorstore in batches of {batch_vectorstore_size} to avoid timeouts..."
            )
            vectorstores = []
            for batch_num, (text_batch, meta_batch) in enumerate(
                zip(batch(all_texts, batch_vectorstore_size), batch(all_metadatas, batch_vectorstore_size)), 1
            ):
                logger.info(
                    f"Building vectorstore batch {batch_num}/"
                    f"{(len(all_texts) + batch_vectorstore_size - 1) // batch_vectorstore_size} "
                    f"({len(text_batch)} chunks)"
                )
                vs = FAISS.from_texts(text_batch, embedding=embeddings, metadatas=meta_batch)
                vectorstores.append(vs)
            # Merge all vectorstores into one
            company_vectorstore = vectorstores[0]
            for vs in vectorstores[1:]:
                company_vectorstore.merge_from(vs)
            logger.info(f"Company vector store (batched) built successfully with {company_vectorstore.index.ntotal} vectors.")
        else:
            company_vectorstore = FAISS.from_texts(all_texts, embedding=embeddings, metadatas=all_metadatas)
            logger.info(f"Company vector store built successfully with {company_vectorstore.index.ntotal} vectors.")

        # Log category distribution
        category_counts = {}
        for meta in all_metadatas:
            cat = meta.get("category", "unknown")
            category_counts[cat] = category_counts.get(cat, 0) + 1

        logger.info("Category distribution:")
        for cat, count in sorted(category_counts.items()):
            logger.info(f"  {cat}: {count} chunks")

    except Exception as e:
        logger.critical(f"Vector store creation failed: {e}")
        raise

    total_time = time.time() - start
    logger.info(f"Company Knowledge base built in {total_time:.2f} seconds.")

    return company_vectorstore

# ----------------- PARALLEL EVIDENCE ASSESSMENT ------------------------
def build_evidence_vectorstore(evidence_docs):
    """
    Builds a FAISS vectorstore from the provided evidence documents.
    Returns the vectorstore object.
    """
    texts = []
    metadatas = []
    for i, doc in enumerate(evidence_docs):
        try:
            if not doc.page_content.strip():
                continue
            splits = text_splitter.split_text(doc.page_content)
            meta = getattr(doc, "metadata", {}) if hasattr(doc, "metadata") else {}
            for split in splits:
                texts.append(split)
                metadatas.append(meta)
        except Exception as e:
            logger.error(f"Error uploading evidence document {i}: {e}")

    if not texts:
        raise ValueError("No valid content found in evidence documents.")

    try:
        evidence_vectorstore = FAISS.from_texts(texts, embedding=embeddings, metadatas=metadatas)
        logger.info(f"Evidence vector store built successfully with {evidence_vectorstore.index.ntotal} vectors.")
    except Exception as e:
        logger.critical(f"Evidence vector store creation failed: {e}")
        raise

    return evidence_vectorstore





# ----------------- ASSESS EVIDENCE WITH KNOWLEDGE BASE -----------------
import re
import json

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

        base_contexts = kb_vectorstore.similarity_search(evid_text, k=3)
        knowledge_base_context = "\n\n".join([getattr(c, "page_content", str(c)) for c in base_contexts])

        company_contexts = company_kb_vectorstore.similarity_search(evid_text, k=3)
        company_knowledge_base_context = "\n\n".join([getattr(c, "page_content", str(c)) for c in company_contexts])

        prompt = PromptTemplate(
            template="""
            You are a cybersecurity audit analyst responsible for creating audit workbooks and performing evidence-based risk and control assessments.

            You have access to the following context sources:
            ### GLOBAL RISK AND CONTROL STANDARDS
            {knowledge_base_context}

            ### COMPANY-SPECIFIC RISK AND CONTROL STANDARDS (CRI PROFILE)
            {company_knowledge_base_context}

            You must assess the following evidence snippet:
            ### LOG EVIDENCE AND SUPPORTING DOCUMENTATION
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
            - Identify relevant control statements [you must identify the relevant control statement from policy documents before proceeding with analysis]
            - Evaluate if relavant policies are being enforced effectively
            - Match log entries to expected behaviors from standards            
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

            ### 7. ASSESSMENT CONTENT                    
                    ** 1. CONTROL STATEMENT
                            -Must extract the exact comprehensive control statement in quotes from the CRI profile that is being tested.

                    ** 2. ASSESSMENT RESULT
                            - Compliance Status: COMPLIANT / NON-COMPLIANT / PARTIALLY COMPLIANT.
                            - Risk Level: CRITICAL / HIGH / MEDIUM / LOW.

                    ** 3. LOG EVIDENCE
                            - Source File: [Specify the exact log file name or evidence source]
                            - Relevant Log Entries: [Quote exact lines from logs with timestamps and details]

                    ** 4. ASSESSMENT RATIONALE
                            For NON-COMPLIANT controls:
                                - Why it failed: [Specific explanation based on log evidence]
                                - Gap analysis: [What should happen vs. what actually happened]
                                - Risk Impact: [Security risk or business impact]

                            For COMPLIANT controls:
                                - Evidence of compliance: [How logs demonstrate control effectiveness]
                                - Effectiveness assessment: [Quality of implementation]

                    ** 5. IMPROVEMENT RECOMMENDATIONS
                            Mandatory Improvements (for non-compliant):
                                - Specific steps to achieve compliance [Quote from the relevant sources like CRI profile, company policy or other global policies]
                                - Timeline recommendations
                                - Responsible parties

                            Enhancement Opportunities (even if compliant):
                                - How to strengthen beyond company policy
                                - Global security best practices to adopt. Quote the exact policy name and the policy statement / statements.
                                - Technology or process improvements

            ---          
            
            ### IMPORTANT:
            - Generate response must be returned as JSON.
            - Do not include explanations, markdown, or commentary.
            - If any field is unknown, use empty string `""` or empty list `[]`, but include the key.
            - Do not include your thought statements.

            ### Perform an exhaustive and comprehensive analysis

            Respond only with a JSON object using the following schema:
            {format_instructions}

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
            "assessment": parsed
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

