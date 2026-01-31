/**
 * WebSocket Server - handles real-time terminal I/O
 * Port of: TerminalView.swift communication patterns
 */

import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { Server } from 'http';
import {
  WSMessage,
  WSMessageType,
  TerminalMode,
  TerminalDimensions
} from '../types/index.js';
import { sessionManager } from '../managers/SessionManager.js';

interface ClientConnection {
  ws: WebSocket;
  subscribedSessions: Set<number>;
}

export class WebSocketManager {
  private wss: WSServer | null = null;
  private clients: Set<ClientConnection> = new Set();

  initialize(server: Server): void {
    this.wss = new WSServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    // Subscribe to SessionManager events
    this.setupSessionManagerListeners();

    console.log('WebSocket server initialized on /ws');
  }

  private handleConnection(ws: WebSocket): void {
    const client: ClientConnection = {
      ws,
      subscribedSessions: new Set()
    };

    this.clients.add(client);
    console.log(`Client connected. Total clients: ${this.clients.size}`);

    // Send current session list
    const sessions = sessionManager.getSessions();
    this.sendToClient(client, {
      type: WSMessageType.SessionList,
      payload: {
        sessions,
        projectPath: sessionManager.getProjectPath(),
        isRunning: sessionManager.getRunning()
      }
    });

    // For running sessions, subscribe and replay buffered output
    for (const session of sessions) {
      if (session.isTerminalLaunched) {
        client.subscribedSessions.add(session.id);

        // Replay buffered output
        const buffer = sessionManager.getSessionOutputBuffer(session.id);
        if (buffer) {
          this.sendToClient(client, {
            type: WSMessageType.SessionOutput,
            sessionId: session.id,
            payload: { data: buffer }
          });
        }
      }
    }

    ws.on('message', (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
        this.sendToClient(client, {
          type: WSMessageType.Error,
          payload: { message: 'Invalid message format' }
        });
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
      console.log(`Client disconnected. Total clients: ${this.clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(client);
    });
  }

  private handleMessage(client: ClientConnection, message: WSMessage): void {
    switch (message.type) {
      case WSMessageType.SessionCreate:
        this.handleSessionCreate(client, message);
        break;

      case WSMessageType.SessionLaunch:
        this.handleSessionLaunch(client, message);
        break;

      case WSMessageType.SessionClose:
        this.handleSessionClose(client, message);
        break;

      case WSMessageType.SessionInput:
        this.handleSessionInput(client, message);
        break;

      case WSMessageType.SessionResize:
        this.handleSessionResize(client, message);
        break;

      case WSMessageType.SessionSetMode:
        this.handleSessionSetMode(client, message);
        break;

      case WSMessageType.SessionSetBranch:
        this.handleSessionSetBranch(client, message);
        break;

      case WSMessageType.SessionSetAllowedDirs:
        this.handleSessionSetAllowedDirs(client, message);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private handleSessionCreate(client: ClientConnection, message: WSMessage): void {
    const payload = message.payload as { mode?: TerminalMode } | undefined;
    const session = sessionManager.createSession(payload?.mode);

    // Subscribe this client to the new session
    client.subscribedSessions.add(session.id);

    // Note: SessionCreated broadcast is handled by setupSessionManagerListeners
    // We don't send here to avoid duplicate notifications
  }

  private handleSessionLaunch(client: ClientConnection, message: WSMessage): void {
    if (!message.sessionId) return;

    const payload = message.payload as { workingDir?: string } | undefined;
    const success = sessionManager.launchSession(
      message.sessionId,
      payload?.workingDir
    );

    if (success) {
      // Subscribe to this session's output
      client.subscribedSessions.add(message.sessionId);
    }
  }

  private handleSessionClose(client: ClientConnection, message: WSMessage): void {
    if (!message.sessionId) return;
    sessionManager.closeSession(message.sessionId);
    client.subscribedSessions.delete(message.sessionId);
  }

  private handleSessionInput(client: ClientConnection, message: WSMessage): void {
    if (!message.sessionId) return;
    const payload = message.payload as { data: string };
    if (payload?.data) {
      console.log(`Session ${message.sessionId} input: ${payload.data.length} chars`);
      sessionManager.sendInput(message.sessionId, payload.data);
    }
  }

  private handleSessionResize(client: ClientConnection, message: WSMessage): void {
    if (!message.sessionId) return;
    const payload = message.payload as TerminalDimensions;
    if (payload?.cols && payload?.rows) {
      sessionManager.resizeSession(message.sessionId, payload);
    }
  }

  private handleSessionSetMode(client: ClientConnection, message: WSMessage): void {
    if (!message.sessionId) return;
    const payload = message.payload as { mode: TerminalMode };
    if (payload?.mode) {
      sessionManager.setMode(message.sessionId, payload.mode);
    }
  }

  private handleSessionSetBranch(client: ClientConnection, message: WSMessage): void {
    if (!message.sessionId) return;
    const payload = message.payload as { branch: string | null };
    sessionManager.setBranch(message.sessionId, payload?.branch ?? null);
  }

  private handleSessionSetAllowedDirs(client: ClientConnection, message: WSMessage): void {
    if (!message.sessionId) return;
    const payload = message.payload as { directories: string[] };
    if (payload?.directories && Array.isArray(payload.directories)) {
      sessionManager.setAllowedDirectories(message.sessionId, payload.directories);
    }
  }

  private setupSessionManagerListeners(): void {
    // Terminal output -> broadcast to subscribed clients
    sessionManager.on('sessionOutput', (sessionId: number, data: string) => {
      this.broadcastToSubscribers(sessionId, {
        type: WSMessageType.SessionOutput,
        sessionId,
        payload: { data }
      });
    });

    // Status updates -> broadcast to all
    sessionManager.on('sessionStatusUpdate', (session) => {
      this.broadcast({
        type: WSMessageType.SessionStatusUpdate,
        sessionId: session.id,
        payload: session
      });
    });

    // Session created -> broadcast to all
    sessionManager.on('sessionCreated', (session) => {
      this.broadcast({
        type: WSMessageType.SessionCreated,
        sessionId: session.id,
        payload: session
      });
    });

    // Session closed -> broadcast to all
    sessionManager.on('sessionClosed', (sessionId: number) => {
      this.broadcast({
        type: WSMessageType.SessionClosed,
        sessionId,
        payload: null
      });
    });

    // Session terminated (process killed but session kept) -> broadcast to all
    sessionManager.on('sessionTerminated', (sessionId: number) => {
      this.broadcast({
        type: WSMessageType.SessionTerminated,
        sessionId,
        payload: sessionManager.getSession(sessionId)
      });
    });

    // Server ready -> broadcast to all
    sessionManager.on('serverReady', (sessionId: number, url: string) => {
      this.broadcast({
        type: WSMessageType.SessionStatusUpdate,
        sessionId,
        payload: {
          ...sessionManager.getSession(sessionId),
          serverURL: url,
          isAppRunning: true
        }
      });
    });
  }

  private sendToClient(client: ClientConnection, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  private broadcastToSubscribers(sessionId: number, message: WSMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.subscribedSessions.has(sessionId) &&
          client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  // Close all connections
  close(): void {
    for (const client of this.clients) {
      client.ws.close();
    }
    this.clients.clear();
    this.wss?.close();
  }
}

export const wsManager = new WebSocketManager();
