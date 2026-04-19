/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { CronScheduler } from '../services/cronScheduler.js';
import type { SubagentManager } from '../subagents/subagent-manager.js';
import type { TriggerConfig, TriggerContext, TriggerKind } from './types.js';

/**
 * Shared dependencies passed to every trigger instance. Kept as a single
 * object so the factory signature stays stable as new kinds are added.
 *
 * `config` and `subagentManager` are optional because some trigger kinds
 * (cron, file, webhook, chat, system) operate purely through the onFire
 * callback and let TriggerManager handle the agent fork. MessageTrigger is
 * the exception — it owns a conversational loop and needs direct access to
 * fork subagents and read conversation state.
 */
export interface TriggerDeps {
  cronScheduler: CronScheduler;
  config?: Config;
  subagentManager?: SubagentManager;
}

export type OnFireCallback = (ctx: TriggerContext) => void | Promise<void>;

/**
 * Abstract base class for all trigger kinds. Each subclass wires the kind's
 * external source (cron tick, chokidar watcher, http server, etc.) to a
 * single `onFire` callback supplied by TriggerManager.
 *
 * Lifecycle:
 *   1. `validate()` — throws if `cfg.spec` is malformed. Called by the
 *      factory before `start()`.
 *   2. `start(onFire)` — binds to the external source. Must be idempotent
 *      (calling twice should not double-register).
 *   3. `stop()` — releases external resources. Must be idempotent.
 *   4. `fireManually(payload)` — convenience for tests and a future
 *      `TriggerRun` tool. Builds a TriggerContext and forwards to the stored
 *      onFire callback.
 */
export abstract class BaseTrigger {
  abstract readonly kind: TriggerKind;
  protected onFire: OnFireCallback | null = null;

  constructor(
    readonly cfg: TriggerConfig,
    protected readonly deps: TriggerDeps,
  ) {}

  abstract start(onFire: OnFireCallback): void | Promise<void>;
  abstract stop(): void | Promise<void>;

  /** Override in subclasses to reject bad `spec` shapes early. Default: no-op. */
  validate(): void {}

  /**
   * Builds a TriggerContext and invokes the stored onFire. Used by tests,
   * manual invocation tools, and by subclasses that want a common entry.
   */
  async fireManually(payload: Record<string, unknown> = {}): Promise<void> {
    if (!this.onFire) return;
    const ctx: TriggerContext = {
      triggerId: this.cfg.id,
      kind: this.kind,
      firedAt: Date.now(),
      payload,
    };
    await this.onFire(ctx);
  }
}
