/**
 * SessionPersistence - Types and interfaces for session state persistence
 * Allows sessions to survive container restarts with their state intact
 */

export interface SessionSnapshot {
  id: number;
  info: {
    name: string | null; // Custom session name
    mode: string;
    assignedBranch: string | null;
    workingDirectory: string | null;
    profileId: string | null;
    permissionMode: string;
    customFlags: string[];
    envVars: Record<string, string>;
    wrapperCommand: string | null;
    customRunCommand: string | null;
  };
  // PTY state - we can't persist the actual PTY but can restore context
  ptyState: {
    cwd: string | null;
    environment: Record<string, string>;
    lastCommand: string | null;
    commandHistory: string[];
  };
  // Restore metadata
  savedAt: string;
  wasLaunched: boolean;
  wasRunning: boolean;
}

export interface SessionPersistenceOptions {
  maxSnapshots: number;
  autoSaveInterval: number; // milliseconds
  snapshotOnExit: boolean;
  restoreOnStartup: boolean;
}

export const DEFAULT_PERSISTENCE_OPTIONS: SessionPersistenceOptions = {
  maxSnapshots: 50, // Keep last 50 session states
  autoSaveInterval: 30000, // Save every 30 seconds
  snapshotOnExit: true,
  restoreOnStartup: true
};

// What gets persisted vs what gets reset
export interface SessionRestoreStrategy {
  restoreConfiguration: boolean; // Always restore (mode, flags, env vars)
  restoreWorkingDirectory: boolean; // Restore if directory exists
  restoreLaunchedState: boolean; // Whether to auto-launch restored sessions
  restoreTerminalState: boolean; // Attempt to restore terminal context
}

export const DEFAULT_RESTORE_STRATEGY: SessionRestoreStrategy = {
  restoreConfiguration: true,
  restoreWorkingDirectory: true,
  restoreLaunchedState: false, // Don't auto-launch - user choice
  restoreTerminalState: true
};