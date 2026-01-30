/**
 * Maestro Web Server - main entry point
 * Express HTTP server + WebSocket for terminal I/O
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { sessionManager } from './managers/SessionManager.js';
import { profileManager } from './managers/ProfileManager.js';
import { wsManager } from './websocket/WebSocketServer.js';
import {
  TerminalMode,
  getOptimalGrid,
  SessionProfile
} from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Configuration
const PORT = parseInt(process.env.PORT || '3100', 10);
const DEFAULT_SESSION_COUNT = parseInt(process.env.DEFAULT_SESSIONS || '0', 10);
const PROJECT_PATH = process.env.PROJECT_PATH || process.cwd();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files (in production)
// In container: __dirname is /app/dist, web is at /app/web/dist
// In development: __dirname is server/dist, web is at web/dist
const webDistPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '../web/dist')
  : path.join(__dirname, '../../web/dist');
app.use(express.static(webDistPath));

// REST API routes

// Get all sessions
app.get('/api/sessions', (req, res) => {
  res.json({
    sessions: sessionManager.getSessions(),
    projectPath: sessionManager.getProjectPath(),
    isRunning: sessionManager.getRunning(),
    grid: getOptimalGrid(sessionManager.getSessionCount())
  });
});

// Get single session
app.get('/api/sessions/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const session = sessionManager.getSession(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

// Create new session
app.post('/api/sessions', (req, res) => {
  const { mode } = req.body;
  const session = sessionManager.createSession(mode as TerminalMode);
  res.status(201).json(session);
});

// Launch session
app.post('/api/sessions/:id/launch', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { workingDir } = req.body;
  const success = sessionManager.launchSession(id, workingDir);
  if (!success) {
    return res.status(400).json({ error: 'Failed to launch session' });
  }
  res.json(sessionManager.getSession(id));
});

// Close session
app.delete('/api/sessions/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  sessionManager.closeSession(id);
  res.status(204).send();
});

// Update session mode
app.patch('/api/sessions/:id/mode', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { mode } = req.body;
  sessionManager.setMode(id, mode as TerminalMode);
  res.json(sessionManager.getSession(id));
});

// Update session branch
app.patch('/api/sessions/:id/branch', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { branch } = req.body;
  sessionManager.setBranch(id, branch);
  res.json(sessionManager.getSession(id));
});

// Send command to session
app.post('/api/sessions/:id/command', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { command } = req.body;
  sessionManager.sendCommand(id, command);
  res.status(204).send();
});

// Set project path
app.post('/api/project', (req, res) => {
  const { path: projectPath } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'Path is required' });
  }
  sessionManager.setProjectPath(projectPath);
  res.json({ path: projectPath });
});

// Get project path
app.get('/api/project', (req, res) => {
  res.json({ path: sessionManager.getProjectPath() });
});

// Start all sessions (enter "running" mode)
app.post('/api/start', (req, res) => {
  sessionManager.setRunning(true);
  res.json({ running: true });
});

// Stop all sessions (exit "running" mode)
app.post('/api/stop', (req, res) => {
  sessionManager.setRunning(false);
  res.json({ running: false });
});

// Get status summary
app.get('/api/status', (req, res) => {
  res.json({
    sessionCount: sessionManager.getSessionCount(),
    statusSummary: sessionManager.getStatusSummary(),
    isRunning: sessionManager.getRunning(),
    projectPath: sessionManager.getProjectPath()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    sessions: sessionManager.getSessionCount()
  });
});

// ========== Profile API ==========

// Get all profiles
app.get('/api/profiles', (req, res) => {
  res.json(profileManager.getProfiles());
});

// Get profiles for a specific mode
app.get('/api/profiles/mode/:mode', (req, res) => {
  const mode = req.params.mode as TerminalMode;
  res.json(profileManager.getProfilesForMode(mode));
});

// Get single profile
app.get('/api/profiles/:id', (req, res) => {
  const profile = profileManager.getProfile(req.params.id);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  res.json(profile);
});

// Create new profile
app.post('/api/profiles', (req, res) => {
  try {
    const profileData = req.body as Omit<SessionProfile, 'id' | 'createdAt' | 'updatedAt'>;
    const profile = profileManager.createProfile(profileData);
    res.status(201).json(profile);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create profile' });
  }
});

// Update profile
app.put('/api/profiles/:id', (req, res) => {
  const updated = profileManager.updateProfile(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  res.json(updated);
});

// Delete profile
app.delete('/api/profiles/:id', (req, res) => {
  const deleted = profileManager.deleteProfile(req.params.id);
  if (!deleted) {
    return res.status(400).json({ error: 'Cannot delete profile (may be default)' });
  }
  res.status(204).send();
});

// Set default profile
app.post('/api/profiles/:id/default', (req, res) => {
  const success = profileManager.setDefaultProfile(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  res.json({ success: true });
});

// ========== Session Settings API ==========

// Update session permission mode
app.patch('/api/sessions/:id/permission', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { permissionMode } = req.body;
  sessionManager.setPermissionMode(id, permissionMode);
  res.json(sessionManager.getSession(id));
});

// Update session custom flags
app.patch('/api/sessions/:id/flags', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { flags } = req.body;
  sessionManager.setCustomFlags(id, flags);
  res.json(sessionManager.getSession(id));
});

// Update session environment variables
app.patch('/api/sessions/:id/env', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { envVars } = req.body;
  sessionManager.setEnvVars(id, envVars);
  res.json(sessionManager.getSession(id));
});

// Update session wrapper command
app.patch('/api/sessions/:id/wrapper', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { wrapper } = req.body;
  sessionManager.setWrapperCommand(id, wrapper);
  res.json(sessionManager.getSession(id));
});

// Update session working directory
app.patch('/api/sessions/:id/directory', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { directory } = req.body;
  sessionManager.setWorkingDirectory(id, directory);
  res.json(sessionManager.getSession(id));
});

// Apply profile to session
app.post('/api/sessions/:id/apply-profile', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { profileId } = req.body;
  const profile = profileManager.getProfile(profileId);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  sessionManager.applyProfile(id, profile);
  res.json(sessionManager.getSession(id));
});

// ========== Directory Browser API ==========

// Get allowed directories
app.get('/api/directories/allowed', (req, res) => {
  res.json(profileManager.getAllowedDirectories());
});

// Add allowed directory
app.post('/api/directories/allowed', (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) {
    return res.status(400).json({ error: 'Path is required' });
  }
  try {
    const added = profileManager.addAllowedDirectory(dirPath);
    if (!added) {
      return res.status(409).json({ error: 'Directory already allowed' });
    }
    res.json({ success: true, directories: profileManager.getAllowedDirectories() });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Remove allowed directory
app.delete('/api/directories/allowed', (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) {
    return res.status(400).json({ error: 'Path is required' });
  }
  const removed = profileManager.removeAllowedDirectory(dirPath);
  if (!removed) {
    return res.status(404).json({ error: 'Directory not in allowed list' });
  }
  res.json({ success: true, directories: profileManager.getAllowedDirectories() });
});

// Set all allowed directories
app.put('/api/directories/allowed', (req, res) => {
  const { directories } = req.body;
  if (!directories || !Array.isArray(directories)) {
    return res.status(400).json({ error: 'Directories array is required' });
  }
  profileManager.setAllowedDirectories(directories);
  res.json({ success: true, directories: profileManager.getAllowedDirectories() });
});

// List directory contents
app.get('/api/directories', (req, res) => {
  const dirPath = req.query.path as string || '/workspace';
  try {
    const entries = profileManager.listDirectory(dirPath);
    res.json({ path: dirPath, entries });
  } catch (error: any) {
    res.status(403).json({ error: error.message || 'Access denied' });
  }
});

// ========== Guardrails API ==========

// Get guardrails
app.get('/api/guardrails', (req, res) => {
  res.json({ guardrails: profileManager.getGuardrails() });
});

// Set guardrails
app.put('/api/guardrails', (req, res) => {
  const { guardrails } = req.body;
  if (typeof guardrails !== 'string') {
    return res.status(400).json({ error: 'Guardrails must be a string' });
  }
  profileManager.setGuardrails(guardrails);
  res.json({ success: true, guardrails: profileManager.getGuardrails() });
});

// SPA fallback - serve index.html for client-side routing
app.get('*', (req, res) => {
  const indexPath = path.join(webDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Failed to serve index.html:', err);
      res.status(404).send('Frontend not found');
    }
  });
});

// Initialize WebSocket server
wsManager.initialize(server);

// Initialize default sessions
sessionManager.setProjectPath(PROJECT_PATH);
sessionManager.initializeSessions(DEFAULT_SESSION_COUNT);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     MAESTRO WEB SERVER                       ║
╠══════════════════════════════════════════════════════════════╣
║  HTTP Server:    http://0.0.0.0:${PORT.toString().padEnd(27)}║
║  WebSocket:      ws://0.0.0.0:${PORT}/ws${' '.repeat(24)}║
║  Project Path:   ${PROJECT_PATH.slice(0, 42).padEnd(42)}║
║  Sessions:       ${DEFAULT_SESSION_COUNT.toString().padEnd(42)}║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  sessionManager.closeAllSessions();
  wsManager.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  sessionManager.closeAllSessions();
  wsManager.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
