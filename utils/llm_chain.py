import os
import time
import tempfile
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings, OllamaLLM
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak, HRFlowable)
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

import logging
from langchain.schema import Document
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
    chunk_size=512,
    chunk_overlap=64,
    length_function=len,
    add_start_index=True
)

# ----------------- KNOWLEDGE BASE BUILDER -----------------

def build_knowledge_base(docs):
    #Build knowledge base with metadata indexing
    start = time.time()
    texts = []
    metadatas = []
    for i, doc in enumerate(docs):
        try:
            if not doc.page_content.strip():
                continue
            splits = text_splitter.split_text(doc.page_content)
            # If doc has metadata, propagate it to each split
            meta = getattr(doc, "metadata", {}) if hasattr(doc, "metadata") else {}
            for split in splits:
                texts.append(split)
                metadatas.append(meta)
        except Exception as e:
            logger.error(f"Error processing document {i}: {e}")

    if not texts:
        raise ValueError("No valid content found in input documents.")

    try:
        kb_vectorstore = FAISS.from_texts(texts, embedding=embeddings, metadatas=metadatas)
        logger.info(f"Vector store built successfully with {kb_vectorstore.index.ntotal} vectors.")        
    except Exception as e:
        logger.critical(f"Vector store creation failed: {e}")
        raise 
    
    logger.info(f"Knowledge base built in {time.time() - start:.2f} seconds.")
    return kb_vectorstore

# ----------------- SINGLE EVIDENCE ASSESSMENT -----------------

def _assess_single_evidence(evid_text, kb_vectorstore, chunk_index=0, doc_index=0):
    try:
        relevant_contexts = kb_vectorstore.similarity_search(evid_text, k=3)
        kb_context = "\n\n".join([getattr(c, "page_content", str(c)) for c in relevant_contexts])

        prompt = (
            "You are a cyber-security risk and control auditor.\n"
            "Your task is to assess the provided evidence against relevant policies and standards.\n"
            "You will receive a snippet of evidence and the context of relevant policies or reports.\n"
            f"Evidence snippet:\n{evid_text}\n\n"
            f"Policy/report context:\n{kb_context}\n\n"
            "1. Determine the type of evidence, such as DB log, password log, configuration file, etc. The log type is typically indicated in the first few lines of the log file.\n"
            "2. Evaluate how well it complies (compliant or non-compliant) with the relevant policy context and the standards set forth in SOC 2/CRI.\n"
            "3. Provide the control statement from the relevant policy or applicable CRI to test the evidence.\n"
            "4. If compliant, return 'Compliant' with no further details.\n"
            "5. If the evidence does not comply, return 'Non-Compliant' and provide the log entry where it fails to meet the control, along with the rationale explaining why it does not adhere to the control statement.\n"
            "6. Identify any potential improvements and propose effective remedies as needed. If remedies are already documented and visible in the logs, be sure to highlight those as well.\n"
            "7. Provide the time when the log was generated, if available. It can be found by observing the timestamps on the log entries\n"
            "8. If the evidence is not relevant to any control, return 'Not Applicable' and explain why.\n\n"

            "Provide response in below format:\n"
            "Control Statement: <control statement>\n"
            "Assessment: <Compliant/Non-Compliant>\n"
            "Evidence Type: <evidence type>\n"           
            "Log Entry: <If non-compliant, print log entry>\n"
            "Rationale: <if non-compliant, the rationale for failure>\n"
            "Improvements: <if applicable, provide suggestions for improvement/remedy measures>\n"
            "Evidence Time: <if available, the time when the log was generated>\n"
        )
        answer = llm.invoke(prompt)
        return {            
            "assessment": answer
        }
    except Exception as e:
        logger.error(f"Assessment failed for chunk {chunk_index} (doc {doc_index}): {e}")
        return {
            "assessment": f"Error: {e}"
        }

