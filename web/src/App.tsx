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
  Circle
} from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { SessionCard, writeToSession } from './components/SessionCard';
import {
  SessionInfo,
  SessionStatus,
  SessionStatusConfig,
  TerminalMode,
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
    launchSession(sessionId, projectPath);
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, shouldLaunchTerminal: true } : s
    ));
  }, [launchSession, projectPath]);

  // Handle session close
  const handleClose = useCallback((sessionId: number) => {
    closeSession(sessionId);
  }, [closeSession]);

  // Handle session input
  const handleInput = useCallback((sessionId: number, data: string) => {
    sendInput(sessionId, data);
  }, [sendInput]);

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

        {/* Legend */}
        <div className="flex items-center gap-3">
          <LegendItem status={SessionStatus.Initializing} />
          <LegendItem status={SessionStatus.Idle} />
          <LegendItem status={SessionStatus.Working} />
          <LegendItem status={SessionStatus.Waiting} />
          <LegendItem status={SessionStatus.Done} />
          <LegendItem status={SessionStatus.Error} />
        </div>
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
                onLaunch={handleLaunch}
                onClose={handleClose}
                onInput={handleInput}
                onResize={handleResize}
                onSetMode={handleSetMode}
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
                    const config = SessionStatusConfig[session.status];
                    return (
                      <div
                        key={session.id}
                        className="w-24 h-20 rounded-lg flex flex-col items-center justify-center"
                        style={{
                          backgroundColor: `${config.color}33`,
                          borderWidth: 2,
                          borderColor: config.color
                        }}
                      >
                        <span className="text-lg font-bold">#{session.id}</span>
                        <span className="text-xs opacity-70">{config.label}</span>
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
    </div>
  );
};

export default App;
