/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { EpisodeListTool } from './episode-list.js';
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

beforeEach(async () => {
  tmpRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-eplist-')),
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

function ep(id: string, overrides: Partial<EpisodeConfig> = {}): EpisodeConfig {
  return {
    id,
    title: `Task ${id}`,
    timestamp: new Date().toISOString(),
    durationMins: 30,
    toolCalls: 20,
    outcome: 'success',
    tags: ['eslint'],
    scores: { novelty: 2, reusability: 2, complexity: 3, outcome: 3 },
    content: `Body ${id}`,
    ...overrides,
  };
}

async function run(
  tool: EpisodeListTool,
  params: Parameters<EpisodeListTool['build']>[0],
) {
  return tool.build(params).execute(new AbortController().signal);
}

describe('episode_list', () => {
  it('returns a "no episodes" notice when empty', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new EpisodeListTool(config);
    const result = await run(tool, {});
    expect(result.returnDisplay).toMatch(/No episodes/);
  });

  it('renders a Markdown table with id/score/outcome/tags', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(ep('2026-04-22-0900-a'));
    await store.writeEpisode(ep('2026-04-22-0800-b'));

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new EpisodeListTool(config);
    const result = await run(tool, {});
    const content = String(result.llmContent);
    expect(content).toContain('| id |');
    expect(content).toContain('2026-04-22-0900-a');
    expect(content).toContain('2026-04-22-0800-b');
    expect(content).toContain('success');
  });

  it('honors minScore filter', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      ep('hi', {
        scores: { novelty: 3, reusability: 3, complexity: 3, outcome: 3 },
        timestamp: '2026-04-22T10:00:00Z',
      }),
    );
    await store.writeEpisode(
      ep('lo', {
        scores: { novelty: 0, reusability: 0, complexity: 1, outcome: 0 },
        timestamp: '2026-04-22T09:00:00Z',
      }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new EpisodeListTool(config);
    const result = await run(tool, { minScore: 9 });
    const content = String(result.llmContent);
    expect(content).toContain('hi');
    expect(content).not.toContain('Task lo');
  });

  it('honors tag filter', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      ep('with', { tags: ['docker'], timestamp: '2026-04-22T10:00:00Z' }),
    );
    await store.writeEpisode(
      ep('without', { tags: ['other'], timestamp: '2026-04-22T09:00:00Z' }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new EpisodeListTool(config);
    const result = await run(tool, { tag: 'docker' });
    const content = String(result.llmContent);
    expect(content).toContain('with');
    expect(content).not.toContain('Task without');
  });

  it('honors outcome filter', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      ep('winner', {
        outcome: 'success',
        timestamp: '2026-04-22T10:00:00Z',
      }),
    );
    await store.writeEpisode(
      ep('loser', {
        outcome: 'failed',
        timestamp: '2026-04-22T09:00:00Z',
      }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new EpisodeListTool(config);
    const result = await run(tool, { outcome: 'failed' });
    const content = String(result.llmContent);
    expect(content).toContain('loser');
    expect(content).not.toContain('Task winner');
  });
});
