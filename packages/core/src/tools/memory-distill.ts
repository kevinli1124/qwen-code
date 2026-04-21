/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * memory_distill — surfaces recent episodes to the model so it can propose
 * durable memories via `memory_write`.
 *
 * How it fits the 4-layer design:
 *   Layer 1 (episodes, auto-captured) → this tool gathers and formats them
 *   → the model reads the formatted prompt and proposes entries for
 *   Layer 2 (structured memories). Phase 2's similarity gate on
 *   `memory_write` (when overwrite=false) catches near-duplicates so the
 *   same lesson does not get promoted twice.
 *
 * The tool itself does NOT call the LLM or write any memory — it just
 * returns a carefully structured `llmContent` that the model reasons over
 * on the same turn. This keeps the tool deterministic, cheap to unit-test,
 * and composable with permission flows that already exist for
 * `memory_write`.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { EpisodeStore } from '../episodes/episode-store.js';
import type { EpisodeConfig } from '../episodes/types.js';
import { totalScore } from '../episodes/types.js';

export interface MemoryDistillParams {
  /** Number of most recent episodes to surface. Default 5, capped at 20. */
  count?: number;
  /** ISO timestamp — only include episodes on or after this. */
  since?: string;
  /** Only include episodes whose total score >= this (0-12). */
  minScore?: number;
  /** Filter by tag (any match). */
  tag?: string;
}

const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;

class MemoryDistillInvocation extends BaseToolInvocation<
  MemoryDistillParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: MemoryDistillParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const parts: string[] = [];
    parts.push(
      `count=${Math.min(this.params.count ?? DEFAULT_COUNT, MAX_COUNT)}`,
    );
    if (this.params.since) parts.push(`since=${this.params.since}`);
    if (this.params.minScore !== undefined)
      parts.push(`minScore=${this.params.minScore}`);
    if (this.params.tag) parts.push(`tag=${this.params.tag}`);
    return parts.join(' ');
  }

  async execute(): Promise<ToolResult> {
    const count = clamp(this.params.count ?? DEFAULT_COUNT, 1, MAX_COUNT);
    const store = new EpisodeStore();

    const episodes = await store.listEpisodes({
      sinceIso: this.params.since,
      minScore: this.params.minScore,
      tags: this.params.tag ? [this.params.tag] : undefined,
      force: true,
    });

    if (episodes.length === 0) {
      return {
        llmContent:
          'No episodes found matching the given filters. Nothing to distill yet — ' +
          'episodes are written automatically after long-running turns (>= 15 tool calls ' +
          'or >= 20 minutes). Propose memories manually via `memory_write` if needed.',
        returnDisplay: 'No episodes to distill',
      };
    }

    const selected = episodes.slice(0, count);

    // Pull the current memory index snapshot so the model can avoid proposing
    // near-duplicates. Phase 2's memory_write similarity gate is the final
    // defense, but showing the index upfront shortens the loop.
    let memoryIndexBlock = '';
    try {
      memoryIndexBlock = await this.config.getMemoryStore().loadIndexContent();
    } catch {
      // Non-fatal — continue without the index.
    }

    const prompt = buildDistillPrompt(selected, memoryIndexBlock);
    return {
      llmContent: prompt,
      returnDisplay: `Distilling ${selected.length} episode${selected.length === 1 ? '' : 's'}`,
    };
  }
}

export class MemoryDistillTool extends BaseDeclarativeTool<
  MemoryDistillParams,
  ToolResult
