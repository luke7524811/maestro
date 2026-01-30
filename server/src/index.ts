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
import { wsManager } from './websocket/WebSocketServer.js';
import {
  TerminalMode,
  getOptimalGrid
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
