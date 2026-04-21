/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  MemoryExportTool,
  renderBody,
  buildProvenance,
} from './memory-export.js';
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
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-memexp-')),
  );
  fakeHome = path.join(tmpRoot, 'home');
  projectRoot = path.join(tmpRoot, 'project-x');
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
  tool: MemoryExportTool,
  params: Parameters<MemoryExportTool['build']>[0],
) {
  const invocation = tool.build(params);
  return invocation.execute(new AbortController().signal);
}

describe('memory_export', () => {
  it('reports "no memories matched" when filters are empty', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryExportTool(config);
    const result = await run(tool, { skillName: 'empty-bundle' });
    expect(result.returnDisplay).toMatch(/No memories matched/);
  });

  it('writes a SKILL.md with provenance when memories exist', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const store = config.getMemoryStore();
    await store.writeMemory({
      name: 'eslint_globs',
      type: 'decision',
      scope: 'user',
      description: 'ESLint flat config globs do not inherit',
      content: 'Body A',
    });
    await store.writeMemory({
      name: 'typescript_strict',
      type: 'decision',
      scope: 'user',
      description: 'Always enable strict in new packages',
      content: 'Body B',
    });

    const tool = new MemoryExportTool(config);
    const result = await run(tool, {
      skillName: 'wisdom-bundle',
      types: ['decision'],
      level: 'user',
    });
    expect(result.returnDisplay).toMatch(/Exported 2 → wisdom-bundle/);

    const skillPath = path.join(
      fakeHome,
      '.qwen',
      'skills',
      'wisdom-bundle',
      'SKILL.md',
    );
    const content = await fs.readFile(skillPath, 'utf8');
    expect(content).toContain('name: wisdom-bundle');
    expect(content).toContain('provenance:');
    expect(content).toContain('extractedFrom:');
    expect(content).toContain('eslint_globs');
    expect(content).toContain('typescript_strict');
    expect(content).toContain('Body A');
    expect(content).toContain('Body B');
  });

  it('honors agent filter', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const store = config.getMemoryStore();
    await store.writeMemory({
      name: 'impl_decision',
      type: 'decision',
      scope: 'user',
      description: 'Implementer-scoped decision',
      content: 'body',
      agent: 'implementer',
    });
    await store.writeMemory({
      name: 'other_decision',
      type: 'decision',
      scope: 'user',
      description: 'Unscoped',
      content: 'body',
    });

    const tool = new MemoryExportTool(config);
    const result = await run(tool, {
      skillName: 'impl-wisdom',
      agent: 'implementer',
    });
    expect(result.returnDisplay).toMatch(/Exported 1/);

    const content = await fs.readFile(
      path.join(fakeHome, '.qwen', 'skills', 'impl-wisdom', 'SKILL.md'),
      'utf8',
    );
    expect(content).toContain('impl_decision');
    expect(content).not.toContain('other_decision');
  });

  it('refuses invalid levels', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryExportTool(config);
    // bundled is not in the schema enum — tool build throws.
    expect(() =>
      tool.build({ skillName: 'x', level: 'bundled' as 'user' }),
    ).toThrow(/level|allowed values/);
  });
});

describe('renderBody', () => {
  it('includes a provenance header line', () => {
    const body = renderBody(
      'wisdom',
      [
        {
          name: 'fact',
          type: 'decision',
          scope: 'user',
          description: 'd',
          content: 'c',
        },
      ],
      {
        sourceUser: 'Sky',
        sourceProject: 'qwen-code',
        extractedAt: '2026-04-22T09:00:00Z',
      },
    );
    expect(body).toContain('Sky');
    expect(body).toContain('qwen-code');
    expect(body).toContain('### fact (decision)');
  });
});

describe('buildProvenance', () => {
  it('includes timestamp and extractedFrom list', () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const prov = buildProvenance({
      config,
      sourceAgent: 'implementer',
      extractedFrom: ['a', 'b'],
    });
    expect(prov.extractedAt).toBeDefined();
    expect(prov.extractedFrom).toEqual(['a', 'b']);
    expect(prov.sourceAgent).toBe('implementer');
  });
});
