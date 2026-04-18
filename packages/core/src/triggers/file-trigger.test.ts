/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { TriggerConfig } from './types.js';
import { TriggerError } from './types.js';

// Mock chokidar so we can drive events synchronously and never touch the fs.
const fakeWatchers: FakeWatcher[] = [];

class FakeWatcher extends EventEmitter {
  closeCalled = 0;
  constructor(
    readonly paths: string | string[],
    readonly options: Record<string, unknown>,
  ) {
    super();
  }
  async close(): Promise<void> {
    this.closeCalled++;
  }
}

vi.mock('chokidar', () => ({
  watch: (paths: string | string[], options: Record<string, unknown>) => {
    const w = new FakeWatcher(paths, options);
    fakeWatchers.push(w);
    return w;
  },
}));

// Import after mock registration.
import { FileTrigger } from './file-trigger.js';

function makeConfig(overrides: Partial<TriggerConfig> = {}): TriggerConfig {
  return {
    id: 'watch-src',
    name: 'Watch src',
    kind: 'file',
    enabled: true,
    agentRef: 'reviewer',
    spec: { paths: ['src/**/*.ts'] },
    ...overrides,
  };
}

describe('FileTrigger', () => {
  beforeEach(() => {
    fakeWatchers.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('validate', () => {
    it('rejects missing paths', () => {
      const t = new FileTrigger(makeConfig({ spec: {} }), {
        cronScheduler: {} as never,
      });
      expect(() => t.validate()).toThrow(TriggerError);
    });

    it('rejects empty paths array', () => {
      const t = new FileTrigger(makeConfig({ spec: { paths: [] } }), {
        cronScheduler: {} as never,
      });
      expect(() => t.validate()).toThrow(TriggerError);
    });

    it('rejects more than 20 paths', () => {
      const paths = Array.from({ length: 21 }, (_, i) => `p${i}`);
      const t = new FileTrigger(makeConfig({ spec: { paths } }), {
        cronScheduler: {} as never,
      });
      expect(() => t.validate()).toThrow(/max 20/);
    });

    it('rejects non-string path entry', () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['ok', 123 as unknown as string] } }),
        { cronScheduler: {} as never },
      );
      expect(() => t.validate()).toThrow(TriggerError);
    });

    it('rejects invalid event name', () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['a'], events: ['rename'] as never } }),
        { cronScheduler: {} as never },
      );
      expect(() => t.validate()).toThrow(/invalid event/);
    });

    it('rejects debounceMs below minimum', () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['a'], debounceMs: 50 } }),
        { cronScheduler: {} as never },
      );
      expect(() => t.validate()).toThrow(/debounceMs/);
    });

    it('accepts a minimal valid spec', () => {
      const t = new FileTrigger(makeConfig(), { cronScheduler: {} as never });
      expect(() => t.validate()).not.toThrow();
    });
  });

  describe('start', () => {
    it('subscribes to all three events by default and applies default ignored list', () => {
      const t = new FileTrigger(makeConfig(), { cronScheduler: {} as never });
      t.validate();
      t.start(() => {});
      expect(fakeWatchers).toHaveLength(1);
      const w = fakeWatchers[0];
      expect(w.listenerCount('add')).toBe(1);
      expect(w.listenerCount('change')).toBe(1);
      expect(w.listenerCount('unlink')).toBe(1);
      const ignored = w.options['ignored'] as string[];
      expect(ignored).toEqual(
        expect.arrayContaining([
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/.qwen/**',
        ]),
      );
      expect(w.options['ignoreInitial']).toBe(true);
    });

    it('only subscribes to the events listed in spec.events', () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['a'], events: ['change'] } }),
        { cronScheduler: {} as never },
      );
      t.validate();
      t.start(() => {});
      const w = fakeWatchers[0];
      expect(w.listenerCount('add')).toBe(0);
      expect(w.listenerCount('change')).toBe(1);
      expect(w.listenerCount('unlink')).toBe(0);
    });

    it('appends user-supplied ignored entries on top of defaults', () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['a'], ignored: ['**/*.log'] } }),
        { cronScheduler: {} as never },
      );
      t.validate();
      t.start(() => {});
      const ignored = fakeWatchers[0].options['ignored'] as string[];
      expect(ignored).toContain('**/*.log');
      expect(ignored).toContain('**/node_modules/**');
    });

    it('start is idempotent', () => {
      const t = new FileTrigger(makeConfig(), { cronScheduler: {} as never });
      t.validate();
      t.start(() => {});
      t.start(() => {});
      expect(fakeWatchers).toHaveLength(1);
    });
  });

  describe('debounce + fire', () => {
    it('coalesces rapid events for the same (event,path) into one fire', () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['a'], debounceMs: 200 } }),
        { cronScheduler: {} as never },
      );
      const onFire = vi.fn();
      t.validate();
      t.start(onFire);
      const w = fakeWatchers[0];
      w.emit('change', 'a/foo.ts');
      w.emit('change', 'a/foo.ts');
      w.emit('change', 'a/foo.ts');
      vi.advanceTimersByTime(199);
      expect(onFire).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(onFire).toHaveBeenCalledTimes(1);
      expect(onFire.mock.calls[0][0].payload).toEqual({
        event: 'change',
        changedPath: 'a/foo.ts',
      });
    });

    it('does not coalesce across different paths', () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['a'], debounceMs: 200 } }),
        { cronScheduler: {} as never },
      );
      const onFire = vi.fn();
      t.validate();
      t.start(onFire);
      const w = fakeWatchers[0];
      w.emit('change', 'a/foo.ts');
      w.emit('change', 'a/bar.ts');
      vi.advanceTimersByTime(250);
      expect(onFire).toHaveBeenCalledTimes(2);
    });

    it('does not coalesce across event kinds', () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['a'], debounceMs: 200 } }),
        { cronScheduler: {} as never },
      );
      const onFire = vi.fn();
      t.validate();
      t.start(onFire);
      const w = fakeWatchers[0];
      w.emit('add', 'a/foo.ts');
      w.emit('change', 'a/foo.ts');
      vi.advanceTimersByTime(250);
      expect(onFire).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('closes the watcher and clears pending timers', async () => {
      const t = new FileTrigger(
        makeConfig({ spec: { paths: ['a'], debounceMs: 500 } }),
        { cronScheduler: {} as never },
      );
      const onFire = vi.fn();
      t.validate();
      t.start(onFire);
      const w = fakeWatchers[0];
      w.emit('change', 'a/foo.ts');
      await t.stop();
      vi.advanceTimersByTime(1000);
      expect(onFire).not.toHaveBeenCalled();
      expect(w.closeCalled).toBe(1);
    });
  });
});
