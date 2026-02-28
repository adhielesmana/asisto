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
    -   External dependency (runs on the host).
    -   Defaults to the **llama3** model.
    -   API Endpoint: `http://localhost:11434`.

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
