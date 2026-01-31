/**
 * SessionManager - manages terminal sessions with node-pty
 * Port of: ProcessLauncher.swift, TerminalView.swift Coordinator
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import {
  SessionInfo,
  SessionStatus,
  TerminalMode,
  TerminalModeConfig,
  createSession,
  TerminalDimensions,
  ClaudePermissionMode,
  CodexApprovalMode,
  SessionProfile
} from '../types/index.js';
import { profileManager } from './ProfileManager.js';
import { sessionPersistenceManager } from './SessionPersistenceManager.js';

interface TerminalSession {
  info: SessionInfo;
  pty: pty.IPty | null;
  outputBuffer: string;
  lastOutputTime: Date | null;
  idleTimer: NodeJS.Timeout | null;
  initTimer: NodeJS.Timeout | null;
}

// Configurable timeouts - matches Swift coordinator
const INITIALIZING_TIMEOUT_MS = 3000; // 3 seconds
const IDLE_TIMEOUT_MS = 2000; // 2 seconds
const OUTPUT_BUFFER_MAX = 10000; // chars

// Patterns for detecting session state - matches Swift checkSpecialPatterns
const WAITING_PATTERNS = ['(y/n)', '[y/n]', '(yes/no)', '[yes/no]', 'confirm?', 'permission', 'allow this', 'approve'];
const ERROR_PATTERNS = ['error:', 'failed:', 'exception:', 'fatal:', 'command not found', 'permission denied', 'not recognized'];
// Patterns that look like errors but should be ignored (informational warnings)
const ERROR_IGNORE_PATTERNS = ['cursor position could not be read', 'warning:'];

// DSR (Device Status Report) escape sequences that need immediate response
// \x1b[6n = cursor position query - expects response \x1b[row;colR
const DSR_CURSOR_QUERY = '\x1b[6n';

// Server URL patterns - matches Swift checkForServerReady
const SERVER_PATTERNS = [
  /(https?:\/\/localhost:\d+[^\s]*)/i,
  /(https?:\/\/127\.0\.0\.1:\d+[^\s]*)/i,
  /(https?:\/\/0\.0\.0\.0:\d+[^\s]*)/i,
  /Local:\s*(https?:\/\/[^\s]+)/i,
  /ready on (https?:\/\/[^\s]+)/i,
  /Listening on (https?:\/\/[^\s]+)/i,
  /Server running at (https?:\/\/[^\s]+)/i,
  /Available on:\s*\n?\s*(https?:\/\/[^\s]+)/i
];

export class SessionManager extends EventEmitter {
  private sessions: Map<number, TerminalSession> = new Map();
  private nextSessionId = 1;
  private defaultMode: TerminalMode = TerminalMode.ClaudeCode;
  private projectPath: string = '';
  private defaultShell: string;
  private isRunning: boolean = false;
  private persistenceEnabled: boolean = true;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    // Detect shell - matches Swift ProcessInfo.processInfo.environment["SHELL"]
    this.defaultShell = process.env.SHELL || '/bin/bash';

    // Restore sessions from previous run if persistence enabled
    this.restoreSessionsFromSnapshots();

    // Set up periodic session state saving
    this.startPeriodicSave();

    // Handle graceful shutdown
    process.on('SIGINT', () => this.saveAllSessionStates());
    process.on('SIGTERM', () => this.saveAllSessionStates());
  }

  // Restore sessions from snapshots on startup
  private restoreSessionsFromSnapshots(): void {
    if (!this.persistenceEnabled) return;

    try {
      const snapshots = sessionPersistenceManager.getSessionsToRestore();
      console.log(`Found ${snapshots.length} session snapshots to restore`);

      for (const snapshot of snapshots) {
        // Use the snapshot's original ID if possible, otherwise assign new ID
        const sessionId = this.getNextAvailableId(snapshot.id);
        const restoredInfo = sessionPersistenceManager.restoreSession(snapshot, sessionId);

        const session: TerminalSession = {
          info: restoredInfo,
          pty: null,
          outputBuffer: '',
          lastOutputTime: null,
          idleTimer: null,
          initTimer: null
        };

        this.sessions.set(sessionId, session);
        this.nextSessionId = Math.max(this.nextSessionId, sessionId + 1);

        console.log(`Restored session ${sessionId} (mode: ${restoredInfo.mode}, cwd: ${restoredInfo.workingDirectory})`);
      }

      if (snapshots.length > 0) {
        this.emit('sessionsRestored', snapshots.length);
      }
    } catch (error) {
      console.error('Failed to restore sessions from snapshots:', error);
    }
  }

  // Get next available session ID, preferring the suggested ID if available
  private getNextAvailableId(suggestedId: number): number {
    if (!this.sessions.has(suggestedId) && suggestedId >= this.nextSessionId) {
      return suggestedId;
    }
    return this.nextSessionId++;
  }

  // Start periodic session state saving
  private startPeriodicSave(): void {
    if (!this.persistenceEnabled) return;

    // Save session states every 30 seconds
    this.saveTimer = setInterval(() => {
      this.saveAllSessionStates();
    }, 30000);
  }

  // Save current state of all sessions
  private saveAllSessionStates(): void {
    if (!this.persistenceEnabled) return;

    for (const [sessionId, session] of this.sessions) {
      if (session.info.isTerminalLaunched && session.pty) {
        // Get current working directory from PTY if available
        const ptyState = {
          cwd: session.info.workingDirectory,
          environment: {} as Record<string, string> // Simplified - env vars are session-specific
        };
        sessionPersistenceManager.saveSessionState(session.info, ptyState);
      } else {
        // Save configuration even if not launched
        sessionPersistenceManager.saveSessionState(session.info);
      }
    }
  }

  // Get all sessions - matches Swift sessions array
  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => s.info);
  }

  // Get single session
  getSession(id: number): SessionInfo | undefined {
    return this.sessions.get(id)?.info;
  }

  // Get session output buffer for replay on reconnect
  getSessionOutputBuffer(id: number): string | undefined {
    return this.sessions.get(id)?.outputBuffer;
  }

  // Set project path - matches Swift setProjectPath
  setProjectPath(path: string): void {
    this.projectPath = path;
    this.emit('projectPath', path);
  }

  getProjectPath(): string {
    return this.projectPath;
  }

  // Create new session - matches Swift addNewSession
  createSession(mode?: TerminalMode): SessionInfo {
    const id = this.nextSessionId++;
    const session: TerminalSession = {
      info: createSession(id, mode || this.defaultMode),
      pty: null,
      outputBuffer: '',
      lastOutputTime: null,
      idleTimer: null,
      initTimer: null
    };

    this.sessions.set(id, session);
    this.emit('sessionCreated', session.info);
    return session.info;
  }

  // Duplicate an existing session (copies configuration but not runtime state)
  duplicateSession(sessionId: number): SessionInfo | null {
    const sourceSession = this.sessions.get(sessionId);
    if (!sourceSession) return null;

    const id = this.nextSessionId++;
    const sourceInfo = sourceSession.info;

    // Create new session with copied configuration
    const newSession: TerminalSession = {
      info: {
        ...createSession(id, sourceInfo.mode),
        // Copy configuration from source
        name: sourceInfo.name ? `${sourceInfo.name} (copy)` : null,
        mode: sourceInfo.mode,
        assignedBranch: sourceInfo.assignedBranch,
        workingDirectory: sourceInfo.workingDirectory,
        profileId: sourceInfo.profileId,
        permissionMode: sourceInfo.permissionMode,
        customFlags: [...sourceInfo.customFlags],
        envVars: { ...sourceInfo.envVars },
        wrapperCommand: sourceInfo.wrapperCommand,
        allowedDirectories: [...(sourceInfo.allowedDirectories || [])],
        customRunCommand: sourceInfo.customRunCommand,
        // Reset runtime state - new session starts fresh
        status: SessionStatus.Idle,
        shouldLaunchTerminal: false,
        isTerminalLaunched: false,
        isClaudeRunning: false,
        isVisible: true,
        terminalPid: null,
        assignedPort: null,
        isAppRunning: false,
        serverURL: null,
        errorMessage: null,
        lastOutput: null
      },
      pty: null,
      outputBuffer: '',
      lastOutputTime: null,
      idleTimer: null,
      initTimer: null
    };

    this.sessions.set(id, newSession);
    this.emit('sessionCreated', newSession.info);
    return newSession.info;
  }

  // Initialize with default sessions - matches Swift init with 6 sessions
  initializeSessions(count: number = 6): SessionInfo[] {
    const sessions: SessionInfo[] = [];
    for (let i = 0; i < count; i++) {
      sessions.push(this.createSession());
    }
    return sessions;
  }

  // Build CLI command with permission flags and custom options
  private buildCliCommand(session: TerminalSession): string {
    const mode = session.info.mode;
    const modeConfig = TerminalModeConfig[mode];
    let cmd = modeConfig.command || 'bash';

    // Add terminal compatibility flags for Codex (fixes cursor position timeout in PTY)
    if (mode === TerminalMode.OpenAiCodex) {
      cmd += ' --no-alt-screen';
    }

    // Add permission flags based on mode
    if (mode === TerminalMode.ClaudeCode && session.info.permissionMode) {
      switch (session.info.permissionMode) {
        case ClaudePermissionMode.BypassPermissions:
          cmd += ' --dangerously-skip-permissions';
          break;
        case ClaudePermissionMode.AcceptEdits:
        case ClaudePermissionMode.Plan:
        case ClaudePermissionMode.DontAsk:
          cmd += ` --permission-mode ${session.info.permissionMode}`;
          break;
        // 'default' - no flag needed
      }
    }

    if (mode === TerminalMode.OpenAiCodex && session.info.permissionMode) {
      switch (session.info.permissionMode) {
        case CodexApprovalMode.FullAuto:
          cmd += ' --full-auto';
          break;
        case CodexApprovalMode.DangerousBypass:
          cmd += ' --dangerously-bypass-approvals-and-sandbox';
          break;
        case CodexApprovalMode.OnFailure:
        case CodexApprovalMode.OnRequest:
          cmd += ` -a ${session.info.permissionMode}`;
          break;
        // 'default' - no flag needed
      }
    }

    // Add guardrails if configured
    const guardrails = profileManager.getGuardrails();
    if (guardrails && guardrails.trim()) {
      // Escape single quotes in guardrails for shell safety
      const escapedGuardrails = guardrails.replace(/'/g, "'\\''");
      if (mode === TerminalMode.ClaudeCode) {
        cmd += ` --append-system-prompt '${escapedGuardrails}'`;
      } else if (mode === TerminalMode.OpenAiCodex) {
        // Codex uses --instructions flag
        cmd += ` --instructions '${escapedGuardrails}'`;
      } else if (mode === TerminalMode.GeminiCli) {
        // Gemini CLI uses --system flag
        cmd += ` --system '${escapedGuardrails}'`;
      }
      // Plain terminal doesn't support guardrails
    }

    // Add allowed directories for Claude Code
    if (mode === TerminalMode.ClaudeCode && session.info.allowedDirectories && session.info.allowedDirectories.length > 0) {
      for (const dir of session.info.allowedDirectories) {
        // Escape single quotes in directory path for shell safety
        const escapedDir = dir.replace(/'/g, "'\\''");
        cmd += ` --add-dir '${escapedDir}'`;
      }
    }

    // Add custom flags
    if (session.info.customFlags && session.info.customFlags.length > 0) {
      cmd += ' ' + session.info.customFlags.join(' ');
    }

    // Apply wrapper command if specified
    if (session.info.wrapperCommand) {
      cmd = `${session.info.wrapperCommand} ${cmd}`;
    }

    return cmd;
  }

  // Launch terminal for session - matches Swift launchTerminal
  launchSession(sessionId: number, workingDir?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Already launched
    if (session.pty) return true;

    const cwd = workingDir || session.info.workingDirectory || this.projectPath || process.cwd();
    const mode = session.info.mode;

    // Build shell command - matches Swift launchTerminal logic
    let shellArgs: string[];
    let env = { ...process.env };

    // Inject custom environment variables
    if (session.info.envVars && Object.keys(session.info.envVars).length > 0) {
      Object.assign(env, session.info.envVars);
    }

    if (mode === TerminalMode.PlainTerminal) {
      // Plain terminal - interactive login shell
      shellArgs = ['-l', '-i'];
    } else {
      // AI CLI mode - source profiles and launch CLI
      const cliCommand = this.buildCliCommand(session);
      const command = `
        if [ -f ~/.zprofile ]; then source ~/.zprofile 2>/dev/null; fi;
        if [ -f ~/.zshrc ]; then source ~/.zshrc 2>/dev/null; fi;
        if [ -f ~/.bash_profile ]; then source ~/.bash_profile 2>/dev/null; fi;
        if [ -f ~/.bashrc ]; then source ~/.bashrc 2>/dev/null; fi;
        cd '${cwd}' && ${cliCommand}
      `.trim();
      shellArgs = ['-l', '-i', '-c', command];
    }

    try {
      console.log(`Launching session ${sessionId}: mode=${mode}, cwd=${cwd}`);
      if (mode !== TerminalMode.PlainTerminal) {
        console.log(`CLI command: ${this.buildCliCommand(session)}`);
      }

      // Spawn PTY - equivalent to Swift LocalProcessTerminalView.startProcess
      const ptyProcess = pty.spawn(this.defaultShell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env
      });

      session.pty = ptyProcess;
      session.info.terminalPid = ptyProcess.pid;
      session.info.isTerminalLaunched = true;
      session.info.workingDirectory = cwd;
      session.info.status = SessionStatus.Initializing;

      // Handle output - matches Swift dataReceived
      ptyProcess.onData((data: string) => {
        this.handleOutput(sessionId, data);
      });

      // Handle exit - matches Swift processTerminated
      ptyProcess.onExit(({ exitCode }) => {
        this.handleExit(sessionId, exitCode);
      });

      // For plain terminal, cd to working directory after shell starts
      if (mode === TerminalMode.PlainTerminal) {
        setTimeout(() => {
          ptyProcess.write(`cd '${cwd}'\r`);
        }, 300);
      } else {
        // Mark CLI as launched for AI modes
        session.info.isClaudeRunning = true;
      }

      // Schedule initializing timeout
      this.scheduleInitializingCheck(sessionId);

      this.emit('sessionLaunched', session.info);
      return true;
    } catch (error) {
      console.error(`Failed to launch session ${sessionId}:`, error);
      session.info.status = SessionStatus.Error;
      this.emit('sessionStatusUpdate', session.info);
      return false;
    }
  }

  // Handle terminal output - matches Swift Coordinator.dataReceived
  private handleOutput(sessionId: number, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Intercept DSR cursor position queries and respond immediately
    // This fixes Codex CLI timeout when it queries cursor position before UI is ready
    if (data.includes(DSR_CURSOR_QUERY) && session.pty) {
      // Respond with cursor at row 1, col 1 (standard response)
      // Format: ESC [ row ; col R
      session.pty.write('\x1b[1;1R');
      // Strip the query from output to avoid confusing the terminal
      data = data.replace(DSR_CURSOR_QUERY, '');
      if (!data) return; // Nothing else to process
    }

    session.outputBuffer += data;
    session.lastOutputTime = new Date();

    // Track last output for debugging (last 500 chars)
    session.info.lastOutput = session.outputBuffer.slice(-500);

    // Emit output to clients
    this.emit('sessionOutput', sessionId, data);

    // Update status to working (unless in special state)
    if (session.info.status !== SessionStatus.Waiting &&
        session.info.status !== SessionStatus.Error) {
      session.info.status = SessionStatus.Working;
      this.emit('sessionStatusUpdate', session.info);
    }

    // Check for special patterns
    this.checkSpecialPatterns(sessionId, data);

    // Check for server URLs
    this.checkForServerReady(sessionId, data);

    // Reset idle timer
    this.scheduleIdleCheck(sessionId);

    // Keep buffer manageable
    if (session.outputBuffer.length > OUTPUT_BUFFER_MAX) {
      session.outputBuffer = session.outputBuffer.slice(-OUTPUT_BUFFER_MAX / 2);
    }
  }

  // Check for waiting/error patterns - matches Swift checkSpecialPatterns
  private checkSpecialPatterns(sessionId: number, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const lowercased = text.toLowerCase();

    // Check waiting patterns
    for (const pattern of WAITING_PATTERNS) {
      if (lowercased.includes(pattern)) {
        session.info.status = SessionStatus.Waiting;
        this.emit('sessionStatusUpdate', session.info);
        return;
      }
    }

    // Check error patterns
    for (const pattern of ERROR_PATTERNS) {
      if (lowercased.includes(pattern)) {
        // Check if this matches an ignore pattern (false positive)
        const shouldIgnore = ERROR_IGNORE_PATTERNS.some(ignorePattern =>
          lowercased.includes(ignorePattern)
        );
        if (shouldIgnore) {
          continue; // Skip this error pattern, it's a false positive
        }

        session.info.status = SessionStatus.Error;
        // Extract the line containing the error for display
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.toLowerCase().includes(pattern)) {
            session.info.errorMessage = line.trim().slice(0, 200);
            break;
          }
        }
        this.emit('sessionStatusUpdate', session.info);
        return;
      }
    }
  }

  // Check for server URLs - matches Swift checkForServerReady
  private checkForServerReady(sessionId: number, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info.serverURL) return; // Already detected

    for (const pattern of SERVER_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let url = match[1].trim();
        // Clean up trailing punctuation
        url = url.replace(/[.,;!?)]+$/, '');

        session.info.serverURL = url;
        session.info.isAppRunning = true;
        this.emit('serverReady', sessionId, url);
        this.emit('sessionStatusUpdate', session.info);
        return;
      }
    }
  }

  // Handle process exit - matches Swift processTerminated
  private handleExit(sessionId: number, exitCode: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear timers
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.initTimer) clearTimeout(session.initTimer);

    // Update status based on mode and exit code
    if (session.info.mode === TerminalMode.PlainTerminal) {
      session.info.status = SessionStatus.Idle;
    } else if (exitCode === 0) {
      session.info.status = SessionStatus.Done;
    } else {
      session.info.status = SessionStatus.Error;
      // Set error message if not already set by pattern detection
      if (!session.info.errorMessage) {
        session.info.errorMessage = `Process exited with code ${exitCode}`;
      }
    }

    session.info.isTerminalLaunched = false;
    session.info.isClaudeRunning = false;
    session.pty = null;

    this.emit('sessionStatusUpdate', session.info);
    this.emit('sessionExited', sessionId, exitCode);
  }

  // Schedule initializing check - matches Swift scheduleInitializingCheck
  private scheduleInitializingCheck(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.initTimer) clearTimeout(session.initTimer);

    session.initTimer = setTimeout(() => {
      if (session.info.status === SessionStatus.Initializing) {
        session.info.status = SessionStatus.Idle;
        this.emit('sessionStatusUpdate', session.info);
      }
    }, INITIALIZING_TIMEOUT_MS);
  }

  // Schedule idle check - matches Swift scheduleIdleCheck
  private scheduleIdleCheck(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.idleTimer) clearTimeout(session.idleTimer);

    session.idleTimer = setTimeout(() => {
      if (session.lastOutputTime) {
        const elapsed = Date.now() - session.lastOutputTime.getTime();
        if (elapsed >= IDLE_TIMEOUT_MS && session.info.status === SessionStatus.Working) {
          session.info.status = SessionStatus.Idle;
          this.emit('sessionStatusUpdate', session.info);
        }
      }
    }, IDLE_TIMEOUT_MS);
  }

  // Send input to terminal - matches Swift sendCommand
  sendInput(sessionId: number, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session?.pty) return;
    session.pty.write(data);

    // Track command history for persistence (if it ends with \r it's a command)
    if (this.persistenceEnabled && data.endsWith('\r')) {
      const command = data.slice(0, -1); // Remove \r
      sessionPersistenceManager.addToHistory(sessionId, command);
    }
  }

  // Send command with carriage return - matches Swift Coordinator.sendCommand
  sendCommand(sessionId: number, command: string): void {
    this.sendInput(sessionId, command + '\r');

    // Explicitly track this as a command for persistence
    if (this.persistenceEnabled) {
      sessionPersistenceManager.addToHistory(sessionId, command);
    }
  }

  // Resize terminal - matches Swift sizeChanged
  resizeSession(sessionId: number, dimensions: TerminalDimensions): void {
    const session = this.sessions.get(sessionId);
    if (!session?.pty) return;
    session.pty.resize(dimensions.cols, dimensions.rows);
  }

  // Set session mode - matches Swift setMode
  setMode(sessionId: number, mode: TerminalMode): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Can't change mode after launch
    if (session.info.isTerminalLaunched) return;

    session.info.mode = mode;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set branch - matches Swift assignBranch
  setBranch(sessionId: number, branch: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.info.assignedBranch = branch;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set session name/label - can be changed anytime
  setSessionName(sessionId: number, name: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.info.name = name;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set permission mode
  setPermissionMode(sessionId: number, permissionMode: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info.isTerminalLaunched) return;
    session.info.permissionMode = permissionMode;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set custom flags
  setCustomFlags(sessionId: number, flags: string[]): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info.isTerminalLaunched) return;
    session.info.customFlags = flags;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set environment variables
  setEnvVars(sessionId: number, envVars: Record<string, string>): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info.isTerminalLaunched) return;
    session.info.envVars = envVars;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set wrapper command
  setWrapperCommand(sessionId: number, wrapper: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info.isTerminalLaunched) return;
    session.info.wrapperCommand = wrapper;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set working directory
  setWorkingDirectory(sessionId: number, dir: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info.isTerminalLaunched) return;
    session.info.workingDirectory = dir;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set allowed directories (for Claude Code --add-dir flag)
  setAllowedDirectories(sessionId: number, directories: string[]): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info.isTerminalLaunched) return;
    session.info.allowedDirectories = directories;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Apply profile to session
  applyProfile(sessionId: number, profile: SessionProfile): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.info.isTerminalLaunched) return;

    session.info.mode = profile.mode;
    session.info.profileId = profile.id;
    session.info.permissionMode = profile.permissionMode;
    session.info.customFlags = [...profile.customFlags];
    session.info.envVars = { ...profile.envVars };
    session.info.wrapperCommand = profile.wrapperCommand;
    session.info.allowedDirectories = [...(profile.allowedDirectories || [])];
    if (profile.workingDirectory) {
      session.info.workingDirectory = profile.workingDirectory;
    }

    this.emit('sessionStatusUpdate', session.info);
  }

  // Close session - matches Swift closeSession
  closeSession(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Save final state before closing if persistence enabled
    if (this.persistenceEnabled) {
      if (session.info.isTerminalLaunched && session.pty) {
        const ptyState = {
          cwd: session.info.workingDirectory,
          environment: {} as Record<string, string>
        };
        sessionPersistenceManager.saveSessionState(session.info, ptyState);
      } else {
        sessionPersistenceManager.saveSessionState(session.info);
      }
    }

    // Clear timers
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.initTimer) clearTimeout(session.initTimer);

    // Kill process
    if (session.pty) {
      try {
        session.pty.kill();
      } catch (e) {
        // Process may already be dead
      }
    }

    this.sessions.delete(sessionId);
    this.emit('sessionClosed', sessionId);
  }

  // Close all sessions
  closeAllSessions(): void {
    for (const id of this.sessions.keys()) {
      this.closeSession(id);
    }
  }

  // Terminate session process but keep the session (reusable)
  terminateSession(sessionId: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Clear timers
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    if (session.initTimer) {
      clearTimeout(session.initTimer);
      session.initTimer = null;
    }

    // Kill PTY process if running
    if (session.pty) {
      try {
        session.pty.kill();
      } catch (e) {
        // Process may already be dead
      }
      session.pty = null;
    }

    // Reset session state to idle (reusable)
    session.info.status = SessionStatus.Idle;
    session.info.isTerminalLaunched = false;
    session.info.isClaudeRunning = false;
    session.info.terminalPid = 0;
    session.info.errorMessage = null;
    session.info.lastOutput = null;
    session.outputBuffer = '';
    session.lastOutputTime = null;

    // Emit events for frontend update
    this.emit('sessionTerminated', sessionId);
    this.emit('sessionStatusUpdate', session.info);

    return true;
  }

  // Terminate all sessions (stop processes but keep session cards)
  terminateAllSessions(): number {
    let count = 0;
    for (const id of this.sessions.keys()) {
      if (this.terminateSession(id)) {
        count++;
      }
    }
    return count;
  }

  // Update session status
  updateStatus(sessionId: number, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.info.status = status;
    this.emit('sessionStatusUpdate', session.info);
  }

  // Set running state - matches Swift isRunning
  setRunning(running: boolean): void {
    this.isRunning = running;
    this.emit('runningStateChanged', running);
  }

  getRunning(): boolean {
    return this.isRunning;
  }

  // Set default mode
  setDefaultMode(mode: TerminalMode): void {
    this.defaultMode = mode;
  }

  // Get session count
  getSessionCount(): number {
    return this.sessions.size;
  }

  // Get status summary - matches Swift statusSummary
  getStatusSummary(): Record<SessionStatus, number> {
    const summary: Record<SessionStatus, number> = {
      [SessionStatus.Initializing]: 0,
      [SessionStatus.Idle]: 0,
      [SessionStatus.Working]: 0,
      [SessionStatus.Waiting]: 0,
      [SessionStatus.Done]: 0,
      [SessionStatus.Error]: 0
    };

    for (const session of this.sessions.values()) {
      summary[session.info.status]++;
    }

    return summary;
  }

  // Session persistence management
  setPersistenceEnabled(enabled: boolean): void {
    this.persistenceEnabled = enabled;

    if (enabled && !this.saveTimer) {
      this.startPeriodicSave();
    } else if (!enabled && this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  isPersistenceEnabled(): boolean {
    return this.persistenceEnabled;
  }

  // Force save all session states
  forceSaveState(): void {
    this.saveAllSessionStates();
  }

  // Get command history for a session
  getSessionHistory(sessionId: number): string[] {
    return sessionPersistenceManager.getHistory(sessionId);
  }

  // Clear persistence data for a session
  clearSessionPersistenceData(sessionId: number): void {
    sessionPersistenceManager.clearSessionSnapshots(sessionId);
  }

  // Get persistence statistics
  getPersistenceStats(): any {
    return sessionPersistenceManager.getStats();
  }

  // Manual session restore from snapshots (for admin/debug)
  restoreSessionFromSnapshot(snapshotId: number): SessionInfo | null {
    const snapshot = sessionPersistenceManager.getSnapshot(snapshotId);
    if (!snapshot) return null;

    const sessionId = this.nextSessionId++;
    const restoredInfo = sessionPersistenceManager.restoreSession(snapshot, sessionId);

    const session: TerminalSession = {
      info: restoredInfo,
      pty: null,
      outputBuffer: '',
      lastOutputTime: null,
      idleTimer: null,
      initTimer: null
    };

    this.sessions.set(sessionId, session);
    this.emit('sessionCreated', session.info);
    return restoredInfo;
  }

  // Cleanup - stop all timers and save state
  shutdown(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }

    this.saveAllSessionStates();
    this.closeAllSessions();
  }
}

// Singleton export
export const sessionManager = new SessionManager();
