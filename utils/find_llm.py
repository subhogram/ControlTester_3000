import requests
   
# use Cache for 60 seconds to avoid frequent API calls
def get_ollama_model_names():
    try:
        response = requests.get("http://ollama:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models_data = response.json()
            return [model['name'] for model in models_data.get('models', [])]
        return []
    except Exception:
        return []

def _ollama_models():
    """Streamlit presentation version"""
    import streamlit as st
    try:
        model_names = get_ollama_model_names()
        filtered = [name for name in model_names if "embed" not in name]
        return sorted(filtered)
    except Exception as e:
        st.warning(f"⚠️ Error connecting to Ollama: {str(e)}.")