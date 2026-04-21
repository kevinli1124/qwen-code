/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * skill_install — receive a SKILL.md produced by `memory_export` (or
 * hand-authored with a provenance block) and register it in the local
 * workspace.
 *
 * Safety posture:
 *   - ALWAYS reports provenance.sourceUser / sourceProject when present
 *     so the caller can decide whether to trust the bundle.
 *   - When the provenance sourceUser differs from the current user, the
 *     default refuses and returns a `cross_user` notice; the caller must
 *     re-run with `acceptCrossUser: true` after confirmation.
 *   - `unpackMemories` is opt-in. When true, each `### <name> (<type>)`
 *     section in the body is written into the local MemoryStore under
 *     `imported/<sourceUser>-<name>` so imported knowledge does not
 *     collide with the user's own memories.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { parseSkillContent } from '../skills/skill-load.js';
import type { SkillLevel } from '../skills/types.js';
import type { MemoryType } from '../memory/types.js';

const MEMORY_TYPES: MemoryType[] = [
  'user',
  'feedback',
  'project',
  'decision',
  'reference',
];

export interface SkillInstallParams {
  /** Path to the SKILL.md to install (absolute). */
  sourcePath: string;
  /** Local level to install at. Default: user. */
  level?: SkillLevel;
  /** Overwrite if a skill with the same name already exists locally. */
  overwrite?: boolean;
  /** If true, also write embedded memory sections into the local memory store. */
  unpackMemories?: boolean;
  /** Required when provenance.sourceUser differs from the current user. */
  acceptCrossUser?: boolean;
}

class SkillInstallInvocation extends BaseToolInvocation<
  SkillInstallParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: SkillInstallParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const level = this.params.level ?? 'user';
    return `${level} <- ${this.params.sourcePath}`;
  }

  async execute(): Promise<ToolResult> {
    const level: SkillLevel = this.params.level ?? 'user';
    if (level !== 'project' && level !== 'user') {
      return {
        llmContent: `Cannot install to level "${level}" — only "project" and "user" are writable.`,
        returnDisplay: `Invalid level: ${level}`,
        error: { message: `level must be project or user, got ${level}` },
      };
    }

    if (!path.isAbsolute(this.params.sourcePath)) {
      return {
        llmContent: 'sourcePath must be an absolute path to the SKILL.md file.',
        returnDisplay: 'Non-absolute path',
        error: { message: 'sourcePath must be absolute' },
      };
    }

    let content: string;
    try {
      content = await fs.readFile(this.params.sourcePath, 'utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Failed to read ${this.params.sourcePath}: ${message}`,
        returnDisplay: `Read failed: ${message}`,
        error: { message },
      };
    }

    const parsed = parseSkillContent(content, this.params.sourcePath);
    const provenance = parsed.provenance;

    // Cross-user gating: refuse silently-imported bundles that came from a
    // different user unless the caller explicitly accepts.
    const currentUser =
      process.env['USER'] || (tryBasename(process.env['HOME']) ?? null);
    if (
      provenance?.sourceUser &&
      currentUser &&
      provenance.sourceUser !== currentUser &&
      !this.params.acceptCrossUser
    ) {
      const msg =
        `This skill was produced by user "${provenance.sourceUser}" ` +
        `(current user: "${currentUser}"). Installing it will merge another ` +
        `person's wisdom into your workspace. Re-run with \`acceptCrossUser: true\` ` +
        `to proceed. Bundle details: project=${provenance.sourceProject ?? '-'}, ` +
        `agent=${provenance.sourceAgent ?? '-'}, extractedAt=${provenance.extractedAt ?? '-'}.`;
      return {
        llmContent: msg,
        returnDisplay: `Cross-user confirmation required`,
      };
    }

    // Write skill into local workspace.
    const skillManager = this.config.getSkillManager();
    let writtenFilePath: string;
    try {
      const written = await skillManager.writeSkill(
        {
          name: parsed.name,
          description: parsed.description,
          body: parsed.body,
          level,
          allowedTools: parsed.allowedTools,
          model: parsed.model,
          provenance,
        },
        { overwrite: !!this.params.overwrite },
      );
      writtenFilePath = written.filePath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Failed to install skill: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }

    let unpackedCount = 0;
    if (this.params.unpackMemories) {
      unpackedCount = await this.unpackMemories(
        parsed.body,
        provenance?.sourceUser ?? 'unknown',
      );
    }

    const provBits: string[] = [];
    if (provenance?.sourceUser) provBits.push(`user=${provenance.sourceUser}`);
    if (provenance?.sourceProject)
      provBits.push(`project=${provenance.sourceProject}`);
    if (provenance?.sourceAgent)
      provBits.push(`agent=${provenance.sourceAgent}`);
    if (provenance?.extractedAt)
      provBits.push(`extractedAt=${provenance.extractedAt}`);
    const provSuffix =
      provBits.length > 0 ? ` Provenance: ${provBits.join(', ')}.` : '';

    return {
      llmContent:
        `Installed skill "${parsed.name}" to ${writtenFilePath}.` +
        (unpackedCount > 0
          ? ` Also unpacked ${unpackedCount} memory ent${unpackedCount === 1 ? 'ry' : 'ries'} ` +
            `into the local memory store under name prefix "imported/${provenance?.sourceUser ?? 'unknown'}-".`
          : '') +
        provSuffix,
      returnDisplay: `Installed ${parsed.name}`,
    };
  }

  /**
   * Parses `### <name> (<type>)\n> <description>\n\n<body...>` sections
   * from the SKILL body and writes them to MemoryStore under
   * `imported/<sourceUser>-<name>`. Silent on parse errors per entry —
   * returns the number of successfully imported rows.
   */
  private async unpackMemories(
    body: string,
    sourceUser: string,
  ): Promise<number> {
    // Split on the `### <name> (<type>)` header. Whatever precedes the
    // first header is preamble (bundle description / notes) and is
    // dropped. We terminate each section at the next `### ` header or at
    // the final `---` horizontal rule that separates body from footer.
    const headerRegex =
      /^###\s+(\S+)\s+\((user|feedback|project|decision|reference)\)\s*$/m;
    const store = this.config.getMemoryStore();
    let count = 0;

    const parts: Array<{
      name: string;
      type: MemoryType;
      chunk: string;
    }> = [];

    let remaining = body;
    let match = remaining.match(headerRegex);
    while (match) {
      const matchIdx = match.index ?? 0;
      const matchEnd = matchIdx + match[0].length;
      remaining = remaining.slice(matchEnd);
      const next = remaining.match(headerRegex);
      const chunk = next
        ? remaining.slice(0, next.index ?? remaining.length)
        : remaining;
      parts.push({
        name: match[1],
        type: match[2] as MemoryType,
        chunk,
      });
      if (!next) break;
      // Slice to start of next header so the next iteration re-matches it.
      // remaining already begins at that point via the slice above.
      match = next;
    }

    for (const { name: origName, type, chunk } of parts) {
      if (!MEMORY_TYPES.includes(type)) continue;
      // Strip the footer after the closing `---` rule, if present.
      const hrIdx = chunk.search(/^---\s*$/m);
      const trimmedChunk = hrIdx >= 0 ? chunk.slice(0, hrIdx) : chunk;

      const descMatch = trimmedChunk.match(/^>\s*([^\n]*)\n([\s\S]*)$/);
      const desc = descMatch
        ? descMatch[1].trim()
        : `Imported from ${sourceUser}`;
      const content = descMatch ? descMatch[2].trim() : trimmedChunk.trim();

      const importedName = sanitizeMemoryName(
        `imported/${sourceUser}-${origName}`,
      );
      try {
        await store.writeMemory(
          {
            name: importedName,
            type,
            scope: 'user',
            description: desc || `Imported from ${sourceUser}`,
            content: content || `(original body empty)`,
          },
          { overwrite: true },
        );
        count++;
      } catch {
        // Best-effort — keep going on individual failures.
      }
    }
    return count;
  }
}

