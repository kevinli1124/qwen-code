/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration smoke test: proves a memory written via the store surfaces in
 * `Config.userMemory` after `refreshHierarchicalMemory()`, i.e. agents will
 * actually see it in their system prompt on the next turn.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
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
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-memint-')),
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

describe('memory → system prompt integration', () => {
  it('refreshHierarchicalMemory surfaces the memory index inside userMemory', async () => {
    const config = makeFakeConfig({
      cwd: projectRoot,
      targetDir: projectRoot,
    });

    // Before writing anything, no memory INDEX should appear — but the
    // always-on discipline block should, so the agent knows how to write
    // the first memory.
    await config.refreshHierarchicalMemory();
    const beforeMem = config.getUserMemory();
    expect(beforeMem).not.toContain('Memory index (');
    expect(beforeMem).toContain('Memory discipline');

    // Write a user-scope memory.
    const store = config.getMemoryStore();
    await store.writeMemory({
      name: 'user_role',
      description: 'zh-TW full-stack dev, prefers Vue and .NET',
      type: 'user',
      scope: 'user',
      content: 'User is a full-stack developer who writes in zh-TW.',
    });

    // After refresh, the index should be visible in userMemory with the hook.
    await config.refreshHierarchicalMemory();
    const afterMem = config.getUserMemory();
    expect(afterMem).toContain('Memory index (user)');
    expect(afterMem).toContain('[User Role](./user_role.md)');
    expect(afterMem).toContain('zh-TW full-stack dev');

    // The body itself must NOT be inlined — that's the whole on-demand point.
    expect(afterMem).not.toContain(
      'User is a full-stack developer who writes in zh-TW.',
    );
  });

  it('project-scope memory appears under a project marker', async () => {
    const config = makeFakeConfig({
      cwd: projectRoot,
      targetDir: projectRoot,
    });
    await config.getMemoryStore().writeMemory({
      name: 'arch_note',
      description: 'monorepo with packages/core and packages/cli',
      type: 'project',
      scope: 'project',
      content: 'body',
    });
    await config.refreshHierarchicalMemory();
    const mem = config.getUserMemory();
    expect(mem).toContain('Memory index (project)');
    expect(mem).toContain('[Arch Note](./arch_note.md)');
  });

  it('removing a memory removes its index entry after refresh', async () => {
    const config = makeFakeConfig({
      cwd: projectRoot,
      targetDir: projectRoot,
    });
    const store = config.getMemoryStore();
    await store.writeMemory({
      name: 'temp',
      description: 'will be deleted',
      type: 'reference',
      scope: 'user',
      content: 'x',
    });
    await config.refreshHierarchicalMemory();
    expect(config.getUserMemory()).toContain('[Temp](./temp.md)');

    await store.removeMemory('temp');
    await config.refreshHierarchicalMemory();
    expect(config.getUserMemory()).not.toContain('[Temp](./temp.md)');
  });
});
