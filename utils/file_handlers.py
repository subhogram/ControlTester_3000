import os
import shutil
import tempfile
from langchain_community.document_loaders import PyPDFLoader
from langchain_unstructured import UnstructuredLoader
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi import FastAPI
from fastapi import UploadFile

def save_temp_file(file):
    suffix = file.name.split(".")[-1]
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix="."+suffix)
    temp_file.write(file.read())
    temp_file.close()
    return temp_file.name

def save_and_load_files(files, source: str):
    docs = []

    if not files:
        return docs

    for file in files:
        temp_path = save_temp_file(file)       
        file_name = getattr(file, "name", os.path.basename(temp_path))        
        ext = os.path.splitext(temp_path)[-1].lower()
        print(f"Processing temp_path: {temp_path} file_name: {file_name} ext: {ext}")
        try:
            if ext == ".pdf":
                loader = PyPDFLoader(temp_path)
                file_type = "PDF"
            elif ext in [".txt", ".csv", ".xlsx"]:
                loader = UnstructuredLoader(temp_path)
                file_type = ext.replace(".", "").upper()
            elif ext in [".jpeg", ".jpg", ".png"]:
                loader = UnstructuredLoader(temp_path)
                file_type = "IMAGE"
            else:
                continue

            loaded_docs = loader.load()

            for doc in loaded_docs:
                # 🔥 Inject file-level metadata HERE
                doc.metadata = {
                    **doc.metadata,  # keep page/section metadata
                    "file_name": file_name,
                    "file_type": file_type,
                    "source": source,
                    "doc_category": infer_doc_category(file_name),
                    "control_domain": infer_control_domain(file_name),
                }

                docs.append(doc)

        finally:
           os.unlink(temp_path)

    return docs

def infer_doc_category(file_name: str) -> str:
    name = file_name.lower()
    if "policy" in name:
        return "Information Security Policy"
    if "procedure" in name or "sop" in name:
        return "Procedure"
    if "log" in name:
        return "System Log"
    if "config" in name:
        return "Configuration File"
    if "report" in name:
        return "Audit Report"
    return "Unknown"

def infer_control_domain(file_name: str) -> str:
    name = file_name.lower()
    if any(k in name for k in ["access", "iam", "user"]):
        return "Identity & Access Management"
    if any(k in name for k in ["network", "firewall"]):
        return "Network Security"
    if any(k in name for k in ["malware", "virus", "endpoint"]):
        return "Endpoint Security"
    if any(k in name for k in ["backup", "dr", "bc"]):
        return "Business Continuity"
    return "General IT Controls"



def save_faiss_vectorstore(vectorstore, dir_path):
    """
    Save a LangChain FAISS vectorstore to a local directory.

    Args:
        vectorstore: A FAISS vectorstore instance (from langchain_community.vectorstores.FAISS).
        dir_path: Directory path where the vectorstore files will be written. The directory
                  will be created if it does not exist.

    Returns:
        The directory path where the store was saved.

    Raises:
        ValueError: If vectorstore is None.
        Exception: Any underlying exception raised while saving.
    """
    if vectorstore is None:
        raise ValueError("vectorstore is None and cannot be saved")

    os.makedirs(dir_path, exist_ok=True)
    try:
        # FAISS vectorstores expose save_local(dir_path)
        vectorstore.save_local(dir_path)
        return dir_path
    except Exception as e:
        # Bubble up with contextual info
        raise Exception(f"Failed to save FAISS vectorstore to {dir_path}: {e}")


def load_faiss_vectorstore(dir_path, embeddings):
    """
    Load a LangChain FAISS vectorstore from a local directory.

    Args:
        dir_path: Directory path where the vectorstore files were saved.
        embeddings: An embeddings object compatible with the vectorstore (e.g. OllamaEmbeddings).

    Returns:
        A loaded FAISS vectorstore instance.

    Raises:
        FileNotFoundError: If the directory does not exist.
        Exception: Any underlying exception raised while loading.
    """
    from langchain_community.vectorstores import FAISS

    if not os.path.exists(dir_path):
        raise FileNotFoundError(f"Vectorstore directory not found: {dir_path}")

    try:
        # Newer LangChain/FAISS implementations require an explicit opt-in to
        # allow pickle-based deserialization because it can be unsafe. Try the
        # safe option first by passing the flag; if the installed version
        # doesn't accept the kwarg, fall back to the older call.
        try:
            vs = FAISS.load_local(dir_path, embeddings, allow_dangerous_deserialization=True)
        except TypeError:
            # Older versions may not accept the flag
            vs = FAISS.load_local(dir_path, embeddings)
        return vs
    except Exception as e:
        # Surface a clearer error when deserialization is blocked by safety checks
        msg = str(e)
        if 'allow_dangerous_deserialization' in msg or 'Pickle files' in msg:
            msg = (
                f"Failed to load FAISS vectorstore from {dir_path}: {e}. "
                "This error often occurs because the FAISS vectorstore uses pickle-based "
                "serialization and the LangChain loader requires explicit permission to "
                "deserialize. If you trust this data (for example, it was created on this "
                "machine), you can allow loading by using a LangChain/FAISS version that "
                "supports allow_dangerous_deserialization=True."
            )
        raise Exception(msg)