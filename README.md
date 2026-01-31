# Maestro Web

🌐 **Web-based port of [Claude Maestro](https://github.com/its-maestro-baby/maestro)** - Orchestrate multiple AI coding assistants in parallel from your browser.

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://docker.com)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://reactjs.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Maestro Web Interface](assets/banner.png)

---

## 🎯 Why Maestro Web?

**The Problem:** AI coding assistants work on one task at a time. While Claude works on Feature A, you wait. Then you start Feature B. Then you wait again. Development velocity is bottlenecked by serial execution.

**The Solution:** Run 1-12 AI sessions in parallel, each with its own terminal. Work on multiple features, bug fixes, and refactoring simultaneously from any device with a browser.

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Cross-Platform** | Works on any OS - Windows, Mac, Linux, even tablets via browser |
| **Parallel Development** | Run multiple AI coding assistants simultaneously |
| **Docker Deployment** | Self-hosted, secure, no data leaves your infrastructure |
| **Persistent Sessions** | Credentials and configurations survive restarts |
| **Terminal Multiplexing** | Full terminal emulation with xterm.js |

---

## ✨ Features

### 🖥️ Multi-Terminal Session Grid
- **Dynamic grid layout** (1x1 to 3x4) adapts to session count
- **Real-time status indicators**: Initializing, Working, Waiting, Done, Error
- **Visual focus indicator** shows which terminal is active
- **Easy session switching** via click or keyboard shortcuts

### 🤖 Multi-AI Support
| AI Assistant | Command | Description |
|--------------|---------|-------------|
| **Claude Code** | `claude` | Anthropic's flagship coding assistant |
| **Gemini CLI** | `gemini` | Google's Gemini AI for code |
| **OpenAI Codex** | `codex` | OpenAI's coding assistant |
| **Plain Terminal** | `bash` | Standard shell for any task |

### ⚙️ Advanced Session Configuration
- **Permission modes** - Control AI behavior (`--dangerously-skip-permissions`, `--plan`, etc.)
- **Custom flags** - Add any CLI arguments per session
- **Environment variables** - Inject custom env vars per session
- **Guardrails** - System prompts for all AI sessions
- **Working directories** - Different project paths per session

### 💾 Persistent Configuration
- **Session profiles** - Save and reuse session configurations
- **Favorite paths** - Quick directory selection for new sessions
- **Allowed directories** - Security boundaries for file browser
- **Credential storage** - OAuth tokens and API keys persist across restarts

### 🛡️ Security & Isolation
- **Allowed directory boundaries** - Restrict file system access
- **Docker container isolation** - AI sessions run in isolated environment
- **No telemetry** - All data stays on your infrastructure
- **Volume-based persistence** - Credentials stored in Docker volumes

---

## 🚀 Quick Start

### Prerequisites
- [Docker](https://docker.com) installed (works on Linux, macOS, Windows)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Option 1: Docker Compose (Recommended)

```bash
git clone https://github.com/luke7524811/maestro.git
cd maestro

# Basic mode (workspace only)
docker compose up -d maestro-web

# Access at http://localhost:3100
```

### Option 2: With Host Filesystem Access

For accessing files outside the workspace directory:

```bash
git clone https://github.com/luke7524811/maestro.git
cd maestro

# Copy and configure environment
cp .env.example .env
# Edit .env to set HOST_MOUNT_PATH for your OS (see below)

# Run with full filesystem access
docker compose --profile full up -d
```

### Option 3: Docker Run (Quick)

```bash
# Create directories for persistent storage
mkdir -p ./config/{maestro,claude,gemini,codex} ./workspace

# Run Maestro Web
docker run -d \
  --name maestro-web \
  -p 3100:3100 \
  -v "$PWD/workspace:/workspace:rw" \
  -v "$PWD/config/maestro:/app/config:rw" \
  -v "$PWD/config/claude:/root/.claude:rw" \
  -v "$PWD/config/gemini:/root/.config/gemini:rw" \
  -v "$PWD/config/codex:/root/.codex:rw" \
  maestro-web:latest

# Access at http://localhost:3100
```

---

## 🌍 Cross-Platform Setup

Maestro runs on any OS with Docker. Configure `.env` for your platform:

### Linux

```bash
# .env
HOST_MOUNT_PATH=/home/username
SSH_KEYS_PATH=/home/username/.ssh
```

### macOS

```bash
# .env
HOST_MOUNT_PATH=/Users/username
SSH_KEYS_PATH=/Users/username/.ssh
```

### Windows (Docker Desktop)

```bash
# .env - use forward slashes
HOST_MOUNT_PATH=C:/Users/username
SSH_KEYS_PATH=C:/Users/username/.ssh
```

### Deploy Modes

| Mode | Command | Description |
|------|---------|-------------|
| **Basic** | `docker compose up -d` | Workspace only, no host access |
| **Full** | `docker compose --profile full up -d` | Host filesystem + SSH keys |
| **Dev** | `docker compose --profile dev up -d` | Hot reload for development |

---

## 🔐 Authentication Setup

### First-Time Authentication

1. **Open Maestro Web** at http://localhost:3100
2. **Create a Plain Terminal session** (click + button, select "Plain Terminal")
3. **Launch the session** and authenticate each AI CLI:

#### Claude Code Authentication
```bash
# In the Plain Terminal session:
claude

# Follow OAuth flow - opens browser to authenticate with Anthropic
# Credentials stored in /root/.claude/ (persisted via volume mount)
```

#### Gemini CLI Authentication
```bash
# In the Plain Terminal session:
gemini

# Follow OAuth flow - authenticates with Google account
# Credentials stored in /root/.config/gemini/ (persisted via volume mount)
```

#### OpenAI Codex Authentication
```bash
# In the Plain Terminal session:
codex

# Enter OpenAI API key when prompted
# Credentials stored in /root/.codex/ (persisted via volume mount)
```

### Alternative: API Key Environment Variables

Set API keys directly in `docker-compose.yml`:

```yaml
environment:
  - ANTHROPIC_API_KEY=sk-ant-your-key-here
  - GEMINI_API_KEY=your-gemini-key-here
  - OPENAI_API_KEY=sk-your-openai-key-here
```

---

## 📖 Usage Guide

### Creating & Managing Sessions

1. **Add sessions**: Click the `+` button in the header
2. **Configure session**:
   - Choose AI mode (Claude Code, Gemini CLI, etc.)
   - Set working directory (or use favorites)
   - Configure permission mode for Claude
   - Add custom flags if needed
3. **Launch session**: Click the Launch button
4. **Switch focus**: Click on any terminal or use keyboard shortcuts

### Session Profiles

**Save frequently-used configurations:**
1. Configure a session with your preferred settings
2. Click "Save Profile" in session settings
3. Name your profile (e.g., "React Development", "Python Analysis")
4. Apply saved profiles to new sessions instantly

### Working with Projects

**Set up a development workspace:**
1. Use "Add Directory" to allow access to your project folders
2. Add frequently-used paths to "Favorites" for quick selection
3. Set different working directories per session for multi-repo work
4. Use guardrails to provide project context to all AI sessions

### Terminal Features

| Feature | Description |
|---------|-------------|
| **Full terminal emulation** | Copy/paste, scrollback, colors, cursor navigation |
| **Auto-scroll** | Automatically follows output to bottom |
| **Resize support** | Terminals adapt to container size changes |
| **Focus management** | Clear visual indication of active terminal |

---

## ⚙️ Configuration

### Environment Variables (.env)

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST_MOUNT_PATH` | - | Host filesystem path to mount (platform-specific) |
| `SSH_KEYS_PATH` | - | Path to SSH keys for git operations |
| `PORT` | 3100 | HTTP server port |
| `DEFAULT_SESSIONS` | 0 | Sessions to create on startup |
| `PROJECT_PATH` | /workspace | Default working directory |
| `ANTHROPIC_API_KEY` | - | Claude Code API key (optional) |
| `GEMINI_API_KEY` | - | Gemini CLI API key (optional) |
| `OPENAI_API_KEY` | - | OpenAI Codex API key (optional) |

### Volume Mounts

| Volume | Purpose | Permissions |
|--------|---------|-------------|
| `./workspace:/workspace` | Project files and code | Read/Write |
| `${HOST_MOUNT_PATH}:/host` | Host filesystem (full profile) | Read/Write |
| `./config/maestro:/app/config` | Maestro settings, profiles, favorites | Read/Write |
| `./config/claude:/root/.claude` | Claude CLI credentials | Read/Write |
| `./config/gemini:/root/.config/gemini` | Gemini CLI credentials | Read/Write |
| `./config/codex:/root/.codex` | Codex CLI credentials | Read/Write |
| `${SSH_KEYS_PATH}:/root/.ssh` | SSH keys for git operations | Read Only |

### Docker Compose Profiles

| Service | Profile | Use Case |
|---------|---------|----------|
| `maestro-web` | (default) | Basic mode - workspace only |
| `maestro-full` | `full` | Extended mode - host filesystem + SSH |
| `maestro-dev` | `dev` | Development with hot reload |

```bash
# Basic
docker compose up -d

# Full (with host access)
docker compose --profile full up -d

# Development
docker compose --profile dev up -d
```

---

## 🔧 API Reference

### Session Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all sessions with status |
| `/api/sessions` | POST | Create new session |
| `/api/sessions/:id/launch` | POST | Launch session terminal |
| `/api/sessions/:id` | DELETE | Close session |
| `/api/sessions/:id/mode` | PATCH | Change session mode |
| `/api/sessions/:id/directory` | PATCH | Set working directory |

### Configuration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/profiles` | GET | List saved profiles |
| `/api/profiles` | POST | Create new profile |
| `/api/profiles/:id` | GET/PUT/DELETE | Manage specific profile |
| `/api/directories/allowed` | GET/POST/DELETE | Manage allowed directories |
| `/api/directories/favorites` | GET/POST/DELETE | Manage favorite paths |
| `/api/guardrails` | GET/PUT | System prompt for AI sessions |

### System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/project` | GET/POST | Default project path |
| `/api/start` | POST | Enter running mode |
| `/api/stop` | POST | Exit running mode |

### WebSocket Events

Real-time terminal I/O via WebSocket at `/ws`:

| Event | Direction | Description |
|-------|-----------|-------------|
| `session:output` | Server → Client | Terminal output data |
| `session:input` | Client → Server | User input to terminal |
| `session:statusUpdate` | Server → Client | Status changes |
| `session:resize` | Client → Server | Terminal resize |

---

## 🎨 Status Indicators

| Color | Status | Meaning |
|-------|--------|---------|
| 🟠 Orange | Initializing | Session starting up, loading AI |
| ⚪ Gray | Idle | Waiting for user input |
| 🔵 Blue | Working | AI processing request |
| 🟡 Yellow | Waiting | Needs user input (y/n prompt) |
| 🟢 Green | Done | Task completed successfully |
| 🔴 Red | Error | Command failed or AI error |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (React + xterm.js)                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Session 1   │  │  Session 2   │  │  Session 3   │   ...    │
│  │ Claude Code  │  │ Gemini CLI   │  │  Terminal    │          │
│  │   Terminal   │  │   Terminal   │  │   Terminal   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │ WebSocket (/ws)                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Server (Express)                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   SessionManager                            ││
│  │         node-pty spawns: claude, gemini, codex             ││
│  │         process monitoring, status detection                ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   ProfileManager                            ││
│  │      profiles, favorites, allowed dirs, guardrails         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Terminal** | xterm.js with FitAddon |
| **Styling** | CSS3, Catppuccin Mocha theme |
| **Backend** | Node.js 20, Express, WebSocket |
| **Process Management** | node-pty (PTY spawning) |
| **Container** | Docker, Alpine Linux |
| **AI CLIs** | Claude Code, Gemini CLI, OpenAI Codex |

---

## 🔍 Troubleshooting

### Common Issues

#### ❌ CLI Not Found
```bash
# Check if CLIs are installed in container
docker exec maestro-web which claude gemini codex

# Rebuild image if CLIs missing
docker build --no-cache -t maestro-web .
```

#### ❌ Authentication Fails
1. **Use Plain Terminal** mode to authenticate interactively
2. **Check volume mounts** have `:rw` permissions
3. **Verify credentials exist**:
   ```bash
   docker exec maestro-web ls -la /root/.claude
   docker exec maestro-web ls -la /root/.config/gemini
   docker exec maestro-web ls -la /root/.codex
   ```

#### ❌ Terminal Shows "Error" Status
```bash
# Check container logs
docker logs maestro-web

# Check specific session status
curl http://localhost:3100/api/sessions
```

#### ❌ WebSocket Connection Fails
- **Reverse Proxy**: Ensure WebSocket upgrade support
- **Firewall**: Check port 3100 is accessible
- **Browser**: Try different browser or disable extensions

#### ❌ Session Focus Issues
- **Click terminal** to focus before typing
- **Clear browser cache** if switching doesn't work
- **Check browser console** for JavaScript errors

#### ❌ Terminal Output Missing
- **Terminal registry**: Output should appear immediately
- **Restart container** if terminals are blank
- **Check browser console** for connection errors

### Health Check

```bash
# Container health
docker ps | grep maestro-web

# API health
curl http://localhost:3100/api/health

# Session status
curl http://localhost:3100/api/sessions
```

### Reset Configuration

```bash
# Stop container
docker stop maestro-web

# Remove config (keeps auth)
rm -rf ./config/maestro

# Restart
docker start maestro-web
```

---

## 🛠️ Development

### Project Structure

```
maestro/
├── web/                    # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── Terminal.tsx
│   │   │   ├── SessionCard.tsx
│   │   │   └── SessionSettings.tsx
│   │   ├── hooks/          # React hooks
│   │   └── types/          # TypeScript types
│   └── package.json
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── managers/       # Core business logic
│   │   │   ├── SessionManager.ts
│   │   │   └── ProfileManager.ts
│   │   ├── websocket/      # WebSocket handling
│   │   └── types/          # Shared types
│   └── package.json
├── docker-compose.yml      # Development setup
├── Dockerfile              # Production build
└── Dockerfile.dev          # Development build
```

### Local Development

```bash
# Clone repository
git clone https://github.com/luke7524811/maestro.git
cd maestro

# Development mode (hot reload)
docker-compose up maestro-dev

# Frontend: http://localhost:3000 (Vite dev server)
# Backend: http://localhost:3100 (Express API)
```

### Building

```bash
# Production build
docker build -t maestro-web .

# Development build
docker build -f Dockerfile.dev -t maestro-dev .
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork** the repository
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Make changes** and test thoroughly
4. **Commit**: `git commit -m 'Add amazing feature'`
5. **Push**: `git push origin feature/amazing-feature`
6. **Open Pull Request** with detailed description

### Code Style

- **TypeScript** for all new code
- **ESLint + Prettier** for consistent formatting
- **React functional components** with hooks
- **Comprehensive error handling**
- **Security-first approach**

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

- **Original Maestro** by [Jack](https://github.com/its-maestro-baby/maestro) - Swift/macOS version
- **Web Port** adaptation for Docker deployment and cross-platform use
- **Claude Code** by [Anthropic](https://claude.ai/claude-code)
- **xterm.js** by [xtermjs.org](https://xtermjs.org/)
- **Catppuccin** theme by [catppuccin.com](https://catppuccin.com/)

---

## 🌟 Star History

If this project helps you, please consider giving it a star! ⭐

---

*Built for developers who want to harness the full power of AI coding assistants without waiting around.* 🚀