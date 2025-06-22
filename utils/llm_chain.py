import os
import time
import tempfile
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings, OllamaLLM
from langchain.chains import LLMChain
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

from itertools import islice




embeddings = OllamaEmbeddings(model="llama2")  # Ensure faiss-gpu is installed for GPU usage
llm = OllamaLLM(model="llama2")

def initialize(selected_model):
    """
    Initializes the embeddings and llm objects with the selected_model.
    This function should be called from app.py with the desired model name.
    """
    
    #global llm
    #llm = OllamaLLM(model=selected_model)
    
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

# ------------------ MERGE KNOWLEDGE BASES ------------------   
def merge_knowledge_bases(kb_vectorstore, company_vectorstore):
    """
    Merges the main knowledge base with the company-specific knowledge base.
    Returns the merged vectorstore object.
    """
    start = time.time()
    
    if not kb_vectorstore or not company_vectorstore:
        raise ValueError("Both knowledge bases must be provided for merging.")
    
    try:
        # Merge company_vectorstore into kb_vectorstore
        kb_vectorstore.merge_from(company_vectorstore)
        merged_vectorstore = kb_vectorstore

        logger.info(f"Merged vector store created with {merged_vectorstore.index.ntotal} vectors.")
    except Exception as e:
        logger.critical(f"Failed to merge knowledge bases: {e}")
        raise
    
    logger.info(f"Knowledge bases merged in {time.time() - start:.2f} seconds.")
    return merged_vectorstore

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


