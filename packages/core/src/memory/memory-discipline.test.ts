/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Verifies the memory discipline block — the always-on guidance that teaches
 * agents when to save / not save / how to structure memory entries.
 *
 * Rationale: discipline text drift is a real risk (someone edits the string,
 * drops a rule, and quietly degrades memory quality). Lock in the key rules
 * as test assertions so any drop is caught.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { MemoryStore } from './memory-store.js';

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
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-disc-')),
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

describe('Memory discipline', () => {
  it('is present even with zero memories', async () => {
    const out = await new MemoryStore(projectRoot).loadIndexContent();
    expect(out.startsWith('--- Memory discipline ---')).toBe(true);
    expect(out.includes('--- End memory discipline ---')).toBe(true);
  });

  it('keeps the token cost under the 800-token budget', async () => {
    const out = await new MemoryStore(projectRoot).loadIndexContent();
    // Rough byte-count proxy for token budget — discipline should stay small.
    // At ~4 chars / token this gives ~3200 byte ceiling; we aim well under.
    expect(out.length).toBeLessThan(3200);
  });

  it('lists save triggers for every memory type', async () => {
    const out = await new MemoryStore(projectRoot).loadIndexContent();
    // Every declared MemoryType must get a mention in the "save proactively"
    // section so the agent knows what kind to pick.
    for (const type of [
      'user',
      'feedback',
      'project',
      'decision',
      'reference',
    ]) {
      expect(out).toContain(type);
    }
  });

  it('names the concrete tool to call', async () => {
    const out = await new MemoryStore(projectRoot).loadIndexContent();
    expect(out).toContain('memory_write');
  });

  it('lists the do-NOT-save categories', async () => {
    const out = await new MemoryStore(projectRoot).loadIndexContent();
    // Each exclusion category should be mentioned by name so the rule is concrete.
    expect(out).toMatch(/file paths|architecture/i);
    expect(out).toMatch(/git (log|history)/i);
    expect(out).toMatch(/QWEN\.md/);
    expect(out).toMatch(/task state|plan \/ tasks/i);
  });

  it('teaches the Why / How to apply structure for feedback entries', async () => {
    const out = await new MemoryStore(projectRoot).loadIndexContent();
    expect(out).toContain('**Why:**');
    expect(out).toContain('**How to apply:**');
  });

  it('warns that recalled memory may be stale', async () => {
    const out = await new MemoryStore(projectRoot).loadIndexContent();
    expect(out).toMatch(/stale|frozen in time/i);
  });

  it('precedes the per-scope index blocks', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'user_role',
      description: 'test',
      type: 'user',
      scope: 'user',
      content: 'body',
    });
    const out = await store.loadIndexContent();
    const disciplineIdx = out.indexOf('--- Memory discipline ---');
    const indexIdx = out.indexOf('--- Memory index (user)');
    expect(disciplineIdx).toBeGreaterThanOrEqual(0);
    expect(indexIdx).toBeGreaterThan(disciplineIdx);
  });
});
