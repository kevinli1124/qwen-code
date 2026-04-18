/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { MemoryStore } from './memory-store.js';
import { MemoryError } from './types.js';

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: vi.fn(() => actual.homedir()),
  };
});

/**
 * Uses a real temp dir per test with a fake HOME pointed at a separate subdir
 * so "user" scope lands somewhere isolated. The test HOME override happens
 * via mocking os.homedir.
 */

let tmpRoot: string;
let fakeHome: string;
let projectRoot: string;

async function setupDirs() {
  // Resolve real path to avoid drift between e.g. C:\Users and C:\Users when
  // Windows returns 8.3 form via mkdtemp.
  tmpRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-mem-')),
  );
  fakeHome = path.join(tmpRoot, 'home');
  projectRoot = path.join(tmpRoot, 'project');
  await fs.mkdir(fakeHome, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
}

beforeEach(async () => {
  await setupDirs();
  vi.mocked(os.homedir).mockReturnValue(fakeHome);
});

afterEach(async () => {
  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('MemoryStore.writeMemory', () => {
  it('writes a user-scope memory file and builds the index', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'user_role',
      description: 'zh-TW full-stack, .NET/Python/Vue',
      type: 'user',
      scope: 'user',
      content: 'Body.',
    });

    const filePath = path.join(fakeHome, '.qwen', 'memory', 'user_role.md');
    const indexPath = path.join(fakeHome, '.qwen', 'memory', 'MEMORY.md');
    const fileContent = await fs.readFile(filePath, 'utf8');
    const indexContent = await fs.readFile(indexPath, 'utf8');

    expect(fileContent).toMatch(/^---\nname: user_role/);
    expect(fileContent).toContain('Body.');
    expect(indexContent).toContain('# Memory Index');
    expect(indexContent).toContain('## User');
    expect(indexContent).toContain('[User Role](./user_role.md)');
    expect(indexContent).toContain('zh-TW full-stack, .NET/Python/Vue');
  });

  it('writes a project-scope memory under the project root', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'project_arch',
      description: 'monorepo with packages/core and packages/cli',
      type: 'project',
      scope: 'project',
      content: 'architecture summary',
    });
    const filePath = path.join(
      projectRoot,
      '.qwen',
      'memory',
      'project_arch.md',
    );
    const indexPath = path.join(projectRoot, '.qwen', 'memory', 'MEMORY.md');
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    await expect(fs.access(indexPath)).resolves.toBeUndefined();
  });

  it('rejects a memory with the reserved name MEMORY', async () => {
    const store = new MemoryStore(projectRoot);
    await expect(
      store.writeMemory({
        name: 'MEMORY',
        description: 'nope',
        type: 'user',
        scope: 'user',
        content: 'x',
      }),
    ).rejects.toBeInstanceOf(MemoryError);
  });

  it('rejects invalid characters in name', async () => {
    const store = new MemoryStore(projectRoot);
    await expect(
      store.writeMemory({
        name: 'bad name/slash',
        description: 'hi',
        type: 'user',
        scope: 'user',
        content: 'x',
      }),
    ).rejects.toBeInstanceOf(MemoryError);
  });

  it('rejects too-long description', async () => {
    const store = new MemoryStore(projectRoot);
    await expect(
      store.writeMemory({
        name: 'long',
        description: 'x'.repeat(201),
        type: 'user',
        scope: 'user',
        content: 'x',
      }),
    ).rejects.toThrow(/description is too long/);
  });

  it('preserves createdAt on update but advances updatedAt', async () => {
    const store = new MemoryStore(projectRoot);
    const first = await store.writeMemory({
      name: 'note',
      description: 'v1',
      type: 'reference',
      scope: 'user',
      content: 'first',
    });
    const createdAt = first.metadata!.createdAt!;
    // Ensure Date.now advances by at least 1ms.
    await new Promise((r) => setTimeout(r, 2));
    const second = await store.writeMemory(
      {
        name: 'note',
        description: 'v2',
        type: 'reference',
        scope: 'user',
        content: 'second',
      },
      { overwrite: true },
    );
    expect(second.metadata!.createdAt).toBe(createdAt);
    expect(second.metadata!.updatedAt).toBeGreaterThanOrEqual(createdAt);
  });

  it('refuses overwrite when overwrite=false', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'dup',
      description: 'a',
      type: 'reference',
      scope: 'user',
      content: 'a',
    });
    await expect(
      store.writeMemory(
        {
          name: 'dup',
          description: 'b',
          type: 'reference',
          scope: 'user',
          content: 'b',
        },
        { overwrite: false },
      ),
    ).rejects.toThrow(/already exists/);
  });
});

