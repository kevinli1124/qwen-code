/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, type FC } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { sessionsApi } from '../../api/sessions';

type Mode = 'plan' | 'default' | 'auto-edit';

const ORDER: Mode[] = ['plan', 'default', 'auto-edit'];

const LABELS: Record<Mode, { short: string; full: string; tooltip: string }> = {
  plan: {
    short: 'Plan',
    full: 'Plan mode',
    tooltip:
      'Plan mode — the agent drafts a plan; destructive tools are blocked until you exit plan mode.',
  },
  default: {
    short: 'Ask',
    full: 'Ask permission',
    tooltip:
      'Ask permission — destructive tools (write / edit / shell) prompt before running.',
  },
  'auto-edit': {
    short: 'Auto',
    full: 'Auto-edit',
    tooltip:
      'Auto-edit — file edits run without a prompt. Use with trusted work; click to cycle back to Ask.',
  },
};

const STYLES: Record<Mode, { bg: string; text: string; dot: string }> = {
  plan: {
    bg: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30',
    text: 'text-sky-300',
    dot: 'bg-sky-400',
  },
  default: {
    bg: 'bg-[#2e2e2e] hover:bg-[#3e3e3e] border-[#3e3e3e]',
    text: 'text-[#e8e6e3]',
    dot: 'bg-[#a0a0a0]',
  },
  'auto-edit': {
    bg: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
  },
};

interface ApprovalModeToggleProps {
  sessionId: string | null;
}

export const ApprovalModeToggle: FC<ApprovalModeToggleProps> = ({
  sessionId,
}) => {
  const approvalMode = useMessageStore((s) => s.approvalMode);
  const setApprovalMode = useMessageStore((s) => s.setApprovalMode);
  const [busy, setBusy] = useState(false);

  // Map yolo → 'Auto-edit' bucket for display; we don't cycle into yolo.
  const currentMode: Mode =
    approvalMode === 'plan' ||
    approvalMode === 'auto-edit' ||
    approvalMode === 'yolo'
      ? approvalMode === 'yolo'
        ? 'auto-edit'
        : approvalMode
      : 'default';

  const label = LABELS[currentMode];
  const style = STYLES[currentMode];

  async function cycle(): Promise<void> {
    if (!sessionId || busy) return;
    const idx = ORDER.indexOf(currentMode);
    const next = ORDER[(idx + 1) % ORDER.length]!;
    setBusy(true);
    // Optimistic update — the child doesn't emit a confirmation event.
    setApprovalMode(next);
    try {
      await sessionsApi.setApprovalMode(sessionId, next);
    } catch {
      // Roll back on failure
      setApprovalMode(currentMode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={cycle}
      disabled={!sessionId || busy}
      title={label.tooltip}
      className={[
        'flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium transition-colors',
        style.bg,
        style.text,
        busy ? 'opacity-60 cursor-wait' : 'cursor-pointer',
      ].join(' ')}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      <span>{label.short}</span>
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
        className="opacity-60"
      >
        <path
          d="M1 4h4M3 2l2 2-2 2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};
