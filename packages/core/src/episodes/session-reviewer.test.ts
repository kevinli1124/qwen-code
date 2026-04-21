/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { Content } from '@google/genai';
import {
  SessionReviewer,
  analyseTurn,
  buildEpisode,
  meetsLongTaskThreshold,
  scoreHeuristically,
  DEFAULT_EPISODE_SETTINGS,
  type TurnSummary,
} from './session-reviewer.js';
import { EpisodeStore } from './episode-store.js';

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
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-sr-')),
  );
  fakeHome = path.join(tmpRoot, 'home');
  await fs.mkdir(fakeHome, { recursive: true });
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

function modelWithToolCalls(
  calls: Array<{ name: string; args?: Record<string, unknown> }>,
  text?: string,
): Content {
  const parts: unknown[] = calls.map((c) => ({
    functionCall: { name: c.name, args: c.args ?? {} },
  }));
  if (text) parts.push({ text });
  return { role: 'model', parts: parts as Content['parts'] };
}

function makeSummary(overrides: Partial<TurnSummary> = {}): TurnSummary {
  const startedAt = Date.parse('2026-04-21T22:30:00Z');
  return {
    history: [
      { role: 'user', parts: [{ text: 'fix the lint errors' }] },
      modelWithToolCalls([]),
    ],
    turnStartIndex: 0,
    turnStartedAt: startedAt,
    turnEndedAt: startedAt + 5 * 60 * 1000,
    completedNormally: true,
    ...overrides,
  };
}

// ─── analyseTurn ───────────────────────────────────────────────

describe('analyseTurn', () => {
  it('counts tool calls and distinct tools', () => {
    const s = makeSummary({
      history: [
        { role: 'user', parts: [{ text: 'hi' }] },
        modelWithToolCalls([
          { name: 'read_file', args: { file_path: '/a.ts' } },
          { name: 'read_file', args: { file_path: '/b.ts' } },
          { name: 'edit', args: { file_path: '/a.ts' } },
        ]),
      ],
    });

    const stats = analyseTurn(s);
    expect(stats.toolCalls).toBe(3);
    expect(stats.toolStats).toEqual([
      { name: 'read_file', count: 2 },
      { name: 'edit', count: 1 },
    ]);
    expect(stats.filesTouched).toEqual(['/a.ts', '/b.ts']);
  });

  it('captures last assistant text as tail', () => {
    const s = makeSummary({
      history: [
        { role: 'user', parts: [{ text: 'hi' }] },
        modelWithToolCalls([], 'first response'),
        modelWithToolCalls([], 'final summary here'),
      ],
    });
    const stats = analyseTurn(s);
    expect(stats.assistantTextTail).toBe('final summary here');
  });

  it('ignores history before turnStartIndex', () => {
    const s = makeSummary({
      history: [
        modelWithToolCalls([{ name: 'prior_tool' }]),
        { role: 'user', parts: [{ text: 'new turn' }] },
        modelWithToolCalls([{ name: 'read_file', args: { file_path: '/x' } }]),
      ],
      turnStartIndex: 1,
    });
    const stats = analyseTurn(s);
    expect(stats.toolStats.map((t) => t.name)).toEqual(['read_file']);
  });

  it('computes duration and outcome from summary', () => {
    const s = makeSummary({
      turnStartedAt: 1000,
      turnEndedAt: 61_000,
      completedNormally: false,
    });
    const stats = analyseTurn(s);
    expect(stats.durationMs).toBe(60_000);
    expect(stats.outcome).toBe('partial');
  });

  it('derives tags from tool names, extensions, and keywords', () => {
    const s = makeSummary({
      history: [
        { role: 'user', parts: [{ text: 'fix eslint' }] },
        modelWithToolCalls(
          [
            { name: 'read_file', args: { file_path: '/a.ts' } },
            { name: 'edit', args: { file_path: '/a.ts' } },
            { name: 'edit', args: { file_path: '/b.tsx' } },
          ],
          'Fixed the eslint monorepo configuration.',
        ),
      ],
    });
    const stats = analyseTurn(s);
    expect(stats.tags).toContain('read-file');
    expect(stats.tags).toContain('ts');
    expect(stats.tags).toContain('eslint');
    expect(stats.tags).toContain('monorepo');
  });
});

