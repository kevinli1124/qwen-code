/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * memory_export — bundle a filtered slice of memory into a new Skill with
 * provenance metadata. Produces a portable SKILL.md that can be dropped
 * into another workspace or shared with another user; `skill_install`
 * (Phase 5) is the receiving side.
 *
 * Design:
 *   - Filters existing memories by agent / type / explicit names.
 *   - Renders each memory as a Markdown section inside the SKILL body,
 *     preserving the original frontmatter fields (type, agent, description)
 *     so the receiving side can unpack them back into memory if desired.
 *   - Writes via `SkillManager.writeSkill` with `provenance` populated
 *     (sourceUser, sourceProject, extractedAt, extractedFrom[]).
 */

import * as os from 'os';
import * as path from 'path';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import type { MemoryConfig, MemoryType } from '../memory/types.js';
import type { SkillLevel, SkillProvenance } from '../skills/types.js';

export interface MemoryExportParams {
  /** Output skill slug (kebab-case). The resulting skill lives at `.qwen/skills/<skillName>/SKILL.md`. */
  skillName: string;
  /** Hook shown in the skill index. If omitted, a summary is synthesized. */
  description?: string;
  /** Filter: only export memories scoped to this subagent. */
  agent?: string;
  /** Filter: restrict to memories of these types. */
  types?: MemoryType[];
  /** Filter: restrict to memories with these exact names. */
  names?: string[];
  /**
   * Which skill level to write to. Defaults to `user` so exports are
   * cross-project portable.
   */
  level?: SkillLevel;
  /** Optional model override for the resulting skill. */
  model?: string;
  /** Overwrite an existing skill with the same name. */
  overwrite?: boolean;
}

