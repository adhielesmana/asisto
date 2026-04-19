# ASISTO Project Insights

This document provides a comprehensive overview of the **ASISTO** stack based on an analysis of its documentation, scripts, and source code. This is a living document that will be updated as the project evolves.

## 🚀 Project Overview
**ASISTO** (AI Dev Cloud) is a Dockerized full-stack proof-of-concept designed to provide a local, private AI inference environment. It bridges a modern web interface with local Large Language Models (LLMs) via Ollama.

### Core Ecosystem
The project is composed of four main services orchestrated via Docker Compose:

1.  **Frontend (Next.js 14)**:
    -   A Single Page Application (SPA) providing a clean interface for AI interaction.
    -   Communicates with the backend via the `/api/ai/ask` endpoint.
    -   Located in `/frontend`.

2.  **Backend (Fastify)**:
    -   A high-performance Node.js server acting as a proxy.
    -   Routes prompts to the local **Ollama** inference engine.
    -   Exposes `/api/health` for monitoring and status checks.
    -   Located in `/backend`.

3.  **Inference Engine (Ollama)**:
    -   Runs as a Docker service on the internal Compose network.
    -   Supports two local roles:
        - **asisto-coder** for legacy/local coding prompts, built from `qwen2.5-coder:1.5b`.
        - **llama3** for the phase 2 action workflow.
    -   API Endpoint: `http://ollama:11434` inside Docker.

4.  **Phase-Based AI Orchestration**:
    -   Phase 1 planning uses the latest GPT model together with Claude Opus.
    -   Phase 2 action uses local Ollama first, then falls back to the cheapest GPT model plus Claude Haiku if the local model fails.
    -   Phase 3 intermediate responses use Claude Sonnet and are stored locally for later reuse.

4.  **Monitoring Suite**:
    -   **Prometheus**: Scrapes metrics from the backend (every 15s).
    -   **Grafana**: Visualizes system performance (accessible on port 3001).

---

## 📂 Key Files & References

### Documentation
-   [documentation.md](file:///Users/adhielesmana/asisto/documentation.md): The primary deployment guide and architectural overview.

### Automation Scripts (.sh)
The project lifecycle is managed by four specialized shell scripts:
-   [install.sh](file:///Users/adhielesmana/asisto/install.sh): Bootstraps a fresh Linux host (Fedora/DNF). Installs Docker, Nginx, and Ollama.
-   [setup.sh](file:///Users/adhielesmana/asisto/setup.sh): Validates host tooling, installs npm dependencies, and builds the frontend.
-   [deploy.sh](file:///Users/adhielesmana/asisto/deploy.sh): Binary detection (Docker Compose) and service orchestration (`up -d --build`).
-   [update.sh](file:///Users/adhielesmana/asisto/update.sh): Refreshes the codebase, rebuilds artifacts, and restarts containers.

### AI Runtime and Data
-   [backend/ai/workflow.js](file:///Users/adhielesmana/asisto/backend/ai/workflow.js): Phase orchestration layer for plan, intermediate, and action modes.
-   `backend/data/ai/store.json`: Local session memory and phase snapshots.
-   `backend/data/ai/training.jsonl`: Append-only corpus used to ground later responses.

---

## 🌐 Infrastructure & Networking
-   **Domain**: Configured to run behind Nginx at `asisto.maxnetplus.id`.
-   **Proxy Logic**:
    -   `/` -> Frontend (Next.js) on port 3000.
    -   `/api/` -> Backend (Fastify) on port 4000.
-   **Production Path**: The stack is designed for production-like environments with persistent services and monitoring.

---

## 📝 Change Log & Future Directions
*(This section will be populated as modifications are made to the codebase.)*

- **Initial Discovery**: Documented the core architecture involving Fastify, Next.js, and Ollama.
- **Monitoring Insight**: Identified the Prometheus/Grafana integration for performance tracking.
- **AI Orchestration Upgrade**: Added a three-phase workflow that coordinates OpenAI, Anthropic, and Ollama models with local persistence.
