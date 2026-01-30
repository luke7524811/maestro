/**
 * SessionCard component - displays a single terminal session
 * Port of: TerminalSessionView.swift
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Brain,
  Sparkles,
  Cpu,
  Terminal as TerminalIcon,
  Circle,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  X,
  Play,
  ChevronDown,
  ExternalLink,
  Settings,
  LucideProps
} from 'lucide-react';
import { SessionSettings } from './SessionSettings';
import {
  SessionInfo,
  SessionStatus,
  SessionStatusConfig,
  TerminalMode,
  TerminalModeConfig,
  TERMINAL_MODES
} from '../types';
import { Terminal, getTerminalWriter } from './Terminal';

interface SessionCardProps {
  session: SessionInfo;
  onLaunch: (sessionId: number) => void;
  onClose: (sessionId: number) => void;
  onInput: (sessionId: number, data: string) => void;
  onResize: (sessionId: number, cols: number, rows: number) => void;
  onSetMode: (sessionId: number, mode: TerminalMode) => void;
  onUpdateSettings: (sessionId: number, settings: Partial<SessionInfo>) => void;
  onSaveAsProfile?: (sessionId: number, name: string) => void;
}

// Icon map for dynamic rendering
const StatusIcons: Record<string, React.FC<LucideProps>> = {
  Clock,
  Circle,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle
};

const ModeIcons: Record<string, React.FC<LucideProps>> = {
  Brain,
  Sparkles,
  Cpu,
  Terminal: TerminalIcon
};

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onLaunch,
  onClose,
  onInput,
  onResize,
  onSetMode,
  onUpdateSettings,
  onSaveAsProfile
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const statusConfig = SessionStatusConfig[session.status];
  const modeConfig = TerminalModeConfig[session.mode];
  const StatusIcon = StatusIcons[statusConfig.icon] || Circle;
  const ModeIcon = ModeIcons[modeConfig.icon] || TerminalIcon;

  // Determine if terminal should be shown
  const showTerminal = session.isTerminalLaunched;
  const showLaunchPlaceholder = !session.shouldLaunchTerminal && !session.isTerminalLaunched;
  const isWorking = session.status === SessionStatus.Working;

  // Handle terminal data
  const handleData = useCallback((data: string) => {
    onInput(session.id, data);
  }, [session.id, onInput]);

  // Handle terminal resize
  const handleResize = useCallback((cols: number, rows: number) => {
    onResize(session.id, cols, rows);
  }, [session.id, onResize]);

  // Handle launch click
  const handleLaunch = useCallback(() => {
    onLaunch(session.id);
  }, [session.id, onLaunch]);

  // Handle close click
  const handleClose = useCallback(() => {
    onClose(session.id);
  }, [session.id, onClose]);

  // Mode selector dropdown
  const [showModeMenu, setShowModeMenu] = React.useState(false);

  // Handle settings save
  const handleSettingsSave = useCallback((settings: Partial<SessionInfo>) => {
    onUpdateSettings(session.id, settings);
  }, [session.id, onUpdateSettings]);

  // Handle save as profile
  const handleSaveAsProfile = useCallback((name: string) => {
    if (onSaveAsProfile) {
      onSaveAsProfile(session.id, name);
    }
  }, [session.id, onSaveAsProfile]);

  // Border color based on status
  const borderColor = statusConfig.color;
  const borderClass = isWorking ? 'status-working' : '';

  return (
    <div
      className={`session-card ${borderClass}`}
      style={{ borderColor }}
    >
      {/* Header bar - matches Swift HStack */}
      <div
        className="flex items-center gap-2 px-2 py-1"
        style={{ backgroundColor: `${statusConfig.color}26` }}
      >
        {/* Status indicator */}
        <StatusIcon
          className="w-3 h-3"
          color={statusConfig.color}
        />

        {/* Mode picker dropdown */}
        <div className="relative">
          <button
            onClick={() => !session.isTerminalLaunched && setShowModeMenu(!showModeMenu)}
            disabled={session.isTerminalLaunched}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-ctp-surface0 disabled:opacity-50"
            style={{ backgroundColor: `${modeConfig.color}1a` }}
          >
            <ModeIcon className="w-3 h-3" color={modeConfig.color} />
            <ChevronDown className="w-2 h-2 text-ctp-subtext0" />
          </button>

          {showModeMenu && (
            <div className="absolute top-full left-0 mt-1 bg-ctp-surface0 rounded-md shadow-lg z-10 py-1 min-w-[140px]">
              {TERMINAL_MODES.map((mode) => {
                const config = TerminalModeConfig[mode];
                const Icon = ModeIcons[config.icon] || TerminalIcon;
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      onSetMode(session.id, mode);
                      setShowModeMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-ctp-surface1 text-sm"
                  >
                    <Icon className="w-4 h-4" color={config.color} />
                    <span>{mode}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Session label */}
        <span
          className="text-xs font-medium"
          style={{ color: modeConfig.color }}
        >
          {modeConfig.shortLabel} #{session.id}
        </span>

        <div className="flex-1" />

        {/* Branch label if assigned */}
        {session.assignedBranch && (
          <span className="text-xs text-ctp-subtext0 flex items-center gap-1">
            <span className="opacity-50">⎇</span>
            {session.assignedBranch}
          </span>
        )}

        {/* Settings button (pre-launch) */}
        {!showTerminal && !session.shouldLaunchTerminal && (
          <button
            onClick={() => setShowSettings(true)}
            className="p-1 rounded hover:bg-ctp-surface0"
            title="Session Settings"
          >
            <Settings className="w-4 h-4 text-ctp-subtext0 hover:text-ctp-mauve" />
          </button>
        )}

        {/* Launch button (pre-launch) */}
        {!showTerminal && !session.shouldLaunchTerminal && (
          <button
            onClick={handleLaunch}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white"
            style={{ backgroundColor: modeConfig.color }}
          >
            <Play className="w-3 h-3" />
            Launch
          </button>
        )}

        {/* Status label */}
        <span
          className="text-xs"
          style={{ color: statusConfig.color }}
        >
          {statusConfig.label}
        </span>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="p-0.5 rounded hover:bg-ctp-surface0"
        >
          <X className="w-4 h-4 text-ctp-subtext0 hover:text-ctp-red" />
        </button>
      </div>

      {/* Terminal content area */}
      <div className="flex-1 relative bg-ctp-base" ref={terminalRef}>
        {showTerminal ? (
          <Terminal
            sessionId={session.id}
            onData={handleData}
            onResize={handleResize}
          />
        ) : showLaunchPlaceholder ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-6 rounded-xl bg-ctp-mantle/80">
              <ModeIcon
                className="w-10 h-10 mx-auto mb-3 opacity-50"
                color={modeConfig.color}
              />
              <p className="text-sm text-ctp-subtext0 mb-2">
                Select branch and click Launch
              </p>
              {session.assignedBranch ? (
                <div className="flex items-center justify-center gap-1 text-xs text-ctp-blue">
                  <span className="opacity-50">⎇</span>
                  {session.assignedBranch}
                </div>
              ) : (
                <p className="text-xs text-ctp-subtext0">
                  Using current branch
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-ctp-blue animate-spin" />
          </div>
        )}
      </div>

      {/* Footer bar (when running) */}
      {showTerminal && (
        <div
          className="flex items-center gap-2 px-2 py-1"
          style={{ backgroundColor: `${statusConfig.color}26` }}
        >
          {/* Port badge if app running */}
          {session.isAppRunning && session.assignedPort && (
            <span className="text-xs font-medium text-ctp-green px-2 py-0.5 rounded bg-ctp-green/10">
              :{session.assignedPort}
            </span>
          )}

          {/* Open in browser button */}
          {session.serverURL && (
            <a
              href={session.serverURL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white bg-ctp-blue hover:bg-ctp-blue/80"
            >
              <ExternalLink className="w-3 h-3" />
              Open
            </a>
          )}

          {/* Running indicator */}
          {session.isAppRunning && !session.serverURL && (
            <span className="flex items-center gap-1 text-xs text-ctp-green">
              <CheckCircle className="w-3 h-3" />
              Running
            </span>
          )}

          <div className="flex-1" />
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <SessionSettings
          session={session}
          onClose={() => setShowSettings(false)}
          onSave={handleSettingsSave}
          onSaveAsProfile={handleSaveAsProfile}
        />
      )}
    </div>
  );
};

// Export helper to write data to a session's terminal
export function writeToSession(sessionId: number, data: string) {
  const writer = getTerminalWriter(sessionId);
  if (writer) {
    writer(data);
  }
}
