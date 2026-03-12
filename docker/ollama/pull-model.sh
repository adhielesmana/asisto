#!/usr/bin/env sh
set -eu

MODEL="${OLLAMA_MODEL:-llama3}"

echo "[ollama-init] waiting for Ollama to accept connections..."
until ollama list >/dev/null 2>&1; do
  sleep 2
done

echo "[ollama-init] pulling model: ${MODEL}"
ollama pull "${MODEL}"
echo "[ollama-init] model is ready"
