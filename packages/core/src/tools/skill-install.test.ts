/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SkillInstallTool } from './skill-install.js';
import { MemoryExportTool } from './memory-export.js';
import { makeFakeConfig } from '../test-utils/config.js';

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: vi.fn(() => actual.homedir()),
  };
});

let tmpRoot: string;
let sourceHome: string;
let sourceProject: string;
let targetHome: string;
let targetProject: string;

beforeEach(async () => {
  tmpRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-skillinst-')),
  );
  sourceHome = path.join(tmpRoot, 'source-home');
  sourceProject = path.join(tmpRoot, 'source-project');
  targetHome = path.join(tmpRoot, 'target-home');
  targetProject = path.join(tmpRoot, 'target-project');
  await fs.mkdir(sourceHome, { recursive: true });
  await fs.mkdir(sourceProject, { recursive: true });
  await fs.mkdir(targetHome, { recursive: true });
  await fs.mkdir(targetProject, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

async function run(
  tool: SkillInstallTool,
  params: Parameters<SkillInstallTool['build']>[0],
) {
  const invocation = tool.build(params);
  return invocation.execute(new AbortController().signal);
}

/**
 * Produces a real SKILL.md bundle on disk inside `sourceHome`/`sourceProject`
 * by exercising memory_export against a seeded MemoryStore.
 */
async function produceBundle(_opts: { acceptCrossUser?: boolean }): Promise<{
  sourcePath: string;
  bundleContent: string;
}> {
  vi.mocked(os.homedir).mockReturnValue(sourceHome);
  const sourceConfig = makeFakeConfig({
    cwd: sourceProject,
    targetDir: sourceProject,
  });
  const store = sourceConfig.getMemoryStore();
  await store.writeMemory({
    name: 'eslint_globs',
    type: 'decision',
    scope: 'user',
    description: 'ESLint flat config globs do not inherit',
    content: 'The rule in one sentence.\n\n**Why:** past incident.',
  });
  await store.writeMemory({
    name: 'typescript_strict',
    type: 'decision',
    scope: 'user',
    description: 'Always enable strict in new packages',
    content: 'Rule body',
  });
  const exportTool = new MemoryExportTool(sourceConfig);
  const exportResult = await exportTool
    .build({
      skillName: 'sky-wisdom',
      types: ['decision'],
      level: 'user',
    })
    .execute(new AbortController().signal);
  expect(exportResult.returnDisplay).toMatch(/Exported 2/);

  const sourcePath = path.join(
    sourceHome,
    '.qwen',
    'skills',
    'sky-wisdom',
    'SKILL.md',
  );
  const bundleContent = await fs.readFile(sourcePath, 'utf8');
  return { sourcePath, bundleContent };
}

describe('skill_install — happy path', () => {
  it('installs a bundle into the target workspace when same user', async () => {
    const originalUser = process.env['USER'];
    process.env['USER'] = 'shared-user';
    try {
      const { sourcePath } = await produceBundle({});

      // Monkey-patch provenance to match current user so we don't hit the
      // cross-user guard.
      const src = await fs.readFile(sourcePath, 'utf8');
      const patched = src.replace(/sourceUser: \S+/, 'sourceUser: shared-user');
      await fs.writeFile(sourcePath, patched, 'utf8');

      vi.mocked(os.homedir).mockReturnValue(targetHome);
      const targetConfig = makeFakeConfig({
        cwd: targetProject,
        targetDir: targetProject,
      });
      const tool = new SkillInstallTool(targetConfig);

      const result = await run(tool, { sourcePath });
      expect(result.returnDisplay).toMatch(/Installed sky-wisdom/);

      const installedPath = path.join(
        targetHome,
        '.qwen',
        'skills',
        'sky-wisdom',
        'SKILL.md',
      );
      const installed = await fs.readFile(installedPath, 'utf8');
      expect(installed).toContain('name: sky-wisdom');
      expect(installed).toContain('provenance:');
      expect(installed).toContain('extractedFrom:');
    } finally {
      if (originalUser === undefined) delete process.env['USER'];
      else process.env['USER'] = originalUser;
    }
  });

  it('refuses silent cross-user install without acceptCrossUser', async () => {
    const originalUser = process.env['USER'];
    process.env['USER'] = 'bob';
    try {
      const { sourcePath } = await produceBundle({});

      const src = await fs.readFile(sourcePath, 'utf8');
      const patched = src.replace(/sourceUser: \S+/, 'sourceUser: alice');
      await fs.writeFile(sourcePath, patched, 'utf8');

      vi.mocked(os.homedir).mockReturnValue(targetHome);
      const targetConfig = makeFakeConfig({
        cwd: targetProject,
        targetDir: targetProject,
      });
      const tool = new SkillInstallTool(targetConfig);

      const result = await run(tool, { sourcePath });
      expect(result.returnDisplay).toMatch(/Cross-user confirmation/);
      expect(result.llmContent).toMatch(/acceptCrossUser: true/);
    } finally {
      if (originalUser === undefined) delete process.env['USER'];
      else process.env['USER'] = originalUser;
    }
  });

  it('installs cross-user bundle when acceptCrossUser=true', async () => {
    const originalUser = process.env['USER'];
    process.env['USER'] = 'bob';
    try {
      const { sourcePath } = await produceBundle({});

      const src = await fs.readFile(sourcePath, 'utf8');
      const patched = src.replace(/sourceUser: \S+/, 'sourceUser: alice');
      await fs.writeFile(sourcePath, patched, 'utf8');

      vi.mocked(os.homedir).mockReturnValue(targetHome);
      const targetConfig = makeFakeConfig({
        cwd: targetProject,
        targetDir: targetProject,
      });
      const tool = new SkillInstallTool(targetConfig);

      const result = await run(tool, {
        sourcePath,
        acceptCrossUser: true,
      });
      expect(result.returnDisplay).toMatch(/Installed sky-wisdom/);
      expect(result.llmContent).toMatch(/Provenance/);
    } finally {
      if (originalUser === undefined) delete process.env['USER'];
      else process.env['USER'] = originalUser;
    }
  });
});

describe('skill_install — memory unpack', () => {
  it('unpacks embedded memory sections when unpackMemories=true', async () => {
    const originalUser = process.env['USER'];
    process.env['USER'] = 'shared-user';
    try {
      const { sourcePath } = await produceBundle({});

      const src = await fs.readFile(sourcePath, 'utf8');
      const patched = src.replace(/sourceUser: \S+/, 'sourceUser: shared-user');
      await fs.writeFile(sourcePath, patched, 'utf8');

      vi.mocked(os.homedir).mockReturnValue(targetHome);
      const targetConfig = makeFakeConfig({
        cwd: targetProject,
        targetDir: targetProject,
      });
      const tool = new SkillInstallTool(targetConfig);

      const result = await run(tool, {
        sourcePath,
        unpackMemories: true,
      });
      expect(result.llmContent).toMatch(/unpacked 2 memory/);

      const memories = await targetConfig
        .getMemoryStore()
        .listMemories({ scope: 'user', force: true });
      const names = memories.map((m) => m.name);
      // sanitizeMemoryName replaces '/' with '-' to satisfy the allowed
      // charset, so the prefix becomes `imported-<user>-<orig>`.
      expect(names).toContain('imported-shared-user-eslint_globs');
      expect(names).toContain('imported-shared-user-typescript_strict');
    } finally {
      if (originalUser === undefined) delete process.env['USER'];
      else process.env['USER'] = originalUser;
    }
  });
});

describe('skill_install — input validation', () => {
  it('rejects non-absolute sourcePath', async () => {
    vi.mocked(os.homedir).mockReturnValue(targetHome);
    const targetConfig = makeFakeConfig({
      cwd: targetProject,
      targetDir: targetProject,
    });
    const tool = new SkillInstallTool(targetConfig);
    const result = await run(tool, { sourcePath: 'relative/path.md' });
    expect(result.error).toBeDefined();
    expect(result.llmContent).toMatch(/absolute/);
  });

  it('reports read errors clearly', async () => {
    vi.mocked(os.homedir).mockReturnValue(targetHome);
    const targetConfig = makeFakeConfig({
      cwd: targetProject,
      targetDir: targetProject,
    });
    const tool = new SkillInstallTool(targetConfig);
    const absent = path.join(tmpRoot, 'nowhere', 'SKILL.md');
    const result = await run(tool, { sourcePath: absent });
    expect(result.error).toBeDefined();
    expect(result.llmContent).toMatch(/Failed to read/);
  });
});
