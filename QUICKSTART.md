# ASISTO - Quick Start Guide

A Claude Code-style AI code generation tool with local LLM support.

## Features
- **Prompt-first interface** - Chat with AI to generate code
- **Multiple AI backends** - Local Ollama, Puter cloud fallback, knowledge cache
- **Code review** - Visual diff preview before applying changes
- **Environment management** - Work with multiple project folders
- **Session management** - Create, rename, and delete conversation threads
- **Copy to clipboard** - Quickly copy generated code

## Setup

### Prerequisites
- Docker & Docker Compose
- 4GB+ free disk space (for Ollama models)
- Optional: Puter auth token (for cloud fallback)

### Quick Start
```bash
# First time setup
./deploy.sh

# View the app
open http://localhost:3100

# Backend health check
curl http://localhost:4000/api/health
```

## How to Use

1. **Create a Session**
   - Click "New" button in the sidebar
   - Give it a meaningful name (double-click to rename later)

2. **Select Environment**
   - Expand "ENVIRONMENTS" in the sidebar
   - Click a folder (dev, prod, staging) to select where to work
   - Selected folder shows in the blue badge at bottom

3. **Chat with AI**
   - Type a prompt describing what you want to build
   - Press Enter or click Send
   - Wait for AI response with generated code

4. **Review Changes**
   - Generated code appears in the right pane
   - Shows filename and visual diff
   - Can copy code with "Copy" button

5. **Apply Changes**
   - Click "Apply" to save code to selected folder
   - Confirmation appears in chat
   - Continue iterating with new prompts

## Architecture

### Services
- **Frontend** (Next.js 14) - Port 3100
  - Claude Code-style UI
  - Real-time chat interface
  - File browsing and management

- **Backend** (Fastify) - Port 4000
  - `/api/ai/ask` - AI prompt handling
  - `/api/files/*` - File operations
  - `/api/health` - Health check

- **Ollama** - Local LLM inference
  - Model: `qwen2.5-coder:1.5b` (default)
  - Auto-downloads on first run (~1.5GB)

- **Prometheus** (9090) - Metrics collection
- **Grafana** (3301) - Monitoring dashboards

### File Structure
```
/environments
  /dev       - Development environment
  /prod      - Production environment
  /staging   - Staging environment
```

Generated code is saved to selected environment folder.

## Configuration

Edit `.env` file to configure:
```bash
OLLAMA_MODEL=qwen2.5-coder:1.5b
OLLAMA_URL=http://ollama:11434/api/generate
PUTER_AUTH_TOKEN=                    # Leave empty to disable Puter
PUTER_MODEL=                         # Optional Puter model
```

## Logs

View service logs:
```bash
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f ollama
```

## Stop Services
```bash
docker compose down
```

## Troubleshooting

### Model download taking too long
Ollama downloads the model on first run (~5-10 minutes). Monitor with:
```bash
docker compose logs -f ollama
```

### Port conflicts
Ensure ports are available: 3100, 4000, 9090, 3301

### Environment folders not showing
Ensure `./environments` directory exists and has subdirectories.
