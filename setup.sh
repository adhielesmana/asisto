#!/usr/bin/env bash
set -euo pipefail

# Helper wrappers
log() { printf "[setup] %s\n" "$1"; }
error_exit() { printf "[setup][error] %s\n" "$1" >&2; exit 1; }
require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error_exit "Required command '$1' not found. Install it before running this script."
  fi
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

log "Validating host tooling"
for cmd in node npm docker; do
  require_cmd "$cmd"
done

if command -v ollama >/dev/null 2>&1; then
  log "Ollama detected (llama3 should be pulled separately if not already)."
else
  log "Ollama missing; install it before deploying (see documentation.md)."
fi

log "Installing backend dependencies"
(
  cd backend
  npm install
)

log "Installing frontend dependencies"
(
  cd frontend
  npm install
)

log "Building frontend"
(
  cd frontend
  npm run build
)

log "Setup complete. Frontend assets and npm modules are ready."
