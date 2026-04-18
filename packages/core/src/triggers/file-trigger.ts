/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { watch as watchFs, type FSWatcher } from 'chokidar';
import {
  BaseTrigger,
  type OnFireCallback,
  type TriggerDeps,
} from './base-trigger.js';
import {
  TriggerError,
  TriggerErrorCode,
  type TriggerConfig,
  type TriggerKind,
} from './types.js';

export type FileEvent = 'add' | 'change' | 'unlink';

export interface FileTriggerSpec {
  /** Glob patterns or absolute paths to watch. Max 20 entries per trigger. */
  paths: string[];
  /** Which chokidar events to forward. Defaults to all three. */
  events?: FileEvent[];
  /** Per-(path,event) debounce in ms. Min 100, default 500. */
  debounceMs?: number;
  /** Chokidar `ignoreInitial` — skip the bootstrap add events. Default true. */
  ignoreInitial?: boolean;
  /** Additional ignore patterns appended to the sane defaults. */
  ignored?: string[];
}

const DEFAULT_EVENTS: readonly FileEvent[] = ['add', 'change', 'unlink'];
const DEFAULT_DEBOUNCE_MS = 500;
const MIN_DEBOUNCE_MS = 100;
const MAX_WATCH_PATHS = 20;
const DEFAULT_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.qwen/**',
];

/**
 * Watches files/directories and fires the bound subagent on change events.
 * Uses chokidar for cross-platform fs event handling; caps paths per trigger
 * and debounces per (path,event) to avoid agent storms.
 */
export class FileTrigger extends BaseTrigger {
  readonly kind: TriggerKind = 'file';
  private watcher: FSWatcher | null = null;
  private debouncedTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  constructor(cfg: TriggerConfig, deps: TriggerDeps) {
    super(cfg, deps);
  }

  override validate(): void {
    const spec = this.cfg.spec as unknown as Partial<FileTriggerSpec>;
    if (!spec || !Array.isArray(spec.paths) || spec.paths.length === 0) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (file) requires spec.paths (non-empty string[])`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    if (spec.paths.length > MAX_WATCH_PATHS) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (file) exceeds max ${MAX_WATCH_PATHS} watch paths (got ${spec.paths.length})`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    for (const p of spec.paths) {
      if (typeof p !== 'string' || !p.trim()) {
        throw new TriggerError(
          `Trigger "${this.cfg.id}" (file) has a non-string path entry`,
          TriggerErrorCode.INVALID_CONFIG,
          this.cfg.id,
        );
      }
    }
    if (spec.events) {
      for (const e of spec.events) {
        if (!DEFAULT_EVENTS.includes(e)) {
          throw new TriggerError(
            `Trigger "${this.cfg.id}" (file) has invalid event "${e}" (allowed: add, change, unlink)`,
            TriggerErrorCode.INVALID_CONFIG,
            this.cfg.id,
          );
        }
      }
    }
    if (
      spec.debounceMs !== undefined &&
      (typeof spec.debounceMs !== 'number' || spec.debounceMs < MIN_DEBOUNCE_MS)
    ) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (file) debounceMs must be >= ${MIN_DEBOUNCE_MS}`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
  }

  override start(onFire: OnFireCallback): void {
    this.onFire = onFire;
    if (this.watcher) return; // idempotent

    const spec = this.cfg.spec as unknown as FileTriggerSpec;
    const events = (spec.events ?? DEFAULT_EVENTS) as FileEvent[];
    const debounceMs = spec.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const ignoreInitial = spec.ignoreInitial !== false;
    const ignored = [...DEFAULT_IGNORED, ...(spec.ignored ?? [])];

    this.watcher = watchFs(spec.paths, {
      ignored,
      ignoreInitial,
      persistent: true,
    });

    for (const ev of events) {
      this.watcher.on(ev, (changedPath: string) => {
        this.scheduleFire(ev, changedPath, debounceMs);
      });
    }

    this.watcher.on('error', (err) => {
      // Don't crash the session on watcher errors.
      // eslint-disable-next-line no-console
      console.warn(
        `[FileTrigger ${this.cfg.id}] watcher error:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  override async stop(): Promise<void> {
    for (const t of this.debouncedTimers.values()) clearTimeout(t);
    this.debouncedTimers.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.onFire = null;
  }

  private scheduleFire(
    event: FileEvent,
    changedPath: string,
    debounceMs: number,
  ): void {
    const key = `${event}::${changedPath}`;
    const existing = this.debouncedTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debouncedTimers.delete(key);
      void this.fireManually({ event, changedPath });
    }, debounceMs);
    this.debouncedTimers.set(key, timer);
  }
}