export class SkillInstallTool extends BaseDeclarativeTool<
  SkillInstallParams,
  ToolResult
> {
  static readonly Name = ToolNames.SKILL_INSTALL;

  constructor(private config: Config) {
    super(
      SkillInstallTool.Name,
      ToolDisplayNames.SKILL_INSTALL,
      'Install a SKILL.md bundle (produced by `memory_export` or hand-authored) into the local workspace. ' +
        'Reports provenance and defends against silent cross-user imports.\n\n' +
        '## Flow\n\n' +
        '1. Read and parse the source SKILL.md at `sourcePath`.\n' +
        "2. If the bundle's `provenance.sourceUser` differs from the current user, refuse unless `acceptCrossUser: true` is set.\n" +
        '3. Register the skill at the chosen level (default `user`).\n' +
        '4. When `unpackMemories: true`, extract embedded `### <name> (<type>)` sections into MemoryStore under `imported/<sourceUser>-<name>`.\n\n' +
        '## Parameters\n\n' +
        '- `sourcePath` (required) — absolute path to the SKILL.md.\n' +
        '- `level` — "project" or "user" (default: user).\n' +
        '- `overwrite` — replace an existing same-named local skill.\n' +
        '- `unpackMemories` — if true, also write the contained memory sections into the local MemoryStore.\n' +
        '- `acceptCrossUser` — required when provenance.sourceUser ≠ current user.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          sourcePath: {
            type: 'string',
            description:
              'Absolute path to the source SKILL.md file to install.',
          },
          level: {
            type: 'string',
            enum: ['project', 'user'],
            description:
              '"user" (default) writes to ~/.qwen/skills/; "project" writes to .qwen/skills/ in the current repo.',
          },
          overwrite: {
            type: 'boolean',
            description: 'Overwrite a same-named local skill. Default false.',
          },
          unpackMemories: {
            type: 'boolean',
            description:
              'Also unpack embedded memory sections into the local MemoryStore. Imported memories get names prefixed with "imported/<sourceUser>-". Default false.',
          },
          acceptCrossUser: {
            type: 'boolean',
            description:
              'Required when provenance.sourceUser differs from the current user. Skipping this raises a confirmation error.',
          },
        },
        required: ['sourcePath'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: SkillInstallParams,
  ): ToolInvocation<SkillInstallParams, ToolResult> {
    return new SkillInstallInvocation(this.config, params);
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function tryBasename(p: string | undefined): string | undefined {
  if (!p) return undefined;
  try {
    return path.basename(p);
  } catch {
    return undefined;
  }
}

function sanitizeMemoryName(name: string): string {
  // Memory names must match /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/ — replace
  // everything else with a dash. Preserve a single leading alphanumeric.
  const slug = name
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return 'imported';
  if (/^[a-zA-Z0-9]/.test(slug)) return slug;
  return `x${slug}`;
}
