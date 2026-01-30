/**
 * SessionPersistenceManager - manages session state persistence
 * Saves session snapshots and restores them on startup
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  SessionSnapshot,
  SessionPersistenceOptions,
  SessionRestoreStrategy,
  DEFAULT_PERSISTENCE_OPTIONS,
  DEFAULT_RESTORE_STRATEGY
} from '../types/SessionPersistence.js';
import {
  SessionInfo,
  SessionStatus,
  TerminalMode,
  createSession
} from '../types/index.js';

export class SessionPersistenceManager extends EventEmitter {
  private configDir: string;
  private snapshotsPath: string;
  private snapshots: Map<number, SessionSnapshot> = new Map();
  private options: SessionPersistenceOptions;
  private strategy: SessionRestoreStrategy;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private commandHistory: Map<number, string[]> = new Map();
  private isShuttingDown: boolean = false;

  constructor(configDir: string = '/app/config') {
    super();
    this.configDir = configDir;
    this.snapshotsPath = path.join(configDir, 'session-snapshots.json');
    this.options = { ...DEFAULT_PERSISTENCE_OPTIONS };
    this.strategy = { ...DEFAULT_RESTORE_STRATEGY };

    this.loadSnapshots();
    this.startAutoSave();

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  // Load session snapshots from disk
  private loadSnapshots(): void {
    try {
      if (fs.existsSync(this.snapshotsPath)) {
        const data = fs.readFileSync(this.snapshotsPath, 'utf-8');
        const snapshots: SessionSnapshot[] = JSON.parse(data);

        // Load snapshots, keeping only recent ones
        const now = new Date();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        snapshots
          .filter(snap => {
            const age = now.getTime() - new Date(snap.savedAt).getTime();
            return age < maxAge;
          })
          .slice(-this.options.maxSnapshots)
          .forEach(snap => this.snapshots.set(snap.id, snap));

        console.log(`Loaded ${this.snapshots.size} session snapshots`);
      }
    } catch (error) {
      console.error('Failed to load session snapshots:', error);
    }
  }

  // Save snapshots to disk
  private saveSnapshots(): void {
    if (this.isShuttingDown) return;

    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      const snapshotArray = Array.from(this.snapshots.values())
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
        .slice(0, this.options.maxSnapshots);

      const data = JSON.stringify(snapshotArray, null, 2);
      fs.writeFileSync(this.snapshotsPath, data, 'utf-8');
    } catch (error) {
      console.error('Failed to save session snapshots:', error);
    }
  }

  // Start auto-save timer
  private startAutoSave(): void {
    if (this.options.autoSaveInterval > 0) {
      this.autoSaveTimer = setInterval(() => {
        this.saveSnapshots();
      }, this.options.autoSaveInterval);
    }
  }

  // Stop auto-save and perform final save
  private shutdown(): void {
    this.isShuttingDown = true;

    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    if (this.options.snapshotOnExit) {
      this.saveSnapshots();
    }
  }

  // Create a snapshot of a session
  createSnapshot(sessionInfo: SessionInfo, ptyState?: {
    cwd: string | null;
    environment: Record<string, string>;
  }): SessionSnapshot {
    const history = this.commandHistory.get(sessionInfo.id) || [];
    const lastCommand = history[history.length - 1] || null;

    const snapshot: SessionSnapshot = {
      id: sessionInfo.id,
      info: {
        name: sessionInfo.name,
        mode: sessionInfo.mode,
        assignedBranch: sessionInfo.assignedBranch,
        workingDirectory: sessionInfo.workingDirectory,
        profileId: sessionInfo.profileId,
        permissionMode: sessionInfo.permissionMode,
        customFlags: [...sessionInfo.customFlags],
        envVars: { ...sessionInfo.envVars },
        wrapperCommand: sessionInfo.wrapperCommand,
        customRunCommand: sessionInfo.customRunCommand
      },
      ptyState: {
        cwd: ptyState?.cwd || sessionInfo.workingDirectory,
        environment: ptyState?.environment ? { ...ptyState.environment } : {},
        lastCommand,
        commandHistory: [...history]
      },
      savedAt: new Date().toISOString(),
      wasLaunched: sessionInfo.isTerminalLaunched,
      wasRunning: sessionInfo.status === SessionStatus.Working ||
                  sessionInfo.status === SessionStatus.Waiting
    };

    this.snapshots.set(sessionInfo.id, snapshot);
    this.emit('snapshotCreated', snapshot);
    return snapshot;
  }

  // Save a session's current state
  saveSessionState(sessionInfo: SessionInfo, ptyState?: {
    cwd: string | null;
    environment: Record<string, string>;
  }): void {
    this.createSnapshot(sessionInfo, ptyState);
  }

  // Get all available snapshots for restoration
  getSnapshots(): SessionSnapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }

  // Get snapshot for specific session ID
  getSnapshot(sessionId: number): SessionSnapshot | undefined {
    return this.snapshots.get(sessionId);
  }

  // Restore sessions that should be automatically restored
  getSessionsToRestore(): SessionSnapshot[] {
    if (!this.options.restoreOnStartup) {
      return [];
    }

    // Return snapshots from most recent session, filtering by strategy
    return this.getSnapshots().filter(snap => {
      // Always restore if it was configured but not necessarily launched
      return true; // Let the session manager decide what to do with each snapshot
    });
  }

  // Restore a session from snapshot, returns the created SessionInfo
  restoreSession(snapshot: SessionSnapshot, nextSessionId: number): SessionInfo {
    const mode = snapshot.info.mode as TerminalMode;
    const sessionInfo = createSession(nextSessionId, mode);

    // Apply restoration strategy
    if (this.strategy.restoreConfiguration) {
      sessionInfo.name = snapshot.info.name || null; // Restore custom name
      sessionInfo.mode = mode;
      sessionInfo.profileId = snapshot.info.profileId;
      sessionInfo.permissionMode = snapshot.info.permissionMode;
      sessionInfo.customFlags = [...snapshot.info.customFlags];
      sessionInfo.envVars = { ...snapshot.info.envVars };
      sessionInfo.wrapperCommand = snapshot.info.wrapperCommand;
      sessionInfo.customRunCommand = snapshot.info.customRunCommand;
      sessionInfo.assignedBranch = snapshot.info.assignedBranch;
    }

    if (this.strategy.restoreWorkingDirectory && snapshot.info.workingDirectory) {
      // Check if directory still exists
      try {
        if (fs.existsSync(snapshot.info.workingDirectory)) {
          sessionInfo.workingDirectory = snapshot.info.workingDirectory;
        }
      } catch (error) {
        // Directory doesn't exist or not accessible, leave as null
      }
    }

    // Don't restore launched state by default - let user decide
    // if (this.strategy.restoreLaunchedState && snapshot.wasLaunched) {
    //   sessionInfo.shouldLaunchTerminal = true;
    // }

    // Restore command history for this session
    if (this.strategy.restoreTerminalState && snapshot.ptyState.commandHistory.length > 0) {
      this.commandHistory.set(nextSessionId, snapshot.ptyState.commandHistory);
    }

    return sessionInfo;
  }

  // Track command history for a session
  addToHistory(sessionId: number, command: string): void {
    if (!command.trim()) return;

    let history = this.commandHistory.get(sessionId) || [];

    // Don't add duplicates of the last command
    if (history[history.length - 1] !== command.trim()) {
      history.push(command.trim());

      // Keep history manageable
      if (history.length > 100) {
        history = history.slice(-50); // Keep last 50 commands
      }

      this.commandHistory.set(sessionId, history);
    }
  }

  // Get command history for a session
  getHistory(sessionId: number): string[] {
    return this.commandHistory.get(sessionId) || [];
  }

  // Clear snapshots for a specific session
  clearSessionSnapshots(sessionId: number): void {
    this.snapshots.delete(sessionId);
    this.commandHistory.delete(sessionId);
    this.saveSnapshots();
  }

  // Clear all snapshots
  clearAllSnapshots(): void {
    this.snapshots.clear();
    this.commandHistory.clear();
    this.saveSnapshots();
  }

  // Update persistence options
  updateOptions(options: Partial<SessionPersistenceOptions>): void {
    this.options = { ...this.options, ...options };

    // Restart auto-save with new interval
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    this.startAutoSave();
  }

  // Update restore strategy
  updateStrategy(strategy: Partial<SessionRestoreStrategy>): void {
    this.strategy = { ...this.strategy, ...strategy };
  }

  // Get current options
  getOptions(): SessionPersistenceOptions {
    return { ...this.options };
  }

  // Get current strategy
  getStrategy(): SessionRestoreStrategy {
    return { ...this.strategy };
  }

  // Get statistics
  getStats(): {
    totalSnapshots: number;
    oldestSnapshot: string | null;
    newestSnapshot: string | null;
    totalSessions: number;
  } {
    const snapshots = this.getSnapshots();
    return {
      totalSnapshots: snapshots.length,
      oldestSnapshot: snapshots[snapshots.length - 1]?.savedAt || null,
      newestSnapshot: snapshots[0]?.savedAt || null,
      totalSessions: new Set(snapshots.map(s => s.id)).size
    };
  }
}

// Singleton export
export const sessionPersistenceManager = new SessionPersistenceManager();