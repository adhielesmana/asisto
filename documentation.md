# ASISTO Stack Deployment

## Overview
ASISTO is a Dockerized full-stack proof-of-concept connecting:
1. **Backend** – Fastify app that sends prompts to Ollama on the internal Docker network first, falls back to Puter for knowledge-heavy requests when configured, and persists Puter answers in a Docker volume.
2. **Frontend** – Next.js 14 SPA (`/pages/index.js`) with a textarea, a knowledge-fallback toggle, and a response panel that shows which provider answered the request.
3. **AI Runtime** – Ollama now runs as its own Docker service, pulls the latest `ollama/ollama:latest` image, and creates a local `asisto-coder` model built from `qwen2.5-coder:1.5b` inside that container.
4. **Monitoring** – Prometheus scrapes the backend; Grafana is wired up via Docker Compose. `install.sh` additionally configures nginx for `asisto.maxnetplus.id`.

## Prerequisites
- Linux host (the provided `install.sh` assumes Fedora-based tooling) with Docker and Docker Compose (or plugin) installed. The default runtime path is Docker-only.
- A Puter auth token if you want cloud fallback for knowledge-heavy prompts. Copy `.env.example` to `.env` and set `PUTER_AUTH_TOKEN=...`.
- (Optional) nginx/reverse-proxy if exposing via a domain; `install.sh` shows a sample configuration.

## Setup (`setup.sh`)
1. Ensures Docker and Docker Compose are available.
2. Creates `.env` from `.env.example` if you do not already have one.
3. Pulls base images and builds the app images so the stack is ready to start fully inside Docker. The Ollama defaults now point at the custom `asisto-coder` model.

Run from the repo root:
```
./setup.sh
```

## Deploy (`deploy.sh`)
1. Detects whether you have `docker compose` (plugin) or `docker-compose` and uses the appropriate binary.
2. Pulls the latest Ollama runtime image, starts the `ollama` container, and creates/refreshes the `asisto-coder` model inside Docker from the local Modelfile.
3. Loads environment variables from the repo root `.env` file through Docker Compose.
4. Executes `docker compose up -d --build` (or `docker-compose` equivalent) to build/start backend, frontend, Prometheus, and Grafana.
5. Reports endpoints for quick verification.

Use:
```
./deploy.sh
```

## Update (`update.sh`)
1. Verifies Docker is available.
2. Pulls updated container images.
3. Refreshes the Ollama service and makes sure the `qwen2.5-coder:1.5b` base model and `asisto-coder` custom model exist inside the container.
4. Rebuilds and restarts backend, frontend, Prometheus, and Grafana.

Run to refresh both code and containers:
```
./update.sh
```

The script gracefully handles whether `docker compose` or `docker-compose` is available; when both are missing it will exit with a helpful error.

## Additional Notes
- `install.sh` automates a Docker-first installation (Docker, Docker Compose, nginx proxy, Ollama container startup, model pull, and `docker-compose up -d --build`). It can still be useful if you need to bootstrap a fresh machine; otherwise, you can rely on the three new scripts to manage each lifecycle stage.
- The frontend currently uses Next.js 14.0.0 and warns about a known security vulnerability (see npm install output). Update `next` to a patched release before exposing the app publicly.
- Ollama now runs in Docker and is reachable by the backend at `http://ollama:11434/api/generate` on the internal Compose network. It is intentionally not published on a host port. The default local model is `asisto-coder`, built from `qwen2.5-coder:1.5b`.
- There is no dedicated application SQL/NoSQL database in this repo yet; persistent data currently lives in Docker volumes for Ollama models, the knowledge cache, Prometheus, and Grafana.
- Puter remains an external cloud fallback by design. The local AI runtime is containerized, but Puter calls still leave the stack when fallback is used.

## Quick Verification
- Backend health: `curl http://localhost:4000/api/health`
- Frontend: open `http://localhost:3100/` and submit a prompt
- Ollama models: `docker compose exec ollama ollama list` (expect to see both `qwen2.5-coder:1.5b` and `asisto-coder`)
- Knowledge fallback: ask a current-events or documentation question, then inspect the cached answers with `docker compose exec backend cat /app/data/knowledge.json`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3301` (default user/password `admin/admin` on a fresh install)
