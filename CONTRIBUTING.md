# Contributing to Maestro Web

Thank you for your interest in contributing to Maestro Web! This guide will help you get started.

## 🎯 Project Goals

Maestro Web aims to provide a reliable, cross-platform way to run multiple AI coding assistants in parallel. Our focus is on:

- **Reliability**: Terminal output always works, sessions persist correctly
- **Security**: Proper isolation, no personal info in public repos
- **Simplicity**: Easy setup, clear documentation, minimal configuration
- **Performance**: Efficient resource usage, responsive UI

## 🚀 Getting Started

### Prerequisites

- [Docker](https://docker.com) installed
- [Node.js 20+](https://nodejs.org) (for local development)
- Modern browser (Chrome, Firefox, Safari, Edge)
- Git

### Development Setup

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/maestro.git
cd maestro

# 3. Run in development mode
docker-compose up maestro-dev

# Frontend: http://localhost:3000 (Vite dev server with hot reload)
# Backend: http://localhost:3100 (Express API)
```

### Project Structure

```
maestro/
├── web/                    # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── Terminal.tsx       # Terminal emulation
│   │   │   ├── SessionCard.tsx    # Individual session UI
│   │   │   └── SessionSettings.tsx # Session configuration
│   │   ├── hooks/          # Custom React hooks
│   │   │   └── useWebSocket.ts    # WebSocket connection
│   │   ├── types/          # TypeScript type definitions
│   │   └── App.tsx         # Main application component
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── managers/       # Core business logic
│   │   │   ├── SessionManager.ts   # Terminal session management
│   │   │   └── ProfileManager.ts   # Configuration persistence
│   │   ├── websocket/      # WebSocket handling
│   │   │   └── WebSocketServer.ts
│   │   ├── types/          # Shared TypeScript types
│   │   └── index.ts        # Express server entry point
├── docker-compose.yml      # Development & production setup
├── Dockerfile              # Production container build
├── Dockerfile.dev          # Development container build
└── README.md              # Documentation
```

## 🛠️ Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-keyboard-shortcuts`
- `fix/terminal-scroll-issue`
- `docs/update-authentication-guide`
- `refactor/session-manager`

### Code Style

We use TypeScript for type safety and consistency:

#### Frontend (React)
```typescript
// ✅ Good: Functional components with hooks
const SessionCard: React.FC<SessionCardProps> = ({ session, onLaunch }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLaunch = useCallback(() => {
    onLaunch(session.id);
  }, [session.id, onLaunch]);

  return (
    <div className="session-card">
      {/* Component JSX */}
    </div>
  );
};

// ❌ Avoid: Class components
class SessionCard extends React.Component { ... }
```

#### Backend (Node.js)
```typescript
// ✅ Good: Explicit types, error handling
export class SessionManager extends EventEmitter {
  private sessions: Map<number, TerminalSession> = new Map();

  public launchSession(sessionId: number, workingDir?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      return false;
    }

    try {
      // Implementation here
      return true;
    } catch (error) {
      console.error(`Failed to launch session ${sessionId}:`, error);
      return false;
    }
  }
}

// ❌ Avoid: No types, poor error handling
function launchSession(id, dir) {
  const session = sessions[id];
  // No error checking...
}
```

### Testing Guidelines

#### Manual Testing Checklist

Before submitting a PR, verify:

- [ ] **Fresh deployment works**: `docker build` and run from scratch
- [ ] **Authentication persists**: Login to Claude/Gemini, restart container, verify still authenticated
- [ ] **Terminal output appears**: No blank terminals, output shows immediately
- [ ] **Session switching works**: Click different sessions, keyboard input goes to focused session
- [ ] **Custom working directory applies**: Sessions start in correct directories
- [ ] **Error handling**: Invalid input shows appropriate error messages
- [ ] **No personal info**: No API keys, emails, or personal paths in code

#### Feature-Specific Testing

When adding features:

- **Terminal features**: Test with high-volume output (`npm install`, large diffs)
- **Session management**: Test with 1, 4, 8, and 12 sessions
- **Authentication**: Test both API key and interactive OAuth flows
- **Configuration**: Test profile save/load, favorites, guardrails
- **Cross-browser**: Test in Chrome, Firefox, Safari (if available)

### Error Handling

Always provide helpful error messages:

```typescript
// ✅ Good: Specific, actionable error
if (!fs.existsSync(configPath)) {
  throw new Error(`Config file not found at ${configPath}. Run 'maestro init' to create it.`);
}

// ❌ Avoid: Vague error
if (!config) {
  throw new Error('Bad config');
}
```

### Security Considerations

- **No secrets in code**: Use environment variables or volume mounts
- **Validate input**: Sanitize all user input, especially paths
- **Allowed directories**: Honor security boundaries for file access
- **Container isolation**: Don't break out of Docker container boundaries

## 📝 Documentation

### README Updates

When adding features, update the README with:
- Clear usage instructions
- Configuration examples
- Troubleshooting section
- API documentation (if applicable)

### Code Comments

Focus on **why**, not **what**:

```typescript
// ✅ Good: Explains reasoning
// Use registry pattern instead of DOM queries to prevent race conditions
// where terminal data arrives before the component mounts
const terminalRegistry = new Map<number, (data: string) => void>();

// ❌ Avoid: States the obvious
// Create a map
const terminalRegistry = new Map();
```

## 🐛 Bug Reports

### Before Reporting

1. **Check existing issues** on GitHub
2. **Test with fresh deployment** to isolate the issue
3. **Check browser console** for JavaScript errors
4. **Check container logs** with `docker logs maestro-web`

### Bug Report Template

```markdown
## Bug Description
Brief description of the issue.

## Steps to Reproduce
1. Open Maestro Web at http://localhost:3100
2. Create a Claude Code session
3. Launch the session
4. ...

## Expected Behavior
What should happen.

## Actual Behavior
What actually happens.

## Environment
- OS: macOS 14.2
- Browser: Chrome 121.0
- Docker version: 24.0.7
- Maestro commit: abc123f

## Logs
```
Paste relevant logs from `docker logs maestro-web`
```

## Screenshots
If applicable, add screenshots.
```

## 🚀 Feature Requests

### Before Requesting

1. **Check existing issues** for similar requests
2. **Consider if it aligns** with project goals (reliability, simplicity, security)
3. **Think about implementation** complexity vs. benefit

### Feature Request Template

```markdown
## Feature Description
Brief description of the proposed feature.

## Use Case
Who would benefit and why?

## Proposed Implementation
High-level approach (if you have ideas).

## Alternatives Considered
Other ways to solve this problem.

## Priority
How important is this to you?
```

## 🔄 Pull Request Process

### Before Submitting

1. **Create an issue first** (unless it's a trivial fix)
2. **Test thoroughly** with the manual testing checklist
3. **Update documentation** if needed
4. **Rebase on latest main** to avoid merge conflicts

### PR Template

```markdown
## Description
Brief description of changes.

## Related Issue
Fixes #123

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Fresh deployment works
- [ ] Authentication persists after restart
- [ ] Terminal output displays correctly
- [ ] Session switching works
- [ ] No personal info in code
- [ ] Cross-browser compatibility (if UI changes)

## Screenshots
If applicable, add screenshots of your changes.
```

### Review Process

1. **Automated checks** must pass (if we add them)
2. **Manual review** by maintainer
3. **Testing** by reviewer
4. **Merge** after approval

## 🎯 Priorities

### High Priority (Always Welcome)
- Bug fixes for terminal output issues
- Authentication persistence problems
- Session management reliability
- Security improvements
- Documentation improvements

### Medium Priority (Case-by-case)
- New session configuration options
- UI/UX improvements
- Performance optimizations
- Additional AI CLI support

### Low Priority (Future)
- Git worktree integration
- Advanced terminal features
- Plugin system
- Visual graph features

## 💬 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For questions and brainstorming
- **Discord**: For real-time chat (if we set one up)

## 📋 Code of Conduct

- **Be respectful** in all interactions
- **Help others** when you can
- **Focus on technical merit** in reviews
- **Assume good intentions** from all contributors

---

Thank you for contributing to Maestro Web! 🚀