/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import { useMessageStore } from '../../stores/messageStore';

interface ContextAuditPanelProps {
  sessionId: string | null;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 text-[10px] text-[#666] uppercase tracking-wider border-b border-[#2e2e2e]">
      {label}
    </div>
  );
}

function truncatePathLeft(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  return '…' + path.slice(path.length - (maxLen - 1));
}

export const ContextAuditPanel: FC<ContextAuditPanelProps> = ({
  sessionId,
}) => {
  const tokenUsageBySession = useMessageStore((s) => s.tokenUsageBySession);
  const sessionTokensBySession = useMessageStore(
    (s) => s.sessionTokensBySession,
  );
  const modelLimits = useMessageStore((s) => s.modelLimits);
  const messagesBySession = useMessageStore((s) => s.messagesBySession);
  const fileOpsBySession = useMessageStore((s) => s.fileOpsBySession);
  const toolCallsBySession = useMessageStore((s) => s.toolCallsBySession);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[#8a8a8a]">
        No active session
      </div>
    );
  }

  const latestUsage = tokenUsageBySession[sessionId] ?? null;
  const cumulative = sessionTokensBySession[sessionId] ?? null;
  const messages = messagesBySession[sessionId] ?? [];
  const fileOps = fileOpsBySession[sessionId] ?? [];
  const toolCallsMap = toolCallsBySession[sessionId] ?? {};

  const inputLimit = modelLimits?.input;
  const usedInput = cumulative?.inputTokens ?? latestUsage?.inputTokens ?? null;
  const usedOutput =
    cumulative?.outputTokens ?? latestUsage?.outputTokens ?? null;
  const usedTotal =
    usedInput != null && usedOutput != null ? usedInput + usedOutput : null;

  const usagePct =
    inputLimit != null && usedInput != null
      ? Math.min(100, (usedInput / inputLimit) * 100)
      : null;

  const barColor =
    usagePct == null
      ? '#4a4a4a'
      : usagePct < 50
        ? '#4ade80'
        : usagePct < 80
          ? '#facc15'
          : '#f87171';

  const userCount = messages.filter((m) => m.type === 'user').length;
  const assistantCount = messages.filter((m) => m.type === 'assistant').length;
  const toolMsgCount = messages.filter((m) => m.type === 'tool_call').length;

  const uniqueFilePaths = Array.from(new Set(fileOps.map((op) => op.path)));

  const toolCallsCount = Object.keys(toolCallsMap).length;

  return (
    <div className="h-full overflow-y-auto">
      {/* Section A — Token Summary */}
      <SectionHeader label="Token Usage" />
      <div className="px-3 py-3">
        {usedTotal == null ? (
          <div className="text-xs text-[#8a8a8a]">No data yet</div>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs text-[#e8e6e3]">
                {usedInput?.toLocaleString() ?? '—'}{' '}
                {inputLimit != null ? `/ ${inputLimit.toLocaleString()}` : ''}{' '}
                input tokens
              </span>
              {usagePct != null && (
                <span className="text-[10px] text-[#8a8a8a]">
                  {usagePct.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="w-full h-1 rounded bg-[#2e2e2e] overflow-hidden">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: usagePct != null ? `${usagePct}%` : '0%',
                  backgroundColor: barColor,
                }}
              />
            </div>
            <div className="mt-2 flex gap-4 text-[10px] text-[#8a8a8a]">
              <span>In: {usedInput?.toLocaleString() ?? '—'}</span>
              <span>Out: {usedOutput?.toLocaleString() ?? '—'}</span>
              <span>Total: {usedTotal.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      {/* Section B — Message History */}
      <SectionHeader label="Message History" />
      <div className="px-3 py-3">
        <div className="text-xs text-[#e8e6e3] mb-1">
          {messages.length} message{messages.length !== 1 ? 's' : ''} in history
        </div>
        <div className="flex gap-3 text-[10px] text-[#8a8a8a]">
          <span>{userCount} user</span>
          <span>{assistantCount} assistant</span>
          <span>{toolMsgCount} tool calls</span>
        </div>
      </div>

      {/* Section C — Files Accessed */}
      <SectionHeader label="Files Accessed" />
      <div className="py-1">
        {uniqueFilePaths.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[#8a8a8a]">
            No files accessed yet
          </div>
        ) : (
          uniqueFilePaths.map((path) => (
            <div
              key={path}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#1e1e1e] transition-colors"
            >
              <span className="text-[10px] text-[#666] flex-shrink-0">·</span>
              <span
                className="text-[11px] text-[#8a8a8a] font-mono truncate"
                title={path}
              >
                {truncatePathLeft(path)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Section D — Active Tools */}
      <SectionHeader label="Tool Calls" />
      <div className="px-3 py-3">
        <div className="text-xs text-[#e8e6e3]">
          {toolCallsCount} tool call{toolCallsCount !== 1 ? 's' : ''} this
          session
        </div>
      </div>
    </div>
  );
};
