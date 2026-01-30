/**
 * Shared types for Maestro Web frontend
 * Mirrors server types for consistency
 */

export enum TerminalMode {
  ClaudeCode = 'Claude Code',
  GeminiCli = 'Gemini CLI',
  OpenAiCodex = 'OpenAI Codex',
  PlainTerminal = 'Plain Terminal'
}

export const TERMINAL_MODES = Object.values(TerminalMode);

export const TerminalModeConfig: Record<TerminalMode, {
  icon: string;
  color: string;
  shortLabel: string;
}> = {
  [TerminalMode.ClaudeCode]: {
    icon: 'Brain',
    color: '#9333ea',
    shortLabel: 'Claude'
  },
  [TerminalMode.GeminiCli]: {
    icon: 'Sparkles',
    color: '#3b82f6',
    shortLabel: 'Gemini'
  },
  [TerminalMode.OpenAiCodex]: {
    icon: 'Cpu',
    color: '#22c55e',
    shortLabel: 'Codex'
  },
  [TerminalMode.PlainTerminal]: {
    icon: 'Terminal',
    color: '#6b7280',
    shortLabel: 'Terminal'
  }
};

export enum SessionStatus {
  Initializing = 'initializing',
  Idle = 'idle',
  Working = 'working',
  Waiting = 'waiting',
  Done = 'done',
  Error = 'error'
}

export const SessionStatusConfig: Record<SessionStatus, {
  color: string;
  icon: string;
  label: string;
}> = {
  [SessionStatus.Initializing]: {
    color: '#f97316',
    icon: 'Clock',
    label: 'Starting...'
  },
  [SessionStatus.Idle]: {
    color: '#6b7280',
    icon: 'Circle',
    label: 'Idle'
  },
  [SessionStatus.Working]: {
    color: '#3b82f6',
    icon: 'RefreshCw',
    label: 'Working'
  },
  [SessionStatus.Waiting]: {
    color: '#eab308',
    icon: 'AlertCircle',
    label: 'Needs Input'
  },
  [SessionStatus.Done]: {
    color: '#22c55e',
    icon: 'CheckCircle',
    label: 'Done'
  },
  [SessionStatus.Error]: {
    color: '#ef4444',
    icon: 'XCircle',
    label: 'Error'
  }
};

export interface SessionInfo {
  id: number;
  status: SessionStatus;
  mode: TerminalMode;
  assignedBranch: string | null;
  currentBranch: string | null;
  workingDirectory: string | null;
  shouldLaunchTerminal: boolean;
  isTerminalLaunched: boolean;
  isClaudeRunning: boolean;
  isVisible: boolean;
  terminalPid: number | null;
  assignedPort: number | null;
  customRunCommand: string | null;
  isAppRunning: boolean;
  serverURL: string | null;
}

export interface GridConfiguration {
  rows: number;
  columns: number;
}

export enum WSMessageType {
  SessionCreate = 'session:create',
  SessionLaunch = 'session:launch',
  SessionClose = 'session:close',
  SessionInput = 'session:input',
  SessionResize = 'session:resize',
  SessionSetMode = 'session:setMode',
  SessionSetBranch = 'session:setBranch',
  SessionOutput = 'session:output',
  SessionStatusUpdate = 'session:statusUpdate',
  SessionList = 'session:list',
  SessionCreated = 'session:created',
  SessionClosed = 'session:closed',
  Error = 'error'
}

export interface WSMessage {
  type: WSMessageType;
  sessionId?: number;
  payload?: unknown;
}

export interface AppState {
  sessions: SessionInfo[];
  projectPath: string;
  isRunning: boolean;
  grid: GridConfiguration;
}