class MemoryExportInvocation extends BaseToolInvocation<
  MemoryExportParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: MemoryExportParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const parts: string[] = [];
    if (this.params.agent) parts.push(`agent=${this.params.agent}`);
    if (this.params.types) parts.push(`types=${this.params.types.join(',')}`);
    if (this.params.names) parts.push(`n=${this.params.names.length}`);
    const level = this.params.level ?? 'user';
    return `${level}:${this.params.skillName} (${parts.join(' ') || 'all'})`;
  }

  async execute(): Promise<ToolResult> {
    const level: SkillLevel = this.params.level ?? 'user';
    if (level !== 'project' && level !== 'user') {
      return {
        llmContent: `Cannot export to level "${level}" — only "project" and "user" are writable.`,
        returnDisplay: `Invalid level: ${level}`,
        error: { message: `level must be project or user, got ${level}` },
      };
    }

    const store = this.config.getMemoryStore();
    const all = await store.listMemories({
      agent: this.params.agent,
      force: true,
    });

    let selected = all;
    if (this.params.types && this.params.types.length > 0) {
      const typeSet = new Set(this.params.types);
      selected = selected.filter((m) => typeSet.has(m.type));
    }
    if (this.params.names && this.params.names.length > 0) {
      const nameSet = new Set(this.params.names);
      selected = selected.filter((m) => nameSet.has(m.name));
    }

    if (selected.length === 0) {
      return {
        llmContent:
          'No memories matched the given filters — nothing to export. ' +
          'Adjust agent / types / names filters and retry.',
        returnDisplay: 'No memories matched',
      };
    }

    const description =
      this.params.description ?? synthesizeDescription(selected);
    const provenance = buildProvenance({
      config: this.config,
      sourceAgent: this.params.agent,
      extractedFrom: selected.map((m) => m.name),
    });
    const body = renderBody(this.params.skillName, selected, provenance);

    try {
      const skillManager = this.config.getSkillManager();
      const written = await skillManager.writeSkill(
        {
          name: this.params.skillName,
          description,
          body,
          level,
          model: this.params.model,
          provenance,
        },
        { overwrite: !!this.params.overwrite },
      );
      return {
        llmContent:
          `Exported ${selected.length} memor${selected.length === 1 ? 'y' : 'ies'} into skill "${written.name}" ` +
          `at ${written.filePath}. ` +
          `Provenance: sourceUser=${provenance.sourceUser ?? '-'}, ` +
          `sourceProject=${provenance.sourceProject ?? '-'}, ` +
          `sourceAgent=${provenance.sourceAgent ?? '-'}, ` +
          `extractedFrom=[${provenance.extractedFrom?.join(', ') ?? ''}].`,
        returnDisplay: `Exported ${selected.length} → ${written.name}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Failed to export memory: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }
  }
}

export class MemoryExportTool extends BaseDeclarativeTool<
  MemoryExportParams,
  ToolResult
> {
  static readonly Name = ToolNames.MEMORY_EXPORT;

  constructor(private config: Config) {
    super(
      MemoryExportTool.Name,
      ToolDisplayNames.MEMORY_EXPORT,
      'Bundle filtered memory entries into a portable Skill with provenance. ' +
        'The resulting SKILL.md can be installed into another workspace via `skill_install`.\n\n' +
        '## Typical flows\n\n' +
        '- Export an agent\'s decisions for knowledge-transfer: `{skillName: "sky-qwen-wisdom", agent: "implementer", types: ["decision", "feedback"]}`\n' +
        '- Cherry-pick named memories: `{skillName: "eslint-playbook", names: ["eslint_monorepo_globs", "eslint_strict_rules"]}`\n\n' +
        '## Provenance\n\n' +
        'The generated skill includes a `provenance` frontmatter block:\n' +
        '  - sourceUser — resolved from `$USER` / `$USERPROFILE` basename\n' +
        '  - sourceProject — basename of the project root\n' +
        '  - sourceAgent — the `agent` filter if supplied\n' +
        '  - extractedAt — ISO timestamp\n' +
        '  - extractedFrom — list of memory names folded into the body\n\n' +
        'The receiving agent sees this when the skill is loaded, so provenance is visible for review.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          skillName: {
            type: 'string',
            description:
              'Slug for the output skill (kebab-case). Becomes the directory name.',
          },
          description: {
            type: 'string',
            description:
              'Hook for the skill index (≤200 chars). If omitted, a summary is synthesized from the first memory.',
          },
          agent: {
            type: 'string',
            description:
              'Only export memories scoped to this subagent (matches MemoryConfig.agent).',
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['user', 'feedback', 'project', 'decision', 'reference'],
            },
            description: 'Restrict to memories of these types.',
          },
          names: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Restrict to these memory names (exact match). Use when cherry-picking.',
          },
          level: {
            type: 'string',
            enum: ['project', 'user'],
            description:
              '"user" (default) stores globally at ~/.qwen/skills/; "project" stores in the current repo.',
          },
          model: {
            type: 'string',
            description: 'Optional model override for the resulting skill.',
          },
          overwrite: {
            type: 'boolean',
            description:
              'Overwrite an existing skill with the same name. Default false.',
          },
        },
        required: ['skillName'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: MemoryExportParams,
  ): ToolInvocation<MemoryExportParams, ToolResult> {
    return new MemoryExportInvocation(this.config, params);
  }
}

// ─── Body renderer (exported for tests) ─────────────────────

export function renderBody(
  skillName: string,
  memories: MemoryConfig[],
  provenance: SkillProvenance,
): string {
  const lines: string[] = [];
  lines.push(`# ${skillName}`);
  lines.push('');
  lines.push(
    `> Knowledge bundle exported on ${provenance.extractedAt ?? '(unknown time)'} from ` +
      `${provenance.sourceUser ?? 'unknown user'} / ${provenance.sourceProject ?? 'unknown project'}` +
      (provenance.sourceAgent ? ` / agent=${provenance.sourceAgent}` : '') +
      '.',
  );
  lines.push('');

  lines.push('## Memories');
  for (const m of memories) {
    lines.push('');
    lines.push(`### ${m.name} (${m.type})`);
    lines.push(`> ${m.description}`);
    lines.push('');
    lines.push(m.content.trim());
  }

  lines.push('');
  lines.push('---');
  lines.push(
    'If installed via `skill_install` with `unpackMemories=true`, ' +
      "each section above is written into the receiving workspace's memory store " +
      '(names prefixed with `imported/<sourceUser>-`).',
  );
  return lines.join('\n');
}

// ─── Helpers ────────────────────────────────────────────────

function synthesizeDescription(memories: MemoryConfig[]): string {
  const head = memories[0]?.description ?? '';
  const suffix =
    memories.length > 1 ? ` (+${memories.length - 1} related)` : '';
  const base = head + suffix;
  return base.length > 200 ? base.slice(0, 197) + '...' : base;
}

export interface BuildProvenanceInput {
  config: Config;
  sourceAgent?: string;
  extractedFrom: string[];
}

export function buildProvenance(input: BuildProvenanceInput): SkillProvenance {
  const sourceProject = safeBasename(input.config.getProjectRoot());
  const sourceUser = safeBasename(os.homedir()) || process.env['USER'];
  return {
    sourceUser: sourceUser || undefined,
    sourceProject,
    sourceAgent: input.sourceAgent,
    extractedAt: new Date().toISOString(),
    extractedFrom: input.extractedFrom.slice(),
  };
}

function safeBasename(p: string): string {
  try {
    return path.basename(p);
  } catch {
    return '';
  }
}
