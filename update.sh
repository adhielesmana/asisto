#!/usr/bin/env bash
set -euo pipefail

log() { printf "[update] %s\n" "$1"; }
error_exit() { printf "[update][error] %s\n" "$1" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

for cmd in node npm docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    error_exit "Required command '$cmd' missing. Install it before running this script."
  fi
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

log "Refreshing backend dependencies"
(
  cd backend
  npm install
)

log "Refreshing frontend dependencies and artifacts"
(
  cd frontend
  npm install
  npm run build
)

log "Pulling latest container images"
if [[ "$COMPOSE_CMD" == "docker compose" ]]; then
  $COMPOSE_CMD pull --include-deps
else
  $COMPOSE_CMD pull
fi

log "Rebuilding and restarting the stack"
$COMPOSE_CMD up -d --build

log "Update complete."
