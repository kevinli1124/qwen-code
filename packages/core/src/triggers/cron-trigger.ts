/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseCron } from '../utils/cronParser.js';
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

export interface CronTriggerSpec {
  /** Standard 5-field cron expression in local time. */
  cron: string;
  /** Defaults to true (fire on every match). */
  recurring?: boolean;
}

/**
 * Cron-based trigger. Acts as an adapter over the existing CronScheduler:
 * creates a CronJob whose `prompt` field encodes the trigger id (so the
 * host's scheduler.onFire dispatcher can route it back to TriggerManager
 * instead of the legacy cronQueue path).
 */
export class CronTrigger extends BaseTrigger {
  readonly kind: TriggerKind = 'cron';
  private jobId: string | null = null;

  constructor(cfg: TriggerConfig, deps: TriggerDeps) {
    super(cfg, deps);
  }

  override validate(): void {
    const spec = this.cfg.spec as unknown as Partial<CronTriggerSpec>;
    if (!spec || typeof spec.cron !== 'string' || !spec.cron.trim()) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (cron) missing required spec.cron`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    try {
      parseCron(spec.cron);
    } catch (err) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" has invalid cron expression "${spec.cron}": ${err instanceof Error ? err.message : String(err)}`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
  }

  override start(onFire: OnFireCallback): void {
    this.onFire = onFire;
    if (this.jobId) return; // idempotent
    const spec = this.cfg.spec as unknown as CronTriggerSpec;
    const recurring = spec.recurring !== false;
    // Prompt field holds a sentinel so Session dispatcher can detect this
    // as a trigger job. The real prompt comes from cfg.promptTemplate at
    // fire time via TriggerManager.invokeAgent.
    const job = this.deps.cronScheduler.create(
      spec.cron,
      `__trigger__:${this.cfg.id}`,
      recurring,
    );
    this.jobId = job.id;
  }

  override stop(): void {
    if (this.jobId) {
      this.deps.cronScheduler.delete(this.jobId);
      this.jobId = null;
    }
    this.onFire = null;
  }

  /** Scheduler job id this trigger owns, or null if not started. */
  getJobId(): string | null {
    return this.jobId;
  }

  /** Called by TriggerManager when the shared scheduler fires a job we own. */
  async handleSchedulerFire(): Promise<void> {
    const spec = this.cfg.spec as unknown as CronTriggerSpec;
    await this.fireManually({ cronExpr: spec.cron });
  }
}

/**
 * Sentinel prefix used in CronJob.prompt to identify trigger-owned jobs.
 * Kept in sync with CronTrigger.start().
 */
export const TRIGGER_JOB_SENTINEL = '__trigger__:';

/**
 * Extracts the trigger id from a CronJob.prompt, or null if the job was
 * created by the legacy CronCreate tool (plain prompt).
 */
export function extractTriggerIdFromJobPrompt(prompt: string): string | null {
  if (!prompt.startsWith(TRIGGER_JOB_SENTINEL)) return null;
  return prompt.slice(TRIGGER_JOB_SENTINEL.length);
}