// ─── Scoring & thresholds ──────────────────────────────────────

describe('scoreHeuristically', () => {
  it('returns low complexity for few tool calls', () => {
    const scores = scoreHeuristically({
      toolCalls: 3,
      toolStats: [{ name: 'x', count: 3 }],
      filesTouched: [],
      tags: [],
      durationMs: 1000,
      assistantTextTail: '',
      outcome: 'success',
    });
    expect(scores.complexity).toBe(1);
    expect(scores.outcome).toBe(3);
  });

  it('returns high complexity for many tool calls', () => {
    const scores = scoreHeuristically({
      toolCalls: 40,
      toolStats: [
        { name: 'read_file', count: 20 },
        { name: 'edit', count: 20 },
      ],
      filesTouched: ['/a', '/b', '/c', '/d'],
      tags: [],
      durationMs: 1000,
      assistantTextTail: '',
      outcome: 'failed',
    });
    expect(scores.complexity).toBe(3);
    expect(scores.outcome).toBe(0);
    expect(scores.reusability).toBeGreaterThanOrEqual(2);
  });
});

describe('meetsLongTaskThreshold', () => {
  it('returns true when tool calls exceed threshold', () => {
    const s = {
      toolCalls: 20,
      toolStats: [],
      filesTouched: [],
      tags: [],
      durationMs: 0,
      assistantTextTail: '',
      outcome: 'success' as const,
    };
    expect(meetsLongTaskThreshold(s, DEFAULT_EPISODE_SETTINGS)).toBe(true);
  });

  it('returns true when duration exceeds threshold', () => {
    const s = {
      toolCalls: 2,
      toolStats: [],
      filesTouched: [],
      tags: [],
      durationMs: 25 * 60 * 1000,
      assistantTextTail: '',
      outcome: 'success' as const,
    };
    expect(meetsLongTaskThreshold(s, DEFAULT_EPISODE_SETTINGS)).toBe(true);
  });

  it('returns false when both under threshold', () => {
    const s = {
      toolCalls: 3,
      toolStats: [],
      filesTouched: [],
      tags: [],
      durationMs: 1000,
      assistantTextTail: '',
      outcome: 'success' as const,
    };
    expect(meetsLongTaskThreshold(s, DEFAULT_EPISODE_SETTINGS)).toBe(false);
  });
});

// ─── buildEpisode ─────────────────────────────────────────────

describe('buildEpisode', () => {
  it('produces a valid EpisodeConfig', () => {
    const summary = makeSummary({
      history: [
        { role: 'user', parts: [{ text: 'hi' }] },
        modelWithToolCalls(
          Array.from({ length: 20 }, () => ({
            name: 'read_file',
            args: { file_path: '/a.ts' },
          })),
          'Refactored the eslint configuration successfully.',
        ),
      ],
    });
    const stats = analyseTurn(summary);
    const ep = buildEpisode(summary, stats);
    expect(ep.id).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-/);
    expect(ep.toolCalls).toBe(20);
    expect(ep.tags).toContain('eslint');
    expect(ep.content).toContain('tool calls: 20');
  });
});

// ─── SessionReviewer.maybeCapture ─────────────────────────────

