/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, type FC } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import type { FileOperationEntry } from '../../types/message';
import { sessionsApi } from '../../api/sessions';

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

interface FileMod {
  callId: string;
  path: string;
  before: string | null;
  after: string | null;
  toolName: string;
  reverted?: boolean;
}

function ModRow({ mod, sessionId }: { mod: FileMod; sessionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const markFileReverted = useMessageStore((s) => s.markFileReverted);
  const fileName = mod.path.replace(/\\/g, '/').split('/').pop() ?? mod.path;

  async function handleRevert(): Promise<void> {
    setReverting(true);
    setErr(null);
    try {
      const result = await sessionsApi.revertFile(sessionId, mod.callId);
      if (result.ok) {
        markFileReverted(sessionId, mod.callId);
      } else {
        setErr(result.reason ?? 'Revert failed');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setReverting(false);
    }
  }

  return (
    <div className="border-b border-[#2e2e2e] last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1e1e1e] transition-colors"
      >
        <span
          className={`text-[10px] font-bold font-mono w-4 flex-shrink-0 ${
            mod.reverted ? 'text-[#6e6e6e]' : 'text-orange-400'
          }`}
        >
          {mod.toolName === 'edit' || mod.toolName === 'replace' ? 'E' : 'W'}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={`text-xs truncate ${
              mod.reverted ? 'text-[#8a8a8a] line-through' : 'text-[#e8e6e3]'
            }`}
          >
            {fileName}
          </div>
          <div className="text-[10px] text-[#8a8a8a] truncate">{mod.path}</div>
        </div>
        {mod.reverted ? (
          <span className="text-[10px] text-[#6e6e6e] px-1.5 py-0.5 rounded bg-[#2a2a2a]">
            reverted
          </span>
        ) : (
          <span
            onClick={(e) => {
              e.stopPropagation();
              void handleRevert();
            }}
            className="text-[10px] text-orange-400 hover:text-orange-300 px-1.5 py-0.5 rounded bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30"
            role="button"
          >
            {reverting ? 'Reverting…' : 'Revert'}
          </span>
        )}
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
      {expanded && (
        <div className="px-3 py-2 font-mono text-[10px] bg-[#0f0f0f]">
          {err && <div className="text-red-400 mb-1">⚠ {err}</div>}
          {mod.before === null ? (
            <div className="text-emerald-400">(new file)</div>
          ) : (
            <pre className="whitespace-pre-wrap text-[#f8b4b4] bg-[#2a1414] px-2 py-1 rounded max-h-32 overflow-auto">
              − {mod.before.slice(0, 400)}
              {mod.before.length > 400 && '…'}
            </pre>
          )}
          {mod.after != null && (
            <pre className="whitespace-pre-wrap text-[#b8e8b8] bg-[#142a18] px-2 py-1 rounded mt-1 max-h-32 overflow-auto">
              + {mod.after.slice(0, 400)}
              {mod.after.length > 400 && '…'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export const FilesPanel: FC<FilesPanelProps> = ({ sessionId }) => {
  const fileOpsBySession = useMessageStore((s) => s.fileOpsBySession);
  const fileModsBySession = useMessageStore((s) => s.fileModsBySession);
  const ops = sessionId ? (fileOpsBySession[sessionId] ?? []) : [];
  const modsMap = sessionId ? fileModsBySession[sessionId] : undefined;
  const mods: FileMod[] = modsMap
    ? Object.values(modsMap).sort(
        (a, b) =>
          (ops.findIndex((o) => o.callId === b.callId) || 0) -
          (ops.findIndex((o) => o.callId === a.callId) || 0),
      )
    : [];

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[#8a8a8a]">
        No active session
      </div>
    );
  }

  if (ops.length === 0 && mods.length === 0) {
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
      {mods.length > 0 && (
        <>
          <div className="px-3 py-2 text-[10px] text-[#8a8a8a] uppercase tracking-wider border-b border-[#2e2e2e] flex items-center justify-between">
            <span>Modifications ({mods.length})</span>
            <span className="text-[9px] text-orange-400/70">
              Click to expand / revert
            </span>
          </div>
          {mods.map((m) => (
            <ModRow key={m.callId} mod={m} sessionId={sessionId} />
          ))}
        </>
      )}
      {ops.length > 0 && (
        <>
          <div className="px-3 py-2 text-[10px] text-[#8a8a8a] uppercase tracking-wider border-b border-[#2e2e2e] mt-1">
            Files touched ({ops.length})
          </div>
          {ops.map((op) => (
            <FileOpRow key={`op-${op.callId}`} op={op} />
          ))}
        </>
      )}
    </div>
  );
};
