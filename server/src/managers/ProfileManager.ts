/**
 * ProfileManager - manages session profiles
 * Stores profiles in JSON file for persistence across container restarts
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  SessionProfile,
  TerminalMode,
  createDefaultProfile
} from '../types/index.js';

export class ProfileManager extends EventEmitter {
  private profiles: Map<string, SessionProfile> = new Map();
  private profilesPath: string;
  private allowedDirectories: string[];

  constructor(configDir: string = '/app/config') {
    super();
    this.profilesPath = path.join(configDir, 'profiles.json');
    // Directories users can browse - can be extended via env var
    this.allowedDirectories = (process.env.ALLOWED_DIRECTORIES || '/workspace,/root').split(',').map(d => d.trim());
    this.loadProfiles();
  }

  // Load profiles from disk
  private loadProfiles(): void {
    try {
      if (fs.existsSync(this.profilesPath)) {
        const data = fs.readFileSync(this.profilesPath, 'utf-8');
        const profiles: SessionProfile[] = JSON.parse(data);
        profiles.forEach(p => this.profiles.set(p.id, p));
        console.log(`Loaded ${profiles.length} profiles from ${this.profilesPath}`);
      } else {
        // Create default profiles for each mode
        this.createDefaultProfiles();
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
      this.createDefaultProfiles();
    }
  }

  // Create default profiles for each terminal mode
  private createDefaultProfiles(): void {
    const modes = [
      TerminalMode.ClaudeCode,
      TerminalMode.GeminiCli,
      TerminalMode.OpenAiCodex,
      TerminalMode.PlainTerminal
    ];

    modes.forEach(mode => {
      const profile = createDefaultProfile(mode);
      this.profiles.set(profile.id, profile);
    });

    this.saveProfiles();
    console.log('Created default profiles');
  }

  // Save profiles to disk
  private saveProfiles(): void {
    try {
      const dir = path.dirname(this.profilesPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.profiles.values()), null, 2);
      fs.writeFileSync(this.profilesPath, data, 'utf-8');
    } catch (error) {
      console.error('Failed to save profiles:', error);
    }
  }

  // Get all profiles
  getProfiles(): SessionProfile[] {
    return Array.from(this.profiles.values());
  }

  // Get profile by ID
  getProfile(id: string): SessionProfile | undefined {
    return this.profiles.get(id);
  }

  // Get default profile for a mode
  getDefaultProfile(mode: TerminalMode): SessionProfile | undefined {
    return Array.from(this.profiles.values()).find(p => p.mode === mode && p.isDefault);
  }

  // Get profiles for a specific mode
  getProfilesForMode(mode: TerminalMode): SessionProfile[] {
    return Array.from(this.profiles.values()).filter(p => p.mode === mode);
  }

  // Create new profile
  createProfile(profile: Omit<SessionProfile, 'id' | 'createdAt' | 'updatedAt'>): SessionProfile {
    const id = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const newProfile: SessionProfile = {
      ...profile,
      id,
      createdAt: now,
      updatedAt: now
    };

    this.profiles.set(id, newProfile);
    this.saveProfiles();
    this.emit('profileCreated', newProfile);
    return newProfile;
  }

  // Update existing profile
  updateProfile(id: string, updates: Partial<SessionProfile>): SessionProfile | null {
    const existing = this.profiles.get(id);
    if (!existing) return null;

    // Don't allow changing ID or creation date
    const { id: _id, createdAt: _created, ...allowedUpdates } = updates;

    const updated: SessionProfile = {
      ...existing,
      ...allowedUpdates,
      updatedAt: new Date().toISOString()
    };

    this.profiles.set(id, updated);
    this.saveProfiles();
    this.emit('profileUpdated', updated);
    return updated;
  }

  // Delete profile
  deleteProfile(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    // Don't allow deleting default profiles
    if (profile.isDefault) {
      console.warn('Cannot delete default profile:', id);
      return false;
    }

    this.profiles.delete(id);
    this.saveProfiles();
    this.emit('profileDeleted', id);
    return true;
  }

  // Set a profile as default for its mode
  setDefaultProfile(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    // Unset current default for this mode
    this.profiles.forEach(p => {
      if (p.mode === profile.mode && p.isDefault) {
        p.isDefault = false;
      }
    });

    profile.isDefault = true;
    this.saveProfiles();
    this.emit('profileUpdated', profile);
    return true;
  }

  // Get allowed directories for browsing
  getAllowedDirectories(): string[] {
    return this.allowedDirectories;
  }

  // List directory contents (for file browser)
  listDirectory(dirPath: string): { name: string; path: string; isDirectory: boolean }[] {
    // Security: Ensure path is within allowed directories
    const normalizedPath = path.normalize(dirPath);
    const isAllowed = this.allowedDirectories.some(allowed =>
      normalizedPath === allowed || normalizedPath.startsWith(allowed + path.sep)
    );

    if (!isAllowed) {
      throw new Error(`Access denied: ${dirPath} is not within allowed directories`);
    }

    try {
      const entries = fs.readdirSync(normalizedPath, { withFileTypes: true });
      return entries
        .filter(entry => !entry.name.startsWith('.')) // Hide hidden files
        .map(entry => ({
          name: entry.name,
          path: path.join(normalizedPath, entry.name),
          isDirectory: entry.isDirectory()
        }))
        .sort((a, b) => {
          // Directories first, then alphabetically
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch (error) {
      console.error('Failed to list directory:', error);
      throw error;
    }
  }
}

// Singleton export
export const profileManager = new ProfileManager();
