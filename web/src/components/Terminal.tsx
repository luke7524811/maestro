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
  onResize
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isDisposedRef = useRef(false);

  // Handle incoming data from server
  const writeData = useCallback((data: string) => {
    if (terminalRef.current && !isDisposedRef.current) {
      terminalRef.current.write(data);
    }
  }, []);

  // Expose writeData method via ref
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      (container as any).writeData = writeData;
    }
  }, [writeData]);

  // Initialize terminal - use empty deps to only run once
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

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

    terminal.open(containerRef.current);

    // Initial fit after a small delay to ensure DOM is ready
    setTimeout(() => {
      if (!isDisposedRef.current) {
        fitAddon.fit();
        terminal.focus();
      }
    }, 50);

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

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Report initial size
    onResize(terminal.cols, terminal.rows);

    // Observe container resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && !isDisposedRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch (e) {
          // Ignore fit errors during disposal
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      isDisposedRef.current = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();

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
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="terminal-container w-full h-full"
      onClick={handleClick}
      data-session-id={sessionId}
    />
  );
};

// Helper to get terminal write function from DOM element
export function getTerminalWriter(sessionId: number): ((data: string) => void) | null {
  const container = document.querySelector(`[data-session-id="${sessionId}"]`) as any;
  return container?.writeData || null;
}
