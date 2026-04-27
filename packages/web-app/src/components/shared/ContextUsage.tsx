/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type FC } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';

function formatK(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

/**
 * Compact pill showing how much of the model's input context window the
 * most recent turn consumed. Positioned in the ChatView header.
 *
 * Colour ladder:
 *   < 50%   green
 *   50–75%  yellow
 *   75–90%  orange
 *   ≥ 90%   red + tooltip suggesting /compress
 */
export const ContextUsage: FC = () => {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const tokenUsage = useMessageStore((s) =>
    activeSessionId ? s.tokenUsageBySession[activeSessionId] : null,
  );
  const modelLimits = useMessageStore((s) => s.modelLimits);

  const inputLimit = modelLimits?.input;
  const totalPromptTokens = tokenUsage?.inputTokens ?? 0;
  const cachedTokens = tokenUsage?.cacheReadInputTokens ?? 0;
  // Use the full prompt token count (input only, cache included) as the
  // context-window occupancy indicator. Cached tokens still occupy window
  // slots — a 200K prompt with 180K cached is still 200K/262K full.
  // Cache info is surfaced in the tooltip for reference only.
  const used = totalPromptTokens;

  if (!inputLimit || inputLimit <= 0) return null;
  if (used <= 0) {
    return (
      <div
        className="flex items-center gap-1.5 text-[11px] text-[#8a8a8a]"
        title={`Model context window: ${formatK(inputLimit)} tokens`}
      >
        <span>ctx</span>
        <span className="font-mono">—</span>
      </div>
    );
  }

  const pct = Math.min(100, (used / inputLimit) * 100);

  let barColor = 'bg-emerald-500';
  let textColor = 'text-emerald-400';
  let hint = '';
  if (pct >= 90) {
    barColor = 'bg-red-500';
    textColor = 'text-red-400';
    hint = ' — Consider /compress';
  } else if (pct >= 75) {
    barColor = 'bg-orange-500';
    textColor = 'text-orange-400';
    hint = ' — Consider /compress';
  } else if (pct >= 50) {
    barColor = 'bg-yellow-500';
    textColor = 'text-yellow-400';
  }

  const cacheNote =
    cachedTokens > 0
      ? ` · ${cachedTokens.toLocaleString()} tokens served from cache (not counted)`
      : '';
  const title =
    `${used.toLocaleString()} fresh / ${inputLimit.toLocaleString()} tokens (${pct.toFixed(1)}%)` +
    (modelLimits?.model ? ` · model: ${modelLimits.model}` : '') +
    cacheNote +
    hint;

  return (
    <div className="flex items-center gap-1.5 text-[11px]" title={title}>
      <span className="text-[#8a8a8a]">ctx</span>
      <div className="w-14 h-1 rounded-full bg-[#2e2e2e] overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono ${textColor}`}>
        {formatK(used)}/{formatK(inputLimit)}
      </span>
      <span className={`font-mono ${textColor}`}>
        {pct < 10 ? pct.toFixed(1) : Math.round(pct)}%
      </span>
    </div>
  );
};