> {
  static readonly Name = ToolNames.MEMORY_DISTILL;

  constructor(private config: Config) {
    super(
      MemoryDistillTool.Name,
      ToolDisplayNames.MEMORY_DISTILL,
      'Surface recent episodes (completed long-running tasks) so you can propose durable memories. ' +
        'Returns a structured review prompt containing episode summaries, scores, tags, and the current memory index.\n\n' +
        '## When to use\n\n' +
        '- The user asks to "consolidate" or "distill" recent experience.\n' +
        '- You notice ≥ 5 episodes since the last memory update.\n' +
        '- End of a working session when recurring patterns stand out.\n\n' +
        '## How to use the output\n\n' +
        '1. Read each episode in the returned content.\n' +
        '2. For recurring decisions / user preferences / cross-episode facts, call `memory_write` with `overwrite: false` — the similarity gate will flag any near-duplicates against the existing memory index.\n' +
        '3. Do NOT save transient task state, debug steps, or anything that re-reading the repo would recover.\n' +
        '4. Prefer updating an existing memory over creating a parallel one.\n\n' +
        '## Parameters\n\n' +
        '- `count` — how many of the most recent episodes to surface (default 5, max 20).\n' +
        '- `since` — ISO timestamp filter; only episodes at/after this are considered.\n' +
        '- `minScore` — only episodes with total 4-dim score >= this (0..12).\n' +
        '- `tag` — only episodes matching this tag.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description:
              'Number of most recent episodes to surface (default 5, max 20).',
          },
          since: {
            type: 'string',
            description:
              'ISO-8601 timestamp. Only episodes at or after this time are returned.',
          },
          minScore: {
            type: 'number',
            description:
              'Lower bound on the episode total score (novelty + reusability + complexity + outcome; range 0-12).',
          },
          tag: {
            type: 'string',
            description:
              'Return only episodes whose tag list contains this value.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: MemoryDistillParams,
  ): ToolInvocation<MemoryDistillParams, ToolResult> {
    return new MemoryDistillInvocation(this.config, params);
  }
}

// ─── Prompt builder (exported for tests) ─────────────────────

export function buildDistillPrompt(
  episodes: EpisodeConfig[],
  memoryIndexBlock: string,
): string {
  const lines: string[] = [];
  lines.push('# Memory distillation — review episodes');
  lines.push('');
  lines.push(
    `You are reviewing ${episodes.length} recent episode${episodes.length === 1 ? '' : 's'} to decide which lessons deserve a durable memory entry.`,
  );
  lines.push('');
  lines.push('## Rules');
  lines.push(
    '- Save only facts that help FUTURE sessions (user preferences, recurring decisions, non-obvious project facts, external references).',
  );
  lines.push(
    '- Do NOT save code patterns, file paths, git history, one-off debug steps, or current task state.',
  );
  lines.push(
    '- Call `memory_write` with `overwrite: false` so the similarity gate can flag near-duplicates against the existing index below.',
  );
  lines.push(
    '- If a near-duplicate memory already exists, update it (call `memory_write` with `overwrite: true` on the same name) instead of creating a parallel entry.',
  );
  lines.push(
    '- Prefer tight, one-line descriptions (<150 chars) — the agent reads the hook first and only loads the body on demand.',
  );
  lines.push('');

  if (memoryIndexBlock.trim().length > 0) {
    lines.push('## Current memory index');
    lines.push('');
    lines.push(memoryIndexBlock.trim());
    lines.push('');
  } else {
    lines.push('## Current memory index');
    lines.push('(empty — no memories saved yet)');
    lines.push('');
  }

  lines.push('## Episodes');
  for (const ep of episodes) {
    lines.push('');
    lines.push(`### ${ep.id} — ${ep.title}`);
    lines.push(
      `- outcome: **${ep.outcome}**, duration ${ep.durationMins}min, ${ep.toolCalls} tool calls, score ${totalScore(ep.scores)}/12`,
    );
    if (ep.tags.length > 0) {
      lines.push(`- tags: ${ep.tags.map((t) => `\`${t}\``).join(', ')}`);
    }
    if (ep.toolStats && ep.toolStats.length > 0) {
      const top = ep.toolStats
        .slice(0, 4)
        .map((s) => `${s.name}×${s.count}`)
        .join(', ');
      lines.push(`- top tools: ${top}`);
    }
    if (ep.filesTouched && ep.filesTouched.length > 0) {
      const preview = ep.filesTouched.slice(0, 5).join(', ');
      const more =
        ep.filesTouched.length > 5
          ? ` (+${ep.filesTouched.length - 5} more)`
          : '';
      lines.push(`- files: ${preview}${more}`);
    }
    lines.push('');
    lines.push(truncate(ep.content, 1400));
  }

  lines.push('');
  lines.push('---');
  lines.push(
    'After reviewing, call `memory_write` for each worthwhile lesson. If nothing rises to the bar, say so explicitly — do not fabricate memories just because episodes exist.',
  );
  return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}
