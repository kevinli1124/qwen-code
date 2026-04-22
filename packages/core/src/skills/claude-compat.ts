/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Claude Code → Qwen skill frontmatter compatibility shim.
 *
 * Claude skills use:
 *   allowed-tools: [Read, Write, Bash(npm install:*)]
 *
 * Qwen expects:
 *   allowedTools: [read_file, write_file, run_shell_command]
 *
 * This module normalizes Claude-flavoured frontmatter in-place in memory so
 * hand-authored bundles installed from Anthropic's ecosystem Just Work.
 */

import { ToolNames } from '../tools/tool-names.js';

/**
 * Claude tool name → Qwen internal tool name. PascalCase keys reflect the
 * display names Claude publishes; Qwen's tool filter matches on internal
 * snake_case names.
 */
export const CLAUDE_TO_QWEN_TOOL_MAP: Readonly<Record<string, string>> = {
  Read: ToolNames.READ_FILE,
  Write: ToolNames.WRITE_FILE,
  Edit: ToolNames.EDIT,
  Bash: ToolNames.SHELL,
  Grep: ToolNames.GREP,
  Glob: ToolNames.GLOB,
  LS: ToolNames.LS,
  WebFetch: ToolNames.WEB_FETCH,
  WebSearch: ToolNames.WEB_SEARCH,
  TodoWrite: ToolNames.TODO_WRITE,
  Task: ToolNames.AGENT,
  Agent: ToolNames.AGENT,
  AskUserQuestion: ToolNames.ASK_USER_QUESTION,
  Skill: ToolNames.SKILL,
  ExitPlanMode: ToolNames.EXIT_PLAN_MODE,
};

export interface ClaudeCompatResult {
  /** Normalized frontmatter object (new, does not mutate input). */
  frontmatter: Record<string, unknown>;
  /** True if any Claude-style field was rewritten. */
  migrated: boolean;
  /** Human-readable migration notes for logging / UI. */
  notes: string[];
}

/**
 * Normalize Claude-style skill frontmatter into Qwen form.
 *
 * - Renames `allowed-tools` → `allowedTools`.
 * - Strips `(args)` suffixes Claude uses for arg-level restrictions
 *   (Qwen's tool filter is name-only, so the restriction is dropped).
 * - Maps PascalCase Claude tool names to Qwen snake_case names.
 * - Leaves already-Qwen frontmatter untouched.
 * - Unknown tool names pass through (so `mcp__server` patterns and custom
 *   names survive).
 */
export function normalizeClaudeFrontmatter(
  input: Record<string, unknown>,
): ClaudeCompatResult {
  const frontmatter: Record<string, unknown> = { ...input };
  const notes: string[] = [];
  let migrated = false;

  const hasKebab = Object.prototype.hasOwnProperty.call(
    frontmatter,
    'allowed-tools',
  );
  const hasCamel = Object.prototype.hasOwnProperty.call(
    frontmatter,
    'allowedTools',
  );

  if (hasKebab && !hasCamel) {
    const rawValue = frontmatter['allowed-tools'];
    delete frontmatter['allowed-tools'];

    if (Array.isArray(rawValue)) {
      const mapped = rawValue.map((v) => translateToolEntry(String(v)));
      frontmatter['allowedTools'] = mapped.map((m) => m.name);
      notes.push(
        `Renamed "allowed-tools" → "allowedTools" (${mapped.length} tool${mapped.length === 1 ? '' : 's'}).`,
      );
      for (const m of mapped) {
        if (m.note) notes.push(m.note);
      }
      migrated = true;
    } else if (typeof rawValue === 'string') {
      // Claude also accepts a comma-separated string form.
      const parts = rawValue
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((t) => translateToolEntry(t));
      frontmatter['allowedTools'] = parts.map((p) => p.name);
      notes.push(
        `Normalized CSV "allowed-tools" string → "allowedTools" array (${parts.length} tool${parts.length === 1 ? '' : 's'}).`,
      );
      for (const p of parts) {
        if (p.note) notes.push(p.note);
      }
      migrated = true;
    } else {
      // Non-array / non-string → drop it with a warning rather than crash.
      notes.push(
        'Discarded malformed "allowed-tools" field (must be array or CSV string).',
      );
      migrated = true;
    }
  }

  return { frontmatter, migrated, notes };
}

interface ToolTranslation {
  name: string;
  changed: boolean;
  note: string;
}

/**
 * Translate one entry from Claude's allowed-tools list to Qwen form. Handles
 * three shapes:
 *   - bare name:          `Read`            → `read_file`
 *   - parenthesized form: `Bash(npm test)`  → `run_shell_command`
 *     (arg restriction is dropped; Qwen lacks arg-level filtering)
 *   - passthrough:        `mcp__github`     → `mcp__github` unchanged
 */
function translateToolEntry(entry: string): ToolTranslation {
  const trimmed = entry.trim();
  // Strip a `(…)` suffix if present.
  const parenIdx = trimmed.indexOf('(');
  const base = parenIdx >= 0 ? trimmed.slice(0, parenIdx).trim() : trimmed;
  const hadParens = parenIdx >= 0;

  // MCP patterns or already snake_case — pass through.
  if (
    base.startsWith('mcp__') ||
    base.includes('_') ||
    base === base.toLowerCase()
  ) {
    return {
      name: base,
      changed: hadParens,
      note: hadParens
        ? `Dropped arg restriction from "${trimmed}" (Qwen allowlist is name-only).`
        : '',
    };
  }

  const mapped = CLAUDE_TO_QWEN_TOOL_MAP[base];
  if (mapped) {
    return {
      name: mapped,
      changed: true,
      note: hadParens
        ? `Mapped "${trimmed}" → "${mapped}" (dropped arg restriction).`
        : `Mapped "${base}" → "${mapped}".`,
    };
  }

  // Unknown PascalCase entry — leave as-is but warn so author can fix.
  return {
    name: base,
    changed: hadParens,
    note: `Unknown tool name "${base}" left unchanged; verify it matches a Qwen tool.`,
  };
}

/**
 * True if the frontmatter appears to be Claude-flavoured (has `allowed-tools`
 * but no `allowedTools`). Caller can use this to decide whether to log.
 */
export function isClaudeStyleFrontmatter(
  frontmatter: Record<string, unknown>,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(frontmatter, 'allowed-tools') &&
    !Object.prototype.hasOwnProperty.call(frontmatter, 'allowedTools')
  );
}
