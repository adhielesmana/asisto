# ASISTO Stack Deployment

## Overview
ASISTO is a Dockerized AI development stack built around a three-phase orchestration flow:
1. **Phase 1 - Planning** – the backend combines the latest GPT model with the latest Claude Opus model, stores the combined output locally, and writes training records for later grounding.
2. **Phase 2 - Action** – the backend forces execution through local Ollama first using `llama3`. If the local model fails or is too weak, it falls back to the cheapest GPT model plus Claude Haiku.
3. **Phase 3 - Intermediate** – mid-session clarifications use Claude Sonnet and are also persisted locally for later reuse.
4. **Runtime** – Ollama runs as its own Docker service, pulls the latest `ollama/ollama:latest` image, and keeps both `asisto-coder` and `llama3` available inside the container.
5. **Monitoring** – Prometheus scrapes the backend; Grafana is wired up via Docker Compose. `install.sh` additionally configures nginx for `asisto.maxnetplus.id`.

## Prerequisites
- Linux host (the provided `install.sh` assumes Fedora-based tooling) with Docker and Docker Compose (or plugin) installed. The default runtime path is Docker-only.
- OpenAI and Anthropic API keys if you want the full phase 1 / phase 3 / fallback workflow. Copy `.env.example` to `.env` and set `OPENAI_API_KEY=...` and `ANTHROPIC_API_KEY=...`.
- A Puter auth token only if you want the older knowledge-cache fallback path for the legacy prompt route.
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
2. Pulls the latest Ollama runtime image, starts the `ollama` container, and creates/refreshes the `asisto-coder` model plus the local `llama3` action model inside Docker.
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
3. Refreshes the Ollama service and makes sure the `qwen2.5-coder:1.5b` base model, `asisto-coder` custom model, and `llama3` action model exist inside the container.
4. Rebuilds and restarts backend, frontend, Prometheus, and Grafana.

Run to refresh both code and containers:
```
./update.sh
```

The script gracefully handles whether `docker compose` or `docker-compose` is available; when both are missing it will exit with a helpful error.

## Additional Notes
- `install.sh` automates a Docker-first installation (Docker, Docker Compose, nginx proxy, Ollama container startup, model pull, and `docker-compose up -d --build`). It can still be useful if you need to bootstrap a fresh machine; otherwise, you can rely on the three new scripts to manage each lifecycle stage.
- The frontend currently uses Next.js 14.0.0 and warns about a known security vulnerability (see npm install output). Update `next` to a patched release before exposing the app publicly.
- Ollama now runs in Docker and is reachable by the backend at `http://ollama:11434/api/generate` on the internal Compose network. It is intentionally not published on a host port. The default legacy model is `asisto-coder`, built from `qwen2.5-coder:1.5b`; the action phase uses `llama3`.
- There is no dedicated application SQL/NoSQL database in this repo yet; persistent data currently lives in Docker volumes for Ollama models, the knowledge cache, Prometheus, and Grafana.
- Phase 1 and phase 3 require OpenAI and Anthropic credentials to be configured in `.env`. Phase 2 can run fully on local Ollama unless the cloud fallback is needed.
- Puter remains an external cloud fallback for the legacy knowledge-cache path. The local AI runtime is containerized, but Puter calls still leave the stack when that route is used.

## Quick Verification
- Backend health: `curl http://localhost:4000/api/health`
- AI models registry: `curl http://localhost:4000/api/ai/models`
- Task snapshot: `curl http://localhost:4000/api/ai/tasks/<taskId>`
- Frontend: open `http://localhost:3100/` and submit a prompt
- Ollama models: `docker compose exec ollama ollama list` (expect to see `qwen2.5-coder:1.5b`, `asisto-coder`, and `llama3`)
- Knowledge fallback: ask a current-events or documentation question, then inspect the cached answers with `docker compose exec backend cat /app/data/knowledge.json`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3301` (default user/password `admin/admin` on a fresh install)
