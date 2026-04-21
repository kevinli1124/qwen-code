/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SkillWriteTool } from './skill-write.js';
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
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-skill-write-')),
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
  tool: SkillWriteTool,
  params: Parameters<SkillWriteTool['build']>[0],
) {
  const invocation = tool.build(params);
  return invocation.execute(new AbortController().signal);
}

describe('skill_write — basic writes', () => {
  it('saves a new project-level skill', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillWriteTool(config);

    const result = await run(tool, {
      name: 'eslint-monorepo-fix',
      description: 'Diagnose and fix ESLint glob patterns in monorepos',
      body: '# ESLint monorepo fix\n\nFixes glob patterns.',
    });

    expect(result.returnDisplay).toMatch(/Saved eslint-monorepo-fix/);
    const skillPath = path.join(
      projectRoot,
      '.qwen',
      'skills',
      'eslint-monorepo-fix',
      'SKILL.md',
    );
    const content = await fs.readFile(skillPath, 'utf8');
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('name: eslint-monorepo-fix');
    expect(content).toContain('# ESLint monorepo fix');
  });

  it('rejects invalid levels at the schema layer', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillWriteTool(config);
    // level is enum: [project, user] in the schema; anything else fails
    // validation before execute is ever called.
    expect(() =>
      tool.build({
        name: 'x',
        description: 'x',
        body: 'x',
        level: 'bundled' as 'project',
      }),
    ).toThrow(/level|allowed values/);
  });
});

describe('skill_write — similarity gate', () => {
  it('flags near-duplicate and returns three-option suggestion', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillWriteTool(config);

    // Seed an existing skill.
    await run(tool, {
      name: 'eslint-monorepo-fix',
      description: 'Diagnose and fix ESLint glob patterns in monorepos',
      body: 'body',
    });

    // Propose a near-duplicate.
    const result = await run(tool, {
      name: 'lint-config-doctor',
      description: 'Diagnose ESLint glob patterns monorepos fix',
      body: 'body',
    });
    expect(result.returnDisplay).toMatch(/Similar skill exists/);
    expect(result.llmContent).toMatch(/\[merge\]/);
    expect(result.llmContent).toMatch(/\[new\]/);
    expect(result.llmContent).toMatch(/\[cancel\]/);
    expect(result.llmContent).toContain('eslint-monorepo-fix');

    // Verify the proposed file was NOT created.
    const proposedPath = path.join(
      projectRoot,
      '.qwen',
      'skills',
      'lint-config-doctor',
      'SKILL.md',
    );
    await expect(fs.access(proposedPath)).rejects.toThrow();
  });

  it('mergeInto overwrites the target skill', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillWriteTool(config);

    await run(tool, {
      name: 'eslint-fix',
      description: 'old description',
      body: 'old body',
    });

    const result = await run(tool, {
      name: 'anything',
      description: 'new description',
      body: '# updated body',
      mergeInto: 'eslint-fix',
    });
    expect(result.returnDisplay).toMatch(/Merged into eslint-fix/);

    const content = await fs.readFile(
      path.join(projectRoot, '.qwen', 'skills', 'eslint-fix', 'SKILL.md'),
      'utf8',
    );
    expect(content).toContain('new description');
    expect(content).toContain('# updated body');
    expect(content).not.toContain('old body');
  });

  it('mergeInto on missing target errors helpfully', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillWriteTool(config);

    const result = await run(tool, {
      name: 'x',
      description: 'x',
      body: 'x',
      mergeInto: 'nonexistent',
    });
    expect(result.error).toBeDefined();
    expect(result.llmContent).toMatch(/not found at level/);
  });

  it('force=true bypasses the similarity gate', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillWriteTool(config);

    await run(tool, {
      name: 'eslint-monorepo-fix',
      description: 'Diagnose and fix ESLint glob patterns in monorepos',
      body: 'body',
    });

    const result = await run(tool, {
      name: 'lint-config-doctor',
      description: 'Diagnose ESLint glob patterns monorepos fix',
      body: 'body',
      force: true,
    });
    expect(result.returnDisplay).toMatch(/Saved lint-config-doctor/);
  });
});
