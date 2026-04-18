/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
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

const execFileAsync = promisify(execFile);

export type GitWatchEvent = 'commit' | 'branch-change';

export interface SystemTriggerSpec {
  /** Phase 5 only supports 'git'. 'process' is reserved. */
  event: 'git';
  /** What git state change to watch for. */
  on: GitWatchEvent;
  /** Polling interval. Min 1000, default 5000. */
  pollMs?: number;
  /** Working directory for git commands. Defaults to process.cwd(). */
  cwd?: string;
}

const DEFAULT_POLL_MS = 5000;
const MIN_POLL_MS = 1000;

/**
 * Git-driven system trigger: polls `git rev-parse HEAD` or the current branch
 * name at a fixed interval and fires when the value changes. Process-event
 * monitoring is stubbed for a future phase.
 *
 * The poll loop is tolerant of transient git failures (non-repo, network,
 * etc.) — it logs and keeps polling rather than terminating the trigger.
 */
export class SystemTrigger extends BaseTrigger {
  readonly kind: TriggerKind = 'system';
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastValue: string | null = null;
  private bootstrapped = false;
  private runner: GitRunner;

  constructor(cfg: TriggerConfig, deps: TriggerDeps, runner?: GitRunner) {
    super(cfg, deps);
    this.runner = runner ?? defaultGitRunner;
  }

  override validate(): void {
    const spec = this.cfg.spec as unknown as Partial<SystemTriggerSpec>;
    if (!spec || spec.event !== 'git') {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (system) only supports event="git" in this phase`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    if (spec.on !== 'commit' && spec.on !== 'branch-change') {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (system) requires spec.on = "commit" or "branch-change"`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    if (
      spec.pollMs !== undefined &&
      (typeof spec.pollMs !== 'number' || spec.pollMs < MIN_POLL_MS)
    ) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (system) pollMs must be >= ${MIN_POLL_MS}`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
  }

  override start(onFire: OnFireCallback): void {
    this.onFire = onFire;
    if (this.timer) return;
    const spec = this.cfg.spec as unknown as SystemTriggerSpec;
    const pollMs = spec.pollMs ?? DEFAULT_POLL_MS;
    this.timer = setInterval(() => {
      void this.tick();
    }, pollMs);
    // Kick off once immediately so the first poll doesn't wait pollMs.
    void this.tick();
  }

  override stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastValue = null;
    this.bootstrapped = false;
    this.onFire = null;
  }

  /** Exposed for deterministic testing. Triggers a single poll. */
  async tick(): Promise<void> {
    const spec = this.cfg.spec as unknown as SystemTriggerSpec;
    const cwd = spec.cwd ?? process.cwd();
    let current: string | null;
    try {
      current =
        spec.on === 'commit'
          ? await this.runner.headSha(cwd)
          : await this.runner.currentBranch(cwd);
    } catch {
      // Transient git failure — don't fire, retry next tick.
      return;
    }

    if (!this.bootstrapped) {
      // Establish baseline on first successful read; do not fire.
      this.lastValue = current;
      this.bootstrapped = true;
      return;
    }
    if (current !== this.lastValue) {
      const previous = this.lastValue;
      this.lastValue = current;
      await this.fireManually({
        event: spec.on,
        previous,
        current,
      });
    }
  }
}

/**
 * Git shell runner abstraction — overridable for tests. Default impl uses
 * `execFile` with a 5s timeout per call.
 */
export interface GitRunner {
  headSha(cwd: string): Promise<string | null>;
  currentBranch(cwd: string): Promise<string | null>;
}

const defaultGitRunner: GitRunner = {
  async headSha(cwd: string): Promise<string | null> {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd,
      timeout: 5000,
      windowsHide: true,
    });
    return stdout.trim() || null;
  },
  async currentBranch(cwd: string): Promise<string | null> {
    const { stdout } = await execFileAsync(
      'git',
      ['symbolic-ref', '--short', 'HEAD'],
      { cwd, timeout: 5000, windowsHide: true },
    );
    return stdout.trim() || null;
  },
};
