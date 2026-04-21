/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * skill_propose — surfaces high-scoring episodes as a skill-drafting prompt.
 *
 * Mirrors memory_distill: pure formatting tool, no LLM roundtrip. Returns
 * a structured review prompt with episodes, the current skill registry,
 * SKILL.md schema, and instructions to call `skill_write` for each
 * worthwhile pattern.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { EpisodeStore } from '../episodes/episode-store.js';
import type { EpisodeConfig } from '../episodes/types.js';
import { totalScore } from '../episodes/types.js';
import type { SkillConfig } from '../skills/types.js';

export interface SkillProposeParams {
  count?: number;
  since?: string;
  /**
   * Minimum episode total score. Default 9/12 — the plan's auto-propose
   * threshold (3+ on average across the 4 dimensions).
   */
  minScore?: number;
  tag?: string;
}

const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;
const DEFAULT_MIN_SCORE = 9;

class SkillProposeInvocation extends BaseToolInvocation<
  SkillProposeParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: SkillProposeParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const parts: string[] = [];
    parts.push(
      `count=${Math.min(this.params.count ?? DEFAULT_COUNT, MAX_COUNT)}`,
    );
    parts.push(`minScore=${this.params.minScore ?? DEFAULT_MIN_SCORE}`);
    if (this.params.tag) parts.push(`tag=${this.params.tag}`);
    if (this.params.since) parts.push(`since=${this.params.since}`);
    return parts.join(' ');
  }

  async execute(): Promise<ToolResult> {
    const count = clamp(this.params.count ?? DEFAULT_COUNT, 1, MAX_COUNT);
    const minScore = this.params.minScore ?? DEFAULT_MIN_SCORE;

    const store = new EpisodeStore();
    const episodes = await store.listEpisodes({
      minScore,
      sinceIso: this.params.since,
      tags: this.params.tag ? [this.params.tag] : undefined,
      force: true,
    });

    if (episodes.length === 0) {
      return {
        llmContent:
          `No episodes scored >= ${minScore}/12 matching the filters. ` +
          'Skills should only be promoted from recurring, high-value patterns. ' +
          'Lower `minScore` temporarily if you want to review borderline cases.',
        returnDisplay: 'No qualifying episodes',
      };
    }

    const selected = episodes.slice(0, count);
    const skills = await this.config
      .getSkillManager()
      .listSkills({ force: true });

    const prompt = buildSkillProposalPrompt(selected, skills);
    return {
      llmContent: prompt,
      returnDisplay: `Proposing skill from ${selected.length} episode${selected.length === 1 ? '' : 's'}`,
    };
  }
}

export class SkillProposeTool extends BaseDeclarativeTool<
  SkillProposeParams,
  ToolResult
> {
  static readonly Name = ToolNames.SKILL_PROPOSE;

  constructor(private config: Config) {
    super(
      SkillProposeTool.Name,
      ToolDisplayNames.SKILL_PROPOSE,
      'Surface high-scoring episodes so you can draft a reusable skill (SKILL.md). ' +
        'Returns a structured prompt containing qualifying episodes, the current skill registry, and the SKILL.md schema.\n\n' +
        '## When to use\n\n' +
        '- Two or more episodes with overlapping tags / patterns appear.\n' +
        '- One episode scores ≥ 9/12 across the 4 dimensions and looks generalisable.\n' +
        '- The user asks to "turn this into a skill".\n\n' +
        '## How to use the output\n\n' +
        '1. Read the qualifying episode(s) and the existing skill index.\n' +
        '2. Draft a SKILL.md body: one-paragraph "when to use", numbered steps, edge cases.\n' +
        '3. Call `skill_write` — the similarity gate will flag near-duplicates.\n' +
        '4. On match: pick merge / new-name / cancel per the suggestion returned.\n\n' +
        '## Parameters\n\n' +
        '- `count` — how many of the most recent qualifying episodes (default 5, max 20).\n' +
        '- `since` — ISO timestamp filter.\n' +
        '- `minScore` — lower bound on episode total score (default 9, range 0-12).\n' +
        '- `tag` — restrict to episodes with this tag.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description:
              'Number of most recent qualifying episodes to surface (default 5, max 20).',
          },
          since: {
            type: 'string',
            description:
              'ISO-8601 timestamp. Only episodes at or after this time are returned.',
          },
          minScore: {
            type: 'number',
            description:
              'Lower bound on total episode score (0-12). Default 9 — the auto-propose threshold.',
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
    params: SkillProposeParams,
  ): ToolInvocation<SkillProposeParams, ToolResult> {
    return new SkillProposeInvocation(this.config, params);
  }
}

// ─── Prompt builder (exported for tests) ─────────────────────

export function buildSkillProposalPrompt(
  episodes: EpisodeConfig[],
  existingSkills: SkillConfig[],
): string {
  const lines: string[] = [];
  lines.push('# Skill proposal — draft a reusable pattern');
  lines.push('');
  lines.push(
    `Reviewing ${episodes.length} high-scoring episode${episodes.length === 1 ? '' : 's'} for skill promotion.`,
  );
  lines.push('');

  lines.push('## Rules');
  lines.push(
    '- Only promote a pattern that is **reusable across future tasks**, not one-off fixes.',
  );
  lines.push(
    '- Call `skill_write` with `name`, `description`, `body`, optional `tags`. Default `level` is `project`.',
  );
  lines.push(
    '- The similarity gate will flag near-duplicates against the skill index below. On conflict, choose one:',
  );
  lines.push(
    '  * [merge] re-call `skill_write` with `mergeInto: "<existing-name>"` to update it.',
  );
  lines.push(
    '  * [new] rename (e.g. add `-v2`) and re-call with `force: true`.',
  );
  lines.push('  * [cancel] abandon — say so explicitly.');
  lines.push(
    '- Keep the body focused: when-to-use paragraph, numbered steps, edge cases. No fluff.',
  );
  lines.push('');

  lines.push('## SKILL.md schema');
  lines.push('```yaml');
  lines.push('---');
  lines.push('name: <kebab-case-slug>');
  lines.push('description: <one-line hook, ≤200 chars>');
  lines.push('allowedTools: [optional list of tool names]');
  lines.push('model: inherit  # optional');
  lines.push('---');
  lines.push('');
  lines.push('# Skill title');
  lines.push('');
  lines.push('Paragraph on when this skill applies...');
  lines.push('');
  lines.push('## Steps');
  lines.push('1. ...');
  lines.push('```');
  lines.push('');

  lines.push('## Existing skills (avoid duplicating)');
  if (existingSkills.length === 0) {
    lines.push('(none yet)');
  } else {
    for (const s of existingSkills) {
      lines.push(`- **${s.name}** (${s.level}): ${s.description}`);
    }
  }
  lines.push('');

  lines.push('## Qualifying episodes');
  for (const ep of episodes) {
    lines.push('');
    lines.push(`### ${ep.id} — ${ep.title}`);
    lines.push(
      `- score ${totalScore(ep.scores)}/12, ${ep.toolCalls} tool calls, ${ep.durationMins}min, ${ep.outcome}`,
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
    lines.push('');
    lines.push(truncate(ep.content, 1400));
  }

  lines.push('');
  lines.push('---');
  lines.push(
    'If no pattern is genuinely reusable, say so explicitly — do not fabricate a skill just because episodes exist.',
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
