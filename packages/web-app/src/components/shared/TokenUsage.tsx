/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import type { TokenUsage } from '../../types/message';

interface TokenUsageProps {
  usage: TokenUsage;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export const TokenUsageDisplay: FC<TokenUsageProps> = ({ usage }) => (
  <div className="flex items-center gap-3 text-[10px] text-[#8a8a8a]">
    <span>↑ {formatTokens(usage.inputTokens)}</span>
    <span>↓ {formatTokens(usage.outputTokens)}</span>
    <span>⏱ {formatDuration(usage.durationMs)}</span>
  </div>
);
