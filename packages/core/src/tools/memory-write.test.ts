/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end dedup behavior for memory_write. Exercises the near-duplicate
 * detection hooked in for overwrite=false calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { MemoryWriteTool } from './memory-write.js';
import { makeFakeConfig } from '../test-utils/config.js';

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: vi.fn(() => actual.homedir()),
  };
});

let tmpRoot: string;
let fakeHome: string;
let projectRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-memwrite-')),
  );
  fakeHome = path.join(tmpRoot, 'home');
  projectRoot = path.join(tmpRoot, 'project');
  await fs.mkdir(fakeHome, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  vi.mocked(os.homedir).mockReturnValue(fakeHome);
});

afterEach(async () => {
  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

async function run(
  tool: MemoryWriteTool,
  params: Parameters<MemoryWriteTool['createInvocation']>[0],
) {
  // createInvocation is protected; tool.build() returns an invocation.
  const invocation = tool.build(params);
  return invocation.execute(new AbortController().signal);
}

describe('memory_write — similarity gating (overwrite=false)', () => {
  it('writes normally when no similar entries exist', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryWriteTool(config);

    const result = await run(tool, {
      name: 'eslint_monorepo_globs',
      type: 'decision',
      scope: 'project',
      description:
        'ESLint flat config glob patterns do not inherit across blocks',
      content: 'Body',
      overwrite: false,
    });

    expect(result.returnDisplay).toMatch(/Saved eslint_monorepo_globs/);
  });

  it('returns similar_found notice when a near-duplicate exists', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryWriteTool(config);

    // Seed: existing memory
    await run(tool, {
      name: 'eslint_monorepo_globs',
      type: 'decision',
      scope: 'project',
      description:
        'ESLint flat config glob patterns do not inherit across blocks',
      content: 'Body',
      overwrite: true,
    });

    // Attempt near-duplicate under a DIFFERENT name.
    const result = await run(tool, {
      name: 'eslint_glob_inheritance',
      type: 'decision',
      scope: 'project',
      description: 'ESLint glob patterns inherit blocks across flat config',
      content: 'Body',
      overwrite: false,
    });

    expect(result.returnDisplay).toMatch(
      /Similar memory exists: eslint_monorepo_globs/,
    );
    expect(result.llmContent).toMatch(/Skipped save/);
    expect(result.llmContent).toMatch(/eslint_monorepo_globs/);

    // Verify the near-duplicate was NOT written to disk.
    const expected = path.join(
      projectRoot,
      '.qwen',
      'memory',
      'eslint_glob_inheritance.md',
    );
    await expect(fs.access(expected)).rejects.toThrow();
  });

  it('overwrite=true bypasses similarity and writes', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryWriteTool(config);

    await run(tool, {
      name: 'eslint_monorepo_globs',
      type: 'decision',
      scope: 'project',
      description:
        'ESLint flat config glob patterns do not inherit across blocks',
      content: 'Body',
      overwrite: true,
    });

    const result = await run(tool, {
      name: 'eslint_glob_inheritance',
      type: 'decision',
      scope: 'project',
      description: 'ESLint glob patterns inherit blocks across flat config',
      content: 'Body',
      overwrite: true,
    });

    expect(result.returnDisplay).toMatch(/Saved eslint_glob_inheritance/);
  });

  it('same-name entries are handled by the store, not the similarity gate', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryWriteTool(config);

    await run(tool, {
      name: 'user_profile',
      type: 'user',
      scope: 'user',
      description: 'Prefers concise replies in Traditional Chinese',
      content: 'Body',
      overwrite: true,
    });

    // Same name, overwrite=false → the store's ALREADY_EXISTS path fires;
    // similarity gate excludes same-name entries.
    const result = await run(tool, {
      name: 'user_profile',
      type: 'user',
      scope: 'user',
      description: 'Prefers concise replies in Traditional Chinese',
      content: 'Body',
      overwrite: false,
    });

    expect(result.llmContent).toMatch(/already exists/);
  });
});
