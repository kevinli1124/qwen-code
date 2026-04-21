/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useRef, useEffect, type FC } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import { useMessageStore } from '../../stores/messageStore';

interface TerminalPanelProps {
  sessionId: string | null;
}

export const TerminalPanel: FC<TerminalPanelProps> = ({ sessionId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { write, clear } = useTerminal(containerRef);
  const terminalBySession = useMessageStore((s) => s.terminalBySession);

  const sessionTerminal = sessionId ? (terminalBySession[sessionId] ?? '') : '';
  const prevTerminalRef = useRef('');

  // Write only new chunks
  useEffect(() => {
    const prev = prevTerminalRef.current;
    if (sessionTerminal.length > prev.length) {
      const newChunk = sessionTerminal.slice(prev.length);
      write(newChunk);
    } else if (sessionTerminal.length === 0 && prev.length > 0) {
      clear();
    }
    prevTerminalRef.current = sessionTerminal;
  }, [sessionTerminal, write, clear]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[#8a8a8a]">
        No active session
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full bg-[#0f0f0f] overflow-hidden"
      style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
    />
  );
};