describe('SessionReviewer.maybeCapture', () => {
  it('skips when autoCapture=off', async () => {
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      ...DEFAULT_EPISODE_SETTINGS,
      autoCapture: 'off',
    });
    const result = await reviewer.maybeCapture(makeSummary());
    expect(result.kind).toBe('skipped');
  });

  it('skips short tasks under threshold', async () => {
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      ...DEFAULT_EPISODE_SETTINGS,
      autoCapture: 'auto',
    });
    const result = await reviewer.maybeCapture(makeSummary());
    expect(result.kind).toBe('skipped');
  });

  it('writes episode on auto when threshold met', async () => {
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      ...DEFAULT_EPISODE_SETTINGS,
      autoCapture: 'auto',
    });
    const summary = makeSummary({
      history: [
        { role: 'user', parts: [{ text: 'hi' }] },
        modelWithToolCalls(
          Array.from({ length: 20 }, () => ({
            name: 'read_file',
            args: { file_path: '/a.ts' },
          })),
          'Done.',
        ),
      ],
    });
    const result = await reviewer.maybeCapture(summary);
    expect(result.kind).toBe('written');
  });

  it('emits distillSuggestion after 5+ episodes', async () => {
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      ...DEFAULT_EPISODE_SETTINGS,
      autoCapture: 'auto',
    });

    // Write 5 qualifying turns back-to-back. Each produces a distinct
    // timestamp-based id so the store accepts all of them.
    let lastSuggestion: { episodeCount: number } | undefined;
    for (let i = 0; i < 5; i++) {
      const startedAt = Date.parse('2026-04-22T09:00:00Z') + i * 60_000;
      const summary = {
        history: [
          { role: 'user', parts: [{ text: `task ${i}` }] },
          modelWithToolCalls(
            Array.from({ length: 20 }, () => ({
              name: 'read_file',
              args: { file_path: `/f${i}.ts` },
            })),
            `Summary ${i}`,
          ),
        ] as TurnSummary['history'],
        turnStartIndex: 0,
        turnStartedAt: startedAt,
        turnEndedAt: startedAt + 21 * 60 * 1000,
        completedNormally: true,
      };
      const result = await reviewer.maybeCapture(summary);
      expect(result.kind).toBe('written');
      if (result.kind === 'written' && result.distillSuggestion) {
        lastSuggestion = result.distillSuggestion;
      }
    }

    expect(lastSuggestion).toBeDefined();
    expect(lastSuggestion?.episodeCount).toBeGreaterThanOrEqual(5);
  });

  it('emits skillProposal with trigger=high_score when episode scores 9+/12', async () => {
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      ...DEFAULT_EPISODE_SETTINGS,
      autoCapture: 'auto',
    });

    const startedAt = Date.parse('2026-04-22T09:00:00Z');
    const summary = {
      history: [
        { role: 'user', parts: [{ text: 'big task' }] },
        modelWithToolCalls(
          Array.from({ length: 40 }, () => ({
            name: 'read_file',
            args: { file_path: '/a.ts' },
          })),
          'Refactored the eslint configuration successfully.',
        ),
      ] as TurnSummary['history'],
      turnStartIndex: 0,
      turnStartedAt: startedAt,
      turnEndedAt: startedAt + 25 * 60 * 1000,
      completedNormally: true,
    };
    const result = await reviewer.maybeCapture(summary);
    expect(result.kind).toBe('written');
    if (result.kind === 'written') {
      expect(result.skillProposal).toBeDefined();
      expect(result.skillProposal?.trigger).toBe('high_score');
      expect(result.skillProposal?.episodeScore).toBeGreaterThanOrEqual(9);
    }
  });

  it('does not emit distillSuggestion when below threshold', async () => {
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      ...DEFAULT_EPISODE_SETTINGS,
      autoCapture: 'auto',
    });

    const startedAt = Date.parse('2026-04-22T09:00:00Z');
    const summary = {
      history: [
        { role: 'user', parts: [{ text: 'one' }] },
        modelWithToolCalls(
          Array.from({ length: 20 }, () => ({
            name: 'read_file',
            args: { file_path: '/a.ts' },
          })),
          'Summary',
        ),
      ] as TurnSummary['history'],
      turnStartIndex: 0,
      turnStartedAt: startedAt,
      turnEndedAt: startedAt + 21 * 60 * 1000,
      completedNormally: true,
    };
    const result = await reviewer.maybeCapture(summary);
    expect(result.kind).toBe('written');
    if (result.kind === 'written') {
      expect(result.distillSuggestion).toBeUndefined();
    }
  });

  it('returns pending on ask when threshold met', async () => {
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      ...DEFAULT_EPISODE_SETTINGS,
      autoCapture: 'ask',
    });
    const summary = makeSummary({
      history: [
        { role: 'user', parts: [{ text: 'hi' }] },
        modelWithToolCalls(
          Array.from({ length: 20 }, () => ({
            name: 'edit',
            args: { file_path: '/a.ts' },
          })),
          'Done.',
        ),
      ],
    });
    const result = await reviewer.maybeCapture(summary);
    expect(result.kind).toBe('pending');
    if (result.kind === 'pending') {
      const written = await reviewer.writeCandidate(result.candidate);
      expect(written.id).toBe(result.candidate.id);
    }
  });
});
