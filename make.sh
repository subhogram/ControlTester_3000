#!/bin/bash

# Setup and Model Pull Script
# This script builds and starts the Docker containers, then pulls the tinyllama model

set -e  # Exit on any error

echo "🚀 Starting Docker Compose build and startup..."
echo "================================================"

# Build and start the containers
echo "Running: docker compose up --build"
docker compose up --build -d

echo ""
echo "⏳ Waiting for containers to be healthy..."

# Wait for the containers to be ready (especially ollama)
echo "Checking container status..."
sleep 10

# Check if ollama container is running
if ! docker ps --filter "name=ollama" --filter "status=running" | grep -q ollama; then
    echo "❌ Error: Ollama container is not running!"
    echo "Please check the container logs:"
    echo "docker logs ollama"
    exit 1
fi

echo "✅ Ollama container is running"

# Wait a bit more for Ollama service to be fully ready
echo "Waiting for Ollama service to be ready..."
sleep 15

# Test if Ollama API is responding
echo "Testing Ollama API connectivity..."
max_retries=12
retry_count=0

while [ $retry_count -lt $max_retries ]; do
    if curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
        echo "✅ Ollama API is responding"
        break
    else
        echo "⏳ Waiting for Ollama API... (attempt $((retry_count + 1))/$max_retries)"
        sleep 5
        retry_count=$((retry_count + 1))
    fi
done

if [ $retry_count -eq $max_retries ]; then
    echo "❌ Error: Ollama API is not responding after waiting"
    echo "Please check the ollama container logs:"
    echo "docker logs ollama"
    exit 1
fi

echo ""
echo "🔄 Pulling OLLAMA_LLM model..."
echo "=================================="

# Pull the tinyllama model
echo "Running: docker exec -it ollama ollama pull OLLAMA_LLM"
docker exec ollama ollama pull llama3:8b
docker exec ollama ollama pull qwen3
docker exec ollama ollama pull nomic-embed-text:latest
echo ""
echo "🎉 Setup complete!"
echo "=================="
echo "✅ Docker containers are running"
echo "✅ OLLAMA_LLM model has been pulled"
echo ""
echo "Your application should now be available at:"
echo "🌐 Streamlit App: http://localhost:8501"
echo "🤖 Ollama API: http://localhost:11434"
echo ""
echo "To view container logs:"
echo "  docker logs ollama"
echo "  docker logs streamlit_app"
echo ""
echo "To stop the containers:"
echo "  docker compose down"