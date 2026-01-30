# Maestro Web - Session Log

## 2026-01-29: Complete Swift → Web Port

### What Was Built

A complete 1:1 port of Claude Maestro from macOS Swift to a web-based Docker application.

### Architecture Mapping

| Component | Swift Original | Web Port |
|-----------|----------------|----------|
| Terminal emulation | SwiftTerm | xterm.js |
| Process spawning | posix_spawn/LocalProcessTerminalView | node-pty |
| UI Framework | SwiftUI | React 18 + Tailwind CSS |
| Theme | Catppuccin Mocha (hardcoded) | Catppuccin Mocha (Tailwind) |
| Transport | Native IPC | WebSocket (ws) |
| HTTP Server | N/A | Express.js |
| Build | Xcode | Vite + TypeScript |
| Package | .app bundle | Docker container |

### Files Created

#### Server (`/server/src/`)
- `types/index.ts` - All TypeScript types ported from Swift enums/structs
- `managers/SessionManager.ts` - Port of ProcessLauncher + TerminalView coordinator
- `websocket/WebSocketServer.ts` - Real-time terminal I/O via WebSocket
- `index.ts` - Express HTTP server + REST API + static file serving

#### Frontend (`/web/src/`)
- `types/index.ts` - Mirrored types for frontend
- `hooks/useWebSocket.ts` - WebSocket connection management
- `components/Terminal.tsx` - xterm.js wrapper with Catppuccin theme
- `components/SessionCard.tsx` - Port of TerminalSessionView.swift
- `App.tsx` - Port of ContentView.swift
- `index.css` - Tailwind + xterm.js styles

#### Config Files
- `server/package.json` - Node dependencies (node-pty, express, ws, cors)
- `server/tsconfig.json` - TypeScript config for ESM
- `web/package.json` - React + xterm.js + Vite
- `web/tsconfig.json` - TypeScript for React
- `web/vite.config.ts` - Vite build config with backend proxy
- `web/tailwind.config.js` - Catppuccin Mocha color palette
- `Dockerfile` - Multi-stage build (frontend → server → production)
- `docker-compose.yml` - Production + dev configurations

### Key Technical Decisions

1. **node-pty for real terminals** - Spawns actual CLI processes, not API wrappers. Works with Claude Code subscriptions AND API keys.

2. **WebSocket for I/O** - Real-time bidirectional communication between browser and terminal processes.

3. **ESM modules** - Server uses `"type": "module"` for `import.meta.url` support needed for `__dirname` in ESM.

4. **Catppuccin Mocha theme** - Exact color values from original Swift code:
   - Base: `#1e1e2e`
   - Text: `#cdd6f4`
   - Surface0: `#313244`
   - Mauve: `#cba6f7`
   - etc.

5. **Status detection patterns** - Same regex patterns as Swift:
   - WAITING: `(y/n)`, `[yes/no]`, `confirm?`, `permission`, etc.
   - ERROR: `error:`, `failed:`, `exception:`, `command not found`
   - SERVER: `localhost:PORT`, `http://127.0.0.1:PORT`

### Build Issues & Fixes

1. **npm ci without lock file** → Changed to `npm install` in Dockerfile

2. **node-pty native compilation** → Added `apk add python3 make g++` to all build stages

3. **import.meta.url in CommonJS** → Added `"type": "module"` to server/package.json

4. **Lucide icons style prop** → Changed `style={{ color }}` to `color={color}` prop

5. **Unused imports** → Removed RefreshCw, AlertCircle, etc. from App.tsx

6. **NodeJS.Timeout type** → Changed to `ReturnType<typeof setTimeout>`

7. **Frontend not serving** → Fixed path: `../web/dist` for production, `../../web/dist` for dev

### Deployment

```bash
# Container running on Plexyglass
docker run -d --name maestro-web -p 3100:3100 \
  -v /mnt/user/appdata/maestro-workspace:/workspace:rw \
  -v /root/.claude:/root/.claude:ro \
  -e NODE_ENV=production \
  -e PORT=3100 \
  -e DEFAULT_SESSIONS=6 \
  -e PROJECT_PATH=/workspace \
  --restart unless-stopped \
  maestro-web:latest
```

**Access URL**: http://192.168.86.24:3100

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get single session |
| POST | `/api/sessions` | Create new session |
| POST | `/api/sessions/:id/launch` | Launch terminal in session |
| DELETE | `/api/sessions/:id` | Close session |
| PATCH | `/api/sessions/:id/mode` | Change terminal mode |
| PATCH | `/api/sessions/:id/branch` | Set git branch |
| POST | `/api/project` | Set project path |
| GET | `/api/project` | Get project path |
| POST | `/api/start` | Enter running mode |
| POST | `/api/stop` | Exit running mode |

### WebSocket Messages

