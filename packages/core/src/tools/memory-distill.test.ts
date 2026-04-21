/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for memory_distill. The tool returns a formatted review prompt — no
 * LLM is invoked, so assertions can target the exact content surfaced.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { MemoryDistillTool, buildDistillPrompt } from './memory-distill.js';
import { EpisodeStore } from '../episodes/episode-store.js';
import type { EpisodeConfig } from '../episodes/types.js';
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

async function setupDirs() {
  tmpRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-distill-')),
  );
  fakeHome = path.join(tmpRoot, 'home');
  projectRoot = path.join(tmpRoot, 'project');
  await fs.mkdir(fakeHome, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
}

function ep(id: string, overrides: Partial<EpisodeConfig> = {}): EpisodeConfig {
  return {
    id,
    title: `Fix ${id}`,
    timestamp: new Date().toISOString(),
    durationMins: 30,
    toolCalls: 20,
    outcome: 'success',
    tags: ['eslint', 'monorepo'],
    scores: { novelty: 2, reusability: 2, complexity: 3, outcome: 3 },
    toolStats: [
      { name: 'read_file', count: 10 },
      { name: 'edit', count: 10 },
    ],
    filesTouched: ['/tmp/a.ts', '/tmp/b.ts'],
    content: `Body for ${id} — describes what the agent did.`,
    ...overrides,
  };
}

async function run(
  tool: MemoryDistillTool,
  params: Parameters<MemoryDistillTool['build']>[0],
) {
  const invocation = tool.build(params);
  return invocation.execute(new AbortController().signal);
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

describe('memory_distill — empty state', () => {
  it('returns a helpful message when no episodes exist', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryDistillTool(config);

    const result = await run(tool, {});
    expect(result.returnDisplay).toMatch(/No episodes/);
    expect(result.llmContent).toMatch(/episodes are written automatically/);
  });
});

describe('memory_distill — with episodes', () => {
  it('includes each episode title, stats and body in the prompt', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(ep('2026-04-22-0900-alpha'));
    await store.writeEpisode(ep('2026-04-22-0800-beta'));
    await store.writeEpisode(ep('2026-04-22-0700-gamma'));

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryDistillTool(config);

    const result = await run(tool, { count: 3 });
    expect(result.returnDisplay).toMatch(/Distilling 3 episodes/);
    const content = String(result.llmContent);
    expect(content).toContain('alpha');
    expect(content).toContain('beta');
    expect(content).toContain('gamma');
    expect(content).toContain('tool calls');
    expect(content).toContain('Body for 2026-04-22-0900-alpha');
  });

  it('honors count parameter (most recent first)', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      ep('2026-04-22-0900-newer', { timestamp: '2026-04-22T09:00:00Z' }),
    );
    await store.writeEpisode(
      ep('2026-04-21-0900-older', { timestamp: '2026-04-21T09:00:00Z' }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryDistillTool(config);

    const result = await run(tool, { count: 1 });
    const content = String(result.llmContent);
    expect(content).toContain('newer');
    expect(content).not.toContain('older');
  });

  it('filters by minScore', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      ep('hi', {
        scores: { novelty: 3, reusability: 3, complexity: 3, outcome: 3 },
        timestamp: '2026-04-22T09:00:00Z',
      }),
    );
    await store.writeEpisode(
      ep('lo', {
        scores: { novelty: 1, reusability: 0, complexity: 1, outcome: 0 },
        timestamp: '2026-04-21T09:00:00Z',
      }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryDistillTool(config);

    const result = await run(tool, { minScore: 9 });
    const content = String(result.llmContent);
    expect(content).toContain('hi');
    expect(content).not.toContain('Fix lo');
  });

  it('filters by since', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(ep('old', { timestamp: '2025-01-01T00:00:00Z' }));
    await store.writeEpisode(ep('new', { timestamp: '2026-04-22T00:00:00Z' }));

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryDistillTool(config);

    const result = await run(tool, { since: '2026-01-01T00:00:00Z' });
    const content = String(result.llmContent);
    expect(content).toContain('new');
    expect(content).not.toContain('Fix old');
  });

  it('filters by tag', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      ep('with-tag', { tags: ['eslint'], timestamp: '2026-04-22T10:00:00Z' }),
    );
    await store.writeEpisode(
      ep('no-tag', { tags: ['webpack'], timestamp: '2026-04-22T09:00:00Z' }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryDistillTool(config);

    const result = await run(tool, { tag: 'eslint' });
    const content = String(result.llmContent);
    expect(content).toContain('with-tag');
    expect(content).not.toContain('Fix no-tag');
  });

  it('caps count at 20', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new MemoryDistillTool(config);
    const invocation = tool.build({ count: 999 });
    expect(invocation.getDescription()).toMatch(/count=20/);
  });
});

describe('buildDistillPrompt', () => {
  it('renders the memory-index header as empty when none provided', () => {
    const out = buildDistillPrompt([], '');
    expect(out).toContain('(empty — no memories saved yet)');
  });

  it('includes the existing memory index verbatim', () => {
    const out = buildDistillPrompt([], '# Memory Index\n\n- foo');
    expect(out).toContain('# Memory Index');
    expect(out).toContain('- foo');
  });

  it('emits the final hint about not fabricating memories', () => {
    const out = buildDistillPrompt([ep('any')], '');
    expect(out).toMatch(/do not fabricate memories/i);
  });

  it('uses "episode" (singular) when exactly one', () => {
    const out = buildDistillPrompt([ep('only')], '');
    expect(out).toContain('reviewing 1 recent episode to decide');
  });
});
