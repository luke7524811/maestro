/**
 * Terminal component using xterm.js
 * Port of: TerminalView.swift, EmbeddedTerminalView
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalProps {
  sessionId: number;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onFocus?: () => void;
}

// Terminal functions interface
interface TerminalFunctions {
  write: (data: string) => void;
  clear: () => void;
}

// Global registry for terminal functions - more reliable than DOM queries
const terminalRegistry = new Map<number, TerminalFunctions>();
// Buffer for data that arrives before terminal is ready
const pendingDataBuffer = new Map<number, string[]>();

// Register a terminal's functions
export function registerTerminal(sessionId: number, writeFn: (data: string) => void, clearFn: () => void) {
  terminalRegistry.set(sessionId, { write: writeFn, clear: clearFn });
  // Flush any pending data
  const pending = pendingDataBuffer.get(sessionId);
  if (pending && pending.length > 0) {
    console.log(`Flushing ${pending.length} pending messages for session ${sessionId}`);
    pending.forEach(data => writeFn(data));
    pendingDataBuffer.delete(sessionId);
  }
}

// Unregister a terminal
export function unregisterTerminal(sessionId: number) {
  terminalRegistry.delete(sessionId);
}

// Write data to a terminal (buffers if terminal not ready)
function writeToTerminalInternal(sessionId: number, data: string) {
  const fns = terminalRegistry.get(sessionId);
  if (fns) {
    fns.write(data);
  } else {
    // Buffer data until terminal is ready
    if (!pendingDataBuffer.has(sessionId)) {
      pendingDataBuffer.set(sessionId, []);
    }
    pendingDataBuffer.get(sessionId)!.push(data);
    console.log(`Buffering data for session ${sessionId} (terminal not ready)`);
  }
}

export const writeToTerminal = writeToTerminalInternal;

// Clear a terminal's content
export function clearTerminal(sessionId: number) {
  const fns = terminalRegistry.get(sessionId);
  if (fns) {
    fns.clear();
    console.log(`Cleared terminal for session ${sessionId}`);
  }
  // Also clear any pending data
  pendingDataBuffer.delete(sessionId);
}

// Catppuccin Mocha theme - matches Swift installColors
const CATPPUCCIN_THEME = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorAccent: '#1e1e2e',
  selectionBackground: '#45475a',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8'
};

export const Terminal: React.FC<TerminalProps> = ({
  sessionId,
  onData,
  onResize,
  onFocus
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isDisposedRef = useRef(false);

  // Initialize terminal and register in global registry
  useEffect(() => {
    const container = containerRef.current;
    if (!container || terminalRef.current) return;

    // Ensure container has dimensions before initializing
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // Retry after a short delay if container not ready
      const retryTimeout = setTimeout(() => {
        // Force re-render by triggering state change
        container.style.minHeight = '100px';
      }, 100);
      return () => clearTimeout(retryTimeout);
    }

    isDisposedRef.current = false;

    const terminal = new XTerm({
      theme: CATPPUCCIN_THEME,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      disableStdin: false,
      convertEol: true
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(container);

    // Store refs immediately after opening
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Register terminal in global registry - must happen AFTER terminalRef is set
    // so that write/clear functions have access to the terminal instance
    registerTerminal(
      sessionId,
      (data: string) => {
        if (terminalRef.current && !isDisposedRef.current) {
          terminalRef.current.write(data);
          terminalRef.current.scrollToBottom();
        }
      },
      () => {
        if (terminalRef.current && !isDisposedRef.current) {
          terminalRef.current.clear();
          terminalRef.current.reset();
        }
      }
    );

    // Initial fit after a small delay to ensure DOM is ready
    const fitTimeout = setTimeout(() => {
      if (!isDisposedRef.current && fitAddonRef.current && terminalRef.current) {
        try {
          fitAddon.fit();
          terminal.focus();
          // Report initial size after fit
          onResize(terminal.cols, terminal.rows);
        } catch (e) {
          console.warn('Initial fit failed:', e);
        }
      }
    }, 100);

    // Handle user input - send to server
    const dataDisposable = terminal.onData((data) => {
      if (!isDisposedRef.current) {
        onData(data);
      }
    });

    // Handle resize
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (!isDisposedRef.current) {
        onResize(cols, rows);
      }
    });

    // Observe container resize with debounce
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current && !isDisposedRef.current) {
          try {
            fitAddonRef.current.fit();
          } catch (e) {
            // Ignore fit errors during disposal
          }
        }
      }, 50);
    });
    resizeObserver.observe(container);

    return () => {
      isDisposedRef.current = true;
      if (resizeTimeout) clearTimeout(resizeTimeout);
      clearTimeout(fitTimeout);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();

      // Unregister from global registry
      unregisterTerminal(sessionId);

      // Clear refs before dispose to prevent race conditions
      terminalRef.current = null;
      fitAddonRef.current = null;

      // Dispose terminal in next tick to avoid render conflicts
      setTimeout(() => {
        try {
          terminal.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
      }, 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // Only reinitialize if sessionId changes

  // Focus terminal on click
  const handleClick = useCallback(() => {
    if (terminalRef.current && !isDisposedRef.current) {
      terminalRef.current.focus();
      // Notify parent about focus change
      if (onFocus) {
        onFocus();
      }
    }
  }, [onFocus]);

  return (
    <div
      ref={containerRef}
      className="terminal-container w-full h-full"
      onClick={handleClick}
      data-session-id={sessionId}
    />
  );
};

