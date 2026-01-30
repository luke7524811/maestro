/**
 * Main App component
 * Port of: ContentView.swift
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderOpen,
  Play,
  Square,
  Plus,
  Minus,
  Wifi,
  WifiOff,
  Circle,
  Settings
} from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { SessionCard, writeToSession } from './components/SessionCard';
import { SessionSettings } from './components/SessionSettings';
import { AppSettings } from './components/AppSettings';
import { CommandReference, CommandReferenceButton } from './components/CommandReference';
import {
  SessionInfo,
  SessionStatus,
  SessionStatusConfig,
  TerminalMode,
  TerminalModeConfig,
  AppState,
  GridConfiguration
} from './types';

// Calculate optimal grid - matches Swift GridConfiguration.optimal
function getOptimalGrid(count: number): GridConfiguration {
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

// Status legend item
const LegendItem: React.FC<{ status: SessionStatus }> = ({ status }) => {
  const config = SessionStatusConfig[status];
  return (
    <div className="flex items-center gap-1 text-xs">
      <Circle className="w-2 h-2" style={{ fill: config.color, color: config.color }} />
      <span className="text-ctp-subtext0">{config.label}</span>
    </div>
  );
};

const App: React.FC = () => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [projectPath, setProjectPath] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showCommandReference, setShowCommandReference] = useState(false);
  const [focusedSessionId, setFocusedSessionId] = useState<number | null>(null);
  const terminalWritersRef = useRef<Map<number, (data: string) => void>>(new Map());

  const {
    connected,
    sendInput,
    sendResize,
    createSession,
    launchSession,
    closeSession,
    setSessionMode,
    onOutput,
    onStatusUpdate,
    onSessionList,
    onSessionCreated,
    onSessionClosed
  } = useWebSocket();

  // Handle initial session list from server
  useEffect(() => {
    onSessionList((state: AppState) => {
      setSessions(state.sessions);
      setProjectPath(state.projectPath);
      setIsRunning(state.isRunning);
    });

    onSessionCreated((session: SessionInfo) => {
      setSessions(prev => [...prev, session]);
    });

    onSessionClosed((sessionId: number) => {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      terminalWritersRef.current.delete(sessionId);
    });

    onStatusUpdate((session: SessionInfo) => {
      setSessions(prev => prev.map(s =>
        s.id === session.id ? session : s
      ));
    });

    onOutput((sessionId: number, data: string) => {
      writeToSession(sessionId, data);
    });
  }, [onSessionList, onSessionCreated, onSessionClosed, onStatusUpdate, onOutput]);

  // Handle session launch
  const handleLaunch = useCallback((sessionId: number) => {
    // Use session's custom working directory if set, otherwise fall back to project path
    const session = sessions.find(s => s.id === sessionId);
    const workingDir = session?.workingDirectory || projectPath;
    launchSession(sessionId, workingDir);
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, shouldLaunchTerminal: true } : s
    ));
  }, [launchSession, projectPath, sessions]);

  // Handle session close
  const handleClose = useCallback((sessionId: number) => {
    closeSession(sessionId);
  }, [closeSession]);

  // Handle session input
  const handleInput = useCallback((sessionId: number, data: string) => {
    sendInput(sessionId, data);
  }, [sendInput]);

  // Handle session focus
  const handleSessionFocus = useCallback((sessionId: number) => {
    setFocusedSessionId(sessionId);
  }, []);

  // Handle session resize
  const handleResize = useCallback((sessionId: number, cols: number, rows: number) => {
    sendResize(sessionId, cols, rows);
  }, [sendResize]);

  // Handle mode change
  const handleSetMode = useCallback((sessionId: number, mode: TerminalMode) => {
    setSessionMode(sessionId, mode);
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, mode } : s
    ));
  }, [setSessionMode]);

  // Handle settings update
  const handleUpdateSettings = useCallback(async (sessionId: number, settings: Partial<SessionInfo>) => {
    // Update local state immediately
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, ...settings } : s
    ));

    // Update mode if changed
    if (settings.mode) {
      setSessionMode(sessionId, settings.mode);
    }

    // Update other settings via API
    try {
      if (settings.permissionMode !== undefined) {
        await fetch(`/api/sessions/${sessionId}/permission`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissionMode: settings.permissionMode })
        });
      }
      if (settings.workingDirectory !== undefined) {
        await fetch(`/api/sessions/${sessionId}/directory`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directory: settings.workingDirectory })
        });
      }
      if (settings.customFlags !== undefined) {
        await fetch(`/api/sessions/${sessionId}/flags`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flags: settings.customFlags })
        });
      }
      if (settings.envVars !== undefined) {
        await fetch(`/api/sessions/${sessionId}/env`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envVars: settings.envVars })
        });
      }
      if (settings.wrapperCommand !== undefined) {
        await fetch(`/api/sessions/${sessionId}/wrapper`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wrapper: settings.wrapperCommand })
        });
      }
    } catch (error) {
      console.error('Failed to update session settings:', error);
    }
  }, [setSessionMode]);

  // Handle save as profile
  const handleSaveAsProfile = useCallback(async (sessionId: number, name: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    try {
      await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mode: session.mode,
          permissionMode: session.permissionMode,
          workingDirectory: session.workingDirectory,
          customFlags: session.customFlags,
          envVars: session.envVars,
          wrapperCommand: session.wrapperCommand,
          isDefault: false
        })
      });
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  }, [sessions]);

  // Handle session rename
  const handleRename = useCallback(async (sessionId: number, name: string | null) => {
    // Update local state immediately
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, name } : s
    ));

    // Update via API
    try {
      await fetch(`/api/sessions/${sessionId}/name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
    } catch (error) {
      console.error('Failed to rename session:', error);
    }
  }, []);

  // Handle session duplicate
  const handleDuplicate = useCallback(async (sessionId: number) => {
    if (sessions.length >= 12) {
      console.warn('Maximum 12 sessions allowed');
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/duplicate`, {
        method: 'POST'
      });
      if (res.ok) {
        const newSession = await res.json();
        setSessions(prev => [...prev, newSession]);
      } else {
        console.error('Failed to duplicate session');
      }
    } catch (error) {
      console.error('Failed to duplicate session:', error);
    }
  }, [sessions.length]);

  // Handle add session
  const handleAddSession = useCallback(() => {
    if (sessions.length < 12) {
      createSession();
    }
  }, [createSession, sessions.length]);

  // Handle remove session (before running)
  const handleRemoveSession = useCallback(() => {
    if (sessions.length > 0 && !isRunning) {
      const lastSession = sessions[sessions.length - 1];
      closeSession(lastSession.id);
    }
  }, [sessions, isRunning, closeSession]);

  // Handle directory selection (simulated - would need file picker API or server endpoint)
  const handleSelectDirectory = useCallback(async () => {
    // In a real implementation, this would open a file picker
    // For now, prompt for path
    const path = window.prompt('Enter project path:', projectPath || '/workspace');
    if (path) {
      try {
        const res = await fetch('/api/project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
        if (res.ok) {
          setProjectPath(path);
        }
      } catch (error) {
        console.error('Failed to set project path:', error);
      }
    }
  }, [projectPath]);

  // Handle start all
  const handleStart = useCallback(async () => {
    try {
      await fetch('/api/start', { method: 'POST' });
      setIsRunning(true);
    } catch (error) {
      console.error('Failed to start:', error);
    }
  }, []);

  // Handle stop all
  const handleStop = useCallback(async () => {
    try {
      await fetch('/api/stop', { method: 'POST' });
      setIsRunning(false);
    } catch (error) {
      console.error('Failed to stop:', error);
    }
  }, []);

  // Calculate grid
  const grid = getOptimalGrid(sessions.length);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Alt+1-9 to focus session by index
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        if (index < sessions.length) {
          const session = sessions[index];
          setFocusedSessionId(session.id);
          // Focus the terminal if running
          const terminalEl = document.querySelector(`[data-session-id="${session.id}"]`) as HTMLElement;
          terminalEl?.click();
        }
      }

      // Alt+N to add new session
      if (e.altKey && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (sessions.length < 12) {
          handleAddSession();
        }
      }

      // Alt+ArrowLeft/ArrowRight to cycle focus
      if (e.altKey && !e.ctrlKey && !e.metaKey && isRunning) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const currentIndex = focusedSessionId
            ? sessions.findIndex(s => s.id === focusedSessionId)
            : -1;
          let newIndex: number;
          if (e.key === 'ArrowRight') {
            newIndex = currentIndex < sessions.length - 1 ? currentIndex + 1 : 0;
          } else {
            newIndex = currentIndex > 0 ? currentIndex - 1 : sessions.length - 1;
          }
          const newSession = sessions[newIndex];
          if (newSession) {
            setFocusedSessionId(newSession.id);
            const terminalEl = document.querySelector(`[data-session-id="${newSession.id}"]`) as HTMLElement;
            terminalEl?.click();
          }
        }
      }

      // Alt+? or Alt+/ to show command reference
      if (e.altKey && (e.key === '?' || e.key === '/') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowCommandReference(prev => !prev);
      }

      // Alt+, to show settings
      if (e.altKey && e.key === ',' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowAppSettings(prev => !prev);
      }

      // Escape to close modals
      if (e.key === 'Escape') {
        if (showCommandReference) {
          setShowCommandReference(false);
        } else if (showAppSettings) {
          setShowAppSettings(false);
        } else if (editingSessionId !== null) {
          setEditingSessionId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessions, focusedSessionId, isRunning, showCommandReference, showAppSettings, editingSessionId, handleAddSession]);

  return (
    <div className="h-screen flex flex-col bg-ctp-base text-ctp-text">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-2 bg-ctp-mantle border-b border-ctp-surface0">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="w-4 h-4 text-ctp-green" />
          ) : (
            <WifiOff className="w-4 h-4 text-ctp-red" />
          )}
          <span className="text-xs text-ctp-subtext0">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex-1" />

        {/* Command Reference button */}
        <CommandReferenceButton onClick={() => setShowCommandReference(true)} />

        {/* Separator */}
        <div className="w-px h-4 bg-ctp-surface1" />

        {/* Legend */}
        <div className="flex items-center gap-3">
          <LegendItem status={SessionStatus.Initializing} />
          <LegendItem status={SessionStatus.Idle} />
          <LegendItem status={SessionStatus.Working} />
          <LegendItem status={SessionStatus.Waiting} />
          <LegendItem status={SessionStatus.Done} />
          <LegendItem status={SessionStatus.Error} />
        </div>

        {/* App settings button */}
        <button
          onClick={() => setShowAppSettings(true)}
          className="p-2 rounded-lg hover:bg-ctp-surface0 text-ctp-subtext0 hover:text-ctp-mauve"
          title="Application Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden p-2">
        {isRunning ? (
          /* Terminal Grid */
          <div
            className="grid gap-2 h-full"
            style={{
              gridTemplateColumns: `repeat(${grid.columns}, 1fr)`,
              gridTemplateRows: `repeat(${grid.rows}, 1fr)`
            }}
          >
            {sessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                isFocused={focusedSessionId === session.id}
                onLaunch={handleLaunch}
                onClose={handleClose}
                onInput={handleInput}
                onResize={handleResize}
                onSetMode={handleSetMode}
                onUpdateSettings={handleUpdateSettings}
                onSaveAsProfile={handleSaveAsProfile}
                onFocus={handleSessionFocus}
                onRename={handleRename}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        ) : (
          /* Pre-launch view */
          <div className="h-full flex flex-col items-center justify-center">
            {/* Session count picker */}
            <div className="mb-6 flex items-center gap-4">
              <button
                onClick={handleRemoveSession}
                disabled={sessions.length === 0}
                className="w-10 h-10 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 disabled:opacity-30 flex items-center justify-center"
              >
                <Minus className="w-5 h-5" />
              </button>

              <div className="text-center">
                <div className="text-4xl font-bold text-ctp-mauve">{sessions.length}</div>
                <div className="text-xs text-ctp-subtext0">sessions</div>
              </div>

              <button
                onClick={handleAddSession}
                disabled={sessions.length >= 12}
                className="w-10 h-10 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 disabled:opacity-30 flex items-center justify-center"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Session preview grid */}
            {sessions.length > 0 && (
              <div className="mb-8 p-6 rounded-2xl bg-ctp-mantle/50 backdrop-blur border border-ctp-surface0">
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${grid.columns}, 1fr)`
                  }}
                >
                  {sessions.map(session => {
                    const modeConfig = TerminalModeConfig[session.mode];
                    return (
                      <div
                        key={session.id}
                        className="w-32 h-24 rounded-lg flex flex-col p-2 relative group"
                        style={{
                          backgroundColor: `${modeConfig.color}1a`,
                          borderWidth: 2,
                          borderColor: modeConfig.color
                        }}
                      >
                        {/* Settings button (visible on hover) */}
                        <button
                          onClick={() => setEditingSessionId(session.id)}
                          className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-ctp-surface0/50 transition-opacity"
                          title="Configure session"
                        >
                          <Settings className="w-3 h-3 text-ctp-subtext0" />
                        </button>

                        <div className="flex-1 flex flex-col items-center justify-center">
                          <span className="text-sm font-bold" style={{ color: modeConfig.color }}>
                            {modeConfig.shortLabel}
                          </span>
                          <span className="text-xs text-ctp-subtext0">#{session.id}</span>
                        </div>

                        {/* Show permission mode if not default */}
                        {session.permissionMode && session.permissionMode !== 'default' && (
                          <div className="text-[10px] text-center text-ctp-subtext0 truncate">
                            {session.permissionMode}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Project path */}
            {projectPath && (
              <div className="flex items-center gap-2 mb-4 text-ctp-blue">
                <FolderOpen className="w-4 h-4" />
                <span className="text-sm truncate max-w-md">{projectPath}</span>
              </div>
            )}

            <p className="text-ctp-subtext0 mb-6">
              {sessions.length === 0
                ? 'Add sessions to get started'
                : projectPath
                  ? 'Ready to launch!'
                  : 'Select a directory to launch sessions'}
            </p>
          </div>
        )}
      </main>

      {/* Footer controls */}
      <footer className="flex items-center justify-center gap-3 px-4 py-3 bg-ctp-mantle border-t border-ctp-surface0">
        <button
          onClick={handleSelectDirectory}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 disabled:opacity-50"
        >
          <FolderOpen className="w-4 h-4" />
          Select Directory
        </button>

        {isRunning ? (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ctp-red hover:bg-ctp-red/80 text-ctp-base font-medium"
          >
            <Square className="w-4 h-4" />
            Stop All
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!projectPath || sessions.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ctp-blue hover:bg-ctp-blue/80 text-ctp-base font-medium disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Launch {sessions.length} Session{sessions.length !== 1 ? 's' : ''}
          </button>
        )}

        {isRunning && sessions.length < 12 && (
          <button
            onClick={handleAddSession}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1"
          >
            <Plus className="w-4 h-4" />
            Add Session
          </button>
        )}
      </footer>

      {/* Settings modal for pre-launch editing */}
      {editingSessionId !== null && (
        <SessionSettings
          session={sessions.find(s => s.id === editingSessionId)!}
          onClose={() => setEditingSessionId(null)}
          onSave={(settings) => {
            handleUpdateSettings(editingSessionId, settings);
            setEditingSessionId(null);
          }}
          onSaveAsProfile={(name) => handleSaveAsProfile(editingSessionId, name)}
        />
      )}

      {/* App settings modal */}
      {showAppSettings && (
        <AppSettings onClose={() => setShowAppSettings(false)} />
      )}

      {/* Command Reference modal */}
      {showCommandReference && (
        <CommandReference onClose={() => setShowCommandReference(false)} />
      )}
    </div>
  );
};

export default App;