describe('MemoryStore.listMemories', () => {
  it('returns empty list when directory absent', async () => {
    const store = new MemoryStore(projectRoot);
    expect(await store.listMemories()).toEqual([]);
  });

  it('project memory shadows user memory with the same name', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'shared',
      description: 'user version',
      type: 'project',
      scope: 'user',
      content: 'u',
    });
    await store.writeMemory({
      name: 'shared',
      description: 'project version',
      type: 'project',
      scope: 'project',
      content: 'p',
    });
    const merged = await store.listMemories({ force: true });
    const one = merged.find((m) => m.name === 'shared');
    expect(one?.description).toBe('project version');
    expect(one?.scope).toBe('project');
  });

  it('filters by agent when requested', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'shared_note',
      description: 'general',
      type: 'reference',
      scope: 'user',
      content: 'x',
    });
    await store.writeMemory({
      name: 'reviewer_note',
      description: 'for reviewer',
      type: 'reference',
      scope: 'user',
      content: 'x',
      agent: 'code-reviewer',
    });
    const forReviewer = await store.listForAgent('code-reviewer');
    expect(forReviewer.map((m) => m.name)).toEqual(['reviewer_note']);
  });
});

describe('MemoryStore.removeMemory', () => {
  it('deletes the file and shrinks the index', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'a',
      description: 'a',
      type: 'reference',
      scope: 'user',
      content: 'a',
    });
    await store.writeMemory({
      name: 'b',
      description: 'b',
      type: 'reference',
      scope: 'user',
      content: 'b',
    });
    await store.removeMemory('a');
    const list = await store.listMemories({ force: true });
    expect(list.map((m) => m.name)).toEqual(['b']);
    const indexContent = await fs.readFile(
      path.join(fakeHome, '.qwen', 'memory', 'MEMORY.md'),
      'utf8',
    );
    expect(indexContent).not.toContain('(./a.md)');
    expect(indexContent).toContain('(./b.md)');
  });

  it('removes the index file when the last memory is removed', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'only',
      description: 'x',
      type: 'reference',
      scope: 'user',
      content: 'x',
    });
    await store.removeMemory('only');
    const indexPath = path.join(fakeHome, '.qwen', 'memory', 'MEMORY.md');
    await expect(fs.access(indexPath)).rejects.toThrow();
  });

  it('throws MemoryError for an unknown name', async () => {
    const store = new MemoryStore(projectRoot);
    await expect(store.removeMemory('ghost')).rejects.toBeInstanceOf(
      MemoryError,
    );
  });
});

describe('MemoryStore.loadIndexContent', () => {
  it('returns discipline-only when no memories exist', async () => {
    const store = new MemoryStore(projectRoot);
    const out = await store.loadIndexContent();
    expect(out).toContain('Memory discipline');
    expect(out).not.toContain('Memory index (');
  });

  it('wraps each scope in context markers', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'u',
      description: 'u',
      type: 'user',
      scope: 'user',
      content: 'u',
    });
    await store.writeMemory({
      name: 'p',
      description: 'p',
      type: 'project',
      scope: 'project',
      content: 'p',
    });
    const out = await store.loadIndexContent();
    expect(out).toContain('--- Memory index (user)');
    expect(out).toContain('--- Memory index (project)');
    expect(out).toContain('[U](./u.md)');
    expect(out).toContain('[P](./p.md)');
  });
});

describe('MemoryStore parse robustness', () => {
  it('skips files with no YAML frontmatter', async () => {
    const baseDir = path.join(fakeHome, '.qwen', 'memory');
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(
      path.join(baseDir, 'broken.md'),
      'not a proper memory\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(baseDir, 'good.md'),
      '---\nname: good\ndescription: g\ntype: reference\nscope: user\n---\n\nbody\n',
      'utf8',
    );
    const store = new MemoryStore(projectRoot);
    const list = await store.listMemories({ force: true });
    expect(list.map((m) => m.name)).toEqual(['good']);
  });
});
