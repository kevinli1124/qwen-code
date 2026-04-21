/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, type FC } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import type { FileOperationEntry } from '../../types/message';

interface FilesPanelProps {
  sessionId: string | null;
}

function FileOpIcon({ type }: { type: FileOperationEntry['type'] }) {
  const styles = {
    read: 'text-blue-400',
    write: 'text-green-400',
    edit: 'text-yellow-400',
  };
  const labels = { read: 'R', write: 'W', edit: 'E' };
  return (
    <span
      className={`text-[10px] font-bold font-mono ${styles[type]} w-4 flex-shrink-0`}
    >
      {labels[type]}
    </span>
  );
}

function FileOpRow({ op }: { op: FileOperationEntry }) {
  const [expanded, setExpanded] = useState(false);
  const fileName = op.path.replace(/\\/g, '/').split('/').pop() ?? op.path;

  return (
    <div className="border-b border-[#2e2e2e] last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1e1e1e] transition-colors"
      >
        <FileOpIcon type={op.type} />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[#e8e6e3] truncate">{fileName}</div>
          <div className="text-[10px] text-[#8a8a8a] truncate">{op.path}</div>
        </div>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`text-[#8a8a8a] flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path
            d="M2 3l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {expanded && op.content && (
        <pre className="px-3 py-2 text-[10px] font-mono text-[#8a8a8a] bg-[#0f0f0f] overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
          {op.content}
        </pre>
      )}
    </div>
  );
}

export const FilesPanel: FC<FilesPanelProps> = ({ sessionId }) => {
  const fileOpsBySession = useMessageStore((s) => s.fileOpsBySession);
  const ops = sessionId ? (fileOpsBySession[sessionId] ?? []) : [];

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[#8a8a8a]">
        No active session
      </div>
    );
  }

  if (ops.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-[#8a8a8a]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="text-xs">No files touched yet</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-2 text-[10px] text-[#8a8a8a] uppercase tracking-wider border-b border-[#2e2e2e]">
        Files touched this session ({ops.length})
      </div>
      {ops.map((op) => (
        <FileOpRow key={op.callId} op={op} />
      ))}
    </div>
  );
};
