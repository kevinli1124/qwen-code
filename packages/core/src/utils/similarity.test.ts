/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  findSimilarMemories,
  findSimilarSkills,
  jaccard,
  slugify,
  tokenize,
} from './similarity.js';
import type { SkillConfig } from '../skills/types.js';
import type { MemoryConfig } from '../memory/types.js';

function skill(
  name: string,
  description: string,
  overrides: Partial<SkillConfig> = {},
): SkillConfig {
  return {
    name,
    description,
    level: 'user',
    filePath: `/fake/${name}/SKILL.md`,
    body: '',
    ...overrides,
  };
}

function memory(
  name: string,
  description: string,
  type: MemoryConfig['type'] = 'project',
  overrides: Partial<MemoryConfig> = {},
): MemoryConfig {
  return {
    name,
    description,
    type,
    scope: 'user',
    content: 'body',
    ...overrides,
  };
}

// ─── Helpers ───────────────────────────────────────────────────

describe('slugify', () => {
  it('normalizes mixed punctuation and case', () => {
    expect(slugify('ESLint_Monorepo Fix.v2')).toBe('eslint-monorepo-fix-v2');
  });
  it('strips leading/trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
  });
});

describe('tokenize', () => {
  it('drops stopwords and short tokens', () => {
    expect(Array.from(tokenize('The ESLint and a b c'))).toEqual(['eslint']);
  });
  it('lowercases and splits on non-alphanumerics', () => {
    expect(Array.from(tokenize('Foo, Bar; Baz! 42')).sort()).toEqual([
      '42',
      'bar',
      'baz',
      'foo',
    ]);
  });
});

describe('jaccard', () => {
  it('returns 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });
  it('returns 1 for identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });
  it('computes overlap ratio', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'c']))).toBeCloseTo(
      1 / 3,
    );
  });
});

// ─── findSimilarSkills ────────────────────────────────────────

describe('findSimilarSkills', () => {
  const existing: SkillConfig[] = [
    skill(
      'eslint-monorepo-fix',
      'Diagnose and fix ESLint glob patterns in monorepos',
    ),
    skill('typescript-migration', 'Move plain JS modules to typed TS'),
    skill('docker-dev-setup', 'Local Docker Compose for services'),
  ];

  it('detects exact slug match', () => {
    const hits = findSimilarSkills(
      { name: 'eslint-monorepo-fix', description: 'different wording' },
      existing,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.name).toBe('eslint-monorepo-fix');
    expect(hits[0].reason).toBe('exact');
    expect(hits[0].score).toBe(1);
  });

  it('detects near-duplicate name (Levenshtein)', () => {
    const hits = findSimilarSkills(
      { name: 'eslint-monorepo-fixes', description: '' },
      existing,
    );
    expect(hits[0].item.name).toBe('eslint-monorepo-fix');
    expect(hits[0].reason).toBe('name_fuzzy');
  });

  it('detects description token overlap even when names differ', () => {
    const hits = findSimilarSkills(
      {
        name: 'lint-config-doctor',
        description: 'Diagnose ESLint glob patterns monorepos fix',
      },
      existing,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.name).toBe('eslint-monorepo-fix');
    expect(hits[0].reason).toBe('desc_overlap');
  });

  it('returns empty array when nothing matches', () => {
    const hits = findSimilarSkills(
      {
        name: 'unrelated-topic',
        description: 'Completely different thing entirely',
      },
      existing,
    );
    expect(hits).toEqual([]);
  });

  it('sorts hits by score descending', () => {
    const hits = findSimilarSkills(
      { name: 'eslint-monorepo-fix', description: 'eslint monorepo' },
      [
        skill('eslint-monorepo-fixer', 'unrelated words'),
        skill('eslint-monorepo-fix', 'exact topic'),
      ],
    );
    expect(hits[0].item.name).toBe('eslint-monorepo-fix');
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
  });

  it('respects minScore threshold', () => {
    const hits = findSimilarSkills(
      { name: 'x', description: 'short' },
      existing,
      { minScore: 0.99 },
    );
    expect(hits).toEqual([]);
  });
});

// ─── findSimilarMemories ──────────────────────────────────────

describe('findSimilarMemories', () => {
  const existing: MemoryConfig[] = [
    memory(
      'eslint_monorepo_globs',
      'ESLint flat config glob patterns do not inherit across blocks',
      'decision',
    ),
    memory(
      'user_profile',
      'Prefers concise replies, Traditional Chinese',
      'user',
    ),
    memory(
      'telegram_setup',
      'Telegram bot token stored in settings.messaging.telegram',
      'reference',
    ),
  ];

  it('detects exact name match', () => {
    const hits = findSimilarMemories(
      {
        name: 'eslint_monorepo_globs',
        description: 'whatever',
        type: 'decision',
      },
      existing,
    );
    expect(hits.length).toBe(1);
    expect(hits[0].reason).toBe('exact');
  });

  it('respects type filter', () => {
    const hits = findSimilarMemories(
      {
        name: 'user_profile',
        description: '',
        type: 'decision', // user_profile is type=user
      },
      existing,
    );
    expect(hits).toEqual([]);
  });

  it('detects description overlap', () => {
    const hits = findSimilarMemories(
      {
        name: 'eslint_glob_rules',
        description: 'ESLint glob patterns inherit blocks config flat',
        type: 'decision',
      },
      existing,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.name).toBe('eslint_monorepo_globs');
    expect(hits[0].reason).toBe('desc_overlap');
  });

  it('ignores memories with no meaningful similarity', () => {
    const hits = findSimilarMemories(
      {
        name: 'coffee_preference',
        description: 'Likes espresso in the morning',
      },
      existing,
    );
    expect(hits).toEqual([]);
  });
});
