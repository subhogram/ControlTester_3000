import streamlit as st
import requests
   
# use Cache for 60 seconds to avoid frequent API calls
def _ollama_models():
    """Fetch available Ollama models from the local Ollama instance"""
    try:
        response = requests.get("http://ollama:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models_data = response.json()
            model_names = [model['name'] for model in models_data.get('models', [])]
            model_names = [name for name in model_names if not "embed" in name]
            return sorted(model_names)
        else:
            st.warning("⚠️ Could not connect to Ollama.")
    except Exception as e:
        st.warning(f"⚠️ Error connecting to Ollama: {str(e)}.")