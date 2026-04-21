/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SkillListTool } from './skill-list.js';
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
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-skilllist-')),
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
  tool: SkillListTool,
  params: Parameters<SkillListTool['build']>[0],
) {
  return tool.build(params).execute(new AbortController().signal);
}

describe('skill_list', () => {
  it('reports empty when no skills at the requested scope', async () => {
    // Unfiltered listing may still pull in bundled/ skills shipped with
    // the package, so scope to project to get a clean empty case.
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillListTool(config);
    const result = await run(tool, { level: 'project' });
    expect(result.returnDisplay).toMatch(/No skills/);
  });

  it('groups skills by level and shows provenance', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const skillManager = config.getSkillManager();

    await skillManager.writeSkill({
      name: 'local-skill',
      description: 'Project-local',
      body: '# body',
      level: 'project',
    });
    await skillManager.writeSkill({
      name: 'imported-skill',
      description: 'From another user',
      body: '# body',
      level: 'user',
      provenance: {
        sourceUser: 'alice',
        sourceProject: 'other-repo',
        extractedAt: '2026-04-22T09:00:00Z',
        extractedFrom: ['foo'],
      },
    });

    const tool = new SkillListTool(config);
    const result = await run(tool, {});
    const content = String(result.llmContent);
    expect(content).toContain('## Project');
    expect(content).toContain('local-skill');
    expect(content).toContain('## User');
    expect(content).toContain('imported-skill');
    expect(content).toContain('from alice');
    expect(content).toContain('other-repo');
  });

  it('honors level filter', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const skillManager = config.getSkillManager();
    await skillManager.writeSkill({
      name: 'only-project',
      description: 'P',
      body: '# body',
      level: 'project',
    });
    await skillManager.writeSkill({
      name: 'only-user',
      description: 'U',
      body: '# body',
      level: 'user',
    });

    const tool = new SkillListTool(config);
    const result = await run(tool, { level: 'user' });
    const content = String(result.llmContent);
    expect(content).toContain('only-user');
    expect(content).not.toContain('only-project');
  });
});
