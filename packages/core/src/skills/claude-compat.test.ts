/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeClaudeFrontmatter,
  isClaudeStyleFrontmatter,
  CLAUDE_TO_QWEN_TOOL_MAP,
} from './claude-compat.js';
import { parseSkillContent } from './skill-load.js';

describe('normalizeClaudeFrontmatter', () => {
  it('renames allowed-tools to allowedTools and maps PascalCase names', () => {
    const { frontmatter, migrated, notes } = normalizeClaudeFrontmatter({
      name: 'x',
      description: 'y',
      'allowed-tools': ['Read', 'Write', 'Edit'],
    });

    expect(migrated).toBe(true);
    expect(frontmatter['allowed-tools']).toBeUndefined();
    expect(frontmatter['allowedTools']).toEqual([
      'read_file',
      'write_file',
      'edit',
    ]);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('strips (args) suffix from parameterized entries', () => {
    const { frontmatter, notes } = normalizeClaudeFrontmatter({
      'allowed-tools': ['Bash(npm install:*)', 'Bash(npm test)'],
    });

    expect(frontmatter['allowedTools']).toEqual([
      'run_shell_command',
      'run_shell_command',
    ]);
    expect(notes.some((n) => n.includes('dropped arg restriction'))).toBe(true);
  });

  it('passes MCP tool patterns through unchanged', () => {
    const { frontmatter } = normalizeClaudeFrontmatter({
      'allowed-tools': ['mcp__github', 'Read'],
    });

    expect(frontmatter['allowedTools']).toEqual(['mcp__github', 'read_file']);
  });

  it('leaves Qwen-style frontmatter untouched', () => {
    const input = {
      name: 'x',
      description: 'y',
      allowedTools: ['read_file', 'edit'],
    };
    const { frontmatter, migrated } = normalizeClaudeFrontmatter(input);

    expect(migrated).toBe(false);
    expect(frontmatter).toEqual(input);
  });

  it('does not clobber allowedTools if both fields somehow coexist', () => {
    // Edge case: prefer the explicit Qwen form.
    const { frontmatter, migrated } = normalizeClaudeFrontmatter({
      'allowed-tools': ['Read'],
      allowedTools: ['edit'],
    });

    expect(migrated).toBe(false);
    expect(frontmatter['allowedTools']).toEqual(['edit']);
    // The kebab key is retained but ignored by downstream parsers.
    expect(frontmatter['allowed-tools']).toEqual(['Read']);
  });

  it('accepts CSV string form of allowed-tools', () => {
    const { frontmatter } = normalizeClaudeFrontmatter({
      'allowed-tools': 'Read, Write, Bash',
    });
    expect(frontmatter['allowedTools']).toEqual([
      'read_file',
      'write_file',
      'run_shell_command',
    ]);
  });

  it('warns on unknown PascalCase tool names but keeps them', () => {
    const { frontmatter, notes } = normalizeClaudeFrontmatter({
      'allowed-tools': ['MysteryTool'],
    });
    expect(frontmatter['allowedTools']).toEqual(['MysteryTool']);
    expect(notes.some((n) => n.includes('MysteryTool'))).toBe(true);
  });

  it('discards malformed allowed-tools values rather than crashing', () => {
    const { frontmatter, migrated, notes } = normalizeClaudeFrontmatter({
      'allowed-tools': 42 as unknown as string[],
    });
    expect(migrated).toBe(true);
    expect(frontmatter['allowedTools']).toBeUndefined();
    expect(notes.some((n) => n.includes('malformed'))).toBe(true);
  });

  it('does not mutate the input object', () => {
    const input: Record<string, unknown> = {
      'allowed-tools': ['Read'],
    };
    normalizeClaudeFrontmatter(input);
    expect(input['allowed-tools']).toEqual(['Read']);
    expect(input['allowedTools']).toBeUndefined();
  });
});

describe('CLAUDE_TO_QWEN_TOOL_MAP', () => {
  it('covers the common Claude tools', () => {
    const expected = [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Grep',
      'Glob',
      'LS',
      'WebFetch',
      'WebSearch',
      'TodoWrite',
      'Task',
      'Agent',
      'AskUserQuestion',
      'Skill',
    ];
    for (const name of expected) {
      expect(CLAUDE_TO_QWEN_TOOL_MAP[name]).toBeTruthy();
    }
  });
});

describe('isClaudeStyleFrontmatter', () => {
  it('detects kebab-case allowed-tools without camelCase counterpart', () => {
    expect(isClaudeStyleFrontmatter({ 'allowed-tools': ['Read'] })).toBe(true);
    expect(
      isClaudeStyleFrontmatter({ 'allowed-tools': ['Read'], allowedTools: [] }),
    ).toBe(false);
    expect(isClaudeStyleFrontmatter({ allowedTools: [] })).toBe(false);
    expect(isClaudeStyleFrontmatter({})).toBe(false);
  });
});

describe('parseSkillContent auto-migration (end-to-end)', () => {
  it('loads a Claude-format SKILL.md and produces allowedTools in Qwen form', () => {
    const claudeSkill = `---
name: claude-style
description: Loaded via compat shim
allowed-tools:
  - Read
  - Write
  - Bash
---
# Body

This skill was authored for Claude Code but should load cleanly in Qwen.
`;
    const config = parseSkillContent(claudeSkill, '/fake/path/SKILL.md');
    expect(config.name).toBe('claude-style');
    expect(config.allowedTools).toEqual([
      'read_file',
      'write_file',
      'run_shell_command',
    ]);
  });
});