def _assess_single_evidence(evid_text, kb_vectorstore, company_kb_vectorstore, chunk_index=0, doc_index=0):
    try:
       
        base_contexts = kb_vectorstore.similarity_search(evid_text, k=10)
        knowledge_base_context = "\n\n".join([getattr(c, "page_content", str(c)) for c in base_contexts])

        company_contexts = company_kb_vectorstore.similarity_search(evid_text, k=10)
        company_knowledge_base_context = "\n\n".join([getattr(c, "page_content", str(c)) for c in company_contexts])


        # prompt = (
        #     "You are an information security auditor.\n"
        #     f"Evidence snippet:\n{evid_text}\n\n"
        #     f"Base knowledge:\n{knowledge_base_context}\n\n"
        #     f"Company specific policy  knowledge:\n{company_knowledge_base_context}\n\n"
        #     "1. Identify the type of evidence (e.g. DB log, password log, screenshot, config).\n"
        #     "2. Assess its compliance with the policy context and SOC2/CRI.\n"
        #     "3. Provide the control statement against which the evidence is tested.\n"
        #     "4. if the evidence is not compliant, return 'Non-Compliant',log entry where it fails the control and rationale as to why it fails the control statement.\n"
        #     "5. If compliant, return 'Compliant' with no further details.\n"
        #     "6. Suggest improvements and reremedy if applicable. If remedy measures are already present and evident in logs, point those out.\n\n"

        #     "Provide response in below format:\n"
        #     "Control Statement: <control statement>\n"
        #     "Assessment: <Compliant/Non-Compliant>\n"
        #     "Evidence Type: <evidence type>\n"           
        #     "Log Entry: <if Non-Compliant, log entry where it fails>\n"
        #     "Rationale: <if Non-Compliant, rationale for failure>\n"
        #     "Improvements: <if applicable, suggestions for improvement/remedy measures if Non-Compliant>\n"
        # )
        # answer = llm(prompt)
        # return {            
        #     "assessment": answer
        # }

        prompt = f"""
                You are an expert cybersecurity auditor tasked with creating comprehensive audit workbooks and performing risk and control assessments. You have access to three key information sources:


                GLOBAL RISK AND CONTROL STANDARDS:
                {knowledge_base_context}

                COMPANY-SPECIFIC RISK AND CONTROL STANDARDS (CRI PROFILE) and other COMPANY-SPECIFIC RISK AND CONTROL policy documents:
                {company_knowledge_base_context}

                LOG EVIDENCE AND SUPPORTING DOCUMENTATION:
                {evid_text}

                ## ANALYSIS INSTRUCTIONS

                ### 1. CONTROL FRAMEWORK ANALYSIS
                    - Compare the global standards with company-specific CRI profile standards
                    - Identify gaps, conflicts, or inconsistencies between the two frameworks
                    - Create a unified control testing matrix addressing both standard sets
                    - Prioritize controls based on risk criticality and regulatory requirements

                ### 2. EVIDENCE ASSESSMENT
                    - Analyze all available log evidence and documentation
                    - Categorize evidence by control domain (access control, data protection, incident response, etc.)
                    - Assess evidence completeness and identify gaps requiring additional collection
                    - Map evidence to specific control objectives and testing requirements               

                ### 3. SPECIFIC ANALYSIS REQUIREMENTS

                    **Log Evidence Analysis Guidelines:**
                    - Access Logs: Verify authentication, authorization, and privilege controls
                    - System Logs: Validate configuration management and change controls
                    - Security Event Logs: Assess incident detection and response effectiveness
                    - Application Logs: Review data handling and business process controls

                    **Control Testing Methodology:**
                    - Design Testing: Assess control design adequacy against standards
                    - Implementation Testing: Verify proper control implementation
                    - Operating Effectiveness: Validate consistent operation over time
                    - Compensating Controls: Identify and evaluate alternative measures

                    **Risk Assessment Approach:**
                    - Apply quantitative analysis where metrics are available
                    - Use qualitative assessments for complex scenarios
                    - Consider control interdependencies and cumulative effects
                    - Factor in current threat landscape and industry-specific risks

                ### 4. DECISION-MAKING FRAMEWORK
                    **When Standards Conflict:**
                    - Prioritize regulatory requirements over internal policies
                    - Apply the more stringent control requirement
                    - Document rationale for all judgment calls
                    - Flag significant interpretive issues for escalation        

                    **When Evidence is Insufficient:**
                    - Clearly document evidence gaps
                    - Recommend specific additional evidence collection
                    - Provide qualified conclusions with limitations noted
                    - Suggest interim or compensating control measures

                    **Quality Standards:**
                    - Use clear, professional audit language
                    - Provide evidence-based conclusions
                    - Include risk-based prioritization
                    - Offer actionable, realistic recommendations
                    - Maintain objectivity throughout analysis

                    **Format Requirements:**
                    - Use structured headings and bullet points for clarity
                    - Include tables or matrices where appropriate
                    - Provide specific references to evidence analyzed
                    - Quantify findings where possible

                ### 5. AUDIT WORKBOOK CREATION
                    
                    ### 1. CONTROL STATEMENT
                            -Must extract the exact control statement in quotes from the CRI profile that is being tested.

                    ### 2. ASSESSMENT RESULT
                            - Compliance Status: COMPLIANT / NON-COMPLIANT / PARTIALLY COMPLIANT.
                            - Risk Level: CRITICAL / HIGH / MEDIUM / LOW.

                    ### 3. LOG EVIDENCE
                            - Source File: [Specify the exact log file name or evidence source]
                            - Relevant Log Entries: [Copy exact lines from logs with timestamps and details]

                    ### 4. ASSESSMENT RATIONALE
                            For NON-COMPLIANT controls:
                                - Why it failed: [Specific explanation based on log evidence]
                                - Gap analysis: [What should happen vs. what actually happened]
                                - Impact: [Security risk or business impact]

                            For COMPLIANT controls:
                                - Evidence of compliance: [How logs demonstrate control effectiveness]
                                - Effectiveness assessment: [Quality of implementation]

                    ### 5. IMPROVEMENT RECOMMENDATIONS
                            Mandatory Improvements (for non-compliant):
                                - Specific steps to achieve compliance [Quote from the relevant sources like CRI profile, company policy or other global policies]
                                - Timeline recommendations
                                - Responsible parties

                            Enhancement Opportunities (even if compliant):
                                - How to strengthen beyond company policy
                                - Global security best practices to adopt. Quote the exact policy name and the policy statement / statements.
                                - Technology or process improvements
                
                Ensure comprehensive coverage of all three information sources and producing a complete audit workbook framework.

                Provide response in the below format:
                1. CONTROL STATEMENT
                2. ASSESSMENT RESULT
                3. LOG EVIDENCE
                4. ASSESSMENT RATIONALE
                5. IMPROVEMENT RECOMMENDATIONS
                
                """
        answer = llm(prompt)

        return {
            "assessment": answer            
        }

    except Exception as e:
        logger.error(f"Assessment failed for chunk {chunk_index} (doc {doc_index}): {e}")
        return {
            "assessment": f"Error: {e}"
        }

# ----------------- PARALLEL EVIDENCE ASSESSMENT -----------------

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

# ----------------- WORKBOOK EXPORT -----------------

