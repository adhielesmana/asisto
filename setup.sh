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
for cmd in docker; do
  require_cmd "$cmd"
done

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

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  log "Created .env from .env.example. Update values if you want to override defaults."
fi

log "Pulling base images"
if [[ "$COMPOSE_CMD" == "docker compose" ]]; then
  $COMPOSE_CMD pull --include-deps
else
  $COMPOSE_CMD pull
fi

log "Building Docker images for the app services"
$COMPOSE_CMD build backend frontend

log "Setup complete. Everything is prepared to run inside Docker."
