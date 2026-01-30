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

  constructor() {
    super();
    // Detect shell - matches Swift ProcessInfo.processInfo.environment["SHELL"]
    this.defaultShell = process.env.SHELL || '/bin/bash';
  }

  // Get all sessions - matches Swift sessions array
  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => s.info);
  }

  // Get single session
  getSession(id: number): SessionInfo | undefined {
    return this.sessions.get(id)?.info;
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

    session.outputBuffer += data;
    session.lastOutputTime = new Date();

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
        session.info.status = SessionStatus.Error;
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
  }

  // Send command with carriage return - matches Swift Coordinator.sendCommand
  sendCommand(sessionId: number, command: string): void {
    this.sendInput(sessionId, command + '\r');
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
    if (profile.workingDirectory) {
      session.info.workingDirectory = profile.workingDirectory;
    }

    this.emit('sessionStatusUpdate', session.info);
  }

  // Close session - matches Swift closeSession
  closeSession(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

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
}

// Singleton export
export const sessionManager = new SessionManager();
