# Maestro Web

A web-based port of [Claude Maestro](https://github.com/its-maestro-baby/maestro) - run multiple AI CLI sessions in parallel from your browser.

## Quick Start

```bash
# Build and run with Docker
docker build -t maestro-web .
docker run -d -p 3100:3100 --name maestro-web maestro-web

# Access at http://localhost:3100
```

## AI CLI Support

Maestro Web includes three AI coding assistants:

| CLI | Command | Version |
|-----|---------|---------|
| Claude Code | `claude` | 2.1.23 |
| Gemini CLI | `gemini` | 0.26.0 |
| OpenAI Codex | `codex` | 0.92.0 |

## Authentication

Each CLI has its own authentication method. You can authenticate in two ways:

### Option 1: Environment Variables (API Keys)

Pass API keys when starting the container:

```bash
docker run -d -p 3100:3100 \
  -e ANTHROPIC_API_KEY=sk-ant-xxx \
  -e GEMINI_API_KEY=xxx \
  -e OPENAI_API_KEY=sk-xxx \
  --name maestro-web maestro-web
```

### Option 2: Interactive Authentication (Persistent)

Launch a Plain Terminal session and authenticate each CLI manually:

#### Claude Code
```bash
# In a Plain Terminal session:
claude

# Follow the OAuth flow - opens browser to authenticate
# Credentials are stored in /root/.claude/
```

#### Gemini CLI
```bash
# In a Plain Terminal session:
gemini

# Follow the OAuth flow - authenticates with your Google account
# Credentials are stored in /root/.config/gemini/
```

#### OpenAI Codex
```bash
# In a Plain Terminal session:
codex

# Follow the authentication prompt
# Enter your OpenAI API key when prompted
# Credentials are stored in /root/.codex/
```

### Persisting Credentials

To persist credentials across container restarts, mount volume directories:

```bash
docker run -d -p 3100:3100 \
  -v /path/to/config/claude:/root/.claude:rw \
  -v /path/to/config/gemini:/root/.config/gemini:rw \
  -v /path/to/config/codex:/root/.codex:rw \
  -v /path/to/workspace:/workspace:rw \
  --name maestro-web maestro-web
```

## Full Docker Compose Example

```yaml
version: '3.8'

services:
  maestro-web:
    build: .
    container_name: maestro-web
    restart: unless-stopped
    ports:
      - "3100:3100"
    environment:
      - NODE_ENV=production
      - PORT=3100
      - DEFAULT_SESSIONS=0
      - PROJECT_PATH=/workspace
      # Optional: API keys for non-interactive auth
      # - ANTHROPIC_API_KEY=your-key
      # - GEMINI_API_KEY=your-key
      # - OPENAI_API_KEY=your-key
    volumes:
      # Workspace for projects
      - ./workspace:/workspace:rw
      # Persistent CLI credentials
      - ./config/claude:/root/.claude:rw
      - ./config/gemini:/root/.config/gemini:rw
      - ./config/codex:/root/.codex:rw
      # SSH keys for git operations
      - ~/.ssh:/root/.ssh:ro
```

## Usage

1. **Open the web UI** at http://localhost:3100 (or your configured hostname)
2. **Add sessions** using the + button (1-12 sessions)
3. **Select a project directory** using the folder button
4. **Click Launch** to start all sessions
5. **Select mode** per-session (Claude Code, Gemini CLI, OpenAI Codex, Plain Terminal)

### First-Time Setup

1. Launch a single session in **Plain Terminal** mode
2. Run authentication commands for each CLI you want to use
3. Once authenticated, credentials persist in the mounted volumes
4. Switch to AI modes (Claude Code, Gemini CLI, etc.) for future sessions

## Session Modes

| Mode | Description | Authentication |
|------|-------------|----------------|
| Claude Code | Anthropic's Claude AI | OAuth or ANTHROPIC_API_KEY |
| Gemini CLI | Google's Gemini AI | OAuth with Google account |
| OpenAI Codex | OpenAI's coding assistant | API key (OPENAI_API_KEY) |
| Plain Terminal | Standard bash shell | None required |

## Status Indicators

| Color | Status | Meaning |
|-------|--------|---------|
| Orange | Initializing | Session starting up |
| Gray | Idle | Waiting for input |
| Blue | Working | AI is processing |
| Yellow | Waiting | Needs user input (y/n prompt) |
| Green | Done | Task completed |
| Red | Error | Something went wrong |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Maestro Web (Browser)                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Session 1   │  │  Session 2   │  │  Session 3   │   ...    │
│  │ Claude Code  │  │ Gemini CLI   │  │  Terminal    │          │
│  │   xterm.js   │  │   xterm.js   │  │   xterm.js   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────────┬┴─────────────────┘                   │
│                          │ WebSocket                            │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Server (Express)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   SessionManager                            ││
│  │    node-pty spawns: claude, gemini, codex, bash             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | React, TypeScript, xterm.js |
| Backend | Node.js, Express, WebSocket |
| Terminal | node-pty |
| Styling | Tailwind CSS, Catppuccin Mocha |
| Container | Docker, Alpine Linux |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all sessions |
| `/api/sessions` | POST | Create new session |
| `/api/sessions/:id/launch` | POST | Launch session terminal |
| `/api/sessions/:id` | DELETE | Close session |
| `/api/project` | GET/POST | Get/set project path |
| `/api/start` | POST | Enter running mode |
| `/api/stop` | POST | Exit running mode |
| `/api/health` | GET | Health check |

## Troubleshooting

### CLI not found
Ensure the container was built with all CLIs:
```bash
docker exec maestro-web which claude gemini codex
```

### Authentication fails
1. Use Plain Terminal mode to authenticate interactively
2. Check that config volumes are mounted with `:rw` permissions
3. Verify credentials exist: `docker exec maestro-web ls -la /root/.claude`

### Session shows "Error" status
Check container logs: `docker logs maestro-web`

### WebSocket disconnects
Ensure your reverse proxy supports WebSocket upgrades.

## Credits

- Original [Claude Maestro](https://github.com/its-maestro-baby/maestro) by Jack
- Web port for Docker/homelab deployment
