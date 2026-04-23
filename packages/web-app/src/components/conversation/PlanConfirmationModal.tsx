/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, type FC } from 'react';

export type PlanAction = 'accept-ask' | 'accept-auto' | 'reject';

interface PlanConfirmationModalProps {
  plan: string;
  onDecide: (action: PlanAction, feedback?: string) => void;
}

/**
 * Full-screen modal shown when the agent finishes drafting a plan via
 * exit_plan_mode. The plan body is rendered as pre-formatted markdown
 * (cheap — no markdown lib needed for readability). The user picks one
 * of three actions; the optional textarea becomes a follow-up user
 * message that flows through the chat after approval.
 */
export const PlanConfirmationModal: FC<PlanConfirmationModalProps> = ({
  plan,
  onDecide,
}) => {
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState<PlanAction | null>(null);

  const decide = (action: PlanAction) => {
    if (busy) return;
    setBusy(action);
    onDecide(action, feedback.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-[760px] max-h-[85vh] flex flex-col bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[#2e2e2e]">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-sm font-bold">
            ✓
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[#e8e6e3]">
              Plan ready for review
            </h2>
            <p className="text-[11px] text-[#8a8a8a] mt-0.5">
              The agent drafted the following plan. Review before approving —
              destructive tools stay blocked until you accept.
            </p>
          </div>
        </div>

        {/* Plan body */}
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
          <pre className="font-mono text-[13px] text-[#d4d4d4] whitespace-pre-wrap leading-relaxed">
            {plan || '(empty plan)'}
          </pre>
        </div>

        {/* Optional feedback */}
        <div className="px-5 pt-3 border-t border-[#2e2e2e]">
          <label className="text-[10px] uppercase tracking-wider text-[#8a8a8a]">
            Optional feedback (sent as a follow-up message after approval)
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. also run tests after the changes"
            rows={2}
            className="mt-1 w-full resize-none bg-[#242424] border border-[#2e2e2e] rounded px-2 py-1.5 text-[12px] text-[#e8e6e3] placeholder:text-[#6e6e6e] focus:outline-none focus:border-[#3e3e3e]"
          />
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-[#2e2e2e]">
          <button
            onClick={() => decide('accept-ask')}
            disabled={busy !== null}
            className="flex-1 min-w-[180px] px-3 py-2 rounded bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-60 transition-colors"
            autoFocus
          >
            {busy === 'accept-ask'
              ? 'Working…'
              : 'Approve · ask before each tool'}
          </button>
          <button
            onClick={() => decide('accept-auto')}
            disabled={busy !== null}
            className="flex-1 min-w-[180px] px-3 py-2 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-medium disabled:opacity-60 transition-colors"
            title="Approve and switch to auto-edit mode — tools run without further prompts"
          >
            {busy === 'accept-auto' ? 'Working…' : 'Approve · auto-edit'}
          </button>
          <button
            onClick={() => decide('reject')}
            disabled={busy !== null}
            className="px-3 py-2 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium disabled:opacity-60 transition-colors"
          >
            {busy === 'reject' ? 'Working…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
};
