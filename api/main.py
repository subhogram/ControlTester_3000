from utils.find_llm import get_ollama_model_names
from fastapi import FastAPI
from fastapi.responses import JSONResponse
app = FastAPI()

@app.get("/api/ollama-models")
def get_ollama_models():
    models = [name for name in get_ollama_model_names() if "embed" not in name]
    return {"models": sorted(models)}
