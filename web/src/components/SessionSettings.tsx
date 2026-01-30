/**
 * SessionSettings component
 * Allows configuration of session before launch: mode, permissions, directory, etc.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  FolderOpen,
  Shield,
  Terminal,
  Flag,
  Variable,
  Wand2,
  ChevronRight,
  Folder,
  X,
  Save,
  Bookmark,
  Download
} from 'lucide-react';
import {
  SessionInfo,
  TerminalMode,
  TerminalModeConfig,
  PermissionModeConfig,
  DirectoryEntry,
  TERMINAL_MODES
} from '../types';

// Profile type (matches server)
interface SessionProfile {
  id: string;
  name: string;
  mode: TerminalMode;
  permissionMode: string;
  workingDirectory: string | null;
  customFlags: string[];
  envVars: Record<string, string>;
  wrapperCommand: string | null;
  isDefault: boolean;
}

interface SessionSettingsProps {
  session: SessionInfo;
  onClose: () => void;
  onSave: (settings: Partial<SessionInfo>) => void;
  onSaveAsProfile?: (name: string) => void;
}

export const SessionSettings: React.FC<SessionSettingsProps> = ({
  session,
  onClose,
  onSave,
  onSaveAsProfile
}) => {
  const [mode, setMode] = useState(session.mode);
  const [permissionMode, setPermissionMode] = useState(session.permissionMode || 'default');
  const [workingDirectory, setWorkingDirectory] = useState(session.workingDirectory || '');
  const [customFlags, setCustomFlags] = useState(session.customFlags?.join(' ') || '');
  const [envVarsText, setEnvVarsText] = useState(
    Object.entries(session.envVars || {}).map(([k, v]) => `${k}=${v}`).join('\n')
  );
  const [wrapperCommand, setWrapperCommand] = useState(session.wrapperCommand || '');
  const [showDirBrowser, setShowDirBrowser] = useState(false);
  const [showProfileSave, setShowProfileSave] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');
  const [profiles, setProfiles] = useState<SessionProfile[]>([]);
  const [showProfileLoad, setShowProfileLoad] = useState(false);

  // Load profiles on mount
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await fetch('/api/profiles');
        if (res.ok) {
          const data = await res.json();
          setProfiles(data);
        }
      } catch (e) {
        console.error('Failed to fetch profiles:', e);
      }
    };
    fetchProfiles();
  }, []);

  // Apply a profile
  const applyProfile = useCallback((profile: SessionProfile) => {
    setMode(profile.mode);
    setPermissionMode(profile.permissionMode);
    setWorkingDirectory(profile.workingDirectory || '');
    setCustomFlags(profile.customFlags?.join(' ') || '');
    setEnvVarsText(
      Object.entries(profile.envVars || {}).map(([k, v]) => `${k}=${v}`).join('\n')
    );
    setWrapperCommand(profile.wrapperCommand || '');
    setShowProfileLoad(false);
  }, []);

  // Get permission config for current mode
  const permConfig = PermissionModeConfig[mode];

  const handleSave = useCallback(() => {
    // Parse env vars from text
    const envVars: Record<string, string> = {};
    envVarsText.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });

    // Parse custom flags
    const flags = customFlags.trim() ? customFlags.trim().split(/\s+/) : [];

    onSave({
      mode,
      permissionMode,
      workingDirectory: workingDirectory || null,
      customFlags: flags,
      envVars,
      wrapperCommand: wrapperCommand || null
    });
    onClose();
  }, [mode, permissionMode, workingDirectory, customFlags, envVarsText, wrapperCommand, onSave, onClose]);

  const handleSaveAsProfile = useCallback(() => {
    if (profileName.trim() && onSaveAsProfile) {
      onSaveAsProfile(profileName.trim());
      setShowProfileSave(false);
      setProfileName('');
    }
  }, [profileName, onSaveAsProfile]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-ctp-mantle rounded-xl w-[600px] max-w-full shadow-xl border border-ctp-surface0 my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ctp-surface0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-ctp-mauve" />
            <span className="font-medium">Session #{session.id} Settings</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ctp-surface0 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ctp-surface0">
          <button
            onClick={() => setActiveTab('basic')}
            className={`flex-1 py-2 text-sm font-medium ${activeTab === 'basic' ? 'text-ctp-mauve border-b-2 border-ctp-mauve' : 'text-ctp-subtext0'}`}
          >
            Basic
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            className={`flex-1 py-2 text-sm font-medium ${activeTab === 'advanced' ? 'text-ctp-mauve border-b-2 border-ctp-mauve' : 'text-ctp-subtext0'}`}
          >
            Advanced
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {activeTab === 'basic' ? (
            <div className="space-y-4">
              {/* Mode selector */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Terminal className="w-4 h-4" />
                  CLI Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TERMINAL_MODES.map(m => {
                    const cfg = TerminalModeConfig[m];
                    const isSelected = m === mode;
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          setMode(m);
                          setPermissionMode('default');
                        }}
                        className={`p-3 rounded-lg border text-left ${
                          isSelected
                            ? 'border-ctp-mauve bg-ctp-mauve/10'
                            : 'border-ctp-surface0 hover:border-ctp-surface1'
                        }`}
                      >
                        <div className="font-medium" style={{ color: cfg.color }}>{cfg.shortLabel}</div>
                        <div className="text-xs text-ctp-subtext0">{m}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Permission mode */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Shield className="w-4 h-4" />
                  Permission Level
                </label>
                <div className="space-y-1">
                  {permConfig.modes.map(pm => (
                    <button
                      key={pm}
                      onClick={() => setPermissionMode(pm)}
                      className={`w-full p-2 rounded-lg text-left ${
                        pm === permissionMode
                          ? 'bg-ctp-surface0 border border-ctp-mauve'
                          : 'hover:bg-ctp-surface0/50'
                      }`}
                    >
                      <div className="font-medium text-sm">{permConfig.labels[pm]}</div>
                      <div className="text-xs text-ctp-subtext0">{permConfig.descriptions[pm]}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Working directory */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <FolderOpen className="w-4 h-4" />
                  Working Directory
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={workingDirectory}
                    onChange={e => setWorkingDirectory(e.target.value)}
                    placeholder="/workspace/my-project"
                    className="flex-1 px-3 py-2 bg-ctp-base border border-ctp-surface0 rounded-lg text-sm focus:border-ctp-mauve outline-none"
                  />
                  <button
                    onClick={() => setShowDirBrowser(true)}
                    className="px-3 py-2 bg-ctp-surface0 hover:bg-ctp-surface1 rounded-lg"
                  >
                    <Folder className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Custom flags */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Flag className="w-4 h-4" />
                  Custom CLI Flags
                </label>
                <input
                  type="text"
                  value={customFlags}
                  onChange={e => setCustomFlags(e.target.value)}
                  placeholder="--add-dir /extra --verbose"
                  className="w-full px-3 py-2 bg-ctp-base border border-ctp-surface0 rounded-lg text-sm focus:border-ctp-mauve outline-none font-mono"
                />
                <p className="text-xs text-ctp-subtext0 mt-1">Additional arguments passed to the CLI</p>
              </div>

              {/* Environment variables */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Variable className="w-4 h-4" />
                  Environment Variables
                </label>
                <textarea
                  value={envVarsText}
                  onChange={e => setEnvVarsText(e.target.value)}
                  placeholder="MY_VAR=value&#10;ANOTHER_VAR=something"
                  rows={4}
                  className="w-full px-3 py-2 bg-ctp-base border border-ctp-surface0 rounded-lg text-sm focus:border-ctp-mauve outline-none font-mono resize-none"
                />
                <p className="text-xs text-ctp-subtext0 mt-1">One per line: KEY=value</p>
              </div>

              {/* Wrapper command */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Wand2 className="w-4 h-4" />
                  Wrapper Command
                </label>
                <input
                  type="text"
                  value={wrapperCommand}
                  onChange={e => setWrapperCommand(e.target.value)}
                  placeholder="time"
                  className="w-full px-3 py-2 bg-ctp-base border border-ctp-surface0 rounded-lg text-sm focus:border-ctp-mauve outline-none font-mono"
                />
                <p className="text-xs text-ctp-subtext0 mt-1">Prefix command (e.g., time, strace -o log.txt)</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-ctp-surface0 bg-ctp-base/50">
          {showProfileSave ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="Profile name..."
                className="flex-1 px-3 py-1.5 bg-ctp-base border border-ctp-surface0 rounded text-sm focus:border-ctp-mauve outline-none"
                autoFocus
              />
              <button
                onClick={handleSaveAsProfile}
                disabled={!profileName.trim()}
                className="px-3 py-1.5 bg-ctp-green text-ctp-base rounded text-sm font-medium disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setShowProfileSave(false)}
                className="px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          ) : showProfileLoad ? (
            <div className="flex-1">
              <div className="text-xs text-ctp-subtext0 mb-2">Select a profile to load:</div>
              <div className="flex flex-wrap gap-2">
                {profiles.length === 0 ? (
                  <span className="text-xs text-ctp-subtext0">No profiles saved yet</span>
                ) : (
                  profiles.map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyProfile(p)}
                      className="px-2 py-1 text-xs rounded bg-ctp-surface0 hover:bg-ctp-surface1"
                      style={{ borderLeft: `3px solid ${TerminalModeConfig[p.mode].color}` }}
                    >
                      {p.name}
                    </button>
                  ))
                )}
                <button
                  onClick={() => setShowProfileLoad(false)}
                  className="px-2 py-1 text-xs text-ctp-subtext0 hover:text-ctp-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowProfileLoad(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-ctp-subtext0 hover:text-ctp-text"
                >
                  <Download className="w-4 h-4" />
                  Load Profile
                </button>
                <button
                  onClick={() => setShowProfileSave(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-ctp-subtext0 hover:text-ctp-text"
                >
                  <Bookmark className="w-4 h-4" />
                  Save as Profile
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-sm hover:bg-ctp-surface0 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-ctp-mauve text-ctp-base rounded text-sm font-medium"
                >
                  <Save className="w-4 h-4" />
                  Apply
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Directory browser modal */}
      {showDirBrowser && (
        <DirectoryBrowser
          currentPath={workingDirectory || '/workspace'}
          onSelect={path => {
            setWorkingDirectory(path);
            setShowDirBrowser(false);
          }}
          onClose={() => setShowDirBrowser(false)}
        />
      )}
    </div>
  );
};

// Directory browser component
interface DirectoryBrowserProps {
  currentPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

const DirectoryBrowser: React.FC<DirectoryBrowserProps> = ({ currentPath, onSelect, onClose }) => {
  const [path, setPath] = useState(currentPath);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEntries = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/directories?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to load directory');
        }
        const data = await res.json();
        setEntries(data.entries);
      } catch (e: any) {
        setError(e.message);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEntries();
  }, [path]);

  const navigateUp = () => {
    const parent = path.split('/').slice(0, -1).join('/') || '/';
    setPath(parent);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-ctp-mantle rounded-xl w-[500px] max-h-[60vh] overflow-hidden shadow-xl border border-ctp-surface0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ctp-surface0">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-ctp-blue" />
            <span className="font-medium">Select Directory</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ctp-surface0 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Path bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-ctp-base border-b border-ctp-surface0">
          <button onClick={navigateUp} className="p-1 hover:bg-ctp-surface0 rounded text-sm">
            ..
          </button>
          <code className="text-sm text-ctp-blue flex-1 truncate">{path}</code>
        </div>

        {/* Entries */}
        <div className="overflow-y-auto max-h-[40vh]">
          {loading ? (
            <div className="p-4 text-center text-ctp-subtext0">Loading...</div>
          ) : error ? (
            <div className="p-4 text-center text-ctp-red">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-center text-ctp-subtext0">Empty directory</div>
          ) : (
            entries.filter(e => e.isDirectory).map(entry => (
              <button
                key={entry.path}
                onClick={() => setPath(entry.path)}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-ctp-surface0 text-left"
              >
                <Folder className="w-4 h-4 text-ctp-blue" />
                <span className="text-sm">{entry.name}</span>
                <ChevronRight className="w-4 h-4 ml-auto text-ctp-subtext0" />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-ctp-surface0">
          <button onClick={onClose} className="px-4 py-1.5 text-sm hover:bg-ctp-surface0 rounded">
            Cancel
          </button>
          <button
            onClick={() => onSelect(path)}
            className="px-4 py-1.5 bg-ctp-blue text-ctp-base rounded text-sm font-medium"
          >
            Select This Directory
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionSettings;
