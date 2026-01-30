/**
 * CommandReference component - Quick access to saved commands with copy functionality
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Copy,
  Check,
  Trash2,
  X,
  Keyboard
} from 'lucide-react';

interface SavedCommand {
  id: string;
  name: string;
  command: string;
}

interface CommandReferenceProps {
  onClose: () => void;
}

// Default commands users might want to reference
const DEFAULT_COMMANDS: SavedCommand[] = [
  { id: 'default-1', name: 'Exit Session', command: 'exit' },
  { id: 'default-2', name: 'Clear Screen', command: 'clear' },
  { id: 'default-3', name: 'Cancel Command', command: 'Ctrl+C' },
];

export const CommandReference: React.FC<CommandReferenceProps> = ({ onClose }) => {
  const [commands, setCommands] = useState<SavedCommand[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');

  // Load commands from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('maestro-saved-commands');
    if (stored) {
      try {
        setCommands(JSON.parse(stored));
      } catch {
        setCommands([]);
      }
    }
  }, []);

  // Save commands to localStorage
  const saveCommands = useCallback((cmds: SavedCommand[]) => {
    localStorage.setItem('maestro-saved-commands', JSON.stringify(cmds));
    setCommands(cmds);
  }, []);

  // Copy command to clipboard
  const handleCopy = useCallback(async (command: string, id: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Add new command
  const handleAdd = useCallback(() => {
    if (!newName.trim() || !newCommand.trim()) return;

    const newCmd: SavedCommand = {
      id: `cmd-${Date.now()}`,
      name: newName.trim(),
      command: newCommand.trim()
    };

    saveCommands([...commands, newCmd]);
    setNewName('');
    setNewCommand('');
    setIsAdding(false);
  }, [newName, newCommand, commands, saveCommands]);

  // Delete command
  const handleDelete = useCallback((id: string) => {
    saveCommands(commands.filter(c => c.id !== id));
  }, [commands, saveCommands]);

  // Handle key press in add form
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewName('');
      setNewCommand('');
    }
  }, [handleAdd]);

  const allCommands = [...DEFAULT_COMMANDS, ...commands];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-16 z-50" onClick={onClose}>
      <div
        className="bg-ctp-mantle border border-ctp-surface0 rounded-lg shadow-xl w-96 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ctp-surface0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-ctp-mauve" />
            <span className="font-medium">Command Reference</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-ctp-surface0">
            <X className="w-4 h-4 text-ctp-subtext0" />
          </button>
        </div>

        {/* Keyboard shortcuts info */}
        <div className="px-4 py-2 bg-ctp-surface0/50 border-b border-ctp-surface0">
          <div className="flex items-center gap-2 text-xs text-ctp-subtext0 mb-2">
            <Keyboard className="w-3 h-3" />
            <span>Keyboard Shortcuts:</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-ctp-surface1 rounded text-ctp-blue font-mono text-[10px]">Ctrl+Shift+C</kbd>
              <span className="text-ctp-subtext0">Copy</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-ctp-surface1 rounded text-ctp-blue font-mono text-[10px]">Ctrl+Shift+V</kbd>
              <span className="text-ctp-subtext0">Paste</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-ctp-surface1 rounded text-ctp-blue font-mono text-[10px]">Alt+1-9</kbd>
              <span className="text-ctp-subtext0">Focus session</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-ctp-surface1 rounded text-ctp-blue font-mono text-[10px]">Alt+←/→</kbd>
              <span className="text-ctp-subtext0">Cycle sessions</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-ctp-surface1 rounded text-ctp-blue font-mono text-[10px]">Alt+N</kbd>
              <span className="text-ctp-subtext0">New session</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-ctp-surface1 rounded text-ctp-blue font-mono text-[10px]">Alt+/</kbd>
              <span className="text-ctp-subtext0">This panel</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-ctp-surface1 rounded text-ctp-blue font-mono text-[10px]">Alt+,</kbd>
              <span className="text-ctp-subtext0">Settings</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-ctp-surface1 rounded text-ctp-blue font-mono text-[10px]">Esc</kbd>
              <span className="text-ctp-subtext0">Close modal</span>
            </span>
          </div>
        </div>

        {/* Command list */}
        <div className="flex-1 overflow-y-auto p-2">
          {allCommands.map((cmd) => (
            <div
              key={cmd.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-ctp-surface0 group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ctp-text truncate">{cmd.name}</div>
                <code className="text-xs text-ctp-subtext0 font-mono">{cmd.command}</code>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleCopy(cmd.command, cmd.id)}
                  className="p-1.5 rounded hover:bg-ctp-surface1"
                  title="Copy command"
                >
                  {copiedId === cmd.id ? (
                    <Check className="w-4 h-4 text-ctp-green" />
                  ) : (
                    <Copy className="w-4 h-4 text-ctp-subtext0 hover:text-ctp-blue" />
                  )}
                </button>
                {!cmd.id.startsWith('default-') && (
                  <button
                    onClick={() => handleDelete(cmd.id)}
                    className="p-1.5 rounded hover:bg-ctp-surface1 opacity-0 group-hover:opacity-100"
                    title="Delete command"
                  >
                    <Trash2 className="w-4 h-4 text-ctp-subtext0 hover:text-ctp-red" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add new command form */}
          {isAdding ? (
            <div className="mt-2 p-3 rounded-lg bg-ctp-surface0">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Command name"
                className="w-full px-2 py-1.5 mb-2 bg-ctp-base rounded border border-ctp-surface1 text-sm outline-none focus:border-ctp-blue"
                autoFocus
              />
              <input
                type="text"
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Command (e.g., npm run dev)"
                className="w-full px-2 py-1.5 mb-2 bg-ctp-base rounded border border-ctp-surface1 text-sm font-mono outline-none focus:border-ctp-blue"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!newName.trim() || !newCommand.trim()}
                  className="px-3 py-1 bg-ctp-blue text-ctp-base text-xs rounded font-medium hover:bg-ctp-blue/80 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewName('');
                    setNewCommand('');
                  }}
                  className="px-3 py-1 bg-ctp-surface1 text-ctp-text text-xs rounded hover:bg-ctp-surface2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-ctp-surface1 hover:border-ctp-blue hover:bg-ctp-surface0/50 text-sm text-ctp-subtext0 hover:text-ctp-blue"
            >
              <Plus className="w-4 h-4" />
              Add Custom Command
            </button>
          )}
        </div>

        {/* Footer with tip */}
        <div className="px-4 py-2 bg-ctp-base border-t border-ctp-surface0 text-xs text-ctp-subtext0">
          Tip: Use <kbd className="px-1 py-0.5 bg-ctp-surface0 rounded font-mono">Ctrl+C</kbd> to cancel running commands in terminal
        </div>
      </div>
    </div>
  );
};

// Button component for the header
export const CommandReferenceButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-ctp-surface0 text-ctp-subtext0 hover:text-ctp-mauve text-xs"
      title="Command Reference & Keyboard Shortcuts"
    >
      <BookOpen className="w-4 h-4" />
      <span className="hidden sm:inline">Commands</span>
      <span className="hidden md:flex items-center gap-1 text-[10px] text-ctp-overlay0">
        <kbd className="px-1 py-0.5 bg-ctp-surface0 rounded font-mono">Ctrl+Shift+C/V</kbd>
      </span>
    </button>
  );
};
