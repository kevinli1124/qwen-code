/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  validateAgentDefinition,
  KNOWN_TOOLS,
} from '../validate-agents.mjs';

// ── parseFrontmatter ───────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('parses minimal valid frontmatter', () => {
    const content = `---
name: my-agent
description: Does things.
---

# My Agent

System prompt here.
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result.frontmatter.name).toBe('my-agent');
    expect(result.frontmatter.description).toBe('Does things.');
    expect(result.body).toContain('System prompt here.');
  });

  it('parses tools as an array', () => {
    const content = `---
name: my-agent
description: Desc.
tools:
  - read_file
  - grep_search
---

Body.
`;
    const result = parseFrontmatter(content);
    expect(Array.isArray(result.frontmatter.tools)).toBe(true);
    expect(result.frontmatter.tools).toEqual(['read_file', 'grep_search']);
  });

  it('returns null when frontmatter is missing', () => {
    const result = parseFrontmatter('No frontmatter here.');
    expect(result).toBeNull();
  });

  it('returns null when frontmatter delimiters are malformed', () => {
    const result = parseFrontmatter('--\nname: x\n--\nBody');
    expect(result).toBeNull();
  });

  it('handles quoted string values', () => {
    const content = `---
name: my-agent
description: "Has quotes."
---
Body.
`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter.description).toBe('Has quotes.');
  });

  it('captures body after frontmatter', () => {
    const content = `---
name: my-agent
description: Desc.
---
# Title

Some content here.
`;
    const result = parseFrontmatter(content);
    expect(result.body).toContain('# Title');
    expect(result.body).toContain('Some content here.');
  });
});

// ── validateAgentDefinition ────────────────────────────────────────────────

const VALID_FILE_PATH = '/project/.qwen/agents/my-agent.md';

function makeValid(overrides = {}) {
  return {
    frontmatter: {
      name: 'my-agent',
      description: 'A valid agent that does things well.',
      tools: ['read_file', 'grep_search'],
      ...overrides,
    },
    body: 'You are my-agent. You read files and find patterns. Produce structured output.',
  };
}

describe('validateAgentDefinition — required fields', () => {
  it('passes a fully valid definition', () => {
    const { errors, warnings } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid(),
    );
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('errors when name is missing', () => {
    const { errors } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ name: undefined }),
    );
    expect(
      errors.some((e) => e.includes('name') && e.includes('required')),
    ).toBe(true);
  });

  it('errors when name is empty string', () => {
    const { errors } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ name: '' }),
    );
    expect(errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('errors when name contains uppercase', () => {
    const { errors } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ name: 'MyAgent' }),
    );
    expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('errors when name contains spaces', () => {
    const { errors } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ name: 'my agent' }),
    );
    expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('allows hyphens in name', () => {
    const { errors } = validateAgentDefinition(
      '/project/.qwen/agents/my-new-agent.md',
      makeValid({ name: 'my-new-agent' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('errors when description is missing', () => {
    const { errors } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ description: undefined }),
    );
    expect(
      errors.some((e) => e.includes('description') && e.includes('required')),
    ).toBe(true);
  });

  it('errors when description is empty', () => {
    const { errors } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ description: '' }),
    );
    expect(errors.some((e) => e.includes('description'))).toBe(true);
  });
});

describe('validateAgentDefinition — tools', () => {
  it('warns on unknown tool names', () => {
    const { warnings } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ tools: ['read_file', 'fly_to_moon'] }),
    );
    expect(warnings.some((w) => w.includes('fly_to_moon'))).toBe(true);
  });

  it('passes with all known tools', () => {
    const { errors, warnings } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ tools: [...KNOWN_TOOLS].slice(0, 3) }),
    );
    expect(errors).toHaveLength(0);
    expect(warnings.filter((w) => w.includes('unknown'))).toHaveLength(0);
  });

  it('errors when tools is not an array', () => {
    const { errors } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ tools: 'read_file' }),
    );
    expect(errors.some((e) => e.includes('tools') && e.includes('array'))).toBe(
      true,
    );
  });

  it('passes when tools is omitted (inherits all)', () => {
    const parsed = makeValid();
    delete parsed.frontmatter.tools;
    const { errors, warnings } = validateAgentDefinition(
      VALID_FILE_PATH,
      parsed,
    );
    expect(errors).toHaveLength(0);
    expect(warnings.filter((w) => w.includes('unknown'))).toHaveLength(0);
  });
});

describe('validateAgentDefinition — approvalMode', () => {
  for (const mode of ['default', 'plan', 'auto-edit', 'yolo']) {
    it(`accepts "${mode}"`, () => {
      const { errors } = validateAgentDefinition(
        VALID_FILE_PATH,
        makeValid({ approvalMode: mode }),
      );
      expect(errors.filter((e) => e.includes('approvalMode'))).toHaveLength(0);
    });
  }

  it('errors on invalid approvalMode', () => {
    const { errors } = validateAgentDefinition(
      VALID_FILE_PATH,
      makeValid({ approvalMode: 'superpower' }),
    );
    expect(errors.some((e) => e.includes('approvalMode'))).toBe(true);
  });
});

describe('validateAgentDefinition — name/filename mismatch', () => {
  it('warns when name does not match filename', () => {
    const { warnings } = validateAgentDefinition(
      '/project/.qwen/agents/other-name.md',
      makeValid({ name: 'my-agent' }),
    );
    expect(warnings.some((w) => w.includes('does not match filename'))).toBe(
      true,
    );
  });

  it('no warning when name matches filename', () => {
    const { warnings } = validateAgentDefinition(
      '/project/.qwen/agents/my-agent.md',
      makeValid({ name: 'my-agent' }),
    );
    expect(warnings.filter((w) => w.includes('does not match'))).toHaveLength(
      0,
    );
  });
});

describe('validateAgentDefinition — system prompt', () => {
  it('warns when body is empty', () => {
    const parsed = makeValid();
    parsed.body = '';
    const { warnings } = validateAgentDefinition(VALID_FILE_PATH, parsed);
    expect(warnings.some((w) => w.includes('empty'))).toBe(true);
  });

  it('warns when body is very short', () => {
    const parsed = makeValid();
    parsed.body = 'Short.';
    const { warnings } = validateAgentDefinition(VALID_FILE_PATH, parsed);
    expect(warnings.some((w) => w.includes('short'))).toBe(true);
  });

  it('no warning for a normal-length body', () => {
    const parsed = makeValid();
    parsed.body =
      'You are my-agent. You read files, search for patterns, and produce structured diagnostic reports without editing any files.';
    const { warnings } = validateAgentDefinition(VALID_FILE_PATH, parsed);
    expect(
      warnings.filter((w) => w.includes('short') || w.includes('empty')),
    ).toHaveLength(0);
  });
});
