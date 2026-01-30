/**
 * AppSettings component
 * Global application settings including allowed directories configuration
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  FolderOpen,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Check
} from 'lucide-react';

interface AppSettingsProps {
  onClose: () => void;
}

export const AppSettings: React.FC<AppSettingsProps> = ({ onClose }) => {
  const [allowedDirectories, setAllowedDirectories] = useState<string[]>([]);
  const [newDirectory, setNewDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load allowed directories
  useEffect(() => {
    const loadDirectories = async () => {
      try {
        const res = await fetch('/api/directories/allowed');
        if (res.ok) {
          const dirs = await res.json();
          setAllowedDirectories(dirs);
        }
      } catch (err) {
        setError('Failed to load directories');
      } finally {
        setLoading(false);
      }
    };
    loadDirectories();
  }, []);

  // Add directory
  const handleAddDirectory = useCallback(async () => {
    if (!newDirectory.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/directories/allowed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newDirectory.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to add directory');
        return;
      }

      setAllowedDirectories(data.directories);
      setNewDirectory('');
      setSuccess('Directory added successfully');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError('Failed to add directory');
    }
  }, [newDirectory]);

  // Remove directory
  const handleRemoveDirectory = useCallback(async (dirPath: string) => {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/directories/allowed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to remove directory');
        return;
      }

      setAllowedDirectories(data.directories);
      setSuccess('Directory removed');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError('Failed to remove directory');
    }
  }, []);

  // Handle Enter key in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddDirectory();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-ctp-mantle rounded-xl w-[500px] max-w-full shadow-xl border border-ctp-surface0 my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ctp-surface0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-ctp-mauve" />
            <span className="font-medium">Application Settings</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ctp-surface0 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {/* Allowed Directories Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4 text-ctp-blue" />
              <h3 className="font-medium">Allowed Directories</h3>
            </div>

            <p className="text-sm text-ctp-subtext0 mb-4">
              Configure which directories can be browsed when selecting working directories for sessions.
              Add paths that are mounted into the container.
            </p>

            {/* Add new directory */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newDirectory}
                onChange={(e) => setNewDirectory(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="/path/to/directory"
                className="flex-1 px-3 py-2 bg-ctp-base border border-ctp-surface0 rounded-lg text-sm focus:outline-none focus:border-ctp-mauve"
              />
              <button
                onClick={handleAddDirectory}
                disabled={!newDirectory.trim()}
                className="px-3 py-2 bg-ctp-blue text-white rounded-lg hover:bg-ctp-blue/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {/* Error/Success messages */}
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-ctp-red/10 border border-ctp-red/30 rounded-lg text-ctp-red text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-ctp-green/10 border border-ctp-green/30 rounded-lg text-ctp-green text-sm">
                <Check className="w-4 h-4 flex-shrink-0" />
                {success}
              </div>
            )}

            {/* Directory list */}
            {loading ? (
              <div className="text-center py-8 text-ctp-subtext0">Loading...</div>
            ) : allowedDirectories.length === 0 ? (
              <div className="text-center py-8 text-ctp-subtext0">
                No directories configured. Add one above.
              </div>
            ) : (
              <div className="space-y-1">
                {allowedDirectories.map((dir) => (
                  <div
                    key={dir}
                    className="flex items-center justify-between p-2 rounded-lg bg-ctp-surface0/50 hover:bg-ctp-surface0 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-4 h-4 text-ctp-subtext0 flex-shrink-0" />
                      <span className="text-sm truncate" title={dir}>{dir}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveDirectory(dir)}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-ctp-red/20 text-ctp-subtext0 hover:text-ctp-red transition-opacity"
                      title="Remove directory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-ctp-surface0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-ctp-surface0 hover:bg-ctp-surface1 rounded-lg text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
