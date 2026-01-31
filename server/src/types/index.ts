/**
 * Types for Maestro Web - ported from Swift
 * Mirrors: ContentView.swift TerminalMode, SessionStatus, SessionInfo
 */

// TerminalMode - matches Swift enum
export enum TerminalMode {
  ClaudeCode = 'Claude Code',
  GeminiCli = 'Gemini CLI',
  OpenAiCodex = 'OpenAI Codex',
  PlainTerminal = 'Plain Terminal'
}

// Mode metadata - matches Swift computed properties
export const TerminalModeConfig: Record<TerminalMode, {
  icon: string;
  color: string;
  command: string | null;
  processName: string | null;
  installHint: string;
}> = {
  [TerminalMode.ClaudeCode]: {
    icon: 'brain',
    color: '#9333ea', // purple
    command: 'claude',
    processName: 'claude',
    installHint: 'npm install -g @anthropic-ai/claude-code'
  },
  [TerminalMode.GeminiCli]: {
    icon: 'sparkles',
    color: '#3b82f6', // blue
    command: 'gemini',
    processName: 'gemini',
    installHint: 'npm install -g @google/gemini-cli'
  },
  [TerminalMode.OpenAiCodex]: {
    icon: 'cpu',
    color: '#22c55e', // green
    command: 'codex',
    processName: 'codex',
    installHint: 'npm install -g @openai/codex'
  },
  [TerminalMode.PlainTerminal]: {
    icon: 'terminal',
    color: '#6b7280', // gray
    command: null,
    processName: null,
    installHint: ''
  }
};

// SessionStatus - matches Swift enum
export enum SessionStatus {
  Initializing = 'initializing',
  Idle = 'idle',
  Working = 'working',
  Waiting = 'waiting',
  Done = 'done',
  Error = 'error'
}

// Status metadata - matches Swift computed properties
export const SessionStatusConfig: Record<SessionStatus, {
  color: string;
  icon: string;
  label: string;
}> = {
  [SessionStatus.Initializing]: {
    color: '#f97316', // orange
    icon: 'hourglass',
    label: 'Starting...'
  },
  [SessionStatus.Idle]: {
    color: '#6b7280', // gray
    icon: 'circle.fill',
    label: 'Idle'
  },
  [SessionStatus.Working]: {
    color: '#3b82f6', // blue
    icon: 'arrow.triangle.2.circlepath',
    label: 'Working'
  },
  [SessionStatus.Waiting]: {
    color: '#eab308', // yellow
    icon: 'exclamationmark.circle.fill',
    label: 'Needs Input'
  },
  [SessionStatus.Done]: {
    color: '#22c55e', // green
    icon: 'checkmark.circle.fill',
    label: 'Done'
  },
  [SessionStatus.Error]: {
    color: '#ef4444', // red
    icon: 'xmark.circle.fill',
    label: 'Error'
  }
};

// SessionInfo - matches Swift struct
export interface SessionInfo {
  id: number;
  name: string | null; // Custom session name/label
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
  allowedDirectories: string[];  // Additional directories the CLI can access
  // Error tracking
  errorMessage: string | null;
  lastOutput: string | null;
}

// Create default session - matches Swift init
export function createSession(id: number, mode: TerminalMode = TerminalMode.ClaudeCode): SessionInfo {
  return {
    id,
    name: null, // Default to null, shows as "Mode #id" when not set
    status: SessionStatus.Idle,
    mode,
    assignedBranch: null,
    currentBranch: null,
    workingDirectory: null,
    shouldLaunchTerminal: false,
    isTerminalLaunched: false,
    isClaudeRunning: false,
    isVisible: true,
    terminalPid: null,
    assignedPort: null,
    customRunCommand: null,
    isAppRunning: false,
    serverURL: null,
    // Profile defaults
    profileId: null,
    permissionMode: 'default',
    customFlags: [],
    envVars: {},
    wrapperCommand: null,
    allowedDirectories: [],  // Additional directories the CLI can access
    // Error tracking
    errorMessage: null,
    lastOutput: null
  };
}

// WebSocket message types
export enum WSMessageType {
  // Client -> Server
  SessionCreate = 'session:create',
  SessionLaunch = 'session:launch',
  SessionClose = 'session:close',
  SessionInput = 'session:input',
  SessionResize = 'session:resize',
  SessionSetMode = 'session:setMode',
  SessionSetBranch = 'session:setBranch',
  SessionSetAllowedDirs = 'session:setAllowedDirs',

  // Server -> Client
  SessionOutput = 'session:output',
  SessionStatusUpdate = 'session:statusUpdate',
  SessionList = 'session:list',
  SessionCreated = 'session:created',
  SessionClosed = 'session:closed',
  SessionTerminated = 'session:terminated',  // Process killed but session kept
  Error = 'error'
}

export interface WSMessage {
  type: WSMessageType;
  sessionId?: number;
  payload?: unknown;
}

// Terminal resize dimensions
export interface TerminalDimensions {
  cols: number;
  rows: number;
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
export const PermissionModeConfig: Record<TerminalMode, { modes: string[]; labels: Record<string, string>; descriptions: Record<string, string> }> = {
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
  allowedDirectories: string[];  // Additional directories the CLI can access
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Create default profile
export function createDefaultProfile(mode: TerminalMode): SessionProfile {
  return {
    id: `default-${mode.toLowerCase().replace(/\s+/g, '-')}`,
    name: `Default ${mode}`,
    mode,
    permissionMode: 'default',
    workingDirectory: null,
    customFlags: [],
    envVars: {},
    wrapperCommand: null,
    allowedDirectories: [],
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// Grid configuration - matches Swift GridConfiguration
export interface GridConfiguration {
  rows: number;
  columns: number;
}

export function getOptimalGrid(count: number): GridConfiguration {
  switch (count) {
    case 1: return { rows: 1, columns: 1 };
    case 2: return { rows: 1, columns: 2 };
    case 3: return { rows: 1, columns: 3 };
    case 4: return { rows: 2, columns: 2 };
    case 5:
    case 6: return { rows: 2, columns: 3 };
    case 7:
    case 8: return { rows: 2, columns: 4 };
    case 9: return { rows: 3, columns: 3 };
    case 10:
    case 11:
    case 12: return { rows: 3, columns: 4 };
    default: return { rows: 2, columns: 3 };
  }
}
