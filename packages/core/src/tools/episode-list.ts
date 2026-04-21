/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * episode_list — read-only listing of captured episodes with filters.
 * Complements memory_distill and skill_propose: lets the agent (or a
 * curious user) scan what's in ~/.qwen/episodes/ without pulling full
 * bodies into the context window.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { EpisodeStore } from '../episodes/episode-store.js';
import type { EpisodeOutcome } from '../episodes/types.js';
import { totalScore } from '../episodes/types.js';

export interface EpisodeListParams {
  count?: number;
  tag?: string;
  minScore?: number;
  since?: string;
  outcome?: EpisodeOutcome;
}

const DEFAULT_COUNT = 20;
const MAX_COUNT = 100;

class EpisodeListInvocation extends BaseToolInvocation<
  EpisodeListParams,
  ToolResult
> {
  constructor(_config: Config, params: EpisodeListParams) {
    super(params);
  }

  getDescription(): string {
    const parts: string[] = [];
    if (this.params.tag) parts.push(`tag=${this.params.tag}`);
    if (this.params.outcome) parts.push(`outcome=${this.params.outcome}`);
    if (this.params.minScore !== undefined)
      parts.push(`minScore=${this.params.minScore}`);
    if (this.params.since) parts.push(`since=${this.params.since}`);
    return parts.length > 0 ? parts.join(' ') : 'all';
  }

  async execute(): Promise<ToolResult> {
    const count = clamp(this.params.count ?? DEFAULT_COUNT, 1, MAX_COUNT);
    const store = new EpisodeStore();
    const all = await store.listEpisodes({
      tags: this.params.tag ? [this.params.tag] : undefined,
      minScore: this.params.minScore,
      sinceIso: this.params.since,
      outcome: this.params.outcome,
      force: true,
    });
    const slice = all.slice(0, count);

    if (slice.length === 0) {
      return {
        llmContent:
          'No episodes matched the given filters. ' +
          '(Episodes are auto-captured after long-running turns — see memory-phases docs.)',
        returnDisplay: 'No episodes',
      };
    }

    const lines: string[] = [];
    lines.push(
      `# Episodes (${slice.length}${all.length > slice.length ? ` of ${all.length}` : ''})`,
    );
    lines.push('');
    lines.push('| id | score | outcome | tools | tags | title |');
    lines.push('|---|---|---|---|---|---|');
    for (const ep of slice) {
      const tags = ep.tags.slice(0, 4).join(', ') || '-';
      const title =
        ep.title.length > 60 ? ep.title.slice(0, 57) + '...' : ep.title;
      lines.push(
        `| ${ep.id} | ${totalScore(ep.scores)}/12 | ${ep.outcome} | ${ep.toolCalls} | ${tags} | ${title} |`,
      );
    }
    return {
      llmContent: lines.join('\n'),
      returnDisplay: `Listed ${slice.length} episode${slice.length === 1 ? '' : 's'}`,
    };
  }
}

export class EpisodeListTool extends BaseDeclarativeTool<
  EpisodeListParams,
  ToolResult
> {
  static readonly Name = ToolNames.EPISODE_LIST;

  constructor(private config: Config) {
    super(
      EpisodeListTool.Name,
      ToolDisplayNames.EPISODE_LIST,
      'List captured episodes (long-running task summaries) with optional filters. ' +
        'Read-only — does not mutate anything.\n\n' +
        '## Parameters\n\n' +
        '- `count` — max episodes to return (default 20, max 100).\n' +
        '- `tag` — return only episodes whose tag list includes this value.\n' +
        '- `minScore` — lower bound on total 4-dim score (0-12).\n' +
        '- `since` — ISO-8601 timestamp filter.\n' +
        '- `outcome` — filter by `success` / `partial` / `failed` / `cancelled`.\n\n' +
        'Returns a Markdown table of id, score, outcome, tool-call count, tags, and title.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Max episodes to return.' },
          tag: {
            type: 'string',
            description: 'Filter: episode tag to match.',
          },
          minScore: {
            type: 'number',
            description: 'Filter: minimum total score (0-12).',
          },
          since: {
            type: 'string',
            description: 'Filter: ISO-8601 timestamp.',
          },
          outcome: {
            type: 'string',
            enum: ['success', 'partial', 'failed', 'cancelled'],
            description: 'Filter: episode outcome.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: EpisodeListParams,
  ): ToolInvocation<EpisodeListParams, ToolResult> {
    return new EpisodeListInvocation(this.config, params);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