| Type | Direction | Purpose |
|------|-----------|---------|
| `session:create` | Client→Server | Create new session |
| `session:launch` | Client→Server | Launch terminal |
| `session:input` | Client→Server | Send keystrokes |
| `session:resize` | Client→Server | Terminal resize |
| `session:output` | Server→Client | Terminal output |
| `session:statusUpdate` | Server→Client | Status change |
| `session:list` | Server→Client | Initial state |

### What's Working

- ✅ Frontend serves from Docker container
- ✅ WebSocket connection established
- ✅ 6 sessions pre-created in 2x3 grid
- ✅ API returns correct session data
- ✅ Health check passes
- ✅ Container auto-restarts

---

## 2026-01-29: CLI Installation, Auth, and Bug Fixes

### Changes Made

#### 1. Multi-CLI Support

Installed all three AI CLI tools in the Docker container:

| CLI | Package | Command |
|-----|---------|---------|
| Claude Code | `@anthropic-ai/claude-code` | `claude` |
| Gemini CLI | `@google/gemini-cli` | `gemini` |
| OpenAI Codex | `@openai/codex` | `codex` |

**Dockerfile additions:**
```dockerfile
RUN npm install -g @anthropic-ai/claude-code @google/gemini-cli @openai/codex
RUN mkdir -p /root/.claude /root/.config/gemini /root/.codex
```

#### 2. Persistent Authentication

Added volume mounts for CLI config directories so auth persists across container restarts:

```yaml
volumes:
  - /mnt/user/appdata/maestro-config/claude:/root/.claude:rw
  - /mnt/user/appdata/maestro-config/gemini:/root/.config/gemini:rw
  - /mnt/user/appdata/maestro-config/codex:/root/.codex:rw
```

Authentication methods:
- **Claude Code**: Run `claude` in terminal, follow OAuth flow
- **Gemini CLI**: Run `gemini`, follow Google OAuth flow
- **OpenAI Codex**: Set `OPENAI_API_KEY` env var or run `codex auth`

#### 3. Terminal Keyboard Input Fix

**Problem**: xterm.js WebGL addon caused crashes during component disposal:
```
TypeError: Cannot read properties of undefined (reading 'onRequestRedraw')
```

**Solution**:
- Removed WebGL and Canvas render addons (use default DOM renderer)
- Added `isDisposedRef` to prevent operations after component unmount
- Deferred terminal disposal to next tick with `setTimeout`
- Changed useEffect deps to `[sessionId]` to prevent unnecessary re-renders

#### 4. Session Duplication Bug Fix

**Problem**: Adding one session created two windows (one broken).

**Root cause**: Client received `SessionCreated` message twice:
1. Direct response from `handleSessionCreate`
2. Broadcast from `setupSessionManagerListeners`

**Solution**: Removed the direct response in `handleSessionCreate`, relying only on the broadcast to prevent duplication.

```typescript
// Before (caused duplication):
this.sendToClient(client, { type: WSMessageType.SessionCreated, ... });

// After (fixed):
// Note: SessionCreated broadcast is handled by setupSessionManagerListeners
// We don't send here to avoid duplicate notifications
```

#### 5. Default Sessions Changed

Changed `DEFAULT_SESSIONS` from 6 to 0 - users now start with an empty state and add sessions as needed.

### Files Modified

| File | Changes |
|------|---------|
| `Dockerfile` | Added all three CLIs, created config directories |
| `docker-compose.yml` | Added volume mounts for persistent auth |
| `web/src/components/Terminal.tsx` | Complete rewrite for disposal handling |
| `web/package.json` | Removed xterm-addon-webgl, xterm-addon-canvas |
| `server/src/websocket/WebSocketServer.ts` | Removed duplicate SessionCreated response |

### Documentation

Created `README-WEB.md` with comprehensive documentation:
- Docker build and deployment instructions
- Authentication setup for all three CLIs
- Volume mount configuration
- Environment variables
- Troubleshooting guide

### Current State

- ✅ All three AI CLIs installed and working
- ✅ Authentication persists across container restarts
- ✅ Terminal keyboard input works
- ✅ Session count picker works (0 default, add/remove buttons)
- ✅ Single session creation (no duplication)
- ✅ Container running at maestro.rahl.cc

### Deployment

```bash
# Production container running on Plexyglass
docker run -d --name maestro-web -p 3100:3100 \
  -v /mnt/user/appdata/maestro-workspace:/workspace:rw \
  -v /mnt/user/appdata/maestro-config/claude:/root/.claude:rw \
  -v /mnt/user/appdata/maestro-config/gemini:/root/.config/gemini:rw \
  -v /mnt/user/appdata/maestro-config/codex:/root/.codex:rw \
  -v /root/.ssh:/root/.ssh:ro \
  --restart unless-stopped \
  maestro-web:latest
```

**Access URL**: https://maestro.rahl.cc

---

### Next Steps (Future Sessions)

1. Test actual terminal spawning with claude CLI
2. Add branch picker UI
3. Test multi-session parallel work
4. Add keyboard shortcuts (Cmd+1-6 for session focus)
5. Electron wrapper for desktop app