# ----------------- PARALLEL EVIDENCE ASSESSMENT -----------------
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
            logger.error(f"Error processing evidence document {i}: {e}")

    if not texts:
        raise ValueError("No valid content found in evidence documents.")

    try:
        evidence_vectorstore = FAISS.from_texts(texts, embedding=embeddings, metadatas=metadatas)
        logger.info(f"Evidence vector store built successfully with {evidence_vectorstore.index.ntotal} vectors.")
    except Exception as e:
        logger.critical(f"Evidence vector store creation failed: {e}")
        raise

    return evidence_vectorstore

def assess_evidence_with_kb(evidence_docs, kb_vectorstore, max_workers=4):
    start = time.time()
    evid_texts, chunk_origin = [], []

    for i, doc in enumerate(evidence_docs):
        try:
            if not doc.page_content.strip():
                logger.warning(f"Evidence document {i} is empty and skipped.")
                continue
            splits = text_splitter.split_text(doc.page_content)
            #meta = getattr(doc, "metadata", {}) if hasattr(doc, "metadata") else {}
            evid_texts.extend(splits)
            #evid_texts.extend(meta)
            chunk_origin.extend([i] * len(splits))
        except Exception as e:
            logger.error(f"Error splitting evidence document {i}: {e}")

    if not evid_texts:
        logger.warning("No valid evidence found.")
        return []

    evid_vectorstore = build_evidence_vectorstore(evidence_docs)

    logger.info(f"Assessing {len(evid_texts)} evidence chunks using {max_workers} threads...")
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(_assess_single_evidence, evid_texts[i], kb_vectorstore, i, chunk_origin[i])
            for i in range(len(evid_texts))
        ]
        for future in as_completed(futures):
            results.append(future.result())

    logger.info(f"Assessment completed in {time.time() - start:.2f} seconds.")
    return results

# ----------------- KPMG-STYLED CORPORATE REPORT PDF EXPORT -----------------

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
            for ass in df["assessment"]:
                data = {}
                for line in ass.splitlines():
                    if ": " in line:
                        k, v = line.split(": ", 1)
                        data[k.strip()] = v.strip()
                records.append(data)
            df = pd.DataFrame(records)
        preferred_cols = [
            "Control Statement", "Assessment", "Evidence Type", "Log Entry", "Rationale", "Improvements", "Log timestamp"
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

            if "Control Statement" in row and pd.notna(row["Control Statement"]):
                elements.append(Paragraph("Control Statement", statement_style))
                elements.append(Paragraph(str(row["Control Statement"]), para_style))

            if "Evidence Type" in row and pd.notna(row["Evidence Type"]):
                elements.append(Paragraph("Evidence Type", statement_style))
                elements.append(Paragraph(str(row["Evidence Type"]), para_style))

            if "Assessment" in row and pd.notna(row["Assessment"]):
                style_to_use = compliant_style if str(row["Assessment"]).strip().lower() == "compliant" else noncompliant_style
                elements.append(Paragraph("Assessment", statement_style))
                elements.append(Paragraph(str(row["Assessment"]), style_to_use))

            if "Log Entry" in row and pd.notna(row["Log Entry"]):
                elements.append(Paragraph("Log Entry", statement_style))
                elements.append(Paragraph(str(row["Log Entry"]), para_style))

            if "Rationale" in row and pd.notna(row["Rationale"]):
                elements.append(Paragraph("Rationale", statement_style))
                elements.append(Paragraph(str(row["Rationale"]), para_style))

            if "Improvements" in row and pd.notna(row["Improvements"]):
                elements.append(Paragraph("Improvements / Remediation", statement_style))
                elements.append(Paragraph(str(row["Improvements"]), improvement_style))

            if "Log timestamp" in row and pd.notna(row["Log timestamp"]):
                elements.append(Paragraph("Log Timestamp", statement_style))
                elements.append(Paragraph(str(row["Log timestamp"]), para_style))

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