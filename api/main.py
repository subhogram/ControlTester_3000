from utils.find_llm import get_ollama_model_names
from utils.file_handlers import save_and_load_files
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from typing import List
import os
import shutil
import tempfile

# Import functions from utils.file_handler
import sys
import pathlib

# Ensure the parent directory of api/ (i.e., your_project/) is in sys.path
sys.path.append(str(pathlib.Path(__file__).parent.parent.resolve()))

app = FastAPI()

def convert_uploadfile_to_tempfiles(uploadfiles: List[UploadFile]):
    """Convert FastAPI UploadFiles to file-like objects that file_handler expects."""
    temp_file_objs = []
    temp_paths = []
    for uf in uploadfiles:
        suffix = '.' + (uf.filename or '').split('.')[-1]
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        shutil.copyfileobj(uf.file, tmp)
        tmp.close()
        # Patch the 'name' attribute to simulate the expected input for save_and_load_files
        class TempFileWrapper:
            def __init__(self, path):
                self.name = path
            def read(self):
                with open(self.name, "rb") as f:
                    return f.read()
        temp_file_objs.append(TempFileWrapper(tmp.name))
        temp_paths.append(tmp.name)
    return temp_file_objs, temp_paths

@app.get("/api/ollama-models")
async def get_ollama_models():
    models = [name for name in get_ollama_model_names() if "embed" not in name]
    return {"models": sorted(models)}

@app.post("/uploadfiles/")
async def upload_files(files: List[UploadFile] = File(...)):
    # Convert UploadFile to temp files
    temp_file_objs, temp_paths = convert_uploadfile_to_tempfiles(files)
    try:
        docs = save_and_load_files(temp_file_objs)
        docs_json = [
            {
                "page_content": getattr(doc, "page_content", None),
                "metadata": getattr(doc, "metadata", {})
            }
            for doc in docs
        ]
        return JSONResponse(
            content={
                "processed_files": [f.filename for f in files],
                "documents": docs_json,
                "documents_extracted": len(docs_json)
            }
        )
    finally:
        # Clean up
        import os
        for p in temp_paths:
            if os.path.exists(p):
                os.unlink(p)