# ASISTO Stack Deployment

## Overview
ASISTO is a Dockerized full-stack proof-of-concept connecting:
1. **Backend** – Fastify app that proxies `/api/ai/ask` prompts to a local Ollama llama3 inference endpoint and exposes `/api/health`.
2. **Frontend** – Next.js 14 SPA (`/pages/index.js`) with a textarea that posts to the backend and renders the JSON reply.
3. **Monitoring** – Prometheus scrapes the backend; Grafana is wired up via Docker Compose. `install.sh` additionally configures nginx for `asisto.maxnetplus.id`.

## Prerequisites
- Linux host (the provided `install.sh` assumes Fedora-based tooling) with Docker, Docker Compose (or plugin), and Node/npm installed. Scripts will error if dependencies are missing.
- [Ollama](https://ollama.com) installed and running on the host so the backend can call `http://localhost:11434/api/generate` with the `llama3` model. Pull `llama3` (`ollama pull llama3`) before starting the stack.
- (Optional) nginx/reverse-proxy if exposing via a domain; `install.sh` shows a sample configuration.

## Setup (`setup.sh`)
1. Ensures `node`, `npm`, and `docker` exist in `PATH`.
2. Warns if Ollama is missing and reminds you to install/pull `llama3`.
3. Installs backend/front dependencies and builds the frontend for production.

Run from the repo root:
```
./setup.sh
```

## Deploy (`deploy.sh`)
1. Detects whether you have `docker compose` (plugin) or `docker-compose` and uses the appropriate binary.
2. Executes `docker compose up -d --build` (or `docker-compose` equivalent) to build/start backend, frontend, Prometheus, and Grafana.
3. Reports endpoints for quick verification.

Use:
```
./deploy.sh
```

## Update (`update.sh`)
1. Verifies `node`, `npm`, and `docker` exist.
2. Re-installs npm dependencies for backend and frontend, rebuilding the frontend artifacts.
3. Pulls the latest images and brings the stack back up with `up -d --build`.

Run to refresh both code and containers:
```
./update.sh
```

The script gracefully handles whether `docker compose` or `docker-compose` is available; when both are missing it will exit with a helpful error.

## Additional Notes
- `install.sh` automates a full stack installation (Docker, Docker Compose, nginx proxy, Ollama installation, and `docker-compose up -d --build`). It can still be useful if you need to bootstrap a fresh machine; otherwise, you can rely on the three new scripts to manage each lifecycle stage.
- The frontend currently uses Next.js 14.0.0 and warns about a known security vulnerability (see npm install output). Update `next` to a patched release before exposing the app publicly.
- Keep Ollama running with the `llama3` model so `/api/ai/ask` continues to function.

## Quick Verification
- Backend health: `curl http://localhost:4000/api/health`
- Frontend: open `http://localhost:3000/` and submit a prompt
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (default user/password `admin/admin` on a fresh install)
