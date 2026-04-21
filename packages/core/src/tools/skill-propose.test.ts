/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SkillProposeTool, buildSkillProposalPrompt } from './skill-propose.js';
import { EpisodeStore } from '../episodes/episode-store.js';
import type { EpisodeConfig } from '../episodes/types.js';
import type { SkillConfig } from '../skills/types.js';
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
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-skill-propose-')),
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

function highScoreEp(
  id: string,
  overrides: Partial<EpisodeConfig> = {},
): EpisodeConfig {
  return {
    id,
    title: `High score ${id}`,
    timestamp: new Date().toISOString(),
    durationMins: 30,
    toolCalls: 20,
    outcome: 'success',
    tags: ['eslint'],
    scores: { novelty: 3, reusability: 3, complexity: 3, outcome: 3 },
    content: `body ${id}`,
    ...overrides,
  };
}

async function run(
  tool: SkillProposeTool,
  params: Parameters<SkillProposeTool['build']>[0],
) {
  const invocation = tool.build(params);
  return invocation.execute(new AbortController().signal);
}

describe('skill_propose — empty state', () => {
  it('returns helpful message when no episodes qualify', async () => {
    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillProposeTool(config);

    const result = await run(tool, {});
    expect(result.returnDisplay).toMatch(/No qualifying/);
    expect(result.llmContent).toMatch(/Skills should only be promoted/);
  });
});

describe('skill_propose — with qualifying episodes', () => {
  it('surfaces only episodes meeting minScore', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      highScoreEp('hi-1', { timestamp: '2026-04-22T10:00:00Z' }),
    );
    await store.writeEpisode(
      highScoreEp('low-1', {
        scores: { novelty: 0, reusability: 0, complexity: 0, outcome: 0 },
        timestamp: '2026-04-22T09:00:00Z',
      }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillProposeTool(config);

    const result = await run(tool, {});
    const content = String(result.llmContent);
    expect(content).toContain('hi-1');
    expect(content).not.toContain('High score low-1');
  });

  it('honors count parameter', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      highScoreEp('a', { timestamp: '2026-04-22T10:00:00Z' }),
    );
    await store.writeEpisode(
      highScoreEp('b', { timestamp: '2026-04-22T09:00:00Z' }),
    );
    await store.writeEpisode(
      highScoreEp('c', { timestamp: '2026-04-22T08:00:00Z' }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillProposeTool(config);

    const result = await run(tool, { count: 1 });
    const content = String(result.llmContent);
    expect(content).toContain('a');
    expect(content).not.toContain('High score b');
    expect(content).not.toContain('High score c');
  });

  it('lowered minScore widens selection', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      highScoreEp('mid', {
        scores: { novelty: 2, reusability: 2, complexity: 1, outcome: 1 },
      }),
    );

    const config = makeFakeConfig({ cwd: projectRoot, targetDir: projectRoot });
    const tool = new SkillProposeTool(config);

    const defaultResult = await run(tool, {});
    expect(defaultResult.returnDisplay).toMatch(/No qualifying/);

    const wideResult = await run(tool, { minScore: 6 });
    expect(wideResult.returnDisplay).toMatch(/Proposing/);
  });
});

describe('buildSkillProposalPrompt', () => {
  it('shows "(none yet)" when no existing skills', () => {
    const prompt = buildSkillProposalPrompt([highScoreEp('x')], []);
    expect(prompt).toContain('(none yet)');
  });

  it('lists existing skills with their levels', () => {
    const existing: SkillConfig[] = [
      {
        name: 'foo',
        description: 'foo hook',
        level: 'user',
        filePath: '/fake/foo/SKILL.md',
        body: '',
      },
    ];
    const prompt = buildSkillProposalPrompt([highScoreEp('x')], existing);
    expect(prompt).toContain('**foo** (user): foo hook');
  });

  it('emits the three-option suggestion in the rules', () => {
    const prompt = buildSkillProposalPrompt([highScoreEp('x')], []);
    expect(prompt).toContain('[merge]');
    expect(prompt).toContain('[new]');
    expect(prompt).toContain('[cancel]');
  });

  it('renders SKILL.md schema block', () => {
    const prompt = buildSkillProposalPrompt([highScoreEp('x')], []);
    expect(prompt).toContain('SKILL.md schema');
    expect(prompt).toContain('name: <kebab-case-slug>');
  });
});
