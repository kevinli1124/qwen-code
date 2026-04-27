/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type FC } from 'react';

interface ThinkingBubbleProps {
  /** 'sending' = POST in flight; 'thinking' = waiting for first LLM token */
  status: 'sending' | 'thinking';
}

/**
 * Inline thinking indicator rendered in the conversation flow, right after
 * the user's last message and before the first assistant token arrives.
 *
 * Mirrors the assistant message style so it feels like a natural part of
 * the conversation — industry standard pattern (Claude.ai, ChatGPT, Cursor).
 */
export const ThinkingBubble: FC<ThinkingBubbleProps> = ({ status }) => {
  const label = status === 'sending' ? 'Sending…' : 'Thinking…';

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Avatar — same Q mark used elsewhere */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center mt-0.5">
        <span className="text-[11px] font-bold text-accent">Q</span>
      </div>

      {/* Bubble */}
      <div className="flex items-center gap-2.5 bg-[#242424] border border-[#2e2e2e] rounded-2xl rounded-tl-sm px-4 py-2.5">
        {/* Animated dots */}
        <div className="flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#6a6a6a] animate-bounce"
            style={{ animationDelay: '0ms', animationDuration: '1.2s' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#6a6a6a] animate-bounce"
            style={{ animationDelay: '200ms', animationDuration: '1.2s' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#6a6a6a] animate-bounce"
            style={{ animationDelay: '400ms', animationDuration: '1.2s' }}
          />
        </div>

        {/* Status label */}
        <span className="text-xs text-[#5a5a5a] select-none">{label}</span>

        {/* Subtle connection indicator for 'sending' */}
        {status === 'sending' && (
          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
        )}
        {status === 'thinking' && (
          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        )}
      </div>
    </div>
  );
};
