#!/usr/bin/env sh
set -eu

BASE_MODEL="${OLLAMA_BASE_MODEL:-qwen2.5-coder:1.5b}"
CUSTOM_MODEL="${OLLAMA_CUSTOM_MODEL:-asisto-coder}"
ACTION_MODEL="${OLLAMA_ACTION_MODEL:-llama3}"
MODELFILE="${OLLAMA_MODELFILE:-/scripts/Modelfile}"

echo "[ollama-init] waiting for Ollama to accept connections..."
until ollama list >/dev/null 2>&1; do
  sleep 2
done

echo "[ollama-init] pulling base model: ${BASE_MODEL}"
ollama pull "${BASE_MODEL}"

echo "[ollama-init] pulling action model: ${ACTION_MODEL}"
ollama pull "${ACTION_MODEL}"

if ollama show "${CUSTOM_MODEL}" >/dev/null 2>&1; then
  echo "[ollama-init] custom model already exists: ${CUSTOM_MODEL}"
else
  echo "[ollama-init] creating custom model: ${CUSTOM_MODEL}"
  ollama create "${CUSTOM_MODEL}" -f "${MODELFILE}"
fi

echo "[ollama-init] model is ready"
