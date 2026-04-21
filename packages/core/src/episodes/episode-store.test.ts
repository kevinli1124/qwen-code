/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { EpisodeStore } from './episode-store.js';
import { EpisodeError, type EpisodeConfig } from './types.js';

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: vi.fn(() => actual.homedir()),
  };
});

let tmpRoot: string;
let fakeHome: string;

async function setupDirs() {
  tmpRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-ep-')),
  );
  fakeHome = path.join(tmpRoot, 'home');
  await fs.mkdir(fakeHome, { recursive: true });
}

function baseCfg(
  id: string,
  overrides: Partial<EpisodeConfig> = {},
): EpisodeConfig {
  return {
    id,
    title: 'Sample task',
    timestamp: new Date('2026-04-21T22:30:00Z').toISOString(),
    durationMins: 45,
    toolCalls: 20,
    outcome: 'success',
    tags: ['eslint', 'monorepo'],
    scores: {
      novelty: 2,
      reusability: 2,
      complexity: 3,
      outcome: 3,
    },
    toolStats: [
      { name: 'read_file', count: 10 },
      { name: 'edit', count: 8 },
    ],
    filesTouched: ['/tmp/a.ts', '/tmp/b.ts'],
    content: 'Body of the episode.',
    ...overrides,
  };
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

describe('EpisodeStore.writeEpisode', () => {
  it('writes a file under ~/.qwen/episodes/ with correct frontmatter', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(baseCfg('2026-04-21-eslint'));

    const filePath = path.join(
      fakeHome,
      '.qwen',
      'episodes',
      '2026-04-21-eslint.md',
    );
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toMatch(/^---\nid: 2026-04-21-eslint/);
    expect(content).toContain('outcome: success');
    expect(content).toContain('tags:');
    expect(content).toContain('- eslint');
    expect(content).toContain('- monorepo');
    expect(content).toContain('scores:');
    expect(content).toContain('novelty: 2');
    expect(content).toContain('Body of the episode.');
  });

  it('rejects duplicate id without overwrite flag', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(baseCfg('dup-id'));
    await expect(
      store.writeEpisode(baseCfg('dup-id', { title: 'different' })),
    ).rejects.toBeInstanceOf(EpisodeError);
  });

  it('overwrites when overwrite=true and preserves createdAt', async () => {
    const store = new EpisodeStore();
    const first = await store.writeEpisode(baseCfg('ep-1'));
    const createdAt = first.metadata?.createdAt;
    expect(createdAt).toBeDefined();

    // Small delay so timestamps differ.
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.writeEpisode(
      baseCfg('ep-1', { title: 'updated' }),
      { overwrite: true },
    );
    expect(second.metadata?.createdAt).toBe(createdAt);
    expect(second.title).toBe('updated');
  });

  it('rejects invalid shape', async () => {
    const store = new EpisodeStore();
    await expect(
      store.writeEpisode(baseCfg('bad', { title: '' })),
    ).rejects.toBeInstanceOf(EpisodeError);
    await expect(
      store.writeEpisode(
        baseCfg('bad2', {
          scores: { novelty: 4, reusability: 0, complexity: 0, outcome: 0 },
        }),
      ),
    ).rejects.toBeInstanceOf(EpisodeError);
    await expect(
      store.writeEpisode(baseCfg('bad/3', { id: 'bad/3' })),
    ).rejects.toBeInstanceOf(EpisodeError);
  });
});

describe('EpisodeStore.listEpisodes', () => {
  it('returns an empty array when directory is absent', async () => {
    const store = new EpisodeStore();
    const list = await store.listEpisodes();
    expect(list).toEqual([]);
  });

  it('lists written episodes sorted newest first', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      baseCfg('a', { timestamp: '2026-04-20T10:00:00Z' }),
    );
    await store.writeEpisode(
      baseCfg('b', { timestamp: '2026-04-21T10:00:00Z' }),
    );
    await store.writeEpisode(
      baseCfg('c', { timestamp: '2026-04-19T10:00:00Z' }),
    );

    const list = await store.listEpisodes();
    expect(list.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('filters by outcome, tags, minScore, sinceIso', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      baseCfg('hi', {
        outcome: 'success',
        scores: { novelty: 3, reusability: 3, complexity: 3, outcome: 3 },
        timestamp: '2026-04-21T10:00:00Z',
        tags: ['eslint'],
      }),
    );
    await store.writeEpisode(
      baseCfg('mid', {
        outcome: 'partial',
        scores: { novelty: 1, reusability: 1, complexity: 2, outcome: 2 },
        timestamp: '2026-04-20T10:00:00Z',
        tags: ['typescript'],
      }),
    );
    await store.writeEpisode(
      baseCfg('lo', {
        outcome: 'failed',
        scores: { novelty: 0, reusability: 0, complexity: 1, outcome: 0 },
        timestamp: '2026-04-19T10:00:00Z',
        tags: ['eslint', 'windows'],
      }),
    );

    expect(
      (await store.listEpisodes({ outcome: 'success' })).map((e) => e.id),
    ).toEqual(['hi']);

    expect(
      (await store.listEpisodes({ tags: ['eslint'] })).map((e) => e.id).sort(),
    ).toEqual(['hi', 'lo']);

    expect(
      (await store.listEpisodes({ minScore: 9 })).map((e) => e.id),
    ).toEqual(['hi']);

    expect(
      (await store.listEpisodes({ sinceIso: '2026-04-20T00:00:00Z' }))
        .map((e) => e.id)
        .sort(),
    ).toEqual(['hi', 'mid']);
  });
});

describe('EpisodeStore.removeEpisode', () => {
  it('removes a file and refreshes the cache', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(baseCfg('kill-me'));
    expect((await store.listEpisodes()).map((e) => e.id)).toContain('kill-me');
    await store.removeEpisode('kill-me');
    expect((await store.listEpisodes()).map((e) => e.id)).not.toContain(
      'kill-me',
    );
  });

  it('throws when id does not exist', async () => {
    const store = new EpisodeStore();
    await expect(store.removeEpisode('ghost')).rejects.toBeInstanceOf(
      EpisodeError,
    );
  });
});

describe('EpisodeStore.archiveExpired', () => {
  it('is a no-op when retentionDays <= 0', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      baseCfg('old', { timestamp: '2020-01-01T00:00:00Z' }),
    );
    const moved = await store.archiveExpired(0);
    expect(moved).toBe(0);
  });

  it('moves expired episodes into archived/ subdir', async () => {
    const store = new EpisodeStore();
    await store.writeEpisode(
      baseCfg('old', { timestamp: '2020-01-01T00:00:00Z' }),
    );
    await store.writeEpisode(baseCfg('new'));

    const moved = await store.archiveExpired(30);
    expect(moved).toBe(1);

    const archivedDir = path.join(fakeHome, '.qwen', 'episodes', 'archived');
    const archivedFiles = await fs.readdir(archivedDir);
    expect(archivedFiles).toContain('old.md');

    const remaining = await store.listEpisodes({ force: true });
    expect(remaining.map((e) => e.id)).toEqual(['new']);
  });
});

describe('EpisodeStore parsing', () => {
  it('skips invalid files gracefully', async () => {
    const store = new EpisodeStore();
    const baseDir = path.join(fakeHome, '.qwen', 'episodes');
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(
      path.join(baseDir, 'broken.md'),
      'no frontmatter here',
      'utf8',
    );
    await store.writeEpisode(baseCfg('ok'));

    const list = await store.listEpisodes({ force: true });
    expect(list.map((e) => e.id)).toEqual(['ok']);
  });
});
