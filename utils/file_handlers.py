import os
import tempfile
from langchain_community.document_loaders import PyPDFLoader
from langchain_unstructured import UnstructuredLoader
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi import FastAPI

def save_temp_file(file):
    suffix = file.name.split(".")[-1]
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix="."+suffix)
    temp_file.write(file.read())
    temp_file.close()
    return temp_file.name

def save_and_load_files(files):
    docs = []
    if files:
        for file in files:
            temp_path = save_temp_file(file)
            ext = os.path.splitext(temp_path)[-1].lower()
            if ext == ".pdf":
                loader = PyPDFLoader(temp_path)
            elif ext in [".txt", ".csv", ".xlsx", ".jpeg", ".jpg"]:
                loader = UnstructuredLoader(temp_path)
            else:
                continue
            docs.extend(loader.load())
            os.unlink(temp_path)
    return docs


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