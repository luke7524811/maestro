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
  // Profile-related fields
  profileId: string | null;
  permissionMode: string;
  customFlags: string[];
  envVars: Record<string, string>;
  wrapperCommand: string | null;
}

// Permission modes for Claude Code
export enum ClaudePermissionMode {
  Default = 'default',
  AcceptEdits = 'acceptEdits',
  BypassPermissions = 'bypassPermissions',
  Plan = 'plan',
  DontAsk = 'dontAsk'
}

// Approval modes for OpenAI Codex
export enum CodexApprovalMode {
  Default = 'default',
  OnFailure = 'on-failure',
  OnRequest = 'on-request',
  FullAuto = 'full-auto',
  DangerousBypass = 'dangerous-bypass'
}

// Permission mode configs for UI
export const PermissionModeConfig: Record<TerminalMode, {
  modes: string[];
  labels: Record<string, string>;
  descriptions: Record<string, string>
}> = {
  [TerminalMode.ClaudeCode]: {
    modes: Object.values(ClaudePermissionMode),
    labels: {
      [ClaudePermissionMode.Default]: 'Default',
      [ClaudePermissionMode.AcceptEdits]: 'Accept Edits',
      [ClaudePermissionMode.BypassPermissions]: 'Bypass All',
      [ClaudePermissionMode.Plan]: 'Plan Mode',
      [ClaudePermissionMode.DontAsk]: "Don't Ask"
    },
    descriptions: {
      [ClaudePermissionMode.Default]: 'Normal interactive permissions',
      [ClaudePermissionMode.AcceptEdits]: 'Auto-accept file edits',
      [ClaudePermissionMode.BypassPermissions]: 'Skip all permission checks (dangerous)',
      [ClaudePermissionMode.Plan]: 'Plan mode only, no execution',
      [ClaudePermissionMode.DontAsk]: 'Execute without asking'
    }
  },
  [TerminalMode.OpenAiCodex]: {
    modes: Object.values(CodexApprovalMode),
    labels: {
      [CodexApprovalMode.Default]: 'Default',
      [CodexApprovalMode.OnFailure]: 'On Failure',
      [CodexApprovalMode.OnRequest]: 'On Request',
      [CodexApprovalMode.FullAuto]: 'Full Auto',
      [CodexApprovalMode.DangerousBypass]: 'Bypass All'
    },
    descriptions: {
      [CodexApprovalMode.Default]: 'Interactive approval for commands',
      [CodexApprovalMode.OnFailure]: 'Auto-run, ask only on failure',
      [CodexApprovalMode.OnRequest]: 'Model decides when to ask',
      [CodexApprovalMode.FullAuto]: 'Sandboxed automatic execution',
      [CodexApprovalMode.DangerousBypass]: 'Skip all checks (dangerous)'
    }
  },
  [TerminalMode.GeminiCli]: {
    modes: ['default'],
    labels: { default: 'Default' },
    descriptions: { default: 'Standard Gemini CLI mode' }
  },
  [TerminalMode.PlainTerminal]: {
    modes: ['default'],
    labels: { default: 'Default' },
    descriptions: { default: 'Standard shell' }
  }
};

// Session profile - saveable configuration
export interface SessionProfile {
  id: string;
  name: string;
  mode: TerminalMode;
  permissionMode: string;
  workingDirectory: string | null;
  customFlags: string[];
  envVars: Record<string, string>;
  wrapperCommand: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Directory entry for file browser
export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
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
