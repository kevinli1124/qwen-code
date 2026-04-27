/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, type FC } from 'react';
import type { PermissionRequest } from '../../types/message';

export type PermissionDecision =
  | 'allow_once'
  | 'allow_project'
  | 'allow_user'
  | 'deny';

interface PermissionCardProps {
  request: PermissionRequest;
  projectCwd?: string;
  onDecide: (decision: PermissionDecision) => void;
}

function shortenPath(p: string | undefined, max = 80): string {
  if (!p) return '';
  if (p.length <= max) return p;
  return `…${p.slice(-max + 1)}`;
}

function clipText(s: string, max = 500): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… (${s.length - max} more characters)`;
}

// Render tool-specific details. Falls back to a generic JSON block so
// unknown tools still show what they're about to do.
function renderToolDetail(toolName: string, input: Record<string, unknown>) {
  const get = (k: string) => input?.[k];

  if (toolName === 'write_file') {
    const path = String(get('file_path') ?? get('path') ?? '');
    const content = String(get('content') ?? '');
    return (
      <>
        <DetailRow label="File">
          <span className="font-mono text-[12px] text-[#e8e6e3] break-all">
            {shortenPath(path)}
          </span>
        </DetailRow>
        <DetailRow label="New content">
          <pre className="font-mono text-[12px] leading-relaxed text-[#d4d4d4] bg-[#1a1a1a] border border-[#2e2e2e] rounded p-2 max-h-[240px] overflow-auto whitespace-pre-wrap">
            {clipText(content)}
          </pre>
        </DetailRow>
      </>
    );
  }

  if (toolName === 'edit' || toolName === 'replace') {
    const path = String(get('file_path') ?? get('path') ?? '');
    const oldStr = String(get('old_string') ?? '');
    const newStr = String(get('new_string') ?? '');
    return (
      <>
        <DetailRow label="File">
          <span className="font-mono text-[12px] text-[#e8e6e3] break-all">
            {shortenPath(path)}
          </span>
        </DetailRow>
        <DetailRow label="Change">
          <div className="font-mono text-[12px] leading-relaxed bg-[#1a1a1a] border border-[#2e2e2e] rounded overflow-auto max-h-[240px]">
            <pre className="px-2 py-1 bg-[#3a1f1f] text-[#f8b4b4] whitespace-pre-wrap">
              − {clipText(oldStr, 300)}
            </pre>
            <pre className="px-2 py-1 bg-[#1f3a23] text-[#b8e8b8] whitespace-pre-wrap">
              + {clipText(newStr, 300)}
            </pre>
          </div>
        </DetailRow>
      </>
    );
  }

  if (toolName === 'run_shell_command') {
    const command = String(get('command') ?? '');
    const description = get('description');
    const directory = get('directory');
    return (
      <>
        <DetailRow label="Command">
          <pre className="font-mono text-[12px] text-[#e8e6e3] bg-[#1a1a1a] border border-[#2e2e2e] rounded p-2 whitespace-pre-wrap break-all">
            {command}
          </pre>
        </DetailRow>
        {typeof description === 'string' && description && (
          <DetailRow label="Purpose">
            <span className="text-[12px] text-[#c0c0c0]">{description}</span>
          </DetailRow>
        )}
        {typeof directory === 'string' && directory && (
          <DetailRow label="Working dir">
            <span className="font-mono text-[12px] text-[#8a8a8a]">
              {shortenPath(directory)}
            </span>
          </DetailRow>
        )}
      </>
    );
  }

  // Generic fallback — pretty JSON of the input.
  const json = JSON.stringify(input, null, 2);
  return (
    <DetailRow label="Arguments">
      <pre className="font-mono text-[12px] leading-relaxed text-[#d4d4d4] bg-[#1a1a1a] border border-[#2e2e2e] rounded p-2 max-h-[240px] overflow-auto whitespace-pre-wrap">
        {clipText(json)}
      </pre>
    </DetailRow>
  );
}

const DetailRow: FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex flex-col gap-1">
    <div className="text-[10px] uppercase tracking-wider text-[#8a8a8a]">
      {label}
    </div>
    {children}
  </div>
);

export const PermissionCard: FC<PermissionCardProps> = ({
  request,
  projectCwd,
  onDecide,
}) => {
  const input = (request.input ?? {}) as Record<string, unknown>;
  const projectScope = projectCwd ?? 'this project';

  // Keyboard shortcuts: Enter/Space → allow once, Escape → deny
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onDecide('allow_once');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDecide('deny');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDecide]);

  // Shell command snippet for the context line
  const isShellTool =
    request.toolName === 'bash' || request.toolName === 'run_shell_command';
  const shellCommand = isShellTool
    ? String(input?.command ?? '').slice(0, 80) || null
    : null;

  // Matches QuestionModal's outer wrapper so the two dialogs feel like
  // the same product. Dim backdrop keeps focus on the prompt; card
  // stays centered so the draft text in InputBar (still mounted) sits
  // visually behind it instead of being replaced.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-[640px] max-w-[90vw] max-h-[85vh] overflow-y-auto flex flex-col gap-3 bg-[#242424] border border-[#2e2e2e] rounded-lg px-4 py-3 shadow-2xl animate-fade-up">
        {/* Context line — subtle identifier above the main header */}
        <div className="text-xs text-[#8a8a8a]">
          Agent is requesting permission to use{' '}
          <span className="font-semibold text-[#b0b0b0]">
            {request.toolName}
          </span>
          {shellCommand && (
            <>
              {' '}
              —{' '}
              <span className="font-mono text-[#8a8a8a]">
                {shellCommand}
                {((input?.command as string | undefined)?.length ?? 0 > 80)
                  ? '…'
                  : ''}
              </span>
            </>
          )}
        </div>

        {/* Header */}
        <div className="flex items-start gap-2">
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-[11px] font-bold">
            !
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[#e8e6e3]">
              Permission required
            </div>
            <div className="text-[11px] text-[#8a8a8a] mt-0.5">
              The agent wants to run{' '}
              <span className="font-mono text-[#e8e6e3]">
                {request.toolName}
              </span>
              . Review before approving.
            </div>
          </div>
        </div>

        {/* Tool-specific detail */}
        <div className="flex flex-col gap-2">
          {renderToolDetail(request.toolName, input)}
        </div>

        {/* Decision buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => onDecide('allow_once')}
            className="flex-1 min-w-[100px] px-3 py-1.5 rounded bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
            autoFocus
          >
            Allow once
          </button>
          <button
            onClick={() => onDecide('allow_project')}
            className="flex-1 min-w-[140px] px-3 py-1.5 rounded bg-[#2e2e2e] text-[#e8e6e3] text-xs font-medium hover:bg-[#3e3e3e] border border-[#3e3e3e] transition-colors"
            title={`Remember this for ${projectScope}`}
          >
            Always for this project
          </button>
          <button
            onClick={() => onDecide('allow_user')}
            className="flex-1 min-w-[110px] px-3 py-1.5 rounded bg-[#2e2e2e] text-[#e8e6e3] text-xs font-medium hover:bg-[#3e3e3e] border border-[#3e3e3e] transition-colors"
            title="Remember globally"
          >
            Always allow
          </button>
          <button
            onClick={() => onDecide('deny')}
            className="px-3 py-1.5 rounded bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 border border-red-500/30 transition-colors"
          >
            Deny
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-[#8a8a8a]">
          <div>
            {projectCwd ? (
              <>
                Project:{' '}
                <span className="font-mono text-[#a0a0a0]">
                  {shortenPath(projectCwd, 60)}
                </span>
              </>
            ) : null}
          </div>
          <div className="text-[#5a5a5a]">
            Press Enter to allow · Esc to deny
          </div>
        </div>
      </div>
    </div>
  );
};
