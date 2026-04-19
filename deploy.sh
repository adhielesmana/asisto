#!/usr/bin/env bash
set -euo pipefail

log() { printf "[deploy] %s\n" "$1"; }
error_exit() { printf "[deploy][error] %s\n" "$1" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  error_exit "Docker is required. Install it before running this script."
fi

get_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    error_exit "Docker Compose is not available; install the Docker Compose plugin or docker-compose binary."
  fi
}

COMPOSE_CMD="$(get_compose_cmd)"
log "Using compose command: $COMPOSE_CMD"

log "Pulling the latest Ollama runtime image"
$COMPOSE_CMD pull ollama

log "Starting Ollama inside Docker"
$COMPOSE_CMD up -d ollama

log "Pulling the base coder model and creating asisto-coder inside Docker"
COMPOSE_PROFILES=init $COMPOSE_CMD run --rm ollama-init

log "Building and starting the ASISTO stack"
$COMPOSE_CMD up -d --build backend frontend prometheus grafana

log "Deployment complete."
log " - Frontend: http://localhost:3100"
log " - Backend: http://localhost:4000/api/health"
log " - Ollama: internal Docker service only"
log " - Prometheus: http://localhost:9090"
log " - Grafana: http://localhost:3301"
