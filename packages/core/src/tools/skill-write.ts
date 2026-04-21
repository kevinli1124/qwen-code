/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * skill_write — persist a new skill (or update an existing one) with
 * near-duplicate detection against the current skill registry.
 *
 * Design mirrors memory_write + similarity gate from Phase 2:
 *   - Default call runs `findSimilarSkills`. On match, returns a structured
 *     `similar skill exists` notice with the top candidate names so the
 *     model can choose to merge, version-bump, or force.
 *   - `mergeInto=<name>` overwrites that skill (skipping similarity).
 *   - `force=true` bypasses the gate entirely.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import type { SkillLevel } from '../skills/types.js';
import { findSimilarSkills } from '../utils/similarity.js';

export interface SkillWriteParams {
  name: string;
  description: string;
  body: string;
  level?: SkillLevel;
  allowedTools?: string[];
  model?: string;
  tags?: string[];
  /** When set, overwrite this specific existing skill (treated as merge). */
  mergeInto?: string;
  /** Skip similarity check and write unconditionally. */
  force?: boolean;
}

class SkillWriteInvocation extends BaseToolInvocation<
  SkillWriteParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: SkillWriteParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const level = this.params.level ?? 'project';
    const mode = this.params.mergeInto
      ? `merge→${this.params.mergeInto}`
      : this.params.force
        ? 'force'
        : 'check';
    return `${level}:${this.params.name} (${mode})`;
  }

  async execute(): Promise<ToolResult> {
    const level: SkillLevel = this.params.level ?? 'project';

    if (level !== 'project' && level !== 'user') {
      return {
        llmContent: `Cannot write to level "${level}" — only "project" and "user" are writable.`,
        returnDisplay: `Invalid level: ${level}`,
        error: { message: `level must be project or user, got ${level}` },
      };
    }

    const skillManager = this.config.getSkillManager();
    const existing = await skillManager.listSkills({ force: true });

    // mergeInto path: find the target and overwrite with the new body.
    if (this.params.mergeInto) {
      const target = existing.find(
        (s) => s.name === this.params.mergeInto && s.level === level,
      );
      if (!target) {
        return {
          llmContent:
            `mergeInto target "${this.params.mergeInto}" not found at level "${level}". ` +
            'Available skills at this level: ' +
            existing
              .filter((s) => s.level === level)
              .map((s) => s.name)
              .join(', ') +
            '. Adjust the name or drop mergeInto to create a fresh skill.',
          returnDisplay: `Target skill not found: ${this.params.mergeInto}`,
          error: {
            message: `mergeInto target "${this.params.mergeInto}" not found`,
          },
        };
      }
      try {
        const written = await skillManager.writeSkill(
          {
            name: target.name,
            description: this.params.description,
            body: this.params.body,
            level,
            allowedTools: this.params.allowedTools,
            model: this.params.model,
          },
          { overwrite: true },
        );
        return {
          llmContent: `Merged proposal into existing skill "${written.name}" (${level}).`,
          returnDisplay: `Merged into ${written.name}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          llmContent: `Error merging skill: ${message}`,
          returnDisplay: message,
          error: { message },
        };
      }
    }

    // Similarity gate (skipped when force=true).
    if (!this.params.force) {
      const hits = findSimilarSkills(
        {
          name: this.params.name,
          description: this.params.description,
          tags: this.params.tags,
        },
        existing,
      );
      if (hits.length > 0) {
        const lines = hits
          .slice(0, 3)
          .map(
            (h) =>
              `- ${h.item.name} (${h.item.level}, ${h.reason}, score=${h.score.toFixed(2)}): ${h.item.description}`,
          )
          .join('\n');
        const top = hits[0];
        const msg =
          `Skipped write: found ${hits.length} similar skill${hits.length === 1 ? '' : 's'}. ` +
          'Choose one of:\n' +
          `  [merge]  re-run with mergeInto=${JSON.stringify(top.item.name)} to update the existing skill.\n` +
          `  [new]    rename this skill (e.g. ${this.params.name}-v2) and re-run with force=true.\n` +
          `  [cancel] drop this proposal.\n\n` +
          `Top matches:\n${lines}`;
        return {
          llmContent: msg,
          returnDisplay: `Similar skill exists: ${top.item.name}`,
        };
      }
    }

    // Fresh write (no similar / force / passed gate).
    try {
      const written = await skillManager.writeSkill(
        {
          name: this.params.name,
          description: this.params.description,
          body: this.params.body,
          level,
          allowedTools: this.params.allowedTools,
          model: this.params.model,
        },
        { overwrite: !!this.params.force },
      );
      return {
        llmContent: `Saved skill "${written.name}" (${level}) at ${written.filePath}.`,
        returnDisplay: `Saved ${written.name}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Error saving skill: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }
  }
}

export class SkillWriteTool extends BaseDeclarativeTool<
  SkillWriteParams,
  ToolResult
> {
  static readonly Name = ToolNames.SKILL_WRITE;

  constructor(private config: Config) {
    super(
      SkillWriteTool.Name,
      ToolDisplayNames.SKILL_WRITE,
      'Create or update a skill (SKILL.md) under `.qwen/skills/<name>/`. ' +
        'Runs a similarity check against existing skills so near-duplicates surface before a parallel entry is created.\n\n' +
        '## Similarity gate\n\n' +
        'Default behaviour compares the draft against existing skills by name (Levenshtein), tags (Jaccard), and description (token overlap). ' +
        'On match (score ≥ 0.7) the call returns a three-option suggestion:\n\n' +
        '  [merge]  re-call with `mergeInto: "<existing-skill-name>"` to overwrite that skill with this draft.\n' +
        '  [new]    rename (e.g. add `-v2` suffix) and re-call with `force: true` to create a parallel entry anyway.\n' +
        '  [cancel] abandon this proposal.\n\n' +
        '## Levels\n\n' +
        '- `project` (default): stored in the current repo at `.qwen/skills/<name>/SKILL.md`.\n' +
        '- `user`: stored globally at `~/.qwen/skills/<name>/SKILL.md`.\n\n' +
        '`extension` and `bundled` levels are read-only and rejected.\n\n' +
        '## Body format\n\n' +
        'Body is Markdown. A good skill body opens with a one-paragraph "when to use", then lays out numbered steps, then lists edge cases. ' +
        'Keep it focused: each skill should answer one recurring question.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Skill identifier (kebab-case preferred). Becomes the directory name.',
          },
          description: {
            type: 'string',
            description:
              'One-line hook (≤200 chars) shown in the skill index so agents know when to invoke this skill.',
          },
          body: {
            type: 'string',
            description:
              'Markdown body of SKILL.md — the actual skill instructions the agent follows when invoked.',
          },
          level: {
            type: 'string',
            enum: ['project', 'user'],
            description:
              '"project" stores in the current repo, "user" stores globally in ~/.qwen/. Default: project.',
          },
          allowedTools: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional list of tool names the skill is allowed to use. Informational for v1.',
          },
          model: {
            type: 'string',
            description:
              'Optional model override for this skill (`inherit` / bare id / `authType:modelId`).',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional tags used by similarity matching (Jaccard on tag sets).',
          },
          mergeInto: {
            type: 'string',
            description:
              'Name of an existing skill to overwrite. Skips the similarity gate. Use this when the model chooses [merge] after a similarity conflict.',
          },
          force: {
            type: 'boolean',
            description:
              'Write unconditionally, ignoring the similarity gate and any existing file with the same name. Use sparingly.',
          },
        },
        required: ['name', 'description', 'body'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: SkillWriteParams,
  ): ToolInvocation<SkillWriteParams, ToolResult> {
    return new SkillWriteInvocation(this.config, params);
  }
}
