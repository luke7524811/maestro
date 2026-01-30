/**
 * WebSocket hook for real-time session communication
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  WSMessage,
  WSMessageType,
  SessionInfo,
  TerminalMode,
  AppState
} from '../types';

type MessageHandler = (sessionId: number, data: string) => void;
type StateUpdateHandler = (session: SessionInfo) => void;
type SessionListHandler = (state: AppState) => void;

interface UseWebSocketReturn {
  connected: boolean;
  sendInput: (sessionId: number, data: string) => void;
  sendResize: (sessionId: number, cols: number, rows: number) => void;
  createSession: (mode?: TerminalMode) => void;
  launchSession: (sessionId: number, workingDir?: string) => void;
  closeSession: (sessionId: number) => void;
  setSessionMode: (sessionId: number, mode: TerminalMode) => void;
  setSessionBranch: (sessionId: number, branch: string | null) => void;
  onOutput: (handler: MessageHandler) => void;
  onStatusUpdate: (handler: StateUpdateHandler) => void;
  onSessionList: (handler: SessionListHandler) => void;
  onSessionCreated: (handler: StateUpdateHandler) => void;
  onSessionClosed: (handler: (sessionId: number) => void) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Callback refs for handlers
  const outputHandlerRef = useRef<MessageHandler | null>(null);
  const statusUpdateHandlerRef = useRef<StateUpdateHandler | null>(null);
  const sessionListHandlerRef = useRef<SessionListHandler | null>(null);
  const sessionCreatedHandlerRef = useRef<StateUpdateHandler | null>(null);
  const sessionClosedHandlerRef = useRef<((sessionId: number) => void) | null>(null);

  const connect = useCallback(() => {
    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      wsRef.current = null;

      // Attempt reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 2000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    wsRef.current = ws;
  }, []);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case WSMessageType.SessionOutput: {
        const payload = message.payload as { data: string };
        if (message.sessionId !== undefined && outputHandlerRef.current) {
          outputHandlerRef.current(message.sessionId, payload.data);
        }
        break;
      }

      case WSMessageType.SessionStatusUpdate: {
        const session = message.payload as SessionInfo;
        if (statusUpdateHandlerRef.current) {
          statusUpdateHandlerRef.current(session);
        }
        break;
      }

      case WSMessageType.SessionList: {
        const state = message.payload as AppState;
        if (sessionListHandlerRef.current) {
          sessionListHandlerRef.current(state);
        }
        break;
      }

      case WSMessageType.SessionCreated: {
        const session = message.payload as SessionInfo;
        if (sessionCreatedHandlerRef.current) {
          sessionCreatedHandlerRef.current(session);
        }
        break;
      }

      case WSMessageType.SessionClosed: {
        if (message.sessionId !== undefined && sessionClosedHandlerRef.current) {
          sessionClosedHandlerRef.current(message.sessionId);
        }
        break;
      }

      case WSMessageType.Error: {
        const payload = message.payload as { message: string };
        console.error('Server error:', payload.message);
        break;
      }

      default:
        console.warn('Unknown message type:', message.type);
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Send helper
  const send = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }, []);

  // API methods
  const sendInput = useCallback((sessionId: number, data: string) => {
    send({
      type: WSMessageType.SessionInput,
      sessionId,
      payload: { data }
    });
  }, [send]);

  const sendResize = useCallback((sessionId: number, cols: number, rows: number) => {
    send({
      type: WSMessageType.SessionResize,
      sessionId,
      payload: { cols, rows }
    });
  }, [send]);

  const createSession = useCallback((mode?: TerminalMode) => {
    send({
      type: WSMessageType.SessionCreate,
      payload: mode ? { mode } : undefined
    });
  }, [send]);

  const launchSession = useCallback((sessionId: number, workingDir?: string) => {
    send({
      type: WSMessageType.SessionLaunch,
      sessionId,
      payload: workingDir ? { workingDir } : undefined
    });
  }, [send]);

  const closeSession = useCallback((sessionId: number) => {
    send({
      type: WSMessageType.SessionClose,
      sessionId
    });
  }, [send]);

  const setSessionMode = useCallback((sessionId: number, mode: TerminalMode) => {
    send({
      type: WSMessageType.SessionSetMode,
      sessionId,
      payload: { mode }
    });
  }, [send]);

  const setSessionBranch = useCallback((sessionId: number, branch: string | null) => {
    send({
      type: WSMessageType.SessionSetBranch,
      sessionId,
      payload: { branch }
    });
  }, [send]);

  // Handler setters
  const onOutput = useCallback((handler: MessageHandler) => {
    outputHandlerRef.current = handler;
  }, []);

  const onStatusUpdate = useCallback((handler: StateUpdateHandler) => {
    statusUpdateHandlerRef.current = handler;
  }, []);

  const onSessionList = useCallback((handler: SessionListHandler) => {
    sessionListHandlerRef.current = handler;
  }, []);

  const onSessionCreated = useCallback((handler: StateUpdateHandler) => {
    sessionCreatedHandlerRef.current = handler;
  }, []);

  const onSessionClosed = useCallback((handler: (sessionId: number) => void) => {
    sessionClosedHandlerRef.current = handler;
  }, []);

  return {
    connected,
    sendInput,
    sendResize,
    createSession,
    launchSession,
    closeSession,
    setSessionMode,
    setSessionBranch,
    onOutput,
    onStatusUpdate,
    onSessionList,
    onSessionCreated,
    onSessionClosed
  };
}