def generate_workbook(assessment, filename_prefix="audit_assessment"):
    """
    Generates a visually attractive, PDF report file from the assessment list of dicts.
    Returns the temporary PDF file path.
    """
    start = time.time()
    if not assessment or not isinstance(assessment[0], dict):
        logger.warning("No valid assessment data to write.")
        return None

    try:
        df = pd.DataFrame(assessment)
        if "assessment" in df.columns and df.shape[1] == 1:
            records = []
            section_patterns = {
                "CONTROL STATEMENT": r"(?:1\.\s*)?CONTROL STATEMENT[:\s]*([\s\S]*?)(?=(?:2\.?\s*ASSESSMENT RESULT|2\.?\s*COMPLIANCE STATUS|ASSESSMENT RESULT|COMPLIANCE STATUS|$))",
                "ASSESSMENT RESULT": r"(?:2\.\s*)?ASSESSMENT RESULT[:\s]*([\s\S]*?)(?=(?:3\.?\s*LOG EVIDENCE|3\.?\s*EVIDENCE|LOG EVIDENCE|EVIDENCE|$))",
                "LOG EVIDENCE": r"(?:3\.\s*)?LOG EVIDENCE[:\s]*([\s\S]*?)(?=(?:4\.?\s*ASSESSMENT RATIONALE|4\.?\s*RATIONALE|ASSESSMENT RATIONALE|RATIONALE|$))",
                "ASSESSMENT RATIONALE": r"(?:4\.\s*)?ASSESSMENT RATIONALE[:\s]*([\s\S]*?)(?=(?:5\.?\s*IMPROVEMENT RECOMMENDATIONS|5\.?\s*RECOMMENDATIONS|IMPROVEMENT RECOMMENDATIONS|RECOMMENDATIONS|$))",
                "IMPROVEMENT RECOMMENDATIONS": r"(?:5\.\s*)?IMPROVEMENT RECOMMENDATIONS[:\s]*([\s\S]*)"
            }
            for ass in df["assessment"]:
                if isinstance(ass, dict):
                    records.append(ass)
                elif isinstance(ass, str):
                    data = {}
                    for key, pat in section_patterns.items():
                        match = re.search(pat, ass, re.IGNORECASE)
                        if match:
                            data[key] = match.group(1).strip()
                        else:
                            data[key] = ""
                    records.append(data)
                else:
                    logger.warning(f"Unknown assessment type: {type(ass)}")
                    records.append({})
            df = pd.DataFrame(records)
        preferred_cols = [
            "CONTROL STATEMENT", "ASSESSMENT RESULT", "LOG EVIDENCE", "ASSESSMENT RATIONALE", "IMPROVEMENT RECOMMENDATIONS"
        ]
        cols = [c for c in preferred_cols if c in df.columns] + [c for c in df.columns if c not in preferred_cols]
        df = df[cols]

        # KPMG style palette (from referenced PDF)
        KPMG_DARK_BLUE = colors.HexColor("#00338D")
        KPMG_LIGHT_BLUE = colors.HexColor("#00AEEF")
        KPMG_CYAN = colors.HexColor("#38CCD3")
        KPMG_GREY = colors.HexColor("#EDF1F2")
        KPMG_ACCENT = colors.HexColor("#005EB8")
        KPMG_TITLE_GREY = colors.HexColor("#58595B")

        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", prefix=filename_prefix)
        doc = SimpleDocTemplate(temp_file.name, pagesize=A4, rightMargin=46, leftMargin=46, topMargin=56, bottomMargin=36)
        elements = []

        styles = getSampleStyleSheet()
        # Title and Section styles
        title_style = ParagraphStyle(
            'KPMGTitle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=25,
            leading=32,
            textColor=KPMG_DARK_BLUE,
            alignment=1,  # Centered
            spaceAfter=16,
            spaceBefore=8,
        )
        subtitle_style = ParagraphStyle(
            'KPMGSubtitle',
            parent=styles['Heading2'],
            fontName='Helvetica',
            fontSize=14,
            leading=20,
            textColor=KPMG_ACCENT,
            alignment=1,
            spaceAfter=20,
            spaceBefore=4,
        )
        header_style = ParagraphStyle(
            'KPMGHeader',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=16,
            leading=22,
            textColor=KPMG_DARK_BLUE,
            alignment=0,
            spaceBefore=18,
            spaceAfter=10,
            backColor=KPMG_GREY,
            leftIndent=0,
            borderPadding=8,
        )
        para_style = ParagraphStyle(
            'KPMGPara',
            parent=styles['BodyText'],
            fontName='Helvetica',
            fontSize=11.5,
            leading=18,
            textColor=KPMG_TITLE_GREY,
            spaceAfter=10,
        )
        statement_style = ParagraphStyle(
            'KPMGStatement',
            parent=styles['Heading4'],
            fontName='Helvetica-Bold',
            fontSize=13,
            leading=18,
            textColor=KPMG_ACCENT,
            spaceBefore=6,
            spaceAfter=4,
            leftIndent=0,
        )
        compliant_style = ParagraphStyle(
            'KPMGCompliant',
            parent=styles['BodyText'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=18,
            textColor=colors.green,
            leftIndent=0,
            spaceAfter=4,
        )
        noncompliant_style = ParagraphStyle(
            'KPMGNonCompliant',
            parent=styles['BodyText'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=18,
            textColor=colors.red,
            leftIndent=0,
            spaceAfter=4,
        )
        improvement_style = ParagraphStyle(
            'KPMGImprovement',
            parent=styles['BodyText'],
            fontName='Helvetica-Oblique',
            fontSize=11,
            leading=16,
            textColor=KPMG_LIGHT_BLUE,
            leftIndent=12,
            spaceBefore=3,
            spaceAfter=10,
        )
        lightbar = HRFlowable(width="100%", thickness=3, color=KPMG_CYAN, spaceBefore=12, spaceAfter=12)

        # KPMG-styled Title Page
        elements.append(Spacer(1, 30))
        elements.append(Paragraph("Audit Evidence Assessment Report", title_style))
        elements.append(Paragraph("Cyber Security Risk & Controls", subtitle_style))
        elements.append(lightbar)
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(
            "Generated on: <b>{}</b>".format(time.strftime("%Y-%m-%d %H:%M")), para_style))
        elements.append(Spacer(1, 32))
        elements.append(Paragraph(
            "This report provides an independent assessment of evidence against cyber security controls. "
            "It focuses on compliance with policy context and SOC 2/CRI standards. "
            "Each section presents the control statement, assessment summary, rationale, and recommended improvements.",
            para_style
        ))
        elements.append(PageBreak())

        # Executive summary with colored bars and modern font
        compliant_count = (df['Assessment'] == 'Compliant').sum() if 'Assessment' in df else 0
        noncompliant_count = (df['Assessment'] == 'Non-Compliant').sum() if 'Assessment' in df else 0
        elements.append(Paragraph("Executive summary", header_style))
        elements.append(Spacer(1, 12))
        summary_text = (
            f"<b>Total Items Reviewed:</b> {len(df)}<br/>"
            f"<font color='green'><b>Compliant:</b> {compliant_count}</font>&nbsp;&nbsp;&nbsp;&nbsp;"
            f"<font color='red'><b>Non-Compliant:</b> {noncompliant_count}</font>"
        )
        elements.append(Paragraph(summary_text, para_style))
        elements.append(lightbar)
        elements.append(Spacer(1, 18))

        # Detailed Evidence Assessment - one section per item
        for row_num, (idx, row) in enumerate(df.iterrows()):
            # Section header with light blue bar
            elements.append(Paragraph(f"Assessment #{row_num + 1}", header_style))
            elements.append(HRFlowable(width="100%", thickness=1.2, color=KPMG_LIGHT_BLUE, spaceBefore=3, spaceAfter=8))

            if "CONTROL STATEMENT" in row and pd.notna(row["CONTROL STATEMENT"]):
                elements.append(Paragraph("CONTROL STATEMENT", statement_style))
                elements.append(Paragraph(str(row["CONTROL STATEMENT"]), para_style))

            if "ASSESSMENT RESULT" in row and pd.notna(row["ASSESSMENT RESULT"]):
                style_to_use = compliant_style if str(row["ASSESSMENT RESULT"]).strip().lower() == "compliant" else noncompliant_style
                elements.append(Paragraph("ASSESSMENT RESULT", statement_style))
                elements.append(Paragraph(str(row["ASSESSMENT RESULT"]), style_to_use))

            if "LOG EVIDENCE" in row and pd.notna(row["LOG EVIDENCE"]):
                elements.append(Paragraph("LOG EVIDENCE", statement_style))
                elements.append(Paragraph(str(row["LOG EVIDENCE"]), para_style))

            if "ASSESSMENT RATIONALE" in row and pd.notna(row["ASSESSMENT RATIONALE"]):
                elements.append(Paragraph("ASSESSMENT RATIONALE", statement_style))
                elements.append(Paragraph(str(row["ASSESSMENT RATIONALE"]), para_style))

            if "IMPROVEMENT RECOMMENDATIONS" in row and pd.notna(row["IMPROVEMENT RECOMMENDATIONS"]):
                elements.append(Paragraph("IMPROVEMENT RECOMMENDATIONS / Remediation", statement_style))
                elements.append(Paragraph(str(row["IMPROVEMENT RECOMMENDATIONS"]), improvement_style))

            elements.append(Spacer(1, 10))
            if (row_num + 1) % 2 == 0:
                elements.append(PageBreak())

        # Final KPMG blue bar
        elements.append(Spacer(1, 30))
        elements.append(HRFlowable(width="100%", thickness=8, color=KPMG_DARK_BLUE, spaceBefore=36, spaceAfter=0))

        doc.build(elements)
        size_kb = os.path.getsize(temp_file.name) / 1024
        logger.info(f"Report saved: {temp_file.name} ({size_kb:.2f} KB) in {time.time() - start:.2f} sec")
        return temp_file.name
    except Exception as e:
        logger.critical(f"Failed to generate report: {e}")
        return None