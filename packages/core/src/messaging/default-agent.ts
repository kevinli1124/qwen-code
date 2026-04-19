/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SubagentConfig } from '../subagents/types.js';

/**
 * Sentinel agent name used by message triggers when the user hasn't pinned a
 * specific `.qwen/agents/<name>.md` — the dispatcher swaps in this synthetic
 * config so the user doesn't have to create a file just to test the gateway.
 *
 * We intentionally prefix with `__` so it cannot collide with a user-created
 * agent (the subagent-manager rejects names starting with `__`).
 */
export const DEFAULT_AGENT_NAME = '__default_assistant__';

/**
 * Returns a minimal, in-memory SubagentConfig used when a MessageTrigger
 * doesn't specify an agentRef.
 *
 * Design tradeoff on `runConfig` caps: chat on a mobile is latency-sensitive,
 * so we want *tight* turn + time budgets so an uncooperative reasoning loop
 * can't pin the dispatcher. But the user actually wants the bot to get
 * things done (read a file, grep a repo, append a note). Earlier we
 * over-clamped this to 2 turns + no tools, which turned the bot into a
 * useless chatterbox. Current settings give headroom for ~2 tool calls
 * inside ~2 minutes, with the dispatcher's 90 s hard timeout as the final
 * backstop when even this is overshot.
 */
export function defaultAssistantConfig(): SubagentConfig {
  return {
    name: DEFAULT_AGENT_NAME,
    description:
      'Default conversational assistant used by message triggers when no specific agent is pinned.',
    systemPrompt: [
      "You are the user's personal assistant, reached through a messaging",
      'channel (Telegram, Discord, CLI, …). Prior turns in this conversation',
      'are already in your history — use them for continuity.',
      '',
      'Finish in as few turns as possible. The user is on mobile and cannot',
      'see your internal reasoning — put the actual answer in your reply.',
      'If the question needs a tool (read a file, grep, write a note), use',
      'it decisively, then reply with the result. Do not plan out loud,',
      'do not call the same tool twice on the same target, and never',
      'fabricate tool output.',
      'If you cannot find the answer within a couple of tool calls, say so',
      'plainly rather than looping.',
    ].join('\n'),
    level: 'session',
    runConfig: {
      max_turns: 6,
      max_time_minutes: 2,
    },
  };
}
