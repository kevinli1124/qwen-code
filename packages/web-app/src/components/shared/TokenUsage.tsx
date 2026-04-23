/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import type { TokenUsage } from '../../types/message';

interface TokenUsageProps {
  usage: TokenUsage;
  sessionTotal?: { inputTokens: number; outputTokens: number; turns: number };
}

function formatDuration(ms: number | undefined): string {
  if (!Number.isFinite(ms) || ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number | undefined): string {
  if (!Number.isFinite(n) || n == null) return '—';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export const TokenUsageDisplay: FC<TokenUsageProps> = ({
  usage,
  sessionTotal,
}) => (
  <div className="flex items-center gap-3 text-[10px] text-[#8a8a8a]">
    <span title="Last turn: input tokens">
      ↑ {formatTokens(usage.inputTokens)}
    </span>
    <span title="Last turn: output tokens">
      ↓ {formatTokens(usage.outputTokens)}
    </span>
    <span title="Last turn: duration">
      ⏱ {formatDuration(usage.durationMs)}
    </span>
    {sessionTotal && sessionTotal.turns > 0 && (
      <span
        className="opacity-70"
        title={`Session total across ${sessionTotal.turns} turn(s)`}
      >
        · Σ {formatTokens(sessionTotal.inputTokens + sessionTotal.outputTokens)}
      </span>
    )}
  </div>
);
