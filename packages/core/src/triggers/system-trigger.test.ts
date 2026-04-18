/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { SystemTrigger, type GitRunner } from './system-trigger.js';
import type { TriggerConfig } from './types.js';
import { TriggerError } from './types.js';

function makeConfig(overrides: Partial<TriggerConfig> = {}): TriggerConfig {
  return {
    id: 'watch-head',
    name: 'Watch HEAD',
    kind: 'system',
    enabled: true,
    agentRef: 'commit-reviewer',
    spec: { event: 'git', on: 'commit', pollMs: 1000 },
    ...overrides,
  };
}

function makeRunner(
  sequence: Array<{ head?: string; branch?: string }>,
): GitRunner {
  let idx = 0;
  return {
    async headSha(): Promise<string | null> {
      const v = sequence[idx]?.head;
      if (idx < sequence.length - 1) idx++;
      return v ?? null;
    },
    async currentBranch(): Promise<string | null> {
      const v = sequence[idx]?.branch;
      if (idx < sequence.length - 1) idx++;
      return v ?? null;
    },
  };
}

const fakeDeps = { cronScheduler: {} as never };

describe('SystemTrigger validate', () => {
  it('rejects non-git events', () => {
    const t = new SystemTrigger(
      makeConfig({
        spec: { event: 'process' as unknown as 'git', on: 'commit' },
      }),
      fakeDeps,
    );
    expect(() => t.validate()).toThrow(TriggerError);
  });

  it('rejects missing `on`', () => {
    const t = new SystemTrigger(
      makeConfig({
        spec: { event: 'git', on: 'push' as unknown as 'commit' },
      }),
      fakeDeps,
    );
    expect(() => t.validate()).toThrow(/commit/);
  });

  it('rejects pollMs below minimum', () => {
    const t = new SystemTrigger(
      makeConfig({ spec: { event: 'git', on: 'commit', pollMs: 500 } }),
      fakeDeps,
    );
    expect(() => t.validate()).toThrow(/pollMs/);
  });

  it('accepts valid spec', () => {
    const t = new SystemTrigger(makeConfig(), fakeDeps);
    expect(() => t.validate()).not.toThrow();
  });
});

describe('SystemTrigger tick (commit mode)', () => {
  it('first tick just bootstraps — does not fire', async () => {
    const runner = makeRunner([{ head: 'abc' }]);
    const t = new SystemTrigger(makeConfig(), fakeDeps, runner);
    const onFire = vi.fn();
    t.validate();
    t.start(onFire);
    t.stop(); // stop the interval so only explicit tick runs
    await t.tick(); // no-op after stop (onFire cleared), restart manually
    expect(onFire).not.toHaveBeenCalled();
  });

  it('fires with { previous, current } when HEAD changes', async () => {
    const runner = makeRunner([{ head: 'abc' }, { head: 'def' }]);
    const t = new SystemTrigger(makeConfig(), fakeDeps, runner);
    const onFire = vi.fn();
    t.validate();
    t.start(onFire);
    t.stop();
    t.start(onFire);
    // Rely on the deliberate tick called inside start()
    await flush();
    // call tick one more time with the next HEAD
    await t.tick();
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire.mock.calls[0][0].payload).toMatchObject({
      event: 'commit',
      previous: 'abc',
      current: 'def',
    });
  });

  it('does not fire when HEAD is unchanged', async () => {
    const runner = makeRunner([{ head: 'abc' }, { head: 'abc' }]);
    const t = new SystemTrigger(makeConfig(), fakeDeps, runner);
    const onFire = vi.fn();
    t.validate();
    t.start(onFire);
    t.stop();
    t.start(onFire);
    await flush();
    await t.tick();
    expect(onFire).not.toHaveBeenCalled();
  });

  it('survives transient git failures without firing', async () => {
    const runner: GitRunner = {
      headSha: vi
        .fn()
        .mockResolvedValueOnce('abc')
        .mockRejectedValueOnce(new Error('not a git repo'))
        .mockResolvedValueOnce('def'),
      currentBranch: async () => null,
    };
    const t = new SystemTrigger(makeConfig(), fakeDeps, runner);
    const onFire = vi.fn();
    t.validate();
    t.stop();
    t.start(onFire);
    await flush();
    // second tick: git fails; trigger should swallow
    await t.tick();
    expect(onFire).not.toHaveBeenCalled();
    // third tick: new head reappears → fire
    await t.tick();
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire.mock.calls[0][0].payload.previous).toBe('abc');
    expect(onFire.mock.calls[0][0].payload.current).toBe('def');
  });
});

describe('SystemTrigger tick (branch-change mode)', () => {
  it('fires when the branch name changes', async () => {
    const runner = makeRunner([{ branch: 'main' }, { branch: 'feature/x' }]);
    const t = new SystemTrigger(
      makeConfig({
        spec: { event: 'git', on: 'branch-change', pollMs: 1000 },
      }),
      fakeDeps,
      runner,
    );
    const onFire = vi.fn();
    t.validate();
    t.stop();
    t.start(onFire);
    await flush();
    await t.tick();
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire.mock.calls[0][0].payload).toMatchObject({
      event: 'branch-change',
      previous: 'main',
      current: 'feature/x',
    });
  });
});

async function flush(): Promise<void> {
  // Allow microtasks from the kick-off tick() inside start() to complete.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}
