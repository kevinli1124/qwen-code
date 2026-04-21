/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * skill_list — read-only listing of skills grouped by level (project /
 * user / extension / bundled). Shows provenance metadata when present so
 * installed bundles are visually distinguishable from hand-authored ones.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import type { SkillConfig, SkillLevel } from '../skills/types.js';

export interface SkillListParams {
  level?: SkillLevel;
}

class SkillListInvocation extends BaseToolInvocation<
  SkillListParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: SkillListParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return this.params.level ? `level=${this.params.level}` : 'all levels';
  }

  async execute(): Promise<ToolResult> {
    const skillManager = this.config.getSkillManager();
    const skills = await skillManager.listSkills({
      level: this.params.level,
      force: true,
    });

    if (skills.length === 0) {
      return {
        llmContent: `No skills found${this.params.level ? ` at level "${this.params.level}"` : ''}.`,
        returnDisplay: 'No skills',
      };
    }

    const byLevel = new Map<SkillLevel, SkillConfig[]>();
    for (const s of skills) {
      const bucket = byLevel.get(s.level) ?? [];
      bucket.push(s);
      byLevel.set(s.level, bucket);
    }

    const levelOrder: SkillLevel[] = [
      'project',
      'user',
      'extension',
      'bundled',
    ];
    const lines: string[] = [];
    lines.push(`# Skills (${skills.length})`);

    for (const level of levelOrder) {
      const bucket = byLevel.get(level);
      if (!bucket || bucket.length === 0) continue;
      lines.push('');
      lines.push(`## ${cap(level)} (${bucket.length})`);
      for (const s of bucket) {
        const provSuffix = s.provenance?.sourceUser
          ? `  *(from ${s.provenance.sourceUser}${s.provenance.sourceProject ? ` / ${s.provenance.sourceProject}` : ''})*`
          : '';
        lines.push(`- **${s.name}** — ${s.description}${provSuffix}`);
      }
    }

    return {
      llmContent: lines.join('\n'),
      returnDisplay: `Listed ${skills.length} skill${skills.length === 1 ? '' : 's'}`,
    };
  }
}

export class SkillListTool extends BaseDeclarativeTool<
  SkillListParams,
  ToolResult
> {
  static readonly Name = ToolNames.SKILL_LIST;

  constructor(private config: Config) {
    super(
      SkillListTool.Name,
      ToolDisplayNames.SKILL_LIST,
      'List available skills grouped by level. Read-only. Installed bundles show their source user / project so provenance is visible at a glance.\n\n' +
        '## Parameters\n\n' +
        '- `level` — filter by `project` / `user` / `extension` / `bundled`. Omit for all levels.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['project', 'user', 'extension', 'bundled'],
            description: 'Restrict listing to a single level.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: SkillListParams,
  ): ToolInvocation<SkillListParams, ToolResult> {
    return new SkillListInvocation(this.config, params);
  }
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
